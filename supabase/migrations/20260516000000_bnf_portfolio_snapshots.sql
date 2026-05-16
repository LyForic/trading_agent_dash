-- BNF portfolio snapshots — hourly combined cleared Kalshi value for the gym.
-- Spec: vault 500-Projects/lyforic/trading-gym/2026-05-16-bnf-portfolio-snapshots-design.md
-- Pattern mirrors 20260426000000_track_b_views.sql (begin/commit, delayed anon view).

begin;

create table public.bnf_portfolio_snapshots (
  id                      uuid primary key default gen_random_uuid(),
  captured_at             timestamptz not null default now(),
  captured_hour_utc       timestamptz not null,
  brandon_cleared_cents   bigint  not null,
  justin_cleared_cents    bigint  not null,
  combined_cleared_cents  bigint  not null
    generated always as (brandon_cleared_cents + justin_cleared_cents) stored,
  brandon_baseline_cents  bigint  not null,
  justin_baseline_cents   bigint  not null,
  combined_baseline_cents bigint  not null
    generated always as (brandon_baseline_cents + justin_baseline_cents) stored,
  brandon_source          text    not null check (brandon_source in ('kalshi','reconstructed')),
  justin_source           text    not null check (justin_source  in ('kalshi','reconstructed')),
  is_partial              boolean not null default false,
  created_at              timestamptz not null default now()
);

-- Unique on a PHYSICAL column (immutable). NOT date_trunc() on timestamptz.
create unique index bnf_portfolio_snapshots_hour_uniq
  on public.bnf_portfolio_snapshots (captured_hour_utc);
create index bnf_portfolio_snapshots_captured_at_idx
  on public.bnf_portfolio_snapshots (captured_at desc);

alter table public.bnf_portfolio_snapshots enable row level security;
revoke all on table public.bnf_portfolio_snapshots from anon, authenticated;
-- No anon/authenticated RLS policy ⇒ no access. service_role bypasses RLS.

create view public.v_bnf_portfolio as
  select captured_at,
         combined_cleared_cents,
         combined_baseline_cents,
         brandon_source,
         justin_source,
         is_partial,
         round((combined_cleared_cents::numeric
                / nullif(combined_baseline_cents, 0) - 1) * 100, 2) as pct_vs_baseline
  from public.bnf_portfolio_snapshots
  where captured_at <= now() - interval '30 minutes'
  order by captured_at;

grant select on public.v_bnf_portfolio to anon;

commit;
