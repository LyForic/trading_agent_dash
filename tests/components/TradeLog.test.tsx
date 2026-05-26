import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('keeps the latest trade inside the scrollable ledger', () => {
    const rows = [makeEntry('apex-1', 2), makeEntry('apex-2', -1)];
    const { container } = render(<TradeLog rows={rows} windowSettledCount={2} window="24h" hasOpenPosition={false} />);
    const ledger = container.querySelector('.trade-log-ledger');
    const featured = container.querySelector('.trade-log-featured');

    expect(featured?.parentElement).toBe(ledger);
  });

  it('does NOT show the footer when windowSettledCount <= 25', () => {
    const rows = [makeEntry('apex-1', 2)];
    render(<TradeLog rows={rows} windowSettledCount={1} window="24h" hasOpenPosition={false} />);
    expect(screen.queryByText(/Latest \d+ of/)).not.toBeInTheDocument();
  });

  it('opens a replay chart when a trade is clicked', async () => {
    const user = userEvent.setup();
    const rows = [makeEntry('apex-1', 2)];
    render(<TradeLog rows={rows} windowSettledCount={1} window="24h" hasOpenPosition={false} />);

    await user.click(screen.getByRole('button', { name: /KXFEDDECISION-26MAY/i }));

    expect(screen.getByLabelText(/15 minute trade replay chart/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Play replay/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Replay timeline/i)).toHaveAttribute('max', '900000');
  });

  it('uses stored replay ticks when a trade provides them', async () => {
    const user = userEvent.setup();
    const rows = [
      {
        ...makeEntry('apex-1', 2),
        replay_ticks: [
          {
            captured_at: new Date('2026-04-25T20:16:00Z').toISOString(),
            yes_price_cents: 54,
            no_price_cents: 46,
            underlying_label: 'BTC',
            underlying_value: 68000,
            underlying_unit: 'USD',
            source: 'test',
          },
          {
            captured_at: new Date('2026-04-25T20:22:00Z').toISOString(),
            yes_price_cents: 71,
            no_price_cents: 29,
            underlying_label: 'BTC',
            underlying_value: 68420,
            underlying_unit: 'USD',
            source: 'test',
          },
        ],
      },
    ];
    render(<TradeLog rows={rows} windowSettledCount={1} window="24h" hasOpenPosition={false} />);

    await user.click(screen.getByRole('button', { name: /KXFEDDECISION-26MAY/i }));

    expect(screen.getByText(/Market ticks/i)).toBeInTheDocument();
  });

  it('closes the replay chart when the selected trade is clicked again', async () => {
    const user = userEvent.setup();
    const rows = [makeEntry('apex-1', 2)];
    render(<TradeLog rows={rows} windowSettledCount={1} window="24h" hasOpenPosition={false} />);

    const tradeButton = screen.getByRole('button', { name: /KXFEDDECISION-26MAY/i });
    await user.click(tradeButton);
    expect(screen.getByLabelText(/15 minute trade replay chart/i)).toBeInTheDocument();

    await user.click(tradeButton);
    expect(screen.queryByLabelText(/15 minute trade replay chart/i)).not.toBeInTheDocument();
  });

  it('switches the open replay chart when another trade is clicked', async () => {
    const user = userEvent.setup();
    const rows = [
      makeEntry('apex-1', 2),
      { ...makeEntry('apex-2', -1), contract_ticker: 'KXBTC-26MAY22-B70000' },
    ];
    render(<TradeLog rows={rows} windowSettledCount={2} window="24h" hasOpenPosition={false} />);

    await user.click(screen.getByRole('button', { name: /KXFEDDECISION-26MAY/i }));
    expect(screen.getByText(/^KXFEDDECISION-26MAY$/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /2YES/i }));
    expect(screen.getByText(/^KXBTC-26MAY22-B70000$/)).toBeInTheDocument();
    expect(screen.queryByText(/^KXFEDDECISION-26MAY$/)).not.toBeInTheDocument();
  });

  it('delegates trade selection without rendering inline replay in external mode', async () => {
    const user = userEvent.setup();
    const rows = [makeEntry('apex-1', 2)];
    const onTradeSelect = vi.fn();
    render(
      <TradeLog
        rows={rows}
        windowSettledCount={1}
        window="24h"
        hasOpenPosition={false}
        replayMode="external"
        onTradeSelect={onTradeSelect}
      />,
    );

    await user.click(screen.getByRole('button', { name: /KXFEDDECISION-26MAY/i }));

    expect(onTradeSelect).toHaveBeenCalledWith(rows[0]);
    expect(screen.queryByLabelText(/15 minute trade replay chart/i)).not.toBeInTheDocument();
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
