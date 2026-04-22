import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InBattlePill } from '@/components/content/InBattlePill';

describe('InBattlePill', () => {
  const futureTime = new Date('2026-04-22T20:00:00Z').toISOString();

  it('shows "In Battle" label with settles-at time', () => {
    render(<InBattlePill settlesAt={futureTime} />);
    expect(screen.getByText(/In Battle/)).toBeInTheDocument();
  });

  it('reveals the 30-min delay tooltip on hover', async () => {
    const user = userEvent.setup();
    render(<InBattlePill settlesAt={futureTime} />);
    const pill = screen.getByRole('button', { name: /In Battle/ });
    await user.hover(pill);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/30-minute delay/i);
  });

  it('fires onTap when the pill is clicked', async () => {
    const user = userEvent.setup();
    const onTap = vi.fn();
    render(<InBattlePill settlesAt={futureTime} onTap={onTap} />);
    await user.click(screen.getByRole('button', { name: /In Battle/ }));
    expect(onTap).toHaveBeenCalledOnce();
  });
});
