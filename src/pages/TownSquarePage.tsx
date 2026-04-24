import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAgentData } from '@/lib/useAgentData';
import { useVisitDelta } from '@/lib/useVisitDelta';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { WelcomeModal } from '@/components/town/WelcomeModal';
import type { AgentId } from '@/lib/types';

/**
 * Town Square R4 — world-canvas architecture.
 *
 * The page renders a **fixed 960×540 world** inside a viewport that
 * scales the world uniformly via `transform: scale()`. Background,
 * houses, labels, avatar, shadows, time-of-day tint — everything lives
 * in that single world div and scales together. This replaces R3's
 * split model (background was `object-fit: cover` while overlays were
 * viewport-percentage), which was responsible for the mobile
 * truncation.
 *
 * Scale = max(viewportW / WORLD_W, viewportH / WORLD_H) — cover-style.
 * If the scaled world is wider than the viewport (true on portrait
 * phones), the outer viewport uses `overflow-x: auto` so users can
 * swipe horizontally to explore. Initial scroll centers on the lamp
 * post. When the avatar walks somewhere, we `scrollTo` the viewport
 * so the camera follows the player.
 *
 * Tap-to-walk: clicking a destination sets avatarPos to that node's
 * foot anchor; CSS transitions the avatar's position over 800ms; the
 * direction sprite (N/S/E/W) is picked from the walk vector; after
 * arrival the route changes. Simple, no pathfinding, no walk-cycle
 * frames yet (Brandon dropped 4 idle rotations only) — the direction
 * swap alone sells the motion.
 *
 * First-visit welcome modal gated on localStorage.plazaOnboarded.
 */

// Fixed logical world size. Every coordinate below is in world pixels.
const WORLD_W = 960;
const WORLD_H = 540;

// Anchor points on the plaza art (door positions where paths end).
// These scale uniformly with the world — never breakpoint-tuned.
const LAMP_POST = { x: 480, y: 290 };
const AVATAR_SPAWN = { x: 480, y: 380 };

interface Destination {
  id: 'gym' | AgentId | 'comingSoon';
  // Foot anchor: where the door meets the ground. Sprite (if any)
  // sits above this point via translate(-50%, -100%) in CSS.
  x: number;
  y: number;
  // Rendered sprite width in world pixels (for houses). Gym is
  // painted into the base plaza PNG, so no sprite.
  spriteWidth?: number;
  spriteSrc?: string;
  label: string;
  route?: string;
  disabled?: boolean;
}

const DESTINATIONS: Destination[] = [
  {
    id: 'gym',
    x: 480,
    y: 210,
    label: 'Trading Gym',
    route: '/gym',
  },
  {
    id: 'apex',
    x: 175,
    y: 340,
    spriteWidth: 180,
    spriteSrc: '/houses/apex.png',
    label: 'Apex',
    route: '/apex',
  },
  {
    id: 'metheus',
    x: 785,
    y: 340,
    spriteWidth: 180,
    spriteSrc: '/houses/metheus.png',
    label: 'Metheus',
    route: '/metheus',
  },
  {
    id: 'gale',
    x: 220,
    y: 490,
    spriteWidth: 150,
    spriteSrc: '/houses/gale.png',
    label: 'Gale',
    route: '/gale',
  },
  {
    id: 'comingSoon',
    x: 740,
    y: 490,
    spriteWidth: 155,
    spriteSrc: '/houses/coming-soon-house.png',
    label: 'Coming soon',
    disabled: true,
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

export function TownSquarePage() {
  const navigate = useNavigate();
  const autoMode = useTimeOfDay();
  const { data, source } = useAgentData();
  const { delta } = useVisitDelta(data, source);

  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ w: 800, h: 600 });

  // Avatar state. Position lives in world coords; CSS transitions
  // handle the visual walk. Facing flips between the four idle
  // sprites Brandon dropped (north/south/east/west).
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

  const dismissWelcome = useCallback(() => {
    try {
      localStorage.setItem('plazaOnboarded', 'true');
    } catch {
      // storage disabled; modal just won't remember. fine.
    }
    setShowWelcome(false);
  }, []);

  // Track viewport size via ResizeObserver. Recompute world scale +
  // follows through to the scroll centering below.
  useEffect(() => {
    if (!viewportRef.current) return;
    const el = viewportRef.current;
    const observer = new ResizeObserver(([entry]) => {
      setViewport({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Cover-style scale: at least one axis fills the viewport, the other
  // overflows and becomes scrollable.
  const scale = useMemo(() => {
    if (viewport.w <= 0 || viewport.h <= 0) return 1;
    return Math.max(viewport.w / WORLD_W, viewport.h / WORLD_H);
  }, [viewport]);

  const worldDisplay = useMemo(
    () => ({ w: WORLD_W * scale, h: WORLD_H * scale }),
    [scale],
  );

  // Horizontal scroll defaults to centering the lamp post — puts the
  // user at the plaza center, gym above, houses in the four corners
  // reachable via pan.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const targetScroll = LAMP_POST.x * scale - viewport.w / 2;
    el.scrollLeft = Math.max(
      0,
      Math.min(worldDisplay.w - viewport.w, targetScroll),
    );
  }, [scale, viewport.w, worldDisplay.w]);

  // Body attributes so the CSS can key off mode / route, matching the
  // pattern the interior rooms already use.
  useEffect(() => {
    document.body.dataset.mode = autoMode;
  }, [autoMode]);
  useEffect(() => {
    document.body.dataset.route = 'town-square';
    delete document.body.dataset.room;
    delete document.body.dataset.focus;
    return () => {
      delete document.body.dataset.route;
    };
  }, []);

  // Who has a pulse dot today?
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

      // Camera pan follows the avatar.
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
        window.setTimeout(() => setIsWalking(false), WALK_DURATION_MS + PAUSE_AT_DOOR_MS);
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
            {/* Base plaza image, rendered at world-pixel size. */}
            <div className="town-world-bg" />

            {/* Time-of-day multiply tint, same pattern as interior
                rooms. Lives inside the world so it tints every
                sprite uniformly. */}
            <div className="town-world-tint" aria-hidden />

            {/* Lamp post warm glow — invisible at daytime, bright at
                moonlit. Centered on the painted lamp post. */}
            <div
              className="town-world-lamp-glow ambient-motion"
              aria-hidden
              style={{ left: LAMP_POST.x, top: LAMP_POST.y }}
            />

            {/* Houses + invisible gym hit target */}
            {DESTINATIONS.map((dest) => {
              if (dest.id === 'gym') {
                return (
                  <button
                    key={dest.id}
                    type="button"
                    className="town-gym-hit"
                    onClick={() => walkTo(dest)}
                    aria-label={dest.label}
                    style={{
                      left: dest.x - 180,
                      top: 50,
                      width: 360,
                      height: 200,
                    }}
                  />
                );
              }
              const isPulsing = dest.id !== 'comingSoon' && pulsing.has(dest.id as AgentId);
              const zIndex = Math.round(dest.y);
              return (
                <button
                  key={dest.id}
                  type="button"
                  className={`town-house${dest.disabled ? ' town-house--disabled' : ''}`}
                  onClick={() => walkTo(dest)}
                  disabled={dest.disabled}
                  aria-label={
                    dest.disabled ? 'Future agent — arriving soon' : `Enter ${dest.label}'s room`
                  }
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

            {/* Wooden sign labels on their own z-layer so a
                neighbor sprite can never clip a label. */}
            {DESTINATIONS.map((dest) => (
              <span
                key={`sign-${dest.id}`}
                className={`town-sign${dest.disabled ? ' town-sign--disabled' : ''}`}
                style={{
                  left: dest.x,
                  top: dest.y + (dest.id === 'gym' ? 24 : 30),
                }}
              >
                {dest.label}
              </span>
            ))}

            {/* Welcome-back notice — a small bulletin tacked in the
                top-right corner of the world, clear of the gym facade
                and the lamp glow. Only renders when there's a delta
                since the user's last visit. */}
            {delta && (
              <motion.div
                key="welcome-back"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.25 }}
                className="town-bulletin"
                style={{ left: 820, top: 80 }}
              >
                {delta.totalNewTrades} new trade
                {delta.totalNewTrades === 1 ? '' : 's'} since last visit
              </motion.div>
            )}

            {/* Avatar — the static idle sprite swaps between N/S/E/W
                rotations based on walk direction. CSS transitions its
                position over WALK_DURATION_MS. */}
            <img
              src={`/sprites/player/rotations/${avatarFacing}.png`}
              alt="Your avatar"
              className={`town-avatar${isWalking ? ' town-avatar--walking' : ''}`}
              draggable={false}
              style={{ left: avatarPos.x, top: avatarPos.y }}
            />
          </div>
        </div>
      </div>

      <WelcomeModal show={showWelcome} onDismiss={dismissWelcome} />
    </>
  );
}
