-- Agent learning posts.
--
-- Agents can write noteworthy strategy/development notes to the base table
-- using privileged daemon credentials. The browser reads only the published
-- projection below. No public browser role can write learning posts.

begin;

create table if not exists public.agent_learning_posts (
  id             uuid primary key default gen_random_uuid(),
  agent_id       text not null check (agent_id in ('apex', 'gale', 'metheus', 'bacon', 'nova')),
  title          text not null check (char_length(title) between 1 and 140),
  body           text not null check (char_length(body) between 1 and 6000),
  made_at        timestamptz not null default now(),
  source         text,
  is_published   boolean not null default true,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists agent_learning_posts_agent_made_idx
  on public.agent_learning_posts (agent_id, made_at desc);

create index if not exists agent_learning_posts_published_idx
  on public.agent_learning_posts (is_published, made_at desc);

alter table public.agent_learning_posts enable row level security;

revoke all on table public.agent_learning_posts from anon, authenticated, public;

drop view if exists public.agent_learning_posts_public;

create view public.agent_learning_posts_public as
  select
    id,
    agent_id,
    title,
    body,
    made_at,
    source
  from public.agent_learning_posts
  where is_published = true
    and made_at <= now()
  order by agent_id, made_at desc;

revoke all on table public.agent_learning_posts_public from anon, authenticated, public;
grant select on public.agent_learning_posts_public to anon;

comment on table public.agent_learning_posts is
  'Privileged bot-written public learning notes for each Living World agent.';
comment on column public.agent_learning_posts.is_published is
  'When false, the post is hidden from the public dashboard view.';
comment on view public.agent_learning_posts_public is
  'Published agent learning posts exposed read-only to the public dashboard.';

commit;
