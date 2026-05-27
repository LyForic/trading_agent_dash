import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  FlaskConical,
  Menu,
  Moon,
  PanelLeftClose,
  Sparkles,
  Sun,
  Sunset,
  Tv,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  AccountValueChartPanel,
  type AccountChartPeriod,
} from '@/components/content/AccountValueChartPanel';
import { AgentLearnMorePanel } from '@/components/content/AgentLearnMorePanel';
import { FollowExperimentCta } from '@/components/content/FollowExperimentCta';
import { PublicLabCalendar } from '@/components/content/PublicLabCalendar';
import { PublicLabTracker } from '@/components/content/PublicLabTracker';
import { SocialPlatformIcon } from '@/components/content/SocialPlatformIcon';
import { TimeFilterPill } from '@/components/content/TimeFilterPill';
import { TodaysEpisodePanel } from '@/components/content/TodaysEpisodePanel';
import { TodaysFieldNote } from '@/components/content/TodaysFieldNote';
import { TradeLog } from '@/components/content/TradeLog';
import { TradeReplayPanel } from '@/components/content/TradeReplayPanel';
import { WorldIntroPanel } from '@/components/content/WorldIntroPanel';
import { AGENT_META } from '@/lib/agentMeta';
import {
  biggestMoveAcrossAgents,
  latestTradeAcrossAgents,
  PUBLIC_AGENT_IDS,
  PUBLIC_LAB_EXPERIMENT,
  PUBLIC_LAB_START_DATE,
  PUBLIC_LAB_STARTING_BANKROLL_CENTS,
  SOCIAL_LINKS,
  trackPublicLabEvent,
} from '@/lib/publicLab';
import { fetchPublicTradeById, fetchPublicTradesInRange, useAgentData } from '@/lib/useAgentData';
import { useAgentLearning } from '@/lib/useAgentLearning';
import { useAgentWindow } from '@/lib/useAgentWindow';
import { useBnfPortfolio } from '@/lib/useBnfPortfolio';
import { usePublicLabEpisode } from '@/lib/usePublicLabEpisode';
import { useTimeOfDayPreference } from '@/lib/useTimeOfDayPreference';
import { formatPnl, formatWinRate } from '@/lib/formatting';
import type { TimeOfDayPreference, WorldMode } from '@/lib/timeOfDay';
import type { Agent, AgentId, AgentLearningPost, BnfPortfolioPoint, PerformanceWindow, TradeLogEntry } from '@/lib/types';
import type { ZoneId } from '@/world-v2/worldMapData';

type LivingWorldSceneInstance = InstanceType<typeof import('@/world-v2/LivingWorldScene').LivingWorldScene>;
type PhaserModule = typeof import('phaser');
type WorldMenuAgentId = AgentId;

const PORTRAITS: Record<AgentId, string> = {
  apex: '/world-v2/actors/apex-idle.png',
  metheus: '/world-v2/actors/metheus-idle.png',
  gale: '/world-v2/actors/gale-idle.png',
  bacon: '/world-v2/actors/bacon-idle.png',
  nova: '/world-v2/actors/nova-idle.png',
};

const TAGLINES: Record<AgentId, string> = {
  apex: 'Fast BTC tactician',
  metheus: 'Patient BTC researcher',
  gale: 'Weather testing agent',
  bacon: 'Small-size BTC tester',
  nova: 'Disciplined ETH trader',
};

interface WorldMenuAgent {
  id: WorldMenuAgentId;
  liveId?: AgentId;
  name: string;
  tagline: string;
  portrait: string;
}

const WORLD_MENU_AGENTS: Record<WorldMenuAgentId, WorldMenuAgent> = {
  apex: { id: 'apex', liveId: 'apex', name: 'Apex', tagline: TAGLINES.apex, portrait: PORTRAITS.apex },
  metheus: { id: 'metheus', liveId: 'metheus', name: 'Metheus', tagline: TAGLINES.metheus, portrait: PORTRAITS.metheus },
  gale: { id: 'gale', liveId: 'gale', name: 'Gale', tagline: TAGLINES.gale, portrait: PORTRAITS.gale },
  bacon: {
    id: 'bacon',
    liveId: 'bacon',
    name: 'Bacon',
    tagline: TAGLINES.bacon,
    portrait: PORTRAITS.bacon,
  },
  nova: {
    id: 'nova',
    liveId: 'nova',
    name: 'Nova',
    tagline: TAGLINES.nova,
    portrait: PORTRAITS.nova,
  },
};

const WORLD_AGENT_ORDER: WorldMenuAgentId[] = ['apex', 'metheus', 'gale', 'bacon', 'nova'];
const PUBLIC_WORLD_AGENT_ORDER = PUBLIC_AGENT_IDS;

const BNF_CHANGE_WINDOWS = ['24h', '7d', 'lifetime'] as const;
type BnfChangeWindow = typeof BNF_CHANGE_WINDOWS[number];

const BNF_CHANGE_WINDOW_LABELS: Record<BnfChangeWindow, string> = {
  '24h': '24h',
  '7d': '7d',
  lifetime: 'Life',
};

const BNF_CHANGE_WINDOW_MENU_LABELS: Record<BnfChangeWindow, string> = {
  '24h': '24h',
  '7d': '7d',
  lifetime: 'Lifetime',
};

const BNF_CHANGE_WINDOW_MS: Record<Exclude<BnfChangeWindow, 'lifetime'>, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

const WORLD_GUIDE_SEEN_STORAGE_KEY = 'gym:world-v2:guide-seen:v1';

const TIME_MODE_OPTIONS: Array<{ value: TimeOfDayPreference; label: string; Icon: LucideIcon }> = [
  { value: 'auto', label: 'Auto', Icon: Clock3 },
  { value: 'daytime', label: 'Day', Icon: Sun },
  { value: 'dusk', label: 'Sunset', Icon: Sunset },
  { value: 'moonlit', label: 'Night', Icon: Moon },
];

interface BnfChange {
  cents: number;
  pct: number;
}

interface PublicLabNarrative {
  lesson: string;
  lessonSource: string;
  tomorrowWatch: string;
}

interface PublicLabDateTradeState {
  dateKey: string;
  tradeLogsByAgent: Partial<Record<AgentId, TradeLogEntry[]>>;
}

type PublicLabQueryState = 'open' | 'closed';
const ACCOUNT_CHART_PERIODS: AccountChartPeriod[] = ['1d', '1w', '1m', '1y', 'all'];

const PUBLIC_LAB_TIME_ZONE = 'America/Los_Angeles';
const PUBLIC_LAB_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: PUBLIC_LAB_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const PUBLIC_LAB_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: PUBLIC_LAB_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function readStorage(key: string) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can fail in private or constrained contexts; UI state still updates.
  }
}

function labStateFromSearch(search: string): PublicLabQueryState | null {
  const value = new URLSearchParams(search).get('lab')?.toLowerCase();
  if (!value) return null;
  if (['open', '1', 'true'].includes(value)) return 'open';
  if (['closed', 'close', 'collapsed', '0', 'false'].includes(value)) return 'closed';
  return null;
}

function labDateFromSearch(search: string) {
  const value = new URLSearchParams(search).get('date');
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return value;
}

function accountChartOpenFromSearch(search: string) {
  return new URLSearchParams(search).get('chart')?.toLowerCase() === 'account';
}

function accountChartPeriodFromSearch(search: string): AccountChartPeriod {
  const value = new URLSearchParams(search).get('period')?.toLowerCase();
  return ACCOUNT_CHART_PERIODS.includes(value as AccountChartPeriod)
    ? value as AccountChartPeriod
    : '1w';
}

function hasIntentionalContentLink(search: string) {
  const params = new URLSearchParams(search);
  return params.has('agent')
    || params.has('trade')
    || params.has('note')
    || labStateFromSearch(search) === 'open'
    || accountChartOpenFromSearch(search);
}

function initialPublicLabMinimized() {
  if (typeof window === 'undefined') return true;
  if (accountChartOpenFromSearch(window.location.search)) return false;
  const queryState = labStateFromSearch(window.location.search);
  if (queryState) return queryState !== 'open';
  return true;
}

function initialPublicLabDateKey() {
  if (typeof window === 'undefined') return null;
  return labDateFromSearch(window.location.search);
}

function initialAccountChartOpen() {
  if (typeof window === 'undefined') return false;
  return accountChartOpenFromSearch(window.location.search);
}

function initialAccountChartPeriod() {
  if (typeof window === 'undefined') return '1w';
  return accountChartPeriodFromSearch(window.location.search);
}

function shouldShowFirstRunGuide(isolatedTestMode: boolean) {
  if (typeof window === 'undefined' || isolatedTestMode) return false;
  if (hasIntentionalContentLink(window.location.search)) return false;
  return readStorage(WORLD_GUIDE_SEEN_STORAGE_KEY) !== '1';
}

function formatterPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return parts.find((part) => part.type === type)?.value ?? '0';
}

function parsePublicLabDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number);
  return { year, month, day };
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0');
}

function publicLabDateKey(date: Date) {
  if (!Number.isFinite(date.getTime())) return '';
  const parts = PUBLIC_LAB_DATE_FORMATTER.formatToParts(date);
  return [
    formatterPart(parts, 'year'),
    formatterPart(parts, 'month'),
    formatterPart(parts, 'day'),
  ].join('-');
}

function publicLabDateKeyFromIso(value: string | null | undefined) {
  if (!value) return '';
  return publicLabDateKey(new Date(value));
}

function addDaysToPublicLabDateKey(dateKey: string, days: number) {
  const { year, month, day } = parsePublicLabDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;
}

function publicLabTimeZoneOffsetMs(date: Date) {
  const parts = PUBLIC_LAB_DATE_TIME_FORMATTER.formatToParts(date);
  const zonedTime = Date.UTC(
    Number(formatterPart(parts, 'year')),
    Number(formatterPart(parts, 'month')) - 1,
    Number(formatterPart(parts, 'day')),
    Number(formatterPart(parts, 'hour')),
    Number(formatterPart(parts, 'minute')),
    Number(formatterPart(parts, 'second')),
  );
  return zonedTime - date.getTime();
}

function publicLabDateTimeToUtc(dateKey: string, hour = 0) {
  const { year, month, day } = parsePublicLabDateKey(dateKey);
  const targetTime = Date.UTC(year, month - 1, day, hour, 0, 0);
  let offset = publicLabTimeZoneOffsetMs(new Date(targetTime));
  offset = publicLabTimeZoneOffsetMs(new Date(targetTime - offset));
  return new Date(targetTime - offset);
}

function publicLabDateRange(dateKey: string) {
  return {
    startIso: publicLabDateTimeToUtc(dateKey).toISOString(),
    endIso: publicLabDateTimeToUtc(addDaysToPublicLabDateKey(dateKey, 1)).toISOString(),
  };
}

function formatPublicLabDateLabel(dateKey: string) {
  const { year, month, day } = parsePublicLabDateKey(dateKey);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function formatPublicLabAsOf(value: string | null | undefined) {
  if (!value) return 'Delayed public data pending';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Delayed public data pending';
  const time = new Intl.DateTimeFormat('en-US', {
    timeZone: PUBLIC_LAB_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
  return `As of ${time} PT · delayed data`;
}

interface PhaserWorldProps {
  timeMode: WorldMode;
  selectedAgentId: ZoneId | null;
  focusRequestId: number;
  onAgentAreaSelect: (agentId: ZoneId) => void;
}

function PhaserWorld({ timeMode, selectedAgentId, focusRequestId, onAgentAreaSelect }: PhaserWorldProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<LivingWorldSceneInstance | null>(null);
  const selectedAgentRef = useRef<ZoneId | null>(selectedAgentId);

  useEffect(() => {
    selectedAgentRef.current = selectedAgentId;
  }, [selectedAgentId]);

  useEffect(() => {
    if (!hostRef.current) return;

    let disposed = false;
    let game: InstanceType<PhaserModule['Game']> | null = null;

    (async () => {
      const [{ default: Phaser }, { LivingWorldScene }] = await Promise.all([
        import('phaser'),
        import('@/world-v2/LivingWorldScene'),
      ]);
      if (disposed || !hostRef.current) return;

      const scene = new LivingWorldScene({ timeMode });
      sceneRef.current = scene;
      scene.focusAgent(selectedAgentRef.current);

      game = new Phaser.Game({
        type: Phaser.WEBGL,
        parent: hostRef.current,
        backgroundColor: '#17130d',
        autoFocus: false,
        banner: false,
        desynchronized: true,
        powerPreference: 'high-performance',
        scene: [scene],
        scale: {
          mode: Phaser.Scale.RESIZE,
          parent: hostRef.current,
          width: hostRef.current.clientWidth || window.innerWidth,
          height: hostRef.current.clientHeight || window.innerHeight,
        },
        render: {
          antialias: false,
          pixelArt: true,
          roundPixels: true,
        },
        fps: {
          target: 60,
          min: 30,
          smoothStep: true,
        },
      });
    })();

    return () => {
      disposed = true;
      sceneRef.current = null;
      game?.destroy(true);
    };
  }, [timeMode]);

  useEffect(() => {
    sceneRef.current?.focusAgent(selectedAgentId);
  }, [selectedAgentId, focusRequestId]);

  useEffect(() => {
    const handleAgentAreaSelect = (event: Event) => {
      const agentId = (event as CustomEvent<{ agentId?: ZoneId }>).detail?.agentId;
      if (agentId) onAgentAreaSelect(agentId);
    };

    window.addEventListener('world-v2-agent-area-select', handleAgentAreaSelect);
    return () => window.removeEventListener('world-v2-agent-area-select', handleAgentAreaSelect);
  }, [onAgentAreaSelect]);

  return <div ref={hostRef} className="world-v2-game" aria-hidden />;
}

function agentMap(agents: Agent[]) {
  return agents.reduce<Partial<Record<AgentId, Agent>>>((acc, agent) => {
    acc[agent.id] = agent;
    return acc;
  }, {});
}

function statusCopy(agent: Agent | undefined, loading: boolean) {
  if (loading && !agent) return 'Loading';
  if (!agent) return 'Standing by';
  if (agent.open_position) return 'In Battle';
  if (agent.state === 'arriving_soon') return 'Arriving soon';
  return 'Roaming';
}

function formatTotalBalance(cents: number) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCurrencyChange(cents: number | null) {
  if (cents === null || !Number.isFinite(cents)) return '—';
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : '';
  const dollars = Math.abs(cents) / 100;
  return `${sign}${dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function changeClassName(value: number | null) {
  if (value === null || !Number.isFinite(value)) return 'world-v2-balance-change world-v2-balance-change--flat';
  if (value > 0) return 'world-v2-balance-change world-v2-gain';
  if (value < 0) return 'world-v2-balance-change world-v2-loss';
  return 'world-v2-balance-change world-v2-balance-change--flat';
}

function closestWindowStart(points: BnfPortfolioPoint[], latest: BnfPortfolioPoint, window: Exclude<BnfChangeWindow, 'lifetime'>) {
  const latestTime = Date.parse(latest.captured_at);
  if (!Number.isFinite(latestTime)) return null;
  const cutoff = latestTime - BNF_CHANGE_WINDOW_MS[window];
  let start: BnfPortfolioPoint | null = null;

  for (const point of points) {
    const pointTime = Date.parse(point.captured_at);
    if (!Number.isFinite(pointTime)) continue;
    if (pointTime <= cutoff) {
      start = point;
    } else {
      break;
    }
  }

  return start && start !== latest ? start : null;
}

function calculateBnfChange(points: BnfPortfolioPoint[], window: BnfChangeWindow): BnfChange | null {
  const latest = points[points.length - 1];
  if (!latest) return null;

  if (window === 'lifetime') {
    return Number.isFinite(latest.pct_vs_baseline)
      ? {
          cents: latest.combined_cleared_cents - latest.combined_baseline_cents,
          pct: latest.pct_vs_baseline,
        }
      : null;
  }

  const start = closestWindowStart(points, latest, window);
  if (!start || start.combined_cleared_cents === 0) return null;
  const cents = latest.combined_cleared_cents - start.combined_cleared_cents;

  return {
    cents,
    pct: (cents / start.combined_cleared_cents) * 100,
  };
}

function cleanStatementFragment(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .trim()
    .replace(/[.?!]+$/, '');
}

function postSignalScore(post: AgentLearningPost) {
  const category = post.category?.toLowerCase() ?? '';
  let score = 0;
  if (post.tomorrow_watch) score += 8;
  if (post.why_it_matters) score += 4;
  if (category.includes('risk') || category.includes('worked')) score += 3;
  if (category.includes('reliability') || category.includes('restraint')) score += 2;
  return score;
}

function highestSignalPost(posts: AgentLearningPost[]) {
  return posts.reduce<AgentLearningPost | null>((best, post) => {
    if (!best) return post;
    const score = postSignalScore(post);
    const bestScore = postSignalScore(best);
    if (score !== bestScore) return score > bestScore ? post : best;
    return Date.parse(post.made_at) > Date.parse(best.made_at) ? post : best;
  }, null);
}

function lessonFromPost(post: AgentLearningPost) {
  const body = cleanStatementFragment(post.viewer_angle || post.why_it_matters || post.title || post.body);
  if (body.length <= 150) return body;
  return `${body.slice(0, 149).trimEnd()}...`;
}

function tomorrowWatchFromPost(post: AgentLearningPost) {
  if (post.tomorrow_watch) return cleanStatementFragment(post.tomorrow_watch);
  const name = WORLD_MENU_AGENTS[post.agent_id].name;
  const category = post.category?.toLowerCase() ?? '';

  if (category.includes('risk')) {
    return `Can ${name}'s risk filter keep losses smaller without muting the best entries?`;
  }
  if (category.includes('worked')) {
    return `Can ${name}'s latest edge repeat in the next settled trade window?`;
  }
  if (category.includes('reliability')) {
    return `Can ${name}'s next run stay clean enough to trust the signal?`;
  }
  if (category.includes('restraint')) {
    return `Can ${name} keep skipping weak setups when the market gets noisy?`;
  }
  return `Can ${name}'s next field note turn this lesson into a better rule?`;
}

function publicLabNarrative(
  posts: AgentLearningPost[],
  biggestMove: { agentId: AgentId; trade: TradeLogEntry } | null,
): PublicLabNarrative {
  const signalPost = highestSignalPost(posts);
  if (signalPost) {
    const name = WORLD_MENU_AGENTS[signalPost.agent_id].name;
    return {
      lesson: lessonFromPost(signalPost),
      lessonSource: `Lesson from ${name}'s field note`,
      tomorrowWatch: tomorrowWatchFromPost(signalPost),
    };
  }

  if (biggestMove) {
    const name = WORLD_MENU_AGENTS[biggestMove.agentId].name;
    const direction = biggestMove.trade.pnl >= 0 ? 'worked' : 'hurt';
    return {
      lesson: `${name}'s largest settled trade ${direction} the account.`,
      lessonSource: `Lesson from ${name}'s settled trade`,
      tomorrowWatch: 'Waiting for the next settled trade window.',
    };
  }

  return {
    lesson: PUBLIC_LAB_EXPERIMENT,
    lessonSource: 'Lesson from the field-note queue',
    tomorrowWatch: 'Waiting for the next settled trade window.',
  };
}

function updateWorldDeepLink(params: Record<string, string | null>) {
  const next = new URL(window.location.href);
  for (const [key, value] of Object.entries(params)) {
    if (value === null) {
      next.searchParams.delete(key);
    } else {
      next.searchParams.set(key, value);
    }
  }
  window.history.replaceState(null, '', `${next.pathname}${next.search}${next.hash}`);
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 760px)').matches;
}

export function WorldV2Page() {
  const {
    mode: timeModePreference,
    effectiveMode,
    setMode: setTimeModePreference,
  } = useTimeOfDayPreference();
  const worldTestParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isolatedTestMode = worldTestParams?.has('apexTest') === true
    || worldTestParams?.has('treeTest') === true
    || worldTestParams?.has('manifestWorld') === true
    || worldTestParams?.has('groundOnly') === true;
  const [selectedAgentId, setSelectedAgentId] = useState<WorldMenuAgentId | null>(null);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [menuHidden, setMenuHidden] = useState(false);
  const [menuExpanded, setMenuExpanded] = useState(false);
  const [balanceWindow, setBalanceWindow] = useState<BnfChangeWindow>('24h');
  const [balanceMenuOpen, setBalanceMenuOpen] = useState(false);
  const [timeModeMenuOpen, setTimeModeMenuOpen] = useState(false);
  const [labMinimized, setLabMinimized] = useState(() => initialPublicLabMinimized());
  const [labCalendarOpen, setLabCalendarOpen] = useState(false);
  const [selectedLabDateKey, setSelectedLabDateKey] = useState<string | null>(() => initialPublicLabDateKey());
  const [accountChartOpen, setAccountChartOpen] = useState(() => initialAccountChartOpen());
  const [accountChartPeriod, setAccountChartPeriod] = useState<AccountChartPeriod>(() => initialAccountChartPeriod());
  const [publicLabDateTrades, setPublicLabDateTrades] = useState<PublicLabDateTradeState | null>(null);
  const [publicLabDateTradesLoading, setPublicLabDateTradesLoading] = useState(false);
  const [episodeMinimized, setEpisodeMinimized] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState<TradeLogEntry | null>(null);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [highlightLatestNote, setHighlightLatestNote] = useState(false);
  const [pendingDeepLinkTrade, setPendingDeepLinkTrade] = useState<{ tradeId: string; surface: string } | null>(null);
  const [worldIntroOpen, setWorldIntroOpen] = useState(() => shouldShowFirstRunGuide(isolatedTestMode));
  const deepLinkAppliedRef = useRef(false);
  const guideOpenTrackedRef = useRef(false);
  const initialLabOpenTrackedRef = useRef(false);
  const dragStartY = useRef<number | null>(null);
  const balanceWrapRef = useRef<HTMLDivElement | null>(null);

  const [apexWindow, setApexWindow] = useAgentWindow('apex');
  const [galeWindow, setGaleWindow] = useAgentWindow('gale');
  const [metheusWindow, setMetheusWindow] = useAgentWindow('metheus');
  const [baconWindow, setBaconWindow] = useAgentWindow('bacon');
  const [novaWindow, setNovaWindow] = useAgentWindow('nova');

  const windowsByAgent = useMemo<Record<AgentId, PerformanceWindow>>(
    () => ({ apex: apexWindow, gale: galeWindow, metheus: metheusWindow, bacon: baconWindow, nova: novaWindow }),
    [apexWindow, galeWindow, metheusWindow, baconWindow, novaWindow],
  );
  const windowSetters = useMemo<Record<AgentId, (w: PerformanceWindow) => void>>(
    () => ({
      apex: setApexWindow,
      gale: setGaleWindow,
      metheus: setMetheusWindow,
      bacon: setBaconWindow,
      nova: setNovaWindow,
    }),
    [setApexWindow, setGaleWindow, setMetheusWindow, setBaconWindow, setNovaWindow],
  );

  const { data, cardViewModels, source, error, loading } = useAgentData(windowsByAgent);
  const bnf = useBnfPortfolio();
  const publicLabEpisode = usePublicLabEpisode();
  const apexLearning = useAgentLearning('apex');
  const metheusLearning = useAgentLearning('metheus');
  const baconLearning = useAgentLearning('bacon');
  const novaLearning = useAgentLearning('nova');
  const agentsById = useMemo(() => agentMap(data.agents), [data.agents]);
  const worldAgentOrder = WORLD_AGENT_ORDER;
  const primaryWorldAgentOrder = worldAgentOrder.slice(0, 3);
  const extraWorldAgentOrder = worldAgentOrder.slice(3);
  const selectedLiveAgentId = selectedAgentId;
  const selectedAgent = selectedLiveAgentId ? agentsById[selectedLiveAgentId] : undefined;
  const selectedVm = selectedLiveAgentId ? cardViewModels[selectedLiveAgentId] : undefined;
  const selectedPanelMode = selectedTrade ? 'replay' : learnMoreOpen ? 'learn' : 'stats';
  const publicTradeLogsByAgent = useMemo(
    () => PUBLIC_WORLD_AGENT_ORDER.reduce<Partial<Record<AgentId, TradeLogEntry[]>>>((acc, id) => {
      acc[id] = cardViewModels[id]?.tradeLog ?? [];
      return acc;
    }, {}),
    [cardViewModels],
  );
  const latestTrade = useMemo(() => latestTradeAcrossAgents(publicTradeLogsByAgent), [publicTradeLogsByAgent]);
  const todaysEpisodeAgentId = publicLabEpisode.episode
    ? publicLabEpisode.episode.agentId
    : latestTrade?.agentId ?? null;
  const todaysEpisodeTrade = useMemo(() => {
    const episode = publicLabEpisode.episode;
    if (episode?.agentId && episode.tradeId) {
      return cardViewModels[episode.agentId]?.tradeLog.find((trade) => trade.id === episode.tradeId) ?? null;
    }
    if (episode?.agentId) {
      return cardViewModels[episode.agentId]?.tradeLog[0] ?? null;
    }
    if (episode) return null;
    return latestTrade?.trade ?? null;
  }, [cardViewModels, latestTrade?.trade, publicLabEpisode.episode]);
  const publicLearningPosts = useMemo(
    () => [
      ...apexLearning.posts,
      ...metheusLearning.posts,
      ...baconLearning.posts,
      ...novaLearning.posts,
    ],
    [apexLearning.posts, metheusLearning.posts, baconLearning.posts, novaLearning.posts],
  );
  const latestBnfPoint = bnf.data.points[bnf.data.points.length - 1];
  const publicLabStartDateKey = publicLabDateKey(new Date(PUBLIC_LAB_START_DATE));
  const latestPublicLabDateKey = latestBnfPoint
    ? publicLabDateKeyFromIso(latestBnfPoint.captured_at)
    : publicLabDateKey(new Date());
  const publicLabAvailableDateKeys = useMemo(() => {
    const dateKeys = new Set<string>();
    for (const point of bnf.data.points) {
      const dateKey = publicLabDateKeyFromIso(point.captured_at);
      if (dateKey && dateKey >= publicLabStartDateKey && dateKey <= latestPublicLabDateKey) {
        dateKeys.add(dateKey);
      }
    }
    if (
      selectedLabDateKey
      && selectedLabDateKey >= publicLabStartDateKey
      && selectedLabDateKey <= latestPublicLabDateKey
    ) {
      dateKeys.add(selectedLabDateKey);
    }
    if (dateKeys.size === 0 && latestPublicLabDateKey) dateKeys.add(latestPublicLabDateKey);
    return Array.from(dateKeys).sort();
  }, [bnf.data.points, latestPublicLabDateKey, publicLabStartDateKey, selectedLabDateKey]);
  const publicLabDateKeyForView =
    selectedLabDateKey && publicLabAvailableDateKeys.includes(selectedLabDateKey)
      ? selectedLabDateKey
      : latestPublicLabDateKey;
  const publicLabDateForView = useMemo(() => publicLabDateTimeToUtc(publicLabDateKeyForView, 12), [publicLabDateKeyForView]);
  const publicLabDateLabel = useMemo(() => formatPublicLabDateLabel(publicLabDateKeyForView), [publicLabDateKeyForView]);
  const publicLabBnfPoint = useMemo(() => {
    const pointsForDate = bnf.data.points.filter((point) => publicLabDateKeyFromIso(point.captured_at) === publicLabDateKeyForView);
    return pointsForDate[pointsForDate.length - 1] ?? null;
  }, [bnf.data.points, publicLabDateKeyForView]);
  const publicLabTradeLogsByAgent = useMemo(
    () => (publicLabDateTrades?.dateKey === publicLabDateKeyForView ? publicLabDateTrades.tradeLogsByAgent : {}),
    [publicLabDateKeyForView, publicLabDateTrades],
  );
  const largestSettledTrade = useMemo(() => biggestMoveAcrossAgents(publicLabTradeLogsByAgent), [publicLabTradeLogsByAgent]);
  const publicLabPostsForDate = useMemo(
    () => publicLearningPosts.filter((post) => publicLabDateKeyFromIso(post.made_at) === publicLabDateKeyForView),
    [publicLabDateKeyForView, publicLearningPosts],
  );
  const publicLabCopy = useMemo(
    () => publicLabNarrative(publicLabPostsForDate, largestSettledTrade),
    [publicLabPostsForDate, largestSettledTrade],
  );
  const publicLabAsOfLabel = useMemo(
    () => formatPublicLabAsOf(publicLabBnfPoint?.captured_at),
    [publicLabBnfPoint?.captured_at],
  );
  const publicLabLifePnlCents = publicLabBnfPoint
    ? publicLabBnfPoint.combined_cleared_cents - PUBLIC_LAB_STARTING_BANKROLL_CENTS
    : null;
  const bnfChanges = useMemo(
    () => BNF_CHANGE_WINDOWS.reduce<Record<BnfChangeWindow, BnfChange | null>>((acc, window) => {
      acc[window] = calculateBnfChange(bnf.data.points, window);
      return acc;
    }, { '24h': null, '7d': null, lifetime: null }),
    [bnf.data.points],
  );
  const selectedBnfChange = bnfChanges[balanceWindow];
  const totalBalanceCopy = latestBnfPoint
    ? formatTotalBalance(latestBnfPoint.combined_cleared_cents)
    : bnf.loading
      ? 'Loading'
      : bnf.error?.kind === 'fetch-failed'
        ? 'Offline'
        : 'Pending';

  const setWindowForAgent = (id: AgentId): ((w: PerformanceWindow) => void) => {
    return (window) => {
      setSelectedTrade(null);
      windowSetters[id](window);
    };
  };

  const setBalanceAndAgentWindows = (window: BnfChangeWindow) => {
    setBalanceWindow(window);
    setSelectedTrade(null);
    windowSetters.apex(window);
    windowSetters.gale(window);
    windowSetters.metheus(window);
    windowSetters.bacon(window);
    windowSetters.nova(window);
  };

  useEffect(() => {
    document.body.dataset.route = 'world-v2';
    trackPublicLabEvent('page_view', { surface: 'root', path: window.location.pathname });
    return () => {
      delete document.body.dataset.route;
    };
  }, []);

  useEffect(() => {
    if (!worldIntroOpen) {
      guideOpenTrackedRef.current = false;
      return;
    }
    if (guideOpenTrackedRef.current) return;
    guideOpenTrackedRef.current = true;
    trackPublicLabEvent('guide_view', { surface: 'guide', source: 'auto_or_help' });
  }, [worldIntroOpen]);

  useEffect(() => {
    if (initialLabOpenTrackedRef.current || labMinimized) return;
    if (labStateFromSearch(window.location.search) !== 'open') return;
    initialLabOpenTrackedRef.current = true;
    trackPublicLabEvent('public_lab_open', {
      surface: 'url',
      date: publicLabDateKeyForView,
      source: window.location.search.includes('date=') ? 'direct_date_link' : 'direct_lab_link',
    });
  }, [labMinimized, publicLabDateKeyForView]);

  useEffect(() => {
    if (!publicLabDateKeyForView) return;

    let cancelled = false;
    const { startIso, endIso } = publicLabDateRange(publicLabDateKeyForView);
    // Date changes intentionally start a fresh async day-history fetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPublicLabDateTradesLoading(true);

    void fetchPublicTradesInRange(PUBLIC_WORLD_AGENT_ORDER, startIso, endIso)
      .then((tradeLogsByAgent) => {
        if (cancelled) return;
        setPublicLabDateTrades({ dateKey: publicLabDateKeyForView, tradeLogsByAgent });
      })
      .catch((err) => {
        console.warn(`[WorldV2Page] Public Lab day trades unavailable: ${(err as Error).message}`);
        if (!cancelled) setPublicLabDateTrades({ dateKey: publicLabDateKeyForView, tradeLogsByAgent: {} });
      })
      .finally(() => {
        if (!cancelled) setPublicLabDateTradesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [publicLabDateKeyForView]);

  useEffect(() => {
    if (deepLinkAppliedRef.current) return;
    deepLinkAppliedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const agent = params.get('agent') as AgentId | null;
    if (!agent || !WORLD_AGENT_ORDER.includes(agent)) return;

    // Deep links are URL-driven initial UI state. This effect intentionally
    // hydrates the panel once after mount from the current query string.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedAgentId(agent);
    setWorldIntroOpen(false);
    setBalanceMenuOpen(false);
    setMenuExpanded(false);
    setFocusRequestId((requestId) => requestId + 1);
    if (isMobileViewport()) setMenuHidden(true);

    const tradeId = params.get('trade');
    const note = params.get('note');
    if (tradeId) {
      windowSetters[agent]('lifetime');
      setPendingDeepLinkTrade({ tradeId, surface: 'deep_link' });
      setLearnMoreOpen(false);
      setHighlightLatestNote(false);
    } else if (note === 'latest') {
      setSelectedTrade(null);
      setLearnMoreOpen(true);
      setHighlightLatestNote(true);
    }
  }, [windowSetters]);

  useEffect(() => {
    if (!pendingDeepLinkTrade || !selectedLiveAgentId) return;
    const row = cardViewModels[selectedLiveAgentId]?.tradeLog.find((trade) => trade.id === pendingDeepLinkTrade.tradeId);
    if (!row) return;
    // Replay deep links resolve after async trade data arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedTrade(row);
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setPendingDeepLinkTrade(null);
    trackPublicLabEvent('trade_replay_open', {
      surface: pendingDeepLinkTrade.surface,
      agent_id: selectedLiveAgentId,
      trade_id: row.id,
      contract_ticker: row.contract_ticker,
    });
  }, [cardViewModels, pendingDeepLinkTrade, selectedLiveAgentId]);

  useEffect(() => {
    if (!pendingDeepLinkTrade || !selectedLiveAgentId) return;
    const alreadyLoaded = cardViewModels[selectedLiveAgentId]?.tradeLog.some((trade) => trade.id === pendingDeepLinkTrade.tradeId);
    if (alreadyLoaded) return;

    let cancelled = false;
    void fetchPublicTradeById(selectedLiveAgentId, pendingDeepLinkTrade.tradeId).then((row) => {
      if (cancelled || !row) return;
      setSelectedTrade(row);
      setLearnMoreOpen(false);
      setHighlightLatestNote(false);
      setPendingDeepLinkTrade(null);
      trackPublicLabEvent('trade_replay_open', {
        surface: pendingDeepLinkTrade.surface,
        agent_id: selectedLiveAgentId,
        trade_id: row.id,
        contract_ticker: row.contract_ticker,
      });
    });

    return () => {
      cancelled = true;
    };
  }, [cardViewModels, pendingDeepLinkTrade, selectedLiveAgentId]);

  useEffect(() => {
    if (!balanceMenuOpen) return;

    const closeOnOutsidePointer = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && balanceWrapRef.current?.contains(target)) return;
      setBalanceMenuOpen(false);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBalanceMenuOpen(false);
    };

    window.addEventListener('pointerdown', closeOnOutsidePointer);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointer);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [balanceMenuOpen]);

  const closeFocus = () => {
    setSelectedAgentId(null);
    setSelectedTrade(null);
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setPendingDeepLinkTrade(null);
    updateWorldDeepLink({ agent: null, trade: null, note: null });
    setFocusRequestId((requestId) => requestId + 1);
    if (isMobileViewport()) setMenuHidden(false);
  };

  const setPublicLabOpen = (open: boolean, surface = 'utility_rail') => {
    setLabMinimized(!open);
    setLabCalendarOpen(false);
    setAccountChartOpen(false);
    setBalanceMenuOpen(false);
    setTimeModeMenuOpen(false);
    if (open) {
      setSelectedLabDateKey(null);
      updateWorldDeepLink({ lab: 'open', date: null, chart: null, period: null });
      trackPublicLabEvent('public_lab_open', { surface, date: latestPublicLabDateKey });
    } else {
      updateWorldDeepLink({ lab: null, date: null, chart: null, period: null });
      trackPublicLabEvent('public_lab_minimize', { surface, date: publicLabDateKeyForView });
    }
  };

  const openAccountChart = (surface = 'public_lab_tracker') => {
    setLabMinimized(false);
    setLabCalendarOpen(false);
    setAccountChartOpen(true);
    setBalanceMenuOpen(false);
    setTimeModeMenuOpen(false);
    updateWorldDeepLink({
      lab: 'open',
      chart: 'account',
      period: accountChartPeriod,
      date: selectedLabDateKey,
    });
    trackPublicLabEvent('account_chart_open', {
      surface,
      period: accountChartPeriod,
      date: publicLabDateKeyForView,
    });
  };

  const closeAccountChartToLab = () => {
    setAccountChartOpen(false);
    updateWorldDeepLink({ lab: 'open', chart: null, period: null, date: selectedLabDateKey });
  };

  const setAccountChartPeriodAndUrl = (period: AccountChartPeriod) => {
    setAccountChartPeriod(period);
    updateWorldDeepLink({ lab: 'open', chart: 'account', period, date: selectedLabDateKey });
  };

  const selectAgent = (id: WorldMenuAgentId, surface = 'agent_menu') => {
    trackPublicLabEvent('agent_open', { surface, agent_id: id });
    setSelectedAgentId(id);
    setSelectedTrade(null);
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setPendingDeepLinkTrade(null);
    setWorldIntroOpen(false);
    updateWorldDeepLink({ agent: id, trade: null, note: null });
    setFocusRequestId((requestId) => requestId + 1);
    setBalanceMenuOpen(false);
    setTimeModeMenuOpen(false);
    setMenuExpanded(false);
    if (isMobileViewport()) setMenuHidden(true);
  };

  const openLearnMore = (options?: { noteId?: string; surface?: string }) => {
    if (selectedLiveAgentId) {
      trackPublicLabEvent(options?.noteId ? 'field_note_open' : 'strategy_open', {
        surface: options?.surface ?? 'agent_card',
        agent_id: selectedLiveAgentId,
        note_id: options?.noteId,
      });
      updateWorldDeepLink({ agent: selectedLiveAgentId, trade: null, note: 'latest' });
    }
    setSelectedTrade(null);
    setLearnMoreOpen(true);
    setHighlightLatestNote(true);
  };

  const openTradeReplay = (row: TradeLogEntry) => {
    trackPublicLabEvent('trade_replay_open', {
      surface: 'agent_card',
      agent_id: selectedLiveAgentId,
      trade_id: row.id,
      contract_ticker: row.contract_ticker,
    });
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setWorldIntroOpen(false);
    setSelectedTrade(row);
    if (selectedLiveAgentId) updateWorldDeepLink({ agent: selectedLiveAgentId, trade: row.id, note: null });
  };

  const openTradeForAgent = (id: WorldMenuAgentId, row: TradeLogEntry, surface: string) => {
    trackPublicLabEvent('trade_replay_open', {
      surface,
      agent_id: id,
      trade_id: row.id,
      contract_ticker: row.contract_ticker,
    });
    setSelectedAgentId(id);
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setWorldIntroOpen(false);
    setSelectedTrade(row);
    updateWorldDeepLink({ agent: id, trade: row.id, note: null });
    setFocusRequestId((requestId) => requestId + 1);
    setBalanceMenuOpen(false);
    setTimeModeMenuOpen(false);
    setMenuExpanded(false);
    if (isMobileViewport()) setMenuHidden(true);
  };

  const openTradeIdForAgent = (id: WorldMenuAgentId, tradeId: string, surface: string) => {
    setSelectedAgentId(id);
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setWorldIntroOpen(false);
    setSelectedTrade(null);
    setPendingDeepLinkTrade({ tradeId, surface });
    windowSetters[id]('lifetime');
    updateWorldDeepLink({ agent: id, trade: tradeId, note: null });
    setFocusRequestId((requestId) => requestId + 1);
    setBalanceMenuOpen(false);
    setTimeModeMenuOpen(false);
    setMenuExpanded(false);
    if (isMobileViewport()) setMenuHidden(true);
  };

  const openWorldIntro = () => {
    setSelectedAgentId(null);
    setSelectedTrade(null);
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setPendingDeepLinkTrade(null);
    updateWorldDeepLink({ agent: null, trade: null, note: null });
    setWorldIntroOpen(true);
    setFocusRequestId((requestId) => requestId + 1);
    setBalanceMenuOpen(false);
    setTimeModeMenuOpen(false);
    setMenuExpanded(false);
    if (isMobileViewport()) setMenuHidden(true);
  };

  const closeWorldIntro = () => {
    writeStorage(WORLD_GUIDE_SEEN_STORAGE_KEY, '1');
    trackPublicLabEvent('guide_complete', { surface: 'guide', source: 'start_exploring' });
    setWorldIntroOpen(false);
    updateWorldDeepLink({ agent: null, trade: null, note: null });
    if (isMobileViewport()) setMenuHidden(false);
  };

  const openPublicLabFromIntro = () => {
    writeStorage(WORLD_GUIDE_SEEN_STORAGE_KEY, '1');
    trackPublicLabEvent('guide_complete', { surface: 'guide', source: 'open_public_lab' });
    setWorldIntroOpen(false);
    setSelectedAgentId(null);
    setSelectedTrade(null);
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setPendingDeepLinkTrade(null);
    updateWorldDeepLink({ agent: null, trade: null, note: null });
    setPublicLabOpen(true, 'guide');
    setFocusRequestId((requestId) => requestId + 1);
    setMenuExpanded(false);
    if (isMobileViewport()) setMenuHidden(false);
  };

  const handlePointerDown = (event: PointerEvent<HTMLElement>) => {
    if (!isMobileViewport()) return;
    dragStartY.current = event.clientY;
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>) => {
    if (dragStartY.current === null) return;
    const dragged = event.clientY - dragStartY.current;
    dragStartY.current = null;
    if (dragged < -42) {
      setMenuExpanded(true);
      setBalanceMenuOpen(false);
      return;
    }
    if (dragged > 42) {
      setBalanceMenuOpen(false);
      if (menuExpanded) {
        setMenuExpanded(false);
      } else {
        setMenuHidden(true);
      }
    }
  };

  const renderAgentButton = (id: WorldMenuAgentId) => {
    const menuAgent = WORLD_MENU_AGENTS[id];
    const vm = menuAgent.liveId ? cardViewModels[menuAgent.liveId] : null;
    const active = selectedAgentId === id;
    const gain = (vm?.total_pnl ?? 0) >= 0;
    return (
      <button
        key={id}
        type="button"
        className={`world-v2-agent-button${active ? ' world-v2-agent-button--active' : ''}`}
        onClick={() => selectAgent(id)}
        style={{ '--agent-accent': `var(--color-${id})` } as React.CSSProperties}
      >
        <span className="world-v2-agent-portrait">
          <img src={menuAgent.portrait} alt="" draggable={false} />
        </span>
        <span className="world-v2-agent-copy">
          <span className="world-v2-agent-name">{menuAgent.name}</span>
          <span className="world-v2-agent-role">{menuAgent.tagline}</span>
        </span>
        <span className="world-v2-agent-metrics">
          {vm ? (
            <>
              <span className={gain ? 'world-v2-gain' : 'world-v2-loss'}>
                {formatPnl(vm.total_pnl)}
              </span>
              <span>{formatWinRate(vm.record.W, vm.record.settled)} WR</span>
            </>
          ) : (
            <>
              <span>Prep</span>
              <span>Soon</span>
            </>
          )}
        </span>
      </button>
    );
  };

  const dataSourceLabel = source === 'live'
    ? 'Live delayed data'
    : error?.kind === 'fetch-failed'
      ? 'Data unavailable'
      : 'Mock data';
  const activeTimeModeOption = TIME_MODE_OPTIONS.find((option) => option.value === timeModePreference) ?? TIME_MODE_OPTIONS[0];
  const ActiveTimeModeIcon = activeTimeModeOption.Icon;

  return (
    <main className="world-v2-page">
      <PhaserWorld
        timeMode={effectiveMode}
        selectedAgentId={selectedAgentId}
        focusRequestId={focusRequestId}
        onAgentAreaSelect={selectAgent}
      />

      {!isolatedTestMode && <div className="world-v2-vignette" />}

      {!isolatedTestMode && !selectedAgentId && !worldIntroOpen && (
        <div className="world-v2-utility-stack" aria-label="World controls">
          <button
            type="button"
            className="world-v2-help-button"
            onClick={openWorldIntro}
            aria-label="How this works"
          >
            <CircleHelp size={20} aria-hidden />
          </button>
          <div className="world-v2-time-mode-wrap">
            <button
              type="button"
              className="world-v2-time-toggle-button"
              onClick={() => setTimeModeMenuOpen((open) => !open)}
              aria-label={`Map lighting: ${activeTimeModeOption.label}`}
              aria-expanded={timeModeMenuOpen}
              aria-haspopup="menu"
              aria-pressed={timeModeMenuOpen}
            >
              <ActiveTimeModeIcon size={19} aria-hidden />
            </button>
            {timeModeMenuOpen && (
              <div className="world-v2-time-menu" role="menu" aria-label="Map lighting">
                {TIME_MODE_OPTIONS.map(({ value, label, Icon }) => {
                  const active = value === timeModePreference;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      className={active ? 'world-v2-time-menu__option world-v2-time-menu__option--active' : 'world-v2-time-menu__option'}
                      onClick={() => setTimeModePreference(value)}
                    >
                      <Icon size={15} aria-hidden />
                      <span>{label}</span>
                      {active && <Check size={13} aria-hidden />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <button
            type="button"
            className="world-v2-lab-toggle-button"
            onClick={() => setPublicLabOpen(true)}
            aria-label={labMinimized ? 'Show public lab tracker' : 'Public lab tracker open'}
            aria-pressed={!labMinimized}
          >
            <FlaskConical size={19} aria-hidden />
          </button>
          {episodeMinimized && (
            <button
              type="button"
              className="world-v2-episode-toggle-button"
              onClick={() => {
                setEpisodeMinimized(false);
                trackPublicLabEvent('latest_episode_open', {
                  surface: 'utility_rail',
                  episode_id: publicLabEpisode.episode?.id,
                  source: 'tv_icon',
                });
              }}
              aria-label="Show latest episode"
            >
              <Tv size={20} aria-hidden />
            </button>
          )}
        </div>
      )}

      {!isolatedTestMode && !selectedAgentId && !worldIntroOpen && (!labMinimized || accountChartOpen) && (
        <div className="world-v2-lab-stack">
          <div className="world-v2-lab-card">
            {accountChartOpen ? (
              <AccountValueChartPanel
                points={bnf.data.points}
                period={accountChartPeriod}
                onPeriodChange={setAccountChartPeriodAndUrl}
                onBack={closeAccountChartToLab}
                onClose={() => setPublicLabOpen(false, 'account_chart')}
              />
            ) : labCalendarOpen ? (
              <PublicLabCalendar
                availableDateKeys={publicLabAvailableDateKeys}
                latestDateKey={latestPublicLabDateKey}
                minDateKey={publicLabStartDateKey}
                selectedDateKey={publicLabDateKeyForView}
                loading={publicLabDateTradesLoading}
                onClose={() => setLabCalendarOpen(false)}
                onSelectDate={(dateKey) => {
                  const latestSelected = dateKey === latestPublicLabDateKey;
                  setSelectedLabDateKey(latestSelected ? null : dateKey);
                  setLabCalendarOpen(false);
                  updateWorldDeepLink({
                    lab: 'open',
                    date: latestSelected ? null : dateKey,
                  });
                  trackPublicLabEvent('public_lab_date_selected', {
                    surface: 'public_lab_calendar',
                    date: dateKey,
                    source: latestSelected ? 'latest_control' : 'calendar_day',
                  });
                }}
              />
            ) : (
              <>
                <PublicLabTracker
                  currentBalanceCents={publicLabBnfPoint?.combined_cleared_cents ?? null}
                  lifetimePnlCents={publicLabLifePnlCents}
                  largestSettledTrade={largestSettledTrade}
                  asOfLabel={publicLabAsOfLabel}
                  lesson={publicLabCopy.lesson}
                  lessonSource={publicLabCopy.lessonSource}
                  tomorrowWatch={publicLabCopy.tomorrowWatch}
                  latestDateKey={latestPublicLabDateKey}
                  selectedDateKey={publicLabDateKeyForView}
                  labDate={publicLabDateForView}
                  dateLabel={publicLabDateLabel}
                  onOpenChart={() => openAccountChart('public_lab_tracker')}
                  onOpenCalendar={() => {
                    setLabCalendarOpen(true);
                    setBalanceMenuOpen(false);
                    updateWorldDeepLink({
                      lab: 'open',
                      date: selectedLabDateKey,
                    });
                    trackPublicLabEvent('public_lab_calendar_open', {
                      surface: 'public_lab_tracker',
                      date: publicLabDateKeyForView,
                    });
                  }}
                  onOpenSettledTrade={(agentId, trade) => openTradeForAgent(agentId, trade, 'public_lab_largest_settled_trade')}
                  onMinimize={() => setPublicLabOpen(false, 'public_lab_tracker')}
                />
                <FollowExperimentCta surface="public_lab_tracker" />
              </>
            )}
          </div>
        </div>
      )}

      {!isolatedTestMode && !selectedAgentId && !worldIntroOpen && (
        <div className="world-v2-episode-stack">
          {!episodeMinimized && (
            <TodaysEpisodePanel
              agentId={todaysEpisodeAgentId}
              agentName={todaysEpisodeAgentId ? WORLD_MENU_AGENTS[todaysEpisodeAgentId].name : null}
              episode={publicLabEpisode.episode}
              loading={publicLabEpisode.loading}
              trade={todaysEpisodeTrade}
              onMinimize={() => setEpisodeMinimized(true)}
              onOpenAgent={(agentId) => selectAgent(agentId, 'todays_episode')}
              onOpenTrade={(agentId, trade) => openTradeForAgent(agentId, trade, 'todays_episode')}
              onOpenTradeId={(agentId, tradeId) => openTradeIdForAgent(agentId, tradeId, 'todays_episode')}
            />
          )}
        </div>
      )}

      {!isolatedTestMode && menuHidden && !selectedAgentId && !worldIntroOpen && (
        <button
          type="button"
          className="world-v2-menu-peek"
          onClick={() => {
            setMenuHidden(false);
            setMenuExpanded(false);
          }}
          aria-label="Show agent menu"
        >
          <Menu size={18} aria-hidden />
        </button>
      )}

      {!isolatedTestMode && (
      <aside
        className={`world-v2-menu${menuHidden ? ' world-v2-menu--hidden' : ''}${menuExpanded ? ' world-v2-menu--expanded' : ''}${balanceMenuOpen ? ' world-v2-menu--balance-open' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <div className="world-v2-sheet-handle" aria-hidden />
        <div className="world-v2-menu-head">
          <div ref={balanceWrapRef} className="world-v2-balance-wrap">
            <button
              type="button"
              className="world-v2-total-bal"
              aria-label="Total balance"
              aria-live="polite"
              aria-expanded={balanceMenuOpen}
              aria-controls="world-v2-balance-menu"
              onClick={() => setBalanceMenuOpen((open) => !open)}
            >
              <strong>{totalBalanceCopy}</strong>
              <em className={changeClassName(selectedBnfChange?.pct ?? null)}>
                <span>{BNF_CHANGE_WINDOW_LABELS[balanceWindow]}</span>
                <span>{formatCurrencyChange(selectedBnfChange?.cents ?? null)}</span>
                <span>{formatPercent(selectedBnfChange?.pct ?? null)}</span>
              </em>
            </button>
            {balanceMenuOpen && (
              <div id="world-v2-balance-menu" className="world-v2-balance-menu" role="menu" aria-label="Balance change window">
                {BNF_CHANGE_WINDOWS.map((changeWindow) => {
                  const change = bnfChanges[changeWindow];
                  const active = balanceWindow === changeWindow;
                  return (
                    <button
                      key={changeWindow}
                      type="button"
                      className={`world-v2-balance-option${active ? ' world-v2-balance-option--active' : ''}`}
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => {
                        setBalanceAndAgentWindows(changeWindow);
                        setBalanceMenuOpen(false);
                      }}
                    >
                      <span>{BNF_CHANGE_WINDOW_MENU_LABELS[changeWindow]}</span>
                      <strong className={changeClassName(change?.pct ?? null)}>
                        <span>{formatCurrencyChange(change?.cents ?? null)}</span>
                        <span>{formatPercent(change?.pct ?? null)}</span>
                      </strong>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="world-v2-social-links" aria-label="Social links">
            {SOCIAL_LINKS.map(({ id, href, label }) => (
              <a
                key={id}
                className="world-v2-social-link"
                href={href}
                target="_blank"
                rel="noreferrer"
                aria-label={label}
                title={label}
                onClick={() => trackPublicLabEvent('social_click', {
                  surface: 'agent_menu_icons',
                  platform: id,
                  destination: href,
                })}
              >
                <SocialPlatformIcon id={id} />
              </a>
            ))}
          </div>
          <button
            type="button"
            className="world-v2-icon-button"
            onClick={() => {
              setBalanceMenuOpen(false);
              setMenuExpanded(false);
              setMenuHidden(true);
            }}
            aria-label="Hide agent menu"
          >
            <PanelLeftClose className="world-v2-hide-desktop" size={18} aria-hidden />
            <ChevronDown className="world-v2-hide-mobile" size={20} aria-hidden />
          </button>
        </div>

        <div className="world-v2-agent-list">
          <div className="world-v2-agent-list-primary">
            {primaryWorldAgentOrder.map(renderAgentButton)}
          </div>
          {extraWorldAgentOrder.length > 0 && (
            <div className="world-v2-agent-list-extra">
              {extraWorldAgentOrder.map(renderAgentButton)}
            </div>
          )}
        </div>

        <div className="world-v2-data-status">
          <Sparkles size={14} aria-hidden />
          <span>{dataSourceLabel}</span>
        </div>
      </aside>
      )}

      {!isolatedTestMode && selectedLiveAgentId && selectedAgent && selectedVm && (
        <section
          className={`world-v2-stats-panel world-v2-stats-panel--${selectedPanelMode}`}
          aria-label={
            selectedTrade
              ? `${selectedAgent.name} trade replay`
              : learnMoreOpen
                ? `${selectedAgent.name} learn more`
                : `${selectedAgent.name} trade stats`
          }
          style={{ '--agent-accent': `var(--color-${selectedLiveAgentId})` } as React.CSSProperties}
        >
          {selectedTrade ? (
            <>
              <div className="world-v2-stats-head world-v2-replay-head">
                <button
                  type="button"
                  className="world-v2-back-button"
                  onClick={() => {
                    setSelectedTrade(null);
                    updateWorldDeepLink({ trade: null });
                  }}
                  aria-label="Back to trade stats"
                >
                  <ArrowLeft size={18} aria-hidden />
                </button>
                <div className="world-v2-stats-title">
                  <p>{selectedAgent.name}</p>
                  <h2>Trade Replay</h2>
                  <span>{selectedTrade.contract_ticker}</span>
                </div>
                <button
                  type="button"
                  className="world-v2-icon-button world-v2-close-button"
                  onClick={closeFocus}
                  aria-label="Close stats panel"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>

              <TradeReplayPanel
                key={selectedTrade.id}
                row={selectedTrade}
              />
              <FollowExperimentCta surface="replay_modal" compact />
            </>
          ) : learnMoreOpen ? (
            <>
              <div className="world-v2-stats-head world-v2-replay-head">
                <button
                  type="button"
                  className="world-v2-back-button"
                  onClick={() => {
                    setLearnMoreOpen(false);
                    setHighlightLatestNote(false);
                    updateWorldDeepLink({ note: null });
                  }}
                  aria-label="Back to trade stats"
                >
                  <ArrowLeft size={18} aria-hidden />
                </button>
                <div className="world-v2-stats-title">
                  <p>{selectedAgent.name}</p>
                  <h2>Learn More</h2>
                  <span>{selectedAgent.nickname}</span>
                </div>
                <button
                  type="button"
                  className="world-v2-icon-button world-v2-close-button"
                  onClick={closeFocus}
                  aria-label="Close stats panel"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>

              <AgentLearnMorePanel
                agentId={selectedLiveAgentId}
                about={AGENT_META[selectedLiveAgentId].strategy_about}
                representativeTrades={selectedVm.tradeLog.slice(0, 4)}
                highlightLatestNote={highlightLatestNote}
              />
              <FollowExperimentCta surface="strategy_panel" compact />
            </>
          ) : (
            <>
              <div className="world-v2-stats-head">
                <button
                  type="button"
                  className="world-v2-back-button"
                  onClick={closeFocus}
                  aria-label="Back to full world"
                >
                  <ArrowLeft size={18} aria-hidden />
                </button>
                <img
                  className="world-v2-stats-portrait"
                  src={PORTRAITS[selectedLiveAgentId]}
                  alt=""
                  draggable={false}
                />
                <div className="world-v2-stats-title">
                  <p>{statusCopy(selectedAgent, loading)}</p>
                  <h2>{selectedAgent.name}</h2>
                  <span>{selectedAgent.nickname}</span>
                </div>
                <button
                  type="button"
                  className="world-v2-icon-button world-v2-learn-button"
                  onClick={() => openLearnMore()}
                  aria-label={`Learn more about ${selectedAgent.name}`}
                >
                  <BookOpen size={18} aria-hidden />
                </button>
                <button
                  type="button"
                  className="world-v2-icon-button world-v2-close-button"
                  onClick={closeFocus}
                  aria-label="Close stats panel"
                >
                  <X size={18} aria-hidden />
                </button>
              </div>

              <div className="world-v2-stat-grid">
                <div>
                  <span>P&L</span>
                  <strong className={selectedVm.total_pnl >= 0 ? 'world-v2-gain' : 'world-v2-loss'}>
                    {formatPnl(selectedVm.total_pnl)}
                  </strong>
                </div>
                <div>
                  <span>Win Rate</span>
                  <strong>{formatWinRate(selectedVm.record.W, selectedVm.record.settled)}</strong>
                </div>
                <div>
                  <span>Settled</span>
                  <strong>{selectedVm.record.settled}</strong>
                </div>
              </div>

              <TodaysFieldNote agentId={selectedLiveAgentId} onOpenHistory={openLearnMore} />

              <TimeFilterPill
                agentId={selectedLiveAgentId}
                agentName={selectedAgent.name}
                currentWindow={windowsByAgent[selectedLiveAgentId]}
                setWindow={setWindowForAgent(selectedLiveAgentId)}
              />

              <TradeLog
                rows={selectedVm.tradeLog}
                windowSettledCount={selectedVm.windowSettledCount}
                window={windowsByAgent[selectedLiveAgentId]}
                hasOpenPosition={selectedAgent.open_position !== null}
                replayMode="external"
                onTradeSelect={openTradeReplay}
              />
              <FollowExperimentCta surface="agent_card" compact />
            </>
          )}
        </section>
      )}

      {!isolatedTestMode && worldIntroOpen && (
        <>
          <div className="world-v2-modal-backdrop" aria-hidden />
          <section
            className="world-v2-stats-panel world-v2-stats-panel--world-intro"
            aria-label="How this works"
            style={{ '--agent-accent': 'var(--color-nova)' } as React.CSSProperties}
          >
            <div className="world-v2-stats-head world-v2-intro-head">
              <div className="world-v2-stats-title">
                <p>Gym Live</p>
                <h2>How Gym Live works</h2>
                <span>Follow real agents, real trades, and daily lessons as the public account evolves.</span>
              </div>
              <button
                type="button"
                className="world-v2-icon-button world-v2-close-button"
                onClick={closeWorldIntro}
                aria-label="Close guide"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <WorldIntroPanel onStart={closeWorldIntro} onOpenLab={openPublicLabFromIntro} />
          </section>
        </>
      )}

    </main>
  );
}
