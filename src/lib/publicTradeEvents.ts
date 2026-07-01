import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { AGENT_IDS } from './agentMeta';
import { isSupabaseConfigured, supabase } from './supabase';
import type { AgentId } from './types';

export const PUBLIC_TRADE_EVENT_TABLE = 'agent_trade_public_events';

type EventPayload = RealtimePostgresChangesPayload<Record<string, unknown>>;

function rowFromPayload(payload: EventPayload): Record<string, unknown> | null {
  const row = (payload.new && Object.keys(payload.new).length > 0 ? payload.new : payload.old) as
    | Record<string, unknown>
    | null;
  return row && typeof row === 'object' ? row : null;
}

export function isKnownPublicTradeEvent(payload: EventPayload): boolean {
  const row = rowFromPayload(payload);
  const agentId = row?.agent_id;
  return typeof agentId === 'string' && AGENT_IDS.includes(agentId as AgentId);
}

export function subscribeToPublicTradeEvents(
  onPublicTradeEvent: () => void,
  channelScope = 'public-trade-events',
): () => void {
  if (!isSupabaseConfigured || !supabase) return () => {};

  const client = supabase;
  if (typeof client.channel !== 'function' || typeof client.removeChannel !== 'function') {
    return () => {};
  }

  const channel = client
    .channel(`${channelScope}-${Math.random().toString(36).slice(2)}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: PUBLIC_TRADE_EVENT_TABLE },
      (payload) => {
        if (isKnownPublicTradeEvent(payload)) onPublicTradeEvent();
      },
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
