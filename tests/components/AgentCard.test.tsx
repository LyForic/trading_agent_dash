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
    <AgentCard
      agent={agent}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      currentWindow="24h"
      setWindow={() => undefined}
    />
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

const makeAgent = (overrides: Partial<Agent> = {}): Agent => ({
  id: 'apex',
  name: 'Apex',
  nickname: 'The Striker',
  market_label: 'Decision markets',
  total_pnl: 12.5,
  record: { W: 4, L: 2, BE: 0, settled: 6 },
  brier_7d: { value: 0, n: 0 },
  cities_or_tags: ['decision'],
  moves: [],
  open_position: null,
  latest_receipt: null,
  state: 'live',
  ...overrides,
});

describe('AgentCard a11y restructure', () => {
  const noop = () => undefined;

  it('does NOT nest <button> inside <button>', () => {
    const agent = makeAgent({
      open_position: {
        contract_ticker: 'KX-ABC',
        entry_price_cents: 67,
        side: 'yes',
        size: 25,
        entered_at_delayed: new Date().toISOString(),
        settles_at: null,
      },
    });
    const { container } = render(
      <AgentCard
        agent={agent}
        expanded={false}
        onToggle={noop}
        currentWindow="24h"
        setWindow={noop}
      />,
    );
    const buttons = container.querySelectorAll('button');
    buttons.forEach((b) => {
      const inner = b.querySelector('button');
      expect(inner).toBeNull();
    });
  });

  it('puts aria-expanded on the summary button (not the article)', () => {
    const agent = makeAgent();
    render(
      <AgentCard
        agent={agent}
        expanded={false}
        onToggle={noop}
        currentWindow="24h"
        setWindow={noop}
      />,
    );
    const summaryButton = screen.getByRole('button', { name: /Expand Apex's card/ });
    expect(summaryButton).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders the InBattlePill as a sibling of the summary button when an open position exists', () => {
    const agent = makeAgent({
      open_position: {
        contract_ticker: 'KX-ABC',
        entry_price_cents: 67,
        side: 'yes',
        size: 25,
        entered_at_delayed: new Date().toISOString(),
        settles_at: null,
      },
    });
    const { container } = render(
      <AgentCard
        agent={agent}
        expanded={false}
        onToggle={noop}
        currentWindow="24h"
        setWindow={noop}
      />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    const summaryButton = screen.getByRole('button', { name: /Expand Apex's card/ });
    const battleButton = screen.getByRole('button', { name: /In battle/ });
    expect(summaryButton).not.toBe(battleButton);
    expect(battleButton.parentElement?.parentElement).toBe(summaryButton.parentElement);
  });
});
