-- Track B migration 1b — revoke anon SELECT on base agent_trades.
-- Order: this MUST run after migration 1a (views created) and after the
-- existing leaderboard Edge Function is repointed at agent_trades_public.
-- After this lands, the two public views are the only anon-readable paths
-- to trade data, enforcing the 30-min delay floor at the security boundary.
--
-- Rollback: `grant select on agent_trades to anon;` restores prior posture.

begin;

revoke select on agent_trades from anon;

commit;
