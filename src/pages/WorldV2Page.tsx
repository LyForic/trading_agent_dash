import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  ChevronDown,
  CircleHelp,
  FlaskConical,
  Menu,
  PanelLeftClose,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import { AgentLearnMorePanel } from '@/components/content/AgentLearnMorePanel';
import { FollowExperimentCta } from '@/components/content/FollowExperimentCta';
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
  SOCIAL_LINKS,
  trackPublicLabEvent,
} from '@/lib/publicLab';
import { fetchPublicTradeById, useAgentData } from '@/lib/useAgentData';
import { useAgentLearning } from '@/lib/useAgentLearning';
import { useAgentWindow } from '@/lib/useAgentWindow';
import { useBnfPortfolio } from '@/lib/useBnfPortfolio';
import { usePublicLabEpisode } from '@/lib/usePublicLabEpisode';
import { formatPnl, formatWinRate } from '@/lib/formatting';
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

interface BnfChange {
  cents: number;
  pct: number;
}

interface PhaserWorldProps {
  selectedAgentId: ZoneId | null;
  focusRequestId: number;
  onAgentAreaSelect: (agentId: ZoneId) => void;
}

function PhaserWorld({ selectedAgentId, focusRequestId, onAgentAreaSelect }: PhaserWorldProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<LivingWorldSceneInstance | null>(null);

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

      const scene = new LivingWorldScene();
      sceneRef.current = scene;

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
  }, []);

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
  return `$${Math.round(cents / 100).toLocaleString('en-US')}`;
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

function calculateAccountHigh(points: BnfPortfolioPoint[]) {
  if (points.length === 0) return null;
  return points.reduce((high, point) => Math.max(high, point.combined_cleared_cents), points[0].combined_cleared_cents);
}

function calculateBiggestDrawdown(points: BnfPortfolioPoint[]) {
  let peak: number | null = null;
  let drawdown = 0;

  for (const point of points) {
    const value = point.combined_cleared_cents;
    peak = peak === null ? value : Math.max(peak, value);
    drawdown = Math.max(drawdown, peak - value);
  }

  return points.length > 0 ? drawdown : null;
}

function newestPost(posts: AgentLearningPost[]) {
  return posts.reduce<AgentLearningPost | null>((latest, post) => {
    if (!latest) return post;
    return Date.parse(post.made_at) > Date.parse(latest.made_at) ? post : latest;
  }, null);
}

function cleanStatementFragment(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/https?:\/\/\S+/g, '')
    .trim()
    .replace(/[.?!]+$/, '');
}

function publicLabDailyStatement(posts: AgentLearningPost[], biggestMove: { agentId: AgentId; trade: TradeLogEntry } | null) {
  const latest = newestPost(posts);
  if (latest) {
    const title = cleanStatementFragment(latest.title);
    const category = latest.category?.toLowerCase() ?? '';
    if (category.includes('reliability')) return `Today’s lesson: ${title}. The lab is tightening reliability before the next run.`;
    if (category.includes('risk')) return `Today’s lesson: ${title}. The focus is risk control, not forcing action.`;
    if (category.includes('worked')) return `Today’s lesson: ${title}. The lab is checking whether that edge repeats tomorrow.`;
    if (category.includes('restraint')) return `Today’s lesson: ${title}. Sometimes the public proof is knowing when not to trade.`;
    return `Today’s lesson: ${title}. Come back tomorrow to see if it changes the rule set.`;
  }

  if (biggestMove) {
    const name = WORLD_MENU_AGENTS[biggestMove.agentId].name;
    const direction = biggestMove.trade.pnl >= 0 ? 'worked' : 'hurt';
    return `${name}'s biggest public move ${direction} today. The question is what the agents change next.`;
  }

  return PUBLIC_LAB_EXPERIMENT;
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
  const [labMinimized, setLabMinimized] = useState(false);
  const [episodeMinimized, setEpisodeMinimized] = useState(true);
  const [selectedTrade, setSelectedTrade] = useState<TradeLogEntry | null>(null);
  const [replayCaptureMode, setReplayCaptureMode] = useState(false);
  const [learnMoreOpen, setLearnMoreOpen] = useState(false);
  const [highlightLatestNote, setHighlightLatestNote] = useState(false);
  const [pendingDeepLinkTrade, setPendingDeepLinkTrade] = useState<{ tradeId: string; surface: string } | null>(null);
  const [worldIntroOpen, setWorldIntroOpen] = useState(false);
  const deepLinkAppliedRef = useRef(false);
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
  const biggestMove = useMemo(() => biggestMoveAcrossAgents(publicTradeLogsByAgent), [publicTradeLogsByAgent]);
  const publicLearningPosts = useMemo(
    () => [
      ...apexLearning.posts,
      ...metheusLearning.posts,
      ...baconLearning.posts,
      ...novaLearning.posts,
    ],
    [apexLearning.posts, metheusLearning.posts, baconLearning.posts, novaLearning.posts],
  );
  const publicLabStatement = useMemo(
    () => publicLabDailyStatement(publicLearningPosts, biggestMove),
    [publicLearningPosts, biggestMove],
  );
  const latestBnfPoint = bnf.data.points[bnf.data.points.length - 1];
  const bnfChanges = useMemo(
    () => BNF_CHANGE_WINDOWS.reduce<Record<BnfChangeWindow, BnfChange | null>>((acc, window) => {
      acc[window] = calculateBnfChange(bnf.data.points, window);
      return acc;
    }, { '24h': null, '7d': null, lifetime: null }),
    [bnf.data.points],
  );
  const selectedBnfChange = bnfChanges[balanceWindow];
  const accountHighCents = useMemo(() => calculateAccountHigh(bnf.data.points), [bnf.data.points]);
  const biggestDrawdownCents = useMemo(() => calculateBiggestDrawdown(bnf.data.points), [bnf.data.points]);
  const bestAgent = useMemo(() => {
    const liveAgents = data.agents.filter((agent) => PUBLIC_WORLD_AGENT_ORDER.includes(agent.id) && agent.record.settled > 0);
    if (liveAgents.length === 0) return null;
    return liveAgents.reduce((best, agent) => (agent.total_pnl > best.total_pnl ? agent : best), liveAgents[0]);
  }, [data.agents]);
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
    setReplayCaptureMode(false);
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
    setReplayCaptureMode(false);
    setPendingDeepLinkTrade(null);
    trackPublicLabEvent('replay_open', {
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
      setReplayCaptureMode(false);
      setPendingDeepLinkTrade(null);
      trackPublicLabEvent('replay_open', {
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
    setReplayCaptureMode(false);
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setPendingDeepLinkTrade(null);
    updateWorldDeepLink({ agent: null, trade: null, note: null });
    setFocusRequestId((requestId) => requestId + 1);
    if (isMobileViewport()) setMenuHidden(false);
  };

  const selectAgent = (id: WorldMenuAgentId, surface = 'agent_menu') => {
    trackPublicLabEvent('agent_open', { surface, agent_id: id });
    setSelectedAgentId(id);
    setSelectedTrade(null);
    setReplayCaptureMode(false);
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setPendingDeepLinkTrade(null);
    setWorldIntroOpen(false);
    updateWorldDeepLink({ agent: id, trade: null, note: null });
    setFocusRequestId((requestId) => requestId + 1);
    setBalanceMenuOpen(false);
    setMenuExpanded(false);
    if (isMobileViewport()) setMenuHidden(true);
  };

  const openLearnMore = (options?: { noteId?: string; surface?: string }) => {
    if (selectedLiveAgentId) {
      trackPublicLabEvent('strategy_open', {
        surface: options?.surface ?? 'agent_card',
        agent_id: selectedLiveAgentId,
        note_id: options?.noteId,
      });
      updateWorldDeepLink({ agent: selectedLiveAgentId, trade: null, note: 'latest' });
    }
    setSelectedTrade(null);
    setReplayCaptureMode(false);
    setLearnMoreOpen(true);
    setHighlightLatestNote(true);
  };

  const openTradeReplay = (row: TradeLogEntry) => {
    trackPublicLabEvent('replay_open', {
      surface: 'agent_card',
      agent_id: selectedLiveAgentId,
      trade_id: row.id,
      contract_ticker: row.contract_ticker,
    });
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setWorldIntroOpen(false);
    setReplayCaptureMode(false);
    setSelectedTrade(row);
    if (selectedLiveAgentId) updateWorldDeepLink({ agent: selectedLiveAgentId, trade: row.id, note: null });
  };

  const openTradeForAgent = (id: WorldMenuAgentId, row: TradeLogEntry, surface: string) => {
    trackPublicLabEvent('replay_open', {
      surface,
      agent_id: id,
      trade_id: row.id,
      contract_ticker: row.contract_ticker,
    });
    setSelectedAgentId(id);
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setWorldIntroOpen(false);
    setReplayCaptureMode(false);
    setSelectedTrade(row);
    updateWorldDeepLink({ agent: id, trade: row.id, note: null });
    setFocusRequestId((requestId) => requestId + 1);
    setBalanceMenuOpen(false);
    setMenuExpanded(false);
    if (isMobileViewport()) setMenuHidden(true);
  };

  const openTradeIdForAgent = (id: WorldMenuAgentId, tradeId: string, surface: string) => {
    setSelectedAgentId(id);
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setWorldIntroOpen(false);
    setReplayCaptureMode(false);
    setSelectedTrade(null);
    setPendingDeepLinkTrade({ tradeId, surface });
    windowSetters[id]('lifetime');
    updateWorldDeepLink({ agent: id, trade: tradeId, note: null });
    setFocusRequestId((requestId) => requestId + 1);
    setBalanceMenuOpen(false);
    setMenuExpanded(false);
    if (isMobileViewport()) setMenuHidden(true);
  };

  const openWorldIntro = () => {
    trackPublicLabEvent('intro_open', { surface: 'help_button' });
    setSelectedAgentId(null);
    setSelectedTrade(null);
    setReplayCaptureMode(false);
    setLearnMoreOpen(false);
    setHighlightLatestNote(false);
    setPendingDeepLinkTrade(null);
    updateWorldDeepLink({ agent: null, trade: null, note: null });
    setWorldIntroOpen(true);
    setFocusRequestId((requestId) => requestId + 1);
    setBalanceMenuOpen(false);
    setMenuExpanded(false);
    if (isMobileViewport()) setMenuHidden(true);
  };

  const closeWorldIntro = () => {
    setWorldIntroOpen(false);
    updateWorldDeepLink({ agent: null, trade: null, note: null });
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
  const captureLink = selectedLiveAgentId && selectedTrade
    ? `${window.location.origin}${window.location.pathname}?agent=${selectedLiveAgentId}&trade=${selectedTrade.id}`
    : undefined;

  return (
    <main className={replayCaptureMode ? 'world-v2-page world-v2-page--capture' : 'world-v2-page'}>
      <PhaserWorld selectedAgentId={selectedAgentId} focusRequestId={focusRequestId} onAgentAreaSelect={selectAgent} />

      {!isolatedTestMode && <div className="world-v2-vignette" />}

      {!isolatedTestMode && !selectedAgentId && !worldIntroOpen && (
        <div className="world-v2-utility-stack" aria-label="World controls">
          <button
            type="button"
            className="world-v2-help-button"
            onClick={openWorldIntro}
            aria-label="About the Living World"
          >
            <CircleHelp size={20} aria-hidden />
          </button>
          {labMinimized && (
            <button
              type="button"
              className="world-v2-lab-toggle-button"
              onClick={() => setLabMinimized(false)}
              aria-label="Show public lab tracker"
            >
              <FlaskConical size={19} aria-hidden />
            </button>
          )}
          {episodeMinimized && (
            <button
              type="button"
              className="world-v2-episode-toggle-button"
              onClick={() => setEpisodeMinimized(false)}
              aria-label="Show latest episode"
            >
              <Tv size={20} aria-hidden />
            </button>
          )}
        </div>
      )}

      {!isolatedTestMode && !selectedAgentId && !worldIntroOpen && !labMinimized && (
        <div className="world-v2-lab-stack">
          <div className="world-v2-lab-card">
            <PublicLabTracker
              currentBalanceCents={latestBnfPoint?.combined_cleared_cents ?? null}
              change24hCents={bnfChanges['24h']?.cents ?? null}
              lifetimePnlCents={bnfChanges.lifetime?.cents ?? null}
              agentCountLabel={`${PUBLIC_WORLD_AGENT_ORDER.length} public agents`}
              biggestMove={biggestMove}
              accountHighCents={accountHighCents}
              biggestDrawdownCents={biggestDrawdownCents}
              bestAgentName={bestAgent?.name ?? null}
              statement={publicLabStatement}
              points={bnf.data.points}
              onOpenMove={(agentId, trade) => openTradeForAgent(agentId, trade, 'public_lab_tracker')}
              onMinimize={() => setLabMinimized(true)}
            />
            <FollowExperimentCta surface="public_lab_tracker" />
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
                onClick={() => trackPublicLabEvent('follow_click', { surface: 'agent_menu_icons', platform: id })}
              >
                <SocialPlatformIcon id={id} />
              </a>
            ))}
          </div>
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
          className={`world-v2-stats-panel world-v2-stats-panel--${selectedPanelMode}${replayCaptureMode ? ' world-v2-stats-panel--capture' : ''}`}
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
                    setReplayCaptureMode(false);
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
                captureMode={replayCaptureMode}
                captureLink={captureLink}
                onCaptureModeChange={(enabled) => {
                  trackPublicLabEvent('replay_capture_toggle', {
                    agent_id: selectedLiveAgentId,
                    trade_id: selectedTrade.id,
                    enabled,
                  });
                  setReplayCaptureMode(enabled);
                }}
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

              <div className="world-v2-market-line">
                <BarChart3 size={15} aria-hidden />
                <span>{selectedAgent.market_label}</span>
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
            aria-label="About the Living World"
            style={{ '--agent-accent': 'var(--color-nova)' } as React.CSSProperties}
          >
            <div className="world-v2-stats-head world-v2-intro-head">
              <div className="world-v2-stats-title">
                <p>Living World</p>
                <h2>About the World</h2>
                <span>Trading agents, delayed data, and strategy notes</span>
              </div>
              <button
                type="button"
                className="world-v2-icon-button world-v2-close-button"
                onClick={closeWorldIntro}
                aria-label="Close world introduction"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <WorldIntroPanel />
          </section>
        </>
      )}

    </main>
  );
}
