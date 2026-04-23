import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { WorldLayer } from '@/components/world/WorldLayer';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { AgentCard } from '@/components/content/AgentCard';
import { TrustStrip } from '@/components/content/TrustStrip';
import { FooterTicker } from '@/components/content/FooterTicker';
import { VisitDeltaStrip } from '@/components/content/VisitDeltaStrip';
import { useAgentData } from '@/lib/useAgentData';
import { useVisitDelta } from '@/lib/useVisitDelta';
import type { AgentId } from '@/lib/types';
import type { WorldMode } from '@/lib/timeOfDay';

export default function App() {
  const autoMode = useTimeOfDay();
  const [override, setOverride] = useState<WorldMode | null>(null);
  if (override && document.body.dataset.mode !== override) {
    document.body.dataset.mode = override;
  }
  const effectiveMode = override ?? autoMode;
  // Hook returns mockLeaderboard as fallback when Supabase is
  // unconfigured or a query fails, so downstream components always
  // see a valid LeaderboardResponse shape. `source` lets the dev
  // mode switcher show whether we're on live or mock data.
  const { data, source, error: dataError } = useAgentData();
  const { delta, dismiss } = useVisitDelta(data, source);

  // Single-expansion state. Only one agent can be "in focus" at a time —
  // expanding a card drops you into that agent's room (world-layer
  // background swaps via body[data-room]). Collapsing returns to the
  // communal gym default.
  const [expandedAgentId, setExpandedAgentId] = useState<AgentId | null>(null);

  useEffect(() => {
    if (expandedAgentId) {
      document.body.dataset.room = expandedAgentId;
      document.body.dataset.focus = expandedAgentId;
    } else {
      delete document.body.dataset.room;
      delete document.body.dataset.focus;
    }
  }, [expandedAgentId]);

  const handleToggle = (id: AgentId) => {
    setExpandedAgentId((curr) => (curr === id ? null : id));
  };

  const exitFocus = () => setExpandedAgentId(null);

  return (
    <>
      <WorldLayer />
      <div
        className="min-h-screen max-w-[420px] mx-auto relative"
        style={{ color: 'var(--world-ink)' }}
      >
        <TrustStrip data={data} />

        <main className="px-4 pt-6 pb-10 space-y-4">
          {/* Title sits in a paper pill so it reads on any room art in
              any time-of-day mode. Without this the white title got
              lost against the light-wood wall of the communal gym. */}
          <header
            className="inline-block rounded-2xl px-4 py-3"
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
            <p
              className="mt-1 text-sm"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              Three agents. Live markets. Documented in public.
            </p>
          </header>

          {/* Dev-only mode switcher; the buttons themselves are cream
              pills so they read above any world mode. */}
          <div
            className="flex flex-wrap items-center gap-2 text-[11px]"
            style={{
              color: 'var(--color-ink)',
              backgroundColor: 'color-mix(in srgb, var(--color-paper) 82%, transparent)',
              padding: '8px 10px',
              borderRadius: '12px',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
          >
            <span>
              Mode: <strong>{effectiveMode}</strong>{' '}
              <em style={{ color: 'var(--color-ink-muted)' }}>
                {override ? '(forced)' : '(auto)'}
              </em>
              {' · '}
              Data:{' '}
              <strong style={{ color: source === 'live' ? 'var(--color-gain)' : 'var(--color-ink-muted)' }}>
                {source}
              </strong>
              {dataError && (
                <em style={{ color: 'var(--color-loss)' }} title={dataError}>
                  {' '}
                  (err)
                </em>
              )}
            </span>
            {(['daytime', 'dusk', 'moonlit'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setOverride(m)}
                className="px-2 py-0.5 rounded-md border"
                style={{
                  borderColor: 'var(--color-border-default)',
                  backgroundColor:
                    effectiveMode === m
                      ? 'var(--color-paper-raised)'
                      : 'var(--color-paper)',
                  color: 'var(--color-ink)',
                }}
              >
                {m}
              </button>
            ))}
            <button
              onClick={() => {
                setOverride(null);
                document.body.dataset.mode = autoMode;
              }}
              className="px-2 py-0.5 rounded-md border opacity-70"
              style={{
                borderColor: 'var(--color-border-default)',
                backgroundColor: 'var(--color-paper)',
                color: 'var(--color-ink)',
              }}
            >
              auto
            </button>
          </div>

          <VisitDeltaStrip delta={delta} onDismiss={dismiss} />

          {/* Agent roster. Tapping a card enters Focus Mode: the other two
              cards fade out, the chosen agent's room takes over, and on
              mobile the card docks as a bottom-sheet (via CSS rule on
              body[data-focus]). Tap the backdrop or the exit button to
              return to the communal gym. */}
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
                        aria-label="Return to communal gym"
                        className="focus-drag-handle"
                      />
                    )}
                    <AgentCard
                      agent={agent}
                      expanded={focused}
                      onToggle={() => handleToggle(agent.id)}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          <FooterTicker data={data} />
        </main>
      </div>

      {/* Focus-mode backdrop — mounts only when a card is focused. Tapping
          it exits focus mode. The backdrop sits above the world layer but
          below the docked card sheet so the agent's room is visible yet
          dimmed, nudging attention onto the card. */}
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
    </>
  );
}
