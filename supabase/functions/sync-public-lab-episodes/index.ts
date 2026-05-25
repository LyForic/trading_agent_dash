// supabase/functions/sync-public-lab-episodes/index.ts
//
// Pulls the public creator's newest YouTube uploads into public_lab_episodes.
// The browser reads public_lab_episodes_public only.
//
// Deploy:
//   supabase functions deploy sync-public-lab-episodes
// Required secrets:
//   SUPABASE_SERVICE_ROLE_KEY=<server-only key>
//   PUBLIC_LAB_SYNC_SECRET=<random shared secret for scheduled calls>
// Optional:
//   YOUTUBE_CHANNEL_ID=UCaf4uNVOcxm25xou7lLw4pQ
//   YOUTUBE_HANDLE=brandonnfongg
//   PUBLIC_LAB_EPISODE_LIMIT=12

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type AgentId = 'apex' | 'gale' | 'metheus' | 'bacon' | 'nova';

interface PublicLabEpisodeInsert {
  platform: 'youtube';
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

interface YouTubeEpisode {
  videoId: string;
  title: string;
  description: string | null;
  episodeUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  source: 'youtube_rss' | 'youtube_shorts_page';
}

const DEFAULT_YOUTUBE_CHANNEL_ID = 'UCaf4uNVOcxm25xou7lLw4pQ';
const DEFAULT_YOUTUBE_HANDLE = 'brandonnfongg';
const AGENT_IDS: AgentId[] = ['apex', 'gale', 'metheus', 'bacon', 'nova'];

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u0026/g, '&')
    .replace(/\\\//g, '/');
}

function truncate(value: string, maxLength: number) {
  const compact = decodeEntities(value).replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) return compact;
  return compact.slice(0, maxLength - 1).trimEnd();
}

function firstMatch(value: string, pattern: RegExp) {
  return value.match(pattern)?.[1] ?? null;
}

function inferAgentId(text: string): AgentId | null {
  const lower = ` ${text.toLowerCase()} `;
  return AGENT_IDS.find((id) => lower.includes(`#${id}`) || lower.includes(` ${id} `)) ?? null;
}

function inferTradeId(text: string) {
  const match = text.match(/\b(?:trade|trade_id|replay)[:#\s-]*([0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12})\b/i);
  return match?.[1] ?? null;
}

function parseRssEntries(xml: string, limit: number): YouTubeEpisode[] {
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].slice(0, limit);

  return entries.flatMap((entry) => {
    const block = entry[1];
    const videoId = firstMatch(block, /<yt:videoId>([^<]+)<\/yt:videoId>/);
    const title = firstMatch(block, /<title>([\s\S]*?)<\/title>/);
    if (!videoId || !title) return [];

    const publishedAt = firstMatch(block, /<published>([^<]+)<\/published>/)
      ?? firstMatch(block, /<updated>([^<]+)<\/updated>/)
      ?? new Date().toISOString();
    const description = firstMatch(block, /<media:description>([\s\S]*?)<\/media:description>/);
    const thumbnailUrl = firstMatch(block, /<media:thumbnail\s+url="([^"]+)"/);
    const episodeUrl = firstMatch(block, /<link\s+rel="alternate"\s+href="([^"]+)"/)
      ?? `https://www.youtube.com/watch?v=${videoId}`;

    return [{
      videoId,
      title: truncate(title, 180),
      description: description ? truncate(description, 360) : null,
      episodeUrl: decodeEntities(episodeUrl),
      thumbnailUrl: thumbnailUrl ? decodeEntities(thumbnailUrl) : `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      publishedAt,
      source: 'youtube_rss' as const,
    }];
  });
}

function parseShortsPage(html: string, limit: number): YouTubeEpisode[] {
  const seen = new Set<string>();
  const rows: YouTubeEpisode[] = [];
  const now = Date.now();
  const patterns = [
    /shortsLockupViewModel"[\s\S]*?accessibilityText":"([^"]+)"[\s\S]*?url":"\/shorts\/([A-Za-z0-9_-]{11})"[\s\S]*?url":"(https:\/\/i\.ytimg\.com\/vi\/[A-Za-z0-9_-]{11}\/[^"]+)"/g,
    /"videoId":"([A-Za-z0-9_-]{11})"/g,
    /\/shorts\/([A-Za-z0-9_-]{11})/g,
  ];

  for (const match of html.matchAll(patterns[0])) {
    const title = truncate(match[1].split(',')[0] ?? 'Public lab update', 180);
    const videoId = match[2];
    if (seen.has(videoId)) continue;
    seen.add(videoId);
    rows.push({
      videoId,
      title,
      description: null,
      episodeUrl: `https://www.youtube.com/shorts/${videoId}`,
      thumbnailUrl: decodeEntities(match[3]),
      publishedAt: new Date(now - rows.length * 1000).toISOString(),
      source: 'youtube_shorts_page',
    });
    if (rows.length >= limit) return rows;
  }

  for (const pattern of patterns.slice(1)) {
    for (const match of html.matchAll(pattern)) {
      const videoId = match[1];
      if (seen.has(videoId)) continue;
      seen.add(videoId);
      rows.push({
        videoId,
        title: 'Public lab update',
        description: null,
        episodeUrl: `https://www.youtube.com/shorts/${videoId}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        publishedAt: new Date(now - rows.length * 1000).toISOString(),
        source: 'youtube_shorts_page',
      });
      if (rows.length >= limit) return rows;
    }
  }

  return rows;
}

async function fetchText(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TradingGymPublicLab/1.0 (+https://gym.lyforic.com)',
      Accept: 'application/atom+xml,application/xml,text/html;q=0.9,*/*;q=0.8',
    },
  });
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }
  return await response.text();
}

async function fetchYouTubeEpisodes(channelId: string, handle: string, limit: number) {
  const feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;

  try {
    const xml = await fetchText(feedUrl);
    const episodes = parseRssEntries(xml, limit);
    if (episodes.length > 0) return episodes;
  } catch (err) {
    console.warn(`[sync-public-lab-episodes] YouTube RSS unavailable; trying Shorts page: ${(err as Error).message}`);
  }

  const normalizedHandle = handle.replace(/^@/, '');
  const html = await fetchText(`https://www.youtube.com/@${encodeURIComponent(normalizedHandle)}/shorts`);
  const episodes = parseShortsPage(html, limit);
  if (episodes.length === 0) {
    throw new Error('No YouTube uploads found in RSS or Shorts page');
  }
  return episodes;
}

function episodeToRow(episode: YouTubeEpisode, syncedAt: string): PublicLabEpisodeInsert {
  const textForInference = `${episode.title} ${episode.description ?? ''}`;

  return {
    platform: 'youtube',
    platform_media_id: episode.videoId,
    title: episode.title,
    dek: episode.description,
    episode_url: episode.episodeUrl,
    thumbnail_url: episode.thumbnailUrl,
    published_at: episode.publishedAt,
    agent_id: inferAgentId(textForInference),
    trade_id: inferTradeId(textForInference),
    source: episode.source,
    is_published: true,
    metadata: {
      channel_id: Deno.env.get('YOUTUBE_CHANNEL_ID') ?? DEFAULT_YOUTUBE_CHANNEL_ID,
      handle: Deno.env.get('YOUTUBE_HANDLE') ?? DEFAULT_YOUTUBE_HANDLE,
    },
    synced_at: syncedAt,
    updated_at: syncedAt,
  };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const syncSecret = Deno.env.get('PUBLIC_LAB_SYNC_SECRET');
  const channelId = Deno.env.get('YOUTUBE_CHANNEL_ID') ?? DEFAULT_YOUTUBE_CHANNEL_ID;
  const handle = Deno.env.get('YOUTUBE_HANDLE') ?? DEFAULT_YOUTUBE_HANDLE;
  const limit = Math.min(Number(Deno.env.get('PUBLIC_LAB_EPISODE_LIMIT') ?? 12) || 12, 20);

  if (!syncSecret || req.headers.get('x-sync-secret') !== syncSecret) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Supabase service role credentials are not configured' }, 500);
  }

  try {
    const syncedAt = new Date().toISOString();
    const episodes = await fetchYouTubeEpisodes(channelId, handle, limit);
    const rows = episodes.map((episode) => episodeToRow(episode, syncedAt));

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const { error } = await supabase
      .from('public_lab_episodes')
      .upsert(rows, { onConflict: 'platform,platform_media_id' });

    if (error) throw error;

    return json({ synced: rows.length, source: rows[0]?.source ?? null });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
