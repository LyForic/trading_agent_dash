import type { Agent } from '@/lib/types';
import type { AgentCardViewModel } from '@/lib/useAgentData';
import { AgentAvatar } from './AgentAvatar';
import { formatPnl, formatWinRate } from '@/lib/formatting';

interface Props {
  agent: Agent;
  /**
   * Per-agent windowed view model. P&L and WR shown on the collapsed row reflect
   * the user's selected time window (24h / 7d / Lifetime), so toggling the pill
   * in the expanded body updates the collapsed-row stats too. `agent.state`,
   * name, and sprite stay lifetime-locked.
   */
  cardViewModel: AgentCardViewModel;
}

/**
 * Pill-free version of the collapsed summary row. Lives INSIDE the summary
 * <button>; the InBattlePill renders as a sibling of that button (see
 * AgentCard) so neither nests inside the other.
 */
export function AgentCardCollapsedRowInner({ agent, cardViewModel }: Props) {
  const isArrivingSoon = agent.state === 'arriving_soon';
  const isGain = cardViewModel.total_pnl >= 0;

  return (
    <div className="agent-card-summary">
      <AgentAvatar id={agent.id} name={agent.name} spriteUrl={agent.sprite_url} size={48} />
      <div className="agent-card-identity">
        <div className="agent-card-title-row">
          <span className="agent-card-name">{agent.name}</span>
          {isArrivingSoon && (
            <span className="agent-badge">
              Arriving soon
            </span>
          )}
        </div>
        <div className="agent-card-subtitle">{agent.nickname}</div>
      </div>
      {!isArrivingSoon && (
        <div className="agent-card-metrics">
          <div
            className="agent-card-pnl tabular-nums"
            style={{ color: isGain ? 'var(--color-gain)' : 'var(--color-loss)' }}
          >
            {formatPnl(cardViewModel.total_pnl)}
          </div>
          <div className="agent-card-wr tabular-nums">
            {formatWinRate(cardViewModel.record.W, cardViewModel.record.settled)} WR
          </div>
        </div>
      )}
    </div>
  );
}
