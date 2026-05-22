import { contractEndForReplay } from './kalshiContracts';
import type { TradeLogEntry } from './types';

export interface ReplayPoint {
  elapsedMs: number;
  yesProbability: number;
}

export interface ReplayModel {
  contractStart: Date;
  contractEnd: Date;
  durationMs: number;
  entryElapsedMs: number;
  entryYesProbability: number;
  finalYesProbability: number;
  points: ReplayPoint[];
  sourceLabel: string;
}

const CONTRACT_DURATION_MS = 15 * 60 * 1000;

function seededNumber(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function sideProbabilityToYes(row: TradeLogEntry, sideProbability: number) {
  return row.side === 'yes' ? sideProbability : 100 - sideProbability;
}

function normalizePoints(points: ReplayPoint[]) {
  return points
    .sort((a, b) => a.elapsedMs - b.elapsedMs)
    .reduce<ReplayPoint[]>((acc, point) => {
      const previous = acc[acc.length - 1];
      if (previous && Math.abs(previous.elapsedMs - point.elapsedMs) < 1) {
        acc[acc.length - 1] = point;
      } else {
        acc.push(point);
      }
      return acc;
    }, []);
}

export function buildReplay(row: TradeLogEntry): ReplayModel {
  const settledAt = new Date(row.settled_at);
  const contractEnd = contractEndForReplay(row.contract_ticker, settledAt);
  const contractStart = new Date(contractEnd.getTime() - CONTRACT_DURATION_MS);
  const enteredAt = new Date(row.entered_at);
  const entryElapsedMs = clamp(enteredAt.getTime() - contractStart.getTime(), 0, CONTRACT_DURATION_MS);
  const entryYesProbability = sideProbabilityToYes(row, clamp(row.entry_price_cents, 1, 99));
  const finalYesProbability = sideProbabilityToYes(row, clamp(row.settle_price_cents, 0, 100));

  if (row.replay_ticks && row.replay_ticks.length >= 2) {
    const tickPoints = row.replay_ticks.map((tick) => ({
      elapsedMs: clamp(new Date(tick.captured_at).getTime() - contractStart.getTime(), 0, CONTRACT_DURATION_MS),
      yesProbability: clamp(tick.yes_price_cents, 0, 100),
    }));
    const points = normalizePoints([
      { elapsedMs: entryElapsedMs, yesProbability: entryYesProbability },
      ...tickPoints,
      { elapsedMs: CONTRACT_DURATION_MS, yesProbability: finalYesProbability },
    ]);

    return {
      contractStart,
      contractEnd,
      durationMs: CONTRACT_DURATION_MS,
      entryElapsedMs,
      entryYesProbability,
      finalYesProbability,
      points,
      sourceLabel: 'Market ticks',
    };
  }

  const seed = seededNumber(`${row.id}:${row.contract_ticker}`);
  const startYesProbability = clamp(entryYesProbability + (seed - 0.5) * 28, 8, 92);
  const rawPoints: ReplayPoint[] = [];

  for (let i = 0; i <= 72; i += 1) {
    const t = i / 72;
    const elapsedMs = t * CONTRACT_DURATION_MS;
    const beforeEntry = elapsedMs <= entryElapsedMs;
    const localT = beforeEntry
      ? (entryElapsedMs === 0 ? 1 : elapsedMs / entryElapsedMs)
      : (elapsedMs - entryElapsedMs) / Math.max(1, CONTRACT_DURATION_MS - entryElapsedMs);
    const anchor = beforeEntry
      ? lerp(startYesProbability, entryYesProbability, smoothstep(localT))
      : lerp(entryYesProbability, finalYesProbability, smoothstep(localT));
    const entryPull = Math.max(0, 1 - Math.abs(elapsedMs - entryElapsedMs) / 92000);
    const settlePull = Math.max(0, 1 - (CONTRACT_DURATION_MS - elapsedMs) / 88000);
    const volatility = (1 - entryPull * 0.82 - settlePull * 0.72) * (4.8 + seed * 5.2);
    const waveA = Math.sin((t * 6.2 + seed * 2.4) * Math.PI) * volatility;
    const waveB = Math.sin((t * 18.5 + seed * 8.1) * Math.PI) * volatility * 0.42;

    rawPoints.push({
      elapsedMs,
      yesProbability: clamp(anchor + waveA + waveB, 2, 98),
    });
  }

  rawPoints.push({ elapsedMs: entryElapsedMs, yesProbability: entryYesProbability });
  rawPoints.push({ elapsedMs: CONTRACT_DURATION_MS, yesProbability: finalYesProbability });

  const points = normalizePoints(rawPoints);

  return {
    contractStart,
    contractEnd,
    durationMs: CONTRACT_DURATION_MS,
    entryElapsedMs,
    entryYesProbability,
    finalYesProbability,
    points,
    sourceLabel: 'Modeled',
  };
}
