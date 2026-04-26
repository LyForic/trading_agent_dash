import type { PerformanceWindow, TradeLogEntry } from '@/lib/types';
import { formatPnl } from '@/lib/formatting';

interface Props {
  rows: TradeLogEntry[];
  windowSettledCount: number;
  window: PerformanceWindow;
  hasOpenPosition: boolean;
}

const WINDOW_LABEL: Record<PerformanceWindow, string> = {
  '24h': '24h',
  '7d': '7d',
  lifetime: 'Lifetime',
};

const NEXT_WINDOW: Partial<Record<PerformanceWindow, string>> = {
  '24h': '7d',
  '7d': 'Lifetime',
};

function fmtTime(ts: string) {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function shortReceiptId(id: string) {
  // mockTradeLog uses `<agentId>-<padded>`; live data uses raw uuid. Take first 8 hex chars.
  const hex = id.split('-').slice(-1)[0];
  return hex.slice(0, 8).toUpperCase();
}

function FirstRow({ row }: { row: TradeLogEntry }) {
  const isGain = row.pnl >= 0;
  return (
    <div
      className="p-3 rounded-lg border"
      style={{
        backgroundColor: 'var(--color-paper-raised)',
        borderColor: 'var(--color-border-default)',
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
          {shortReceiptId(row.id)}
        </span>
        <span
          className="text-sm font-medium tabular-nums"
          style={{ color: isGain ? 'var(--color-gain)' : 'var(--color-loss)' }}
        >
          {formatPnl(row.pnl)}
        </span>
      </div>
      <div className="text-xs tabular-nums truncate" style={{ color: 'var(--color-ink)' }}>
        {row.contract_ticker} · {row.side.toUpperCase()} {row.entry_price_cents}¢→{row.settle_price_cents}¢ · size {row.size} · {fmtTime(row.settled_at)}
      </div>
    </div>
  );
}

function LedgerRow({ row }: { row: TradeLogEntry }) {
  const isGain = row.pnl >= 0;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 text-xs tabular-nums">
      <span className="font-mono text-[10px] flex-shrink-0" style={{ color: 'var(--color-ink-muted)' }}>
        {shortReceiptId(row.id)}
      </span>
      <span className="truncate flex-1" style={{ color: 'var(--color-ink)' }}>
        {row.side.toUpperCase()} {row.entry_price_cents}¢→{row.settle_price_cents}¢
      </span>
      <span className="flex-shrink-0" style={{ color: 'var(--color-ink-muted)' }}>
        {row.size}
      </span>
      <span
        className="flex-shrink-0 font-medium"
        style={{ color: isGain ? 'var(--color-gain)' : 'var(--color-loss)' }}
      >
        {formatPnl(row.pnl)}
      </span>
      <span className="flex-shrink-0 text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
        {fmtTime(row.settled_at)}
      </span>
    </div>
  );
}

export function TradeLog({ rows, windowSettledCount, window, hasOpenPosition }: Props) {
  // Defensive: also fall through to empty state if rows is empty even when
  // windowSettledCount > 0 (cross-query skew, RLS edge case, transient sync).
  // Avoids `<FirstRow row={undefined}>` deref on `row.pnl` / `row.id`.
  if (windowSettledCount === 0 || rows.length === 0) {
    const noun = hasOpenPosition ? 'No settled trades' : 'No settled trades';
    const next = NEXT_WINDOW[window];
    const trySuggestion = next ? ` Try ${next}.` : '';
    const lifetimeCopy = window === 'lifetime' ? 'No settled trades yet.' : `${noun} in ${WINDOW_LABEL[window]}.${trySuggestion}`;
    return (
      <div
        className="text-center text-xs py-6"
        style={{ color: 'var(--color-ink-muted)' }}
      >
        {lifetimeCopy}
      </div>
    );
  }

  const [first, ...rest] = rows;
  const showFooter = windowSettledCount > 25;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-[10px] uppercase tracking-wide" style={{ color: 'var(--color-ink-muted)' }}>
        <span>Trades · {WINDOW_LABEL[window]}</span>
        <span>{windowSettledCount} settled</span>
      </div>
      <FirstRow row={first} />
      {rest.length > 0 && (
        <div className="divide-y" style={{ borderColor: 'var(--color-border-default)' }}>
          {rest.map((row) => (
            <LedgerRow key={row.id} row={row} />
          ))}
        </div>
      )}
      {showFooter && (
        <div className="text-[10px] text-right" style={{ color: 'var(--color-ink-muted)' }}>
          Latest 25 of {windowSettledCount}
        </div>
      )}
      <p className="text-[9px] mt-1 leading-tight" style={{ color: 'var(--color-ink-muted)' }}>
        Settlements shown after 30-minute delay.
      </p>
    </div>
  );
}
