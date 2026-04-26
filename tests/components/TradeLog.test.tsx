import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TradeLog } from '@/components/content/TradeLog';
import type { TradeLogEntry } from '@/lib/types';

const makeEntry = (id: string, pnl: number): TradeLogEntry => ({
  id,
  contract_ticker: 'KXFEDDECISION-26MAY',
  side: 'yes',
  entry_price_cents: 67,
  size: 25,
  entered_at: new Date('2026-04-25T20:00:00Z').toISOString(),
  settled_at: new Date('2026-04-25T20:30:00Z').toISOString(),
  settle_price_cents: pnl >= 0 ? 71 : 64,
  pnl,
  move_used: null,
});

describe('TradeLog', () => {
  it('shows window count in header', () => {
    const rows = [makeEntry('apex-1', 2), makeEntry('apex-2', -1)];
    render(<TradeLog rows={rows} windowSettledCount={2} window="24h" hasOpenPosition={false} />);
    expect(screen.getByText(/Trades/)).toBeInTheDocument();
    expect(screen.getByText(/24h/)).toBeInTheDocument();
    expect(screen.getByText(/2 settled/)).toBeInTheDocument();
  });

  it('shows "Latest 25 of N" footer when windowSettledCount > 25', () => {
    const rows = Array.from({ length: 25 }, (_, i) => makeEntry(`apex-${i}`, i % 3 === 0 ? -1 : 1));
    render(<TradeLog rows={rows} windowSettledCount={143} window="lifetime" hasOpenPosition={false} />);
    expect(screen.getByText(/Latest 25 of 143/)).toBeInTheDocument();
  });

  it('does NOT show the footer when windowSettledCount <= 25', () => {
    const rows = [makeEntry('apex-1', 2)];
    render(<TradeLog rows={rows} windowSettledCount={1} window="24h" hasOpenPosition={false} />);
    expect(screen.queryByText(/Latest \d+ of/)).not.toBeInTheDocument();
  });

  it('shows empty state copy when no rows', () => {
    render(<TradeLog rows={[]} windowSettledCount={0} window="24h" hasOpenPosition={false} />);
    expect(screen.getByText(/No settled trades in 24h\. Try 7d\./i)).toBeInTheDocument();
  });

  it('uses "no settled trades" copy (not "no trades") when an open position exists', () => {
    render(<TradeLog rows={[]} windowSettledCount={0} window="24h" hasOpenPosition={true} />);
    expect(screen.getByText(/No settled trades/i)).toBeInTheDocument();
    expect(screen.queryByText(/No trades(?! settled)/i)).not.toBeInTheDocument();
  });

  it('empty-state suggests 7d for 24h window, lifetime for 7d window', () => {
    const { rerender } = render(
      <TradeLog rows={[]} windowSettledCount={0} window="24h" hasOpenPosition={false} />,
    );
    expect(screen.getByText(/Try 7d/)).toBeInTheDocument();

    rerender(<TradeLog rows={[]} windowSettledCount={0} window="7d" hasOpenPosition={false} />);
    expect(screen.getByText(/Try Lifetime/)).toBeInTheDocument();
  });

  it('empty-state at lifetime gives no escape hatch', () => {
    render(<TradeLog rows={[]} windowSettledCount={0} window="lifetime" hasOpenPosition={false} />);
    expect(screen.getByText(/No settled trades yet\./i)).toBeInTheDocument();
    expect(screen.queryByText(/Try/)).not.toBeInTheDocument();
  });
});
