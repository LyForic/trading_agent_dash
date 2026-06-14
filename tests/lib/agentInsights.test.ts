import { describe, expect, it } from 'vitest';
import { buildAgentTradeInsight, buildDailyTradeInsight } from '@/lib/agentInsights';
import type { AgentId, TradeLogEntry } from '@/lib/types';

function trade(overrides: Partial<TradeLogEntry> = {}): TradeLogEntry {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    contract_ticker: overrides.contract_ticker ?? 'KXBTC-TEST',
    side: overrides.side ?? 'yes',
    entry_price_cents: overrides.entry_price_cents ?? 55,
    size: overrides.size ?? 100,
    entered_at: overrides.entered_at ?? '2026-06-12T15:00:00Z',
    settled_at: overrides.settled_at ?? '2026-06-12T15:15:00Z',
    settle_price_cents: overrides.settle_price_cents ?? 0,
    pnl: overrides.pnl ?? -20,
    move_used: overrides.move_used ?? null,
    replay_ticks: overrides.replay_ticks,
  };
}

function daily(agentId: AgentId, rows: TradeLogEntry[]) {
  return { [agentId]: rows };
}

describe('agentInsights', () => {
  it('detects when one trade drives most of an agent drawdown', () => {
    const insight = buildAgentTradeInsight('nova', [
      trade({ id: 'worst', pnl: -70, entry_price_cents: 58 }),
      trade({ id: 'small-loss', pnl: -10, entry_price_cents: 52 }),
      trade({ id: 'win', pnl: 12, entry_price_cents: 45, settle_price_cents: 100 }),
    ]);

    expect(insight?.kind).toBe('single_trade_drag');
    expect(insight?.tradeIds).toContain('worst');
    expect(insight?.headline).toContain('Nova');
  });

  it('detects late expensive losing entries', () => {
    const insight = buildAgentTradeInsight('metheus', [
      trade({ id: 'late-1', pnl: -24, entry_price_cents: 72 }),
      trade({ id: 'late-2', pnl: -18, entry_price_cents: 69 }),
      trade({ id: 'normal-win', pnl: 8, entry_price_cents: 42, settle_price_cents: 100 }),
    ]);

    expect(insight?.kind).toBe('entry_timing');
    expect(insight?.evidence).toContain('65c');
  });

  it('uses daily cohort data to find the strongest actionable insight', () => {
    const insight = buildDailyTradeInsight({
      ...daily('apex', [
        trade({ id: 'apex-1', pnl: 10 }),
        trade({ id: 'apex-2', pnl: -4 }),
      ]),
      ...daily('bacon', [
        trade({ id: 'bacon-1', pnl: -55, entry_price_cents: 61 }),
        trade({ id: 'bacon-2', pnl: -8, entry_price_cents: 50 }),
      ]),
      ...daily('nova', [
        trade({ id: 'nova-1', pnl: 7 }),
      ]),
    });

    expect(insight).not.toBeNull();
    expect(insight?.agentId).toBe('bacon');
    expect(insight?.kind).toBe('single_trade_drag');
  });
});
