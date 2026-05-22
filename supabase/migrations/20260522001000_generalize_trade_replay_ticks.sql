-- Generalize trade replay ticks.
--
-- The first replay-ticks shape was BTC-contract specific. Keep those columns
-- compatible for any early writers, but add generic probability + underlying
-- fields so every agent/market can store replay data with the same contract.

begin;

alter table public.agent_trade_replay_ticks
  add column if not exists yes_price_cents integer,
  add column if not exists no_price_cents integer,
  add column if not exists underlying_label text,
  add column if not exists underlying_value numeric,
  add column if not exists underlying_unit text,
  add column if not exists market_status text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- The legacy BTC columns should be optional now. Generic markets may not have
-- BTC/strike data at all.
alter table public.agent_trade_replay_ticks
  alter column btc_price_cents drop not null,
  alter column strike_price_cents drop not null;

update public.agent_trade_replay_ticks
set
  yes_price_cents = coalesce(yes_price_cents, kalshi_yes_price_cents),
  no_price_cents = coalesce(no_price_cents, kalshi_no_price_cents),
  underlying_label = coalesce(
    underlying_label,
    case when btc_price_cents is not null then 'BTC' else null end
  ),
  underlying_value = coalesce(
    underlying_value,
    case when btc_price_cents is not null then btc_price_cents::numeric / 100 else null end
  ),
  underlying_unit = coalesce(
    underlying_unit,
    case when btc_price_cents is not null then 'USD' else null end
  );

alter table public.agent_trade_replay_ticks
  drop constraint if exists replay_tick_has_market_price,
  drop constraint if exists replay_tick_has_probability,
  drop constraint if exists replay_tick_yes_price_range,
  drop constraint if exists replay_tick_no_price_range,
  add constraint replay_tick_yes_price_range
    check (yes_price_cents is null or yes_price_cents between 0 and 100),
  add constraint replay_tick_no_price_range
    check (no_price_cents is null or no_price_cents between 0 and 100),
  add constraint replay_tick_has_probability
    check (
      yes_price_cents is not null
      or no_price_cents is not null
      or kalshi_yes_price_cents is not null
      or kalshi_no_price_cents is not null
    );

drop view if exists public.agent_trade_replay_ticks_public;

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
    coalesce(tick.yes_price_cents, tick.kalshi_yes_price_cents) as yes_price_cents,
    coalesce(
      tick.no_price_cents,
      tick.kalshi_no_price_cents,
      case
        when coalesce(tick.yes_price_cents, tick.kalshi_yes_price_cents) is not null
          then 100 - coalesce(tick.yes_price_cents, tick.kalshi_yes_price_cents)
        else null
      end
    ) as no_price_cents,
    tick.underlying_label,
    tick.underlying_value,
    tick.underlying_unit,
    tick.market_status,
    tick.source
  from public.agent_trade_replay_ticks tick
  join public.agent_trades_public trade
    on trade.id = tick.trade_id
  where trade.settled_at is not null
    and trade.settled_at <= now() - interval '30 minutes'
    and tick.captured_at <= now() - interval '30 minutes'
  order by tick.trade_id, tick.captured_at;

revoke all on table public.agent_trade_replay_ticks from anon, authenticated, public;
revoke all on table public.agent_trade_replay_ticks_public from anon, authenticated, public;
grant select on public.agent_trade_replay_ticks_public to anon;

comment on table public.agent_trade_replay_ticks is
  'Privileged bot-written probability ticks for replaying a trade chart after the public delay.';
comment on column public.agent_trade_replay_ticks.yes_price_cents is
  'YES-side market probability/price at captured_at, 0-100 cents.';
comment on column public.agent_trade_replay_ticks.no_price_cents is
  'NO-side market probability/price at captured_at, 0-100 cents.';
comment on column public.agent_trade_replay_ticks.underlying_label is
  'Optional underlying name, e.g. BTC, ETH, CPI, FOMC.';
comment on column public.agent_trade_replay_ticks.underlying_value is
  'Optional underlying value at captured_at, stored without display formatting.';
comment on column public.agent_trade_replay_ticks.underlying_unit is
  'Optional unit for underlying_value, e.g. USD, pct, bps.';

commit;
