import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TrustStrip } from '@/components/content/TrustStrip';
import { mockLeaderboard } from '@/lib/mockData';
import type { AgentDataError } from '@/lib/useAgentData';

const fetchFailed: AgentDataError = { kind: 'fetch-failed', message: 'Network error' };
const notConfigured: AgentDataError = { kind: 'not-configured', message: 'Supabase not configured' };

describe('TrustStrip error badge', () => {
  it('shows "Data unavailable" badge when error kind is fetch-failed', () => {
    render(<TrustStrip data={mockLeaderboard} error={fetchFailed} />);
    expect(screen.getByText(/Data unavailable/i)).toBeInTheDocument();
  });

  it('does NOT show badge when error kind is not-configured', () => {
    render(<TrustStrip data={mockLeaderboard} error={notConfigured} />);
    expect(screen.queryByText(/Data unavailable/i)).not.toBeInTheDocument();
  });

  it('does NOT show badge when error is null', () => {
    render(<TrustStrip data={mockLeaderboard} error={null} />);
    expect(screen.queryByText(/Data unavailable/i)).not.toBeInTheDocument();
  });
});
