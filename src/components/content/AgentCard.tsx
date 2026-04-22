import { useState } from 'react';
import type { Agent } from '@/lib/types';
import { AgentCardCollapsedRow } from './AgentCardCollapsedRow';
import { AgentCardExpandedBody } from './AgentCardExpandedBody';

/**
 * AgentCard — the atomic unit of the roster. Collapsed by default on all
 * viewports so three fit in one 375px screen; tap the summary row to
 * expand to full detail (record, Brier, cities, moves, latest receipt).
 * Arriving-soon agents cannot expand — their body would be empty.
 *
 * In Phase 5 the `onBattleTap` will open the Battle Arena bottom sheet;
 * for now the pill is rendered but its click is inert (no handler wired).
 */
export function AgentCard({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = agent.state !== 'arriving_soon';

  const toggleExpansion = (event: React.MouseEvent) => {
    // Don't toggle expansion when the user clicks the in-battle pill
    // (that has its own tap target for the Battle Arena invite).
    if ((event.target as HTMLElement).closest('[data-role="in-battle-pill"]')) return;
    if (canExpand) setExpanded((v) => !v);
  };

  return (
    <article
      aria-expanded={canExpand ? expanded : undefined}
      className="rounded-2xl border"
      style={{
        backgroundColor: 'var(--color-paper)',
        borderColor: 'var(--color-border-default)',
        boxShadow: '0 4px 12px rgba(62, 53, 41, 0.15)',
      }}
    >
      <button
        type="button"
        onClick={toggleExpansion}
        className="w-full text-left focus:outline-2 focus:outline-offset-[-2px] rounded-2xl"
        style={{
          outlineColor: `var(--color-${agent.id})`,
          cursor: canExpand ? 'pointer' : 'default',
        }}
        aria-label={
          canExpand
            ? `${expanded ? 'Collapse' : 'Expand'} ${agent.name}'s card`
            : `${agent.name}: arriving soon`
        }
      >
        <AgentCardCollapsedRow agent={agent} />
      </button>
      {expanded && canExpand && (
        <div className="px-3 pb-3">
          <AgentCardExpandedBody agent={agent} />
        </div>
      )}
    </article>
  );
}
