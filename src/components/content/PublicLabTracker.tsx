import { FlaskConical, TrendingDown, TrendingUp, Users } from 'lucide-react';
import { formatPnl } from '@/lib/formatting';
import {
  PUBLIC_LAB_EXPERIMENT,
  PUBLIC_LAB_OPEN_QUESTION,
  PUBLIC_LAB_STARTING_BANKROLL_CENTS,
  publicLabDay,
} from '@/lib/publicLab';
import type { AgentId, BnfPortfolioPoint, TradeLogEntry } from '@/lib/types';

interface LabMove {
  agentId: AgentId;
  trade: TradeLogEntry;
}

interface Props {
  currentBalanceCents: number | null;
  change24hCents: number | null;
  lifetimePnlCents: number | null;
  agentCount: number;
  biggestMove: LabMove | null;
  accountHighCents: number | null;
  biggestDrawdownCents: number | null;
  bestAgentName: string | null;
  onOpenAgent: (agentId: AgentId) => void;
  points: BnfPortfolioPoint[];
}

function formatDollars(cents: number | null) {
  if (cents === null || !Number.isFinite(cents)) return 'Pending';
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
}

function formatSignedDollars(cents: number | null) {
  if (cents === null || !Number.isFinite(cents)) return 'Pending';
  return formatPnl(cents / 100);
}

function moveCopy(move: LabMove | null) {
  if (!move) return 'No settled move yet';
  return `${move.agentId.toUpperCase()} ${formatPnl(move.trade.pnl)}`;
}

export function PublicLabTracker({
  currentBalanceCents,
  change24hCents,
  lifetimePnlCents,
  agentCount,
  biggestMove,
  accountHighCents,
  biggestDrawdownCents,
  bestAgentName,
  onOpenAgent,
  points,
}: Props) {
  const day = publicLabDay();
  const latestPoint = points[points.length - 1];

  return (
    <section className="public-lab-tracker" aria-label="Public lab tracker">
      <div className="public-lab-tracker__head">
        <div>
          <span>Public Lab</span>
          <h1>Day {day}: real agents, real trades.</h1>
        </div>
        <FlaskConical size={20} aria-hidden />
      </div>

      <p className="public-lab-tracker__statement">{PUBLIC_LAB_EXPERIMENT}</p>

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
          <span>24h</span>
          <strong className={(change24hCents ?? 0) >= 0 ? 'world-v2-gain' : 'world-v2-loss'}>
            {formatSignedDollars(change24hCents)}
          </strong>
        </div>
        <div>
          <span>Life P&L</span>
          <strong className={(lifetimePnlCents ?? 0) >= 0 ? 'world-v2-gain' : 'world-v2-loss'}>
            {formatSignedDollars(lifetimePnlCents)}
          </strong>
        </div>
      </div>

      <div className="public-lab-tracker__moves">
        <button type="button" onClick={() => biggestMove && onOpenAgent(biggestMove.agentId)}>
          <TrendingUp size={15} aria-hidden />
          <span>Biggest move</span>
          <strong>{moveCopy(biggestMove)}</strong>
        </button>
        <div>
          <Users size={15} aria-hidden />
          <span>{agentCount} live agents</span>
        </div>
      </div>

      <div className="public-lab-tracker__season" aria-label="Season milestones">
        <div>
          <span>Account high</span>
          <strong>{formatDollars(accountHighCents)}</strong>
        </div>
        <div>
          <span>Biggest drawdown</span>
          <strong className="world-v2-loss">
            {biggestDrawdownCents === null ? 'Pending' : formatSignedDollars(-Math.abs(biggestDrawdownCents))}
          </strong>
        </div>
        <div>
          <span>Best agent</span>
          <strong>{bestAgentName ?? 'Pending'}</strong>
        </div>
      </div>

      <div className="public-lab-tracker__question">
        <TrendingDown size={14} aria-hidden />
        <span>{latestPoint?.is_partial ? 'Partial data today.' : PUBLIC_LAB_OPEN_QUESTION}</span>
      </div>
    </section>
  );
}
