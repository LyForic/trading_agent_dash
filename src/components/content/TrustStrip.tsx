import { useMemo } from 'react';
import type { LeaderboardResponse } from '@/lib/types';
import { formatPnl } from '@/lib/formatting';
import type { AgentDataError } from '@/lib/useAgentData';

/**
 * Sticky 48px header giving the page a constant liveness signal:
 *   Updated 2 mins ago  ·  Total P&L (all agents)  ·  N settled
 *
 * Per spec §4.2 — this is what converts the dashboard from "snapshot"
 * to "live system" in a viewer's perception. Visible during scroll so
 * the page never feels static.
 *
 * Note: "settled today" would ideally be filtered by a 24h window, but
 * Justin's API doesn't expose a daily count yet — using lifetime count
 * as a V1 approximation. Flagged in spec §9.4 and plan Phase 7 notes.
 */
interface Props {
  data: LeaderboardResponse;
  error?: AgentDataError | null;
}

export function TrustStrip({ data, error }: Props) {
  const totalPnl = data.agents.reduce((sum, a) => sum + a.total_pnl, 0);
  const settledTotal = data.agents.reduce((sum, a) => sum + a.record.settled, 0);
  const minutesAgo = useMemo(
    () => Math.max(0, Math.round((new Date().getTime() - new Date(data.updated_at).getTime()) / 60_000)),
    [data.updated_at],
  );

  return (
    <header
      className="sticky top-0 z-10 h-12 px-4 flex items-center justify-between text-xs border-b"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-paper) 90%, transparent)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        borderColor: 'var(--color-border-default)',
        color: 'var(--color-ink)',
      }}
    >
      <span style={{ color: 'var(--color-ink-muted)' }}>
        Updated {minutesAgo}m ago
      </span>
      <span className="tabular-nums font-medium">
        Total P&amp;L:{' '}
        <span
          style={{
            color: totalPnl >= 0 ? 'var(--color-gain)' : 'var(--color-loss)',
          }}
        >
          {formatPnl(totalPnl)}
        </span>
      </span>
      <span
        className="tabular-nums"
        style={{ color: 'var(--color-ink-muted)' }}
      >
        {settledTotal} settled
      </span>
      {error?.kind === 'fetch-failed' && (
        <span
          style={{
            color: 'var(--color-loss)',
            fontSize: 11,
          }}
          title={error.message}
          aria-label={`Data unavailable: ${error.message}`}
        >
          · Data unavailable
        </span>
      )}
    </header>
  );
}
