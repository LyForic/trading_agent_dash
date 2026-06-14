#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const AGENT_IDS = new Set(['apex', 'gale', 'metheus', 'bacon', 'nova', 'meridian']);
const CONFIDENCE = new Set(['low', 'medium', 'high']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function usage() {
  return [
    'Usage: SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run insights:publish -- packet.json',
    '',
    'packet.json fields:',
    '  agentId, insightType, claim, summary, evidence, nextRule',
    '  optional: insightDate, windowStart, windowEnd, confidence, sampleSize, relatedTradeIds, relatedSignalIds, sourceRefs, generatedBy, modelId, expiresAt, metadata',
  ].join('\n');
}

function fail(message) {
  console.error(message);
  console.error('');
  console.error(usage());
  process.exit(1);
}

function cleanString(value, field, maxLength = 1200) {
  if (typeof value !== 'string') fail(`${field} must be a string.`);
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) fail(`${field} is required.`);
  if (clean.length > maxLength) fail(`${field} must be ${maxLength} chars or less.`);
  return clean;
}

function optionalString(value, field, maxLength = 120) {
  if (value === undefined || value === null || value === '') return null;
  return cleanString(value, field, maxLength);
}

function stringArray(value, field, maxItems = 12) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) fail(`${field} must be an array.`);
  return value.map((item) => cleanString(item, field, 1200)).slice(0, maxItems);
}

function optionalDate(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(`${field} must be YYYY-MM-DD.`);
  }
  return value;
}

function optionalIso(value, field) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    fail(`${field} must be an ISO timestamp.`);
  }
  return value;
}

function uuidArray(value, field) {
  const values = stringArray(value, field, 24);
  for (const id of values) {
    if (!UUID_PATTERN.test(id)) fail(`${field} contains a non-UUID trade id: ${id}`);
  }
  return values;
}

function evidenceJson(packet) {
  if (packet.evidenceJson !== undefined) {
    if (packet.evidenceJson === null || typeof packet.evidenceJson !== 'object') {
      fail('evidenceJson must be an object or array.');
    }
    return packet.evidenceJson;
  }
  return stringArray(packet.evidence, 'evidence', 8);
}

function normalizePacket(packet) {
  if (!packet || typeof packet !== 'object' || Array.isArray(packet)) {
    fail('packet.json must contain one JSON object.');
  }

  const agentId = cleanString(packet.agentId, 'agentId', 32);
  if (!AGENT_IDS.has(agentId)) fail(`agentId must be one of: ${Array.from(AGENT_IDS).join(', ')}.`);

  const confidence = packet.confidence === undefined ? 'low' : cleanString(packet.confidence, 'confidence', 16);
  if (!CONFIDENCE.has(confidence)) fail('confidence must be low, medium, or high.');

  const sampleSize = packet.sampleSize === undefined ? 0 : Number(packet.sampleSize);
  if (!Number.isInteger(sampleSize) || sampleSize < 0) fail('sampleSize must be a non-negative integer.');

  return {
    agent_id: agentId,
    insight_date: optionalDate(packet.insightDate, 'insightDate'),
    window_start: optionalIso(packet.windowStart, 'windowStart'),
    window_end: optionalIso(packet.windowEnd, 'windowEnd'),
    insight_type: cleanString(packet.insightType, 'insightType', 80),
    claim: cleanString(packet.claim, 'claim', 180),
    summary: cleanString(packet.summary, 'summary', 1200),
    evidence_json: evidenceJson(packet),
    confidence,
    sample_size: sampleSize,
    related_trade_ids: uuidArray(packet.relatedTradeIds, 'relatedTradeIds'),
    related_signal_ids: stringArray(packet.relatedSignalIds, 'relatedSignalIds', 24),
    next_rule: cleanString(packet.nextRule, 'nextRule', 1200),
    source_refs: stringArray(packet.sourceRefs, 'sourceRefs', 24),
    generated_by: optionalString(packet.generatedBy, 'generatedBy', 120) ?? 'local_agent_analysis',
    model_id: optionalString(packet.modelId, 'modelId', 120),
    expires_at: optionalIso(packet.expiresAt, 'expiresAt'),
    metadata: packet.metadata && typeof packet.metadata === 'object' && !Array.isArray(packet.metadata)
      ? packet.metadata
      : {},
    is_published: packet.isPublished !== false,
  };
}

const packetPath = process.argv[2];
if (!packetPath || packetPath === '--help' || packetPath === '-h') {
  console.log(usage());
  process.exit(packetPath ? 0 : 1);
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const raw = await readFile(packetPath, 'utf8');
const packet = normalizePacket(JSON.parse(raw));
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from('agent_insights')
  .insert(packet)
  .select('id,agent_id,claim,created_at,is_published')
  .single();

if (error) fail(`Supabase insert failed: ${error.message}`);

console.log(JSON.stringify(data, null, 2));
