import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentCard } from '@/components/content/AgentCard';
import { mockCardViewModels, mockLeaderboard } from '@/lib/mockData';
import type { Agent } from '@/lib/types';
import type { AgentCardViewModel } from '@/lib/useAgentData';

const stubViewModel: AgentCardViewModel = {
  total_pnl: 0,
  record: { W: 0, L: 0, BE: 0, settled: 0 },
  tradeLog: [],
  windowSettledCount: 0,
};

/** Controlled-expansion harness mirroring the lift-to-App pattern. */
function Harness({
  agent,
  cardViewModel,
  onBattleTap,
}: {
  agent: Agent;
  cardViewModel?: AgentCardViewModel;
  onBattleTap?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <AgentCard
      agent={agent}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
      currentWindow="24h"
      setWindow={() => undefined}
      cardViewModel={cardViewModel ?? mockCardViewModels[agent.id]}
      onBattleTap={onBattleTap}
    />
  );
}

describe('AgentCard', () => {
  const apex = mockLeaderboard.agents.find((a) => a.id === 'apex')!;
  const gale = mockLeaderboard.agents.find((a) => a.id === 'gale')!;
  const metheus = mockLeaderboard.agents.find((a) => a.id === 'metheus')!;

  it('renders P&L + WR from cardViewModel (windowed) — loss color when negative', () => {
    // Use values DELIBERATELY different from mockLeaderboard's lifetime values
    // so a regression back to `agent.total_pnl` would fail this test.
    // Gale mockLeaderboard.total_pnl is -$22.89; we use -$77.77 here.
    render(
      <Harness
        agent={gale}
        cardViewModel={{
          total_pnl: -77.77,
          record: { W: 1, L: 4, BE: 0, settled: 5 },
          tradeLog: [],
          windowSettledCount: 5,
        }}
      />,
    );
    expect(screen.getByText('-$77.77')).toBeInTheDocument();
    expect(screen.getByText('20.0% WR')).toBeInTheDocument();
  });

  it('renders P&L + WR from cardViewModel (windowed) — gain color when positive', () => {
    // Apex mockLeaderboard.total_pnl is +$18.42; we use +$99.99 here so the
    // assertion only passes when collapsed reads cardViewModel, not agent.
    render(
      <Harness
        agent={apex}
        cardViewModel={{
          total_pnl: 99.99,
          record: { W: 7, L: 1, BE: 0, settled: 8 },
          tradeLog: [],
          windowSettledCount: 8,
        }}
      />,
    );
    expect(screen.getByText('+$99.99')).toBeInTheDocument();
    expect(screen.getByText('87.5% WR')).toBeInTheDocument();
  });

  it('expands on tap to reveal moves and trade log', async () => {
    const user = userEvent.setup();
    render(<Harness agent={gale} />);
    expect(screen.queryByText('Normal CDF')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Expand Gale/ }));
    expect(await screen.findByText('Normal CDF')).toBeInTheDocument();
    // Unified TradeLog header is visible on expand (replaces the prior
    // single Latest Receipt panel — see Track B Task 10).
    expect(screen.getByText(/Trades · 24h/)).toBeInTheDocument();
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
    const node = screen.getByRole('button', { name: /Metheus: arriving soon/ });
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
        cardViewModel={stubViewModel}
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
        cardViewModel={stubViewModel}
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
        cardViewModel={stubViewModel}
      />,
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    const summaryButton = screen.getByRole('button', { name: /Expand Apex's card/ });
    const battleButton = screen.getByRole('button', { name: /Open battle arena/ });
    expect(summaryButton).not.toBe(battleButton);
    expect(battleButton.parentElement?.parentElement).toBe(summaryButton.parentElement);
  });

  it('invokes onBattleTap from the sibling pill without expanding the card', async () => {
    const user = userEvent.setup();
    const onBattleTap = vi.fn();
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
    render(<Harness agent={agent} onBattleTap={onBattleTap} />);

    await user.click(screen.getByRole('button', { name: /Open battle arena/ }));

    expect(onBattleTap).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('decision')).not.toBeInTheDocument();
  });
});
