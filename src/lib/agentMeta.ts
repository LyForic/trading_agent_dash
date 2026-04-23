import type { AgentId, Move } from './types';

/**
 * Per-agent character constants that do NOT belong in the database —
 * name, nickname, persona-level move catalog, sprite, room-relevant tags.
 *
 * The DB (pm_bets + bots) holds what changes trade-over-trade. This file
 * holds what defines the character. Single source of truth for these
 * fields across the client hook AND the Supabase Edge Function (which
 * duplicates it verbatim — see supabase/functions/leaderboard/index.ts).
 *
 * `pm_bets_cutoff_iso` is Brandon's "fresh start" reset: for Apex we
 * explicitly hide trades pre-dating his active iteration so the card
 * doesn't read her prior experiment's drawdown. Null means "show all."
 */
export interface AgentMeta {
  id: AgentId;
  name: string;
  nickname: string;
  market_label: string;
  sprite_url: string;
  cities_or_tags: string[];
  moves: Move[];
  pm_bets_cutoff_iso: string | null;
}

export const AGENT_META: Record<AgentId, AgentMeta> = {
  apex: {
    id: 'apex',
    name: 'Apex',
    nickname: 'Tempo Reader',
    market_label: 'Kalshi BTC (KXBTCD / KXBTC15M)',
    sprite_url: '/sprites/apex/rotations/south.png',
    cities_or_tags: ['BTC', 'ETH'],
    moves: [
      { name: 'VR Gate', locked: false },
      { name: 'Momentum Direction', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
    // Brandon is actively iterating Apex; hide the prior drawdown history.
    pm_bets_cutoff_iso: '2026-04-23T00:00:00Z',
  },
  gale: {
    id: 'gale',
    name: 'Gale',
    nickname: 'Weather Whisperer',
    market_label: 'Kalshi weather (KXHIGH)',
    sprite_url: '/sprites/gale/rotations/south.png',
    cities_or_tags: ['MIA', 'LAX', 'NYC', 'CHI', 'DEN'],
    moves: [
      { name: 'Normal CDF', locked: false },
      { name: 'Seasonal Bias', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
    pm_bets_cutoff_iso: null,
  },
  metheus: {
    id: 'metheus',
    name: 'Metheus',
    nickname: 'Long Arc',
    market_label: 'Kalshi BTC 15m (KXBTC15M)',
    sprite_url: '/sprites/metheus/rotations/south.png',
    cities_or_tags: ['BTC'],
    moves: [
      { name: 'Snipe: New', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
    pm_bets_cutoff_iso: null,
  },
};

export const AGENT_IDS: AgentId[] = ['apex', 'gale', 'metheus'];
