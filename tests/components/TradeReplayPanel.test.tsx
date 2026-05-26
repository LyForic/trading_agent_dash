import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TradeReplayPanel } from '@/components/content/TradeReplayPanel';
import { buildReplay } from '@/lib/tradeReplay';
import type { TradeLogEntry } from '@/lib/types';

const ROW: TradeLogEntry = {
  id: '96494edd-3f78-4ea5-8b5e-f1cf75d144e5',
  contract_ticker: 'KXBTC15M-26MAY221715-15',
  side: 'no',
  entry_price_cents: 44,
  size: 1,
  entered_at: '2026-05-22T21:12:44.224Z',
  settled_at: '2026-05-22T21:19:48.750Z',
  settle_price_cents: 0,
  pnl: -0.44,
  move_used: null,
  replay_ticks: [
    {
      captured_at: '2026-05-22T21:12:44.224Z',
      yes_price_cents: 72,
      no_price_cents: 28,
      underlying_label: 'BTC',
      underlying_value: 75896.98,
      underlying_unit: 'USD',
      source: 'bacon_bot',
    },
    {
      captured_at: '2026-05-22T21:15:01.457Z',
      yes_price_cents: 100,
      no_price_cents: 0,
      underlying_label: 'BTC',
      underlying_value: 75884.78,
      underlying_unit: 'USD',
      source: 'bacon_bot',
    },
    {
      captured_at: '2026-05-22T21:19:48.750Z',
      yes_price_cents: 100,
      no_price_cents: 0,
      underlying_label: 'BTC',
      underlying_value: 75936.53,
      underlying_unit: 'USD',
      source: 'bacon_bot',
    },
  ],
};

describe('TradeReplayPanel replay model', () => {
  it('does not stretch a post-close settlement delay across the chart tail', () => {
    const replay = buildReplay(ROW);
    const maxElapsed = Math.max(...replay.points.map((point) => point.elapsedMs));

    expect(replay.contractStart.toISOString()).toBe('2026-05-22T21:00:00.000Z');
    expect(replay.contractEnd.toISOString()).toBe('2026-05-22T21:15:00.000Z');
    expect(replay.entryElapsedMs).toBe(764224);
    expect(maxElapsed).toBe(900000);
  });

  it('does not render the removed vertical replay controls', () => {
    render(<TradeReplayPanel row={ROW} />);

    expect(screen.queryByText(['9', '16'].join(':'))).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /vertical.*mode/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy.*link/i })).not.toBeInTheDocument();
  });
});
