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
    <div className="trade-log-featured">
      <div className="trade-log-featured-head">
        <span className="trade-log-receipt-id">
          {shortReceiptId(row.id)}
        </span>
        <span
          className="trade-log-pnl tabular-nums"
          style={{ color: isGain ? 'var(--color-gain)' : 'var(--color-loss)' }}
        >
          {formatPnl(row.pnl)}
        </span>
      </div>
      <div className="trade-log-featured-line tabular-nums">
        {row.contract_ticker} · {row.side.toUpperCase()} {row.entry_price_cents}¢→{row.settle_price_cents}¢ · size {row.size} · {fmtTime(row.settled_at)}
      </div>
    </div>
  );
}

function LedgerRow({ row }: { row: TradeLogEntry }) {
  const isGain = row.pnl >= 0;
  return (
    <div className="trade-log-row tabular-nums">
      <span className="trade-log-receipt-id">
        {shortReceiptId(row.id)}
      </span>
      <span className="trade-log-row-main">
        {row.side.toUpperCase()} {row.entry_price_cents}¢→{row.settle_price_cents}¢
      </span>
      <span className="trade-log-row-size">
        {row.size}
      </span>
      <span
        className="trade-log-row-pnl"
        style={{ color: isGain ? 'var(--color-gain)' : 'var(--color-loss)' }}
      >
        {formatPnl(row.pnl)}
      </span>
      <span className="trade-log-row-time">
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
      <div className="trade-log-empty">
        {lifetimeCopy}
      </div>
    );
  }

  const [first, ...rest] = rows;
  const showFooter = windowSettledCount > 25;

  return (
    <div className="trade-log">
      <div className="trade-log-header">
        <span>Trades · {WINDOW_LABEL[window]}</span>
        <span>{windowSettledCount} settled</span>
      </div>
      <FirstRow row={first} />
      {rest.length > 0 && (
        <div className="trade-log-ledger">
          {rest.map((row) => (
            <LedgerRow key={row.id} row={row} />
          ))}
        </div>
      )}
      {showFooter && (
        <div className="trade-log-footer">
          Latest 25 of {windowSettledCount}
        </div>
      )}
      <p className="trade-log-delay-note">
        Settlements shown after 30-minute delay.
      </p>
    </div>
  );
}
