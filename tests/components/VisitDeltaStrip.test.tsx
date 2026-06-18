import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VisitDeltaStrip } from '@/components/content/VisitDeltaStrip';
import type { VisitDelta } from '@/lib/useVisitDelta';

const crowdedDelta: VisitDelta = {
  totalNewTrades: 18,
  totalPnlDelta: -12.34,
  daysSince: 50 / (24 * 60),
  awayMs: 50 * 60 * 1000,
  lastSeenAt: new Date(Date.now() - 50 * 60 * 1000).toISOString(),
  perAgent: [
    { id: 'apex', name: 'Apex', newTrades: 5, pnlDelta: 4.5 },
    { id: 'gale', name: 'Gale', newTrades: 4, pnlDelta: -2.25 },
    { id: 'metheus', name: 'Metheus', newTrades: 3, pnlDelta: 1 },
    { id: 'bacon', name: 'Bacon', newTrades: 2, pnlDelta: -6.5 },
    { id: 'nova', name: 'Nova', newTrades: 2, pnlDelta: -8.09 },
    { id: 'meridian', name: 'Meridian', newTrades: 2, pnlDelta: -1 },
  ],
};

describe('VisitDeltaStrip', () => {
  it('shows time away and exposes hidden agent changes with an expand control', async () => {
    const user = userEvent.setup();
    render(<VisitDeltaStrip delta={crowdedDelta} onDismiss={vi.fn()} allTimePct={-30.4} />);

    expect(screen.getByText('50 min ago')).toBeInTheDocument();
    expect(screen.getByText('Apex')).toBeInTheDocument();
    expect(screen.getByText('Gale')).toBeInTheDocument();
    expect(screen.getByText('Metheus')).toBeInTheDocument();
    expect(screen.queryByText('Bacon')).not.toBeInTheDocument();

    const expand = screen.getByRole('button', { name: /show 3 more/i });
    expect(expand).toHaveAttribute('aria-expanded', 'false');

    await user.click(expand);

    expect(screen.getByText('Bacon')).toBeInTheDocument();
    expect(screen.getByText('Nova')).toBeInTheDocument();
    expect(screen.getByText('Meridian')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /show less/i })).toHaveAttribute('aria-expanded', 'true');
  });
});
