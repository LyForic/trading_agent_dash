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
import { AGENT_META } from '@/lib/agentMeta';
import { formatPnl, formatWinRate } from '@/lib/formatting';
import type { Agent, AgentId, PerformanceWindow } from '@/lib/types';

type LivingWorldSceneInstance = InstanceType<typeof import('@/world-v2/LivingWorldScene').LivingWorldScene>;
type PhaserModule = typeof import('phaser');

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

const WORLD_AGENT_ORDER: AgentId[] = ['apex', 'metheus', 'gale'];

interface PhaserWorldProps {
  selectedAgentId: AgentId | null;
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

function isMobileViewport() {
  return window.matchMedia('(max-width: 760px)').matches;
}

export function WorldV2Page() {
  const worldTestParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isolatedTestMode = worldTestParams?.has('apexTest') === true
    || worldTestParams?.has('treeTest') === true
    || worldTestParams?.has('manifestWorld') === true
    || worldTestParams?.has('groundOnly') === true;
  const [selectedAgentId, setSelectedAgentId] = useState<AgentId | null>(null);
  const [focusRequestId, setFocusRequestId] = useState(0);
  const [menuHidden, setMenuHidden] = useState(false);
  const dragStartY = useRef<number | null>(null);

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
  const selectedAgent = selectedAgentId ? agentsById[selectedAgentId] : undefined;
  const selectedVm = selectedAgentId ? cardViewModels[selectedAgentId] : undefined;
  const latestBnfPoint = bnf.data.points[bnf.data.points.length - 1];
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

  const closeFocus = () => {
    setSelectedAgentId(null);
    setFocusRequestId((requestId) => requestId + 1);
    if (isMobileViewport()) setMenuHidden(false);
  };

  const selectAgent = (id: AgentId) => {
    setSelectedAgentId(id);
    setFocusRequestId((requestId) => requestId + 1);
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
    if (dragged > 42) setMenuHidden(true);
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
          onClick={() => setMenuHidden(false)}
          aria-label="Show agent menu"
        >
          <Menu size={18} aria-hidden />
        </button>
      )}

      {!isolatedTestMode && (
      <aside
        className={`world-v2-menu${menuHidden ? ' world-v2-menu--hidden' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <div className="world-v2-sheet-handle" aria-hidden />
        <div className="world-v2-menu-head">
          <div className="world-v2-menu-title">
            <p>Trading Gym V2</p>
            <h1>Living World</h1>
          </div>
          <div className="world-v2-total-bal" aria-label="Total balance" aria-live="polite">
            <span>Total Bal.</span>
            <strong>{totalBalanceCopy}</strong>
          </div>
          <button
            type="button"
            className="world-v2-icon-button"
            onClick={() => setMenuHidden(true)}
            aria-label="Hide agent menu"
          >
            <PanelLeftClose className="world-v2-hide-desktop" size={18} aria-hidden />
            <ChevronDown className="world-v2-hide-mobile" size={20} aria-hidden />
          </button>
        </div>

        <div className="world-v2-agent-list">
          {WORLD_AGENT_ORDER.map((id) => {
            const meta = AGENT_META[id];
            const vm = cardViewModels[id];
            const active = selectedAgentId === id;
            const gain = vm.total_pnl >= 0;
            return (
              <button
                key={id}
                type="button"
                className={`world-v2-agent-button${active ? ' world-v2-agent-button--active' : ''}`}
                onClick={() => selectAgent(id)}
                style={{ '--agent-accent': `var(--color-${id})` } as React.CSSProperties}
              >
                <span className="world-v2-agent-portrait">
                  <img src={PORTRAITS[id]} alt="" draggable={false} />
                </span>
                <span className="world-v2-agent-copy">
                  <span className="world-v2-agent-name">{meta.name}</span>
                  <span className="world-v2-agent-role">{TAGLINES[id]}</span>
                </span>
                <span className="world-v2-agent-metrics">
                  <span className={gain ? 'world-v2-gain' : 'world-v2-loss'}>
                    {formatPnl(vm.total_pnl)}
                  </span>
                  <span>{formatWinRate(vm.record.W, vm.record.settled)} WR</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="world-v2-data-status">
          <Sparkles size={14} aria-hidden />
          <span>{dataSourceLabel}</span>
        </div>
      </aside>
      )}

      {!isolatedTestMode && selectedAgentId && selectedAgent && selectedVm && (
        <section
          className="world-v2-stats-panel"
          aria-label={`${selectedAgent.name} trade stats`}
          style={{ '--agent-accent': `var(--color-${selectedAgentId})` } as React.CSSProperties}
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
              src={PORTRAITS[selectedAgentId]}
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
            agentId={selectedAgentId}
            agentName={selectedAgent.name}
            currentWindow={windowsByAgent[selectedAgentId]}
            setWindow={setWindowForAgent(selectedAgentId)}
          />

          <TradeLog
            rows={selectedVm.tradeLog}
            windowSettledCount={selectedVm.windowSettledCount}
            window={windowsByAgent[selectedAgentId]}
            hasOpenPosition={selectedAgent.open_position !== null}
          />
        </section>
      )}
    </main>
  );
}
