import type { AgentId, Move } from './types';

/**
 * Per-agent character constants that do NOT belong in the database —
 * name, nickname, persona-level move catalog, sprite, room-relevant tags.
 *
 * The DB (agent_trades + bots) holds what changes trade-over-trade. This
 * file holds what defines the character. Single source of truth for
 * these fields across the client hook AND the Supabase Edge Function
 * (which duplicates it verbatim — see supabase/functions/leaderboard/
 * index.ts).
 *
 * No per-agent cutoff field: agent_trades is the "formal reset" table,
 * and the pm_bets → agent_trades trigger only mirrors UPDATEs after its
 * install timestamp, so the table is intentionally fresh.
 */
export interface AgentMeta {
  id: AgentId;
  name: string;
  nickname: string;
  market_label: string;
  sprite_url: string;
  strategy_about: string;
  cities_or_tags: string[];
  moves: Move[];
}

export const AGENT_META: Record<AgentId, AgentMeta> = {
  apex: {
    id: 'apex',
    name: 'Apex',
    nickname: 'Tempo Reader',
    market_label: 'Kalshi BTC (KXBTCD / KXBTC15M)',
    sprite_url: '/sprites/apex/rotations/south.png',
    strategy_about:
      'Apex reads short-term crypto tempo, looking for moments where price movement, volume, and contract pricing disagree. The strategy favors disciplined entries over constant action: wait for momentum to confirm, size small, and avoid chasing when the market already repriced.',
    cities_or_tags: ['BTC', 'ETH'],
    moves: [
      { name: 'VR Gate', locked: false },
      { name: 'Momentum Direction', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
  },
  gale: {
    id: 'gale',
    name: 'Gale',
    nickname: 'Weather Whisperer',
    market_label: 'Kalshi weather (KXHIGH)',
    sprite_url: '/sprites/gale/rotations/south.png',
    strategy_about:
      'Gale studies weather markets by comparing forecast distribution, seasonal patterns, and local station behavior. The strategy is slower than the crypto agents: find mispriced tails, respect model uncertainty, and update only when the forecast meaningfully changes.',
    cities_or_tags: ['MIA', 'LAX', 'NYC', 'CHI', 'DEN'],
    moves: [
      { name: 'Normal CDF', locked: false },
      { name: 'Seasonal Bias', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
  },
  metheus: {
    id: 'metheus',
    name: 'Metheus',
    nickname: 'Long Arc',
    market_label: 'Kalshi BTC 15m (KXBTC15M)',
    sprite_url: '/sprites/metheus/rotations/south.png',
    strategy_about:
      'Metheus focuses on structure before action. It looks for repeated BTC 15-minute setups, tracks which entries fail, and prefers cleaner market context over noisy signals. The goal is to turn small observations into rules that survive more than one session.',
    cities_or_tags: ['BTC'],
    moves: [
      { name: 'Snipe: New', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
  },
  bacon: {
    id: 'bacon',
    name: 'Bacon',
    nickname: 'Chef Pig',
    market_label: 'Kalshi BTC 15m live canary',
    sprite_url: '/world-v2/actors/bacon-idle.png',
    strategy_about:
      'Bacon is the live canary for fast BTC 15-minute experiments. It keeps size small, tests new ingredients quickly, and turns every win or loss into a recipe note before a strategy graduates to the main kitchen.',
    cities_or_tags: ['BTC', 'Canary'],
    moves: [
      { name: 'Kitchen Edge', locked: false },
      { name: 'Produce Prep', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
  },
  nova: {
    id: 'nova',
    name: 'Nova',
    nickname: 'Celestial Phoenix',
    market_label: 'Kalshi ETH 15m (Nova)',
    sprite_url: '/world-v2/actors/nova-idle.png',
    strategy_about:
      'Nova watches ETH 15-minute markets for clean directional alignment and exhaustion. The strategy is built around patience: enter when the signal has enough heat, step aside when the move is crowded, and learn from each cycle.',
    cities_or_tags: ['ETH', '15m'],
    moves: [
      { name: 'Astral Drift', locked: false },
      { name: 'Moonline Read', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
  },
};

export const AGENT_IDS: AgentId[] = ['apex', 'gale', 'metheus', 'bacon', 'nova'];
