import { useEffect, useState } from 'react';
import { isSupabaseConfigured, supabase } from './supabase';
import type { PublicLabEpisode } from './publicLab';
import type { AgentId } from './types';

type EpisodePlatform = PublicLabEpisode['platform'];

interface PublicLabEpisodeRow {
  id: string;
  title: string;
  dek: string | null;
  agent_id: AgentId | null;
  trade_id: string | null;
  platform: EpisodePlatform;
  episode_url: string;
  thumbnail_url: string | null;
  published_at: string;
  source: string | null;
}

export interface UsePublicLabEpisodeResult {
  episode: PublicLabEpisode | null;
  loading: boolean;
  error: string | null;
  source: 'live' | 'fallback';
}

const EPISODE_COLUMNS =
  'id,title,dek,agent_id,trade_id,platform,episode_url,thumbnail_url,published_at,source';
const EPISODE_REFRESH_MS = 5 * 60 * 1000;

function rowToEpisode(row: PublicLabEpisodeRow): PublicLabEpisode {
  return {
    id: row.id,
    title: row.title,
    dek: row.dek,
    agentId: row.agent_id,
    tradeId: row.trade_id,
    platform: row.platform,
    episodeUrl: row.episode_url,
    thumbnailUrl: row.thumbnail_url,
    publishedAt: row.published_at,
    source: row.source,
  };
}

export function usePublicLabEpisode(): UsePublicLabEpisodeResult {
  const [episode, setEpisode] = useState<PublicLabEpisode | null>(null);
  const [loading, setLoading] = useState(() => isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    const client = supabase;
    let cancelled = false;

    const fetchEpisode = async () => {
      setLoading(true);
      const { data, error: fetchError } = await client
        .from('public_lab_episodes_public')
        .select(EPISODE_COLUMNS)
        .order('published_at', { ascending: false })
        .limit(1);

      if (cancelled) return;

      if (fetchError) {
        console.warn(`[usePublicLabEpisode] unavailable; using latest-trade fallback: ${fetchError.message}`);
        setEpisode(null);
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const row = (data?.[0] as PublicLabEpisodeRow | undefined) ?? null;
      setEpisode(row ? rowToEpisode(row) : null);
      setError(null);
      setLoading(false);
    };

    void fetchEpisode();
    const refresh = window.setInterval(() => {
      void fetchEpisode();
    }, EPISODE_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, []);

  if (!isSupabaseConfigured || !supabase) {
    return {
      episode: null,
      loading: false,
      error: null,
      source: 'fallback',
    };
  }

  return {
    episode,
    loading,
    error,
    source: episode ? 'live' : 'fallback',
  };
}
