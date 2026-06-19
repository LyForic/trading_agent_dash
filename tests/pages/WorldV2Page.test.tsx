import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorldV2Page } from '@/pages/WorldV2Page';

vi.mock('phaser', () => ({
  default: {
    WEBGL: 'WEBGL',
    Scale: { RESIZE: 'RESIZE' },
    Game: vi.fn(function Game() {
      return { destroy: vi.fn() };
    }),
  },
}));

vi.mock('@/world-v2/LivingWorldScene', () => ({
  LivingWorldScene: vi.fn(function LivingWorldScene() {
    return { focusAgent: vi.fn() };
  }),
}));

vi.mock('@/lib/useAgentData', async () => {
  const { mockCardViewModels, mockLeaderboard, mockTradeLog } = await import('@/lib/mockData');
  return {
    fetchPublicTradeById: vi.fn(),
    fetchPublicTradesInRange: vi.fn(async (agentIds: string[], startIso: string, endIso: string) => {
      const startTime = Date.parse(startIso);
      const endTime = Date.parse(endIso);
      return agentIds.reduce<Record<string, unknown[]>>((acc, agentId) => {
        acc[agentId] = (mockTradeLog[agentId as keyof typeof mockTradeLog] ?? []).filter((trade) => {
          const settledTime = Date.parse(trade.settled_at);
          return Number.isFinite(settledTime) && settledTime >= startTime && settledTime < endTime;
        });
        return acc;
      }, {});
    }),
    useAgentData: () => ({
      data: mockLeaderboard,
      cardViewModels: mockCardViewModels,
      source: 'mock',
      error: null,
      loading: false,
    }),
  };
});

vi.mock('@/lib/useBnfPortfolio', async (importOriginal) => {
  const { mockBnfPortfolioSeries } = await import('@/lib/mockData');
  const { bnfPortfolioSnapshot } = await importOriginal<typeof import('@/lib/useBnfPortfolio')>();
  return {
    useBnfPortfolio: () => ({
      data: mockBnfPortfolioSeries,
      snapshot: bnfPortfolioSnapshot(mockBnfPortfolioSeries),
      source: 'mock',
      error: null,
      loading: false,
    }),
  };
});

vi.mock('@/lib/usePublicLabEpisode', () => ({
  usePublicLabEpisode: () => ({
    episode: null,
    loading: false,
    source: 'fallback',
  }),
}));

vi.mock('@/lib/useAgentLearning', () => ({
  useAgentLearning: () => ({
    posts: [],
    loading: false,
    error: null,
  }),
}));

vi.mock('@/lib/useAgentInsights', () => ({
  useAgentInsights: () => ({
    insights: [],
    latestInsight: null,
    loading: false,
    error: null,
    source: 'none',
  }),
}));

const GUIDE_STORAGE_KEY = 'gym:world-v2:guide-seen:v1';
const LAB_STORAGE_KEY = 'gym:world-v2:public-lab-state:v1';

function renderWorld(path = '/') {
  window.history.pushState(null, '', path);
  return render(<WorldV2Page />);
}

describe('WorldV2Page onboarding and Public Lab state', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.pushState(null, '', '/');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('shows the world first without auto-opening the guide or Public Lab', () => {
    renderWorld();

    expect(screen.queryByRole('dialog', { name: 'How this works' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /How this works/i })).toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: /What Gym Live is/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Public lab tracker/i })).not.toBeInTheDocument();
  });

  it('opens and dismisses onboarding from the help button', async () => {
    const user = userEvent.setup();
    renderWorld();

    await user.click(screen.getByRole('button', { name: /How this works/i }));

    expect(screen.getByRole('dialog', { name: 'How this works' })).toBeInTheDocument();
    expect(screen.getByText(/How Gym Live works/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Agents/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Proof/i })).toBeInTheDocument();
    expect(screen.getByText(/Each character is an autonomous agent/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Start exploring/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'How this works' })).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem(GUIDE_STORAGE_KEY)).toBe('1');
    expect(screen.queryByRole('region', { name: /Public lab tracker/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show public lab tracker/i })).toBeInTheDocument();
  });

  it('opens the lab from the flask without making refreshes reopen it', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GUIDE_STORAGE_KEY, '1');
    const { unmount } = renderWorld();

    await user.click(screen.getByRole('button', { name: /Show public lab tracker/i }));

    expect(screen.getByRole('region', { name: /Public lab tracker/i })).toBeInTheDocument();
    expect(window.localStorage.getItem(LAB_STORAGE_KEY)).toBeNull();
    expect(window.location.search).not.toContain('lab=open');

    unmount();
    renderWorld();

    expect(screen.queryByRole('region', { name: /Public lab tracker/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show public lab tracker/i })).toBeInTheDocument();
  });

  it('ignores older persisted Public Lab open state on fresh loads', () => {
    window.localStorage.setItem(GUIDE_STORAGE_KEY, '1');
    window.localStorage.setItem(LAB_STORAGE_KEY, 'open');
    renderWorld();

    expect(screen.queryByRole('region', { name: /Public lab tracker/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show public lab tracker/i })).toBeInTheDocument();
  });

  it('honors lab=open links without auto-showing onboarding', () => {
    renderWorld('/?lab=open');

    expect(screen.queryByRole('dialog', { name: 'How this works' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Public lab tracker/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /public agent account/i })).toBeInTheDocument();
    expect(screen.getByText(/public data/i)).toBeInTheDocument();
    expect(screen.getByText(/Today's lesson/i)).toBeInTheDocument();
    expect(screen.getByText(/Tomorrow watch/i)).toBeInTheDocument();
  });

  it('opens the Public Lab calendar and returns to a selected day', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GUIDE_STORAGE_KEY, '1');
    renderWorld('/?lab=open');

    await user.click(screen.getByRole('button', { name: /Open public lab calendar/i }));

    expect(screen.getByRole('region', { name: /Public lab calendar/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Public lab tracker/i })).not.toBeInTheDocument();

    const selectableDays = screen
      .getAllByRole('button', { name: /Show Public Lab for/i })
      .filter((button) => !(button as HTMLButtonElement).disabled);
    await user.click(selectableDays[0]);

    expect(screen.getByRole('region', { name: /Public lab tracker/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Public lab calendar/i })).not.toBeInTheDocument();
  });

  it('opens the account chart from URL with All selected by default', () => {
    window.localStorage.setItem(GUIDE_STORAGE_KEY, '1');
    renderWorld('/?lab=open&chart=account');

    expect(screen.getByRole('region', { name: /Account value chart/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^All$/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/Pre-tracking lead-in/i)).toBeInTheDocument();
  });

  it('reopens the guide from the help icon after onboarding is seen', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GUIDE_STORAGE_KEY, '1');
    renderWorld();

    await user.click(screen.getByRole('button', { name: /How this works/i }));

    expect(screen.getByRole('dialog', { name: 'How this works' })).toBeInTheDocument();
  });

  it('opens an agent panel as a focus-managed dialog', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GUIDE_STORAGE_KEY, '1');
    renderWorld();

    const apexButton = screen.getByRole('button', { name: /^Apex/i });
    await user.click(apexButton);

    const dialog = screen.getByRole('dialog', { name: 'Apex' });
    expect(dialog).toHaveFocus();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Apex' })).not.toBeInTheDocument();
    });
    expect(apexButton).toHaveFocus();
  });

  it('closes the guide with Escape and returns focus to the help button', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GUIDE_STORAGE_KEY, '1');
    renderWorld();

    await user.click(screen.getByRole('button', { name: /How this works/i }));
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'How this works' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /How this works/i })).toHaveFocus();
  });
});
