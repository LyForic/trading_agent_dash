import { describe, it, expect } from 'vitest';
import { formatPnl, formatWinRate } from '@/lib/formatting';

describe('formatPnl', () => {
  it('formats positive P&L with + sign and 2 decimals', () => {
    expect(formatPnl(18.42)).toBe('+$18.42');
  });

  it('formats negative P&L with minus sign', () => {
    expect(formatPnl(-22.89)).toBe('-$22.89');
  });

  it('formats zero as +$0.00', () => {
    expect(formatPnl(0)).toBe('+$0.00');
  });
});

describe('formatWinRate', () => {
  it('formats a ratio as percentage with 1 decimal', () => {
    expect(formatWinRate(341, 650)).toBe('52.5%');
  });

  it('returns — for zero settled', () => {
    expect(formatWinRate(0, 0)).toBe('—');
  });
});
