import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAgentData } from '@/lib/useAgentData';
import { useVisitDelta } from '@/lib/useVisitDelta';
import { AGENT_IDS, AGENT_META } from '@/lib/agentMeta';
import type { AgentId } from '@/lib/types';

/**
 * Town Square — the new entry point at `/`. Plaza exterior + three
 * agent-house sprites composited on top as `<Link>` tap targets, plus a
 * gym-facade hit target painted into the plaza art that routes to
 * `/gym` (the communal roster from Phase 0-3).
 *
 * House positions are expressed as percentages of the plaza rectangle
 * so the composition scales proportionally at any viewport width. The
 * plaza itself is a 200×112 PNG with `image-rendering: pixelated`,
 * scaled to fill the responsive container.
 *
 * Diegetic indicators this page ships with:
 *   - Pulse dots above houses whose agent has new settlements since
 *     the last visit (reuses `useVisitDelta`'s delta.perAgent)
 *   - Fountain glow modulated by aggregate P&L sign (warm for gain,
 *     cool for loss) — lives in CSS via body[data-plaza-mood]
 *
 * What this page does NOT do: render agent cards, trust strip, or the
 * footer ticker. Those live on `/gym`. The plaza is the overworld —
 * a curiosity surface, not a data dashboard.
 */

// Four-corner spatial grammar per R2 feedback: agents at the corners,
// plaza center left open (future avatar spawn / fountain focal point),
// gym painted at top. Percentages are CENTER-anchored via CSS
// translate(-50%, -50%) so a sprite placed at (18%, 50%) has its middle
// at (18%, 50%) of the plaza and never overruns the stage edges.
//
//   Apex  NW (18%, 50%)       ·       Metheus  NE (82%, 50%)
//   Gale  SW (18%, 80%)       ·       Coming-Soon  SE (82%, 80%)
//
// The NE/SW/SE positions are symmetric around the plaza center, and
// the NW/NE pair stays below the painted gym facade at the top.
const HOUSE_POSITIONS: Record<AgentId, { left: string; top: string }> = {
  apex: { left: '18%', top: '50%' },
  gale: { left: '18%', top: '80%' },
  metheus: { left: '82%', top: '50%' },
};

// Future-tenant lot anchored in the SE corner, symmetric to Gale. Signals
// "this world can grow" without needing a new art asset — CSS dashed plot
// + "?" sign. Swap to a real house sprite whenever the fourth agent
// launches.
const COMING_SOON_POSITION = { left: '82%', top: '80%' };

// The gym facade in the plaza art sits at the top spanning ~center.
// Hit target matches roughly where the double doors are painted; the
// label pill sits at the bottom of the hit rect, just under the painted
// doorway, so users can see the tap target is clickable.
const GYM_FACADE_RECT = {
  left: '32%',
  top: '4%',
  width: '36%',
  height: '30%',
};

export function TownSquarePage() {
  const { data, source } = useAgentData();
  const { delta } = useVisitDelta(data, source);

  // Plaza mood = sign of aggregate P&L across agents. CSS uses
  // body[data-plaza-mood] to dial the fountain glow warm vs cool.
  const totalPnl = useMemo(
    () => data.agents.reduce((s, a) => s + a.total_pnl, 0),
    [data.agents],
  );
  const mood: 'gain' | 'loss' | 'even' =
    totalPnl > 1 ? 'gain' : totalPnl < -1 ? 'loss' : 'even';

  useEffect(() => {
    document.body.dataset.plazaMood = mood;
    document.body.dataset.route = 'town-square';
    // Plaza has its own world — make sure any lingering room/focus
    // attributes from a prior navigation don't keep the old room art
    // peeking through.
    delete document.body.dataset.room;
    delete document.body.dataset.focus;
    return () => {
      delete document.body.dataset.plazaMood;
      delete document.body.dataset.route;
    };
  }, [mood]);

  // Which agents have new settlements since this user's last visit.
  const pulsingAgents = useMemo(() => {
    if (!delta) return new Set<AgentId>();
    const s = new Set<AgentId>();
    for (const a of delta.perAgent) s.add(a.id);
    return s;
  }, [delta]);

  return (
    <div className="town-square-page">
      {/* Blurred plaza copy fills whatever space the contained stage
          doesn't — so the letterbox reads as atmospheric depth instead
          of empty chrome. Same image, downscaled and blurred. */}
      <div className="town-square-backdrop" aria-hidden />

      <div className="town-square-stage">
        {/* Plaza base — pixel-scaled background image */}
        <div className="town-square-bg" aria-hidden />

        {/* Fountain glow — sits on top of the painted fountain in the
            plaza art, tinted by plaza mood. CSS handles the positioning
            and the warm/cool/neutral color via body[data-plaza-mood]. */}
        <div className="town-square-fountain-glow ambient-motion" aria-hidden />

        {/* Three house sprites as Link tap targets, one per agent. */}
        {AGENT_IDS.map((id) => {
          const pos = HOUSE_POSITIONS[id];
          const meta = AGENT_META[id];
          const pulsing = pulsingAgents.has(id);
          return (
            <Link
              key={id}
              to={`/${id}`}
              aria-label={`Enter ${meta.name}'s room`}
              className="town-square-house"
              style={{ left: pos.left, top: pos.top }}
            >
              {pulsing && <span className="house-new-pulse" aria-hidden />}
              <img
                src={`/houses/${id}.png`}
                alt=""
                className="house-sprite"
                draggable={false}
              />
              <span className="house-label">{meta.name}</span>
            </Link>
          );
        })}

        {/* Coming-Soon future-tenant lot — CSS-only placeholder (dashed
            plot + "?" sign). Non-interactive; communicates growth. */}
        <div
          className="town-square-coming-soon"
          style={{ left: COMING_SOON_POSITION.left, top: COMING_SOON_POSITION.top }}
          role="img"
          aria-label="Future agent — arriving soon"
        >
          <div className="coming-soon-plot" aria-hidden>
            ?
          </div>
          <span className="house-label coming-soon-label">Coming soon</span>
        </div>

        {/* Gym facade hit target — routes to /gym. Now shows a visible
            "Trading Gym" label pill at the bottom of the hit rect so
            first-time users recognize the painted doors as tappable. */}
        <Link
          to="/gym"
          aria-label="Enter the communal gym"
          className="town-square-gym-hit"
          style={GYM_FACADE_RECT}
        >
          <span className="town-square-gym-label">Trading Gym</span>
        </Link>
      </div>

      {/* Small welcome-back strip floating below the plaza when the
          visitor has new activity since last session. Matches the
          diegetic feel — sits on the cobblestone, not in chrome. */}
      {delta && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="town-square-welcome"
          style={{ color: 'var(--world-ink)' }}
        >
          {delta.totalNewTrades} new trade{delta.totalNewTrades === 1 ? '' : 's'} since your last visit
        </motion.div>
      )}
    </div>
  );
}
