import { describe, expect, it } from 'vitest';
import {
  battleMomentum,
  buildBattlePreview,
  clampPriceCents,
} from '@/lib/battleProjection';
import type { OpenPosition } from '@/lib/types';

const openPosition: OpenPosition = {
  contract_ticker: 'KXBTC-26APR21-B67500',
  entry_price_cents: 42,
  side: 'yes',
  size: 12,
  entered_at_delayed: '2026-04-21T18:00:00.000Z',
  settles_at: '2026-04-22T00:00:00.000Z',
};

describe('battleProjection', () => {
  it('clamps prices to public market bounds', () => {
    expect(clampPriceCents(-20)).toBe(1);
    expect(clampPriceCents(0)).toBe(1);
    expect(clampPriceCents(120)).toBe(99);
    expect(clampPriceCents(42.4)).toBe(42);
  });

  it('pushes right for a YES position when price is above entry', () => {
    expect(battleMomentum(40, 55, 'yes')).toMatchObject({
      deltaCents: 15,
      favorsAgent: true,
      direction: 'right',
      magnitude: 0.3,
    });
  });

  it('pushes left for a YES position when price is below entry', () => {
    expect(battleMomentum(40, 30, 'yes')).toMatchObject({
      deltaCents: -10,
      favorsAgent: false,
      direction: 'left',
      magnitude: 0.2,
    });
  });

  it('inverts direction for NO positions', () => {
    expect(battleMomentum(40, 30, 'no')).toMatchObject({
      favorsAgent: true,
      direction: 'right',
    });
    expect(battleMomentum(40, 55, 'no')).toMatchObject({
      favorsAgent: false,
      direction: 'left',
    });
  });

  it('centers at entry and caps magnitude at a 50c move', () => {
    expect(battleMomentum(40, 40, 'yes')).toMatchObject({
      direction: 'center',
      magnitude: 0,
    });
    expect(battleMomentum(20, 90, 'yes')).toMatchObject({
      direction: 'right',
      magnitude: 1,
    });
  });

  it('builds a deterministic preview for a given timestamp', () => {
    const now = new Date('2026-05-06T07:00:00.000Z');
    const first = buildBattlePreview(openPosition, now);
    const second = buildBattlePreview(openPosition, now);
    expect(first).toEqual(second);
    expect(first.sparkline).toHaveLength(18);
    expect(first.currentPriceCents).toBe(first.sparkline[17]);
  });
});
