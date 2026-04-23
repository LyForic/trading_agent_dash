import { useEffect, useState } from 'react';
import { WorldLayer } from '@/components/world/WorldLayer';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { AgentCard } from '@/components/content/AgentCard';
import { TrustStrip } from '@/components/content/TrustStrip';
import { mockLeaderboard } from '@/lib/mockData';
import type { AgentId } from '@/lib/types';
import type { WorldMode } from '@/lib/timeOfDay';

export default function App() {
  const autoMode = useTimeOfDay();
  const [override, setOverride] = useState<WorldMode | null>(null);
  if (override && document.body.dataset.mode !== override) {
    document.body.dataset.mode = override;
  }
  const effectiveMode = override ?? autoMode;
  const data = mockLeaderboard;

  // Single-expansion state. Only one agent can be "in focus" at a time —
  // expanding a card drops you into that agent's room (world-layer
  // background swaps via body[data-room]). Collapsing returns to the
  // communal gym default.
  const [expandedAgentId, setExpandedAgentId] = useState<AgentId | null>(null);

  useEffect(() => {
    if (expandedAgentId) {
      document.body.dataset.room = expandedAgentId;
    } else {
      delete document.body.dataset.room;
    }
  }, [expandedAgentId]);

  const handleToggle = (id: AgentId) => {
    setExpandedAgentId((curr) => (curr === id ? null : id));
  };

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

          {/* Tight card stacking. Click a card to expand — that swaps
              the world-layer room to that agent's personal room.
              Collapsing returns to the communal gym. */}
          <div className="space-y-3">
            {data.agents.map((agent) => (
              <AgentCard
                key={agent.id}
                agent={agent}
                expanded={expandedAgentId === agent.id}
                onToggle={() => handleToggle(agent.id)}
              />
            ))}
          </div>

          <footer
            className="grid grid-cols-3 gap-2 mt-6 text-[11px] text-center"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            {data.agents
              .filter((a) => a.state !== 'arriving_soon')
              .map((a) => (
                <div
                  key={a.id}
                  className="p-2 rounded-lg border"
                  style={{
                    backgroundColor: 'color-mix(in srgb, var(--color-paper) 82%, transparent)',
                    borderColor: 'var(--color-border-default)',
                    backdropFilter: 'blur(4px)',
                    WebkitBackdropFilter: 'blur(4px)',
                  }}
                >
                  <div
                    className="tabular-nums font-medium text-sm"
                    style={{ color: 'var(--color-ink)' }}
                  >
                    {a.record.settled}
                  </div>
                  <div>{a.name} bets</div>
                </div>
              ))}
            <div
              className="p-2 rounded-lg border col-span-1"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-paper) 82%, transparent)',
                borderColor: 'var(--color-border-default)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
              }}
            >
              <div
                className="tabular-nums font-medium text-sm"
                style={{ color: 'var(--color-ink)' }}
              >
                ✓
              </div>
              <div>Verifiable on Kalshi</div>
            </div>
          </footer>
        </main>
      </div>
    </>
  );
}
