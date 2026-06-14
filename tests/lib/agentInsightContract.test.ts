import { describe, expect, it } from 'vitest';
import { agentInsightPacketToTradeInsight, normalizeAgentInsightRow } from '@/lib/agentInsightContract';
import type { AgentInsightPublicRow } from '@/lib/agentInsightContract';

function row(overrides: Partial<AgentInsightPublicRow> = {}): AgentInsightPublicRow {
  return {
    id: 'insight-1',
    agent_id: 'metheus',
    insight_date: '2026-06-13',
    window_start: '2026-06-01T00:00:00Z',
    window_end: '2026-06-13T00:00:00Z',
    insight_type: 'regime_shift',
    claim: 'Metheus weakened when the market turned choppy',
    summary: 'Trend-following entries stopped getting clean continuation after the regime shift.',
    evidence_json: {
      bullets: [
        'Trend agreement had positive lift in the earlier window.',
        'The later choppy window had lower realized follow-through.',
      ],
    },
    confidence: 'medium',
    sample_size: 42,
    related_trade_ids: ['trade-1', 'trade-2'],
    related_signal_ids: ['signal-1'],
    next_rule: 'Cut size when MTF agreement is weak and realized volatility is elevated.',
    source_refs: ['era_split_analysis.py'],
    generated_by: 'local_model',
    model_id: 'local-qwen',
    created_at: '2026-06-13T18:00:00Z',
    expires_at: null,
    ...overrides,
  };
}

describe('agentInsightContract', () => {
  it('normalizes a sanitized public insight row', () => {
    const packet = normalizeAgentInsightRow(row());

    expect(packet?.agentId).toBe('metheus');
    expect(packet?.confidence).toBe('medium');
    expect(packet?.evidence).toHaveLength(2);
    expect(packet?.sampleSize).toBe(42);
    expect(packet?.sourceRefs).toContain('era_split_analysis.py');
  });

  it('rejects rows without a known public agent', () => {
    expect(normalizeAgentInsightRow(row({ agent_id: 'private-agent' }))).toBeNull();
  });

  it('maps public packets to the current display insight shape', () => {
    const packet = normalizeAgentInsightRow(row());
    expect(packet).not.toBeNull();

    const insight = agentInsightPacketToTradeInsight(packet!);

    expect(insight.kind).toBe('regime_shift');
    expect(insight.headline).toContain('Metheus');
    expect(insight.evidenceBullets).toHaveLength(2);
    expect(insight.tradeIds).toContain('trade-1');
    expect(insight.signalIds).toContain('signal-1');
  });
});
