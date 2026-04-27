# Time-of-Day Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the GymPage inline mode-switcher with a global floating settings cog that is accessible from every route, persists time-of-day preference in `localStorage`, resolves the active world mode with `dev URL > stored preference > auto` precedence, and feeds `body[data-mode]` from a single source of truth.

**Architecture:** A single hook `useTimeOfDayPreference` owns preference state (`localStorage["gym:settings:time-mode"]`), resolves `effectiveMode` from `useTimeOfDay()` plus a dev `?mode=` URL override, and writes `body[data-mode]` via `useLayoutEffect`. Component `TimeOfDayCog` mounts once at App level and exposes a popover with four options (Auto / Daytime / Dusk / Moonlit) using `framer-motion` for animation. Migration is a single atomic commit to avoid the multi-writer race on `body[data-mode]`.

**Tech Stack:** React 19 + TypeScript + Tailwind v4 + Vitest + React Testing Library + framer-motion + react-router-dom.

**Spec reference:** `docs/superpowers/specs/2026-04-26-time-of-day-toggle-design.md`.

---

## File Structure

**Files to CREATE:**

| Path | Responsibility |
|---|---|
| `src/lib/useTimeOfDayPreference.ts` | Preference hook (state + localStorage + effectiveMode resolution; body side effect added in atomic Task 5) |
| `src/components/chrome/TimeOfDayCog.tsx` | Floating cog button + animated popover (uses the hook) |
| `tests/lib/useTimeOfDayPreference.test.ts` | Unit tests for the hook |
| `tests/components/chrome/TimeOfDayCog.test.tsx` | Component tests (rendering, open/close, a11y, keyboard) |
| `tests/integration/timeOfDayCog.integration.test.tsx` | End-to-end tests covering body[data-mode] and TownSquare leaves |

**Files to MODIFY:**

| Path | Change |
|---|---|
| `src/lib/timeOfDay.ts` | Add `TimeOfDayPreference` type alias |
| `src/hooks/useTimeOfDay.ts` | Fix cache rollover bug (Task 1); export `getDevModeOverride` (Task 1); remove `body[data-mode]` `useEffect` (Task 5) |
| `src/App.tsx` | Mount `<TimeOfDayCog />` (Task 5) |
| `src/pages/TownSquarePage.tsx` | Remove `body.dataset.mode = autoMode` `useEffect` at lines 293-296; drop `autoMode !== 'moonlit'` JS conditional at line 509; drop `useTimeOfDay` import + call at lines 6 + 184 (Task 5) |
| `src/pages/GymPage.tsx` | Remove `[override, setOverride]` state (lines 48-53); remove the chrome panel `<div>` block at lines 145-206 entirely; drop `useTimeOfDay` and `WorldMode` imports (Task 5) |
| `src/styles/globals.css` | Add `body[data-mode="moonlit"] .town-leaf { display: none }`; reposition `.town-bulletin-hud` from `top: 16px` to `top: 64px` (Task 5) |
| `tests/hooks/useTimeOfDay.test.ts` | Add cache-rollover test (Task 1); remove `body[data-mode]` assertion test (Task 5) |

---

## Task 1: Refactor useTimeOfDay (cache rollover fix + export `getDevModeOverride`)

**Why first:** Pre-existing cache bug would mask the auto-rollover invariant the new feature promises. Plus the new hook needs to import `getDevModeOverride` to honor the `dev URL > preference > auto` precedence.

**Files:**
- Modify: `src/hooks/useTimeOfDay.ts`
- Modify: `tests/hooks/useTimeOfDay.test.ts`

- [ ] **Step 1: Add the failing cache-rollover test**

Open `tests/hooks/useTimeOfDay.test.ts` and append a new `it` block inside the existing `describe('useTimeOfDay', () => { ... })`:

```ts
  it('invalidates cache when hour bucket crosses', () => {
    vi.useFakeTimers();
    // 4:30pm — daytime per hourToMode (boundaries: 6-17 daytime, 17-22 dusk)
    vi.setSystemTime(new Date(2026, 3, 26, 16, 30));
    const { result: first, unmount: unmount1 } = renderHook(() => useTimeOfDay());
    expect(first.current).toBe('daytime');
    unmount1();

    // Advance to 5:30pm — same TTL window (under 60 min) but new hour bucket → dusk
    vi.setSystemTime(new Date(2026, 3, 26, 17, 30));
    const { result: second } = renderHook(() => useTimeOfDay());
    expect(second.current).toBe('dusk');
  });
```

- [ ] **Step 2: Run the new test to verify it fails**

Run: `npx vitest run tests/hooks/useTimeOfDay.test.ts -t "invalidates cache when hour bucket crosses"`

Expected: FAIL — current implementation returns the cached `'daytime'` because the TTL is still valid (under 60 minutes). Output should show the assertion `expected "daytime" to be "dusk"` (or equivalent).

- [ ] **Step 3: Fix the cache rollover logic in `compute()`**

Open `src/hooks/useTimeOfDay.ts`. Locate the `compute` function (around lines 57-86). Replace its body so the cache check additionally verifies the hour bucket matches:

```ts
function compute(): WorldMode {
  const override = getDevModeOverride();
  if (override !== null) return override;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry;
        const cachedHour = new Date(parsed.computedAt).getHours();
        const currentHour = new Date().getHours();
        if (
          Date.now() - parsed.computedAt < CACHE_TTL_MS &&
          cachedHour === currentHour
        ) {
          return parsed.mode;
        }
      }
    } catch {
      /* ignore */
    }
  }
  const mode = hourToMode(new Date().getHours());
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ mode, computedAt: Date.now() } satisfies CacheEntry),
      );
    } catch {
      /* ignore */
    }
  }
  return mode;
}
```

The new lines are the two `Date(...).getHours()` reads and the additional `cachedHour === currentHour` predicate.

- [ ] **Step 4: Export `getDevModeOverride`**

In the same file, change `function getDevModeOverride()` (around line 43) to `export function getDevModeOverride()`. Just add the `export` keyword:

```ts
export function getDevModeOverride(): WorldMode | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  try {
    const param = new URLSearchParams(window.location.search).get('mode');
    if (param === 'daytime' || param === 'dusk' || param === 'moonlit') {
      return param;
    }
  } catch {
    /* ignore */
  }
  return null;
}
```

- [ ] **Step 5: Run all useTimeOfDay tests to verify they pass**

Run: `npx vitest run tests/hooks/useTimeOfDay.test.ts`

Expected: ALL tests pass (5 tests: 4 existing + 1 new). The previously-failing rollover test should now pass.

- [ ] **Step 6: Run the full test suite to confirm no regressions**

Run: `npx vitest run`

Expected: All tests pass. Existing tests are unaffected.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useTimeOfDay.ts tests/hooks/useTimeOfDay.test.ts
git commit -m "$(cat <<'EOF'
fix(time-of-day): invalidate useTimeOfDay cache on hour boundary

Pre-existing cache check was TTL-only — a user loading at 4:30pm
would stay cached as 'daytime' until ~5:30pm even though the actual
mode rolls to 'dusk' at 5pm per hourToMode boundaries. Cache now
additionally requires the cached hour bucket to match the current
hour bucket. Also exports getDevModeOverride so the upcoming
useTimeOfDayPreference hook can honor the dev URL override at top
precedence.
EOF
)"
```

---

## Task 2: Add `TimeOfDayPreference` type

**Why:** Type alias for the union `'auto' | WorldMode` used by the new hook and component.

**Files:**
- Modify: `src/lib/timeOfDay.ts`

- [ ] **Step 1: Add the type alias**

Open `src/lib/timeOfDay.ts`. Below the existing `WorldMode` export (around line 1), add:

```ts
/**
 * User preference for time-of-day mode. `'auto'` defers to the
 * hour-derived value from `useTimeOfDay`; the three explicit values
 * pin the world to a specific mode regardless of clock.
 */
export type TimeOfDayPreference = 'auto' | WorldMode;
```

The full file is now:

```ts
export type WorldMode = 'daytime' | 'dusk' | 'moonlit';

/**
 * User preference for time-of-day mode. `'auto'` defers to the
 * hour-derived value from `useTimeOfDay`; the three explicit values
 * pin the world to a specific mode regardless of clock.
 */
export type TimeOfDayPreference = 'auto' | WorldMode;

/**
 * Maps a local-time hour (0-23) to the Trading Gym world-layer mode
 * per spec §3.1. Cheap pure function so it's safe to call on every render.
 *
 *   6am–5pm  → daytime   (warm cream walls, sunlit)
 *   5pm–10pm → dusk      (deep blue sky, lamp on)
 *   10pm–6am → moonlit   (navy, moon silhouette)
 */
export function hourToMode(hour: number): WorldMode {
  if (hour >= 6 && hour < 17) return 'daytime';
  if (hour >= 17 && hour < 22) return 'dusk';
  return 'moonlit';
}
```

- [ ] **Step 2: Run tsc to verify type compiles**

Run: `npx tsc --noEmit`

Expected: No new errors. The type isn't used yet, but it should compile.

- [ ] **Step 3: Commit**

```bash
git add src/lib/timeOfDay.ts
git commit -m "spec(time-of-day): add TimeOfDayPreference type"
```

---

## Task 3: Build `useTimeOfDayPreference` hook (no body side effect yet)

**Why:** Owns preference state + resolution logic without writing to `body[data-mode]`. The body side effect is added in the atomic Task 5 to avoid a multi-writer race window.

**Files:**
- Create: `src/lib/useTimeOfDayPreference.ts`
- Create: `tests/lib/useTimeOfDayPreference.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `tests/lib/useTimeOfDayPreference.test.ts` with the full content below. This file mocks `useTimeOfDay` and `getDevModeOverride` so each test can independently control the auto value and the dev URL override.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/hooks/useTimeOfDay', () => ({
  useTimeOfDay: vi.fn(),
  getDevModeOverride: vi.fn(),
}));

import { useTimeOfDay, getDevModeOverride } from '@/hooks/useTimeOfDay';
import { useTimeOfDayPreference } from '@/lib/useTimeOfDayPreference';

const STORAGE_KEY = 'gym:settings:time-mode';

describe('useTimeOfDayPreference', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');
    vi.mocked(getDevModeOverride).mockReturnValue(null);
  });

  it('defaults to "auto" when localStorage is empty', () => {
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.mode).toBe('auto');
  });

  it('reads stored "dusk" preference from localStorage on init', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dusk');
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.mode).toBe('dusk');
  });

  it('persists setMode to localStorage and updates state', () => {
    const { result } = renderHook(() => useTimeOfDayPreference());
    act(() => result.current.setMode('moonlit'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('moonlit');
    expect(result.current.mode).toBe('moonlit');
  });

  it('falls back to "auto" when localStorage holds an invalid value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'lunch');
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.mode).toBe('auto');
  });

  it('effectiveMode equals autoMode when preference is "auto"', () => {
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.mode).toBe('auto');
    expect(result.current.effectiveMode).toBe('daytime');
  });

  it('effectiveMode equals stored preference when forced (preference wins over autoMode)', () => {
    window.localStorage.setItem(STORAGE_KEY, 'moonlit');
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.effectiveMode).toBe('moonlit');
  });

  it('dev URL override wins over stored preference (top precedence)', () => {
    vi.mocked(getDevModeOverride).mockReturnValue('dusk');
    window.localStorage.setItem(STORAGE_KEY, 'moonlit');
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.effectiveMode).toBe('dusk');
  });

  it('dev URL override wins over auto', () => {
    vi.mocked(getDevModeOverride).mockReturnValue('dusk');
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.mode).toBe('auto');
    expect(result.current.effectiveMode).toBe('dusk');
  });

  it('does not crash when localStorage.getItem throws', () => {
    const original = window.localStorage.getItem.bind(window.localStorage);
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    expect(() => renderHook(() => useTimeOfDayPreference())).not.toThrow();
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.mode).toBe('auto');
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(original);
  });

  it('does not crash when localStorage.setItem throws; state still updates', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(() => act(() => result.current.setMode('dusk'))).not.toThrow();
    expect(result.current.mode).toBe('dusk');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/lib/useTimeOfDayPreference.test.ts`

Expected: FAIL with module-not-found error: `Cannot find module '@/lib/useTimeOfDayPreference'`. The hook file doesn't exist yet.

- [ ] **Step 3: Create the hook**

Create `src/lib/useTimeOfDayPreference.ts` with the following content:

```ts
import { useState } from 'react';
import { getDevModeOverride, useTimeOfDay } from '@/hooks/useTimeOfDay';
import type { TimeOfDayPreference, WorldMode } from '@/lib/timeOfDay';

const STORAGE_KEY = 'gym:settings:time-mode';
const VALID_PREFERENCES: ReadonlyArray<TimeOfDayPreference> = [
  'auto',
  'daytime',
  'dusk',
  'moonlit',
];

interface Result {
  mode: TimeOfDayPreference;
  effectiveMode: WorldMode;
  setMode: (next: TimeOfDayPreference) => void;
}

/**
 * Reads the stored preference from localStorage, validating against the
 * known set. Returns 'auto' on missing, invalid, or storage error.
 */
function readStoredPreference(): TimeOfDayPreference {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (VALID_PREFERENCES as ReadonlyArray<string>).includes(raw)) {
      return raw as TimeOfDayPreference;
    }
  } catch {
    /* ignore */
  }
  return 'auto';
}

/**
 * Owns the user's time-of-day preference and resolves the effective
 * world mode for `body[data-mode]`.
 *
 * Resolution precedence: dev `?mode=` URL > stored preference > auto.
 *
 * The body[data-mode] side effect is intentionally absent in this
 * commit — added in a later atomic migration step alongside removing
 * the existing writers in useTimeOfDay, GymPage, and TownSquarePage.
 *
 * Top-right viewport reserved for TimeOfDayCog (see spec).
 */
export function useTimeOfDayPreference(): Result {
  const [mode, setModeState] = useState<TimeOfDayPreference>(readStoredPreference);
  const autoMode = useTimeOfDay();
  const devOverride = getDevModeOverride();

  const effectiveMode: WorldMode =
    devOverride ?? (mode === 'auto' ? autoMode : mode);

  const setMode = (next: TimeOfDayPreference) => {
    setModeState(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    }
  };

  return { mode, effectiveMode, setMode };
}
```

- [ ] **Step 4: Run the hook test to verify all pass**

Run: `npx vitest run tests/lib/useTimeOfDayPreference.test.ts`

Expected: All 10 tests pass.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npx vitest run`

Expected: All tests pass.

- [ ] **Step 6: Run tsc to verify type compilation**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/useTimeOfDayPreference.ts tests/lib/useTimeOfDayPreference.test.ts
git commit -m "$(cat <<'EOF'
feat(time-of-day): useTimeOfDayPreference hook

Owns the user's time-of-day preference (localStorage key
gym:settings:time-mode) and resolves the effective world mode with
precedence dev URL > stored preference > auto. Defensive try/catch
around localStorage. No body[data-mode] side effect yet — that
lands in the atomic migration commit alongside removing existing
writers.
EOF
)"
```

---

## Task 4: Build `TimeOfDayCog` component (no body side effect yet)

**Why:** Renders the floating cog + popover, uses the hook from Task 3, handles open/close, focus, keyboard, and animation. No DOM side effect on `body[data-mode]` yet — that ships in Task 5.

**Files:**
- Create: `src/components/chrome/TimeOfDayCog.tsx`
- Create: `tests/components/chrome/TimeOfDayCog.test.tsx`

- [ ] **Step 1: Write the failing component test file**

Create `tests/components/chrome/TimeOfDayCog.test.tsx`:

```tsx
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

  it('renders cog button with aria-label, aria-expanded=false, aria-haspopup=menu', () => {
    renderCog();
    const btn = screen.getByRole('button', { name: 'Time of day settings' });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(btn).toHaveAttribute('aria-haspopup', 'menu');
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
    expect(items[0]).toHaveAttribute('aria-checked', 'true');  // Auto
    expect(items[1]).toHaveAttribute('aria-checked', 'false');
    expect(items[2]).toHaveAttribute('aria-checked', 'false');
    expect(items[3]).toHaveAttribute('aria-checked', 'false');
  });

  it('shows muted effective-mode hint next to "Auto" when preference is auto', async () => {
    const user = userEvent.setup();
    renderCog();
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    const auto = await screen.findByRole('menuitemradio', { name: /Auto/ });
    // Mocked useTimeOfDay returns 'daytime' (see vi.mock at top)
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
    await user.keyboard('{ArrowDown}'); // move off first
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
    await user.keyboard('{ArrowDown}{ArrowDown}'); // move to Dusk
    await user.keyboard(' ');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('dusk');
  });
});
```

- [ ] **Step 2: Run the component test file to verify failure**

Run: `npx vitest run tests/components/chrome/TimeOfDayCog.test.tsx`

Expected: FAIL with module-not-found error: `Cannot find module '@/components/chrome/TimeOfDayCog'`.

- [ ] **Step 3: Create the component**

Create `src/components/chrome/TimeOfDayCog.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTimeOfDayPreference } from '@/lib/useTimeOfDayPreference';
import type { TimeOfDayPreference } from '@/lib/timeOfDay';

interface OptionDef {
  value: TimeOfDayPreference;
  label: string;
  icon: JSX.Element;
}

const GearIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const WandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/>
    <path d="m14 7 3 3"/>
    <path d="M5 6v4"/>
    <path d="M19 14v4"/>
    <path d="M10 2v2"/>
    <path d="M7 8H3"/>
    <path d="M21 16h-4"/>
    <path d="M11 3H9"/>
  </svg>
);

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2"/>
    <path d="M12 20v2"/>
    <path d="m4.93 4.93 1.41 1.41"/>
    <path d="m17.66 17.66 1.41 1.41"/>
    <path d="M2 12h2"/>
    <path d="M20 12h2"/>
    <path d="m6.34 17.66-1.41 1.41"/>
    <path d="m19.07 4.93-1.41 1.41"/>
  </svg>
);

const SunsetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 10V8"/>
    <path d="m4.93 10.93 1.41 1.41"/>
    <path d="M2 18h2"/>
    <path d="M20 18h2"/>
    <path d="m19.07 10.93-1.41 1.41"/>
    <path d="M22 22H2"/>
    <circle cx="12" cy="18" r="4"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const OPTIONS: ReadonlyArray<OptionDef> = [
  { value: 'auto',    label: 'Auto',    icon: <WandIcon /> },
  { value: 'daytime', label: 'Daytime', icon: <SunIcon /> },
  { value: 'dusk',    label: 'Dusk',    icon: <SunsetIcon /> },
  { value: 'moonlit', label: 'Moonlit', icon: <MoonIcon /> },
];

/**
 * Floating settings cog at fixed top-right of the viewport.
 * Opens a popover with four time-of-day options.
 *
 * Top-right viewport is reserved for this component — see spec
 * `docs/superpowers/specs/2026-04-26-time-of-day-toggle-design.md`.
 *
 * Note on dev `?mode=` precedence: the URL override wins over both
 * stored preference and auto-derivation. Resolved inside
 * useTimeOfDayPreference. A developer with a stored preference will
 * not see their stored value applied while `?mode=` is set.
 */
export function TimeOfDayCog(): JSX.Element {
  const { mode, effectiveMode, setMode } = useTimeOfDayPreference();
  const [open, setOpen] = useState(false);
  const cogRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  // Close on Escape; restore focus to cog
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        cogRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Close on click outside cog and popover
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (cogRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  // Focus first menuitem on open. useEffect runs post-paint, by which
  // time AnimatePresence has mounted the popover, so the querySelector
  // resolves the rendered DOM directly.
  useEffect(() => {
    if (!open) return;
    const first = popoverRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]');
    first?.focus();
  }, [open]);

  const handleSelect = (value: TimeOfDayPreference) => {
    setMode(value);
    setOpen(false);
    cogRef.current?.focus();
  };

  const handlePopoverKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      popoverRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
    );
    if (items.length === 0) return;
    const currentIdx = items.findIndex((b) => b === document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(currentIdx + 1) % items.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(currentIdx - 1 + items.length) % items.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  };

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 200 }}>
      <button
        ref={cogRef}
        type="button"
        aria-label="Time of day settings"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="time-of-day-cog-btn"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 10,
          cursor: 'pointer',
          color: 'var(--color-ink)',
          opacity: open ? 1 : 0.7,
          transition: 'opacity 120ms ease-out',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GearIcon />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            role="menu"
            aria-label="Time of day"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            onKeyDown={handlePopoverKeyDown}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              transformOrigin: 'top right',
              minWidth: 188,
              padding: 6,
              background: 'var(--color-paper)',
              border: '1px solid color-mix(in srgb, var(--color-ink) 18%, transparent)',
              borderRadius: 14,
              boxShadow: '0 8px 24px rgba(62, 53, 41, 0.18)',
              color: 'var(--color-ink)',
              fontSize: 13,
            }}
          >
            <div
              style={{
                padding: '8px 12px 4px 12px',
                fontSize: 11,
                opacity: 0.6,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Time of day
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {OPTIONS.map((opt) => {
                const isActive = mode === opt.value;
                const showAutoHint = opt.value === 'auto' && mode === 'auto';
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => handleSelect(opt.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      border: 'none',
                      borderRadius: 8,
                      background: isActive ? 'rgba(62, 53, 41, 0.08)' : 'transparent',
                      color: 'var(--color-ink)',
                      cursor: 'pointer',
                      fontWeight: isActive ? 600 : 400,
                      textAlign: 'left',
                    }}
                  >
                    {opt.icon}
                    <span style={{ flex: 1 }}>{opt.label}</span>
                    {showAutoHint && (
                      <span style={{ fontSize: 11, opacity: 0.55 }}>{effectiveMode}</span>
                    )}
                    {isActive && <span aria-hidden>✓</span>}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: Run the component tests**

Run: `npx vitest run tests/components/chrome/TimeOfDayCog.test.tsx`

Expected: All 17 tests pass.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `npx vitest run`

Expected: All tests pass.

- [ ] **Step 6: Run tsc**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/chrome/TimeOfDayCog.tsx tests/components/chrome/TimeOfDayCog.test.tsx
git commit -m "$(cat <<'EOF'
feat(time-of-day): TimeOfDayCog component (no body side effect)

Floating settings cog at fixed top-right with animated popover for
selecting the time-of-day preference. Uses framer-motion for the
120ms scale+fade open/close, native keyboard navigation (Esc, arrow
keys, Home/End, Space), and aria-expanded/aria-haspopup/role=menu
for accessibility.

The body[data-mode] side effect is intentionally absent. Lands in
the next atomic migration commit alongside removing existing
writers in useTimeOfDay, GymPage, and TownSquarePage.
EOF
)"
```

---

## Task 5: Atomic migration commit

**Why:** Three current writers of `body[data-mode]` (useTimeOfDay, TownSquarePage, GymPage) must transition to a single new writer (useTimeOfDayPreference) in one commit. If split, the new writer plus an old writer race when preference is forced — old writer overwrites the explicit preference with the auto-derived value mid-paint.

This task contains many sub-changes that ALL land in a single git commit. The TDD discipline runs once at the task scope: write the failing integration tests first, then make all the changes, then verify everything passes, then commit.

**Files:**
- Create: `tests/integration/timeOfDayCog.integration.test.tsx`
- Modify: `src/lib/useTimeOfDayPreference.ts` (add `useLayoutEffect`)
- Modify: `src/App.tsx` (mount cog)
- Modify: `src/hooks/useTimeOfDay.ts` (remove `useEffect`)
- Modify: `tests/hooks/useTimeOfDay.test.ts` (remove `body[data-mode]` test)
- Modify: `src/pages/TownSquarePage.tsx` (remove writer + JS conditional + import)
- Modify: `src/pages/GymPage.tsx` (remove override state + chrome panel + imports)
- Modify: `src/styles/globals.css` (leaf hide + bulletin reposition)

- [ ] **Step 1: Write the failing integration test file**

Create `tests/integration/timeOfDayCog.integration.test.tsx`:

```tsx
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
    const user = userEvent.setup();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 26, 12, 0));
    window.localStorage.setItem(STORAGE_KEY, 'moonlit');
    render(<MemoryRouter><TimeOfDayCog /></MemoryRouter>);
    expect(document.body.dataset.mode).toBe('moonlit');
    await user.click(screen.getByRole('button', { name: 'Time of day settings' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /Auto/ }));
    expect(document.body.dataset.mode).toBe('daytime');
  });
});
```

- [ ] **Step 2: Verify the integration test fails**

Run: `npx vitest run tests/integration/timeOfDayCog.integration.test.tsx`

Expected: FAIL — the new hook doesn't write `body[data-mode]` yet (per Task 3's intentional omission).

- [ ] **Step 3: Add `useLayoutEffect` to the hook**

Open `src/lib/useTimeOfDayPreference.ts`. Add `useLayoutEffect` to the React import:

```ts
import { useLayoutEffect, useState } from 'react';
```

Then inside the `useTimeOfDayPreference` function, add the side effect right before the `return`:

```ts
  useLayoutEffect(() => {
    if (typeof document !== 'undefined') {
      document.body.dataset.mode = effectiveMode;
    }
  }, [effectiveMode]);

  return { mode, effectiveMode, setMode };
```

- [ ] **Step 4: Mount `<TimeOfDayCog />` in App.tsx**

Open `src/App.tsx` and add the import + JSX. Final file:

```tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GaleWeatherProvider } from '@/lib/galeWeatherContext';
import { TownSquarePage } from './pages/TownSquarePage';
import { GymPage } from './pages/GymPage';
import { TimeOfDayCog } from './components/chrome/TimeOfDayCog';

/**
 * Router + global providers.
 *
 *   /               → TownSquarePage (plaza, new default entry point)
 *   /gym            → GymPage (communal roster, URL-driven Focus Mode off)
 *   /apex|gale|metheus → GymPage (URL-driven Focus Mode on)
 *   anything else   → GymPage (any path outside '/' falls through)
 *
 * The Gym family shares a single `path="/*"` route so GymPage stays
 * mounted across /gym ↔ /apex ↔ /gale ↔ /metheus transitions. That
 * keeps WorldLayer alive and its CSS room-crossfade smooth. Only /
 * (the plaza) is a full scene swap — by design, it's a different world.
 *
 * TimeOfDayCog mounts once outside <Routes> so the floating settings
 * cog persists across navigation and writes body[data-mode] globally.
 */
export default function App() {
  return (
    <GaleWeatherProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<TownSquarePage />} />
          <Route path="/*" element={<GymPage />} />
        </Routes>
        <TimeOfDayCog />
      </BrowserRouter>
    </GaleWeatherProvider>
  );
}
```

- [ ] **Step 5: Remove the `useEffect` from `useTimeOfDay.ts`**

Open `src/hooks/useTimeOfDay.ts`. Delete the `useEffect` that sets `document.body.dataset.mode` (lines around 25-27 in the current file):

Delete this block:
```ts
  useEffect(() => {
    document.body.dataset.mode = mode;
  }, [mode]);
```

The hook still tracks mode and re-derives on hour boundary, but no longer writes to `body[data-mode]`. Final hook (after all changes):

```ts
import { useEffect, useState } from 'react';
import { hourToMode, type WorldMode } from '@/lib/timeOfDay';

const CACHE_KEY = 'gym_world_mode';
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 min
const CHECK_INTERVAL_MS = 60 * 1000; // re-check every minute for hour crossings

interface CacheEntry {
  mode: WorldMode;
  computedAt: number;
}

/**
 * Returns the current world-layer mode (hour-derived). Pure derivation;
 * does NOT write to `body[data-mode]` — that is owned by
 * useTimeOfDayPreference which factors in user preference and dev URL
 * override.
 *
 * Caches in localStorage for up to 60 minutes AND only while the cached
 * hour bucket matches the current hour bucket — see the bucket check
 * inside compute(). Without the bucket check, a 4:30pm load would stay
 * 'daytime' until 5:30pm even though dusk starts at 5pm.
 *
 * Dev-only: `?mode=daytime|dusk|moonlit` pins the mode for QA. Stripped
 * from production builds via the `import.meta.env.DEV` guard.
 */
export function useTimeOfDay(): WorldMode {
  const [mode, setMode] = useState<WorldMode>(() => compute());

  useEffect(() => {
    if (getDevModeOverride() !== null) return;
    const id = window.setInterval(() => {
      const next = compute();
      setMode((prev) => (prev === next ? prev : next));
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return mode;
}

export function getDevModeOverride(): WorldMode | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  try {
    const param = new URLSearchParams(window.location.search).get('mode');
    if (param === 'daytime' || param === 'dusk' || param === 'moonlit') {
      return param;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function compute(): WorldMode {
  const override = getDevModeOverride();
  if (override !== null) return override;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry;
        const cachedHour = new Date(parsed.computedAt).getHours();
        const currentHour = new Date().getHours();
        if (
          Date.now() - parsed.computedAt < CACHE_TTL_MS &&
          cachedHour === currentHour
        ) {
          return parsed.mode;
        }
      }
    } catch {
      /* ignore */
    }
  }
  const mode = hourToMode(new Date().getHours());
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ mode, computedAt: Date.now() } satisfies CacheEntry),
      );
    } catch {
      /* ignore */
    }
  }
  return mode;
}
```

- [ ] **Step 6: Update `tests/hooks/useTimeOfDay.test.ts`**

Open `tests/hooks/useTimeOfDay.test.ts`. Delete the test block titled `'sets body[data-mode] as a side effect so CSS variable inheritance works'` (lines around 36-41 in the current file). Final test file:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';

describe('useTimeOfDay', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.removeAttribute('data-mode');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns daytime at noon', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 21, 12, 0));
    const { result } = renderHook(() => useTimeOfDay());
    expect(result.current).toBe('daytime');
  });

  it('returns dusk at 7pm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 21, 19, 0));
    const { result } = renderHook(() => useTimeOfDay());
    expect(result.current).toBe('dusk');
  });

  it('returns moonlit at 1am', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 21, 1, 0));
    const { result } = renderHook(() => useTimeOfDay());
    expect(result.current).toBe('moonlit');
  });

  it('invalidates cache when hour bucket crosses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 26, 16, 30));
    const { result: first, unmount: unmount1 } = renderHook(() => useTimeOfDay());
    expect(first.current).toBe('daytime');
    unmount1();

    vi.setSystemTime(new Date(2026, 3, 26, 17, 30));
    const { result: second } = renderHook(() => useTimeOfDay());
    expect(second.current).toBe('dusk');
  });
});
```

- [ ] **Step 7: Modify `TownSquarePage.tsx`**

Open `src/pages/TownSquarePage.tsx`. Make three edits:

7a. Remove the import at line 6:
```ts
// DELETE THIS LINE:
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
```

7b. Remove the `autoMode` declaration at line 184:
```ts
// DELETE THIS LINE:
  const autoMode = useTimeOfDay();
```

7c. Remove the body-set useEffect at lines 293-296:
```ts
// DELETE THIS BLOCK:
  // Body attributes.
  useEffect(() => {
    document.body.dataset.mode = autoMode;
  }, [autoMode]);
```

(Note: keep the second useEffect at lines 297-304 that sets `body.dataset.route` — it's unrelated and still valid.)

7d. Drop the `autoMode !== 'moonlit'` JS conditional at lines 509-521. Find this exact block:

```tsx
        {/* Ambient wind leaves. Skipped at moonlit — a quiet night
            scene reads better without motion. */}
        {autoMode !== 'moonlit' &&
          LEAVES.map((leaf) => (
            <span
              key={leaf.key}
              aria-hidden
              className={`town-leaf town-leaf--${leaf.variant} ambient-motion`}
              style={{
                top: `${leaf.topPct}%`,
                animationDelay: `${leaf.delayS}s`,
                animationDuration: `${leaf.durationS}s`,
              }}
            />
          ))}
```

Replace with (also update the comment to reflect that leaf suppression is now CSS-driven):

```tsx
        {/* Ambient wind leaves. Hidden under moonlit via CSS
            (body[data-mode="moonlit"] .town-leaf { display: none })
            so the suppression follows user-effective mode (preference >
            auto), not raw auto. */}
        {LEAVES.map((leaf) => (
          <span
            key={leaf.key}
            aria-hidden
            className={`town-leaf town-leaf--${leaf.variant} ambient-motion`}
            style={{
              top: `${leaf.topPct}%`,
              animationDelay: `${leaf.delayS}s`,
              animationDuration: `${leaf.durationS}s`,
            }}
          />
        ))}
```

- [ ] **Step 8: Modify `GymPage.tsx`**

Open `src/pages/GymPage.tsx`. Make four edits:

8a. Remove the imports at lines 5 and 15:
```ts
// DELETE THESE LINES:
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import type { WorldMode } from '@/lib/timeOfDay';
```

8b. Remove the override state declaration at lines 48-53:
```ts
// DELETE THIS BLOCK:
  const autoMode = useTimeOfDay();
  const [override, setOverride] = useState<WorldMode | null>(null);
  if (override && document.body.dataset.mode !== override) {
    document.body.dataset.mode = override;
  }
  const effectiveMode = override ?? autoMode;
```

8c. Remove the chrome panel `<div>` block at lines 145-206 entirely. Find this block (starts with `<div className="gym-chrome flex flex-wrap items-center gap-2 text-[11px]"`) and delete from the opening `<div>` through its closing `</div>` on line 206.

The result: lines 144-145 are now `</header>` followed directly by the next `<div className="gym-chrome">` (the VisitDeltaStrip wrapper).

8d. Remove the now-unused `useState` import if `useState` isn't used elsewhere in the file. Check after deletions — if `useState` has no other usage, drop it from the React import. (If it's still used, leave it.)

- [ ] **Step 9: Modify `globals.css`**

Open `src/styles/globals.css`. Make two changes:

9a. Add the leaf-hide rule. Find the existing `.town-leaf` definition (around line 743) and after the existing `.town-leaf` rules, add:

```css
/* Hide ambient leaves under any moonlit world (auto or forced). The
   prior JS conditional `autoMode !== 'moonlit'` only honored
   hour-derived auto mode; CSS-only suppression now correctly follows
   the user-effective mode (preference > auto). */
body[data-mode="moonlit"] .town-leaf {
  display: none;
}
```

9b. Reposition `.town-bulletin-hud`. Find the existing `.town-bulletin-hud` rule (around line 863) and change the `top` value:

```css
/* Repositioned from top: 16px → top: 64px to make room for the
   TimeOfDayCog at top-right. Cog occupies the top-most slot; the
   bulletin docks below. */
.town-bulletin-hud {
  position: absolute;
  top: 64px;       /* was: 16px */
  right: 16px;
  /* ...rest of existing rules unchanged */
}
```

(Only the `top` value changes from `16px` to `64px`. Preserve every other property — width, padding, border-radius, etc.)

- [ ] **Step 10: Run the full test suite**

Run: `npx vitest run`

Expected: ALL tests pass — including:
- `useTimeOfDay` test file (4 tests; the body[data-mode] test was removed in step 6, the cache rollover test from Task 1 stays)
- `useTimeOfDayPreference` test file (10 tests)
- `TimeOfDayCog` component tests (17 tests)
- Integration tests (3 tests, now passing thanks to step 3's `useLayoutEffect`)
- All pre-existing tests (Track B, etc.)

If any pre-existing test fails (especially TownSquarePage or GymPage tests that asserted `body[data-mode]` was set after rendering), update those tests to render `<TimeOfDayCog />` alongside the page under test, or to set `body.dataset.mode` directly in the test setup.

- [ ] **Step 11: Run tsc**

Run: `npx tsc --noEmit`

Expected: No errors.

- [ ] **Step 12: Run the build to confirm production compiles**

Run: `npm run build`

Expected: Successful build, no warnings beyond what was present pre-task.

- [ ] **Step 13: Stage all changes and commit atomically**

```bash
git add \
  src/lib/useTimeOfDayPreference.ts \
  src/components/chrome/TimeOfDayCog.tsx \
  src/App.tsx \
  src/hooks/useTimeOfDay.ts \
  src/pages/TownSquarePage.tsx \
  src/pages/GymPage.tsx \
  src/styles/globals.css \
  tests/hooks/useTimeOfDay.test.ts \
  tests/integration/timeOfDayCog.integration.test.tsx

git commit -m "$(cat <<'EOF'
feat(time-of-day): atomic migration to global cog

Mounts <TimeOfDayCog /> in App.tsx; adds useLayoutEffect body-set to
useTimeOfDayPreference; removes the body[data-mode] writers from
useTimeOfDay, TownSquarePage, and GymPage; drops the GymPage inline
mode-switcher chrome panel; replaces TownSquare's JS leaf-suppression
with CSS (body[data-mode=moonlit] .town-leaf); repositions
.town-bulletin-hud to top: 64 to make room for the cog.

Atomic to avoid the multi-writer race window that would otherwise
flicker explicit preferences during the transition.
EOF
)"
```

---

## Task 6: Verification + visual eyeball

**Why:** Confirms the spec's 11 acceptance criteria pass against the live build. Catches anything tests can't (visual layout at 390×844, motion smoothness, leaves under forced moonlit, bulletin not colliding with cog).

**Files:** none modified unless eyeball reveals an issue.

- [ ] **Step 1: Run the dev server (if not already running)**

Run: `npm run dev` (in a separate terminal)

Expected: Server up at `http://localhost:5173`. Confirm with `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/` → `200`.

- [ ] **Step 2: Mobile eyeball at 390×844 via Playwright MCP**

Verify each of these against the spec's acceptance criteria. Capture screenshots in `.playwright-mcp/`.

For each route below, navigate, take a full-page screenshot, and verify:
- Cog is visible at top-right (16px from edges)
- Cog click opens popover; 4 options in order Auto/Daytime/Dusk/Moonlit
- Active option (matching localStorage) has filled background + bold + ✓
- Auto label shows muted effective-mode hint
- Esc / outside-click / option-selection all close the popover
- `body[data-mode]` only ever shows `daytime|dusk|moonlit`, never `auto`

Routes to walk:
- `http://localhost:5173/` (Town Square — confirm cog does NOT collide with `.town-bulletin-hud` when it renders; if no delta is showing, simulate by setting localStorage `gym:lastVisit` to a known prior value)
- `http://localhost:5173/gym` (Gym roster — confirm chrome panel is REMOVED, no `Mode: ... · Data: live` strip; cog at top-right; "Back to plaza" still at top-left)
- `http://localhost:5173/apex` (Focus Mode — confirm cog above the focus-back button)
- `http://localhost:5173/gale` (same)
- `http://localhost:5173/metheus` (same)

- [ ] **Step 3: Forced-mode visual checks**

In dev tools console at `http://localhost:5173/`, set then reload:

```js
localStorage.setItem('gym:settings:time-mode', 'moonlit'); location.reload();
```

Verify:
- World renders moonlit regardless of clock hour
- `.town-leaf` elements are hidden (visual: no leaves drifting; DOM check via `document.querySelectorAll('.town-leaf').length` should be > 0 but their computed style `display === 'none'`)
- Cog popover shows Moonlit as active (filled bg + bold + ✓), Auto as inactive (no checkmark, no hint since preference is not 'auto')

Repeat with `'daytime'`:
```js
localStorage.setItem('gym:settings:time-mode', 'daytime'); location.reload();
```
At 9pm local time, world should still be daytime.

- [ ] **Step 4: Dev URL override precedence check**

Visit `http://localhost:5173/?mode=dusk` while preference is `'moonlit'` (left over from Step 3). Verify world is dusk (URL wins), even though stored preference is moonlit. Cog popover still shows moonlit as the active option (because stored preference is unchanged) — that's correct; URL is a runtime override that doesn't mutate preference.

- [ ] **Step 5: Commit any visual fixes (if needed)**

If any acceptance criteria fail during eyeball, fix and commit. Each fix gets its own commit:

```bash
git commit -m "polish(time-of-day): <specific fix>"
```

If everything passes, no commit is needed for this task.

---

## Acceptance criteria check (run this checklist before declaring done)

| # | Criterion | How to verify |
|---|---|---|
| 1 | Cog visible at top: 16, right: 16 on every route at 390×844 + 1440×900 | Playwright at both viewports |
| 2 | Click cog → popover with 4 options in order: Auto, Daytime, Dusk, Moonlit | Component test #7 + visual |
| 3 | Auto label shows muted effective-mode hint | Component test #9 + visual |
| 4 | Active option has filled bg, bold, ✓ | Component test #8 + visual |
| 5 | Click "Dusk" → world tints, popover closes, focus to cog | Integration test #2 + component test #11 + visual |
| 6 | Reload → preference persists; world re-tints to last selection without flash | Hook tests #2/#3 + visual; useLayoutEffect kills FOUC |
| 7 | Esc / outside-click / route-change closes popover | Component tests #5/#6 + visual route nav |
| 8 | ArrowUp/Down navigate; Enter activates | Component tests #14/#15 |
| 9 | `body[data-mode]` only ever `'daytime'|'dusk'|'moonlit'` | Integration tests + grep for `'auto'` writes |
| 10 | GymPage no longer renders `Mode: ... · Data: ...` chrome panel | Visual /gym + grep |
| 11 | `useTimeOfDay` no longer writes `body.dataset.mode` | Test #6 (removed) + grep `useTimeOfDay.ts` for `body.dataset` |

---

## Plan complete

After Task 6 passes:

- All 5 commits land on `phase-5-time-of-day`
- Push branch + open PR #13 against `main`
- Codex review on the diff (use `/codex-review`)
- Address any review findings
- Merge after Brandon's approval
