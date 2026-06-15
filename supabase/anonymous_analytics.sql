create extension if not exists pgcrypto;

create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  visitor_id text unique not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists public.page_views (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null references public.visitors(visitor_id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  visitor_id text not null references public.visitors(visitor_id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  goals_scored integer not null,
  goals_conceded integer not null,
  duration_seconds integer not null
);

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text unique not null,
  host_visitor_id text not null,
  guest_visitor_id text,
  status text not null default 'waiting' check (status in ('waiting', 'ready', 'active', 'ended')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rooms drop constraint if exists rooms_host_visitor_id_fkey;
alter table public.rooms drop constraint if exists rooms_guest_visitor_id_fkey;

create or replace function public.touch_room_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists rooms_touch_updated_at on public.rooms;
create trigger rooms_touch_updated_at
before update on public.rooms
for each row execute function public.touch_room_updated_at();

create index if not exists visitors_visitor_id_idx on public.visitors(visitor_id);
create index if not exists page_views_visitor_id_created_idx on public.page_views(visitor_id, created_at desc);
create index if not exists game_sessions_visitor_id_started_idx on public.game_sessions(visitor_id, started_at desc);
create index if not exists rooms_room_code_idx on public.rooms(room_code);

alter table public.visitors enable row level security;
alter table public.page_views enable row level security;
alter table public.game_sessions enable row level security;
alter table public.rooms enable row level security;

drop policy if exists "anonymous visitors can upsert visitor rows" on public.visitors;
create policy "anonymous visitors can upsert visitor rows"
on public.visitors
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "anonymous page view inserts" on public.page_views;
create policy "anonymous page view inserts"
on public.page_views
for insert
to anon, authenticated
with check (char_length(path) between 1 and 300);

drop policy if exists "anonymous game session writes" on public.game_sessions;
create policy "anonymous game session writes"
on public.game_sessions
for all
to anon, authenticated
using (true)
with check (goals_scored >= 0 and goals_conceded >= 0 and duration_seconds >= 0);

drop policy if exists "anonymous room code access" on public.rooms;
create policy "anonymous room code access"
on public.rooms
for all
to anon, authenticated
using (true)
with check (
  room_code ~ '^[0-9]{4}$'
  and status in ('waiting', 'ready', 'active', 'ended')
);

create or replace view public.analytics_summary as
select
  (select count(*) from public.visitors) as unique_visitors,
  (select count(*) from public.page_views) as page_views,
  (select count(*) from public.game_sessions) as matches_started,
  (select count(*) from public.game_sessions where ended_at is not null) as matches_completed,
  (select round(avg(duration_seconds)) from public.game_sessions where ended_at is not null and duration_seconds > 0) as average_match_duration_seconds;

do $$
begin
  alter publication supabase_realtime add table public.rooms;
exception
  when duplicate_object then null;
end $$;

notify pgrst, 'reload schema';
