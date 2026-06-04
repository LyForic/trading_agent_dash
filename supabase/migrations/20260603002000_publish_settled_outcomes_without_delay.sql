-- Publish settled outcomes without the prior 30-minute delay.
--
-- Finalized trades cannot be copied. Keep the delay boundary only for
-- non-final/open entries so public anon clients cannot see active positions
-- as they are opened.

begin;

create or replace view public.agent_trades_public as
select id, agent_id, contract_ticker, side, entry_price, size,
       entered_at, settled_at, settle_price, pnl, move_used, created_at
from public.agent_trades
where (
    settled_at is not null
    and pnl is not null
  )
  or (
    settled_at is null
    and pnl is null
    and entered_at <= now() - interval '30 minutes'
  );

create or replace view public.agent_trade_replay_ticks_public as
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
  order by tick.trade_id, tick.captured_at;

create or replace view public.v_bnf_portfolio as
  select captured_at,
         combined_cleared_cents,
         combined_portfolio_value_cents,
         combined_baseline_cents,
         brandon_source,
         justin_source,
         bacon_source,
         is_partial,
         round((combined_cleared_cents::numeric
                / nullif(combined_baseline_cents, 0) - 1) * 100, 2) as pct_vs_baseline,
         round((combined_portfolio_value_cents::numeric
                / nullif(combined_baseline_cents, 0) - 1) * 100, 2) as portfolio_pct_vs_baseline
  from public.bnf_portfolio_snapshots
  order by captured_at;

revoke all on table public.agent_trades_public from anon, authenticated, public;
revoke all on table public.agent_trade_replay_ticks_public from anon, authenticated, public;
revoke all on table public.v_bnf_portfolio from anon, authenticated, public;
grant select on table public.agent_trades_public to anon;
grant select on table public.agent_trade_replay_ticks_public to anon;
grant select on table public.v_bnf_portfolio to anon;

comment on view public.agent_trades_public is
  'Public trade projection: settled outcomes are visible immediately; open/non-final entries remain hidden until 30 minutes after entry.';
comment on view public.agent_trade_replay_ticks_public is
  'Public replay projection for already-settled trades.';
comment on view public.v_bnf_portfolio is
  'Public account snapshot series for the Gym public account.';

commit;
