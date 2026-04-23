# Supabase assets — Trading Gym

This directory holds the Edge Function + SQL migration that supports the
live dashboard. The frontend can read Supabase directly today; the Edge
Function is here for when we want rate-limiting, caching, or server-side
derived fields (Brier, rolling metrics).

## One-time setup (Brandon)

```bash
# 1. Install the CLI
brew install supabase/tap/supabase

# 2. Link this directory to the project (will create supabase/config.toml)
cd ~/Developer/trading_agent_dash
supabase link --project-ref zzfmmsuzzbbrfptmtmfu

# 3. Lock down anon writes (see security note below)
supabase db push
#   — or paste migrations/20260423000000_lock_down_writes.sql into the
#     Supabase dashboard SQL editor

# 4. Deploy the leaderboard Edge Function
supabase functions deploy leaderboard
```

Verify the function:

```bash
set -a && source .env.local && set +a
curl -s "${VITE_SUPABASE_URL}/functions/v1/leaderboard" \
  -H "Authorization: Bearer ${VITE_SUPABASE_ANON_KEY}" | jq
```

## Security note — anon currently has full CRUD on pm_bets & agent_trades

Until `20260423000000_lock_down_writes.sql` is applied, anyone holding
the anon key (which ships in the browser bundle) can INSERT / UPDATE /
DELETE rows. That's fine while the dashboard URL is private, but the
migration MUST land before `gym.lyforic.com` goes public.

After the migration, writes come from the service_role key, used only
by the trading daemons on Mac Studio / Justin's Mac Mini.

## Switching the frontend to the Edge Function

The dashboard's `useAgentData` hook queries `pm_bets` directly today.
To switch to the function without re-writing the hook, you can wrap the
response:

```ts
// pseudo
const r = await fetch(`${VITE_SUPABASE_URL}/functions/v1/leaderboard`, {
  headers: { Authorization: `Bearer ${VITE_SUPABASE_ANON_KEY}` },
});
const json = await r.json();
// json already matches LeaderboardResponse — set directly
```

Held off on doing the swap until the function is deployed and verified.
