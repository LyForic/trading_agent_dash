import type { Agent, PerformanceWindow } from '@/lib/types';
import type { AgentCardViewModel } from '@/lib/useAgentData';
import { AgentCardCollapsedRowInner } from './AgentCardCollapsedRowInner';
import { AgentCardExpandedBody } from './AgentCardExpandedBody';
import { InBattlePill } from './InBattlePill';

interface Props {
  agent: Agent;
  expanded: boolean;
  onToggle: () => void;
  /** Per-agent time window controlling stats + trade log. Threaded down to the expanded body. */
  currentWindow: PerformanceWindow;
  setWindow: (w: PerformanceWindow) => void;
  /** Per-agent view model (stats + trade log) keyed off currentWindow. */
  cardViewModel: AgentCardViewModel;
  /** Opens the Battle Arena V1.1 bottom sheet for delayed-visible open positions. */
  onBattleTap?: () => void;
}

/**
 * AgentCard — the atomic unit of the roster.
 *
 * Tree shape (post-Track-B): the summary <button> and the InBattlePill are
 * SIBLINGS inside an `agent-card-row` flex container, so neither nests inside
 * the other. This fixes the prior nested-<button> HTML invalidity.
 */
export function AgentCard({
  agent,
  expanded,
  onToggle,
  currentWindow,
  setWindow,
  cardViewModel,
  onBattleTap,
}: Props) {
  const canExpand = agent.state !== 'arriving_soon';
  const expandedBodyId = `agent-${agent.id}-expanded`;

  return (
    <article
      className="rounded-2xl border"
      style={{
        backgroundColor: 'var(--color-paper)',
        borderColor: 'var(--color-border-default)',
        boxShadow: '0 4px 12px rgba(62, 53, 41, 0.15)',
        color: 'var(--color-ink)',
      }}
    >
      <div className="agent-card-row" style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
        <button
          type="button"
          onClick={() => { if (canExpand) onToggle(); }}
          className="agent-card-summary-btn flex-1 text-left focus:outline-2 focus:outline-offset-[-2px] rounded-2xl"
          style={{
            outlineColor: `var(--color-${agent.id})`,
            cursor: canExpand ? 'pointer' : 'default',
          }}
          aria-expanded={canExpand ? expanded : undefined}
          aria-controls={canExpand ? expandedBodyId : undefined}
          aria-label={
            canExpand
              ? `${expanded ? 'Collapse' : 'Expand'} ${agent.name}'s card`
              : `${agent.name}: arriving soon`
          }
        >
          <AgentCardCollapsedRowInner agent={agent} cardViewModel={cardViewModel} />
        </button>
        {agent.open_position && (
          <InBattlePill
            agentId={agent.id}
            agentName={agent.name}
            settlesAt={agent.open_position.settles_at}
            onTap={onBattleTap}
          />
        )}
      </div>
      {expanded && canExpand && (
        <div id={expandedBodyId} className="px-3 pb-3 agent-card-expanded">
          <AgentCardExpandedBody
            agent={agent}
            currentWindow={currentWindow}
            setWindow={setWindow}
            cardViewModel={cardViewModel}
          />
        </div>
      )}
    </article>
  );
}
