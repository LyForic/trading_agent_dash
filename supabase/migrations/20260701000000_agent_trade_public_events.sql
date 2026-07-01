-- Realtime invalidation feed for public settled trade outcomes.
--
-- The browser still reads trade data from `agent_trades_public` and
-- `agent_lifetime_stats`. This table is only a sanitized wake-up signal:
-- one row per trade after it is public-safe to show as settled.

begin;

create table if not exists public.agent_trade_public_events (
  trade_id uuid primary key references public.agent_trades(id) on delete cascade,
  agent_id text not null,
  settled_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_trade_public_events_created_at_idx
  on public.agent_trade_public_events (created_at desc);

alter table public.agent_trade_public_events enable row level security;

drop policy if exists "anon can read public trade events" on public.agent_trade_public_events;
create policy "anon can read public trade events"
  on public.agent_trade_public_events
  for select
  to anon
  using (true);

revoke all on table public.agent_trade_public_events from anon, authenticated, public;
grant select on table public.agent_trade_public_events to anon;

create or replace function public.emit_agent_trade_public_settlement_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.settled_at is not null
     and new.pnl is not null
     and (
       tg_op = 'INSERT'
       or old.settled_at is distinct from new.settled_at
       or old.pnl is distinct from new.pnl
     )
  then
    insert into public.agent_trade_public_events (
      trade_id,
      agent_id,
      settled_at,
      created_at,
      updated_at
    )
    values (
      new.id,
      new.agent_id,
      new.settled_at,
      now(),
      now()
    )
    on conflict (trade_id) do update
      set agent_id = excluded.agent_id,
          settled_at = excluded.settled_at,
          updated_at = now();
  end if;

  return new;
end;
$$;

drop trigger if exists agent_trade_public_settlement_event on public.agent_trades;
create trigger agent_trade_public_settlement_event
after insert or update of settled_at, pnl on public.agent_trades
for each row
execute function public.emit_agent_trade_public_settlement_event();

insert into public.agent_trade_public_events (
  trade_id,
  agent_id,
  settled_at,
  created_at,
  updated_at
)
select id, agent_id, settled_at, now(), now()
from public.agent_trades
where settled_at is not null
  and pnl is not null
on conflict (trade_id) do update
  set agent_id = excluded.agent_id,
      settled_at = excluded.settled_at,
      updated_at = now();

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.agent_trade_public_events;
    exception
      when duplicate_object then null;
    end;
  end if;
end $$;

comment on table public.agent_trade_public_events is
  'Sanitized realtime invalidation feed for public settled trade outcomes. Contains no open trade rows.';

commit;
