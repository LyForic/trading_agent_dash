import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InBattlePill } from '@/components/content/InBattlePill';

describe('InBattlePill', () => {
  const futureTime = new Date('2026-04-22T20:00:00Z').toISOString();

  it('shows "In Battle" label with settles-at time when provided', () => {
    render(<InBattlePill agentId="metheus" settlesAt={futureTime} />);
    expect(screen.getByText(/In Battle/)).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAccessibleName(/In battle, settles/);
  });

  it('shows "In Battle" without countdown when settlesAt is null', () => {
    render(<InBattlePill agentId="apex" settlesAt={null} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAccessibleName('In battle');
    expect(button.textContent).not.toMatch(/settles/);
  });

  it('reveals the 30-min delay tooltip on hover', async () => {
    const user = userEvent.setup();
    render(<InBattlePill agentId="metheus" settlesAt={futureTime} />);
    const pill = screen.getByRole('button', { name: /In battle/ });
    await user.hover(pill);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/30-minute delay/i);
  });

  it('is aria-disabled in Track B (Battle Arena handler is V1.1)', () => {
    render(<InBattlePill agentId="apex" settlesAt={null} />);
    expect(screen.getByRole('button')).toHaveAttribute('aria-disabled', 'true');
  });

  it('does not invoke onTap when clicked (aria-disabled no-op)', async () => {
    const user = userEvent.setup();
    const onTap = vi.fn();
    render(<InBattlePill agentId="apex" settlesAt={null} onTap={onTap} />);
    await user.click(screen.getByRole('button'));
    expect(onTap).not.toHaveBeenCalled();
  });

  it('uses agentId-driven accent color (not hardcoded Metheus)', () => {
    const { rerender } = render(<InBattlePill agentId="apex" settlesAt={null} />);
    const apexPill = screen.getByRole('button');
    expect(apexPill.getAttribute('style')).toContain('var(--color-apex)');

    rerender(<InBattlePill agentId="gale" settlesAt={null} />);
    const galePill = screen.getByRole('button');
    expect(galePill.getAttribute('style')).toContain('var(--color-gale)');
  });
});
