-- 20260423010000_mirror_pm_bets_to_agent_trades.sql
--
-- Mirror settled pm_bets rows into agent_trades for Apex + Gale.
--
-- Brandon's direction: agent_trades is the "formal reset" table for
-- the Trading Gym. Metheus's bot already writes to it directly.
-- Apex and Gale write their canonical trades to pm_bets, and Brandon
-- wants all NEW trades going forward mirrored into agent_trades — no
-- backfill of history.
--
-- This trigger fires AFTER UPDATE/INSERT on pm_bets, filters to the
-- two bot_ids, and mirrors closed rows into agent_trades. Because it
-- only fires on future writes, it naturally honors "fresh start" — any
-- pm_bets row already in a closed status at trigger install time stays
-- out of agent_trades unless it gets UPDATEd again.
--
-- Idempotency: agent_trades.id = pm_bets.id. Duplicate fires (e.g. a
-- status flip that re-updates the same pm_bets row) hit the PK and
-- are skipped by the early-return check below.

begin;

create or replace function public.mirror_pm_bet_to_agent_trade()
returns trigger
language plpgsql
as $$
declare
  _settle_price int;
begin
  -- Apex + Gale only — Metheus writes agent_trades directly.
  if new.bot_id not in ('apex', 'gale') then
    return new;
  end if;

  -- Require pnl_cents to be known (row represents a closed outcome).
  if new.pnl_cents is null then
    return new;
  end if;

  -- Only mirror closed statuses. 'open' / 'cancelled' / 'dry_run' skipped.
  if new.status not in ('settled_win', 'settled_loss', 'exited_active', 'early_exit') then
    return new;
  end if;

  -- Idempotency guard — avoid re-insert if this pm_bet was already
  -- mirrored (happens when status flips more than once).
  if exists (select 1 from public.agent_trades where id = new.id) then
    return new;
  end if;

  -- Prefer the real fill price; otherwise derive from pnl_cents,
  -- entry_price, and direction. For YES longs settle = entry + (pnl/size).
  -- For NO longs settle = entry - (pnl/size).
  _settle_price := coalesce(
    new.exit_fill_price,
    new.exit_price,
    case
      when new.direction = 'YES'
        then new.entry_price + (new.pnl_cents::numeric / greatest(new.contracts, 1))::int
      else new.entry_price - (new.pnl_cents::numeric / greatest(new.contracts, 1))::int
    end,
    0
  );

  insert into public.agent_trades (
    id, agent_id, contract_ticker, side, entry_price, size,
    entered_at, settled_at, settle_price, pnl, move_used, created_at
  ) values (
    new.id,
    new.bot_id,
    new.ticker,
    lower(new.direction),
    coalesce(new.entry_price, 0),
    new.contracts,
    new.created_at,
    coalesce(new.settlement_time, now()),
    _settle_price,
    new.pnl_cents::numeric / 100.0,
    null,                             -- move_used: pm_bets has no clean
                                      -- single-string equivalent yet.
                                      -- Fill when a moves taxonomy lands.
    now()
  );

  return new;
end;
$$;

drop trigger if exists trg_mirror_pm_bet_to_agent_trade on public.pm_bets;

create trigger trg_mirror_pm_bet_to_agent_trade
  after insert or update on public.pm_bets
  for each row
  execute function public.mirror_pm_bet_to_agent_trade();

commit;

-- Verification (run separately):
--   select count(*) from public.agent_trades where agent_id = 'apex';
--   -- should be 0 at install; grows as Apex's review_settlements.py
--   -- UPDATEs pm_bets rows to settled_win / settled_loss.
