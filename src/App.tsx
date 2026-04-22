import { useState } from 'react';
import { WorldLayer } from '@/components/world/WorldLayer';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import type { WorldMode } from '@/lib/timeOfDay';

export default function App() {
  const autoMode = useTimeOfDay();

  // Dev-only override so Brandon can verify all three modes without
  // waiting on the clock. Removed in Phase 2 when we stop needing the
  // token showcase as the main view.
  const [override, setOverride] = useState<WorldMode | null>(null);
  if (override && document.body.dataset.mode !== override) {
    document.body.dataset.mode = override;
  }
  const effectiveMode = override ?? autoMode;

  return (
    <>
      <WorldLayer />
      <main
        className="min-h-screen p-6 transition-colors duration-300"
        style={{ color: 'var(--world-ink)' }}
      >
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display)' }}>
          The Trading Gym
        </h1>
        <p className="mt-2 text-sm opacity-80">
          Three agents. Live markets. Documented in public.
        </p>

        {/* Phase 1: mode debug bar — temporary. Removed in Phase 2. */}
        <section className="mt-6 flex flex-wrap items-center gap-2 text-xs">
          <span className="opacity-70">
            Mode: <strong>{effectiveMode}</strong>{' '}
            {override ? <em>(forced)</em> : <em>(auto from local hour)</em>}
          </span>
          {(['daytime', 'dusk', 'moonlit'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setOverride(m)}
              className="px-3 py-1 rounded-md border"
              style={{
                borderColor: 'var(--color-border-default)',
                backgroundColor:
                  effectiveMode === m
                    ? 'var(--color-paper-raised)'
                    : 'var(--color-paper)',
                color: 'var(--color-ink)',
                fontWeight: effectiveMode === m ? 500 : 400,
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
            className="px-3 py-1 rounded-md border opacity-70"
            style={{ borderColor: 'var(--color-border-default)' }}
          >
            auto
          </button>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-xl" style={{ fontFamily: 'var(--font-display)' }}>
            Tokens
          </h2>
          <div className="flex flex-wrap gap-2">
            {[
              { name: 'paper', color: 'var(--color-paper)' },
              { name: 'paper-raised', color: 'var(--color-paper-raised)' },
              { name: 'ink', color: 'var(--color-ink)' },
              { name: 'border', color: 'var(--color-border-default)' },
              { name: 'loss', color: 'var(--color-loss)' },
              { name: 'gain', color: 'var(--color-gain)' },
              { name: 'apex', color: 'var(--color-apex)' },
              { name: 'gale', color: 'var(--color-gale)' },
              { name: 'metheus', color: 'var(--color-metheus)' },
            ].map((t) => (
              <div key={t.name} className="flex flex-col items-center text-xs">
                <div
                  className="w-16 h-16 rounded-lg border"
                  style={{
                    backgroundColor: t.color,
                    borderColor: 'var(--color-border-default)',
                  }}
                />
                <span className="mt-1 font-mono opacity-80">{t.name}</span>
              </div>
            ))}
          </div>

          {/* Sample cream card floating on whichever world mode is active.
              This is the visual test: the card should stay legible against all three. */}
          <div
            className="mt-4 p-4 rounded-2xl border max-w-sm"
            style={{
              backgroundColor: 'var(--color-paper)',
              borderColor: 'var(--color-border-default)',
              color: 'var(--color-ink)',
              boxShadow: '0 4px 12px rgba(62, 53, 41, 0.18)',
            }}
          >
            <div
              className="text-xs uppercase tracking-wide"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              Sample paper card against {effectiveMode}
            </div>
            <p className="mt-2 tabular-nums" style={{ color: 'var(--color-gain)' }}>
              +$18.42 — Apex gain sample
            </p>
            <p className="tabular-nums" style={{ color: 'var(--color-loss)' }}>
              -$22.89 — Gale loss sample
            </p>
            <div className="mt-3 flex gap-2">
              <span
                className="px-2 py-0.5 rounded-full text-xs"
                style={{
                  backgroundColor: 'var(--color-paper-raised)',
                  color: 'var(--color-ink)',
                }}
              >
                paper-raised pill
              </span>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
