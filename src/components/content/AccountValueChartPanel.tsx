import { ArrowLeft, X } from 'lucide-react';
import { PUBLIC_LAB_STARTING_BANKROLL_CENTS, trackPublicLabEvent } from '@/lib/publicLab';
import type { BnfPortfolioPoint } from '@/lib/types';

export type AccountChartPeriod = '1d' | '1w' | '1m' | '1y' | 'all';

interface Props {
  points: BnfPortfolioPoint[];
  period: AccountChartPeriod;
  onPeriodChange: (period: AccountChartPeriod) => void;
  onBack: () => void;
  onClose: () => void;
}

const PERIODS: Array<{ id: AccountChartPeriod; label: string; ms: number | null }> = [
  { id: '1d', label: '1D', ms: 24 * 60 * 60 * 1000 },
  { id: '1w', label: '1W', ms: 7 * 24 * 60 * 60 * 1000 },
  { id: '1m', label: '1M', ms: 30 * 24 * 60 * 60 * 1000 },
  { id: '1y', label: '1Y', ms: 365 * 24 * 60 * 60 * 1000 },
  { id: 'all', label: 'All', ms: null },
];

function formatDollars(cents: number | null | undefined) {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return 'Pending';
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedDollars(cents: number) {
  const sign = cents >= 0 ? '+' : '-';
  return `${sign}${formatDollars(Math.abs(cents))}`;
}

function formatAsOf(value: string | null | undefined) {
  if (!value) return 'Delayed data pending';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Delayed data pending';
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  return `As of ${label} PT - delayed data`;
}

function filteredPoints(points: BnfPortfolioPoint[], period: AccountChartPeriod) {
  const sorted = points
    .filter((point) => Number.isFinite(Date.parse(point.captured_at)))
    .slice()
    .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));
  const latest = sorted[sorted.length - 1];
  const config = PERIODS.find((item) => item.id === period);
  if (!latest || !config?.ms) return sorted;
  const cutoff = Date.parse(latest.captured_at) - config.ms;
  return sorted.filter((point) => Date.parse(point.captured_at) >= cutoff);
}

function linePath(points: BnfPortfolioPoint[]) {
  if (points.length < 2) return '';
  const width = 300;
  const height = 120;
  const xMin = Date.parse(points[0].captured_at);
  const xMax = Date.parse(points[points.length - 1].captured_at);
  const values = points.map((point) => point.combined_cleared_cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const yPad = Math.max(100, (max - min) * 0.12);
  const yMin = min - yPad;
  const yMax = max + yPad;
  const xSpan = Math.max(1, xMax - xMin);
  const ySpan = Math.max(1, yMax - yMin);

  return points
    .map((point, index) => {
      const x = ((Date.parse(point.captured_at) - xMin) / xSpan) * width;
      const y = height - ((point.combined_cleared_cents - yMin) / ySpan) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export function AccountValueChartPanel({ points, period, onPeriodChange, onBack, onClose }: Props) {
  const series = filteredPoints(points, period);
  const latest = series[series.length - 1] ?? points[points.length - 1] ?? null;
  const path = linePath(series);
  const pnlCents = latest ? latest.combined_cleared_cents - PUBLIC_LAB_STARTING_BANKROLL_CENTS : 0;
  const pnlPct = latest ? (pnlCents / PUBLIC_LAB_STARTING_BANKROLL_CENTS) * 100 : 0;

  return (
    <section className="account-chart-panel" aria-label="Account value chart">
      <div className="account-chart-panel__head">
        <button type="button" onClick={onBack} aria-label="Back to Public Lab">
          <ArrowLeft size={15} aria-hidden />
        </button>
        <div>
          <span>Account Chart</span>
          <h2>Public account value</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close account chart">
          <X size={15} aria-hidden />
        </button>
      </div>

      <div className="account-chart-panel__value">
        <strong>{formatDollars(latest?.combined_cleared_cents)}</strong>
        <span className={pnlCents >= 0 ? 'world-v2-gain' : 'world-v2-loss'}>
          {formatSignedDollars(pnlCents)} / {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}% from reset
        </span>
        <em>{formatAsOf(latest?.captured_at)}</em>
      </div>

      <div className="account-chart-panel__periods" role="group" aria-label="Account chart period">
        {PERIODS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === period ? 'account-chart-panel__period account-chart-panel__period--active' : 'account-chart-panel__period'}
            aria-pressed={item.id === period}
            onClick={() => {
              onPeriodChange(item.id);
              trackPublicLabEvent('account_chart_period_selected', {
                surface: 'account_chart',
                period: item.id,
              });
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="account-chart-panel__chart">
        {path ? (
          <svg viewBox="0 0 300 120" role="img" aria-label="Line chart of public account value">
            <line x1="0" y1="92" x2="300" y2="92" />
            <path d={path} />
          </svg>
        ) : (
          <div className="account-chart-panel__empty">Waiting for enough account snapshots.</div>
        )}
      </div>
    </section>
  );
}
