import { useMemo } from 'react';
import type { BnfPortfolioSeries } from '@/lib/types';

function usd(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

export function BnfPortfolioCard({ data, failed = false }: { data: BnfPortfolioSeries; failed?: boolean }) {
  const pts = data.points;
  const latest = pts[pts.length - 1];

  const path = useMemo(() => {
    if (pts.length < 2) return { area: '', line: '', baselineY: 0 };
    const W = 300, H = 90;
    const vals = pts.map((p) => p.combined_cleared_cents);
    const base = pts[0].combined_baseline_cents;
    const lo = Math.min(base, ...vals);
    const hi = Math.max(base, ...vals);
    const span = hi - lo || 1;
    const x = (i: number) => (i / (pts.length - 1)) * W;
    const y = (v: number) => H - ((v - lo) / span) * H;
    const line = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    const area = `${line}L${W},${H}L0,${H}Z`;
    return { area, line, baselineY: y(base) };
  }, [pts]);

  if (!latest) {
    return (
      <section className="gym-chrome rounded-2xl px-4 py-5"
               style={{ color: 'var(--color-ink)', background: 'var(--color-paper)' }}>
        <h2 className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          Combined portfolio
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          {failed
            ? 'Couldn’t load the latest numbers — retrying shortly.'
            : 'Curve is warming up — first hourly snapshot lands soon.'}
        </p>
      </section>
    );
  }

  const pct = latest.pct_vs_baseline;
  const reconstructed =
    latest.brandon_source === 'reconstructed' || latest.justin_source === 'reconstructed';

  return (
    <section className="gym-chrome rounded-2xl px-4 py-5"
             style={{ color: 'var(--color-ink)', background: 'var(--color-paper)' }}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>
          Brandon + Justin · combined
        </h2>
        <span className="text-xs" style={{ color: 'var(--color-ink-muted)' }}>
          vs {usd(latest.combined_baseline_cents)} baseline
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="text-3xl" style={{ fontFamily: 'var(--font-display)' }}>
          {usd(latest.combined_cleared_cents)}
        </span>
        <span className="text-sm" style={{ color: pct >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
          {pct >= 0 ? '+' : ''}{pct.toFixed(2)}%
        </span>
      </div>
      {path.line && (
        <svg viewBox="0 0 300 90" className="mt-3 w-full" role="img"
             aria-label="Combined portfolio value over time">
          <line x1="0" y1={path.baselineY} x2="300" y2={path.baselineY}
                stroke="var(--color-ink-muted)" strokeDasharray="3 3" strokeWidth="1" opacity="0.5" />
          <path d={path.area} fill="var(--color-ink)" opacity="0.08" />
          <path data-testid="bnf-curve-path" d={path.line}
                fill="none" stroke="var(--color-ink)" strokeWidth="2" />
        </svg>
      )}
      {reconstructed && (
        <p className="mt-2 text-xs" style={{ color: 'var(--color-ink-muted)' }}>
          Justin’s leg is reconstructed from trade data until his live API is wired.
        </p>
      )}
    </section>
  );
}
