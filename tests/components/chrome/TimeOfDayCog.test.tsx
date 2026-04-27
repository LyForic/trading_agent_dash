import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TimeOfDayCog } from '@/components/chrome/TimeOfDayCog';

vi.mock('@/hooks/useTimeOfDay', () => ({
  useTimeOfDay: vi.fn(() => 'daytime'),
  getDevModeOverride: vi.fn(() => null),
}));

const STORAGE_KEY = 'gym:settings:time-mode';

function renderCog() {
  return render(
    <MemoryRouter>
      <TimeOfDayCog />
    </MemoryRouter>,
  );
}

describe('TimeOfDayCog', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.removeAttribute('data-mode');
  });

  it('renders cog button with aria-label, aria-expanded=false, aria-haspopup=menu, aria-controls', () => {
    renderCog();
    const btn = screen.getByRole('button', { name: 'Time of day settings' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-haspopup', 'menu');
    expect(btn).toHaveAttribute('aria-controls', 'time-of-day-popover');
  });

  it('does not render the popover initially', () => {
    renderCog();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens popover on cog click and sets aria-expanded=true', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Time of day settings' }))
      .toHaveAttribute('aria-expanded', 'true');
  });

  it('menu uses aria-labelledby pointing to the header', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    const menu = await screen.findByRole('menu');
    expect(menu).toHaveAttribute('aria-labelledby', 'time-of-day-header');
    expect(menu).toHaveAttribute('id', 'time-of-day-popover');
    expect(document.getElementById('time-of-day-header')).toHaveTextContent(/Time of day/i);
  });

  it('closes popover on second cog click', async () => {
    const user = userEvent.setup();
    renderCog();
    const cog = screen.getByRole('button', { name: 'Time of day settings' });
    await user.click(cog);
    await user.click(cog);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes popover on Escape and returns focus to cog', async () => {
    const user = userEvent.setup();
    renderCog();
    const cog = screen.getByRole('button', { name: 'Time of day settings' });
    await user.click(cog);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(cog).toHaveFocus();
  });

  it('closes popover on outside click', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <div data-testid="outside">outside content</div>
        <TimeOfDayCog />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    await user.click(screen.getByTestId('outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders 4 menuitemradio options in order: Auto, Daytime, Dusk, Moonlit', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    const items = await screen.findAllByRole('menuitemradio');
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveAccessibleName(/Auto/);
    expect(items[1]).toHaveAccessibleName(/Daytime/);
    expect(items[2]).toHaveAccessibleName(/Dusk/);
    expect(items[3]).toHaveAccessibleName(/Moonlit/);
  });

  it('marks the active option with aria-checked=true (default = Auto)', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    const items = await screen.findAllByRole('menuitemradio');
    expect(items[0]).toHaveAttribute('aria-checked', 'true');
    expect(items[1]).toHaveAttribute('aria-checked', 'false');
    expect(items[2]).toHaveAttribute('aria-checked', 'false');
    expect(items[3]).toHaveAttribute('aria-checked', 'false');
  });

  it('shows muted effective-mode hint next to "Auto" when preference is auto', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    const auto = await screen.findByRole('menuitemradio', { name: /Auto/ });
    expect(auto.textContent).toMatch(/daytime/);
  });

  it('clicking "Dusk" persists "dusk" to localStorage and closes popover', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    await user.click(screen.getByRole('menuitemradio', { name: /Dusk/ }));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dusk');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('returns focus to cog after selecting an option', async () => {
    const user = userEvent.setup();
    renderCog();
    const cog = screen.getByRole('button', { name: 'Time of day settings' });
    await user.click(cog);
    await user.click(screen.getByRole('menuitemradio', { name: /Dusk/ }));
    expect(cog).toHaveFocus();
  });

  it('focuses the first menuitem when popover opens', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    const auto = await screen.findByRole('menuitemradio', { name: /Auto/ });
    expect(auto).toHaveFocus();
  });

  it('ArrowDown moves focus to the next menuitem', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitemradio', { name: /Daytime/ })).toHaveFocus();
  });

  it('ArrowUp from first menuitem wraps to last (Moonlit)', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    await user.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitemradio', { name: /Moonlit/ })).toHaveFocus();
  });

  it('Home jumps focus to the first menuitem (Auto)', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Home}');
    expect(screen.getByRole('menuitemradio', { name: /Auto/ })).toHaveFocus();
  });

  it('End jumps focus to the last menuitem (Moonlit)', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    await user.keyboard('{End}');
    expect(screen.getByRole('menuitemradio', { name: /Moonlit/ })).toHaveFocus();
  });

  it('Space activates the focused menuitem (parity with Enter)', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.keyboard(' ');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dusk');
  });
});
