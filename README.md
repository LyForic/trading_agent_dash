# trading_agent_dash

Public dashboard for the Lyforic prediction-market trading agents — Apex, Gale, and Metheus — at `gym.lyforic.com`.

Cozy pixel-art trading gym. Real data. No demos.

## Status

V1 in active build. Spec frozen 2026-04-21. Phase 5 in progress.

## Phase 5 features (as of 2026-04-26)

- **Track B — per-agent P&L time-window filter** (24h / 7d / Lifetime): window selector pill on each agent card; Lifetime mode reads `agent_lifetime_stats` view, windowed modes read `agent_trades_public`.
- **Track B — unified trade log**: replaces the prior single-receipt panel; shows settled trades and open positions in one scrollable component.
- **Track B — In Battle pill**: rendered as a sibling of the summary button (a11y co-fix; no longer a child of an interactive element).
- **Atmosphere — chimney smoke**: animated smoke particles above Metheus's house in the world layer.
- **Global time-of-day toggle**: cog icon at top-right opens a popover to force Morning / Afternoon / Night or return to auto.

## Design source of truth

- **Locked spec:** `~/Documents/Obsidian Vault/500-Projects/lyforic/trading-gym/2026-04-21-design.md`
- **Justin's blockers:** `~/Documents/Obsidian Vault/500-Projects/lyforic/trading-gym/justin-blockers.md`
- **Artist brief (parked for V1.1):** `~/Documents/Obsidian Vault/500-Projects/lyforic/trading-gym/artist-brief.md`

## Stack (V1)

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- shadcn/ui (primitives)
- Framer Motion (spring transitions only)
- Supabase (data source, owned by Justin)
- Deployed on Vercel

## Architecture (one sentence)

Cream cards (content) sit above a fixed cozy-dusk room (world), with a conditional live overlay (accent aura) when any agent has a delayed-visible open position. The world layer swaps CSS variables on scroll via `IntersectionObserver` to produce three agent "rooms" (Apex dojo, Gale weather loft, Metheus study).

Full architecture in the locked spec.

## Branching

- `main` — deployable. Protected; merges via PR only.
- `feature/<area>` — short-lived feature branches (e.g. `feature/world-layer`, `feature/agent-card-collapsed`).
- No long-lived dev branch. Feature branches merge back to `main` when green.

## Running locally

_To be scaffolded. See the implementation plan._

## People

- **Brandon Fong** — frontend, Apex + Gale daemons, product
- **Justin** — Metheus daemon, Supabase edge functions, shared `pm_signals` schema

## Delay policy

All trade-level data (entries, settlements, P&L on closed trades) is shown with a **30-minute delay**. Only public Kalshi mid-price can be surfaced in real time. This is a brand-integrity constraint, not a technical one. See `2026-04-21-design.md` §7 for enforcement rules.
