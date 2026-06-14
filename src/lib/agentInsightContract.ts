import type { AgentTradeInsight, AgentTradeInsightConfidence } from './agentInsights';
import type { AgentId } from './types';

export const AGENT_INSIGHTS_PUBLIC_VIEW = 'agent_insights_public';

export const AGENT_INSIGHT_PUBLIC_COLUMNS = [
  'id',
  'agent_id',
  'insight_date',
  'window_start',
  'window_end',
  'insight_type',
  'claim',
  'summary',
  'evidence_json',
  'confidence',
  'sample_size',
  'related_trade_ids',
  'related_signal_ids',
  'next_rule',
  'source_refs',
  'generated_by',
  'model_id',
  'created_at',
  'expires_at',
].join(',');

const AGENT_IDS: AgentId[] = ['apex', 'gale', 'metheus', 'bacon', 'nova', 'meridian'];
const CONFIDENCE_VALUES: AgentTradeInsightConfidence[] = ['low', 'medium', 'high'];

export interface AgentInsightPublicRow {
  id: string;
  agent_id: string;
  insight_date: string | null;
  window_start: string | null;
  window_end: string | null;
  insight_type: string | null;
  claim: string | null;
  summary: string | null;
  evidence_json: unknown;
  confidence: string | null;
  sample_size: number | null;
  related_trade_ids: unknown;
  related_signal_ids: unknown;
  next_rule: string | null;
  source_refs: unknown;
  generated_by: string | null;
  model_id: string | null;
  created_at: string | null;
  expires_at: string | null;
}

export interface AgentInsightPacket {
  id: string;
  agentId: AgentId;
  insightDate: string | null;
  windowStart: string | null;
  windowEnd: string | null;
  insightType: string;
  claim: string;
  summary: string;
  evidence: string[];
  confidence: AgentTradeInsightConfidence;
  sampleSize: number;
  relatedTradeIds: string[];
  relatedSignalIds: string[];
  nextRule: string;
  sourceRefs: string[];
  generatedBy: string;
  modelId: string | null;
  createdAt: string;
  expiresAt: string | null;
}

function asAgentId(value: string | null | undefined): AgentId | null {
  return AGENT_IDS.includes(value as AgentId) ? value as AgentId : null;
}

function cleanString(value: unknown) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map(cleanString)
      .filter(Boolean)
      .slice(0, 8);
  }

  if (typeof value === 'string') {
    const clean = cleanString(value);
    return clean ? [clean] : [];
  }

  return [];
}

function evidenceArray(value: unknown): string[] {
  if (Array.isArray(value) || typeof value === 'string') return stringArray(value);
  if (!value || typeof value !== 'object') return [];

  const record = value as Record<string, unknown>;
  const bullets = stringArray(record.bullets);
  if (bullets.length > 0) return bullets;

  return stringArray(record.evidence);
}

function confidence(value: string | null | undefined): AgentTradeInsightConfidence {
  return CONFIDENCE_VALUES.includes(value as AgentTradeInsightConfidence)
    ? value as AgentTradeInsightConfidence
    : 'low';
}

function normalizedDate(value: string | null) {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function normalizedIso(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

export function normalizeAgentInsightRow(row: AgentInsightPublicRow): AgentInsightPacket | null {
  const agentId = asAgentId(row.agent_id);
  const claim = cleanString(row.claim);
  const summary = cleanString(row.summary);
  const createdAt = normalizedIso(row.created_at);

  if (!agentId || !row.id || !claim || !summary || !createdAt) return null;

  const sampleSize = Number.isFinite(row.sample_size) && row.sample_size !== null
    ? Math.max(0, Math.round(row.sample_size))
    : 0;

  return {
    id: row.id,
    agentId,
    insightDate: normalizedDate(row.insight_date),
    windowStart: normalizedIso(row.window_start),
    windowEnd: normalizedIso(row.window_end),
    insightType: cleanString(row.insight_type) || 'external_packet',
    claim,
    summary,
    evidence: evidenceArray(row.evidence_json),
    confidence: confidence(row.confidence),
    sampleSize,
    relatedTradeIds: stringArray(row.related_trade_ids),
    relatedSignalIds: stringArray(row.related_signal_ids),
    nextRule: cleanString(row.next_rule) || 'Review the supporting evidence before changing the live strategy.',
    sourceRefs: stringArray(row.source_refs),
    generatedBy: cleanString(row.generated_by) || 'agent_insight_exporter',
    modelId: cleanString(row.model_id) || null,
    createdAt,
    expiresAt: normalizedIso(row.expires_at),
  };
}

export function isAgentInsightExpired(packet: AgentInsightPacket, now = new Date()) {
  return packet.expiresAt !== null && Date.parse(packet.expiresAt) <= now.getTime();
}

function confidenceRank(value: AgentTradeInsightConfidence) {
  if (value === 'high') return 3;
  if (value === 'medium') return 2;
  return 1;
}

export function compareAgentInsightPackets(left: AgentInsightPacket, right: AgentInsightPacket) {
  const confidenceDelta = confidenceRank(right.confidence) - confidenceRank(left.confidence);
  if (confidenceDelta !== 0) return confidenceDelta;

  const sampleDelta = right.sampleSize - left.sampleSize;
  if (sampleDelta !== 0) return sampleDelta;

  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

export function bestAgentInsightPacket(packets: AgentInsightPacket[]) {
  return packets.slice().sort(compareAgentInsightPackets)[0] ?? null;
}

export function agentInsightPacketToTradeInsight(packet: AgentInsightPacket): AgentTradeInsight {
  const evidence = packet.evidence[0] ?? `Sample size: ${packet.sampleSize}.`;
  const sourceLabel = packet.modelId
    ? `${packet.generatedBy} · ${packet.modelId}`
    : packet.generatedBy;

  return {
    id: packet.id,
    kind: packet.insightType,
    agentId: packet.agentId,
    headline: packet.claim,
    summary: packet.summary,
    evidence,
    evidenceBullets: packet.evidence,
    nextRule: packet.nextRule,
    confidence: packet.confidence,
    settledCount: packet.sampleSize,
    sampleSize: packet.sampleSize,
    tradeIds: packet.relatedTradeIds,
    signalIds: packet.relatedSignalIds,
    sourceRefs: packet.sourceRefs,
    sourceLabel,
    generatedBy: packet.generatedBy,
    generatedAt: packet.createdAt,
    windowStart: packet.windowStart ?? undefined,
    windowEnd: packet.windowEnd ?? undefined,
    insightDate: packet.insightDate ?? undefined,
  };
}
