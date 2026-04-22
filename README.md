# trading_agent_dash

Public dashboard for the Lyforic prediction-market trading agents — Apex, Gale, and Metheus — at `gym.lyforic.com`.

Cozy pixel-art trading gym. Real data. No demos.

## Status

V1 in active build. Spec frozen 2026-04-21.

## Design source of truth

- **Locked spec:** `~/Documents/Obsidian Vault/500-Projects/lyforic/trading-gym/2026-04-21-design.md`
- **Justin's blockers:** `~/Documents/Obsidian Vault/500-Projects/lyforic/trading-gym/justin-blockers.md`
- **Artist brief (parked for V1.1):** `~/Documents/Obsidian Vault/500-Projects/lyforic/trading-gym/artist-brief.md`

## Stack (V1)

- Vite + React 18 + TypeScript
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
