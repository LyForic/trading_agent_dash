export function formatPnl(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function formatWinRate(wins: number, settled: number): string {
  if (settled === 0) return '—';
  return `${((wins / settled) * 100).toFixed(1)}%`;
}
