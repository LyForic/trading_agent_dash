import { describe, it, expect } from 'vitest';
import { hourToMode } from '@/lib/timeOfDay';

describe('hourToMode', () => {
  it('returns daytime for 6am through 4:59pm', () => {
    expect(hourToMode(6)).toBe('daytime');
    expect(hourToMode(12)).toBe('daytime');
    expect(hourToMode(16)).toBe('daytime');
  });

  it('returns dusk for 5pm through 9:59pm', () => {
    expect(hourToMode(17)).toBe('dusk');
    expect(hourToMode(19)).toBe('dusk');
    expect(hourToMode(21)).toBe('dusk');
  });

  it('returns moonlit for 10pm through 5:59am', () => {
    expect(hourToMode(22)).toBe('moonlit');
    expect(hourToMode(0)).toBe('moonlit');
    expect(hourToMode(3)).toBe('moonlit');
    expect(hourToMode(5)).toBe('moonlit');
  });
});
