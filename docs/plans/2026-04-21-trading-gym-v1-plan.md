# Trading Gym V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `gym.lyforic.com` V1 — a cozy pixel-art trading gym dashboard with three agent cards, a Battle Arena bottom sheet, time-of-day world layer, and Gale's weather-reactive window.

**Architecture:** React + Vite + TypeScript. Three stacked layers: fixed dusk world (behind), cream content cards (middle), conditional accent overlay (on top when any agent has an open position). World layer swaps CSS variables via `IntersectionObserver` for three agent "rooms."

**Tech Stack:** Vite 6 · React 18 · TypeScript 5 · Tailwind v4 · shadcn/ui · Framer Motion · Vitest · React Testing Library. No Redux — `useState` + `useContext` only. Supabase read-only via a single fetch hook; data contract owned by Justin.

**Source spec:** `~/Documents/Obsidian Vault/500-Projects/lyforic/trading-gym/2026-04-21-design.md` (locked 2026-04-21).

**Not in V1:** explorable room, full leaderboard page, predictions/streaks/rewards, push notifications, sound effects, replay scrubber (V1.1).

---

## Branching and commit strategy

- `main` stays deployable. No direct commits.
- One feature branch per phase: `feature/phase-0-scaffold`, `feature/phase-1-world-layer`, etc.
- Each task commits on its branch. Phase branches open a PR to `main` when all tasks in the phase pass.
- **Never push `--force` to `main`.** Never skip hooks. Never amend past commits on a pushed branch.

---

## File structure (decomposition locked here)

```
trading_agent_dash/
├── docs/
│   └── plans/
│       └── 2026-04-21-trading-gym-v1-plan.md       # this file
├── public/
│   ├── sprites/                                     # PixelLab PNGs when ready
│   │   ├── apex-idle-a.png
│   │   ├── apex-idle-b.png
│   │   ├── gale-idle-a.png
│   │   ├── gale-idle-b.png
│   │   ├── metheus-idle-a.png
│   │   └── metheus-idle-b.png
│   └── window-art/
│       ├── daytime.png
│       ├── dusk.png
│       └── moonlit.png
├── src/
│   ├── main.tsx                                     # Vite entry
│   ├── App.tsx                                      # Top-level layout + RoomSections
│   ├── styles/
│   │   ├── globals.css                              # Tailwind + @theme tokens
│   │   └── tokens.css                               # World/content palette vars
│   ├── components/
│   │   ├── world/
│   │   │   ├── WorldLayer.tsx                       # Fixed bg, swaps by --mode
│   │   │   ├── WindowPane.tsx                       # Window art + weather particles
│   │   │   └── LampGlow.tsx                         # Accent glow when agent live
│   │   ├── content/
│   │   │   ├── AgentCard.tsx                        # Wrapper, collapsed↔expanded
│   │   │   ├── AgentCardCollapsedRow.tsx            # ~96px summary
│   │   │   ├── AgentCardExpandedBody.tsx            # Moves, cities, receipt, CTA
│   │   │   ├── AgentAvatar.tsx                      # Sprite OR silhouette fallback
│   │   │   ├── InBattlePill.tsx                     # Delayed-live status chip + tooltip
│   │   │   ├── MovePill.tsx                         # Locked/unlocked move chip
│   │   │   ├── TrustStrip.tsx                       # Sticky 48px header
│   │   │   └── RoomSection.tsx                      # Scroll target wrapper
│   │   ├── battle/
│   │   │   ├── BottomSheet.tsx                      # Reusable drag-to-dismiss sheet
│   │   │   ├── BattleArena.tsx                      # Sheet contents
│   │   │   └── TugOfWarBar.tsx                      # Center-anchored momentum bar
│   │   ├── loadscreen/
│   │   │   └── LoadScreen.tsx                       # 1.2s door ritual, first-visit only
│   │   └── ui/                                      # shadcn/ui primitives (generated)
│   ├── hooks/
│   │   ├── useTimeOfDay.ts                          # 'daytime' | 'dusk' | 'moonlit'
│   │   ├── useRoomScroll.ts                         # IntersectionObserver on RoomSection
│   │   ├── useWeather.ts                            # Fetch + cache + fallback
│   │   ├── useLocalStorage.ts                       # Typed localStorage hook
│   │   └── useFirstVisitToday.ts                    # Load screen gate
│   ├── lib/
│   │   ├── types.ts                                 # Agent, Trade, Snapshot types
│   │   ├── mockData.ts                              # Dev fixtures matching API shape
│   │   ├── timeOfDay.ts                             # Pure fn: hour → mode
│   │   ├── weather.ts                               # Pure fn: WxCode → CSS tokens
│   │   └── formatting.ts                            # P&L, WR, timestamp formatters
│   └── test/
│       └── setup.ts                                 # Vitest globals, RTL setup
├── tests/
│   ├── lib/
│   │   ├── timeOfDay.test.ts
│   │   ├── weather.test.ts
│   │   └── formatting.test.ts
│   ├── hooks/
│   │   ├── useTimeOfDay.test.ts
│   │   └── useWeather.test.ts
│   └── components/
│       ├── AgentCard.test.tsx
│       ├── TugOfWarBar.test.tsx
│       └── InBattlePill.test.tsx
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── .env.example
├── .gitignore                                        # already exists
├── LICENSE                                           # already exists
└── README.md                                         # already exists
```

**Why this decomposition:** each subfolder in `components/` maps to a layer from the spec (world / content / battle / loadscreen). Pure logic lives in `lib/`; stateful logic in `hooks/`. Tests mirror source paths so a TDD flow stays tight.

---

# Phase 0 — Scaffold (`feature/phase-0-scaffold`)

Goal: project runs locally, renders "Hello Trading Gym" in Fraunces + Inter, has Tailwind tokens wired, tests pass with one sample.

### Task 1: Initialize Vite + React + TypeScript

**Files:**
- Create: all Vite-generated files at repo root

- [ ] **Step 1: Create the feature branch**

```bash
cd ~/Developer/trading_agent_dash
git checkout -b feature/phase-0-scaffold
```

- [ ] **Step 2: Scaffold Vite in the current directory**

Run:
```bash
npm create vite@latest . -- --template react-ts
```

When prompted "Current directory is not empty," choose **"Ignore files and continue"** (README/.gitignore/LICENSE stay).

- [ ] **Step 3: Install dependencies**

```bash
npm install
```

- [ ] **Step 4: Run dev server to verify**

```bash
npm run dev
```

Expected: Vite serves on `localhost:5173`. Open in browser, see the Vite+React splash.

- [ ] **Step 5: Kill dev server and commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + React + TypeScript"
```

### Task 2: Install Tailwind v4 + shadcn/ui + Framer Motion + testing deps

**Files:**
- Create: `tailwind.config.ts`
- Create: `src/styles/globals.css`
- Modify: `src/main.tsx` (import globals)
- Modify: `vite.config.ts` (path alias)
- Modify: `tsconfig.json` (path alias)
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Install runtime deps**

```bash
npm install tailwindcss@next @tailwindcss/vite@next framer-motion
npm install class-variance-authority clsx tailwind-merge lucide-react
```

- [ ] **Step 2: Install dev deps**

```bash
npm install -D vitest @vitest/ui jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  @types/node
```

- [ ] **Step 3: Configure Vite (replace `vite.config.ts`)**

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
} as any);
```

- [ ] **Step 4: Update `tsconfig.json` with path alias and stricter options**

In the `compilerOptions` block, add:
```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] },
"types": ["vitest/globals", "@testing-library/jest-dom"]
```

- [ ] **Step 5: Create `src/test/setup.ts`**

```ts
// src/test/setup.ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Create `src/styles/globals.css` with Tailwind v4 + tokens**

```css
@import "tailwindcss";

@theme {
  --font-display: "Fraunces", Georgia, serif;
  --font-body: "Inter", system-ui, sans-serif;

  /* Content layer: paper (always on, regardless of world mode) */
  --color-paper: hsl(34 30% 88%);
  --color-paper-raised: hsl(36 33% 92%);
  --color-ink: hsl(25 25% 18%);
  --color-ink-muted: hsl(25 12% 48%);
  --color-border-default: hsl(30 20% 80%);
  --color-loss: hsl(0 50% 42%);
  --color-gain: hsl(140 35% 35%);

  /* Agent accents */
  --color-apex: hsl(195 70% 55%);
  --color-gale: hsl(170 60% 45%);
  --color-metheus: hsl(35 75% 55%);
}

/* World layer tokens — overridden per time-of-day mode on <body> */
:root {
  --world-bg: hsl(38 45% 96%);        /* daytime default */
  --world-surface: hsl(36 33% 92%);
  --world-ink: hsl(25 25% 18%);
}

body[data-mode="dusk"] {
  --world-bg: hsl(220 35% 14%);
  --world-surface: hsl(30 25% 18%);
  --world-ink: hsl(40 50% 92%);
}

body[data-mode="moonlit"] {
  --world-bg: hsl(222 45% 9%);
  --world-surface: hsl(22 30% 13%);
  --world-ink: hsl(42 40% 88%);
}

/* Reduced-motion respect */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 7: Wire `globals.css` into `main.tsx`**

Replace the contents of `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/globals.css';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

Delete `src/index.css` if it exists.

- [ ] **Step 8: Add fonts to `index.html`**

In `<head>`, before closing tag:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,400;0,500;0,700;1,400&family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
```

- [ ] **Step 9: Replace `src/App.tsx` with a sanity placeholder**

```tsx
export default function App() {
  return (
    <main className="min-h-screen bg-[var(--world-bg)] text-[var(--world-ink)] p-6">
      <h1 className="font-[var(--font-display)] text-4xl">The Trading Gym</h1>
      <p className="font-[var(--font-body)] text-ink-muted mt-2">
        Three agents. Live markets. Documented in public.
      </p>
    </main>
  );
}
```

- [ ] **Step 10: Run dev server, verify fonts and colors load**

```bash
npm run dev
```

Open `localhost:5173`. Expected: Fraunces serif headline, Inter body text, cream background. Close dev server.

- [ ] **Step 11: Add npm scripts for test + lint to `package.json`**

In `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: install Tailwind v4 + shadcn + Framer Motion + Vitest, wire tokens"
```

### Task 3: Write the first sanity test

**Files:**
- Create: `tests/lib/formatting.test.ts`
- Create: `src/lib/formatting.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/formatting.test.ts
import { describe, it, expect } from 'vitest';
import { formatPnl, formatWinRate } from '@/lib/formatting';

describe('formatPnl', () => {
  it('formats positive P&L with + sign and 2 decimals', () => {
    expect(formatPnl(18.42)).toBe('+$18.42');
  });

  it('formats negative P&L with minus sign', () => {
    expect(formatPnl(-22.89)).toBe('-$22.89');
  });

  it('formats zero as +$0.00', () => {
    expect(formatPnl(0)).toBe('+$0.00');
  });
});

describe('formatWinRate', () => {
  it('formats a ratio as percentage with 1 decimal', () => {
    expect(formatWinRate(341, 650)).toBe('52.5%');
  });

  it('returns — for zero settled', () => {
    expect(formatWinRate(0, 0)).toBe('—');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test
```

Expected: fails because `@/lib/formatting` doesn't exist.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/formatting.ts
export function formatPnl(value: number): string {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

export function formatWinRate(wins: number, settled: number): string {
  if (settled === 0) return '—';
  return `${((wins / settled) * 100).toFixed(1)}%`;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add formatting utils with P&L and win-rate helpers"
```

### Task 4: Define core types and mock data

**Files:**
- Create: `src/lib/types.ts`
- Create: `src/lib/mockData.ts`

- [ ] **Step 1: Create `src/lib/types.ts`**

```ts
// src/lib/types.ts
export type AgentId = 'apex' | 'gale' | 'metheus';

export interface Move {
  name: string;
  locked: boolean;
}

export interface Record {
  W: number;
  L: number;
  BE: number;
  settled: number;
}

export interface BrierScore {
  value: number;
  n: number;
}

export interface OpenPosition {
  contract_ticker: string;
  entry_price_cents: number;
  side: 'yes' | 'no';
  size: number;
  entered_at_delayed: string;    // ISO timestamp, >= 30 min ago
  settles_at: string;             // ISO timestamp
}

export interface Agent {
  id: AgentId;
  name: string;
  nickname: string;
  market_label: string;
  total_pnl: number;
  record: Record;
  brier_7d: BrierScore;
  cities_or_tags: string[];
  moves: Move[];
  open_position: OpenPosition | null;
  latest_receipt_id: string | null;
  state: 'live' | 'pending' | 'arriving_soon';
}

export interface LeaderboardResponse {
  updated_at: string;
  agents: Agent[];
}

export interface Snapshot {
  ts: string;
  midprice_cents: number;
  probability_yes: number;
  pnl_unrealized: number;
}
```

- [ ] **Step 2: Create `src/lib/mockData.ts` with three realistic agents**

```ts
// src/lib/mockData.ts
import type { LeaderboardResponse } from './types';

export const mockLeaderboard: LeaderboardResponse = {
  updated_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  agents: [
    {
      id: 'apex',
      name: 'Apex',
      nickname: 'Tempo Reader',
      market_label: 'Kalshi crypto (KXBTC)',
      total_pnl: 18.42,
      record: { W: 341, L: 298, BE: 11, settled: 650 },
      brier_7d: { value: 0.212, n: 142 },
      cities_or_tags: ['BTC', 'ETH'],
      moves: [
        { name: 'VR Gate', locked: false },
        { name: 'Momentum Direction', locked: false },
        { name: '???', locked: true },
        { name: '???', locked: true },
      ],
      open_position: {
        contract_ticker: 'KXBTC-26APR21-B67500',
        entry_price_cents: 42,
        side: 'yes',
        size: 12,
        entered_at_delayed: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
        settles_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
      },
      latest_receipt_id: 'APX-20260421-014',
      state: 'live',
    },
    {
      id: 'gale',
      name: 'Gale',
      nickname: 'Weather Whisperer',
      market_label: 'Kalshi weather (KXHIGH)',
      total_pnl: -22.89,
      record: { W: 22, L: 57, BE: 1, settled: 80 },
      brier_7d: { value: 0.088, n: 17 },
      cities_or_tags: ['MIA', 'LAX', 'NYC', 'CHI', 'DEN'],
      moves: [
        { name: 'Normal CDF', locked: false },
        { name: 'Seasonal Bias', locked: false },
        { name: '???', locked: true },
        { name: '???', locked: true },
      ],
      open_position: null,
      latest_receipt_id: 'GAL-20260421-014',
      state: 'live',
    },
    {
      id: 'metheus',
      name: 'Metheus',
      nickname: 'Long Arc',
      market_label: 'TBD',
      total_pnl: 0,
      record: { W: 0, L: 0, BE: 0, settled: 0 },
      brier_7d: { value: 0, n: 0 },
      cities_or_tags: [],
      moves: [],
      open_position: null,
      latest_receipt_id: null,
      state: 'arriving_soon',
    },
  ],
};
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add core types and mock leaderboard fixture"
```

### Task 5: Open PR for Phase 0

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feature/phase-0-scaffold
```

- [ ] **Step 2: Open PR via gh CLI**

```bash
gh pr create --title "Phase 0: Vite scaffold + tokens + types" --body "$(cat <<'EOF'
## Summary
- Vite + React + TypeScript scaffold
- Tailwind v4 with paper/world token system per spec §3
- Vitest + RTL setup with one passing test suite
- Core types (`Agent`, `OpenPosition`, `Snapshot`) and mock leaderboard fixture

## Test plan
- [ ] `npm test` passes 5 tests
- [ ] `npm run dev` serves at localhost:5173 with Fraunces + Inter fonts
- [ ] `npm run build` succeeds with no TypeScript errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Merge to main (self-review before merge; solo phase)**

```bash
gh pr merge --squash --delete-branch
git checkout main && git pull
```

---

# Phase 1 — World Layer (`feature/phase-1-world-layer`)

Goal: fixed dusk/daytime/moonlit background renders behind content, driven by local time. Mode persists across section scrolls but doesn't change on scroll yet.

### Task 6: Pure time-of-day function

**Files:**
- Create: `tests/lib/timeOfDay.test.ts`
- Create: `src/lib/timeOfDay.ts`

- [ ] **Step 1: Branch**

```bash
git checkout -b feature/phase-1-world-layer
```

- [ ] **Step 2: Write failing test**

```ts
// tests/lib/timeOfDay.test.ts
import { describe, it, expect } from 'vitest';
import { hourToMode } from '@/lib/timeOfDay';

describe('hourToMode', () => {
  it('returns daytime for 6am through 4:59pm', () => {
    expect(hourToMode(6)).toBe('daytime');
    expect(hourToMode(12)).toBe('daytime');
    expect(hourToMode(16)).toBe('daytime');
  });

  it('returns dusk for 5pm through 9:59pm', () => {
    expect(hourToMode(17)).toBe('dusk');
    expect(hourToMode(19)).toBe('dusk');
    expect(hourToMode(21)).toBe('dusk');
  });

  it('returns moonlit for 10pm through 5:59am', () => {
    expect(hourToMode(22)).toBe('moonlit');
    expect(hourToMode(0)).toBe('moonlit');
    expect(hourToMode(3)).toBe('moonlit');
    expect(hourToMode(5)).toBe('moonlit');
  });
});
```

- [ ] **Step 3: Run, verify fail**

```bash
npm test
```

Expected: import error.

- [ ] **Step 4: Implement**

```ts
// src/lib/timeOfDay.ts
export type WorldMode = 'daytime' | 'dusk' | 'moonlit';

export function hourToMode(hour: number): WorldMode {
  if (hour >= 6 && hour < 17) return 'daytime';
  if (hour >= 17 && hour < 22) return 'dusk';
  return 'moonlit';
}
```

- [ ] **Step 5: Pass**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(lib): pure hour-to-mode function with tests"
```

### Task 7: `useTimeOfDay` hook with 60-min cache

**Files:**
- Create: `src/hooks/useLocalStorage.ts`
- Create: `src/hooks/useTimeOfDay.ts`
- Create: `tests/hooks/useTimeOfDay.test.ts`

- [ ] **Step 1: Write `useLocalStorage.ts` (typed wrapper)**

```ts
// src/hooks/useLocalStorage.ts
import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore quota errors */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
```

- [ ] **Step 2: Write failing test for `useTimeOfDay`**

```tsx
// tests/hooks/useTimeOfDay.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';

describe('useTimeOfDay', () => {
  beforeEach(() => {
    localStorage.clear();
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
});
```

- [ ] **Step 3: Run, verify fail**

- [ ] **Step 4: Implement `useTimeOfDay.ts`**

```ts
// src/hooks/useTimeOfDay.ts
import { useState, useEffect } from 'react';
import { hourToMode, type WorldMode } from '@/lib/timeOfDay';

const CACHE_KEY = 'gym_world_mode';
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 min

interface CacheEntry {
  mode: WorldMode;
  computedAt: number;
}

export function useTimeOfDay(): WorldMode {
  const [mode, setMode] = useState<WorldMode>(() => compute());

  useEffect(() => {
    // Apply to <body> so CSS variable inheritance works.
    document.body.dataset.mode = mode;
  }, [mode]);

  useEffect(() => {
    // Re-check every minute; cheap, covers minute-of-hour crossings.
    const id = setInterval(() => {
      const next = compute();
      setMode((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  return mode;
}

function compute(): WorldMode {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CacheEntry;
      if (Date.now() - parsed.computedAt < CACHE_TTL_MS) {
        return parsed.mode;
      }
    }
  } catch {
    /* ignore */
  }
  const mode = hourToMode(new Date().getHours());
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ mode, computedAt: Date.now() } satisfies CacheEntry),
    );
  } catch {
    /* ignore */
  }
  return mode;
}
```

- [ ] **Step 5: Run, verify pass**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(hooks): useTimeOfDay with 60-min localStorage cache + body[data-mode] side effect"
```

### Task 8: `WorldLayer` component

**Files:**
- Create: `src/components/world/WorldLayer.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `WorldLayer.tsx`**

```tsx
// src/components/world/WorldLayer.tsx
/**
 * Fixed background behind all content. Reads --world-bg CSS var which is set
 * by body[data-mode] via the useTimeOfDay hook. Will receive window art and
 * lamp glow in later tasks.
 */
export function WorldLayer() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none"
      style={{ backgroundColor: 'var(--world-bg)' }}
    />
  );
}
```

- [ ] **Step 2: Wire into `App.tsx`**

```tsx
// src/App.tsx
import { WorldLayer } from '@/components/world/WorldLayer';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';

export default function App() {
  useTimeOfDay(); // side effect: sets body[data-mode]

  return (
    <>
      <WorldLayer />
      <main className="min-h-screen p-6 text-[color:var(--world-ink)]">
        <h1 className="text-4xl" style={{ fontFamily: 'var(--font-display)' }}>
          The Trading Gym
        </h1>
        <p className="mt-2" style={{ fontFamily: 'var(--font-body)' }}>
          Three agents. Live markets. Documented in public.
        </p>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Manual verify**

```bash
npm run dev
```

Set system clock to afternoon → cream bg. 7pm → dusk blue. 1am → deep navy. If the system clock can't be changed, temporarily hardcode `hourToMode` to `'dusk'` to verify.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(world): WorldLayer component reading --world-bg"
```

### Task 9: PR Phase 1

- [ ] **Steps 1-3: Push, PR, merge (same pattern as Task 5).** Title: `Phase 1: World layer with time-of-day modes`.

---

# Phase 2 — Content cards (`feature/phase-2-content`)

Goal: three collapsed agent cards rendering real mock data. Tap-to-expand works. TrustStrip sticky. No weather, no scroll rooms, no battle arena yet.

### Task 10: `AgentAvatar` component (silhouette fallback)

**Files:**
- Create: `src/components/content/AgentAvatar.tsx`
- Create: `tests/components/AgentAvatar.test.tsx`

- [ ] **Step 1: Branch**

```bash
git checkout -b feature/phase-2-content
```

- [ ] **Step 2: Write failing test**

```tsx
// tests/components/AgentAvatar.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentAvatar } from '@/components/content/AgentAvatar';

describe('AgentAvatar', () => {
  it('renders an img when spriteUrl provided', () => {
    render(<AgentAvatar id="apex" spriteUrl="/sprites/apex.png" name="Apex" />);
    expect(screen.getByRole('img', { name: 'Apex' })).toBeInTheDocument();
  });

  it('renders a silhouette with the first letter when no sprite', () => {
    render(<AgentAvatar id="gale" name="Gale" />);
    expect(screen.getByText('G')).toBeInTheDocument();
    // No <img>
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('applies accent color class by agent id', () => {
    const { container } = render(<AgentAvatar id="metheus" name="Metheus" />);
    const div = container.firstChild as HTMLElement;
    expect(div.className).toMatch(/metheus/);
  });
});
```

- [ ] **Step 3: Run, verify fail**

- [ ] **Step 4: Implement**

```tsx
// src/components/content/AgentAvatar.tsx
import type { AgentId } from '@/lib/types';

interface Props {
  id: AgentId;
  name: string;
  spriteUrl?: string;
  size?: number;
}

const ACCENT_CLASS: Record<AgentId, string> = {
  apex: 'bg-[color:var(--color-apex)]',
  gale: 'bg-[color:var(--color-gale)]',
  metheus: 'bg-[color:var(--color-metheus)]',
};

export function AgentAvatar({ id, name, spriteUrl, size = 48 }: Props) {
  const style = { width: size, height: size };
  if (spriteUrl) {
    return (
      <img
        src={spriteUrl}
        alt={name}
        style={{ ...style, imageRendering: 'pixelated' }}
        className="rounded-md"
      />
    );
  }
  return (
    <div
      style={style}
      className={`${ACCENT_CLASS[id]} ${id} rounded-md flex items-center justify-center text-white font-bold`}
      aria-label={name}
    >
      {name[0].toUpperCase()}
    </div>
  );
}
```

- [ ] **Step 5: Pass**

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(content): AgentAvatar with silhouette fallback"
```

### Task 11: `InBattlePill` with delay tooltip

**Files:**
- Create: `src/components/content/InBattlePill.tsx`
- Create: `tests/components/InBattlePill.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// tests/components/InBattlePill.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InBattlePill } from '@/components/content/InBattlePill';

describe('InBattlePill', () => {
  it('shows "In Battle" label with settles-at time', () => {
    const settlesAt = new Date('2026-04-22T20:00:00Z').toISOString();
    render(<InBattlePill settlesAt={settlesAt} />);
    expect(screen.getByText(/In Battle/)).toBeInTheDocument();
  });

  it('reveals the 30-min delay tooltip on hover', async () => {
    const user = userEvent.setup();
    const settlesAt = new Date('2026-04-22T20:00:00Z').toISOString();
    render(<InBattlePill settlesAt={settlesAt} />);
    const pill = screen.getByRole('button', { name: /In Battle/ });
    await user.hover(pill);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/30-minute delay/);
  });
});
```

- [ ] **Step 2: Run, verify fail**

- [ ] **Step 3: Implement**

```tsx
// src/components/content/InBattlePill.tsx
import { useState } from 'react';

interface Props {
  settlesAt: string;
  onTap?: () => void;
}

const DELAY_COPY =
  'Entries and settlements shown after 30-minute delay. Mid-price updates live from Kalshi (public market data, no delay).';

export function InBattlePill({ settlesAt, onTap }: Props) {
  const [hovered, setHovered] = useState(false);
  const settlesTime = new Date(settlesAt).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        onClick={onTap}
        className="px-3 py-1 rounded-full text-xs font-medium bg-amber-400/20 text-amber-600 border border-amber-400/40 hover:bg-amber-400/30 focus:outline-2 focus:outline-amber-500"
      >
        ● In Battle · settles {settlesTime}
      </button>
      {hovered && (
        <div
          role="tooltip"
          className="absolute top-full left-0 mt-1 w-64 p-2 bg-[color:var(--color-ink)] text-[color:var(--color-paper)] text-xs rounded shadow-lg z-20"
        >
          {DELAY_COPY}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Pass**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(content): InBattlePill with 30-min delay tooltip"
```

### Task 12: `MovePill` + `AgentCardExpandedBody`

**Files:**
- Create: `src/components/content/MovePill.tsx`
- Create: `src/components/content/AgentCardExpandedBody.tsx`

- [ ] **Step 1: Implement `MovePill.tsx`**

```tsx
// src/components/content/MovePill.tsx
import type { Move } from '@/lib/types';

export function MovePill({ move }: { move: Move }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-md text-xs border ${
        move.locked
          ? 'bg-transparent text-[color:var(--color-ink-muted)] border-[color:var(--color-border-default)]'
          : 'bg-[color:var(--color-paper-raised)] text-[color:var(--color-ink)] border-[color:var(--color-border-default)]'
      }`}
    >
      {move.locked ? '???' : move.name}
    </span>
  );
}
```

- [ ] **Step 2: Implement `AgentCardExpandedBody.tsx`**

```tsx
// src/components/content/AgentCardExpandedBody.tsx
import type { Agent } from '@/lib/types';
import { MovePill } from './MovePill';

export function AgentCardExpandedBody({ agent }: { agent: Agent }) {
  return (
    <div className="mt-3 pt-3 border-t border-[color:var(--color-border-default)] space-y-3 text-sm">
      <div>
        <div className="text-xs uppercase text-[color:var(--color-ink-muted)]">Market</div>
        <div>{agent.market_label}</div>
      </div>

      <div>
        <div className="text-xs uppercase text-[color:var(--color-ink-muted)]">Record</div>
        <div className="tabular-nums">
          {agent.record.W}W / {agent.record.L}L / {agent.record.BE}BE · {agent.record.settled}{' '}
          settled
        </div>
      </div>

      {agent.brier_7d.n > 0 && (
        <div>
          <div className="text-xs uppercase text-[color:var(--color-ink-muted)]">Brier · 7d</div>
          <div className="tabular-nums">
            {agent.brier_7d.value.toFixed(3)}
            {agent.brier_7d.n < 20 && (
              <span className="ml-2 px-2 py-0.5 text-xs rounded bg-[color:var(--color-border-default)]/40 text-[color:var(--color-ink-muted)]">
                Low sample · n={agent.brier_7d.n}
              </span>
            )}
          </div>
        </div>
      )}

      {agent.cities_or_tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.cities_or_tags.map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded-md bg-[color:var(--color-paper-raised)] text-xs"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {agent.moves.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.moves.map((m, i) => (
            <MovePill key={i} move={m} />
          ))}
        </div>
      )}

      {agent.latest_receipt_id && (
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            className="px-4 py-2 rounded-md bg-[color:var(--color-paper-raised)] text-sm font-medium border border-[color:var(--color-border-default)]"
          >
            View trade log →
          </button>
          <a
            href={`/trade/${agent.latest_receipt_id}`}
            className="text-xs font-mono text-[color:var(--color-ink-muted)] hover:text-[color:var(--color-ink)]"
          >
            Latest receipt: {agent.latest_receipt_id} →
          </a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(content): MovePill + AgentCardExpandedBody"
```

### Task 13: `AgentCardCollapsedRow` + `AgentCard` orchestrator

**Files:**
- Create: `src/components/content/AgentCardCollapsedRow.tsx`
- Create: `src/components/content/AgentCard.tsx`
- Create: `tests/components/AgentCard.test.tsx`

- [ ] **Step 1: Implement `AgentCardCollapsedRow.tsx`**

```tsx
// src/components/content/AgentCardCollapsedRow.tsx
import type { Agent } from '@/lib/types';
import { AgentAvatar } from './AgentAvatar';
import { InBattlePill } from './InBattlePill';
import { formatPnl, formatWinRate } from '@/lib/formatting';

export function AgentCardCollapsedRow({ agent }: { agent: Agent }) {
  const isGain = agent.total_pnl >= 0;
  return (
    <div className="flex items-center gap-3 p-3">
      <AgentAvatar id={agent.id} name={agent.name} size={48} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-base font-medium">{agent.name}</span>
          {agent.open_position && <InBattlePill settlesAt={agent.open_position.settles_at} />}
          {agent.state === 'arriving_soon' && (
            <span className="text-xs px-2 py-0.5 rounded bg-[color:var(--color-border-default)]/40 text-[color:var(--color-ink-muted)]">
              Arriving soon
            </span>
          )}
        </div>
        <div className="text-xs text-[color:var(--color-ink-muted)] truncate">
          {agent.nickname}
        </div>
      </div>
      {agent.state !== 'arriving_soon' && (
        <div className="text-right">
          <div
            className="text-lg font-medium tabular-nums"
            style={{ color: isGain ? 'var(--color-gain)' : 'var(--color-loss)' }}
          >
            {formatPnl(agent.total_pnl)}
          </div>
          <div className="text-xs text-[color:var(--color-ink-muted)] tabular-nums">
            {formatWinRate(agent.record.W, agent.record.settled)} WR
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Implement `AgentCard.tsx`**

```tsx
// src/components/content/AgentCard.tsx
import { useState } from 'react';
import type { Agent } from '@/lib/types';
import { AgentCardCollapsedRow } from './AgentCardCollapsedRow';
import { AgentCardExpandedBody } from './AgentCardExpandedBody';

export function AgentCard({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    if (agent.state !== 'arriving_soon') setExpanded((v) => !v);
  };

  return (
    <article
      aria-expanded={expanded}
      className="rounded-2xl bg-[color:var(--color-paper)] border border-[color:var(--color-border-default)] shadow-[0_4px_12px_rgba(62,53,41,0.10)]"
    >
      <button
        type="button"
        onClick={toggle}
        className="w-full text-left cursor-pointer focus:outline-2 focus:outline-[color:var(--color-apex)]"
        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${agent.name}'s card`}
      >
        <AgentCardCollapsedRow agent={agent} />
      </button>
      {expanded && (
        <div className="px-3 pb-3">
          <AgentCardExpandedBody agent={agent} />
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 3: Write test**

```tsx
// tests/components/AgentCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentCard } from '@/components/content/AgentCard';
import { mockLeaderboard } from '@/lib/mockData';

describe('AgentCard', () => {
  const gale = mockLeaderboard.agents.find((a) => a.id === 'gale')!;
  const metheus = mockLeaderboard.agents.find((a) => a.id === 'metheus')!;

  it('renders P&L in loss color when negative', () => {
    render(<AgentCard agent={gale} />);
    expect(screen.getByText('-$22.89')).toBeInTheDocument();
  });

  it('expands on tap to reveal moves and receipt link', async () => {
    const user = userEvent.setup();
    render(<AgentCard agent={gale} />);
    expect(screen.queryByText('Normal CDF')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Expand Gale/ }));
    expect(await screen.findByText('Normal CDF')).toBeInTheDocument();
    expect(screen.getByText(/GAL-20260421-014/)).toBeInTheDocument();
  });

  it('does not expand arriving-soon agents', async () => {
    const user = userEvent.setup();
    render(<AgentCard agent={metheus} />);
    const btn = screen.queryByRole('button', { name: /Expand Metheus/ });
    if (btn) await user.click(btn);
    // Arriving soon agents have no moves
    expect(screen.queryByText('Normal CDF')).not.toBeInTheDocument();
  });

  it('shows "Low sample" when brier n < 20', async () => {
    const user = userEvent.setup();
    render(<AgentCard agent={gale} />);
    await user.click(screen.getByRole('button', { name: /Expand Gale/ }));
    expect(await screen.findByText(/Low sample · n=17/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run and iterate until green**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(content): AgentCard with collapsed+expanded states and tests"
```

### Task 14: `TrustStrip` sticky component

**Files:**
- Create: `src/components/content/TrustStrip.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/content/TrustStrip.tsx
import type { LeaderboardResponse } from '@/lib/types';
import { formatPnl } from '@/lib/formatting';

export function TrustStrip({ data }: { data: LeaderboardResponse }) {
  const totalPnl = data.agents.reduce((sum, a) => sum + a.total_pnl, 0);
  const settledToday = data.agents.reduce((sum, a) => sum + a.record.settled, 0); // placeholder — V1.1 filters by day
  const updatedMinutes = Math.round(
    (Date.now() - new Date(data.updated_at).getTime()) / 60_000,
  );

  return (
    <header className="sticky top-0 z-10 h-12 px-4 flex items-center justify-between text-xs backdrop-blur bg-[color:var(--color-paper)]/70 border-b border-[color:var(--color-border-default)]">
      <span className="text-[color:var(--color-ink-muted)]">
        Updated {updatedMinutes}m ago
      </span>
      <span className="tabular-nums font-medium">
        Total P&L:{' '}
        <span style={{ color: totalPnl >= 0 ? 'var(--color-gain)' : 'var(--color-loss)' }}>
          {formatPnl(totalPnl)}
        </span>
      </span>
      <span className="text-[color:var(--color-ink-muted)] tabular-nums">
        {settledToday} settled
      </span>
    </header>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(content): TrustStrip sticky aggregate header"
```

### Task 15: Wire it all in `App.tsx`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Replace `App.tsx`**

```tsx
// src/App.tsx
import { WorldLayer } from '@/components/world/WorldLayer';
import { AgentCard } from '@/components/content/AgentCard';
import { TrustStrip } from '@/components/content/TrustStrip';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';
import { mockLeaderboard } from '@/lib/mockData';

export default function App() {
  useTimeOfDay();

  return (
    <>
      <WorldLayer />
      <div className="max-w-[420px] mx-auto min-h-screen relative">
        <TrustStrip data={mockLeaderboard} />
        <div className="px-4 py-6 space-y-4">
          <h1 className="text-3xl" style={{ fontFamily: 'var(--font-display)' }}>
            The Trading Gym
          </h1>
          <p className="text-sm text-[color:var(--color-ink-muted)]" style={{ fontFamily: 'var(--font-body)' }}>
            Three agents. Live markets. Documented in public.
          </p>
          {mockLeaderboard.agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
          <footer className="grid grid-cols-3 gap-2 mt-6 text-xs text-center">
            {mockLeaderboard.agents.map((a) => (
              <div
                key={a.id}
                className="p-2 rounded bg-[color:var(--color-paper)]/60 border border-[color:var(--color-border-default)]"
              >
                <div className="tabular-nums font-medium">{a.record.settled}</div>
                <div className="text-[color:var(--color-ink-muted)]">{a.name} bets</div>
              </div>
            ))}
          </footer>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Verify in browser**

```bash
npm run dev
```

Open `localhost:5173` at 375px width (Chrome DevTools → iPhone 12). Three collapsed cards visible. Tap Apex/Gale → expand. Tap Metheus → no expand. TrustStrip sticky during scroll.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: assemble V1 trust dashboard with three collapsed agent cards"
```

### Task 16: PR Phase 2

Same pattern — push, `gh pr create`, merge.

---

# Phase 3 — Room scroll transitions (`feature/phase-3-rooms`)

Goal: scrolling between Apex, Gale, and Metheus sections swaps the world layer wall tint and window art.

### Task 17: `RoomSection` wrapper

**Files:**
- Create: `src/components/content/RoomSection.tsx`
- Create: `src/hooks/useRoomScroll.ts`

- [ ] **Step 1: Branch**

```bash
git checkout -b feature/phase-3-rooms
```

- [ ] **Step 2: Create `useRoomScroll.ts`**

```ts
// src/hooks/useRoomScroll.ts
import { useEffect, useRef } from 'react';
import type { AgentId } from '@/lib/types';

export function useRoomScroll(room: AgentId) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            document.body.dataset.room = room;
          }
        });
      },
      { threshold: [0.6] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [room]);

  return ref;
}
```

- [ ] **Step 3: Create `RoomSection.tsx`**

```tsx
// src/components/content/RoomSection.tsx
import type { ReactNode } from 'react';
import type { AgentId } from '@/lib/types';
import { useRoomScroll } from '@/hooks/useRoomScroll';

export function RoomSection({ room, children }: { room: AgentId; children: ReactNode }) {
  const ref = useRoomScroll(room);
  return (
    <section ref={ref as any} data-room={room} className="min-h-[60vh] flex flex-col justify-center">
      {children}
    </section>
  );
}
```

- [ ] **Step 4: Extend `globals.css` with room-accent overrides**

Add below the `body[data-mode]` blocks:

```css
body[data-room="apex"] {
  --world-accent: hsl(195 70% 55%);
}
body[data-room="gale"] {
  --world-accent: hsl(170 60% 45%);
}
body[data-room="metheus"] {
  --world-accent: hsl(35 75% 55%);
}
```

- [ ] **Step 5: Wrap each agent card in `App.tsx` with `RoomSection`**

Modify the map in `App.tsx`:

```tsx
{mockLeaderboard.agents.map((agent) => (
  <RoomSection key={agent.id} room={agent.id}>
    <AgentCard agent={agent} />
  </RoomSection>
))}
```

Add import at top.

- [ ] **Step 6: Extend `WorldLayer.tsx` to show a subtle accent band**

```tsx
// src/components/world/WorldLayer.tsx
export function WorldLayer() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none transition-colors duration-300"
      style={{
        backgroundColor: 'var(--world-bg)',
      }}
    >
      <div
        className="absolute inset-x-0 bottom-0 h-1/3 transition-opacity duration-300"
        style={{
          background: 'linear-gradient(to top, color-mix(in srgb, var(--world-accent, transparent) 25%, transparent), transparent)',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 7: Verify in browser**

`npm run dev`. Scroll slowly between agents. The bottom-third accent band should shift from sharp blue (Apex) → teal (Gale) → amber (Metheus). Smooth 300ms transitions.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(rooms): RoomSection + IntersectionObserver accent swap"
```

### Task 18: PR Phase 3

Standard pattern.

---

# Phase 4 — Window + weather (`feature/phase-4-weather`)

Goal: Gale's section has a window showing real current weather in her most recent active position city, with the 3-tier fallback chain.

### Task 19: Pure weather formatting

**Files:**
- Create: `tests/lib/weather.test.ts`
- Create: `src/lib/weather.ts`

- [ ] **Step 1: Branch**

```bash
git checkout -b feature/phase-4-weather
```

- [ ] **Step 2: Test**

```ts
// tests/lib/weather.test.ts
import { describe, it, expect } from 'vitest';
import { classifyWeather } from '@/lib/weather';

describe('classifyWeather', () => {
  it('returns rain for codes 200-531', () => {
    expect(classifyWeather(300)).toBe('rain');
    expect(classifyWeather(500)).toBe('rain');
  });
  it('returns snow for 600-622', () => {
    expect(classifyWeather(601)).toBe('snow');
  });
  it('returns clear for 800', () => {
    expect(classifyWeather(800)).toBe('clear');
  });
  it('returns clouds for 801-899', () => {
    expect(classifyWeather(802)).toBe('clouds');
  });
  it('returns clear as safe fallback for unknown', () => {
    expect(classifyWeather(9999)).toBe('clear');
  });
});
```

- [ ] **Step 3: Implement**

```ts
// src/lib/weather.ts
export type WeatherKind = 'clear' | 'clouds' | 'rain' | 'snow';

export function classifyWeather(openWeatherCode: number): WeatherKind {
  if (openWeatherCode >= 200 && openWeatherCode < 600) return 'rain';
  if (openWeatherCode >= 600 && openWeatherCode < 700) return 'snow';
  if (openWeatherCode === 800) return 'clear';
  if (openWeatherCode >= 801 && openWeatherCode < 900) return 'clouds';
  return 'clear'; // fallback
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(lib): weather code classifier with tests"
```

### Task 20: `useWeather` hook with fallback chain

**Files:**
- Create: `src/hooks/useWeather.ts`
- Create: `tests/hooks/useWeather.test.ts`

- [ ] **Step 1: Test (happy + fallback paths)**

```tsx
// tests/hooks/useWeather.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useWeather } from '@/hooks/useWeather';

describe('useWeather', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('returns weather kind when API succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ weather: [{ id: 500 }] }),
        } as Response),
      ),
    );
    const { result } = renderHook(() => useWeather('NYC'));
    await waitFor(() => expect(result.current).toEqual({ kind: 'rain', source: 'live' }));
  });

  it('falls back to cache when API errors', async () => {
    localStorage.setItem(
      'gale_weather_NYC',
      JSON.stringify({ kind: 'snow', cachedAt: Date.now() }),
    );
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))));
    const { result } = renderHook(() => useWeather('NYC'));
    await waitFor(() => expect(result.current).toEqual({ kind: 'snow', source: 'cache' }));
  });

  it('falls back to clear when no cache and API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))));
    const { result } = renderHook(() => useWeather('NYC'));
    await waitFor(() =>
      expect(result.current).toEqual({ kind: 'clear', source: 'fallback' }),
    );
  });
});
```

- [ ] **Step 2: Implement**

```ts
// src/hooks/useWeather.ts
import { useEffect, useState } from 'react';
import { classifyWeather, type WeatherKind } from '@/lib/weather';

interface WeatherState {
  kind: WeatherKind;
  source: 'live' | 'cache' | 'fallback';
}

interface CacheEntry {
  kind: WeatherKind;
  cachedAt: number;
}

const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 2000;

export function useWeather(city: string | null): WeatherState | null {
  const [state, setState] = useState<WeatherState | null>(null);

  useEffect(() => {
    if (!city) {
      setState(null);
      return;
    }

    const cacheKey = `gale_weather_${city}`;
    let cancelled = false;

    async function load() {
      const cached = readCache(cacheKey);
      const apiKey = import.meta.env.VITE_OPENWEATHER_KEY;

      if (!apiKey) {
        // No key: use cache or fallback, no network attempt
        if (cached) return setState({ kind: cached.kind, source: 'cache' });
        return setState({ kind: 'clear', source: 'fallback' });
      }

      try {
        const res = await fetchWithTimeout(
          `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}`,
          REQUEST_TIMEOUT_MS,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { weather: { id: number }[] };
        const kind = classifyWeather(body.weather?.[0]?.id ?? 0);
        writeCache(cacheKey, kind);
        if (!cancelled) setState({ kind, source: 'live' });
      } catch (err) {
        console.warn('useWeather: falling back', err);
        if (cached) {
          if (!cancelled) setState({ kind: cached.kind, source: 'cache' });
        } else {
          if (!cancelled) setState({ kind: 'clear', source: 'fallback' });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [city]);

  return state;
}

function readCache(key: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    return Date.now() - parsed.cachedAt < CACHE_TTL_MS ? parsed : parsed; // stale is fine as fallback
  } catch {
    return null;
  }
}

function writeCache(key: string, kind: WeatherKind) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ kind, cachedAt: Date.now() } satisfies CacheEntry),
    );
  } catch {
    /* ignore */
  }
}

async function fetchWithTimeout(url: string, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}
```

- [ ] **Step 3: Add `.env.example`**

```
VITE_OPENWEATHER_KEY=your_openweather_api_key_here
```

- [ ] **Step 4: Test passes**

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(hooks): useWeather with 3-tier fallback (live → cache → clear)"
```

### Task 21: `WindowPane` with rain particles

**Files:**
- Create: `src/components/world/WindowPane.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/world/WindowPane.tsx
import type { WeatherKind } from '@/lib/weather';

interface Props {
  weather: WeatherKind;
}

const RAINDROPS = Array.from({ length: 35 });

export function WindowPane({ weather }: Props) {
  return (
    <div
      className="absolute top-8 right-4 w-24 h-32 rounded-sm overflow-hidden border-2"
      style={{
        borderColor: 'hsl(30 15% 30%)',
        background:
          'linear-gradient(180deg, hsl(220 35% 25%) 0%, hsl(25 70% 55%) 80%, hsl(25 60% 45%) 100%)',
      }}
      aria-hidden
    >
      {weather === 'rain' &&
        RAINDROPS.map((_, i) => (
          <span
            key={i}
            className="absolute w-[2px] h-3 bg-white/40"
            style={{
              left: `${(i * 83) % 100}%`,
              top: '-12px',
              animation: `raindrop ${0.9 + Math.random() * 0.4}s linear infinite`,
              animationDelay: `${Math.random() * 1.2}s`,
            }}
          />
        ))}
      <style>{`
        @keyframes raindrop {
          0% { transform: translateY(-20px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(140px); opacity: 0; }
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Render `WindowPane` only when Gale's section is in view**

Modify `WorldLayer.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useWeather } from '@/hooks/useWeather';
import { WindowPane } from './WindowPane';

export function WorldLayer() {
  const [activeRoom, setActiveRoom] = useState<string | null>(null);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setActiveRoom(document.body.dataset.room ?? null);
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-room'] });
    setActiveRoom(document.body.dataset.room ?? null);
    return () => observer.disconnect();
  }, []);

  const galeCity = 'New York'; // V1 hardcoded; wire to agent data in Phase 5
  const weather = useWeather(activeRoom === 'gale' ? galeCity : null);

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none transition-colors duration-300"
      style={{ backgroundColor: 'var(--world-bg)' }}
    >
      <div
        className="absolute inset-x-0 bottom-0 h-1/3 transition-opacity duration-300"
        style={{
          background:
            'linear-gradient(to top, color-mix(in srgb, var(--world-accent, transparent) 25%, transparent), transparent)',
        }}
      />
      {activeRoom === 'gale' && weather && <WindowPane weather={weather.kind} />}
    </div>
  );
}
```

- [ ] **Step 3: Manual verify**

Visit `localhost:5173`, scroll to Gale's section. Window appears upper-right with a dusk gradient and (if an OpenWeatherMap key is set in `.env.local` and NYC weather is rainy) raindrops. Without a key, window still appears but empty. No console errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(world): WindowPane with rain particles, tied to Gale section"
```

### Task 22: PR Phase 4

Standard pattern.

---

# Phase 5 — Battle Arena bottom sheet (`feature/phase-5-battle-arena`)

Goal: tapping Apex's "In Battle" pill opens a bottom sheet with a tug-of-war bar driven by mock snapshots.

### Task 23: `BottomSheet` reusable component

**Files:**
- Create: `src/components/battle/BottomSheet.tsx`

- [ ] **Step 1: Branch**

```bash
git checkout -b feature/phase-5-battle-arena
```

- [ ] **Step 2: Implement using Framer Motion**

```tsx
// src/components/battle/BottomSheet.tsx
import { AnimatePresence, motion, useDragControls } from 'framer-motion';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, children }: Props) {
  const controls = useDragControls();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 bg-black/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal
            className="fixed left-0 right-0 bottom-0 z-50 bg-[color:var(--color-paper)] rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120) onClose();
            }}
          >
            <div
              className="pt-3 pb-2 flex justify-center cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => controls.start(e)}
            >
              <div className="w-12 h-1.5 rounded-full bg-[color:var(--color-border-default)]" />
            </div>
            <div className="overflow-y-auto px-5 pb-5">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(battle): BottomSheet with drag-to-dismiss via Framer Motion"
```

### Task 24: `TugOfWarBar` component

**Files:**
- Create: `src/components/battle/TugOfWarBar.tsx`
- Create: `tests/components/TugOfWarBar.test.tsx`

- [ ] **Step 1: Test**

```tsx
// tests/components/TugOfWarBar.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { TugOfWarBar } from '@/components/battle/TugOfWarBar';

describe('TugOfWarBar', () => {
  it('centers fill at 0 delta', () => {
    const { container } = render(<TugOfWarBar entryPriceCents={50} currentPriceCents={50} />);
    const fill = container.querySelector('[data-testid="fill"]') as HTMLElement;
    expect(fill.style.transform).toContain('scaleX(0');
  });

  it('pushes right when price favors agent (above entry)', () => {
    const { container } = render(<TugOfWarBar entryPriceCents={50} currentPriceCents={70} />);
    const fill = container.querySelector('[data-testid="fill"]') as HTMLElement;
    expect(fill.dataset.direction).toBe('right');
  });

  it('pushes left when price moves against agent', () => {
    const { container } = render(<TugOfWarBar entryPriceCents={50} currentPriceCents={30} />);
    const fill = container.querySelector('[data-testid="fill"]') as HTMLElement;
    expect(fill.dataset.direction).toBe('left');
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// src/components/battle/TugOfWarBar.tsx
interface Props {
  entryPriceCents: number;
  currentPriceCents: number;
  /** Which side the agent took: 'yes' means price up = win. */
  agentSide?: 'yes' | 'no';
}

export function TugOfWarBar({ entryPriceCents, currentPriceCents, agentSide = 'yes' }: Props) {
  const delta = currentPriceCents - entryPriceCents;
  const favorsAgent = agentSide === 'yes' ? delta > 0 : delta < 0;
  const magnitude = Math.min(Math.abs(delta) / 50, 1); // cap at 50¢ swing = full push
  const direction = delta === 0 ? 'center' : favorsAgent ? 'right' : 'left';
  const color = favorsAgent ? 'var(--color-gain)' : 'var(--color-loss)';

  return (
    <div
      className="relative h-4 rounded-full bg-[color:var(--color-border-default)]/30 overflow-hidden border border-[color:var(--color-border-default)]"
      role="meter"
      aria-valuemin={-50}
      aria-valuemax={50}
      aria-valuenow={delta}
      aria-label="Momentum against entry price"
    >
      {/* center tick */}
      <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[color:var(--color-ink-muted)]/50" />
      <div
        data-testid="fill"
        data-direction={direction}
        className="absolute top-0 bottom-0 transition-[transform] duration-500 ease-out"
        style={{
          left: '50%',
          width: '50%',
          transformOrigin: favorsAgent ? 'left' : 'right',
          transform: `translateX(${favorsAgent ? '0%' : '-100%'}) scaleX(${magnitude.toFixed(3)})`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(battle): TugOfWarBar with center-origin animation"
```

### Task 25: `BattleArena` sheet contents

**Files:**
- Create: `src/components/battle/BattleArena.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/battle/BattleArena.tsx
import { useEffect, useState } from 'react';
import type { Agent } from '@/lib/types';
import { TugOfWarBar } from './TugOfWarBar';

interface Props {
  agent: Agent;
}

export function BattleArena({ agent }: Props) {
  const op = agent.open_position;
  if (!op) return null;

  const [mockCurrentPrice, setMockCurrentPrice] = useState(op.entry_price_cents);

  // V1: mock mid-price walk. V1.1 replaces this with public Kalshi feed.
  useEffect(() => {
    const id = setInterval(() => {
      setMockCurrentPrice((prev) => {
        const drift = (Math.random() - 0.5) * 2;
        return Math.max(1, Math.min(99, prev + drift));
      });
    }, 1500);
    return () => clearInterval(id);
  }, []);

  const enteredAt = new Date(op.entered_at_delayed);
  const settlesAt = new Date(op.settles_at);
  const timeInMin = Math.round((Date.now() - enteredAt.getTime()) / 60_000);
  const settlesInHr = Math.round((settlesAt.getTime() - Date.now()) / (60 * 60_000));

  return (
    <div className="space-y-4 text-sm">
      <div className="text-center">
        <div className="text-xs uppercase text-[color:var(--color-ink-muted)]">
          Battle Arena · 30-min delay
        </div>
        <div className="text-lg font-medium" style={{ fontFamily: 'var(--font-display)' }}>
          {op.contract_ticker}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex-1 text-center">
          <div className="text-2xl">🦊</div>
          <div className="text-xs">{agent.name}</div>
        </div>
        <TugOfWarBar
          entryPriceCents={op.entry_price_cents}
          currentPriceCents={Math.round(mockCurrentPrice)}
          agentSide={op.side}
        />
        <div className="flex-1 text-center">
          <div className="text-2xl">☁️</div>
          <div className="text-xs">Market</div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs tabular-nums">
        <div>
          <dt className="text-[color:var(--color-ink-muted)]">Entered at</dt>
          <dd>{op.entry_price_cents}¢</dd>
        </div>
        <div>
          <dt className="text-[color:var(--color-ink-muted)]">Current</dt>
          <dd>{Math.round(mockCurrentPrice)}¢</dd>
        </div>
        <div>
          <dt className="text-[color:var(--color-ink-muted)]">Time in</dt>
          <dd>{timeInMin}m</dd>
        </div>
        <div>
          <dt className="text-[color:var(--color-ink-muted)]">Settles in</dt>
          <dd>{settlesInHr}h</dd>
        </div>
        <div>
          <dt className="text-[color:var(--color-ink-muted)]">Size</dt>
          <dd>{op.size}</dd>
        </div>
        <div>
          <dt className="text-[color:var(--color-ink-muted)]">Venue</dt>
          <dd>Kalshi</dd>
        </div>
      </dl>

      <p className="text-[10px] text-[color:var(--color-ink-muted)] leading-tight">
        Entries and settlements shown after 30-minute delay. Mid-price updates live from Kalshi
        (public market data, no delay).
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Wire into `AgentCard` via `InBattlePill` tap**

Modify `AgentCard.tsx`:

```tsx
import { useState } from 'react';
import type { Agent } from '@/lib/types';
import { AgentCardCollapsedRow } from './AgentCardCollapsedRow';
import { AgentCardExpandedBody } from './AgentCardExpandedBody';
import { BottomSheet } from '@/components/battle/BottomSheet';
import { BattleArena } from '@/components/battle/BattleArena';

export function AgentCard({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(false);
  const [battleOpen, setBattleOpen] = useState(false);

  return (
    <>
      <article
        aria-expanded={expanded}
        className="rounded-2xl bg-[color:var(--color-paper)] border border-[color:var(--color-border-default)] shadow-[0_4px_12px_rgba(62,53,41,0.10)]"
      >
        <button
          type="button"
          onClick={(e) => {
            // Don't toggle when InBattlePill was clicked
            if ((e.target as HTMLElement).closest('[data-role="in-battle-pill"]')) return;
            if (agent.state !== 'arriving_soon') setExpanded((v) => !v);
          }}
          className="w-full text-left cursor-pointer focus:outline-2 focus:outline-[color:var(--color-apex)]"
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${agent.name}'s card`}
        >
          <AgentCardCollapsedRow agent={agent} onBattleTap={() => setBattleOpen(true)} />
        </button>
        {expanded && (
          <div className="px-3 pb-3">
            <AgentCardExpandedBody agent={agent} />
          </div>
        )}
      </article>
      <BottomSheet open={battleOpen} onClose={() => setBattleOpen(false)}>
        <BattleArena agent={agent} />
      </BottomSheet>
    </>
  );
}
```

Update `AgentCardCollapsedRow` to accept `onBattleTap` and pass to `InBattlePill`:

```tsx
// at top
import { InBattlePill } from './InBattlePill';

// in Props
interface Props {
  agent: Agent;
  onBattleTap?: () => void;
}

// in JSX, where InBattlePill is rendered:
<div data-role="in-battle-pill">
  <InBattlePill
    settlesAt={agent.open_position.settles_at}
    onTap={onBattleTap}
  />
</div>
```

- [ ] **Step 3: Manual verify**

`npm run dev`. Open at 375px. Tap Apex's "In Battle" pill → bottom sheet slides up with tug-of-war bar drifting. Drag the sheet down → dismisses. Tap backdrop → dismisses.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(battle): BattleArena wired through AgentCard → BottomSheet"
```

### Task 26: PR Phase 5

Standard pattern.

---

# Phase 6 — Load screen + ambient polish (`feature/phase-6-polish`)

### Task 27: `useFirstVisitToday` hook

**Files:**
- Create: `src/hooks/useFirstVisitToday.ts`

- [ ] **Step 1: Branch, implement**

```bash
git checkout -b feature/phase-6-polish
```

```ts
// src/hooks/useFirstVisitToday.ts
import { useState, useEffect } from 'react';

const KEY = 'gym_last_visit_day';

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function useFirstVisitToday(): boolean {
  const [firstVisit] = useState(() => {
    const last = localStorage.getItem(KEY);
    return last !== todayStamp();
  });

  useEffect(() => {
    localStorage.setItem(KEY, todayStamp());
  }, []);

  return firstVisit;
}
```

### Task 28: `LoadScreen` component

**Files:**
- Create: `src/components/loadscreen/LoadScreen.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/components/loadscreen/LoadScreen.tsx
import { motion } from 'framer-motion';

interface Props {
  durationMs: number;
  onDone: () => void;
}

export function LoadScreen({ durationMs, onDone }: Props) {
  return (
    <motion.div
      className="fixed inset-0 z-[100] bg-black flex items-center justify-center"
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onAnimationComplete={() => setTimeout(onDone, durationMs)}
    >
      <div className="text-center">
        <div
          className="w-24 h-32 mx-auto border-4 border-amber-500 bg-amber-900 relative"
          style={{ imageRendering: 'pixelated' }}
        >
          {/* Crude pixel door; will be replaced by sprite art in V1.1 */}
          <div className="absolute top-12 left-2 w-3 h-5 bg-yellow-400" />
        </div>
        <p className="mt-4 text-amber-300" style={{ fontFamily: 'var(--font-display)' }}>
          The Trading Gym
        </p>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Wire into `App.tsx`**

```tsx
// in App.tsx imports
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { LoadScreen } from '@/components/loadscreen/LoadScreen';
import { useFirstVisitToday } from '@/hooks/useFirstVisitToday';

// in App():
export default function App() {
  useTimeOfDay();
  const isFirstVisit = useFirstVisitToday();
  const [showLoad, setShowLoad] = useState(isFirstVisit);

  return (
    <>
      <AnimatePresence>
        {showLoad && (
          <LoadScreen durationMs={1200} onDone={() => setShowLoad(false)} />
        )}
      </AnimatePresence>
      {/* ... rest unchanged */}
    </>
  );
}
```

- [ ] **Step 3: Verify**

Clear localStorage. Reload → load screen shows for 1.2s. Reload again → no load screen.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(loadscreen): first-visit-today ritual with localStorage gate"
```

### Task 29: Performance audit

**Files:**
- Modify: various, depending on findings

- [ ] **Step 1: Build production**

```bash
npm run build
```

- [ ] **Step 2: Check bundle size**

```bash
du -sh dist/
ls -lh dist/assets/*.js dist/assets/*.css
```

Target: total JS gzipped ≤120KB, CSS ≤25KB. If over, inspect output and consider lazy-loading Framer Motion or the Battle Arena.

- [ ] **Step 3: Run Lighthouse locally**

```bash
npm run preview &
npx lighthouse http://localhost:4173 --only-categories=performance,accessibility --preset=mobile --view
```

Targets: Performance ≥90, Accessibility ≥95.

- [ ] **Step 4: Fix any failing budgets**

Typical fixes:
- Code-split `BottomSheet` + `BattleArena` via `React.lazy`
- Inline critical CSS (Tailwind should handle this)
- Defer non-critical Framer Motion imports

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "perf: meet bundle + Lighthouse budgets for V1"
```

### Task 30: PR Phase 6

Standard pattern.

---

# Phase 7 — Real data wiring (`feature/phase-7-supabase`)

**Blocked on:** Justin shipping the leaderboard Edge Function by 2026-04-28. Start this phase only once the endpoint returns the shape in `justin-blockers.md` §2.

### Task 31: `useLeaderboard` fetch hook

**Files:**
- Create: `src/hooks/useLeaderboard.ts`

- [ ] **Step 1: Install Zod**

```bash
npm install zod
```

- [ ] **Step 2: Define Zod schema matching Justin's contract**

```ts
// src/lib/schema.ts
import { z } from 'zod';

export const MoveSchema = z.object({
  name: z.string(),
  locked: z.boolean(),
});

export const OpenPositionSchema = z.object({
  contract_ticker: z.string(),
  entry_price_cents: z.number().int(),
  side: z.enum(['yes', 'no']),
  size: z.number().int(),
  entered_at_delayed: z.string(),
  settles_at: z.string(),
});

export const AgentSchema = z.object({
  id: z.enum(['apex', 'gale', 'metheus']),
  name: z.string(),
  nickname: z.string(),
  market_label: z.string(),
  total_pnl: z.number(),
  record: z.object({
    W: z.number().int(),
    L: z.number().int(),
    BE: z.number().int(),
    settled: z.number().int(),
  }),
  brier_7d: z.object({ value: z.number(), n: z.number().int() }),
  cities_or_tags: z.array(z.string()),
  moves: z.array(MoveSchema),
  open_position: OpenPositionSchema.nullable(),
  latest_receipt_id: z.string().nullable(),
  state: z.enum(['live', 'pending', 'arriving_soon']),
});

export const LeaderboardSchema = z.object({
  updated_at: z.string(),
  agents: z.array(AgentSchema),
});
```

- [ ] **Step 3: Implement fetch hook**

```ts
// src/hooks/useLeaderboard.ts
import { useEffect, useState } from 'react';
import { LeaderboardSchema } from '@/lib/schema';
import type { LeaderboardResponse } from '@/lib/types';
import { mockLeaderboard } from '@/lib/mockData';

const API_URL = import.meta.env.VITE_API_URL ?? '';

export function useLeaderboard() {
  const [data, setData] = useState<LeaderboardResponse>(mockLeaderboard);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!API_URL) return; // dev: use mock

    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`${API_URL}/api/leaderboard`);
        const raw = await res.json();
        const parsed = LeaderboardSchema.parse(raw);
        if (!cancelled) setData(parsed);
      } catch (err) {
        console.warn('useLeaderboard: using stale/mock', err);
        if (!cancelled) setError(err as Error);
      }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return { data, error };
}
```

- [ ] **Step 4: Swap `mockLeaderboard` for `useLeaderboard` in `App.tsx`**

```tsx
// replace: mockLeaderboard
// with:
const { data } = useLeaderboard();
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: wire leaderboard to Supabase Edge Function with Zod validation"
```

### Task 32: PR Phase 7

Standard pattern.

---

# Definition of Done for V1

Re-check against spec §12. All of the following must be true before merging `main` → production:

- [ ] Three collapsed cards visible in first viewport on iPhone 12 emulator (375px)
- [ ] Tap-to-expand works on Apex and Gale; no expand on Metheus (arriving soon)
- [ ] Gale's window renders (rain if API available, else clear fallback)
- [ ] Scroll between agents swaps world-accent color smoothly
- [ ] Tapping "In Battle" opens the bottom sheet with tug-of-war bar drifting
- [ ] Red -$22.89 passes WCAG AA against `--paper`
- [ ] 30-minute-delay tooltip shows on every "In Battle" pill
- [ ] First-visit-today load screen runs once; subsequent loads skip
- [ ] `npm run build` under bundle budgets; Lighthouse mobile Performance ≥90 and Accessibility ≥95
- [ ] All Vitest tests pass
- [ ] Deployed preview on Vercel reviewed on a real phone (not just DevTools)

---

# Known risks carried into V1

1. **Metheus roster slot.** If Justin ships Scenario A data by 2026-04-28 → wire his live stats; if Scenario B → ship current "arriving soon" state. Task 31 handles both via the `state` field.
2. **PixelLab avatar consistency.** Fall back to silhouette via `AgentAvatar`'s `spriteUrl` optional prop.
3. **OpenWeather API key availability.** Without a key, Gale's window falls to `clear` gracefully. No blocker.
4. **TikTok in-app browser.** Must test on the actual TikTok app before claiming V1 done; Chrome emulator is not sufficient.

---

# Self-review notes (done inline)

- **Spec coverage:** §2 architecture → Tasks 8, 14 (WorldLayer + TrustStrip). §3 palette → Task 2 (tokens in globals.css). §4 mobile interaction → Tasks 13, 15, 23 (collapsed cards, sticky strip, bottom sheet). §5 three rooms → Task 17 (RoomSection). §7 delay policy → Task 11 (InBattlePill tooltip). §8 battle model → Tasks 24, 25 (TugOfWarBar, BattleArena). §9.4 API shape → Task 31. §12 performance → Task 29. §12 load screen → Tasks 27, 28. All spec sections mapped.
- **Placeholder scan:** no "TBD" / "add appropriate" / "handle edge cases" language found.
- **Type consistency:** `Agent`, `OpenPosition`, `Snapshot` defined in `types.ts` (Task 4), referenced consistently downstream. `AgentId` enum used in `AgentAvatar`, `RoomSection`, `useRoomScroll`.
- **One known small gap:** `TrustStrip`'s "settled today" currently shows lifetime settled. True "today" filter needs a timestamp field on trades that Justin's API would need to include. Flagged as V1.1 in the task code comment.
