# Supabase assets — Trading Gym

This directory holds the SQL migrations + Edge Function that back the
live dashboard.

## Data model

- **`agent_trades`** — the base table for the Trading Gym.
  Metheus's Python bot writes here directly. Apex + Gale writes land
  via a Postgres trigger that mirrors new settles from `pm_bets` (see
  `migrations/20260423010000_mirror_pm_bets_to_agent_trades.sql`).
  All three bots keep their canonical trade history in `pm_bets`; the
  gym just reads the mirror.
  **Anon `SELECT` is REVOKED on this table** (see security boundary below).
- **`agent_trades_public`** — 30-min-delayed view over `agent_trades`.
  Only rows where `entered_at` and (if settled) `settled_at` are both
  older than 30 minutes are visible. This is the primary read path for
  the frontend and the `leaderboard` Edge Function. Anon `SELECT`
  GRANTED.
- **`agent_lifetime_stats`** — per-agent aggregate view built on top of
  `agent_trades_public`. Emits one row per agent with `settled`, `wins`,
  `losses`, `breakeven`, `total_pnl`, and `open_count`. Used by the
  frontend's Lifetime mode. The 30-min delay floor is inherited from the
  underlying view. Anon `SELECT` GRANTED. No row is emitted for an agent
  with zero qualifying rows — clients must handle the missing-row case.
- **`pm_bets`** — canonical per-trade table the trading daemons already
  write to. Untouched by this frontend.
- **`bots`** — agent registry (bot_id, display_name, owner, trading_mode,
  machine_host).
- **`v_leaderboard`** — cross-bot ranking view. Not used by the dashboard
  V1 (it rolls up all-time history, which conflicts with the fresh-start
  directive). Available for Phase 4 if we want a cross-bot "Iris/Megatron
  are also cooking" strip.

## One-time setup (Brandon, runs from this repo root)

```bash
# 1. CLI (already done)
brew install supabase/tap/supabase

# 2. Link this directory to the project (creates supabase/config.toml)
cd ~/Developer/trading_agent_dash
supabase link --project-ref zzfmmsuzzbbrfptmtmfu

# 3. Apply all migrations (see Migration history below)
supabase db push
#   — or paste each migration file into the Supabase dashboard SQL editor

# 4. Deploy the leaderboard Edge Function
supabase functions deploy leaderboard
```

## Verifying the trigger

```bash
set -a && source .env.local && set +a

# Confirm agent_trades_public is queryable via anon key:
curl -s "${VITE_SUPABASE_URL}/rest/v1/agent_trades_public?select=agent_id" \
  -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
  | python3 -c "import sys,json,collections; \
      print(collections.Counter(r['agent_id'] for r in json.load(sys.stdin)))"
# Expected: counter of agents with settled/open trades older than 30 min.

# Confirm base agent_trades is NOT queryable via anon key:
curl -s "${VITE_SUPABASE_URL}/rest/v1/agent_trades?select=agent_id" \
  -H "apikey: ${VITE_SUPABASE_ANON_KEY}"
# Expected: permission denied error (anon SELECT revoked).
```

## Security boundary — delay enforcement

The 30-minute delay is a **brand-integrity constraint** (see `2026-04-21-design.md` §7).
It is enforced at the database layer so no client-side bypass is possible:

1. **`agent_trades_public`** filters out rows where `entered_at` or
   `settled_at` is within the last 30 minutes. This is the only anon-readable
   path to trade-level data.
2. **`agent_lifetime_stats`** is built on `agent_trades_public`, so the delay
   floor applies to aggregates too.
3. **Anon `SELECT` is REVOKED on the base `agent_trades` table** (migration
   `20260426000001_revoke_base_anon_select.sql`). Even with the anon key in
   the browser bundle, a client cannot read undelayed data.
4. The **`leaderboard` Edge Function** reads from `agent_trades_public`, not
   the base table.

Anon write access (INSERT/UPDATE/DELETE) is also revoked on `pm_bets`,
`agent_trades`, and `bots` (migration `20260423000000_lock_down_writes.sql`).
Writes come only from the `service_role` key used by the trading daemons.

## Migration history

| File | Purpose |
|------|---------|
| `20260423000000_lock_down_writes.sql` | Revoke anon INSERT/UPDATE/DELETE on `pm_bets`, `agent_trades`, `bots` |
| `20260423010000_mirror_pm_bets_to_agent_trades.sql` | Trigger: mirror Apex/Gale settles from `pm_bets` → `agent_trades` |
| `20260426000000_track_b_views.sql` | Create `agent_trades_public` (30-min-delayed view) and `agent_lifetime_stats` (per-agent rollup); grant anon SELECT on both |
| `20260426000001_revoke_base_anon_select.sql` | Revoke anon SELECT on base `agent_trades`; views are now the only anon-readable paths |

## Frontend read paths (current)

| Mode | Query target |
|------|-------------|
| 24h / 7d window | `agent_trades_public` filtered by `entered_at` range |
| Lifetime | `agent_lifetime_stats` (one row per agent) |
| Edge Function `leaderboard` | reads `agent_trades_public` |

The frontend no longer queries `agent_trades` directly.
