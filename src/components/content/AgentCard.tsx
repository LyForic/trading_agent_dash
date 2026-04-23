import type { Agent } from '@/lib/types';
import { AgentCardCollapsedRow } from './AgentCardCollapsedRow';
import { AgentCardExpandedBody } from './AgentCardExpandedBody';

/**
 * AgentCard — the atomic unit of the roster. Collapsed by default on all
 * viewports so three fit in one 375px screen; tap the summary row to
 * expand and drop into that agent's room.
 *
 * Expansion state is lifted to App.tsx so only one card can be expanded
 * at a time — matching the "you're in Apex's room now, not Apex+Gale"
 * mental model. App.tsx also drives body[data-room] from the expanded
 * agent id, which swaps the world-layer background image to that
 * agent's room via CSS.
 *
 * In Phase 5 the `onBattleTap` will open the Battle Arena bottom sheet;
 * for now the pill is rendered but its click is inert (no handler wired).
 */
export function AgentCard({
  agent,
  expanded,
  onToggle,
}: {
  agent: Agent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const canExpand = agent.state !== 'arriving_soon';

  const toggleExpansion = (event: React.MouseEvent) => {
    // Don't toggle expansion when the user clicks the in-battle pill
    // (that has its own tap target for the Battle Arena invite).
    if ((event.target as HTMLElement).closest('[data-role="in-battle-pill"]')) return;
    if (canExpand) onToggle();
  };

  return (
    <article
      aria-expanded={canExpand ? expanded : undefined}
      className="rounded-2xl border"
      style={{
        backgroundColor: 'var(--color-paper)',
        borderColor: 'var(--color-border-default)',
        boxShadow: '0 4px 12px rgba(62, 53, 41, 0.15)',
        // Spec §2.2: content layer is theme-locked. Card text must ALWAYS
        // be --ink regardless of world mode, or the cream page color
        // inherited from dusk/moonlit bleeds through into the card and
        // makes labels invisible on cream.
        color: 'var(--color-ink)',
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
        <div className="px-3 pb-3 agent-card-expanded">
          <AgentCardExpandedBody agent={agent} />
        </div>
      )}
    </article>
  );
}
