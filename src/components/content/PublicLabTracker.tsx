import { CalendarDays, ChartNoAxesCombined, FlaskConical, Minimize2, ReceiptText } from 'lucide-react';
import { formatPnl } from '@/lib/formatting';
import { PUBLIC_LAB_STARTING_BANKROLL_CENTS, publicLabDay } from '@/lib/publicLab';
import type { AgentId, TradeLogEntry } from '@/lib/types';

interface LabMove {
  agentId: AgentId;
  trade: TradeLogEntry;
}

interface Props {
  currentBalanceCents: number | null;
  lifetimePnlCents: number | null;
  largestSettledTrade: LabMove | null;
  asOfLabel: string;
  lesson: string;
  lessonSource: string;
  tomorrowWatch: string;
  latestDateKey: string;
  selectedDateKey: string;
  onOpenSettledTrade: (agentId: AgentId, trade: TradeLogEntry) => void;
  labDate?: Date;
  dateLabel?: string;
  onOpenChart?: () => void;
  onOpenCalendar?: () => void;
  onMinimize?: () => void;
}

function formatDollars(cents: number | null) {
  if (cents === null || !Number.isFinite(cents)) return 'Pending';
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedDollars(cents: number | null) {
  if (cents === null || !Number.isFinite(cents)) return 'Pending';
  const sign = cents >= 0 ? '+' : '-';
  return `${sign}${formatDollars(Math.abs(cents))}`;
}

function settledTradeCopy(move: LabMove | null) {
  if (!move) return 'No settled trade yet';
  return `${move.agentId.toUpperCase()} ${formatPnl(move.trade.pnl)}`;
}

export function PublicLabTracker({
  currentBalanceCents,
  lifetimePnlCents,
  largestSettledTrade,
  asOfLabel,
  lesson,
  lessonSource,
  tomorrowWatch,
  latestDateKey,
  selectedDateKey,
  onOpenSettledTrade,
  labDate,
  dateLabel,
  onOpenChart,
  onOpenCalendar,
  onMinimize,
}: Props) {
  const day = publicLabDay(labDate);
  const isLatest = selectedDateKey === latestDateKey;
  const lessonEyebrow = isLatest ? "Today's lesson" : `Day ${day} lesson`;
  const lessonHeading = isLatest
    ? lessonSource
    : lessonSource.includes('field note')
      ? lessonSource
      : 'Lesson from this snapshot';
  const watchEyebrow = isLatest ? 'Tomorrow watch' : 'Next watch from that day';
  const dayHeading = isLatest
    ? `Day ${day} of the $10K public agent account`
    : `Day ${day} snapshot`;

  return (
    <section className="public-lab-tracker" aria-label="Public lab tracker">
      <div className="public-lab-tracker__head">
        <div>
          <span>{dateLabel ? `Public Lab / ${dateLabel}` : 'Public Lab'}</span>
          <h1>{dayHeading}</h1>
          <p className="public-lab-tracker__as-of">{asOfLabel}</p>
        </div>
        <div className="public-lab-tracker__head-actions">
          <FlaskConical size={20} aria-hidden />
          {onOpenCalendar && (
            <button type="button" onClick={onOpenCalendar} aria-label="Open public lab calendar">
              <CalendarDays size={14} aria-hidden />
            </button>
          )}
          {onMinimize && (
            <button type="button" onClick={onMinimize} aria-label="Minimize public lab tracker">
              <Minimize2 size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div className="public-lab-tracker__grid">
        <div>
          <span>Start</span>
          <strong>{formatDollars(PUBLIC_LAB_STARTING_BANKROLL_CENTS)}</strong>
        </div>
        <div>
          <span>Now</span>
          <strong>{formatDollars(currentBalanceCents)}</strong>
        </div>
        <div>
          <span>Life P&L</span>
          <strong className={(lifetimePnlCents ?? 0) >= 0 ? 'world-v2-gain' : 'world-v2-loss'}>
            {formatSignedDollars(lifetimePnlCents)}
          </strong>
        </div>
      </div>

      <div className="public-lab-tracker__narrative">
        <section aria-label={lessonEyebrow}>
          <span>{lessonEyebrow}</span>
          <strong>{lessonHeading}</strong>
          <p>{lesson}</p>
        </section>
        <section aria-label={watchEyebrow}>
          <span>{watchEyebrow}</span>
          <p>{tomorrowWatch}</p>
        </section>
      </div>

      {onOpenChart && (
        <button type="button" className="public-lab-tracker__chart-link" onClick={onOpenChart}>
          <ChartNoAxesCombined size={15} aria-hidden />
          <span>View account chart</span>
        </button>
      )}

      <div className="public-lab-tracker__moves">
        <button
          type="button"
          disabled={!largestSettledTrade}
          onClick={() => largestSettledTrade && onOpenSettledTrade(largestSettledTrade.agentId, largestSettledTrade.trade)}
        >
          <ReceiptText size={15} aria-hidden />
          <span>Largest Settled Trade · 24h</span>
          <strong>{settledTradeCopy(largestSettledTrade)}</strong>
        </button>
      </div>
    </section>
  );
}
