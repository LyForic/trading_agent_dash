import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAgentData } from '@/lib/useAgentData';
import { useVisitDelta } from '@/lib/useVisitDelta';
import { WelcomeModal } from '@/components/town/WelcomeModal';
import type { AgentId } from '@/lib/types';

/**
 * Town Square R5 — HUD/world split + drop-in avatar + ambient wind.
 *
 * Architecture change from R4: signs (labels) and the welcome-back
 * bulletin move OUT of the scaled/scrolled world and into a screen-
 * space HUD layer. The world still scales uniformly, but the HUD
 * overlays it and reads a tracked scrollLeft + scale to compute each
 * label's live position in viewport coords. That fixes every label-
 * clipping bug the peer reviews kept flagging — Apex "Ape", Gale
 * running past the bottom safe area — without needing a portrait-
 * specific plaza PNG.
 *
 * Other R5 wins:
 *   - Avatar bumped 48 → 72 world-pixels and drops in from above
 *     after the welcome modal dismisses (or on mount for returning
 *     users). Idle bob resumes after the landing squash.
 *   - Gym facade hover no longer paints a white rectangle — the hit
 *     target is fully transparent; cursor pointer + label hover is
 *     the affordance.
 *   - Trading Gym sign moved higher so it sits above the lamp post
 *     instead of clipping it.
 *   - Ambient leaf particles drift across the plaza (daytime + dusk
 *     only; moonlit is still). Lantern already flickers from R4.
 *
 * Not in R5 (by design, deferred):
 *   - Virtual joystick. Peer review split: Brandon wants it, Gemini
 *     flagged it as a V1 trap (60fps loop + collision math + native
 *     swipe conflict). Current tap-to-walk + native horizontal swipe
 *     is simple and works; revisit in Phase 5 with a "nipple" control
 *     whose drag only moves the avatar, not arbitrary coords.
 *   - Agent-card 24h/7d/lifetime P&L filter. Tracked for next round.
 */

const WORLD_W = 960;
const WORLD_H = 540;

// Layer band z-index model. Bands are spaced by >WORLD_HEIGHT (540) so
// Math.round(y) depth sort within a band can never leak above the next
// band. Example: grounding pad at y=477 → 1000+477 = 1477; scene house
// at y=350 → 2000+350 = 2350. Pad always under scene regardless of y.
const Z = {
  plaza: 0,
  groundingPad: 1000,
  scene: 2000,
  effects: 5000,
} as const;

// Plaza anchor points. Tuned against town-square.png where the four
// diagonal paths terminate; nudged per R4 feedback so houses sit on
// the dirt pads instead of on grass.
const LAMP_POST = { x: 480, y: 290 };
const AVATAR_SPAWN = { x: 480, y: 375 };
const AVATAR_SIZE = 72;
const AVATAR_DROP_DURATION_MS = 520;

interface Destination {
  id: 'gym' | AgentId | 'comingSoon';
  x: number;
  y: number;
  spriteWidth?: number;
  spriteSrc?: string;

  /** Full display / aria name. */
  label: string;
  /** Full accessibility label (more descriptive than visible label). */
  ariaLabel?: string;

  route?: string;
  disabled?: boolean;

  /** Shared grounding pad under the house base. */
  groundingPad?: {
    x: number;
    y: number;
    width: number;
    anchorX?: number;
    anchorY?: number;
  };

  /** Diegetic prop breaking the house base seam. */
  prop?: {
    src: string;
    x: number;
    y: number;
    width: number;
    anchorX?: number;
    anchorY?: number;
    zOffset?: number;
  };
}

const DESTINATIONS: Destination[] = [
  {
    id: 'gym',
    x: 480,
    y: 210,
    label: 'Trading Gym',
    ariaLabel: 'Enter the Trading Gym communal roster',
    route: '/gym',
  },
  {
    id: 'apex',
    x: 180,
    y: 350,
    spriteWidth: 180,
    spriteSrc: '/houses/apex.png',
    label: 'Apex',
    ariaLabel: "Enter Apex's dojo",
    route: '/apex',
    groundingPad: { x: 180, y: 352, width: 160 },
    prop: { src: '/props/apex-stones.png', x: 210, y: 358, width: 56 },
  },
  {
    id: 'metheus',
    x: 780,
    y: 350,
    spriteWidth: 180,
    spriteSrc: '/houses/metheus.png',
    label: 'Metheus',
    ariaLabel: "Enter Metheus's study",
    route: '/metheus',
    groundingPad: { x: 780, y: 352, width: 160 },
    prop: { src: '/props/metheus-mailbox.png', x: 755, y: 358, width: 48 },
  },
  {
    id: 'gale',
    x: 225,
    y: 475,
    spriteWidth: 155,
    spriteSrc: '/houses/gale.png',
    label: 'Gale',
    ariaLabel: "Enter Gale's loft",
    route: '/gale',
    groundingPad: { x: 225, y: 477, width: 140 },
    prop: { src: '/props/gale-fence.png', x: 260, y: 482, width: 56 },
  },
  {
    id: 'comingSoon',
    x: 735,
    y: 475,
    spriteWidth: 160,
    spriteSrc: '/houses/coming-soon-house.png',
    label: 'Coming soon',
    ariaLabel: 'Future agent home coming soon',
    disabled: true,
    groundingPad: { x: 735, y: 477, width: 140 },
    prop: { src: '/props/coming-soon-debris.png', x: 710, y: 482, width: 48 },
  },
];

type Facing = 'north' | 'south' | 'east' | 'west';

function directionOf(from: { x: number; y: number }, to: { x: number; y: number }): Facing {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'east' : 'west';
  return dy > 0 ? 'south' : 'north';
}

const WALK_DURATION_MS = 800;
const PAUSE_AT_DOOR_MS = 220;

// Ambient leaf particles (daytime + dusk). Position + timing seeded so
// each mount renders a deterministic drift, no React jitter.
const LEAVES = Array.from({ length: 8 }, (_, i) => ({
  key: `leaf-${i}`,
  topPct: 8 + ((i * 13) % 72),
  delayS: (i * 1.7) % 14,
  durationS: 14 + ((i * 1.3) % 8),
  variant: i % 3,
}));

export function TownSquarePage() {
  const navigate = useNavigate();
  const { data, source } = useAgentData({ apex: '24h', gale: '24h', metheus: '24h' });
  const { delta } = useVisitDelta(data, source);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 800, h: 600 });

  const [avatarPos, setAvatarPos] = useState(AVATAR_SPAWN);
  const [avatarFacing, setAvatarFacing] = useState<Facing>('south');
  const [isWalking, setIsWalking] = useState(false);

  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem('plazaOnboarded') !== 'true';
    } catch {
      return true;
    }
  });

  const [showPanHint, setShowPanHint] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    // Desktop: no hint.
    if (window.matchMedia('(min-width: 768px)').matches) return false;
    try {
      return localStorage.getItem('panHintShown') !== 'true';
    } catch {
      return false;
    }
  });

  // Drop-in animation state. Avatar is hidden until welcome is
  // dismissed, then the CSS drop-in animation plays once.
  const [avatarState, setAvatarState] = useState<'hidden' | 'dropping' | 'idle'>(
    () => (showWelcome ? 'hidden' : 'dropping'),
  );
  useEffect(() => {
    if (showWelcome) return;
    if (avatarState === 'hidden') setAvatarState('dropping');
  }, [showWelcome, avatarState]);
  useEffect(() => {
    if (avatarState !== 'dropping') return;
    const t = window.setTimeout(() => setAvatarState('idle'), AVATAR_DROP_DURATION_MS);
    return () => window.clearTimeout(t);
  }, [avatarState]);

  useEffect(() => {
    if (showWelcome || !showPanHint) return;
    const t = window.setTimeout(() => {
      setShowPanHint(false);
      // Only mark permanently shown if the user was actually visible-to-page
      // when the timer fired. If they were tab-switched away, let them see it
      // next visit. Graceful: document may not exist in SSR.
      const isVisible =
        typeof document !== 'undefined' && document.visibilityState === 'visible';
      if (isVisible) {
        try {
          localStorage.setItem('panHintShown', 'true');
        } catch {
          // ignore storage failures
        }
      }
    }, 4000);
    return () => window.clearTimeout(t);
  }, [showWelcome, showPanHint]);

  const dismissWelcome = useCallback(() => {
    try {
      localStorage.setItem('plazaOnboarded', 'true');
    } catch {
      // ignore
    }
    setShowWelcome(false);
  }, []);

  // Viewport size tracking.
  useEffect(() => {
    if (!viewportRef.current) return;
    const el = viewportRef.current;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);


  const scale = useMemo(() => {
    if (viewport.w <= 0 || viewport.h <= 0) return 1;
    return Math.max(viewport.w / WORLD_W, viewport.h / WORLD_H);
  }, [viewport]);

  const worldDisplay = useMemo(
    () => ({ w: WORLD_W * scale, h: WORLD_H * scale }),
    [scale],
  );

  // Center lamp post on initial load + resize.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const targetScroll = LAMP_POST.x * scale - viewport.w / 2;
    const clamped = Math.max(
      0,
      Math.min(worldDisplay.w - viewport.w, targetScroll),
    );
    el.scrollLeft = clamped;
  }, [scale, viewport.w, worldDisplay.w]);

  useEffect(() => {
    document.body.dataset.route = 'town-square';
    delete document.body.dataset.room;
    delete document.body.dataset.focus;
    return () => {
      delete document.body.dataset.route;
    };
  }, []);

  const pulsing = useMemo(() => {
    if (!delta) return new Set<AgentId>();
    return new Set(delta.perAgent.map((a) => a.id));
  }, [delta]);

  const walkTo = useCallback(
    (dest: Destination) => {
      if (isWalking || dest.disabled) return;
      setIsWalking(true);
      setAvatarFacing(directionOf(avatarPos, dest));
      setAvatarPos({ x: dest.x, y: dest.y });

      const el = viewportRef.current;
      if (el) {
        const targetScroll = dest.x * scale - viewport.w / 2;
        el.scrollTo({
          left: Math.max(
            0,
            Math.min(worldDisplay.w - viewport.w, targetScroll),
          ),
          behavior: 'smooth',
        });
      }

      if (dest.route) {
        const route = dest.route;
        window.setTimeout(() => {
          navigate(route, { state: { from: '/' } });
        }, WALK_DURATION_MS + PAUSE_AT_DOOR_MS);
      } else {
        window.setTimeout(
          () => setIsWalking(false),
          WALK_DURATION_MS + PAUSE_AT_DOOR_MS,
        );
      }
    },
    [avatarPos, isWalking, navigate, scale, viewport.w, worldDisplay.w],
  );

  return (
    <>
      <div ref={viewportRef} className="town-viewport">
        <div
          className="town-canvas"
          style={{ width: worldDisplay.w, height: worldDisplay.h }}
        >
          <div
            className="town-world"
            style={{
              width: WORLD_W,
              height: WORLD_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <div className="town-world-bg" />
            <div className="town-world-tint" aria-hidden />
            <div
              className="town-world-lamp-glow ambient-motion"
              aria-hidden
              style={{ left: LAMP_POST.x, top: LAMP_POST.y }}
            />

            {DESTINATIONS.map((dest) => {
              if (dest.id === 'gym') {
                return (
                  <button
                    key={dest.id}
                    type="button"
                    className="town-gym-hit"
                    onClick={() => walkTo(dest)}
                    aria-label={dest.label}
                    data-agent-name={dest.label}
                    style={{
                      left: dest.x - 180,
                      top: 50,
                      width: 360,
                      height: 200,
                    }}
                  />
                );
              }
              const isPulsing =
                dest.id !== 'comingSoon' && pulsing.has(dest.id as AgentId);
              const zIndex = Z.scene + Math.round(dest.y);
              return (
                <button
                  key={dest.id}
                  type="button"
                  className={`town-house${dest.disabled ? ' town-house--disabled' : ''}`}
                  onClick={() => walkTo(dest)}
                  disabled={dest.disabled}
                  aria-label={
                    dest.disabled
                      ? 'Future agent — arriving soon'
                      : `Enter ${dest.label}'s room`
                  }
                  data-agent-name={dest.label}
                  style={{
                    left: dest.x,
                    top: dest.y,
                    width: dest.spriteWidth,
                    zIndex,
                  }}
                >
                  {isPulsing && <span className="town-house-pulse" aria-hidden />}
                  <img
                    src={dest.spriteSrc}
                    alt=""
                    className="town-house-sprite"
                    draggable={false}
                  />
                </button>
              );
            })}

            {/* Grounding pad layer — under each house, above plaza. Renders before
                the house sprite in DOM order AND has a lower z-index band. */}
            {DESTINATIONS.filter((d) => d.groundingPad).map((dest) => {
              const pad = dest.groundingPad!;
              return (
                <img
                  key={`pad-${dest.id}`}
                  src="/props/grounding-pad.png"
                  alt=""
                  className="town-grounding-pad"
                  draggable={false}
                  style={{
                    left: pad.x,
                    top: pad.y,
                    width: pad.width,
                    transform: `translate(-${pad.anchorX ?? 50}%, -${pad.anchorY ?? 100}%)`,
                    zIndex: Z.groundingPad + Math.round(pad.y),
                  }}
                />
              );
            })}

            {/* Diegetic prop layer — stones / mailbox / fence / debris. Overlaps
                the seam where the house base meets the plaza. Shares the scene
                layer band with houses + avatar for proper depth sort. */}
            {DESTINATIONS.filter((d) => d.prop).map((dest) => {
              const p = dest.prop!;
              return (
                <img
                  key={`prop-${dest.id}`}
                  src={p.src}
                  alt=""
                  className="town-house-prop"
                  draggable={false}
                  style={{
                    left: p.x,
                    top: p.y,
                    width: p.width,
                    transform: `translate(-${p.anchorX ?? 50}%, -${p.anchorY ?? 100}%)`,
                    zIndex: Z.scene + Math.round(p.y) + (p.zOffset ?? 0),
                  }}
                />
              );
            })}

            {/* Avatar stays inside the world so it scales with
                everything else; sprite size is 72 world-pixels, not
                the 48 R4 shipped. */}
            <img
              src={`/sprites/player/rotations/${avatarFacing}.png`}
              alt="Your avatar"
              className={`town-avatar town-avatar--${avatarState}${
                isWalking ? ' town-avatar--walking' : ''
              }`}
              draggable={false}
              style={{
                left: avatarPos.x,
                top: avatarPos.y,
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                zIndex: Z.scene + Math.round(avatarPos.y),
              }}
            />
          </div>
        </div>
      </div>

      {/* Screen-space HUD. Sibling of the scroll viewport, not a child,
          so it doesn't scroll or scale with the world. Labels, the
          welcome-back bulletin, and the ambient leaf particles live
          here. */}
      <div className="town-hud" aria-hidden="false">
        {delta && (
          <motion.div
            key="welcome-back"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
            className="town-bulletin-hud"
          >
            {delta.totalNewTrades} new trade
            {delta.totalNewTrades === 1 ? '' : 's'} since last visit
          </motion.div>
        )}

        {/* Ambient wind leaves. Hidden under moonlit via CSS
            (body[data-mode="moonlit"] .town-leaf { display: none })
            so the suppression follows user-effective mode (preference >
            auto), not raw auto. */}
        {LEAVES.map((leaf) => (
          <span
            key={leaf.key}
            aria-hidden
            className={`town-leaf town-leaf--${leaf.variant} ambient-motion`}
            style={{
              top: `${leaf.topPct}%`,
              animationDelay: `${leaf.delayS}s`,
              animationDuration: `${leaf.durationS}s`,
            }}
          />
        ))}

        <AnimatePresence>
          {showPanHint && !showWelcome && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.35 }}
              className="town-pan-hint"
              aria-hidden="true"
            >
              ← Drag to explore →
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <WelcomeModal show={showWelcome} onDismiss={dismissWelcome} />
    </>
  );
}
