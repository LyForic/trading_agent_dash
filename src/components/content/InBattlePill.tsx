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
  "Entries and settlements shown after 30-minute delay. Public Kalshi mid-price can update live when connected; this build's battle bar uses an entry-anchored preview.";

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
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={() => setTooltipOpen(true)}
        onBlur={() => setTooltipOpen(false)}
        onClick={onTap}
        className="in-battle-pulse px-3 py-1 rounded-full text-xs font-medium border"
        style={{
          '--in-battle-color': `var(--color-${agentId})`,
          backgroundColor: `color-mix(in srgb, var(--color-${agentId}) 18%, transparent)`,
          color: `var(--color-${agentId})`,
          borderColor: `color-mix(in srgb, var(--color-${agentId}) 40%, transparent)`,
        } as React.CSSProperties}
        aria-label={ariaLabel}
        aria-describedby={tooltipId}
      >
        ● In Battle{settlesLabel ? ` · settles ${settlesLabel}` : ''}
      </button>
      <div
        id={tooltipId}
        role="tooltip"
        className="absolute top-full left-0 mt-2 w-64 p-2 text-xs rounded-md shadow-lg z-20 leading-snug"
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
