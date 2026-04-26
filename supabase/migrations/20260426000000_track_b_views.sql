-- Track B migration 1a — create public delay-gated view + lifetime aggregate view.
-- Companion migration 1b (revoke base-table anon SELECT) ships AFTER the existing
-- leaderboard Edge Function is repointed at agent_trades_public, to avoid a
-- broken-Function window. Order: deploy 1a → deploy Edge Function update → deploy 1b.

-- 30-min-delayed projection of agent_trades for public/anon consumption.
create view agent_trades_public as
select id, agent_id, contract_ticker, side, entry_price, size,
       entered_at, settled_at, settle_price, pnl, move_used, created_at
from agent_trades
where entered_at <= now() - interval '30 minutes'
  and (settled_at is null or settled_at <= now() - interval '30 minutes');

grant select on agent_trades_public to anon;

-- Per-agent lifetime aggregates. Built ON the public view so the 30-min delay
-- floor applies to the rollup. Groups by agent_id; emits NO row for an agent
-- with zero rows in agent_trades_public — client must handle missing-row case.
create view agent_lifetime_stats as
select
  agent_id,
  count(*) filter (where pnl is not null)        as settled,
  count(*) filter (where pnl > 0)                as wins,
  count(*) filter (where pnl < 0)                as losses,
  count(*) filter (where pnl = 0)                as breakeven,
  coalesce(sum(pnl) filter (where pnl is not null), 0) as total_pnl,
  count(*) filter (where settled_at is null and pnl is null) as open_count
from agent_trades_public
group by agent_id;

grant select on agent_lifetime_stats to anon;
