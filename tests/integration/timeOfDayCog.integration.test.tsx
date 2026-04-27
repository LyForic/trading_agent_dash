import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TimeOfDayCog } from '@/components/chrome/TimeOfDayCog';

const STORAGE_KEY = 'gym:settings:time-mode';

describe('TimeOfDayCog body[data-mode] integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.removeAttribute('data-mode');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('mounts with empty localStorage at noon → body[data-mode] === "daytime"', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 26, 12, 0));
    render(<MemoryRouter><TimeOfDayCog /></MemoryRouter>);
    expect(document.body.dataset.mode).toBe('daytime');
  });

  it('opens popover, clicks Dusk → body[data-mode] === "dusk"', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><TimeOfDayCog /></MemoryRouter>);
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /Dusk/ }));
    expect(document.body.dataset.mode).toBe('dusk');
  });

  it('clicks Auto with cached daytime → body[data-mode] === "daytime"', async () => {
    // Fake only Date (so hourToMode sees noon), leave timers/rAF real so
    // framer-motion animations and userEvent can resolve without manual
    // timer advancement.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 3, 26, 12, 0));
    // userEvent.setup() must come AFTER the partial fake-timer setup so it
    // captures the still-real setTimeout/rAF (only Date is faked). Reordering
    // — or fully faking timers — would deadlock framer-motion's exit animation.
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, 'moonlit');
    render(<MemoryRouter><TimeOfDayCog /></MemoryRouter>);
    expect(document.body.dataset.mode).toBe('moonlit');
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /Auto/ }));
    expect(document.body.dataset.mode).toBe('daytime');
  });

  it('Esc with cog popover open does NOT propagate to other window-level Escape handlers', async () => {
    const user = userEvent.setup();
    const otherHandler = vi.fn();
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') otherHandler();
    });

    try {
      render(<MemoryRouter><TimeOfDayCog /></MemoryRouter>);
      await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
      await screen.findByRole('menu');
      await user.keyboard('{Escape}');

      // The cog's capture-phase + stopImmediatePropagation should suppress
      // the other Escape listener entirely.
      expect(otherHandler).not.toHaveBeenCalled();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    } finally {
      // Cleanup: remove the test listener (vitest doesn't auto-clean window listeners)
      window.removeEventListener('keydown', otherHandler);
    }
  });
});
