import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  Menu,
  PanelLeftClose,
  Sparkles,
  X,
} from 'lucide-react';
import { TimeFilterPill } from '@/components/content/TimeFilterPill';
import { TradeLog } from '@/components/content/TradeLog';
import { useAgentData } from '@/lib/useAgentData';
import { useAgentWindow } from '@/lib/useAgentWindow';
import { useBnfPortfolio } from '@/lib/useBnfPortfolio';
import { formatPnl, formatWinRate } from '@/lib/formatting';
import type { Agent, AgentId, BnfPortfolioPoint, PerformanceWindow } from '@/lib/types';
import type { ZoneId } from '@/world-v2/worldMapData';

type LivingWorldSceneInstance = InstanceType<typeof import('@/world-v2/LivingWorldScene').LivingWorldScene>;
type PhaserModule = typeof import('phaser');
type WorldMenuAgentId = AgentId | 'bacon';

const PORTRAITS: Record<AgentId, string> = {
  apex: '/world-v2/actors/apex-idle.png',
  metheus: '/world-v2/actors/metheus-idle.png',
  gale: '/world-v2/actors/gale-idle.png',
};

const TAGLINES: Record<AgentId, string> = {
  apex: 'Dojo market tactician',
  metheus: 'Archive researcher',
  gale: 'Weather spellcaster',
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
    name: 'Bacon',
    tagline: 'Chef pig',
    portrait: '/world-v2/actors/bacon-idle.svg',
  },
};

const WORLD_AGENT_ORDER: AgentId[] = ['apex', 'metheus', 'gale'];
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
  pct: number;
}

interface PhaserWorldProps {
  selectedAgentId: ZoneId | null;
  focusRequestId: number;
}

function PhaserWorld({ selectedAgentId, focusRequestId }: PhaserWorldProps) {
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
    return Number.isFinite(latest.pct_vs_baseline) ? { pct: latest.pct_vs_baseline } : null;
  }

  const start = closestWindowStart(points, latest, window);
  if (!start || start.combined_cleared_cents === 0) return null;

  return {
    pct: ((latest.combined_cleared_cents - start.combined_cleared_cents) / start.combined_cleared_cents) * 100,
  };
}

function isMobileViewport() {
  return window.matchMedia('(max-width: 760px)').matches;
}

function isLiveAgentId(id: WorldMenuAgentId | null): id is AgentId {
  return id === 'apex' || id === 'gale' || id === 'metheus';
}

export function WorldV2Page() {
  const worldTestParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const baconChunkMode = worldTestParams?.has('baconChunkTest') === true;
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
  const dragStartY = useRef<number | null>(null);
  const balanceWrapRef = useRef<HTMLDivElement | null>(null);

  const [apexWindow, setApexWindow] = useAgentWindow('apex');
  const [galeWindow, setGaleWindow] = useAgentWindow('gale');
  const [metheusWindow, setMetheusWindow] = useAgentWindow('metheus');

  const windowsByAgent = useMemo<Record<AgentId, PerformanceWindow>>(
    () => ({ apex: apexWindow, gale: galeWindow, metheus: metheusWindow }),
    [apexWindow, galeWindow, metheusWindow],
  );

  const { data, cardViewModels, source, error, loading } = useAgentData(windowsByAgent);
  const bnf = useBnfPortfolio();
  const agentsById = useMemo(() => agentMap(data.agents), [data.agents]);
  const worldAgentOrder = useMemo<WorldMenuAgentId[]>(
    () => (baconChunkMode ? [...WORLD_AGENT_ORDER, 'bacon'] : WORLD_AGENT_ORDER),
    [baconChunkMode],
  );
  const primaryWorldAgentOrder = worldAgentOrder.slice(0, 3);
  const extraWorldAgentOrder = worldAgentOrder.slice(3);
  const selectedLiveAgentId = isLiveAgentId(selectedAgentId) ? selectedAgentId : null;
  const selectedAgent = selectedLiveAgentId ? agentsById[selectedLiveAgentId] : undefined;
  const selectedVm = selectedLiveAgentId ? cardViewModels[selectedLiveAgentId] : undefined;
  const latestBnfPoint = bnf.data.points[bnf.data.points.length - 1];
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
    if (id === 'apex') return setApexWindow;
    if (id === 'gale') return setGaleWindow;
    return setMetheusWindow;
  };

  useEffect(() => {
    document.body.dataset.route = 'world-v2';
    return () => {
      delete document.body.dataset.route;
    };
  }, []);

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
    setFocusRequestId((requestId) => requestId + 1);
    if (isMobileViewport()) setMenuHidden(false);
  };

  const selectAgent = (id: WorldMenuAgentId) => {
    setSelectedAgentId(id);
    setFocusRequestId((requestId) => requestId + 1);
    setBalanceMenuOpen(false);
    setMenuExpanded(false);
    if (isMobileViewport()) setMenuHidden(true);
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

  return (
    <main className="world-v2-page">
      <PhaserWorld selectedAgentId={selectedAgentId} focusRequestId={focusRequestId} />

      {!isolatedTestMode && <div className="world-v2-vignette" />}

      {!isolatedTestMode && menuHidden && (
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
          <div className="world-v2-menu-title">
            <p>Trading Gym V2</p>
            <h1>Living World</h1>
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
              <span>Total Bal.</span>
              <strong>{totalBalanceCopy}</strong>
              <em className={changeClassName(selectedBnfChange?.pct ?? null)}>
                {BNF_CHANGE_WINDOW_LABELS[balanceWindow]} {formatPercent(selectedBnfChange?.pct ?? null)}
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
                        setBalanceWindow(changeWindow);
                        setBalanceMenuOpen(false);
                      }}
                    >
                      <span>{BNF_CHANGE_WINDOW_MENU_LABELS[changeWindow]}</span>
                      <strong className={changeClassName(change?.pct ?? null)}>
                        {formatPercent(change?.pct ?? null)}
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
          className="world-v2-stats-panel"
          aria-label={`${selectedAgent.name} trade stats`}
          style={{ '--agent-accent': `var(--color-${selectedLiveAgentId})` } as React.CSSProperties}
        >
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
          />
        </section>
      )}

      {!isolatedTestMode && selectedAgentId === 'bacon' && (
        <section
          className="world-v2-stats-panel"
          aria-label="Bacon area preview"
          style={{ '--agent-accent': 'var(--color-bacon)' } as React.CSSProperties}
        >
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
              src={WORLD_MENU_AGENTS.bacon.portrait}
              alt=""
              draggable={false}
            />
            <div className="world-v2-stats-title">
              <p>Kitchen prep</p>
              <h2>Bacon</h2>
              <span>Chef Pig</span>
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

          <div className="world-v2-stat-grid">
            <div>
              <span>Area</span>
              <strong>West</strong>
            </div>
            <div>
              <span>Helpers</span>
              <strong>5</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>Blockout</strong>
            </div>
          </div>

          <div className="world-v2-market-line">
            <BarChart3 size={15} aria-hidden />
            <span>Cooking and food expansion preview</span>
          </div>
        </section>
      )}
    </main>
  );
}
