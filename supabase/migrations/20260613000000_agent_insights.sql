-- Agent insight packets.
--
-- Local agent-analysis sessions can publish sanitized evidence packets here
-- using privileged credentials. The browser reads only the public projection.
-- Raw daemon logs, local file paths, environment values, and secrets do not
-- belong in this table.

begin;

create table if not exists public.agent_insights (
  id                  uuid primary key default gen_random_uuid(),
  agent_id            text not null check (agent_id in ('apex', 'gale', 'metheus', 'bacon', 'nova', 'meridian')),
  insight_date        date,
  window_start        timestamptz,
  window_end          timestamptz,
  insight_type        text not null check (char_length(insight_type) between 1 and 80),
  claim               text not null check (char_length(claim) between 1 and 180),
  summary             text not null check (char_length(summary) between 1 and 1200),
  evidence_json       jsonb not null default '[]'::jsonb
                        check (jsonb_typeof(evidence_json) in ('array', 'object')),
  confidence          text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  sample_size         integer not null default 0 check (sample_size >= 0),
  related_trade_ids   uuid[] not null default '{}'::uuid[],
  related_signal_ids  text[] not null default '{}'::text[],
  next_rule           text not null check (char_length(next_rule) between 1 and 1200),
  source_refs         text[] not null default '{}'::text[],
  generated_by        text not null default 'agent_insight_exporter'
                        check (char_length(generated_by) between 1 and 120),
  model_id            text,
  is_published        boolean not null default true,
  expires_at          timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

create index if not exists agent_insights_agent_created_idx
  on public.agent_insights (agent_id, created_at desc);

create index if not exists agent_insights_date_idx
  on public.agent_insights (insight_date desc, agent_id);

create index if not exists agent_insights_published_idx
  on public.agent_insights (is_published, created_at desc)
  where is_published = true;

alter table public.agent_insights enable row level security;

revoke all on table public.agent_insights from anon, authenticated, public;

drop view if exists public.agent_insights_public;

create view public.agent_insights_public as
  select
    id,
    agent_id,
    insight_date,
    window_start,
    window_end,
    insight_type,
    claim,
    summary,
    evidence_json,
    confidence,
    sample_size,
    related_trade_ids,
    related_signal_ids,
    next_rule,
    source_refs,
    generated_by,
    model_id,
    created_at,
    expires_at
  from public.agent_insights
  where is_published = true
    and (insight_date is null or insight_date <= current_date)
    and (expires_at is null or expires_at > now())
  order by agent_id, created_at desc;

revoke all on table public.agent_insights_public from anon, authenticated, public;
grant select on public.agent_insights_public to anon;

comment on table public.agent_insights is
  'Privileged sanitized agent-analysis packets for Gym Live insight surfaces.';
comment on column public.agent_insights.evidence_json is
  'Sanitized evidence bullets or structured evidence. Do not store raw logs or secrets.';
comment on view public.agent_insights_public is
  'Published, non-expired agent insight packets exposed read-only to the public dashboard.';

commit;
