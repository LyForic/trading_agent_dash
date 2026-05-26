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
  const { mockCardViewModels, mockLeaderboard } = await import('@/lib/mockData');
  return {
    fetchPublicTradeById: vi.fn(),
    useAgentData: () => ({
      data: mockLeaderboard,
      cardViewModels: mockCardViewModels,
      source: 'mock',
      error: null,
      loading: false,
    }),
  };
});

vi.mock('@/lib/useBnfPortfolio', async () => {
  const { mockBnfPortfolioSeries } = await import('@/lib/mockData');
  return {
    useBnfPortfolio: () => ({
      data: mockBnfPortfolioSeries,
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

  it('shows the first-run guide without opening Public Lab', () => {
    renderWorld();

    expect(screen.getByRole('region', { name: 'How this works' })).toBeInTheDocument();
    expect(screen.getByText(/This is the public lab for Brandon's trading agents/i)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /Public lab tracker/i })).not.toBeInTheDocument();
  });

  it('dismisses onboarding once and leaves the lab discoverable but collapsed', async () => {
    const user = userEvent.setup();
    renderWorld();

    await user.click(screen.getByRole('button', { name: /Start exploring/i }));

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'How this works' })).not.toBeInTheDocument();
    });
    expect(window.localStorage.getItem(GUIDE_STORAGE_KEY)).toBe('1');
    expect(screen.queryByRole('region', { name: /Public lab tracker/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Show public lab tracker/i })).toBeInTheDocument();
  });

  it('opens the lab from the flask and remembers that explicit choice', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GUIDE_STORAGE_KEY, '1');
    renderWorld();

    await user.click(screen.getByRole('button', { name: /Show public lab tracker/i }));

    expect(screen.getByRole('region', { name: /Public lab tracker/i })).toBeInTheDocument();
    expect(window.localStorage.getItem(LAB_STORAGE_KEY)).toBe('open');
    expect(window.location.search).toContain('lab=open');
  });

  it('honors lab=open links without auto-showing onboarding', () => {
    renderWorld('/?lab=open');

    expect(screen.queryByRole('region', { name: 'How this works' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /Public lab tracker/i })).toBeInTheDocument();
  });

  it('reopens the guide from the help icon after onboarding is seen', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(GUIDE_STORAGE_KEY, '1');
    renderWorld();

    await user.click(screen.getByRole('button', { name: /How this works/i }));

    expect(screen.getByRole('region', { name: 'How this works' })).toBeInTheDocument();
  });
});
