import { useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, Play, ReceiptText } from 'lucide-react';
import { formatPnl } from '@/lib/formatting';
import { SOCIAL_LINKS, trackPublicLabEvent } from '@/lib/publicLab';
import type { PublicLabEpisode } from '@/lib/publicLab';
import type { AgentId, TradeLogEntry } from '@/lib/types';

interface Props {
  agentName: string | null;
  agentId: AgentId | null;
  episode: PublicLabEpisode | null;
  loading?: boolean;
  trade: TradeLogEntry | null;
  onMinimize?: () => void;
  onOpenAgent: (agentId: AgentId) => void;
  onOpenTrade: (agentId: AgentId, trade: TradeLogEntry) => void;
}

function formatDate(value: string | null) {
  if (!value) return 'Today';
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function youtubeVideoIdFromUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.split('/').filter(Boolean)[0] ?? null;
    const watchId = parsed.searchParams.get('v');
    if (watchId) return watchId;
    const segments = parsed.pathname.split('/').filter(Boolean);
    const shortsIndex = segments.indexOf('shorts');
    if (shortsIndex >= 0) return segments[shortsIndex + 1] ?? null;
    const embedIndex = segments.indexOf('embed');
    if (embedIndex >= 0) return segments[embedIndex + 1] ?? null;
  } catch {
    return null;
  }
  return null;
}

function thumbnailCandidates(episode: PublicLabEpisode | null) {
  const videoId = youtubeVideoIdFromUrl(episode?.episodeUrl);
  const urls = [
    episode?.thumbnailUrl,
    videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null,
    videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : null,
  ];
  return urls.filter((url, index, all): url is string => Boolean(url) && all.indexOf(url) === index);
}

export function TodaysEpisodePanel({
  agentName,
  agentId,
  episode,
  loading = false,
  trade,
  onMinimize,
  onOpenAgent,
  onOpenTrade,
}: Props) {
  const episodePlatform = episode ? SOCIAL_LINKS.find((link) => link.id === episode.platform) : null;
  const thumbnails = useMemo(() => thumbnailCandidates(episode), [episode]);
  const thumbnailKey = `${episode?.id ?? 'none'}:${episode?.episodeUrl ?? ''}:${episode?.thumbnailUrl ?? ''}`;
  const [thumbnailAttempt, setThumbnailAttempt] = useState({ key: '', index: 0 });
  const thumbnailIndex = thumbnailAttempt.key === thumbnailKey ? thumbnailAttempt.index : 0;
  const thumbnailUrl = thumbnails[thumbnailIndex] ?? null;
  const displayAgentId = episode?.agentId ?? agentId;
  const title = episode?.title ?? (agentName && trade
    ? `${agentName}'s latest public trade`
    : loading
      ? 'Syncing today’s lab update'
      : 'Watch today’s lab update');
  const dek = episode?.dek ?? (trade
    ? `${trade.side.toUpperCase()} on ${trade.contract_ticker} settled ${formatPnl(trade.pnl)}.`
    : 'The latest short connects the video claim back to the live proof layer.');

  return (
    <section className="todays-episode-panel" aria-label="Watch today's episode">
      {onMinimize && (
        <button
          type="button"
          className="todays-episode-panel__minimize"
          onClick={onMinimize}
          aria-label="Minimize today's episode"
        >
          <ChevronDown size={15} aria-hidden />
        </button>
      )}
      <div className="todays-episode-panel__thumb" aria-hidden>
        {thumbnailUrl ? (
          <img
            key={thumbnailUrl}
            src={thumbnailUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => {
              setThumbnailAttempt((attempt) => ({
                key: thumbnailKey,
                index: attempt.key === thumbnailKey ? attempt.index + 1 : 1,
              }));
            }}
          />
        ) : (
          <Play size={28} />
        )}
        {thumbnailUrl && (
          <span>
            <Play size={14} />
          </span>
        )}
      </div>
      <div className="todays-episode-panel__body">
        <span>{formatDate(episode?.publishedAt ?? trade?.settled_at ?? null)} episode</span>
        <h2>{title}</h2>
        <p>{dek}</p>
      </div>
      <div className="todays-episode-panel__actions">
        {displayAgentId && trade && (
          <button
            type="button"
            onClick={() => {
              trackPublicLabEvent('watch_trade_click', {
                surface: 'todays_episode',
                agent_id: displayAgentId,
                trade_id: trade.id,
                episode_id: episode?.id,
              });
              onOpenTrade(displayAgentId, trade);
            }}
          >
            <ReceiptText size={14} aria-hidden />
            <span>See proof</span>
          </button>
        )}
        {displayAgentId && (
          <button
            type="button"
            onClick={() => {
              trackPublicLabEvent('agent_open', {
                surface: 'todays_episode',
                agent_id: displayAgentId,
                episode_id: episode?.id,
              });
              onOpenAgent(displayAgentId);
            }}
          >
            <span>Open agent</span>
          </button>
        )}
      </div>
      <div className="todays-episode-panel__links" aria-label="Episode platforms">
        {episode && episodePlatform ? (
          <a
            href={episode.episodeUrl}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackPublicLabEvent('episode_click', {
              platform: episode.platform,
              episode_id: episode.id,
              surface: 'todays_episode',
            })}
          >
            <span>Watch on {episodePlatform.label}</span>
            <ArrowUpRight size={11} aria-hidden />
          </a>
        ) : (
          SOCIAL_LINKS.map((link) => (
            <a
              key={link.id}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              onClick={() => trackPublicLabEvent('episode_click', { platform: link.id, surface: 'todays_episode' })}
            >
              <span>{link.label}</span>
              <ArrowUpRight size={11} aria-hidden />
            </a>
          ))
        )}
      </div>
    </section>
  );
}
