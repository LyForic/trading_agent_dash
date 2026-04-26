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
    <div className="flex items-center gap-3 p-3">
      <AgentAvatar id={agent.id} name={agent.name} spriteUrl={agent.sprite_url} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline flex-wrap gap-2">
          <span
            className="text-base font-medium"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {agent.name}
          </span>
          {isArrivingSoon && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-border-default) 40%, transparent)',
                color: 'var(--color-ink-muted)',
              }}
            >
              Arriving soon
            </span>
          )}
        </div>
        <div
          className="text-xs truncate"
          style={{ color: 'var(--color-ink-muted)' }}
        >
          {agent.nickname}
        </div>
      </div>
      {!isArrivingSoon && (
        <div className="text-right">
          <div
            className="text-lg font-medium tabular-nums"
            style={{ color: isGain ? 'var(--color-gain)' : 'var(--color-loss)' }}
          >
            {formatPnl(cardViewModel.total_pnl)}
          </div>
          <div
            className="text-[11px] tabular-nums"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            {formatWinRate(cardViewModel.record.W, cardViewModel.record.settled)} WR
          </div>
        </div>
      )}
    </div>
  );
}
