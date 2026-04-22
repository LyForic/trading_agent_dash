import { useState } from 'react';

interface Props {
  settlesAt: string;
  onTap?: () => void;
}

// Required per spec §7 delay policy — shown on every instance of this pill.
const DELAY_COPY =
  'Entries and settlements shown after 30-minute delay. Mid-price updates live from Kalshi (public market data, no delay).';

/**
 * Status chip that doubles as the invite to the Battle Arena overlay.
 * The tooltip is non-optional: any surface that implies "live" trade data
 * must carry the 30-min-delay disclosure per the spec.
 */
export function InBattlePill({ settlesAt, onTap }: Props) {
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const settlesLabel = new Date(settlesAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <span className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setTooltipOpen(true)}
        onMouseLeave={() => setTooltipOpen(false)}
        onFocus={() => setTooltipOpen(true)}
        onBlur={() => setTooltipOpen(false)}
        onClick={onTap}
        className="px-3 py-1 rounded-full text-xs font-medium border"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--color-metheus) 18%, transparent)',
          color: 'var(--color-metheus)',
          borderColor: 'color-mix(in srgb, var(--color-metheus) 40%, transparent)',
        }}
      >
        ● In Battle · settles {settlesLabel}
      </button>
      {tooltipOpen && (
        <div
          role="tooltip"
          className="absolute top-full left-0 mt-2 w-64 p-2 text-xs rounded-md shadow-lg z-20 leading-snug"
          style={{
            backgroundColor: 'var(--color-ink)',
            color: 'var(--color-paper)',
          }}
        >
          {DELAY_COPY}
        </div>
      )}
    </span>
  );
}
