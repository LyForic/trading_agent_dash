import { useEffect, useState } from 'react';
import { mockAgentLearningPosts } from './mockData';
import { isSupabaseConfigured, supabase } from './supabase';
import type { AgentId, AgentLearningPost } from './types';

interface AgentLearningPostRow {
  id: string;
  agent_id: AgentId;
  title: string;
  body: string;
  made_at: string;
  source: string | null;
}

export interface UseAgentLearningResult {
  posts: AgentLearningPost[];
  loading: boolean;
  error: string | null;
  source: 'live' | 'mock';
}

const LEARNING_POST_COLUMNS = 'id,agent_id,title,body,made_at,source';
const LEARNING_REFRESH_MS = 60_000;

function rowToLearningPost(row: AgentLearningPostRow): AgentLearningPost {
  const category = inferPublicCategory(`${row.title} ${row.body}`);
  return {
    id: row.id,
    agent_id: row.agent_id,
    title: row.title,
    body: row.body,
    made_at: row.made_at,
    source: row.source,
    category,
  };
}

function inferPublicCategory(text: string) {
  const lower = text.toLowerCase();
  if (/\bbug|reliab|sync|data|broken|fix|issue\b/.test(lower)) return 'Reliability';
  if (/\bloss|mistake|drawdown|risk|missed|failed|wrong\b/.test(lower)) return 'Risk';
  if (/\bwin|worked|profit|green|edge|improved\b/.test(lower)) return 'What worked';
  if (/\bskip|wait|watch|flat|no trade|restraint\b/.test(lower)) return 'Restraint';
  return 'Learning';
}

export function useAgentLearning(agentId: AgentId): UseAgentLearningResult {
  const [posts, setPosts] = useState<AgentLearningPost[]>([]);
  const [loading, setLoading] = useState(() => isSupabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return undefined;
    const client = supabase;

    let cancelled = false;

    const fetchPosts = async () => {
      setLoading(true);
      const { data, error: fetchError } = await client
        .from('agent_learning_posts_public')
        .select(LEARNING_POST_COLUMNS)
        .eq('agent_id', agentId)
        .order('made_at', { ascending: false })
        .limit(20);

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      setPosts(((data ?? []) as AgentLearningPostRow[]).map(rowToLearningPost));
      setError(null);
      setLoading(false);
    };

    void fetchPosts();
    const refresh = window.setInterval(() => {
      void fetchPosts();
    }, LEARNING_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
    };
  }, [agentId]);

  if (!isSupabaseConfigured || !supabase) {
    return {
      posts: mockAgentLearningPosts[agentId].map(rowToLearningPost),
      loading: false,
      error: null,
      source: 'mock',
    };
  }

  return {
    posts,
    loading,
    error,
    source: isSupabaseConfigured ? 'live' : 'mock',
  };
}
