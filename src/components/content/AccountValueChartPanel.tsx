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

const CHART = {
  width: 360,
  height: 198,
  plotLeft: 8,
  plotRight: 306,
  plotTop: 16,
  plotBottom: 160,
  yAxisX: 352,
  xLabelY: 190,
};

function formatDollars(cents: number | null | undefined) {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return 'Pending';
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAxisDollars(cents: number) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function formatSignedDollars(cents: number) {
  const sign = cents >= 0 ? '+' : '-';
  return `${sign}${formatDollars(Math.abs(cents))}`;
}

function formatSignedPercent(value: number) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatAsOf(value: string | null | undefined) {
  if (!value) return 'Public data pending';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Public data pending';
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  return `As of ${label} PT - public data`;
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

function periodLabel(period: AccountChartPeriod) {
  return PERIODS.find((item) => item.id === period)?.label ?? '1W';
}

function formatDateTick(value: string, period: AccountChartPeriod) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  if (period === '1d') {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Los_Angeles',
      hour: 'numeric',
    }).format(date);
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatSnapshotDate(value: string | null | undefined) {
  if (!value) return 'the first snapshot';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'the first snapshot';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function buildChart(points: BnfPortfolioPoint[], period: AccountChartPeriod) {
  if (points.length < 2) return null;
  const xMin = Date.parse(points[0].captured_at);
  const xMax = Date.parse(points[points.length - 1].captured_at);
  const values = points.map((point) => point.combined_cleared_cents);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const anchoredMax = period === 'all' ? Math.max(max, PUBLIC_LAB_STARTING_BANKROLL_CENTS) : max;
  const yPad = Math.max(100, (anchoredMax - min) * 0.14);
  const yMin = min - yPad;
  const yMax = anchoredMax + yPad;
  const xSpan = Math.max(1, xMax - xMin);
  const ySpan = Math.max(1, yMax - yMin);

  const coords = points.map((point) => {
    const x = CHART.plotLeft
      + ((Date.parse(point.captured_at) - xMin) / xSpan) * (CHART.plotRight - CHART.plotLeft);
    const y = CHART.plotBottom
      - ((point.combined_cleared_cents - yMin) / ySpan) * (CHART.plotBottom - CHART.plotTop);
    return { x, y };
  });

  const linePath = coords
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const areaPath = `${linePath} L ${last.x.toFixed(2)} ${CHART.plotBottom} L ${first.x.toFixed(2)} ${CHART.plotBottom} Z`;
  const tickValues = [yMax, yMin + ySpan * 0.66, yMin + ySpan * 0.33, yMin];
  const yTicks = tickValues.map((value) => ({
    value,
    label: formatAxisDollars(value),
    y: CHART.plotBottom - ((value - yMin) / ySpan) * (CHART.plotBottom - CHART.plotTop),
  }));
  const middle = points[Math.floor(points.length / 2)];
  const xTicks = [
    { label: formatDateTick(points[0].captured_at, period), x: CHART.plotLeft, anchor: 'start' as const },
    { label: formatDateTick(middle.captured_at, period), x: (CHART.plotLeft + CHART.plotRight) / 2, anchor: 'middle' as const },
    { label: formatDateTick(points[points.length - 1].captured_at, period), x: CHART.plotRight, anchor: 'end' as const },
  ];
  const startLineY = PUBLIC_LAB_STARTING_BANKROLL_CENTS >= yMin && PUBLIC_LAB_STARTING_BANKROLL_CENTS <= yMax
    ? CHART.plotBottom - ((PUBLIC_LAB_STARTING_BANKROLL_CENTS - yMin) / ySpan) * (CHART.plotBottom - CHART.plotTop)
    : null;

  return {
    areaPath,
    linePath,
    latestPoint: last,
    yTicks,
    xTicks,
    startLineY,
  };
}

export function AccountValueChartPanel({ points, period, onPeriodChange, onBack, onClose }: Props) {
  const series = filteredPoints(points, period);
  const latest = series[series.length - 1] ?? points[points.length - 1] ?? null;
  const first = series[0] ?? latest;
  const high = series.length > 0 ? Math.max(...series.map((point) => point.combined_cleared_cents)) : null;
  const low = series.length > 0 ? Math.min(...series.map((point) => point.combined_cleared_cents)) : null;
  const chart = buildChart(series, period);
  const pnlCents = latest ? latest.combined_cleared_cents - PUBLIC_LAB_STARTING_BANKROLL_CENTS : 0;
  const periodChangeCents = latest && first ? latest.combined_cleared_cents - first.combined_cleared_cents : 0;
  const periodChangePct = first && first.combined_cleared_cents !== 0
    ? (periodChangeCents / first.combined_cleared_cents) * 100
    : 0;
  const periodName = periodLabel(period);

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
        <div>
          <span>Now</span>
          <strong>{formatDollars(latest?.combined_cleared_cents)}</strong>
          <em>{formatAsOf(latest?.captured_at)}</em>
        </div>
        <div>
          <span>{periodName} change</span>
          <strong className={periodChangeCents >= 0 ? 'world-v2-gain' : 'world-v2-loss'}>
            {formatSignedDollars(periodChangeCents)}
          </strong>
          <em className={periodChangeCents >= 0 ? 'world-v2-gain' : 'world-v2-loss'}>
            {formatSignedPercent(periodChangePct)}
          </em>
        </div>
      </div>

      <div className="account-chart-panel__chart">
        {chart ? (
          <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label="Line chart of public account value">
            <defs>
              <linearGradient id="account-chart-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#63d96d" stopOpacity="0.34" />
                <stop offset="100%" stopColor="#63d96d" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <rect
              x={CHART.plotLeft}
              y={CHART.plotTop}
              width={CHART.plotRight - CHART.plotLeft}
              height={CHART.plotBottom - CHART.plotTop}
              rx="4"
              className="account-chart-panel__plot-bg"
            />
            {chart.yTicks.map((tick) => (
              <g key={`${tick.label}-${tick.y.toFixed(2)}`}>
                <line
                  x1={CHART.plotLeft}
                  x2={CHART.plotRight}
                  y1={tick.y}
                  y2={tick.y}
                  className="account-chart-panel__grid-line"
                />
                <text x={CHART.yAxisX} y={tick.y + 4} textAnchor="end" className="account-chart-panel__axis-label">
                  {tick.label}
                </text>
              </g>
            ))}
            {chart.startLineY !== null && (
              <g>
                <line
                  x1={CHART.plotLeft}
                  x2={CHART.plotRight}
                  y1={chart.startLineY}
                  y2={chart.startLineY}
                  className="account-chart-panel__start-line"
                />
                <text
                  x={CHART.plotLeft + 6}
                  y={Math.max(CHART.plotTop + 12, chart.startLineY - 6)}
                  className="account-chart-panel__start-label"
                >
                  $10,000 reset
                </text>
              </g>
            )}
            <path d={chart.areaPath} className="account-chart-panel__area" fill="url(#account-chart-fill)" />
            <path d={chart.linePath} className="account-chart-panel__line" />
            <circle cx={chart.latestPoint.x} cy={chart.latestPoint.y} r="3.5" className="account-chart-panel__latest-dot" />
            {chart.xTicks.map((tick) => (
              <text
                key={`${tick.label}-${tick.x}`}
                x={tick.x}
                y={CHART.xLabelY}
                textAnchor={tick.anchor}
                className="account-chart-panel__axis-label account-chart-panel__axis-label--x"
              >
                {tick.label}
              </text>
            ))}
          </svg>
        ) : (
          <div className="account-chart-panel__empty">Waiting for enough account snapshots.</div>
        )}
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

      {period === 'all' && series[0] && series[0].combined_cleared_cents < PUBLIC_LAB_STARTING_BANKROLL_CENTS && (
        <p className="account-chart-panel__lead-in">
          Pre-tracking lead-in: daily snapshots began {formatSnapshotDate(series[0].captured_at)}. The dashed line marks the $10,000 reset.
        </p>
      )}

      <div className="account-chart-panel__metrics" aria-label="Account chart metrics">
        <div>
          <span>Start</span>
          <strong>{formatDollars(PUBLIC_LAB_STARTING_BANKROLL_CENTS)}</strong>
        </div>
        <div>
          <span>Life P&L</span>
          <strong className={pnlCents >= 0 ? 'world-v2-gain' : 'world-v2-loss'}>{formatSignedDollars(pnlCents)}</strong>
        </div>
        <div>
          <span>{periodName} open</span>
          <strong>{formatDollars(first?.combined_cleared_cents)}</strong>
        </div>
        <div>
          <span>{periodName} high</span>
          <strong>{formatDollars(high)}</strong>
        </div>
        <div>
          <span>{periodName} low</span>
          <strong>{formatDollars(low)}</strong>
        </div>
        <div>
          <span>Snapshots</span>
          <strong>{series.length}</strong>
        </div>
      </div>
    </section>
  );
}
