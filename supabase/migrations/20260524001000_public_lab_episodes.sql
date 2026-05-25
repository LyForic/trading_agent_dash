-- Public lab episodes.
--
-- A privileged sync job writes the newest short-form posts here. The browser
-- reads only the published projection, so platform tokens and draft rows never
-- leave the server boundary.

begin;

create table if not exists public.public_lab_episodes (
  id                  uuid primary key default gen_random_uuid(),
  platform            text not null check (platform in ('instagram', 'tiktok', 'youtube')),
  platform_media_id   text not null,
  title               text not null check (char_length(title) between 1 and 180),
  dek                 text check (dek is null or char_length(dek) <= 360),
  episode_url         text not null check (episode_url ~ '^https?://'),
  thumbnail_url       text check (thumbnail_url is null or thumbnail_url ~ '^https?://'),
  published_at        timestamptz not null,
  agent_id            text check (agent_id is null or agent_id in ('apex', 'gale', 'metheus', 'bacon', 'nova')),
  trade_id            text,
  source              text,
  is_published        boolean not null default true,
  metadata            jsonb not null default '{}'::jsonb,
  synced_at           timestamptz not null default now(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (platform, platform_media_id)
);

create index if not exists public_lab_episodes_published_idx
  on public.public_lab_episodes (is_published, published_at desc);

create index if not exists public_lab_episodes_agent_idx
  on public.public_lab_episodes (agent_id, published_at desc)
  where agent_id is not null;

alter table public.public_lab_episodes enable row level security;

revoke all on table public.public_lab_episodes from anon, authenticated, public;

drop view if exists public.public_lab_episodes_public;

create view public.public_lab_episodes_public as
  select
    id,
    platform,
    platform_media_id,
    title,
    dek,
    episode_url,
    thumbnail_url,
    published_at,
    agent_id,
    trade_id,
    source
  from public.public_lab_episodes
  where is_published = true
    and published_at <= now()
  order by published_at desc;

revoke all on table public.public_lab_episodes_public from anon, authenticated, public;
grant select on public.public_lab_episodes_public to anon;

comment on table public.public_lab_episodes is
  'Privileged sync-written public short-form episode feed for the Living World home card.';
comment on view public.public_lab_episodes_public is
  'Published episode rows exposed read-only to the public frontend.';
comment on column public.public_lab_episodes.trade_id is
  'Optional agent_trades id. When present, the home episode card can deep-link to the replay proof.';

commit;
