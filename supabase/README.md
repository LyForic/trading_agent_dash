# Supabase assets — Trading Gym

This directory holds the SQL migrations + Edge Function that back the
live dashboard.

## Data model

- **`agent_trades`** — the formal-reset table for the Trading Gym.
  Metheus's Python bot writes here directly. Apex + Gale writes land
  via a Postgres trigger that mirrors new settles from `pm_bets` (see
  `migrations/20260423010000_mirror_pm_bets_to_agent_trades.sql`).
  All three bots keep their canonical trade history in `pm_bets`; the
  gym just reads the mirror.
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

# 3. Apply the two migrations:
#      - lock down anon INSERT/UPDATE/DELETE
#      - install the pm_bets → agent_trades mirror trigger
supabase db push
#   — or paste each migration file into the Supabase dashboard SQL editor

# 4. Deploy the leaderboard Edge Function (optional; frontend queries
#    agent_trades directly today, Edge Function is the rate-limiting
#    / caching layer we'll want post-launch).
supabase functions deploy leaderboard
```

## Verifying the trigger

```bash
set -a && source .env.local && set +a

# Before trigger install + Apex/Gale settling new trades:
curl -s "${VITE_SUPABASE_URL}/rest/v1/agent_trades?select=agent_id" \
  -H "apikey: ${VITE_SUPABASE_ANON_KEY}" \
  | python3 -c "import sys,json,collections; \
      print(collections.Counter(r['agent_id'] for r in json.load(sys.stdin)))"
# Expected: Counter({'metheus': 3})

# After Apex or Gale settles its first new trade post-trigger:
# Expected: Counter({'metheus': 3, 'apex': 1}) and growing
```

## Security note — RLS lockdown

Migration `20260423000000_lock_down_writes.sql` revokes anon
`INSERT/UPDATE/DELETE` on `pm_bets`, `agent_trades`, and `bots`. Anon
retains `SELECT`. Writes after lockdown come from the `service_role` key,
used only by the trading daemons on Mac Studio / Justin's Mac Mini.

**Run this migration before `gym.lyforic.com` goes public.** Before it's
applied, anyone holding the anon key (which ships in the browser bundle)
can write fake rows or wipe real ones.

## Switching the frontend to the Edge Function

`src/lib/useAgentData.ts` queries `agent_trades` directly today. To swap
in the Edge Function later:

```ts
// pseudo
const r = await fetch(`${VITE_SUPABASE_URL}/functions/v1/leaderboard`, {
  headers: { Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}` },
});
const json = await r.json();
// json already matches LeaderboardResponse — set directly.
```

Held off on doing the swap until the function is deployed and verified.
