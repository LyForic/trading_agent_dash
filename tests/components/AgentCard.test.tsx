import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentCard } from '@/components/content/AgentCard';
import { mockLeaderboard } from '@/lib/mockData';
import type { Agent } from '@/lib/types';

/** Controlled-expansion harness mirroring the lift-to-App pattern. */
function Harness({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <AgentCard agent={agent} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
  );
}

describe('AgentCard', () => {
  const apex = mockLeaderboard.agents.find((a) => a.id === 'apex')!;
  const gale = mockLeaderboard.agents.find((a) => a.id === 'gale')!;
  const metheus = mockLeaderboard.agents.find((a) => a.id === 'metheus')!;

  it('renders P&L in loss color when negative', () => {
    render(<Harness agent={gale} />);
    expect(screen.getByText('-$22.89')).toBeInTheDocument();
  });

  it('renders P&L in gain color when positive', () => {
    render(<Harness agent={apex} />);
    expect(screen.getByText('+$18.42')).toBeInTheDocument();
  });

  it('expands on tap to reveal moves and receipt detail', async () => {
    const user = userEvent.setup();
    render(<Harness agent={gale} />);
    expect(screen.queryByText('Normal CDF')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Expand Gale/ }));
    expect(await screen.findByText('Normal CDF')).toBeInTheDocument();
    expect(screen.getByText(/GAL-20260421-014/)).toBeInTheDocument();
  });

  it('shows "Low sample" badge when brier n < 20', async () => {
    const user = userEvent.setup();
    render(<Harness agent={gale} />);
    await user.click(screen.getByRole('button', { name: /Expand Gale/ }));
    expect(await screen.findByText(/Low sample · n=17/)).toBeInTheDocument();
  });

  it('does not expand arriving-soon agents', async () => {
    const user = userEvent.setup();
    render(<Harness agent={metheus} />);
    const node = screen.getByRole('button');
    await user.click(node);
    expect(screen.queryByText('Normal CDF')).not.toBeInTheDocument();
    expect(screen.queryByText(/MET-/)).not.toBeInTheDocument();
  });

  it('shows "Arriving soon" chip on metheus and hides P&L', () => {
    render(<Harness agent={metheus} />);
    expect(screen.getByText(/Arriving soon/i)).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });
});
