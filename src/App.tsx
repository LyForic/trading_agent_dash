import { useState } from 'react';
import { WorldLayer } from '@/components/world/WorldLayer';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { AgentCard } from '@/components/content/AgentCard';
import { TrustStrip } from '@/components/content/TrustStrip';
import { mockLeaderboard } from '@/lib/mockData';
import type { WorldMode } from '@/lib/timeOfDay';

/**
 * Trading Gym V1 — the roster screen.
 * Fixed world layer behind, sticky TrustStrip on top, three collapsed
 * AgentCards (Apex, Gale, Metheus). Phase 3 will wrap each card in a
 * RoomSection so the world layer accent shifts as you scroll between
 * agents. Phase 5 will wire the in-battle pill tap to the BattleArena.
 */
export default function App() {
  const autoMode = useTimeOfDay();
  const [override, setOverride] = useState<WorldMode | null>(null);
  if (override && document.body.dataset.mode !== override) {
    document.body.dataset.mode = override;
  }
  const effectiveMode = override ?? autoMode;
  const data = mockLeaderboard;

  return (
    <>
      <WorldLayer />
      <div
        className="min-h-screen max-w-[420px] mx-auto relative"
        style={{ color: 'var(--world-ink)' }}
      >
        <TrustStrip data={data} />

        <main className="px-4 pt-6 pb-10 space-y-4">
          <header>
            <h1 className="text-3xl" style={{ fontFamily: 'var(--font-display)' }}>
              The Trading Gym
            </h1>
            <p className="mt-1 text-sm opacity-80">
              Three agents. Live markets. Documented in public.
            </p>
          </header>

          {/* Dev-only mode switcher — removed in Phase 3 when RoomSection
              takes over the role of making all three modes testable.
              Label text inherits from world (cream in dusk, charcoal in
              daytime) at 70% opacity; buttons are cream-raised pills so
              they read against any world mode. */}
          <div
            className="flex flex-wrap items-center gap-2 text-[11px] opacity-70"
            style={{ color: 'var(--world-ink)' }}
          >
            <span>
              Mode: <strong>{effectiveMode}</strong>{' '}
              {override ? '(forced)' : '(auto)'}
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
                  opacity: 1,
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
              className="px-2 py-0.5 rounded-md border"
              style={{
                borderColor: 'var(--color-border-default)',
                backgroundColor: 'var(--color-paper)',
                color: 'var(--color-ink)',
                opacity: 0.7,
              }}
            >
              auto
            </button>
          </div>

          <div className="space-y-3">
            {data.agents.map((agent) => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>

          {/* Social-proof footer — per spec §6 TrustStrip has counts; this
              is the complementary "credibility grammar" shelf. */}
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
                    backgroundColor: 'color-mix(in srgb, var(--color-paper) 60%, transparent)',
                    borderColor: 'var(--color-border-default)',
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
                backgroundColor: 'color-mix(in srgb, var(--color-paper) 60%, transparent)',
                borderColor: 'var(--color-border-default)',
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
