# CLAUDE.md — trading_agent_dash

## What this is

Public dashboard for the Lyforic prediction-market trading agents (Apex, Gale, Metheus) at `gym.lyforic.com`. Cozy pixel-art "trading gym": real trade data, 30-minute delayed, no demos. Built by Brandon (frontend, Apex/Gale daemons) and Justin (Metheus daemon, Supabase edge functions).

**Deploy target:** Vercel project `brandonopenclaws-projects/trading_agent_dash`, auto-deploy from GitHub `LyForic/trading_agent_dash`, production branch `main` (protected, PR-only merges). `vercel.json` rewrites everything to `index.html` (SPA). Fallback URL: `tradingagentdash.vercel.app`.

## Repo map

- `src/App.tsx` — router + global providers. Routes: `/` = WorldV2Page (Phaser living overworld), `/town` = TownSquarePage (V1 plaza), `/*` = GymPage (`/gym` roster; `/apex` `/gale` `/metheus` enable Focus Mode; one shared route keeps WorldLayer mounted for smooth room crossfades)
- `src/pages/` — GymPage, TownSquarePage, WorldV2Page
- `src/components/content/` — AgentCard family, TradeLog, TrustStrip, pills, FooterTicker
- `src/components/battle/` — BattleArena, BottomSheet, TugOfWarBar (mobile-first open-position sheet)
- `src/components/world/` — WorldLayer, SpriteAnimator, RoomAgentLayer, WeatherParticles, ambient layers
- `src/components/chrome/` — TimeOfDayCog (global Auto/Daytime/Dusk/Moonlit toggle)
- `src/lib/` — `supabase.ts` client singleton, `useAgentData.ts` (main data hook), `mockData.ts`, `types.ts`, formatting, time-of-day, Gale weather context, replay ticks
- `src/world-v2/` — `LivingWorldScene.ts` (Phaser 4 + navmesh) and `worldMapData.ts`
- `public/` — real PNG art: `sprites/` (per-agent animations + rotations + metadata.json), `rooms/`, `houses/`, `props/`, `fx/`, `signposts/`, `world-v2/`
- `supabase/` — migrations, `functions/leaderboard` + `functions/weather`, `agent-replay/` scripts, and `README.md` (data model + security boundary; read before touching anything DB-side)
- `tests/` — Vitest suites (components, hooks, lib, pages, integration); `visual/` — Playwright visual QA (kept out of `tests/` so Vitest ignores it)
- `docs/plans/` — V1 + Phase 5 plans; `docs/codex-memory/trading-gym-lessons.md`
- `scripts/` — Python sprite-sheet slicers for world-v2 assets

## Stack and conventions

- Vite + React 19 + TypeScript, Tailwind CSS v4 via `@tailwindcss/vite`, Framer Motion (spring transitions only), react-router-dom 7, lucide-react, cva/clsx/tailwind-merge (shadcn-style primitives)
- Phaser 4 + navmesh power the `/` overworld only; the Gym pages are plain React with CSS-variable room theming swapped on scroll via IntersectionObserver
- State is hooks + context (GaleWeatherProvider, localStorage hooks); no Redux or external store
- `@/` path alias resolves to `src/`
- Data path: `supabase.ts` returns `null` when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are absent and all callers fall back to `mockData.ts` (CI and offline work without creds)
- Reads only public delayed views: `agent_trades_public` (windowed modes) and `agent_lifetime_stats` (Lifetime mode; emits no row for zero-trade agents, handle the missing-row case). Anon SELECT on base `agent_trades` is revoked by migration
- Vitest uses jsdom with a framer-motion mock aliased in `vite.config.ts`

## Commands

```bash
npm run dev -- --host 127.0.0.1   # dev server at http://127.0.0.1:5173/
npm test                          # vitest run (test:watch, test:ui also exist)
npm run lint                      # eslint
npm run build                     # tsc -b && vite build
npm run visual:qa                 # Playwright visual QA, desktop 1280x900 + Pixel 7 mobile
npm run visual:apex|town|rooms    # focused visual runs by @tag
npm run visual:report             # open last HTML report
```

## Hard rules

- **Delay policy is brand integrity, not tech debt.** All trade-level data shows with a 30-minute delay, enforced in the database views. Never add a client-side path around it, and never describe the Battle Arena price bar as a private live signal (it is an entry-anchored preview until a public Kalshi quote feed exists)
- **Agent id discipline.** The gym views key on `agent_id`; the shared trading DB (`zzfmmsuzzbbrfptmtmfu`, shared with Apex/Gale/Iris/Leon) keys on `bot_id`. Always verify which agent a query touches before running it; the mirror trigger from `pm_bets` is the only write path the gym depends on
- **Real sprites only.** Pixel-art surfaces use actual small PNG assets from `public/`; never fake pixel art with CSS pseudo-elements
- **UI iteration via Playwright** (desktop + mobile viewports), not screenshot ping-pong; use `visual:qa` or the Playwright MCP
- **No secrets in code.** Creds live in `.env.local` (gitignored, along with `.ai/` and `artifacts/`); only the anon key is ever client-side. Check for env files before any git operation
- Branching: short-lived `feature/<area>` branches into `main`; no long-lived dev branch

## Current state pointers

- Canonical progress log and locked design spec: vault `500-Projects/lyforic/trading-gym/` (spec `2026-04-21-design.md`, `justin-blockers.md`, `artist-brief.md` parked for V1.1)
- V1 is live in production; Phase 5 (time-window filters, unified TradeLog, Battle Arena V1.1, atmosphere, launch hardening) is on `main` per README; `/` WorldV2 overworld is experimental
- Supabase data-model details and verification curls: `supabase/README.md`
