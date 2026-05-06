import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { WorldLayer } from '@/components/world/WorldLayer';
import { AgentCard } from '@/components/content/AgentCard';
import { TrustStrip } from '@/components/content/TrustStrip';
import { FooterTicker } from '@/components/content/FooterTicker';
import { VisitDeltaStrip } from '@/components/content/VisitDeltaStrip';
import { BattleArena } from '@/components/battle/BattleArena';
import { BottomSheet } from '@/components/battle/BottomSheet';
import { useAgentData } from '@/lib/useAgentData';
import { useAgentWindow } from '@/lib/useAgentWindow';
import { useVisitDelta } from '@/lib/useVisitDelta';
import { AGENT_IDS } from '@/lib/agentMeta';
import type { AgentId, PerformanceWindow } from '@/lib/types';

/**
 * GymPage — the communal interior + agent focus mode, URL-driven.
 *
 *   /gym       → roster of 3 cards (no focus)
 *   /apex      → Apex card focused + Apex room active
 *   /gale      → Gale card focused + Gale room active
 *   /metheus   → Metheus card focused + Metheus room active
 *
 * Navigation primitives:
 *   - Tap a card on /gym → navigate(/<id>) with state.from='/gym'
 *   - Exit from focus → navigate back to state.from, fallback to '/'
 *   - This preserves the user's trajectory: came from plaza → back to
 *     plaza; came from gym → back to gym. Shared links (no state) land
 *     back at the plaza on exit.
 *
 * Single-component-for-all-gym-routes (via `path="/*"` in App) means
 * this page doesn't remount between /gym ↔ /apex ↔ /gale ↔ /metheus —
 * WorldLayer stays alive, so the CSS room-crossfade on body[data-room]
 * works smoothly instead of flashing.
 */

function agentIdFromPath(pathname: string): AgentId | null {
  const seg = pathname.replace(/^\//, '').split('/')[0];
  return (AGENT_IDS as string[]).includes(seg) ? (seg as AgentId) : null;
}

export function GymPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const expandedAgentId = agentIdFromPath(location.pathname);
  const [battleAgentId, setBattleAgentId] = useState<AgentId | null>(null);

  const [apexWindow, setApexWindow] = useAgentWindow('apex');
  const [galeWindow, setGaleWindow] = useAgentWindow('gale');
  const [metheusWindow, setMetheusWindow] = useAgentWindow('metheus');

  const windowsByAgent = useMemo<Record<AgentId, PerformanceWindow>>(
    () => ({ apex: apexWindow, gale: galeWindow, metheus: metheusWindow }),
    [apexWindow, galeWindow, metheusWindow],
  );

  const setWindowForAgent = (id: AgentId): ((w: PerformanceWindow) => void) => {
    if (id === 'apex') return setApexWindow;
    if (id === 'gale') return setGaleWindow;
    return setMetheusWindow;
  };

  const { data, cardViewModels, source, error } = useAgentData(windowsByAgent);
  const { delta, dismiss } = useVisitDelta(data, source);
  const battleAgent = battleAgentId
    ? data.agents.find((agent) => agent.id === battleAgentId && agent.open_position)
    : null;

  useEffect(() => {
    if (expandedAgentId) {
      document.body.dataset.room = expandedAgentId;
      document.body.dataset.focus = expandedAgentId;
    } else {
      delete document.body.dataset.room;
      delete document.body.dataset.focus;
    }
    document.body.dataset.route = expandedAgentId ? `agent-${expandedAgentId}` : 'gym';
    return () => {
      delete document.body.dataset.route;
    };
  }, [expandedAgentId]);

  const exitFocus = () => {
    const from = (location.state as { from?: string } | null)?.from;
    navigate(from ?? '/');
  };

  // Esc exits focus — routed back to whoever linked us in.
  useEffect(() => {
    if (!expandedAgentId || battleAgentId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') exitFocus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandedAgentId]);

  const handleToggle = (id: AgentId) => {
    if (id === expandedAgentId) {
      exitFocus();
    } else {
      navigate(`/${id}`, { state: { from: location.pathname } });
    }
  };

  const backButtonLabel =
    (location.state as { from?: string } | null)?.from === '/gym'
      ? '← Back to gym'
      : '← Back to plaza';

  return (
    <>
      <WorldLayer />
      <div
        className="min-h-screen max-w-[420px] mx-auto relative"
        style={{ color: 'var(--world-ink)' }}
      >
        <div className="gym-chrome">
          <TrustStrip data={data} error={error} />
        </div>

        <main className="px-4 pt-6 pb-10 space-y-4">
          <header
            className="gym-chrome inline-block rounded-2xl px-4 py-3"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--color-paper) 76%, transparent)',
              color: 'var(--color-ink)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          >
            <h1 className="text-3xl" style={{ fontFamily: 'var(--font-display)' }}>
              The Trading Gym
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--color-ink-muted)' }}>
              Three agents. Live markets. Documented in public.
            </p>
          </header>

          <div className="gym-chrome">
            <VisitDeltaStrip delta={delta} onDismiss={dismiss} />
          </div>

          <div className="space-y-3">
            <AnimatePresence mode="sync" initial={false}>
              {data.agents.map((agent) => {
                const focused = expandedAgentId === agent.id;
                const hidden = expandedAgentId !== null && !focused;
                if (hidden) return null;
                return (
                  <motion.div
                    key={agent.id}
                    layout="position"
                    initial={false}
                    exit={{
                      opacity: 0,
                      height: 0,
                      marginTop: 0,
                      marginBottom: 0,
                      transition: { duration: 0.22, ease: 'easeIn' },
                    }}
                    className={focused ? 'agent-card-focus' : undefined}
                  >
                    {focused && (
                      <button
                        type="button"
                        onClick={exitFocus}
                        aria-label="Exit focus mode"
                        className="focus-drag-handle"
                      />
                    )}
                    <AgentCard
                      agent={agent}
                      expanded={focused}
                      onToggle={() => handleToggle(agent.id)}
                      currentWindow={windowsByAgent[agent.id]}
                      setWindow={setWindowForAgent(agent.id)}
                      cardViewModel={cardViewModels[agent.id]}
                      onBattleTap={() => setBattleAgentId(agent.id)}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <div className="gym-chrome">
            <FooterTicker data={data} />
          </div>
        </main>
      </div>

      {/* Focus-mode backdrop — tap to exit. */}
      <AnimatePresence>
        {expandedAgentId && (
          <motion.button
            key="focus-backdrop"
            aria-label="Exit focus mode"
            onClick={exitFocus}
            className="fixed inset-0 focus-mode-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          />
        )}
      </AnimatePresence>

      {/* Back-to-origin affordance — label adapts to where the user
          came from so the destination matches their mental model. */}
      <AnimatePresence>
        {expandedAgentId && (
          <motion.button
            key="focus-back-button"
            onClick={exitFocus}
            className="focus-back-button"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
          >
            {backButtonLabel}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Back-to-plaza on the communal /gym view so users aren't
          trapped on the communal surface if they navigated in directly. */}
      {!expandedAgentId && location.pathname === '/gym' && (
        <button
          onClick={() => navigate('/')}
          className="focus-back-button"
          aria-label="Back to Town Square"
        >
          ← Back to plaza
        </button>
      )}

      <BottomSheet
        open={battleAgent !== null}
        titleId="battle-arena-title"
        onClose={() => setBattleAgentId(null)}
      >
        {battleAgent && <BattleArena agent={battleAgent} titleId="battle-arena-title" />}
      </BottomSheet>
    </>
  );
}
