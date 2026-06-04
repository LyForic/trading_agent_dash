import { useState, useId } from 'react';
import type { AgentId } from '@/lib/types';

interface Props {
  /** Drives accent color via `var(--color-${agentId})`. Replaces the prior hardcoded Metheus accent. */
  agentId: AgentId;
  /** Used only for the actionable accessible name once V1.1 wires the pill. */
  agentName?: string;
  /** Settle timestamp (ISO). When null, the pill renders without a countdown — "In Battle" alone. */
  settlesAt: string | null;
  /**
   * Battle Arena V1.1 handler. When supplied, tapping the pill opens the
   * mobile-first battle bottom sheet for the delayed-visible open position.
   */
  onTap?: () => void;
}

const DELAY_COPY =
  "Open entry details appear after the 30-minute delay. Settled outcomes update when the public ledger updates; this build's battle bar uses an entry-anchored preview.";

/**
 * Status chip that doubles as the invite to the Battle Arena overlay.
 * Tooltip is non-optional per spec §7 delay policy.
 *
 * Track B: rendered as a sibling of the AgentCard summary button (not a
 * descendant), preserving native <button> semantics on both.
 */
export function InBattlePill({ agentId, agentName, settlesAt, onTap }: Props) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tooltipId = useId();
  const settlesLabel = settlesAt
    ? new Date(settlesAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const ariaSubject = agentName ? ` for ${agentName}` : '';
  const ariaLabel = settlesLabel
    ? `Open battle arena${ariaSubject}, settles ${settlesLabel}`
    : `Open battle arena${ariaSubject}`;

  return (
    <span className="in-battle-pill-wrap">
      <button
        type="button"
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={() => setTooltipOpen(true)}
        onBlur={() => setTooltipOpen(false)}
        onClick={onTap}
        className="in-battle-pill in-battle-pulse"
        style={{
          '--in-battle-color': `var(--color-${agentId})`,
          backgroundColor: `color-mix(in srgb, var(--color-${agentId}) 18%, transparent)`,
          color: `var(--color-${agentId})`,
          borderColor: `color-mix(in srgb, var(--color-${agentId}) 40%, transparent)`,
        } as React.CSSProperties}
        aria-label={ariaLabel}
        aria-describedby={tooltipId}
      >
        ● In Battle{settlesLabel ? ` · ${settlesLabel}` : ''}
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        className="in-battle-tooltip"
        style={{
          backgroundColor: 'var(--color-ink)',
          color: 'var(--color-paper)',
          visibility: tooltipOpen ? 'visible' : 'hidden',
        }}
        aria-hidden={!tooltipOpen}
      >
        {DELAY_COPY}
      </div>
    </span>
  );
}
