export function formatPnl(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

const MIN_WIN_RATE_SETTLED = 5;

export function formatWinRate(wins: number, settled: number): string {
  if (settled < MIN_WIN_RATE_SETTLED) return '—';
  return `${((wins / settled) * 100).toFixed(1)}%`;
}
