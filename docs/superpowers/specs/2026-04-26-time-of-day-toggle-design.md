---
title: "Time-of-Day Toggle — Design Spec"
status: approved
created: 2026-04-26
updated: 2026-04-26
owner: Brandon
project: lyforic/trading-gym
---

# Time-of-Day Toggle — Design Spec

## Summary

Replace the inline `daytime / dusk / moonlit / auto` mode switcher currently rendered inside `GymPage` with a global floating settings cog that is accessible from every route (Town Square, Gym, Focus Mode). The cog opens a popover with four options. The user's choice persists in `localStorage` and is honored across reloads. When `'auto'` is selected, world mode defers to the existing `useTimeOfDay` hour-derivation logic.

## Goal

One global, persistent, accessible surface for setting the world's time-of-day mode — usable on mobile and desktop, removing the route-specific inline switcher in favor of a single source of truth.

## Locked decisions (from brainstorm)

| Decision | Value |
|---|---|
| Cog placement | Fixed-to-viewport, top-right corner (`top: 16px; right: 16px; z-index: 200`) |
| Cog trigger | Click to open / close (mobile-safe; no hover-to-open) |
| Cog visual | Outline gear (Lucide style), 22×22, monochrome `currentColor` stroke |
| Popover layout | Vertical list with **icon + text + active-state checkmark** (Layout B from brainstorm) |
| Auto label | Shows resolved effective mode in muted text (e.g. `"Auto · daytime"`) |
| Persistence key | `localStorage["gym:settings:time-mode"]` |
| Default value | `'auto'` |
| Scope | V1 only the time-of-day preference. No general settings shell. |
| Migration | Existing GymPage inline mode-switcher panel is REMOVED. Popover is the only surface. |

## Architecture

### Single source of truth

The toggle introduces a single source of truth for user **preference**, one of `'auto' | 'daytime' | 'dusk' | 'moonlit'`. The current world **mode** is *derived* from this preference:

- `'auto'` → defers to `useTimeOfDay()` (existing hour-derived hook)
- explicit values (`'daytime' | 'dusk' | 'moonlit'`) pass through directly

### Two new units

| Unit | Path | Responsibility |
|---|---|---|
| Hook | `src/lib/useTimeOfDayPreference.ts` | Owns the preference (localStorage `gym:settings:time-mode`). Exposes `{ mode, effectiveMode, setMode }`. Sets `body[data-mode]` as side effect when `effectiveMode` changes. |
| Component | `src/components/chrome/TimeOfDayCog.tsx` | Floating cog button + popover. Reads / writes preference via the hook. Renders four options with active state + auto's effective-mode hint. |

### Mounting

The cog mounts once at `App.tsx` level so:

- `body[data-mode]` is set globally regardless of route
- Cog renders on every page (Town Square, Gym, Focus Mode)
- No remount across `/gym ↔ /apex ↔ /gale ↔ /metheus` transitions (cog is *outside* the `/*` GymPage route)

### Why one hook, not Context

The preference doesn't need to be subscribed from many places. Only the cog component reads it directly. Consumers of *mode* (CSS, `WorldLayer`) read `body[data-mode]` — that's the existing API. So a single hook instance + side effect is the simplest viable shape. Context would be over-engineering for one consumer.

## Components

### Hook: `src/lib/useTimeOfDayPreference.ts`

```ts
import type { WorldMode } from '@/lib/timeOfDay';

export type TimeOfDayPreference = 'auto' | WorldMode;
// WorldMode = 'daytime' | 'dusk' | 'moonlit' (already exported from src/lib/timeOfDay.ts)

interface Result {
  mode: TimeOfDayPreference;        // user's stored preference
  effectiveMode: WorldMode;         // resolved (auto → useTimeOfDay)
  setMode: (next: TimeOfDayPreference) => void;
}

export function useTimeOfDayPreference(): Result;
```

Implementation contract:

- Lazy `useState` initializer reads `localStorage["gym:settings:time-mode"]`. Validates membership in `['auto', 'daytime', 'dusk', 'moonlit']`. Defaults to `'auto'` if missing, invalid, or if localStorage throws (try / catch).
- `setMode` updates state AND writes to localStorage (try / catch on write).
- Internally calls `useTimeOfDay()` to get `autoMode`. Computes `effectiveMode = mode === 'auto' ? autoMode : mode`.
- `useLayoutEffect` (not `useEffect`) writes `document.body.dataset.mode = effectiveMode` whenever it changes — fires before first paint, no FOUC.
- SSR guard: existing `useTimeOfDay` pattern uses `typeof window !== 'undefined'`. The new hook mirrors this defensively for future-proofing.

### Component: `src/components/chrome/TimeOfDayCog.tsx`

Self-contained. No props.

```tsx
export function TimeOfDayCog(): JSX.Element;
```

Rendered structure (high-level):

```
<div className="time-of-day-cog-root" style={{ position: fixed; top: 16; right: 16; z-index: 50 }}>
  <button aria-label="Time of day settings" aria-expanded={open} aria-haspopup="menu">
    <GearIcon />
  </button>
  <AnimatePresence>
    {open && (
      <motion.div role="menu" /* anchored below cog, right-aligned */>
        <MenuItemRadio value="auto" checked={mode === 'auto'} onSelect={...}>
          <WandIcon /> Auto <span muted>{effectiveMode}</span>
        </MenuItemRadio>
        <MenuItemRadio value="daytime" checked={mode === 'daytime'} onSelect={...}>
          <SunIcon /> Daytime
        </MenuItemRadio>
        <MenuItemRadio value="dusk" checked={mode === 'dusk'} onSelect={...}>
          <SunsetIcon /> Dusk
        </MenuItemRadio>
        <MenuItemRadio value="moonlit" checked={mode === 'moonlit'} onSelect={...}>
          <MoonIcon /> Moonlit
        </MenuItemRadio>
      </motion.div>
    )}
  </AnimatePresence>
</div>
```

| Surface | Spec |
|---|---|
| Cog button | Fixed top-right. Outline gear (22×22 SVG, `stroke="currentColor"`, `stroke-width=2`). `aria-label="Time of day settings"`. `aria-expanded` reflects popover state. `aria-haspopup="menu"`. Hover: opacity 0.7 → 1. |
| Popover anchor | Below cog, right-edge-aligned to cog's right edge. `min-width: 188px`. Background `var(--color-paper)`. Border `1px solid` mixing ink at ~18% alpha. `border-radius: 14px`. `box-shadow: 0 8px 24px rgba(62, 53, 41, 0.18)`. Padding `6px`. |
| Popover role | `role="menu"`. Each option is `role="menuitemradio"` with `aria-checked` reflecting active mode. |
| Active option | Light fill `rgba(62, 53, 41, 0.08)`, bold weight, trailing unicode checkmark `✓` (text). |
| Auto's effective-mode hint | Muted right-aligned text `var(--color-ink-muted)`, 11px. Live-updates if hour crosses while popover is open. |

### Existing code changes

| File | Change |
|---|---|
| `src/hooks/useTimeOfDay.ts` | **Remove** the `useEffect` that writes `body.dataset.mode`. Hook becomes a pure hour-derivation utility. |
| `src/App.tsx` | **Add** `<TimeOfDayCog />` once inside `<BrowserRouter>`, outside `<Routes>`, so it sits above all pages. |
| `src/pages/GymPage.tsx` | **Remove** `[override, setOverride]` state (lines 48-53). **Remove** the chrome panel (lines 145-206) entirely (mode controls + data indicator both gone — see Out-of-Scope rationale). **Remove** `useTimeOfDay` and `WorldMode` imports. |
| `src/pages/TownSquarePage.tsx` | **Remove the body-set useEffect at lines 293-296** (which currently writes `document.body.dataset.mode = autoMode`). **KEEP** the `useTimeOfDay` import + call (line 184) — `autoMode` is consumed at line 509 (`{autoMode !== 'moonlit' && LEAVES.map(...)}`) for ambient leaf rendering. |

## Data Flow

### Single chain, single side effect

```
[localStorage] → useState init
                     ↓
         preference: 'auto' | 'daytime' | 'dusk' | 'moonlit'
                     ↓
       (if 'auto')  useTimeOfDay() → autoMode
                     ↓
         effectiveMode: 'daytime' | 'dusk' | 'moonlit'
                     ↓
              useLayoutEffect → body.dataset.mode = effectiveMode
                     ↓
          CSS variables in globals.css cascade
                     ↓
          WorldLayer + agent-card colors update
```

The new hook is the **only** writer to `body[data-mode]`. CSS and `WorldLayer` continue to read it the same way they do today — zero changes downstream.

### Invariants

| # | Invariant |
|---|---|
| 1 | `preference` is the only persisted state. `effectiveMode` is derived, never stored. |
| 2 | `body[data-mode]` only ever receives `'daytime' \| 'dusk' \| 'moonlit'` (the 3 `WorldMode` values). It never sees `'auto'` — auto resolves before the side effect. |
| 3 | When `preference !== 'auto'`, hour crossings inside `useTimeOfDay` are ignored — the user's explicit choice wins. `effectiveMode` stays pinned. |
| 4 | When `preference === 'auto'`, hour crossings propagate: `autoMode` changes → re-render → `effectiveMode` recomputes → `useLayoutEffect` writes new value to body. |

### Trigger trace examples

| Trigger | What happens |
|---|---|
| User clicks "Dusk" in popover | `setMode('dusk')` → state update + localStorage write → `effectiveMode === 'dusk'` → effect fires → body[data-mode]=dusk → CSS retints |
| User clicks "Auto" while sun is up | `setMode('auto')` → state update + localStorage write → `effectiveMode = autoMode = 'daytime'` → effect fires → body[data-mode]=daytime |
| Hour rolls 5pm→6pm, preference=`'auto'` | `useTimeOfDay` interval fires → `autoMode` becomes 'dusk' → `useTimeOfDayPreference` re-renders → `effectiveMode` recomputes to 'dusk' → effect fires → body[data-mode]=dusk |
| Hour rolls 5pm→6pm, preference=`'daytime'` (forced) | `useTimeOfDay` interval fires → `autoMode` changes → `useTimeOfDayPreference` re-renders BUT `effectiveMode` stays 'daytime' (preference wins) → no body change → no visual change |
| Page reload, preference=`'moonlit'` | Lazy init reads localStorage → preference='moonlit' → `effectiveMode='moonlit'` → effect fires on mount → body[data-mode]=moonlit. **No FOUC** thanks to `useLayoutEffect`. |

### SSR safety

The codebase is Vite SPA (BrowserRouter, no SSR), so `window.localStorage` is always available at hook execution time. Existing pattern in `useTimeOfDay.ts:46` guards `typeof window !== 'undefined'`. The new hook mirrors this pattern for consistency, even though we don't currently SSR. Cost: ~3 lines of guards. Worth it for future-proofing.

## Behavior

### Open / close triggers

| Trigger | Result |
|---|---|
| Click cog when closed | Opens popover, focus moves to first menuitem |
| Click cog when open | Closes popover, focus returns to cog |
| Esc key while open | Closes, focus returns to cog |
| Click outside popover | Closes (document `mousedown` listener; ignores clicks inside cog or popover) |
| Click any option | Calls `setMode`, closes, focus returns to cog |
| Route change while open | Closes (listen to `useLocation().pathname`; navigation is implicit dismissal) |

### Focus & keyboard (a11y)

| Concern | Spec |
|---|---|
| Roles | Cog button: `aria-label`, `aria-expanded`, `aria-haspopup="menu"`. Popover: `role="menu"`. Each option: `role="menuitemradio"` with `aria-checked` reflecting the active mode. |
| Open focus | First menuitem (Auto) gets focus on open. |
| Close focus | Focus returns to cog button on every close path (Esc, outside-click, selection, second cog click). |
| Arrow keys | ↑/↓ traverse menuitems. Home/End jump to first/last. |
| Enter / Space | Activate the focused menuitem. |
| Tab | Standard tab order — cog focusable; menuitems aren't tab-stops once popover is closed. |

### Mobile placement

- Cog at `top: 16px; right: 16px` — top-right is empty across all routes (`/`, `/gym`, `/apex`, `/gale`, `/metheus`) per PR #11 mobile eyeball at 390×844.
- "Back to plaza" / "Back to gym" buttons live at top-LEFT — no collision.
- Popover anchors to cog's right edge, expands down + left. `min-width: 188px` fits with ~150px clear of left edge at 390px viewport.
- Tap target: cog button gets 10px padding → ~42×42 effective area. Acceptable; bump to 12px if it feels small during eyeball.

### Z-index stacking

The codebase has a defined z-index ecosystem (verified via `globals.css`):

| Layer | z-index | Notes |
|---|---|---|
| World HUD (`.town-hud`) | 150 | Screen-space labels + ambient leaves; `pointer-events: none` |
| **TimeOfDayCog (new)** | **200** | Sits above world HUD chrome so the gear stays visible over labels/leaves |
| Welcome backdrop (`.welcome-backdrop`) | 500 | Onboarding modal — covers the cog (intentional; cog reappears on dismiss) |
| Pan hint (`.town-pan-hint`) | 9999 | Ephemeral mobile hint; covers everything briefly (acceptable) |
| Focus-mode backdrop | default 0 | `position: fixed; inset: 0`; cog at 200 dominates trivially |

The cog popover shares the cog's stacking context (no separate z-index needed).

### Animation

Use **framer-motion** (already a dependency, matches GymPage `AnimatePresence` pattern):

```tsx
<AnimatePresence>
  {open && (
    <motion.div
      role="menu"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      style={{ transformOrigin: 'top right' }}
    >
      ...
    </motion.div>
  )}
</AnimatePresence>
```

- Open: 120ms ease-out, opacity 0 → 1, scale 0.96 → 1, origin top-right (popover "drops" from cog).
- Close: same curve, reversed.
- Cog itself: no rotation or color change on open. Subtle hover state: opacity 0.7 → 1.

## Testing

### Test files

| File | Type | Coverage |
|---|---|---|
| `tests/lib/useTimeOfDayPreference.test.ts` | New unit (hook) | Preference state + localStorage + body side effect |
| `tests/components/chrome/TimeOfDayCog.test.tsx` | New component | Open/close, selection, a11y, focus management |
| `tests/integration/timeOfDayCog.integration.test.tsx` | New integration | Cog → preference → body[data-mode] end-to-end |
| `tests/hooks/useTimeOfDay.test.ts` | Modify (if exists) | Drop assertions about `body.dataset.mode` since the side effect moved |

### Hook test cases (`useTimeOfDayPreference.test.ts`)

| # | Behavior |
|---|---|
| 1 | Default preference is `'auto'` when localStorage is empty |
| 2 | Reads stored preference from localStorage on init (write `'dusk'` → returned) |
| 3 | `setMode('moonlit')` updates state AND writes localStorage |
| 4 | `effectiveMode === autoMode` when preference is `'auto'` |
| 5 | `effectiveMode === preference` when preference is explicit |
| 6 | `body.dataset.mode` is set to `effectiveMode` on mount |
| 7 | `body.dataset.mode` updates when `setMode` is called |
| 8 | When preference is `'auto'` and `autoMode` changes (mock `useTimeOfDay` to return changed value), `effectiveMode` and body update |
| 9 | When preference is explicit and `autoMode` changes, `effectiveMode` and body stay pinned |
| 10 | localStorage `getItem` throws → falls back to `'auto'` default (no crash) |
| 11 | localStorage `setItem` throws → state still updates (no crash) |
| 12 | Corrupt localStorage value (e.g., `"lunch"`) → falls back to `'auto'` (validation guard) |

### Component test cases (`TimeOfDayCog.test.tsx`)

| # | Behavior |
|---|---|
| 1 | Renders cog button with `aria-label="Time of day settings"` and `aria-expanded="false"` |
| 2 | Cog click opens popover; `aria-expanded="true"` |
| 3 | Cog click again closes popover |
| 4 | Esc while open → closes, focus returns to cog |
| 5 | Click outside popover → closes |
| 6 | Click "Dusk" option → calls `setMode('dusk')` AND closes popover |
| 7 | Active option has `aria-checked="true"` + visual indicator (filled bg + checkmark) |
| 8 | Auto label shows muted `effectiveMode` hint when preference is `'auto'` (e.g., `"Auto"` + `"daytime"`) |
| 9 | First menuitem receives focus when popover opens |
| 10 | ArrowDown/ArrowUp moves focus through menuitems |
| 11 | Renders 4 options in order: Auto, Daytime, Dusk, Moonlit |

### Integration test cases (`timeOfDayCog.integration.test.tsx`)

| # | Behavior |
|---|---|
| 1 | Mount `<TimeOfDayCog />` with empty localStorage → `body[data-mode]` is set to current `autoMode` |
| 2 | Open popover → click "Dusk" → `body.dataset.mode === 'dusk'` |
| 3 | Open popover → click "Auto" → `body.dataset.mode === autoMode` |
| 4 | Existing `useTimeOfDay` no longer sets `body[data-mode]` — assert absence after dropping the cog |

### TDD discipline

Match Track B's pattern: failing test → minimal implementation → passing test → commit. Each task in the plan ends with one logical commit. Subagent-driven execution with spec compliance + code quality reviewers per task.

### What NOT to test (YAGNI)

- Animation timing (covered by framer-motion's own test suite + visual eyeball at implementation)
- Specific pixel positioning of the popover (covered by visual eyeball)
- All keyboard combinations (cover the 4 we care about: Esc, Arrow up/down, Enter, Tab)
- localStorage quota exceeded specifically (the throw-handling test covers it generically)

## Migration order

Three places in the codebase currently write `body[data-mode]`:

1. `src/hooks/useTimeOfDay.ts` (the canonical auto-mode writer)
2. `src/pages/TownSquarePage.tsx` lines 293-296 (sets `body.dataset.mode = autoMode` on TownSquare mount)
3. `src/pages/GymPage.tsx` lines 50-52 + 192-195 (sets `body.dataset.mode = override` when override is forced via the inline switcher)

After migration, ONLY `src/lib/useTimeOfDayPreference.ts` writes. To avoid the in-between race where multiple writers disagree (e.g., new hook says `'dusk'`, old `useTimeOfDay` says `'daytime'`), the writer transition happens atomically.

| # | Step | Why this order |
|---|---|---|
| 1 | Add `TimeOfDayPreference` type to `src/lib/timeOfDay.ts` (export alongside `WorldMode`) | Type lands first so consumers compile |
| 2 | Create `src/lib/useTimeOfDayPreference.ts` (preference + setMode + effectiveMode, **no body side effect yet**) | Logic without DOM writes — testable in isolation |
| 3 | Create `src/components/chrome/TimeOfDayCog.tsx` (uses hook, renders popover, no DOM side effects yet) | Component shape and accessibility lockdown without affecting body[data-mode] |
| 4 | **Atomic migration commit:** (a) add `useLayoutEffect` body-set to new hook, (b) mount `<TimeOfDayCog />` in App.tsx, (c) remove `useEffect` from `useTimeOfDay.ts`, (d) remove body-set useEffect from `TownSquarePage.tsx` (lines 293-296), (e) remove `[override, setOverride]` state + chrome panel (lines 145-206) + `useTimeOfDay`/`WorldMode` imports from `GymPage.tsx`. | All writers must transition in one commit — if split, the new hook plus an old writer both run and may disagree on the active mode (race / flicker). |
| 5 | Add tests per Testing section | TDD discipline applies per-step inline; this row is a catch-all for any tests not yet written |

Step 4 is the load-bearing one — atomic to avoid the race.

## Edge cases

| # | Case | Disposition |
|---|---|---|
| 1 | Hour crosses while popover is open + preference = `'auto'` | Auto label's muted effective-mode hint updates live (e.g., "daytime" → "dusk"). Popover stays open. Acceptable; no special handling. |
| 2 | Two tabs with different preferences | localStorage doesn't sync across tabs by default. **YAGNI for V1** — single-user dashboard. If desired later, listen to `window.addEventListener('storage', ...)` in the hook. |
| 3 | Corrupt localStorage value (e.g., `"lunch"`) | Hook validates: `if (!['auto','daytime','dusk','moonlit'].includes(stored)) return 'auto'`. Defensive parse, no crash. |
| 4 | Future route adds top-right element that collides with cog | Document the constraint in component JSDoc: "top-right viewport reserved for TimeOfDayCog." Future Claude reads it. |
| 5 | Existing dev `?mode=dusk` URL override | When preference is `'auto'`, URL override flows through `useTimeOfDay` → effective mode follows URL. When preference is explicit, user's choice wins; URL override is ignored. Document in JSDoc; small surprise for someone debugging. |
| 6 | First-paint FOUC on `body[data-mode]` | Use `useLayoutEffect` (NOT `useEffect`) for the body-set side effect — fires before paint, no flash. |
| 7 | WelcomeModal overlay on first TownSquare visit | `.welcome-backdrop` is at z-index 500 (verified in `globals.css:1014`); cog at 200 sits below it during onboarding (acceptable — modal is a hard interrupt; cog reappears on dismiss). |

## Out of scope (V1)

- General settings shell (sound, motion-reduce, etc.) — single-purpose popover for now
- Cross-tab localStorage sync via `storage` event
- Pinned mode hint in the cog itself (current selection only shows in popover content)
- Hover state on cog beyond opacity 0.7 → 1
- Animation customization (one default value per Behavior section)
- Restoring the `Data: live (err)` indicator that lived in the GymPage chrome panel — Supabase is canonical now; if the indicator is wanted later, it can be added to TrustStrip in a one-line change.

## Acceptance criteria

A reasonable reviewer should be able to verify:

1. Cog is visible at `top: 16px; right: 16px` on every route at 390×844 and 1440×900 viewports.
2. Click cog → popover opens with 4 options in order: Auto, Daytime, Dusk, Moonlit.
3. Auto label shows muted effective-mode hint (e.g., "daytime").
4. Active option has filled background, bold weight, trailing checkmark.
5. Click "Dusk" → world tints to dusk, popover closes, focus returns to cog.
6. Reload → preference persists; world re-tints to last selection without flash.
7. Esc closes popover; click outside closes popover; route change closes popover.
8. ArrowUp/ArrowDown navigate options; Enter activates.
9. `body[data-mode]` only ever receives `'daytime' | 'dusk' | 'moonlit'` — never `'auto'`.
10. GymPage no longer renders the inline `Mode: ... · Data: ...` chrome panel.
11. `useTimeOfDay` no longer writes `body.dataset.mode` (verified by test or grep).

## Icon SVG sources (inline for implementer)

For visual consistency with the brainstorm-locked layout B, use these exact paths.

### Gear (cog button)

```svg
<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>
```

### Wand (Auto)

```svg
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/>
  <path d="m14 7 3 3"/>
  <path d="M5 6v4"/>
  <path d="M19 14v4"/>
  <path d="M10 2v2"/>
  <path d="M7 8H3"/>
  <path d="M21 16h-4"/>
  <path d="M11 3H9"/>
</svg>
```

### Sun (Daytime)

```svg
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
```

### Sunset (Dusk) — symmetric upper rays, no down-arrow

```svg
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M12 10V8"/>
  <path d="m4.93 10.93 1.41 1.41"/>
  <path d="M2 18h2"/>
  <path d="M20 18h2"/>
  <path d="m19.07 10.93-1.41 1.41"/>
  <path d="M22 22H2"/>
  <circle cx="12" cy="18" r="4"/>
</svg>
```

### Crescent moon (Moonlit)

```svg
<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
</svg>
```
