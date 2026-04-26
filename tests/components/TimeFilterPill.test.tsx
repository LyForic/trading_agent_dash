import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimeFilterPill } from '@/components/content/TimeFilterPill';

describe('TimeFilterPill', () => {
  it('renders three radio options', () => {
    render(
      <TimeFilterPill agentId="apex" agentName="Apex" currentWindow="24h" setWindow={() => undefined} />,
    );
    expect(screen.getByRole('radio', { name: /24h/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /7d/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Lifetime/ })).toBeInTheDocument();
  });

  it('marks the current window as checked', () => {
    render(
      <TimeFilterPill agentId="apex" agentName="Apex" currentWindow="7d" setWindow={() => undefined} />,
    );
    expect(screen.getByRole('radio', { name: /7d/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /24h/ })).not.toBeChecked();
  });

  it('calls setWindow when a different option is selected', async () => {
    const user = userEvent.setup();
    const setWindow = vi.fn();
    render(
      <TimeFilterPill agentId="apex" agentName="Apex" currentWindow="24h" setWindow={setWindow} />,
    );
    await user.click(screen.getByRole('radio', { name: /Lifetime/ }));
    expect(setWindow).toHaveBeenCalledWith('lifetime');
  });

  it('uses an agent-scoped name attribute so multiple groups coexist', () => {
    const { container } = render(
      <TimeFilterPill agentId="metheus" agentName="Metheus" currentWindow="24h" setWindow={() => undefined} />,
    );
    const radios = container.querySelectorAll('input[type="radio"]');
    radios.forEach((r) => expect(r.getAttribute('name')).toBe('window-metheus'));
  });
});
