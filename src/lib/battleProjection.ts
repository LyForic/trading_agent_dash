import type { OpenPosition } from './types';

export type BattleDirection = 'left' | 'center' | 'right';

export interface BattleMomentum {
  deltaCents: number;
  favorsAgent: boolean;
  direction: BattleDirection;
  magnitude: number;
}

export interface BattlePreview {
  currentPriceCents: number;
  sparkline: number[];
  generatedAt: string;
}

export function clampPriceCents(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(99, Math.round(value)));
}

export function battleMomentum(
  entryPriceCents: number,
  currentPriceCents: number,
  side: OpenPosition['side'],
): BattleMomentum {
  const entry = clampPriceCents(entryPriceCents);
  const current = clampPriceCents(currentPriceCents);
  const deltaCents = current - entry;
  if (deltaCents === 0) {
    return { deltaCents, favorsAgent: false, direction: 'center', magnitude: 0 };
  }

  const favorsAgent = side === 'yes' ? deltaCents > 0 : deltaCents < 0;
  return {
    deltaCents,
    favorsAgent,
    direction: favorsAgent ? 'right' : 'left',
    magnitude: Math.min(Math.abs(deltaCents) / 50, 1),
  };
}

function tickerSeed(ticker: string): number {
  let seed = 0;
  for (let i = 0; i < ticker.length; i += 1) {
    seed = (seed * 31 + ticker.charCodeAt(i)) % 9973;
  }
  return seed;
}

function previewPriceAt(open: OpenPosition, minuteBucket: number): number {
  const seed = tickerSeed(open.contract_ticker);
  const phase = seed / 37;
  const trend = Math.sin(minuteBucket / 7 + phase) * 7;
  const chop = Math.sin(minuteBucket / 2.7 + phase / 3) * 3;
  const sideBias = open.side === 'yes' ? 1.2 : -1.2;
  const entryPrice = clampPriceCents(open.entry_price_cents ?? 1);
  return clampPriceCents(entryPrice + trend + chop + sideBias);
}

export function buildBattlePreview(open: OpenPosition, now = new Date()): BattlePreview {
  const minuteBucket = Math.floor(now.getTime() / 60_000);
  const sparkline = Array.from({ length: 18 }, (_, index) =>
    previewPriceAt(open, minuteBucket - (17 - index) * 2),
  );

  return {
    currentPriceCents: sparkline[sparkline.length - 1],
    sparkline,
    generatedAt: now.toISOString(),
  };
}
