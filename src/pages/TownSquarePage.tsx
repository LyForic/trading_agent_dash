import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAgentData } from '@/lib/useAgentData';
import { useVisitDelta } from '@/lib/useVisitDelta';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { AGENT_IDS, AGENT_META } from '@/lib/agentMeta';
import type { AgentId } from '@/lib/types';

/**
 * Town Square — the new entry point at `/`. Full-bleed plaza exterior
 * with house sprites composited as Link tap targets.
 *
 * R3 revision per peer review:
 *   - Full-bleed stage (100vw × 100dvh, object-fit cover). No blurred
 *     backdrop letterbox — that frame felt like a web preview instead
 *     of a world. The trade-off is that narrow portrait phones crop
 *     some of the plaza's outer trees (an acceptable concession while
 *     a dedicated portrait plaza is out of scope).
 *   - Houses are FOOT-anchored (translate -50% -100%), so the (x, y)
 *     coordinate represents where the front door touches the ground
 *     at the path endpoint. This is what makes them sit in the world
 *     instead of floating over it.
 *   - Each house has a CSS ground shadow via ::after — the single
 *     biggest fix for the "sticker" look.
 *   - Z-index sorted by Y: houses lower on screen render on top of
 *     houses higher up. This is Stardew's trick for depth illusion
 *     without needing a perspective system.
 *   - Time-of-day applies to the plaza, not just the interior rooms.
 *     Dusk and moonlit tint the whole stage; houses dim with the same
 *     brightness filter the rooms use; the lamp post glows warm at
 *     dusk and cool at moonlit.
 *   - Coming Soon is now a grayscale clone of Metheus's house with a
 *     "?" overlay, not a dashed CSS box. Reads as "future building"
 *     instead of "broken UI."
 *   - Labels live on a separate absolute layer with z-index above all
 *     houses — fixes Apex's label getting covered by Gale's sprite.
 *   - Avatar placeholder at the lamp post: a small CSS marker with a
 *     bob animation, ready to be replaced by a real pixel sprite when
 *     /avatar/avatar-idle.png lands. Node-based tap-to-walk animation
 *     and walk cycles are deferred to Phase 5.
 */

interface Node {
  x: number; // % of viewport (stage)
  y: number; // % of viewport (stage) — represents the house's FOOT (door on ground)
  width: number; // % of viewport
}

// Foot-anchored positions for each destination. (x, y) is where the
// front door meets the path/grass. translate(-50%, -100%) in CSS puts
// the sprite above this anchor so it visually sits on the ground.
const NODES: Record<AgentId | 'comingSoon', Node> = {
  apex: { x: 16, y: 58, width: 18 },
  metheus: { x: 84, y: 58, width: 18 },
  gale: { x: 22, y: 93, width: 18 },
  comingSoon: { x: 78, y: 93, width: 18 },
};

// Label position for each destination — offset slightly below the
// foot anchor. Kept on a separate absolute layer with z-index above
// all houses so a neighbor sprite can never clip a label.
const LABEL_OFFSET_Y = 3; // % below foot

// Gym facade hit target sits over the painted double doors at the top
// of the plaza. Tuned to the art; nudge if the plaza image changes.
const GYM_LABEL = { x: 50, y: 30 };
const GYM_HIT_RECT = { left: '34%', top: '4%', width: '32%', height: '28%' };

// Avatar spawn near the lamp post (plaza center). Placeholder until
// we have a real pixel avatar sprite in public/avatar/.
const AVATAR_POSITION = { x: 50, y: 55 };

export function TownSquarePage() {
  const autoMode = useTimeOfDay();
  const { data, source } = useAgentData();
  const { delta } = useVisitDelta(data, source);

  const totalPnl = useMemo(
    () => data.agents.reduce((s, a) => s + a.total_pnl, 0),
    [data.agents],
  );
  const mood: 'gain' | 'loss' | 'even' =
    totalPnl > 1 ? 'gain' : totalPnl < -1 ? 'loss' : 'even';

  useEffect(() => {
    // Set time-of-day on body so plaza CSS rules fire. GymPage has its
    // own override logic that will replace this when the user visits
    // an interior route.
    document.body.dataset.mode = autoMode;
  }, [autoMode]);

  useEffect(() => {
    document.body.dataset.plazaMood = mood;
    document.body.dataset.route = 'town-square';
    delete document.body.dataset.room;
    delete document.body.dataset.focus;
    return () => {
      delete document.body.dataset.plazaMood;
      delete document.body.dataset.route;
    };
  }, [mood]);

  const pulsingAgents = useMemo(() => {
    if (!delta) return new Set<AgentId>();
    return new Set(delta.perAgent.map((a) => a.id));
  }, [delta]);

  return (
    <div className="town-square-page">
      <div className="town-square-stage">
        {/* Plaza base — full-bleed pixel-scaled background. */}
        <div className="town-square-bg" aria-hidden />

        {/* Time-of-day tint — same multiply-blend pattern as the
            interior rooms. Transparent at daytime, warm amber at
            dusk, cool navy at moonlit. */}
        <div className="town-square-tint" aria-hidden />

        {/* Lamp post warm glow — invisible at daytime, intense at
            moonlit. Lives over the painted lamp in plaza center. */}
        <div className="town-square-lamp-glow ambient-motion" aria-hidden />

        {/* Avatar placeholder at the plaza center. A real 32×32 idle
            sprite will replace this when /avatar/avatar-idle.png
            lands; the position and z-index are already correct so it's
            a one-line swap to an <img>. */}
        <div
          className="town-square-avatar"
          style={{ left: `${AVATAR_POSITION.x}%`, top: `${AVATAR_POSITION.y}%` }}
          aria-label="You are here"
        />

        {/* Houses — foot-anchored on path endpoints. Z-index derived
            from y-position so houses lower on screen render over
            houses higher up (Stardew depth trick). */}
        {AGENT_IDS.map((id) => {
          const n = NODES[id];
          const pulsing = pulsingAgents.has(id);
          return (
            <Link
              key={id}
              to={`/${id}`}
              aria-label={`Enter ${AGENT_META[id].name}'s room`}
              className="town-square-house"
              style={{
                left: `${n.x}%`,
                top: `${n.y}%`,
                width: `${n.width}%`,
                zIndex: Math.round(n.y),
              }}
            >
              {pulsing && <span className="house-new-pulse" aria-hidden />}
              <img
                src={`/houses/${id}.png`}
                alt=""
                className="house-sprite"
                draggable={false}
              />
            </Link>
          );
        })}

        {/* Coming Soon — grayscale clone of Metheus's house with a
            "?" overlay. Non-interactive; signals future tenant
            without breaking the 16-bit aesthetic. */}
        <div
          className="town-square-house town-square-coming-soon"
          style={{
            left: `${NODES.comingSoon.x}%`,
            top: `${NODES.comingSoon.y}%`,
            width: `${NODES.comingSoon.width}%`,
            zIndex: Math.round(NODES.comingSoon.y),
          }}
          role="img"
          aria-label="Future agent — arriving soon"
        >
          <img
            src="/houses/metheus.png"
            alt=""
            className="house-sprite"
            draggable={false}
          />
          <span className="coming-soon-mark" aria-hidden>
            ?
          </span>
        </div>

        {/* Gym facade hit target — invisible rect over the painted
            double doors at the top. */}
        <Link
          to="/gym"
          aria-label="Enter the communal gym"
          className="town-square-gym-hit"
          style={GYM_HIT_RECT}
        />

        {/* Labels — separate layer, z-index above all houses.
            Positioned below each house's foot anchor. Never clipped
            by a neighbor sprite. */}
        <Link
          to="/gym"
          className="town-square-label town-square-label--destination"
          style={{ left: `${GYM_LABEL.x}%`, top: `${GYM_LABEL.y}%` }}
          aria-hidden
          tabIndex={-1}
        >
          Trading Gym
        </Link>
        {AGENT_IDS.map((id) => {
          const n = NODES[id];
          return (
            <Link
              key={`label-${id}`}
              to={`/${id}`}
              className="town-square-label town-square-label--destination"
              style={{
                left: `${n.x}%`,
                top: `${n.y + LABEL_OFFSET_Y}%`,
              }}
              aria-hidden
              tabIndex={-1}
            >
              {AGENT_META[id].name}
            </Link>
          );
        })}
        <span
          className="town-square-label town-square-label--disabled"
          style={{
            left: `${NODES.comingSoon.x}%`,
            top: `${NODES.comingSoon.y + LABEL_OFFSET_Y}%`,
          }}
        >
          Coming soon
        </span>

        {/* Welcome-back strip — lives inside the stage so it sits on
            the plaza cobblestone instead of in a separate chrome row
            below. */}
        {delta && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="town-square-welcome"
          >
            {delta.totalNewTrades} new trade
            {delta.totalNewTrades === 1 ? '' : 's'} since your last visit
          </motion.div>
        )}
      </div>
    </div>
  );
}
