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
- **`agent_trade_replay_ticks`** — privileged bot-written probability
  snapshots for replaying an individual trade chart. Bots insert one row per
  sampled timestamp with `trade_id`, `captured_at`, `yes_price_cents`,
  `no_price_cents`, and optional underlying metadata
  (`underlying_label`, `underlying_value`, `underlying_unit`). Anon access is
  revoked on the base table. Nova's 15-minute ETH contracts use this same
  table with `underlying_label = 'ETH'` and `underlying_unit = 'USD'`.
- **`agent_trade_replay_ticks_public`** — 30-min-delayed view over replay
  ticks, joined through `agent_trades_public` so a tick is only visible when
  both the trade and the tick satisfy the public delay boundary. Anon `SELECT`
  GRANTED.
- **`agent_learning_posts`** — privileged bot-written public learning notes
  for the Living World "Learn More" cards. Bots insert rows with `agent_id`,
  `title`, `body`, optional `source`, and `made_at`; unpublished drafts can be
  hidden with `is_published = false`. Anon access is revoked on the base table.
- **`agent_learning_posts_public`** — read-only public view over published
  learning posts. The frontend polls this view while a Learn More card is open
  so new notes appear without a deploy. Anon `SELECT` GRANTED.
- **`public_lab_episodes`** — privileged sync-written feed for short-form
  public lab posts. The `sync-public-lab-episodes` Edge Function writes TikTok
  uploads here with optional `agent_id` and `trade_id` tags inferred from the
  caption/title. Anon access is revoked on the base table.
- **`public_lab_episodes_public`** — read-only published episode projection
  used by the Watch Today's Episode card. Anon `SELECT` GRANTED.
- **`pm_bets`** — canonical per-trade table the trading daemons already
  write to. Untouched by this frontend. Anon/authenticated/public privileges
  are revoked; writes belong only to privileged daemon credentials.
- **`bots`** — agent registry (bot_id, display_name, owner, trading_mode,
  machine_host). Not anon-readable; expose a sanitized public view first if
  the dashboard ever needs registry metadata.
- **`v_leaderboard`** — cross-bot ranking view. Not used by the dashboard
  V1 (it rolls up all-time history, which conflicts with the fresh-start
  directive). Anon/authenticated/public privileges are revoked.

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

# 4. Deploy the Edge Functions
supabase functions deploy leaderboard
supabase functions deploy weather
supabase functions deploy sync-public-lab-episodes

# 5. Optional: enable auto-updating Watch Today's Episode from TikTok
supabase secrets set TIKTOK_ACCESS_TOKEN=...
supabase secrets set PUBLIC_LAB_EPISODE_LIMIT=12

# Then call the function from a cron/scheduler every few minutes:
curl -X POST \
  "${VITE_SUPABASE_URL}/functions/v1/sync-public-lab-episodes" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
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
3. **Anon/authenticated/public access is REVOKED on base tables and legacy
   views** (migration `20260512000000_harden_public_read_boundary.sql`). Even
   with the anon key in the browser bundle, a client cannot read undelayed
   trade rows, `pm_bets`, `bots`, or `v_leaderboard`.
4. The **`leaderboard` Edge Function** reads from `agent_trades_public`, not
   the base table.

Anon/authenticated/public write access (INSERT/UPDATE/DELETE) is also revoked
on `pm_bets`, `agent_trades`, and `bots`. Writes come only from privileged
credentials used by the trading daemons.

## Migration history

| File | Purpose |
|------|---------|
| `20260423000000_lock_down_writes.sql` | Revoke anon INSERT/UPDATE/DELETE on `pm_bets`, `agent_trades`, `bots` |
| `20260423010000_mirror_pm_bets_to_agent_trades.sql` | Trigger: mirror Apex/Gale settles from `pm_bets` → `agent_trades` |
| `20260426000000_track_b_views.sql` | Create `agent_trades_public` (30-min-delayed view) and `agent_lifetime_stats` (per-agent rollup); grant anon SELECT on both |
| `20260426000001_revoke_base_anon_select.sql` | Revoke anon SELECT on base `agent_trades`; views are now the only anon-readable paths |
| `20260512000000_harden_public_read_boundary.sql` | Revoke anon/authenticated/public access on base sensitive tables and legacy leaderboard; keep anon SELECT only on delayed/sanitized public views |
| `20260512001000_tighten_public_view_grants.sql` | Revoke inherited/previous non-SELECT privileges on delayed public views; re-grant anon SELECT only |
| `20260522000000_agent_trade_replay_ticks.sql` | Create the privileged replay-ticks table and delayed public view |
| `20260522001000_generalize_trade_replay_ticks.sql` | Add generic YES/NO probability + underlying fields for all markets |
| `20260522002000_agent_learning_posts.sql` | Create privileged agent learning posts and public published view |
| `20260524001000_public_lab_episodes.sql` | Create privileged public lab episode feed and published read-only view |

## Frontend read paths (current)

| Mode | Query target |
|------|-------------|
| 24h / 7d window | `agent_trades_public` filtered by `settled_at` range |
| Lifetime | `agent_lifetime_stats` (one row per agent) |
| Trade replay chart | `agent_trade_replay_ticks_public` for real ticks, modeled fallback when missing |
| Learn More cards | `agent_learning_posts_public` filtered by selected `agent_id` |
| Watch Today's Episode | `public_lab_episodes_public` latest row, falling back to the latest trade if empty/unavailable |
| Edge Function `leaderboard` | reads `agent_trades_public` |

The frontend no longer queries `agent_trades` directly.

## Watch Today's Episode sync

The browser cannot safely call TikTok or Instagram APIs directly because the
creator access token would be exposed. Use the server-side episode feed instead:

1. The `sync-public-lab-episodes` Edge Function calls TikTok's Display API
   `/v2/video/list/` with `TIKTOK_ACCESS_TOKEN`.
2. It upserts the newest videos into `public_lab_episodes`.
3. The public website reads `public_lab_episodes_public` and refreshes the
   home episode card every five minutes.

To link an episode to an agent or replay, include the agent name/hashtag
(`#apex`, `#gale`, `#metheus`, `#bacon`, `#nova`) and optionally
`trade:<agent_trades id>` in the post caption/title.
