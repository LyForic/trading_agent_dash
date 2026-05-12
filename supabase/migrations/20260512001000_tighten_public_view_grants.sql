-- Tighten delayed public view grants.
--
-- The public views should be read-only for browser roles. Revoke every
-- inherited/previous privilege from browser roles, then grant SELECT only to
-- anon for the frontend read path.

begin;

revoke all privileges on table public.agent_trades_public from anon;
revoke all privileges on table public.agent_trades_public from authenticated;
revoke all privileges on table public.agent_trades_public from public;

revoke all privileges on table public.agent_lifetime_stats from anon;
revoke all privileges on table public.agent_lifetime_stats from authenticated;
revoke all privileges on table public.agent_lifetime_stats from public;

grant select on table public.agent_trades_public to anon;
grant select on table public.agent_lifetime_stats to anon;

commit;
