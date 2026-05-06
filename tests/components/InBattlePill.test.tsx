import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InBattlePill } from '@/components/content/InBattlePill';

describe('InBattlePill', () => {
  const futureTime = new Date('2026-04-22T20:00:00Z').toISOString();

  it('shows "In Battle" label with settles-at time when provided', () => {
    render(<InBattlePill agentId="metheus" agentName="Metheus" settlesAt={futureTime} />);
    expect(screen.getByText(/In Battle/)).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAccessibleName(/Open battle arena for Metheus, settles/);
  });

  it('shows "In Battle" without countdown when settlesAt is null', () => {
    render(<InBattlePill agentId="apex" agentName="Apex" settlesAt={null} />);
    const button = screen.getByRole('button');
    expect(button).toHaveAccessibleName('Open battle arena for Apex');
    expect(button.textContent).not.toMatch(/settles/);
  });

  it('reveals the 30-min delay tooltip on hover', async () => {
    const user = userEvent.setup();
    render(<InBattlePill agentId="metheus" settlesAt={futureTime} />);
    const pill = screen.getByRole('button', { name: /Open battle arena/ });
    await user.hover(pill);
    expect(screen.getByRole('tooltip')).toHaveTextContent(/30-minute delay/i);
  });

  it('is actionable in Battle Arena V1.1', () => {
    render(<InBattlePill agentId="apex" settlesAt={null} />);
    expect(screen.getByRole('button')).not.toHaveAttribute('aria-disabled');
  });

  it('invokes onTap when clicked', async () => {
    const user = userEvent.setup();
    const onTap = vi.fn();
    render(<InBattlePill agentId="apex" settlesAt={null} onTap={onTap} />);
    await user.click(screen.getByRole('button'));
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('uses agentId-driven accent color (not hardcoded Metheus)', () => {
    const { rerender } = render(<InBattlePill agentId="apex" settlesAt={null} />);
    const apexPill = screen.getByRole('button');
    expect(apexPill.getAttribute('style')).toContain('var(--color-apex)');

    rerender(<InBattlePill agentId="gale" settlesAt={null} />);
    const galePill = screen.getByRole('button');
    expect(galePill.getAttribute('style')).toContain('var(--color-gale)');
  });

  it('sets --in-battle-color CSS variable per agentId for pulse-ring', () => {
    const { rerender } = render(<InBattlePill agentId="apex" settlesAt={null} />);
    const apexPill = screen.getByRole('button');
    expect(apexPill.style.getPropertyValue('--in-battle-color')).toBe('var(--color-apex)');

    rerender(<InBattlePill agentId="gale" settlesAt={null} />);
    const galePill = screen.getByRole('button');
    expect(galePill.style.getPropertyValue('--in-battle-color')).toBe('var(--color-gale)');

    rerender(<InBattlePill agentId="metheus" settlesAt={null} />);
    const metheusButt = screen.getByRole('button');
    expect(metheusButt.style.getPropertyValue('--in-battle-color')).toBe('var(--color-metheus)');
  });
});
