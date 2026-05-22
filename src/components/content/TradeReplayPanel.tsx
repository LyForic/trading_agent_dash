import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatPnl } from '@/lib/formatting';
import type { TradeLogEntry } from '@/lib/types';

interface Props {
  row: TradeLogEntry;
}

interface ReplayPoint {
  elapsedMs: number;
  yesProbability: number;
}

interface ReplayModel {
  contractStart: Date;
  contractEnd: Date;
  durationMs: number;
  entryElapsedMs: number;
  entryYesProbability: number;
  finalYesProbability: number;
  points: ReplayPoint[];
  sourceLabel: string;
}

const CHART = {
  width: 600,
  height: 278,
  padLeft: 34,
  padRight: 140,
  padTop: 22,
  padBottom: 34,
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

function buildReplay(row: TradeLogEntry): ReplayModel {
  const contractEnd = new Date(row.settled_at);
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

function formatClock(date: Date) {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatElapsed(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatMoney(value: number) {
  return `$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedMoney(value: number) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number) {
  const sign = value > 0 ? '+' : value < 0 ? '-' : '';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

function formatProbability(value: number) {
  return `${Math.round(value)}%`;
}

function pathFor(
  points: ReplayPoint[],
  xFor: (elapsedMs: number) => number,
  yFor: (probability: number) => number,
  probabilityFor: (point: ReplayPoint) => number,
) {
  if (points.length === 0) return '';
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(point.elapsedMs).toFixed(2)} ${yFor(probabilityFor(point)).toFixed(2)}`)
    .join(' ');
}

function interpolateYesProbability(points: ReplayPoint[], elapsedMs: number) {
  const nextIndex = points.findIndex((point) => point.elapsedMs >= elapsedMs);
  if (nextIndex <= 0) return points[0]?.yesProbability ?? 50;
  const prev = points[nextIndex - 1];
  const next = points[nextIndex];
  if (!next) return points[points.length - 1]?.yesProbability ?? 50;
  const span = next.elapsedMs - prev.elapsedMs;
  return lerp(prev.yesProbability, next.yesProbability, span === 0 ? 0 : (elapsedMs - prev.elapsedMs) / span);
}

function segmentPoints(points: ReplayPoint[], elapsedMs: number, activeYesProbability: number) {
  return [...points.filter((point) => point.elapsedMs <= elapsedMs), { elapsedMs, yesProbability: activeYesProbability }]
    .filter((point, index, list) => index === 0 || point.elapsedMs !== list[index - 1].elapsedMs);
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

  const plotWidth = CHART.width - CHART.padLeft - CHART.padRight;
  const plotHeight = CHART.height - CHART.padTop - CHART.padBottom;
  const xFor = (elapsed: number) => CHART.padLeft + (elapsed / replay.durationMs) * plotWidth;
  const yFor = (probability: number) => CHART.padTop + (1 - probability / 100) * plotHeight;
  const yesPath = pathFor(replay.points, xFor, yFor, (point) => point.yesProbability);
  const noPath = pathFor(replay.points, xFor, yFor, (point) => 100 - point.yesProbability);
  const activeYesProbability = interpolateYesProbability(replay.points, elapsedMs);
  const activeNoProbability = 100 - activeYesProbability;
  const activePoints = segmentPoints(replay.points, elapsedMs, activeYesProbability);
  const activeYesPath = pathFor(activePoints, xFor, yFor, (point) => point.yesProbability);
  const activeNoPath = pathFor(activePoints, xFor, yFor, (point) => 100 - point.yesProbability);
  const entryX = xFor(replay.entryElapsedMs);
  const playheadX = xFor(elapsedMs);
  const activeSideProbability = row.side === 'yes' ? activeYesProbability : activeNoProbability;
  const entrySideProbability = row.entry_price_cents;
  const currentValue = (activeSideProbability / 100) * row.size;
  const initialValue = (entrySideProbability / 100) * row.size;
  const valueChange = currentValue - initialValue;
  const probabilityMove = activeSideProbability - entrySideProbability;
  const pctMove = entrySideProbability === 0 ? 0 : (probabilityMove / entrySideProbability) * 100;
  const isUpFromEntry = valueChange >= 0;
  const labelY = {
    yes: CHART.padTop + 54,
    no: CHART.height - CHART.padBottom - 58,
  };
  const labelX = CHART.width - CHART.padRight + 20;
  const won = row.pnl >= 0;

  const toggleReplay = () => {
    setElapsedMs((current) => (current >= replay.durationMs ? 0 : current));
    setPlaying((current) => !current);
  };

  return (
    <div className="trade-replay-panel">
      <div className="trade-replay-head">
        <div>
          <span>{row.contract_ticker}</span>
          <strong>{row.side.toUpperCase()} probability replay</strong>
        </div>
        <div className="trade-replay-timebox">
          {replay.sourceLabel} · {formatClock(replay.contractStart)}-{formatClock(replay.contractEnd)}
        </div>
      </div>

      <div className="trade-replay-chart" aria-label="15 minute trade replay chart showing probabilities">
        <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img">
          <rect x={CHART.padLeft} y={CHART.padTop} width={plotWidth} height={plotHeight} rx="4" />
          <line className="trade-replay-grid-line" x1={CHART.padLeft} x2={CHART.width - CHART.padRight} y1={yFor(50)} y2={yFor(50)} />
          <text className="trade-replay-axis-label" x={CHART.padLeft - 8} y={yFor(100) + 4} textAnchor="end">100</text>
          <text className="trade-replay-axis-label" x={CHART.padLeft - 8} y={yFor(50) + 4} textAnchor="end">50</text>
          <text className="trade-replay-axis-label" x={CHART.padLeft - 8} y={yFor(0) + 4} textAnchor="end">0</text>
          <path className="trade-replay-probability-path trade-replay-probability-path--muted" d={yesPath} />
          <path className="trade-replay-probability-path trade-replay-probability-path--muted" d={noPath} />
          <path className="trade-replay-probability-path trade-replay-probability-path--yes" d={activeYesPath} />
          <path className="trade-replay-probability-path trade-replay-probability-path--no" d={activeNoPath} />
          <line className="trade-replay-entry-line" x1={entryX} x2={entryX} y1={CHART.padTop} y2={CHART.height - CHART.padBottom} />
          <line className="trade-replay-playhead" x1={playheadX} x2={playheadX} y1={CHART.padTop} y2={CHART.height - CHART.padBottom} />
          <circle className="trade-replay-marker trade-replay-marker--entry" cx={entryX} cy={yFor(replay.entryYesProbability)} r="4.5" />
          <circle className="trade-replay-marker trade-replay-marker--yes" cx={playheadX} cy={yFor(activeYesProbability)} r="4.5" />
          <circle className="trade-replay-marker trade-replay-marker--no" cx={playheadX} cy={yFor(activeNoProbability)} r="4.5" />
          <text className="trade-replay-axis-label" x={entryX + 6} y={CHART.padTop + 13}>Entry</text>
          <text className="trade-replay-axis-label" x={CHART.padLeft} y={CHART.height - 10}>0:00</text>
          <text className="trade-replay-axis-label" x={CHART.width - CHART.padRight} y={CHART.height - 10} textAnchor="end">15:00</text>
          <text className="trade-replay-side-name trade-replay-side-name--yes" x={labelX} y={labelY.yes}>YES</text>
          <text className="trade-replay-side-percent trade-replay-side-percent--yes" x={labelX} y={labelY.yes + 34}>{formatProbability(activeYesProbability)}</text>
          <text className="trade-replay-side-name trade-replay-side-name--no" x={labelX} y={labelY.no}>NO</text>
          <text className="trade-replay-side-percent trade-replay-side-percent--no" x={labelX} y={labelY.no + 34}>{formatProbability(activeNoProbability)}</text>
        </svg>
      </div>

      <div className="trade-replay-readout">
        <span>{formatElapsed(elapsedMs)}</span>
        <strong className={isUpFromEntry ? 'trade-replay-readout--gain' : 'trade-replay-readout--loss'}>
          {formatSignedMoney(valueChange)}
        </strong>
        <span>{formatPercent(pctMove)} from {row.side.toUpperCase()} entry</span>
      </div>

      <div className="trade-replay-value-grid">
        <div>
          <span>Held side</span>
          <strong>{row.side.toUpperCase()} {formatProbability(activeSideProbability)}</strong>
        </div>
        <div>
          <span>Contract value</span>
          <strong>{formatMoney(currentValue)}</strong>
        </div>
        <div>
          <span>Entry</span>
          <strong>{row.entry_price_cents}% · {formatMoney(initialValue)}</strong>
        </div>
        <div>
          <span>Settled</span>
          <strong className={won ? 'trade-replay-readout--gain' : 'trade-replay-readout--loss'}>
            {row.settle_price_cents}% · {formatPnl(row.pnl)}
          </strong>
        </div>
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
