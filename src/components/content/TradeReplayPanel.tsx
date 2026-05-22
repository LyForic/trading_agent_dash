import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatPnl } from '@/lib/formatting';
import type { TradeLogEntry } from '@/lib/types';

interface Props {
  row: TradeLogEntry;
}

interface ReplayPoint {
  elapsedMs: number;
  price: number;
}

interface ReplayModel {
  contractStart: Date;
  contractEnd: Date;
  durationMs: number;
  entryElapsedMs: number;
  entryPrice: number;
  finalPrice: number;
  targetPrice: number;
  points: ReplayPoint[];
}

const CHART = {
  width: 520,
  height: 240,
  padLeft: 52,
  padRight: 20,
  padTop: 20,
  padBottom: 38,
};

const SPEEDS = [1, 2, 4] as const;
const CONTRACT_DURATION_MS = 15 * 60 * 1000;
const REPLAY_BASE_DURATION_MS = 18000;

function seededNumber(seed: string) {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function parseStrike(ticker: string, seed: number) {
  const match = ticker.match(/B(\d{4,6})(?:\D|$)/);
  if (match) return Number(match[1]);
  return Math.round((66800 + seed * 1800) / 50) * 50;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function buildReplay(row: TradeLogEntry): ReplayModel {
  const seed = seededNumber(`${row.id}:${row.contract_ticker}`);
  const contractEnd = new Date(row.settled_at);
  const contractStart = new Date(contractEnd.getTime() - CONTRACT_DURATION_MS);
  const enteredAt = new Date(row.entered_at);
  const entryElapsedMs = clamp(enteredAt.getTime() - contractStart.getTime(), 0, CONTRACT_DURATION_MS);
  const targetPrice = parseStrike(row.contract_ticker, seed);
  const resultWon = row.pnl >= 0;
  const yesWins = row.side === 'yes' ? resultWon : !resultWon;
  const settlementDistance = 80 + Math.abs(row.pnl) * 18 + seed * 95;
  const finalPrice = targetPrice + (yesWins ? settlementDistance : -settlementDistance);
  const entryBias = row.side === 'yes' ? -1 : 1;
  const entryPrice = targetPrice + entryBias * (18 + seed * 46);
  const startPrice = targetPrice + (seed - 0.5) * 220;
  const points: ReplayPoint[] = [];

  for (let i = 0; i <= 60; i += 1) {
    const t = i / 60;
    const elapsedMs = t * CONTRACT_DURATION_MS;
    const trend = lerp(startPrice, finalPrice, t);
    const waveA = Math.sin((t * 5.4 + seed * 2.8) * Math.PI) * (54 + seed * 26);
    const waveB = Math.sin((t * 14.2 + seed * 8.5) * Math.PI) * (17 + seed * 14);
    const entryPull = Math.max(0, 1 - Math.abs(elapsedMs - entryElapsedMs) / 150000);
    const settlementPull = t ** 2.2;
    const price = lerp(trend + waveA + waveB, entryPrice, entryPull * 0.58);
    points.push({
      elapsedMs,
      price: lerp(price, finalPrice, settlementPull * 0.72),
    });
  }

  points[points.length - 1] = { elapsedMs: CONTRACT_DURATION_MS, price: finalPrice };

  return {
    contractStart,
    contractEnd,
    durationMs: CONTRACT_DURATION_MS,
    entryElapsedMs,
    entryPrice,
    finalPrice,
    targetPrice,
    points,
  };
}

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatPrice(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function pathFor(points: ReplayPoint[], xFor: (elapsedMs: number) => number, yFor: (price: number) => number) {
  if (points.length === 0) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(point.elapsedMs).toFixed(2)} ${yFor(point.price).toFixed(2)}`)
    .join(' ');
}

function interpolatePrice(points: ReplayPoint[], elapsedMs: number) {
  const nextIndex = points.findIndex((point) => point.elapsedMs >= elapsedMs);
  if (nextIndex <= 0) return points[0]?.price ?? 0;
  const prev = points[nextIndex - 1];
  const next = points[nextIndex];
  if (!next) return points[points.length - 1]?.price ?? 0;
  const span = next.elapsedMs - prev.elapsedMs;
  return lerp(prev.price, next.price, span === 0 ? 0 : (elapsedMs - prev.elapsedMs) / span);
}

export function TradeReplayPanel({ row }: Props) {
  const replay = useMemo(() => buildReplay(row), [row]);
  const [elapsedMs, setElapsedMs] = useState(replay.durationMs);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);

  useEffect(() => {
    if (!playing) return undefined;
    let frame = 0;
    let previous = performance.now();

    const step = (now: number) => {
      const delta = now - previous;
      previous = now;
      setElapsedMs((current) => {
        const timelineDelta = delta * speed * (replay.durationMs / REPLAY_BASE_DURATION_MS);
        const next = Math.min(replay.durationMs, current + timelineDelta);
        if (next >= replay.durationMs) setPlaying(false);
        return next;
      });
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [playing, replay.durationMs, speed]);

  const prices = replay.points.map((point) => point.price).concat([replay.targetPrice, replay.entryPrice, replay.finalPrice]);
  const minPrice = Math.min(...prices) - 70;
  const maxPrice = Math.max(...prices) + 70;
  const plotWidth = CHART.width - CHART.padLeft - CHART.padRight;
  const plotHeight = CHART.height - CHART.padTop - CHART.padBottom;
  const xFor = (elapsed: number) => CHART.padLeft + (elapsed / replay.durationMs) * plotWidth;
  const yFor = (price: number) => CHART.padTop + (1 - ((price - minPrice) / (maxPrice - minPrice))) * plotHeight;
  const fullPath = pathFor(replay.points, xFor, yFor);
  const activePoints = replay.points.filter((point) => point.elapsedMs <= elapsedMs);
  const activePrice = interpolatePrice(replay.points, elapsedMs);
  const activePath = pathFor(
    [...activePoints, { elapsedMs, price: activePrice }]
      .filter((point, index, list) => index === 0 || point.elapsedMs !== list[index - 1].elapsedMs),
    xFor,
    yFor,
  );
  const entryX = xFor(replay.entryElapsedMs);
  const finalX = xFor(replay.durationMs);
  const targetY = yFor(replay.targetPrice);
  const playheadX = xFor(elapsedMs);
  const playheadY = yFor(activePrice);
  const won = row.pnl >= 0;
  const resultLabel = won ? 'Win' : 'Loss';

  const toggleReplay = () => {
    setElapsedMs((current) => (current >= replay.durationMs ? 0 : current));
    setPlaying((current) => !current);
  };

  return (
    <div className="trade-replay-panel">
      <div className="trade-replay-head">
        <div>
          <span>{row.contract_ticker}</span>
          <strong>{resultLabel} {formatPnl(row.pnl)}</strong>
        </div>
        <div className="trade-replay-timebox">
          Modeled replay · {formatClock(replay.contractStart)}-{formatClock(replay.contractEnd)}
        </div>
      </div>

      <div className="trade-replay-chart" aria-label="15 minute trade replay chart">
        <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img">
          <rect x={CHART.padLeft} y={CHART.padTop} width={plotWidth} height={plotHeight} rx="4" />
          <line className="trade-replay-grid-line" x1={CHART.padLeft} x2={CHART.width - CHART.padRight} y1={targetY} y2={targetY} />
          <text className="trade-replay-axis-label" x={CHART.padLeft - 8} y={targetY + 4} textAnchor="end">Target</text>
          <path className="trade-replay-full-path" d={fullPath} />
          <path className={won ? 'trade-replay-active-path trade-replay-active-path--gain' : 'trade-replay-active-path trade-replay-active-path--loss'} d={activePath} />
          <line className="trade-replay-entry-line" x1={entryX} x2={entryX} y1={CHART.padTop} y2={CHART.height - CHART.padBottom} />
          <line className="trade-replay-final-line" x1={finalX} x2={finalX} y1={CHART.padTop} y2={CHART.height - CHART.padBottom} />
          <line className="trade-replay-playhead" x1={playheadX} x2={playheadX} y1={CHART.padTop} y2={CHART.height - CHART.padBottom} />
          <circle className="trade-replay-marker trade-replay-marker--entry" cx={entryX} cy={yFor(replay.entryPrice)} r="5" />
          <circle className={won ? 'trade-replay-marker trade-replay-marker--gain' : 'trade-replay-marker trade-replay-marker--loss'} cx={finalX} cy={yFor(replay.finalPrice)} r="5" />
          <circle className="trade-replay-marker trade-replay-marker--live" cx={playheadX} cy={playheadY} r="4" />
          <text className="trade-replay-axis-label" x={entryX + 6} y={CHART.padTop + 13}>Entry</text>
          <text className="trade-replay-axis-label" x={finalX - 6} y={CHART.padTop + 13} textAnchor="end">Settle</text>
          <text className="trade-replay-axis-label" x={CHART.padLeft} y={CHART.height - 12}>0:00</text>
          <text className="trade-replay-axis-label" x={CHART.width - CHART.padRight} y={CHART.height - 12} textAnchor="end">15:00</text>
        </svg>
      </div>

      <div className="trade-replay-readout">
        <span>{formatElapsed(elapsedMs)}</span>
        <strong>{formatPrice(activePrice)}</strong>
        <span>{row.side.toUpperCase()} {row.entry_price_cents}¢{' -> '}{row.settle_price_cents}¢</span>
      </div>

      <div className="trade-replay-controls">
        <button type="button" onClick={toggleReplay} aria-label={playing ? 'Pause replay' : 'Play replay'}>
          {playing ? <Pause size={14} aria-hidden /> : <Play size={14} aria-hidden />}
        </button>
        <button
          type="button"
          onClick={() => {
            setElapsedMs(0);
            setPlaying(false);
          }}
          aria-label="Restart replay"
        >
          <RotateCcw size={14} aria-hidden />
        </button>
        <input
          aria-label="Replay timeline"
          type="range"
          min="0"
          max={replay.durationMs}
          step="1000"
          value={Math.round(elapsedMs)}
          onChange={(event) => {
            setElapsedMs(Number(event.currentTarget.value));
            setPlaying(false);
          }}
        />
        <div className="trade-replay-speed" aria-label="Replay speed">
          {SPEEDS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              className={speed === candidate ? 'trade-replay-speed-button trade-replay-speed-button--active' : 'trade-replay-speed-button'}
              onClick={() => setSpeed(candidate)}
            >
              {candidate}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
