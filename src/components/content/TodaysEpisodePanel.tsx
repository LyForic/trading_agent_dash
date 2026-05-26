import { useMemo, useState } from 'react';
import { ArrowUpRight, ChevronDown, Play, ReceiptText } from 'lucide-react';
import { formatPnl } from '@/lib/formatting';
import { SOCIAL_LINKS, trackPublicLabEvent } from '@/lib/publicLab';
import type { PublicLabEpisode } from '@/lib/publicLab';
import type { AgentId, TradeLogEntry } from '@/lib/types';
import { SocialPlatformIcon } from './SocialPlatformIcon';

interface Props {
  agentName: string | null;
  agentId: AgentId | null;
  episode: PublicLabEpisode | null;
  loading?: boolean;
  trade: TradeLogEntry | null;
  onMinimize?: () => void;
  onOpenAgent: (agentId: AgentId) => void;
  onOpenTrade: (agentId: AgentId, trade: TradeLogEntry) => void;
  onOpenTradeId?: (agentId: AgentId, tradeId: string) => void;
}

function formatDate(value: string | null) {
  if (!value) return 'Today';
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function isSameLocalDay(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();
}

function episodeKicker(value: string | null) {
  if (!value) return 'Latest Episode';
  return isSameLocalDay(value) ? "Today's Episode" : 'Latest Episode';
}

function cleanEpisodeText(value: string | null | undefined, maxLength: number) {
  const compact = (value ?? '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/#[\w-]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!compact) return '';
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}...`;
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

function canonicalThumbnailUrl(url: string | null | undefined) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('ytimg.com')) return null;
    parsed.protocol = 'https:';
    parsed.hostname = 'i.ytimg.com';
    return parsed.toString();
  } catch {
    return null;
  }
}

function thumbnailCandidates(episode: PublicLabEpisode | null) {
  const videoId = youtubeVideoIdFromUrl(episode?.episodeUrl);
  const urls = [
    canonicalThumbnailUrl(episode?.thumbnailUrl),
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
  onOpenTradeId,
}: Props) {
  const episodePlatform = episode ? SOCIAL_LINKS.find((link) => link.id === episode.platform) : null;
  const thumbnails = useMemo(() => thumbnailCandidates(episode), [episode]);
  const thumbnailKey = `${episode?.id ?? 'none'}:${episode?.episodeUrl ?? ''}:${episode?.thumbnailUrl ?? ''}`;
  const [thumbnailAttempt, setThumbnailAttempt] = useState({ key: '', index: 0 });
  const thumbnailIndex = thumbnailAttempt.key === thumbnailKey ? thumbnailAttempt.index : 0;
  const thumbnailUrl = thumbnails[thumbnailIndex] ?? null;
  const displayAgentId = episode?.agentId ?? agentId;
  const proofTradeId = trade?.id ?? episode?.tradeId ?? null;
  const title = cleanEpisodeText(episode?.title, 66) || (agentName && trade
    ? `${agentName}'s latest public trade`
    : loading
      ? 'Syncing today’s lab update'
      : 'Watch today’s lab update');
  const dek = episode
    ? 'Watch the setup, then check the live proof layer here.'
    : trade
      ? `${trade.side.toUpperCase()} on ${trade.contract_ticker} settled ${formatPnl(trade.pnl)}.`
      : 'The latest short connects the video claim back to the live proof layer.';

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
          <div className="todays-episode-panel__fallback">
            {episodePlatform ? <SocialPlatformIcon id={episodePlatform.id} className="todays-episode-panel__fallback-icon" /> : <Play size={24} />}
            <strong>{episodePlatform?.label ?? 'BNF'}</strong>
            <span>{title}</span>
          </div>
        )}
        {thumbnailUrl && (
          <span>
            <Play size={14} />
          </span>
        )}
      </div>
      <div className="todays-episode-panel__body">
        <span>{episodeKicker(episode?.publishedAt ?? trade?.settled_at ?? null)} · {formatDate(episode?.publishedAt ?? trade?.settled_at ?? null)}</span>
        <h2>{title}</h2>
        <p>{dek}</p>
      </div>
      <div className="todays-episode-panel__actions">
        {displayAgentId && (trade || proofTradeId) && (
          <button
            type="button"
            onClick={() => {
              trackPublicLabEvent('watch_trade_click', {
                surface: 'todays_episode',
                agent_id: displayAgentId,
                trade_id: proofTradeId,
                episode_id: episode?.id,
              });
              if (trade) {
                onOpenTrade(displayAgentId, trade);
              } else if (proofTradeId) {
                onOpenTradeId?.(displayAgentId, proofTradeId);
              }
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
        {episode && episodePlatform && (
          <a
            href={episode.episodeUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Watch on ${episodePlatform.label}`}
            title={`Watch on ${episodePlatform.label}`}
            onClick={() => trackPublicLabEvent('latest_episode_open', {
              platform: episode.platform,
              episode_id: episode.id,
              surface: 'todays_episode',
              destination: episode.episodeUrl,
            })}
          >
            <SocialPlatformIcon id={episodePlatform.id} className="follow-experiment__icon" />
            <ArrowUpRight size={11} aria-hidden />
          </a>
        )}
        {SOCIAL_LINKS.filter((link) => link.id !== episodePlatform?.id).map((link) => (
          <a
            key={link.id}
            href={link.href}
            target="_blank"
            rel="noreferrer"
            aria-label={episode ? `Open ${link.label}` : `Watch on ${link.label}`}
            title={episode ? `Open ${link.label}` : `Watch on ${link.label}`}
            onClick={() => trackPublicLabEvent('social_click', {
              platform: link.id,
              surface: 'todays_episode',
              destination: link.href,
            })}
          >
            <SocialPlatformIcon id={link.id} className="follow-experiment__icon" />
            {!episode && <span>{link.label}</span>}
            <ArrowUpRight size={11} aria-hidden />
          </a>
        ))}
      </div>
    </section>
  );
}
