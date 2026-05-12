-- Harden public read boundary.
--
-- Public browser access should only reach the delayed/sanitized views used by
-- the dashboard. Base tables and legacy views remain available to service_role
-- for daemons/admin work, but not to anon/authenticated browser roles.

begin;

revoke all privileges on table public.pm_bets from anon;
revoke all privileges on table public.pm_bets from authenticated;
revoke all privileges on table public.pm_bets from public;

revoke all privileges on table public.agent_trades from anon;
revoke all privileges on table public.agent_trades from authenticated;
revoke all privileges on table public.agent_trades from public;

revoke all privileges on table public.bots from anon;
revoke all privileges on table public.bots from authenticated;
revoke all privileges on table public.bots from public;

do $$
begin
  if to_regclass('public.v_leaderboard') is not null then
    execute 'revoke all privileges on table public.v_leaderboard from anon';
    execute 'revoke all privileges on table public.v_leaderboard from authenticated';
    execute 'revoke all privileges on table public.v_leaderboard from public';
  end if;
end $$;

revoke all privileges on table public.agent_trades_public from authenticated;
revoke all privileges on table public.agent_trades_public from public;
revoke all privileges on table public.agent_lifetime_stats from authenticated;
revoke all privileges on table public.agent_lifetime_stats from public;

grant select on table public.agent_trades_public to anon;
grant select on table public.agent_lifetime_stats to anon;

commit;
