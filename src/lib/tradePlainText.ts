import { formatPnl } from './formatting';
import type { TradeLogEntry } from './types';

function formatRiskDollars(value: number) {
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatClock(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'settlement';
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function tradePlainText(row: TradeLogEntry) {
  const side = row.side.toUpperCase();
  const risk = (row.size * row.entry_price_cents) / 100;
  const result = row.settle_price_cents >= row.entry_price_cents ? 'rose' : 'fell';
  return `Bet ${side} on ${row.contract_ticker}. ${row.entry_price_cents}c x ${row.size} contracts, about ${formatRiskDollars(risk)} at risk; the contract ${result} to ${row.settle_price_cents}c by ${formatClock(row.settled_at)} for ${formatPnl(row.pnl)}.`;
}
