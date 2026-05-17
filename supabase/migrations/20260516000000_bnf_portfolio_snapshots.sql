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
-- Include the PUBLIC role: Supabase default-privilege grants land on PUBLIC,
-- not just anon/authenticated. RLS + zero grants ⇒ no access. service_role bypasses RLS.
revoke all on table public.bnf_portfolio_snapshots from anon, authenticated, public;

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

-- The view runs as owner (security_invoker=false) so base-table RLS does NOT
-- gate it, and a simple view can be auto-updatable. Clear all default-privilege
-- grants on the view (incl. PUBLIC) BEFORE granting, so anon/authenticated/public
-- cannot UPDATE/DELETE through it — only anon SELECT.
revoke all on table public.v_bnf_portfolio from anon, authenticated, public;
grant select on public.v_bnf_portfolio to anon;

commit;
