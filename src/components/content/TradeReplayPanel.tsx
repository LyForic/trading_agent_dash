import { Link, Pause, Play, RotateCcw, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatPnl } from '@/lib/formatting';
import { buildReplay } from '@/lib/tradeReplay';
import type { ReplayPoint } from '@/lib/tradeReplay';
import type { TradeLogEntry } from '@/lib/types';

interface Props {
  row: TradeLogEntry;
  captureMode?: boolean;
  captureLink?: string;
  onCaptureModeChange?: (enabled: boolean) => void;
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
const REPLAY_BASE_DURATION_MS = 18000;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
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

export function TradeReplayPanel({ row, captureMode = false, captureLink, onCaptureModeChange }: Props) {
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
    <div className={captureMode ? 'trade-replay-panel trade-replay-panel--capture' : 'trade-replay-panel'}>
      <div className="trade-replay-head">
        <div>
          <span>{row.contract_ticker}</span>
          <strong>{row.side.toUpperCase()} probability replay</strong>
        </div>
        {onCaptureModeChange && (
          <button
            type="button"
            className={captureMode ? 'trade-replay-capture-toggle trade-replay-capture-toggle--active' : 'trade-replay-capture-toggle'}
            onClick={() => onCaptureModeChange(!captureMode)}
            aria-pressed={captureMode}
            aria-label={captureMode ? 'Exit vertical capture mode' : 'Open vertical capture mode'}
          >
            <Smartphone size={13} aria-hidden />
            <span>9:16</span>
          </button>
        )}
        {captureMode && captureLink && (
          <button
            type="button"
            className="trade-replay-capture-toggle"
            onClick={() => {
              void navigator.clipboard?.writeText(captureLink);
            }}
            aria-label="Copy capture link"
          >
            <Link size={13} aria-hidden />
            <span>Copy link</span>
          </button>
        )}
        <div className="trade-replay-timebox">
          {replay.sourceLabel} · {formatClock(replay.contractStart)}-{formatClock(replay.contractEnd)}
        </div>
      </div>

      {captureMode && (
        <div className="trade-replay-capture-caption">
          <span>BNF Public Lab</span>
          <strong>{row.side.toUpperCase()} moved {formatPercent(pctMove)} from entry</strong>
        </div>
      )}

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

      {captureMode ? (
        <div className="trade-replay-value-grid">
          <div>
            <span>Entry</span>
            <strong>{row.entry_price_cents}% · {formatMoney(initialValue)}</strong>
          </div>
          <div>
            <span>Settlement</span>
            <strong>{row.settle_price_cents}%</strong>
          </div>
          <div>
            <span>P&L</span>
            <strong className={won ? 'trade-replay-readout--gain' : 'trade-replay-readout--loss'}>{formatPnl(row.pnl)}</strong>
          </div>
        </div>
      ) : (
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
      )}

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
