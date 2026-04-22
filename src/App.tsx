export default function App() {
  return (
    <main className="min-h-screen p-6" style={{ color: 'var(--world-ink)' }}>
      <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display)' }}>
        The Trading Gym
      </h1>
      <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-muted)' }}>
        Three agents. Live markets. Documented in public.
      </p>

      {/* Token showcase for visual verification of Phase 0 */}
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
              <span className="mt-1 font-mono">{t.name}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <p className="tabular-nums" style={{ color: 'var(--color-gain)' }}>
            +$18.42 — Apex gain sample
          </p>
          <p className="tabular-nums" style={{ color: 'var(--color-loss)' }}>
            -$22.89 — Gale loss sample
          </p>
        </div>
      </section>
    </main>
  );
}
