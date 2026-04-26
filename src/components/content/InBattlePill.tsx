import { useState, useId } from 'react';
import type { AgentId } from '@/lib/types';

interface Props {
  /** Drives accent color via `var(--color-${agentId})`. Replaces the prior hardcoded Metheus accent. */
  agentId: AgentId;
  /** Settle timestamp (ISO). When null, the pill renders without a countdown — "In Battle" alone. */
  settlesAt: string | null;
  /**
   * Reserved for V1.1 Battle Arena handler. In Track B, the pill is
   * `aria-disabled` and `onClick` is a no-op even when this prop is supplied.
   * Drop `aria-disabled` (and the no-op behavior) when wiring this in V1.1.
   */
  onTap?: () => void;
}

const DELAY_COPY =
  'Entries and settlements shown after 30-minute delay. Mid-price updates live from Kalshi (public market data, no delay).';

/**
 * Status chip that doubles as the (future) invite to the Battle Arena overlay.
 * Tooltip is non-optional per spec §7 delay policy.
 *
 * Track B: rendered as a sibling of the AgentCard summary button (not a
 * descendant), preserving native <button> semantics on both. `aria-disabled`
 * is set because the Battle Arena route is V1.1 scope.
 */
export function InBattlePill({ agentId, settlesAt, onTap }: Props) {
  void onTap; // V1.1 reservation slot — intentionally unused while aria-disabled.
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const tooltipId = useId();
  const settlesLabel = settlesAt
    ? new Date(settlesAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : null;
  const ariaLabel = settlesLabel ? `In battle, settles ${settlesLabel}` : 'In battle';

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={() => setTooltipOpen(true)}
        onBlur={() => setTooltipOpen(false)}
        onClick={() => { /* aria-disabled in Track B; no-op until V1.1 */ }}
        className="in-battle-pulse px-3 py-1 rounded-full text-xs font-medium border"
        style={{
          backgroundColor: `color-mix(in srgb, var(--color-${agentId}) 18%, transparent)`,
          color: `var(--color-${agentId})`,
          borderColor: `color-mix(in srgb, var(--color-${agentId}) 40%, transparent)`,
        }}
        aria-disabled="true"
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
