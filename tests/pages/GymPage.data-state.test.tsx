import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GymPage } from '@/pages/GymPage';
import type { AgentId } from '@/lib/types';
import type { AgentCardViewModel, AgentDataError, UseAgentDataResult } from '@/lib/useAgentData';

const EMPTY_VM: AgentCardViewModel = {
  total_pnl: 0,
  record: { W: 0, L: 0, BE: 0, settled: 0 },
  tradeLog: [],
  windowSettledCount: 0,
};

const emptyCardViewModels: Record<AgentId, AgentCardViewModel> = {
  apex: EMPTY_VM,
  gale: EMPTY_VM,
  metheus: EMPTY_VM,
};

const fetchFailed: AgentDataError = {
  kind: 'fetch-failed',
  message: 'Network error during query',
};

const { useAgentDataMock } = vi.hoisted(() => ({
  useAgentDataMock: vi.fn(),
}));

vi.mock('@/lib/useAgentData', () => ({
  useAgentData: useAgentDataMock,
}));

function result(overrides: Partial<UseAgentDataResult>): UseAgentDataResult {
  return {
    data: { updated_at: new Date().toISOString(), agents: [] },
    cardViewModels: emptyCardViewModels,
    source: 'live',
    error: null,
    loading: false,
    ...overrides,
  };
}

function renderGym(initialPath = '/gym') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <GymPage />
    </MemoryRouter>,
  );
}

describe('GymPage launch data states', () => {
  beforeEach(() => {
    useAgentDataMock.mockReset();
  });

  it('keeps the communal back button inline on /gym', () => {
    useAgentDataMock.mockReturnValue(result({ loading: true }));

    renderGym('/gym');

    const backButton = screen.getByRole('button', { name: 'Back to Town Square' });
    expect(backButton).toHaveClass('gym-inline-back-button');
    expect(backButton).not.toHaveClass('focus-back-button');
  });

  it('shows an accurate empty state when the first live data fetch fails', () => {
    useAgentDataMock.mockReturnValue(result({ error: fetchFailed }));

    renderGym('/gym');

    expect(screen.getByRole('alert')).toHaveTextContent('Live data unavailable');
    expect(screen.getByText(/public 30-minute-delayed data view did not respond/i)).toBeInTheDocument();
    expect(screen.getByText(/No private live trade data is exposed/i)).toBeInTheDocument();
  });
});
