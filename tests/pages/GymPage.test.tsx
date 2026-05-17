import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GymPage } from '@/pages/GymPage';

vi.mock('@/lib/useAgentData', async () => {
  const { mockCardViewModels, mockLeaderboard } = await import('@/lib/mockData');
  return {
    useAgentData: () => ({
      data: mockLeaderboard,
      cardViewModels: mockCardViewModels,
      source: 'mock',
      error: null,
      loading: false,
    }),
  };
});

function renderGym(initialPath = '/gym') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <GymPage />
    </MemoryRouter>,
  );
}

describe('GymPage Battle Arena V1.1', () => {
  it('leads the gym roster with the combined BNF portfolio card', () => {
    renderGym('/gym');
    expect(screen.getByText(/Brandon \+ Justin/i)).toBeInTheDocument();
  });

  it('opens and closes the Battle Arena from an InBattlePill', async () => {
    const user = userEvent.setup();
    renderGym('/gym');

    await user.click(screen.getByRole('button', { name: /Open battle arena for Apex/ }));

    expect(screen.getByRole('dialog', { name: /Apex is in battle/ })).toBeInTheDocument();
    expect(screen.getByText('KXBTC-26APR21-B67500')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Apex is in battle/ })).not.toBeInTheDocument();
    });
  });

  it('Escape closes Battle Arena without exiting focus mode', async () => {
    const user = userEvent.setup();
    renderGym('/apex');

    expect(screen.getByRole('button', { name: /Back to plaza/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open battle arena for Apex/ }));
    expect(screen.getByRole('dialog', { name: /Apex is in battle/ })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Apex is in battle/ })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Back to plaza/ })).toBeInTheDocument();
    expect(screen.getByText(/Trades · 24h/)).toBeInTheDocument();
  });
});
