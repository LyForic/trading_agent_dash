import type { AgentId, TradeLogEntry } from './types';

export interface SocialLinkConfig {
  id: 'instagram' | 'tiktok' | 'youtube';
  label: string;
  href: string;
}

export interface PublicLabEpisode {
  id: string;
  title: string;
  dek: string | null;
  agentId: AgentId | null;
  tradeId: string | null;
  platform: SocialLinkConfig['id'];
  episodeUrl: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  source: string | null;
}

export interface AgentStrategyProfile {
  plainThesis: string;
  marketsTraded: string;
  riskPosture: string;
  failureMode: string;
  currentLearning: string;
}

export const PUBLIC_LAB_START_DATE = '2026-05-08T00:00:00-07:00';
export const PUBLIC_LAB_STARTING_BANKROLL_CENTS = 10_000_00;
export const PUBLIC_LAB_EXPERIMENT =
  'Five autonomous agents trade real prediction markets in public. The question is which strategy improves tomorrow.';

export const PUBLIC_LAB_OPEN_QUESTION =
  'Can the agents turn daily losses and wins into a better rule set before the next session?';

export const SOCIAL_LINKS: SocialLinkConfig[] = [
  {
    id: 'instagram',
    label: 'Instagram',
    href: 'https://www.instagram.com/brandonnfongg?igsh=NTc4MTIwNjQ2YQ%3D%3D&utm_source=qr',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    href: 'https://www.tiktok.com/@brandonnfongg?_r=1&_t=ZP-96Z6MTJdtl9',
  },
  {
    id: 'youtube',
    label: 'YouTube',
    href: 'https://youtube.com/@brandonnfongg?si=204J6kVu31_SXa31',
  },
];

export const PUBLIC_AGENT_IDS: AgentId[] = ['apex', 'metheus', 'bacon', 'nova'];

export const AGENT_STRATEGY_PROFILES: Record<AgentId, AgentStrategyProfile> = {
  apex: {
    plainThesis:
      'Apex tries to catch short bursts where BTC price action moves faster than the contract price updates.',
    marketsTraded: 'BTC and ETH short-window contracts, mainly 15-minute crypto markets.',
    riskPosture:
      'Small, selective entries. Apex should skip crowded moves and protect the account from chase trades.',
    failureMode:
      'It fails when momentum has already been priced in or when a quick reversal makes the signal stale.',
    currentLearning:
      'The current test is whether stricter confirmation improves hit rate without removing the best trades.',
  },
  gale: {
    plainThesis:
      'Gale looks for weather contracts where forecast uncertainty and market price do not line up.',
    marketsTraded: 'City temperature and weather outcome markets.',
    riskPosture:
      'Slower and more patient than the crypto agents. Gale should size around forecast confidence.',
    failureMode:
      'It fails when forecast updates arrive late or when a local station behaves differently than the model expects.',
    currentLearning:
      'The current test is separating true forecast movement from noise that should not trigger a trade.',
  },
  metheus: {
    plainThesis:
      'Metheus studies repeated BTC 15-minute setups and only acts when the structure is clean enough.',
    marketsTraded: 'BTC 15-minute contracts.',
    riskPosture:
      'Conservative rule-building. Metheus should trade less often and avoid unclear market context.',
    failureMode:
      'It fails when the setup definition is too broad and lets ordinary market noise look like edge.',
    currentLearning:
      'The current test is whether fewer, cleaner entries beat a larger sample of weaker signals.',
  },
  bacon: {
    plainThesis:
      'Bacon is the fast test kitchen. It tries small BTC experiments before a rule earns a permanent place.',
    marketsTraded: 'BTC 15-minute live canary contracts.',
    riskPosture:
      'Very small experimental sizing. Bacon is allowed to test quickly, but not to risk the whole lab.',
    failureMode:
      'It fails when a fresh idea is promoted too quickly before enough trades prove it works.',
    currentLearning:
      'The current test is turning every recipe into a clear keep, change, or kill decision.',
  },
  nova: {
    plainThesis:
      'Nova watches ETH 15-minute markets for clean alignment, exhaustion, and late-cycle reversals.',
    marketsTraded: 'ETH 15-minute contracts.',
    riskPosture:
      'Patient and signal-first. Nova should avoid entering when the move is already overheated.',
    failureMode:
      'It fails when a strong-looking move is just a temporary spike before the market cools off.',
    currentLearning:
      'The current test is finding the point where patience improves entries without missing the move.',
  },
};

export type PublicLabEventName =
  | 'agent_open'
  | 'episode_click'
  | 'follow_click'
  | 'intro_open'
  | 'page_view'
  | 'replay_capture_toggle'
  | 'replay_open'
  | 'strategy_open'
  | 'watch_trade_click';

export function publicLabDay(now = new Date()) {
  const start = new Date(PUBLIC_LAB_START_DATE);
  const elapsed = now.getTime() - start.getTime();
  return Math.max(1, Math.floor(elapsed / 86_400_000) + 1);
}

export function latestTradeAcrossAgents(
  tradeLogs: Partial<Record<AgentId, TradeLogEntry[]>>,
): { agentId: AgentId; trade: TradeLogEntry } | null {
  let latest: { agentId: AgentId; trade: TradeLogEntry; time: number } | null = null;

  for (const [agentId, rows] of Object.entries(tradeLogs) as Array<[AgentId, TradeLogEntry[] | undefined]>) {
    for (const trade of rows ?? []) {
      const time = Date.parse(trade.settled_at);
      if (!Number.isFinite(time)) continue;
      if (!latest || time > latest.time) latest = { agentId, trade, time };
    }
  }

  return latest ? { agentId: latest.agentId, trade: latest.trade } : null;
}

export function biggestMoveAcrossAgents(
  tradeLogs: Partial<Record<AgentId, TradeLogEntry[]>>,
): { agentId: AgentId; trade: TradeLogEntry } | null {
  let biggest: { agentId: AgentId; trade: TradeLogEntry; magnitude: number } | null = null;

  for (const [agentId, rows] of Object.entries(tradeLogs) as Array<[AgentId, TradeLogEntry[] | undefined]>) {
    for (const trade of rows ?? []) {
      const magnitude = Math.abs(trade.pnl);
      if (!biggest || magnitude > biggest.magnitude) biggest = { agentId, trade, magnitude };
    }
  }

  return biggest ? { agentId: biggest.agentId, trade: biggest.trade } : null;
}

export function trackPublicLabEvent(name: PublicLabEventName, detail: Record<string, unknown> = {}) {
  const payload = {
    event: `public_lab_${name}`,
    public_lab_event: name,
    timestamp: new Date().toISOString(),
    ...detail,
  };

  window.dispatchEvent(new CustomEvent('public-lab-event', { detail: payload }));

  const maybeWindow = window as Window & {
    __PUBLIC_LAB_EVENTS__?: Array<Record<string, unknown>>;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  };

  maybeWindow.__PUBLIC_LAB_EVENTS__ = maybeWindow.__PUBLIC_LAB_EVENTS__ ?? [];
  maybeWindow.__PUBLIC_LAB_EVENTS__.push(payload);
  maybeWindow.dataLayer?.push(payload);
  maybeWindow.gtag?.('event', name, detail);
  sendPublicLabAnalytics(payload);
}

function sendPublicLabAnalytics(payload: Record<string, unknown>) {
  const endpoint = import.meta.env.VITE_PUBLIC_LAB_ANALYTICS_ENDPOINT as string | undefined;
  if (!endpoint) return;

  const body = JSON.stringify(payload);
  const token = import.meta.env.VITE_PUBLIC_LAB_ANALYTICS_TOKEN as string | undefined;

  if (navigator.sendBeacon && !token) {
    const blob = new Blob([body], { type: 'application/json' });
    navigator.sendBeacon(endpoint, blob);
    return;
  }

  void fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
    keepalive: true,
  }).catch((error) => {
    console.warn(`[publicLab] analytics unavailable: ${(error as Error).message}`);
  });
}
