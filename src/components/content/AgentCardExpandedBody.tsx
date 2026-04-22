import type { Agent } from '@/lib/types';
import { MovePill } from './MovePill';
import { formatPnl } from '@/lib/formatting';

/**
 * Full detail body shown when an AgentCard is expanded. Layered blocks:
 *   1. Market + status
 *   2. Record (W/L/BE · N settled)
 *   3. Brier score + Low-sample badge when n < 20
 *   4. Cities / tags row
 *   5. Moves row (locked + unlocked pills)
 *   6. Embedded latest receipt — per spec §2 / plan patch, inline on V1
 *      so the "trust loop" proof object is visible without a dead route.
 *      V1.1 will add a /trade/:id permalink + replay scrubber.
 *   7. "View trade log →" CTA
 */
export function AgentCardExpandedBody({ agent }: { agent: Agent }) {
  const receipt = agent.latest_receipt;
  const settledLabel = receipt
    ? new Date(receipt.settled_at).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  return (
    <div
      className="mt-3 pt-3 border-t space-y-3 text-sm"
      style={{ borderColor: 'var(--color-border-default)' }}
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            Market
          </div>
          <div>{agent.market_label}</div>
        </div>
        <div>
          <div
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            Status
          </div>
          <div className="capitalize">{agent.state.replace('_', ' ')}</div>
        </div>
      </div>

      {agent.record.settled > 0 && (
        <div>
          <div
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            Record
          </div>
          <div className="tabular-nums">
            {agent.record.W}W / {agent.record.L}L / {agent.record.BE}BE ·{' '}
            {agent.record.settled} settled
          </div>
        </div>
      )}

      {agent.brier_7d.n > 0 && (
        <div>
          <div
            className="text-[10px] uppercase tracking-wide"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            Brier · 7d
          </div>
          <div className="tabular-nums flex items-center gap-2">
            {agent.brier_7d.value.toFixed(3)}
            {agent.brier_7d.n < 20 && (
              <span
                className="px-2 py-0.5 text-[10px] rounded"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--color-border-default) 40%, transparent)',
                  color: 'var(--color-ink-muted)',
                }}
              >
                Low sample · n={agent.brier_7d.n}
              </span>
            )}
          </div>
        </div>
      )}

      {agent.cities_or_tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.cities_or_tags.map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded-md text-[10px] font-medium tracking-wide"
              style={{
                backgroundColor: 'var(--color-paper-raised)',
                color: 'var(--color-ink-muted)',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {agent.moves.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.moves.map((m, i) => (
            <MovePill key={i} move={m} />
          ))}
        </div>
      )}

      {receipt && (
        <div
          className="p-3 rounded-lg border"
          style={{
            backgroundColor: 'var(--color-paper-raised)',
            borderColor: 'var(--color-border-default)',
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[10px] uppercase tracking-wide"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              Latest receipt
            </span>
            <span
              className="font-mono text-[10px]"
              style={{ color: 'var(--color-ink-muted)' }}
            >
              {receipt.id}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
            <div>
              <dt className="text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
                Contract
              </dt>
              <dd className="truncate">{receipt.contract_ticker}</dd>
            </div>
            <div>
              <dt className="text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
                Side · Entry
              </dt>
              <dd>
                {receipt.side.toUpperCase()} @ {receipt.entry_price_cents}¢
              </dd>
            </div>
            <div>
              <dt className="text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
                Settlement
              </dt>
              <dd>{receipt.settle_price_cents}¢</dd>
            </div>
            <div>
              <dt className="text-[10px]" style={{ color: 'var(--color-ink-muted)' }}>
                P&amp;L
              </dt>
              <dd
                style={{
                  color: receipt.pnl >= 0 ? 'var(--color-gain)' : 'var(--color-loss)',
                }}
              >
                {formatPnl(receipt.pnl)}
              </dd>
            </div>
          </div>
          <p
            className="text-[9px] mt-2 leading-tight"
            style={{ color: 'var(--color-ink-muted)' }}
          >
            Settled {settledLabel} · shown after 30-minute delay
          </p>
        </div>
      )}

      <div className="pt-1">
        <button
          type="button"
          className="px-4 py-2 rounded-md text-sm font-medium border"
          style={{
            backgroundColor: 'var(--color-paper-raised)',
            borderColor: 'var(--color-border-default)',
            color: 'var(--color-ink)',
          }}
        >
          View trade log →
        </button>
      </div>
    </div>
  );
}
