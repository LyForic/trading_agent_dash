import { ArrowUpRight, Play, ReceiptText } from 'lucide-react';
import { formatPnl } from '@/lib/formatting';
import { SOCIAL_LINKS, trackPublicLabEvent } from '@/lib/publicLab';
import type { AgentId, TradeLogEntry } from '@/lib/types';

interface Props {
  agentName: string | null;
  agentId: AgentId | null;
  trade: TradeLogEntry | null;
  onOpenAgent: (agentId: AgentId) => void;
  onOpenTrade: (agentId: AgentId, trade: TradeLogEntry) => void;
}

function formatDate(value: string | null) {
  if (!value) return 'Today';
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function TodaysEpisodePanel({ agentName, agentId, trade, onOpenAgent, onOpenTrade }: Props) {
  const title = agentName && trade
    ? `${agentName}'s latest public trade`
    : 'Watch today’s lab update';
  const dek = trade
    ? `${trade.side.toUpperCase()} on ${trade.contract_ticker} settled ${formatPnl(trade.pnl)}.`
    : 'The latest short connects the video claim back to the live proof layer.';

  return (
    <section className="todays-episode-panel" aria-label="Watch today's episode">
      <div className="todays-episode-panel__thumb" aria-hidden>
        <Play size={28} />
      </div>
      <div className="todays-episode-panel__body">
        <span>{formatDate(trade?.settled_at ?? null)} episode</span>
        <h2>{title}</h2>
        <p>{dek}</p>
      </div>
      <div className="todays-episode-panel__actions">
        {agentId && trade && (
          <button
            type="button"
            onClick={() => {
              trackPublicLabEvent('watch_trade_click', { surface: 'todays_episode', agent_id: agentId, trade_id: trade.id });
              onOpenTrade(agentId, trade);
            }}
          >
            <ReceiptText size={14} aria-hidden />
            <span>See proof</span>
          </button>
        )}
        {agentId && (
          <button
            type="button"
            onClick={() => {
              trackPublicLabEvent('agent_open', { surface: 'todays_episode', agent_id: agentId });
              onOpenAgent(agentId);
            }}
          >
            <span>Open agent</span>
          </button>
        )}
      </div>
      <div className="todays-episode-panel__links" aria-label="Episode platforms">
        {SOCIAL_LINKS.map((link) => (
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
        ))}
      </div>
    </section>
  );
}
