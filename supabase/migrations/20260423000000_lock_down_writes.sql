-- 20260423000000_lock_down_writes.sql
--
-- Close anon INSERT / UPDATE / DELETE on the two tables the public
-- dashboard reads. Before this migration, agent_trades was fully open
-- to the anon role (I verified: anon can POST a row and DELETE it).
-- pm_bets should stay the same way — writes belong to service_role,
-- called from the trading daemons on Mac Studio / Mac Mini.
--
-- Anon retains SELECT so the dashboard can still read.
-- service_role keeps all grants by default; RLS is bypassed for that key.
--
-- Run in the Supabase SQL editor, or via:
--   supabase db push
-- after linking the project.

begin;

-- pm_bets -------------------------------------------------------------
revoke insert, update, delete on table public.pm_bets from anon;
revoke insert, update, delete on table public.pm_bets from authenticated;
grant select on table public.pm_bets to anon;

-- agent_trades --------------------------------------------------------
revoke insert, update, delete on table public.agent_trades from anon;
revoke insert, update, delete on table public.agent_trades from authenticated;
grant select on table public.agent_trades to anon;

-- bots ---------------------------------------------------------------
-- Also close writes on bots — the registry row is tuning data, not
-- dashboard-writable. Leave read open so the UI can surface trading_mode
-- and machine_host chips in later phases.
revoke insert, update, delete on table public.bots from anon;
revoke insert, update, delete on table public.bots from authenticated;
grant select on table public.bots to anon;

commit;

-- Verification (run separately, not in the transaction):
--   select table_name, privilege_type, grantee
--     from information_schema.role_table_grants
--    where table_schema = 'public'
--      and table_name in ('pm_bets','agent_trades','bots')
--    order by table_name, grantee, privilege_type;
