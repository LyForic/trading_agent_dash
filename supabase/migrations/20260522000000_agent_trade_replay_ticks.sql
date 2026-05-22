-- Trade replay ticks.
--
-- Base table is write-only from the public browser perspective. Trading bots
-- write rows with the service_role key while the frontend reads only the
-- delayed public view below. This mirrors the agent_trades_public boundary:
-- no live/sub-30-minute market path can leak through anon PostgREST access.

begin;

create table public.agent_trade_replay_ticks (
  id                         uuid primary key default gen_random_uuid(),
  trade_id                   uuid not null references public.agent_trades(id) on delete cascade,
  captured_at                timestamptz not null,
  btc_price_cents            bigint not null check (btc_price_cents > 0),
  strike_price_cents         bigint not null check (strike_price_cents > 0),
  kalshi_yes_price_cents     integer check (kalshi_yes_price_cents between 0 and 100),
  kalshi_no_price_cents      integer check (kalshi_no_price_cents between 0 and 100),
  source                     text not null default 'trading_bot',
  created_at                 timestamptz not null default now(),
  constraint replay_tick_has_market_price
    check (kalshi_yes_price_cents is not null or kalshi_no_price_cents is not null)
);

create unique index agent_trade_replay_ticks_trade_captured_uniq
  on public.agent_trade_replay_ticks (trade_id, captured_at);

create index agent_trade_replay_ticks_trade_time_idx
  on public.agent_trade_replay_ticks (trade_id, captured_at asc);

create index agent_trade_replay_ticks_created_at_idx
  on public.agent_trade_replay_ticks (created_at desc);

alter table public.agent_trade_replay_ticks enable row level security;

-- Browser roles get no direct table access. service_role bypasses RLS and is
-- the intended writer from trusted bot infrastructure.
revoke all on table public.agent_trade_replay_ticks from anon, authenticated, public;

create view public.agent_trade_replay_ticks_public as
  select
    tick.id,
    tick.trade_id,
    trade.agent_id,
    trade.contract_ticker,
    trade.side,
    trade.entry_price,
    trade.size,
    trade.entered_at,
    trade.settled_at,
    trade.settle_price,
    trade.pnl,
    tick.captured_at,
    tick.btc_price_cents,
    tick.strike_price_cents,
    tick.kalshi_yes_price_cents,
    tick.kalshi_no_price_cents,
    tick.source
  from public.agent_trade_replay_ticks tick
  join public.agent_trades_public trade
    on trade.id = tick.trade_id
  where trade.settled_at is not null
    and trade.settled_at <= now() - interval '30 minutes'
    and tick.captured_at <= now() - interval '30 minutes'
  order by tick.trade_id, tick.captured_at;

-- Clear default grants on the view, then grant anon SELECT only.
revoke all on table public.agent_trade_replay_ticks_public from anon, authenticated, public;
grant select on public.agent_trade_replay_ticks_public to anon;

commit;

