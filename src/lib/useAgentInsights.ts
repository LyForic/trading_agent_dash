import { useEffect, useMemo, useState } from 'react';
import {
  AGENT_INSIGHT_PUBLIC_COLUMNS,
  AGENT_INSIGHTS_PUBLIC_VIEW,
  isAgentInsightExpired,
  normalizeAgentInsightRow,
  type AgentInsightPacket,
  type AgentInsightPublicRow,
} from './agentInsightContract';
import { isSupabaseConfigured, supabase } from './supabase';
import type { AgentId } from './types';

const INSIGHT_REFRESH_MS = 120_000;

export interface UseAgentInsightsResult {
  insights: AgentInsightPacket[];
  latestInsight: AgentInsightPacket | null;
  loading: boolean;
  error: string | null;
  source: 'live' | 'none';
}

export function useAgentInsights(agentId: AgentId, limit = 8): UseAgentInsightsResult {
  const [insights, setInsights] = useState<AgentInsightPacket[]>([]);
  const [loading, setLoading] = useState(() => isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    const client = supabase;
    let cancelled = false;

    const fetchInsights = async () => {
      setLoading(true);
      const { data, error: fetchError } = await client
        .from(AGENT_INSIGHTS_PUBLIC_VIEW)
        .select(AGENT_INSIGHT_PUBLIC_COLUMNS)
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (cancelled) return;

      if (fetchError) {
        setInsights([]);
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const now = new Date();
      const nextInsights = ((data ?? []) as unknown as AgentInsightPublicRow[])
        .map(normalizeAgentInsightRow)
        .filter((packet): packet is AgentInsightPacket => packet !== null && !isAgentInsightExpired(packet, now));

      setInsights(nextInsights);
      setError(null);
      setLoading(false);
    };

    void fetchInsights();
    const refresh = window.setInterval(() => {
      void fetchInsights();
    }, INSIGHT_REFRESH_MS);

    const refetchOnFocus = () => {
      if (document.visibilityState === 'hidden') return;
      void fetchInsights();
    };
    window.addEventListener('focus', refetchOnFocus);
    document.addEventListener('visibilitychange', refetchOnFocus);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
      window.removeEventListener('focus', refetchOnFocus);
      document.removeEventListener('visibilitychange', refetchOnFocus);
    };
  }, [agentId, limit]);

  return useMemo(() => ({
    insights,
    latestInsight: insights[0] ?? null,
    loading,
    error,
    source: isSupabaseConfigured ? 'live' : 'none',
  }), [error, insights, loading]);
}
