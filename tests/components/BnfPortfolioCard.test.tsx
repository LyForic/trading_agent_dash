import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BnfPortfolioCard } from '@/components/content/BnfPortfolioCard';
import type { BnfPortfolioSeries } from '@/lib/types';

const series: BnfPortfolioSeries = {
  updated_at: '2026-05-16T20:00:00.000Z',
  points: [
    { captured_at: '2026-05-16T18:00:00.000Z', combined_cleared_cents: 680000,
      combined_baseline_cents: 680000, brandon_source: 'kalshi',
      justin_source: 'reconstructed', is_partial: false, pct_vs_baseline: 0 },
    { captured_at: '2026-05-16T20:00:00.000Z', combined_cleared_cents: 691000,
      combined_baseline_cents: 680000, brandon_source: 'kalshi',
      justin_source: 'reconstructed', is_partial: false, pct_vs_baseline: 1.62 },
  ],
};

describe('BnfPortfolioCard', () => {
  it('renders the latest combined value, pct, and the reconstructed disclosure', () => {
    render(<BnfPortfolioCard data={series} />);
    expect(screen.getByText(/\$6,910/)).toBeInTheDocument();
    expect(screen.getByText(/\+1\.62%/)).toBeInTheDocument();
    expect(screen.getByText(/reconstructed/i)).toBeInTheDocument();
    expect(screen.getByTestId('bnf-curve-path')).toBeInTheDocument();
  });

  it('hides the disclosure once both sources are kalshi (V1.5 auto-heal)', () => {
    const healed: BnfPortfolioSeries = {
      ...series,
      points: series.points.map((p) => ({ ...p, justin_source: 'kalshi' as const })),
    };
    render(<BnfPortfolioCard data={healed} />);
    expect(screen.queryByText(/reconstructed/i)).not.toBeInTheDocument();
  });

  it('renders an empty-state when there are no points', () => {
    render(<BnfPortfolioCard data={{ points: [], updated_at: '' }} />);
    expect(screen.getByText(/warming up/i)).toBeInTheDocument();
  });

  it('renders a negative pct with a minus sign (not "+−")', () => {
    const down: BnfPortfolioSeries = {
      ...series,
      points: series.points.map((p) => ({ ...p, pct_vs_baseline: -1.5 })),
    };
    render(<BnfPortfolioCard data={down} />);
    expect(screen.getByText(/-1\.50%/)).toBeInTheDocument();
    expect(screen.queryByText(/\+-1/)).not.toBeInTheDocument();
  });

  it('omits the SVG curve until there are at least 2 points', () => {
    const onePoint: BnfPortfolioSeries = {
      updated_at: series.points[0].captured_at,
      points: [series.points[0]],
    };
    render(<BnfPortfolioCard data={onePoint} />);
    expect(screen.getByText(/Brandon \+ Justin/)).toBeInTheDocument();
    expect(screen.queryByTestId('bnf-curve-path')).not.toBeInTheDocument();
  });
});
