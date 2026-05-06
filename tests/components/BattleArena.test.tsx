import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BattleArena } from '@/components/battle/BattleArena';
import { mockLeaderboard } from '@/lib/mockData';
import type { Agent } from '@/lib/types';

const now = new Date('2026-04-21T19:00:00.000Z');

describe('BattleArena', () => {
  const apex = mockLeaderboard.agents.find((agent) => agent.id === 'apex')!;
  const gale = mockLeaderboard.agents.find((agent) => agent.id === 'gale')!;

  it('renders active open-position details', () => {
    render(<BattleArena agent={apex} titleId="battle-title" now={now} />);
    expect(screen.getByRole('heading', { name: /Apex is in battle/ })).toHaveAttribute('id', 'battle-title');
    expect(screen.getByText('KXBTC-26APR21-B67500')).toBeInTheDocument();
    expect(screen.getByText('YES')).toBeInTheDocument();
    expect(screen.getByText('42c')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('keeps trust wording accurate about delayed entries and preview pricing', () => {
    render(<BattleArena agent={apex} now={now} />);
    expect(screen.getByText(/30-minute delay floor/i)).toBeInTheDocument();
    expect(screen.getByText(/entry-anchored preview/i)).toBeInTheDocument();
    expect(screen.getByText(/not a private live signal/i)).toBeInTheDocument();
  });

  it('renders an inactive empty state defensively', () => {
    const idleAgent: Agent = { ...gale, open_position: null };
    render(<BattleArena agent={idleAgent} titleId="battle-title" now={now} />);
    expect(screen.getByRole('heading', { name: /No active battle/ })).toHaveAttribute('id', 'battle-title');
    expect(screen.getByText(/Gale is idle/i)).toBeInTheDocument();
    expect(screen.getByText(/trade log after the 30-minute delay/i)).toBeInTheDocument();
  });
});
