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
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, 'moonlit');
    render(<MemoryRouter><TimeOfDayCog /></MemoryRouter>);
    expect(document.body.dataset.mode).toBe('moonlit');
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /Auto/ }));
    expect(document.body.dataset.mode).toBe('daytime');
  });
});
