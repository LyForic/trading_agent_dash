// supabase/functions/sync-public-lab-episodes/index.ts
//
// Pulls the authenticated creator's newest TikTok uploads into
// public_lab_episodes. The browser reads public_lab_episodes_public only.
//
// Deploy:
//   supabase functions deploy sync-public-lab-episodes
// Required secrets:
//   TIKTOK_ACCESS_TOKEN=<creator Display API access token>
//   SUPABASE_SERVICE_ROLE_KEY=<server-only key>
//   PUBLIC_LAB_SYNC_SECRET=<random shared secret for scheduled calls>
// Optional:
//   PUBLIC_LAB_EPISODE_LIMIT=12

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AgentId = 'apex' | 'gale' | 'metheus' | 'bacon' | 'nova';

interface TikTokVideo {
  id: string;
  title?: string;
  video_description?: string;
  cover_image_url?: string;
  share_url?: string;
  embed_link?: string;
  create_time?: number;
}

interface TikTokVideoListResponse {
  data?: {
    videos?: TikTokVideo[];
  };
  error?: {
    code?: string;
    message?: string;
    log_id?: string;
  };
}

interface PublicLabEpisodeInsert {
  platform: 'tiktok';
  platform_media_id: string;
  title: string;
  dek: string | null;
  episode_url: string;
  thumbnail_url: string | null;
  published_at: string;
  agent_id: AgentId | null;
  trade_id: string | null;
  source: string;
  is_published: boolean;
  metadata: Record<string, unknown>;
  synced_at: string;
  updated_at: string;
}

const AGENT_IDS: AgentId[] = ['apex', 'gale', 'metheus', 'bacon', 'nova'];
const TIKTOK_FIELDS = [
  'id',
  'title',
  'video_description',
  'cover_image_url',
  'share_url',
  'embed_link',
  'create_time',
].join(',');

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function truncate(value: string, maxLength: number) {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return compact.slice(0, maxLength - 1).trimEnd();
}

function inferAgentId(text: string): AgentId | null {
  const lower = text.toLowerCase();
  return AGENT_IDS.find((id) => {
    return lower.includes(`#${id}`) || lower.includes(` ${id} `) || lower.startsWith(`${id} `);
  }) ?? null;
}

function inferTradeId(text: string) {
  const match = text.match(/\b(?:trade|trade_id|replay)[:#\s-]*([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})\b/i);
  return match?.[1] ?? null;
}

function videoToEpisode(video: TikTokVideo, syncedAt: string): PublicLabEpisodeInsert | null {
  const episodeUrl = video.share_url ?? video.embed_link ?? null;
  if (!video.id || !episodeUrl) return null;

  const description = video.video_description?.trim() ?? '';
  const rawTitle = video.title?.trim() || description.split('\n').find(Boolean) || 'Public lab update';
  const textForInference = `${rawTitle} ${description}`;
  const createdAtSeconds = video.create_time && Number.isFinite(video.create_time)
    ? video.create_time
    : Math.floor(Date.now() / 1000);

  return {
    platform: 'tiktok',
    platform_media_id: video.id,
    title: truncate(rawTitle, 180),
    dek: description ? truncate(description, 360) : null,
    episode_url: episodeUrl,
    thumbnail_url: video.cover_image_url ?? null,
    published_at: new Date(createdAtSeconds * 1000).toISOString(),
    agent_id: inferAgentId(textForInference),
    trade_id: inferTradeId(textForInference),
    source: 'tiktok_display_api',
    is_published: true,
    metadata: {
      embed_link: video.embed_link ?? null,
      title: video.title ?? null,
    },
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

async function fetchTikTokVideos(accessToken: string, limit: number) {
  const response = await fetch(`https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(TIKTOK_FIELDS)}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ max_count: limit }),
  });

  const payload = (await response.json()) as TikTokVideoListResponse;
  if (!response.ok || (payload.error?.code && payload.error.code !== 'ok')) {
    throw new Error(payload.error?.message ?? `TikTok request failed with ${response.status}`);
  }

  return payload.data?.videos ?? [];
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const tiktokAccessToken = Deno.env.get('TIKTOK_ACCESS_TOKEN');
  const syncSecret = Deno.env.get('PUBLIC_LAB_SYNC_SECRET');
  const limit = Math.min(Number(Deno.env.get('PUBLIC_LAB_EPISODE_LIMIT') ?? 12) || 12, 20);

  if (!syncSecret || req.headers.get('x-sync-secret') !== syncSecret) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Supabase service role credentials are not configured' }, 500);
  }
  if (!tiktokAccessToken) {
    return json({ error: 'TIKTOK_ACCESS_TOKEN is not configured' }, 500);
  }

  try {
    const syncedAt = new Date().toISOString();
    const videos = await fetchTikTokVideos(tiktokAccessToken, limit);
    const rows = videos
      .map((video) => videoToEpisode(video, syncedAt))
      .filter((row): row is PublicLabEpisodeInsert => row !== null);

    if (rows.length === 0) {
      return json({ synced: 0, skipped: videos.length });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { error } = await supabase
      .from('public_lab_episodes')
      .upsert(rows, { onConflict: 'platform,platform_media_id' });

    if (error) throw error;

    return json({ synced: rows.length, skipped: videos.length - rows.length });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
