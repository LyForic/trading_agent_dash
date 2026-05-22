import { describe, expect, it } from 'vitest';
import { contractEndForReplay, parseKalshi15MinuteContractEnd } from '@/lib/kalshiContracts';

describe('kalshi contract helpers', () => {
  it('parses Kalshi 15m ticker close time as New York time', () => {
    const end = parseKalshi15MinuteContractEnd('KXBTC15M-26MAY221715-15');

    expect(end?.toISOString()).toBe('2026-05-22T21:15:00.000Z');
  });

  it('uses ticker close instead of delayed settlement for replay end', () => {
    const settledAt = new Date('2026-05-22T21:19:48.750Z');
    const end = contractEndForReplay('KXBTC15M-26MAY221715-15', settledAt);

    expect(end.toISOString()).toBe('2026-05-22T21:15:00.000Z');
  });

  it('falls back to settled_at for non-15m tickers', () => {
    const settledAt = new Date('2026-05-22T21:19:48.750Z');
    const end = contractEndForReplay('KXFEDDECISION-26MAY', settledAt);

    expect(end).toBe(settledAt);
  });
});
