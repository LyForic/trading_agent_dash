import { useMemo } from 'react';
import type { BnfPortfolioSeries, LeaderboardResponse } from '@/lib/types';
import { formatPnl } from '@/lib/formatting';
import type { AgentDataError } from '@/lib/useAgentData';
import { publicLabDay } from '@/lib/publicLab';
import { bnfPortfolioSnapshot } from '@/lib/useBnfPortfolio';

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
  portfolio?: BnfPortfolioSeries;
}

function minutesSince(value: string | null | undefined) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.round((Date.now() - time) / 60_000));
}

export function TrustStrip({ data, error, portfolio }: Props) {
  const totalPnl = data.agents.reduce((sum, a) => sum + a.total_pnl, 0);
  const settledTotal = data.agents.reduce((sum, a) => sum + a.record.settled, 0);
  const portfolioSnapshot = useMemo(
    () => (portfolio ? bnfPortfolioSnapshot(portfolio) : null),
    [portfolio],
  );
  const allTimePct = portfolioSnapshot?.allTimePct ?? null;
  const updatedAt = portfolioSnapshot?.updatedAt ?? data.updated_at;
  const minutesAgo = useMemo(
    () => minutesSince(updatedAt),
    [updatedAt],
  );
  const day = publicLabDay(updatedAt ? new Date(updatedAt) : new Date(data.updated_at));

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
        Updated {minutesAgo === null ? '—' : `${minutesAgo}m ago`}
      </span>
      <span className="tabular-nums font-medium">
        Day {day} · Start $10k ·{' '}
        <span
          style={{
            color: allTimePct === null
              ? 'var(--color-ink-muted)'
              : allTimePct >= 0
                ? 'var(--color-gain)'
                : 'var(--color-loss)',
          }}
        >
          {allTimePct === null ? '—' : `${allTimePct >= 0 ? '+' : ''}${allTimePct.toFixed(1)}%`} all-time
        </span>
      </span>
      <span
        className="tabular-nums"
        style={{ color: 'var(--color-ink-muted)' }}
      >
        Agent P&amp;L {formatPnl(totalPnl)} · {settledTotal} settled
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
