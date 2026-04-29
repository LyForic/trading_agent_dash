import { describe, it, expect } from 'vitest';
import { lampBrightnessScalar } from '@/lib/lampBrightness';

/**
 * Plaza lantern brightness modulation per design spec.
 *
 *   2026-04-21-design.md §2.1: ambient motion includes "lamp flicker"
 *   2026-04-23-town-square-art-brief.md L171: "Code will modulate its
 *     brightness by total P&L (this is the diegetic status indicator)."
 *   2026-04-28-town-square-slice-1bc-scoping.md: ±$100 cap, ±0.20
 *     symmetric range around baseline 1.0.
 */
describe('lampBrightnessScalar', () => {
  it('returns 1.0 at zero total P&L (baseline)', () => {
    expect(lampBrightnessScalar(0)).toBe(1);
  });

  it('returns 1.20 at the positive cap (+$100 lifetime)', () => {
    expect(lampBrightnessScalar(100)).toBeCloseTo(1.2, 5);
  });

  it('returns 0.80 at the negative cap (-$100 lifetime)', () => {
    expect(lampBrightnessScalar(-100)).toBeCloseTo(0.8, 5);
  });

  it('scales linearly between zero and the cap', () => {
    expect(lampBrightnessScalar(50)).toBeCloseTo(1.1, 5);
    expect(lampBrightnessScalar(-50)).toBeCloseTo(0.9, 5);
    expect(lampBrightnessScalar(25)).toBeCloseTo(1.05, 5);
  });

  it('clamps at the positive cap when total P&L exceeds +$100', () => {
    expect(lampBrightnessScalar(200)).toBeCloseTo(1.2, 5);
    expect(lampBrightnessScalar(10_000)).toBeCloseTo(1.2, 5);
  });

  it('clamps at the negative cap when total P&L exceeds -$100', () => {
    expect(lampBrightnessScalar(-200)).toBeCloseTo(0.8, 5);
    expect(lampBrightnessScalar(-10_000)).toBeCloseTo(0.8, 5);
  });

  it('returns 1.0 (baseline) for non-finite inputs (defensive)', () => {
    expect(lampBrightnessScalar(NaN)).toBe(1);
    expect(lampBrightnessScalar(Infinity)).toBe(1);
    expect(lampBrightnessScalar(-Infinity)).toBe(1);
  });
});
