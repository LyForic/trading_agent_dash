# trading_agent_dash

Public dashboard for the Lyforic prediction-market trading agents — Apex, Gale, and Metheus — at `gym.lyforic.com`.

Cozy pixel-art trading gym. Real data. No demos.

## Status

V1 code is launch-candidate on `main`. Production is live at `https://gym.lyforic.com/` through Vercel, with `https://tradingagentdash.vercel.app/` as the fallback Vercel URL.

Current deploy evidence:

- Vercel project: `brandonopenclaws-projects/trading_agent_dash`
- Latest Git-triggered production deploy: `dpl_52P4cB5hgJaDxLX7ppps4JWvwFQq`
- Custom domain DNS: `gym.lyforic.com` resolves and returns HTTPS 200.
- GitHub auto-deploy is connected to `LyForic/trading_agent_dash` with production branch `main`.

## Phase 5 features

- **Track B — per-agent P&L time-window filter** (24h / 7d / Lifetime): window selector pill on each agent card; Lifetime mode reads `agent_lifetime_stats` view, windowed modes read `agent_trades_public`.
- **Track B — unified trade log**: replaces the prior single-receipt panel; shows settled trades and open positions in one scrollable component.
- **Track B — In Battle pill**: rendered as a sibling of the summary button and opens Battle Arena for delayed-visible open positions.
- **Battle Arena V1.1**: mobile-first bottom sheet for active open positions. The price bar is an entry-anchored preview until a public Kalshi quote feed exists; it must not be described as a private live signal.
- **Atmosphere — chimney smoke**: animated smoke particles above Metheus's house in the world layer.
- **Global time-of-day toggle**: cog icon at top-right opens a popover to select Auto / Daytime / Dusk / Moonlit.
- **Launch hardening**: `/gym` back chrome avoids TrustStrip overlap, and first-load live-data failures render an explicit delayed-data error state instead of a blank roster.

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

```bash
npm install
npm run dev -- --host 127.0.0.1
```

Open `http://127.0.0.1:5173/`.

Useful gates:

```bash
npm test
npm run lint
npm run build
```

Supabase credentials are optional for local work. Without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, the app uses mock data. With credentials configured, the app reads only the public delayed views documented in `supabase/README.md`.

Public Lab analytics events dispatch to Vercel Analytics, `window.dataLayer`,
`gtag`, and the in-browser `window.__PUBLIC_LAB_EVENTS__` debug queue when those
collectors exist. To send the same payloads to a custom collector, configure
`VITE_PUBLIC_LAB_ANALYTICS_ENDPOINT` and optionally
`VITE_PUBLIC_LAB_ANALYTICS_TOKEN`.

Episode and platform links should use this UTM convention:

```text
?utm_source=<platform>&utm_medium=<short|reel|bio>&utm_campaign=<yyyy-mm-dd>-<slug>
```

UTMs are composable with deep links, for example:
`/?agent=apex&trade=<trade-id>&utm_source=tiktok&utm_medium=short&utm_campaign=2026-06-04-apex-proof`.

## People

- **Brandon Fong** — frontend, Apex + Gale daemons, product
- **Justin** — Metheus daemon, Supabase edge functions, shared `pm_signals` schema

## Public outcome policy

Settled outcomes, settled-trade P&L, public replay ticks for settled trades, and
public account snapshots are shown when the public ledger updates. Open entries
remain hidden until they are safe to publish through the public views. The UI
must not imply investment advice, copy trading, guaranteed returns, or private
live signals.
