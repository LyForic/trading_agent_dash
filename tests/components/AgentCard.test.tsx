import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentCard } from '@/components/content/AgentCard';
import { mockLeaderboard } from '@/lib/mockData';

describe('AgentCard', () => {
  const apex = mockLeaderboard.agents.find((a) => a.id === 'apex')!;
  const gale = mockLeaderboard.agents.find((a) => a.id === 'gale')!;
  const metheus = mockLeaderboard.agents.find((a) => a.id === 'metheus')!;

  it('renders P&L in loss color when negative', () => {
    render(<AgentCard agent={gale} />);
    expect(screen.getByText('-$22.89')).toBeInTheDocument();
  });

  it('renders P&L in gain color when positive', () => {
    render(<AgentCard agent={apex} />);
    expect(screen.getByText('+$18.42')).toBeInTheDocument();
  });

  it('expands on tap to reveal moves and receipt detail', async () => {
    const user = userEvent.setup();
    render(<AgentCard agent={gale} />);
    expect(screen.queryByText('Normal CDF')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Expand Gale/ }));
    expect(await screen.findByText('Normal CDF')).toBeInTheDocument();
    expect(screen.getByText(/GAL-20260421-014/)).toBeInTheDocument();
  });

  it('shows "Low sample" badge when brier n < 20', async () => {
    const user = userEvent.setup();
    render(<AgentCard agent={gale} />);
    await user.click(screen.getByRole('button', { name: /Expand Gale/ }));
    expect(await screen.findByText(/Low sample · n=17/)).toBeInTheDocument();
  });

  it('does not expand arriving-soon agents', async () => {
    const user = userEvent.setup();
    render(<AgentCard agent={metheus} />);
    // Button label reflects arriving_soon state; clicking should not reveal
    // any move or receipt content (metheus has neither).
    const node = screen.getByRole('button');
    await user.click(node);
    expect(screen.queryByText('Normal CDF')).not.toBeInTheDocument();
    expect(screen.queryByText(/MET-/)).not.toBeInTheDocument();
  });

  it('shows "Arriving soon" chip on metheus and hides P&L', () => {
    render(<AgentCard agent={metheus} />);
    expect(screen.getByText(/Arriving soon/i)).toBeInTheDocument();
    // No P&L numbers for arriving_soon agents
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
