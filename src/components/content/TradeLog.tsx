import { Fragment, useState } from 'react';
import type { PerformanceWindow, TradeLogEntry } from '@/lib/types';
import { formatPnl } from '@/lib/formatting';
import { TradeReplayPanel } from './TradeReplayPanel';

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

function FirstRow({ row, selected, onSelect }: { row: TradeLogEntry; selected: boolean; onSelect: () => void }) {
  const isGain = row.pnl >= 0;
  return (
    <button
      type="button"
      className={selected ? 'trade-log-featured trade-log-featured--active' : 'trade-log-featured'}
      onClick={onSelect}
      aria-expanded={selected}
    >
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
    </button>
  );
}

function LedgerRow({ row, selected, onSelect }: { row: TradeLogEntry; selected: boolean; onSelect: () => void }) {
  const isGain = row.pnl >= 0;
  return (
    <button
      type="button"
      className={selected ? 'trade-log-row trade-log-row--active tabular-nums' : 'trade-log-row tabular-nums'}
      onClick={onSelect}
      aria-expanded={selected}
    >
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
    </button>
  );
}

export function TradeLog({ rows, windowSettledCount, window, hasOpenPosition }: Props) {
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
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
  const selectedRow = rows.find((row) => row.id === selectedTradeId) ?? null;
  const showFooter = windowSettledCount > 25;
  const selectTrade = (row: TradeLogEntry) => {
    setSelectedTradeId((current) => (current === row.id ? null : row.id));
  };

  return (
    <div className="trade-log">
      <div className="trade-log-header">
        <span>Trades · {WINDOW_LABEL[window]}</span>
        <span>{windowSettledCount} settled</span>
      </div>
      <FirstRow row={first} selected={selectedTradeId === first.id} onSelect={() => selectTrade(first)} />
      {selectedRow?.id === first.id && <TradeReplayPanel key={selectedRow.id} row={selectedRow} />}
      {rest.length > 0 && (
        <div className="trade-log-ledger">
          {rest.map((row) => (
            <Fragment key={row.id}>
              <LedgerRow row={row} selected={selectedTradeId === row.id} onSelect={() => selectTrade(row)} />
              {selectedRow?.id === row.id && <TradeReplayPanel key={selectedRow.id} row={selectedRow} />}
            </Fragment>
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
