create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(trim(username)) between 2 and 16),
  game_id text not null unique check (game_id ~ '^FO-[A-Z0-9]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_key text not null,
  team_name text not null,
  primary_color text not null,
  secondary_color text not null,
  accent_color text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.squads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  player_key text not null,
  name text not null check (char_length(trim(name)) between 1 and 32),
  jersey_number integer not null check (jersey_number between 1 and 99),
  position text not null check (char_length(trim(position)) between 1 and 8),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, player_key)
);

create table if not exists public.formations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (name in ('4-2-3-1', '4-3-3', '4-4-2', '3-5-2')),
  slot_assignments jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.match_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'canceled')),
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user)
);

alter table public.match_requests
add column if not exists message text;

alter table public.match_requests
add column if not exists responded_at timestamptz;

create index if not exists match_requests_to_user_idx on public.match_requests (to_user, status, created_at desc);
create index if not exists match_requests_from_user_idx on public.match_requests (from_user, status, created_at desc);

create table if not exists public.online_matches (
  id uuid primary key default gen_random_uuid(),
  home_user uuid not null references auth.users(id) on delete cascade,
  away_user uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'finished', 'abandoned')),
  state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (home_user <> away_user)
);

create index if not exists online_matches_home_user_idx on public.online_matches (home_user, status, created_at desc);
create index if not exists online_matches_away_user_idx on public.online_matches (away_user, status, created_at desc);

create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.online_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_side text not null check (team_side in ('home', 'away')),
  ready boolean not null default false,
  input_state jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (match_id, user_id)
);

create table if not exists public.match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.online_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists teams_touch_updated_at on public.teams;
create trigger teams_touch_updated_at before update on public.teams
for each row execute function public.touch_updated_at();

drop trigger if exists squads_touch_updated_at on public.squads;
create trigger squads_touch_updated_at before update on public.squads
for each row execute function public.touch_updated_at();

drop trigger if exists formations_touch_updated_at on public.formations;
create trigger formations_touch_updated_at before update on public.formations
for each row execute function public.touch_updated_at();

drop trigger if exists online_matches_touch_updated_at on public.online_matches;
create trigger online_matches_touch_updated_at before update on public.online_matches
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.squads enable row level security;
alter table public.formations enable row level security;
alter table public.match_requests enable row level security;
alter table public.online_matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_events enable row level security;

drop policy if exists "Authenticated users can read profiles" on public.profiles;
create policy "Authenticated users can read profiles"
on public.profiles for select
to authenticated
using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Users can manage own team" on public.teams;
create policy "Users can manage own team"
on public.teams for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own squad" on public.squads;
create policy "Users can manage own squad"
on public.squads for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can manage own formations" on public.formations;
create policy "Users can manage own formations"
on public.formations for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Request participants can read requests" on public.match_requests;
create policy "Request participants can read requests"
on public.match_requests for select
to authenticated
using (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "Users can send match requests" on public.match_requests;
create policy "Users can send match requests"
on public.match_requests for insert
to authenticated
with check (auth.uid() = from_user and status = 'pending');

drop policy if exists "Participants can update match requests" on public.match_requests;
create policy "Participants can update match requests"
on public.match_requests for update
to authenticated
using (auth.uid() = from_user or auth.uid() = to_user)
with check (auth.uid() = from_user or auth.uid() = to_user);

drop policy if exists "Match participants can read online matches" on public.online_matches;
create policy "Match participants can read online matches"
on public.online_matches for select
to authenticated
using (auth.uid() = home_user or auth.uid() = away_user);

drop policy if exists "Participants can create online matches" on public.online_matches;
create policy "Participants can create online matches"
on public.online_matches for insert
to authenticated
with check (auth.uid() = home_user or auth.uid() = away_user);

drop policy if exists "Participants can update online matches" on public.online_matches;
create policy "Participants can update online matches"
on public.online_matches for update
to authenticated
using (auth.uid() = home_user or auth.uid() = away_user)
with check (auth.uid() = home_user or auth.uid() = away_user);

drop policy if exists "Participants can read match players" on public.match_players;
create policy "Participants can read match players"
on public.match_players for select
to authenticated
using (
  exists (
    select 1 from public.online_matches m
    where m.id = match_players.match_id
      and (m.home_user = auth.uid() or m.away_user = auth.uid())
  )
);

drop policy if exists "Users can upsert own match player row" on public.match_players;
create policy "Users can upsert own match player row"
on public.match_players for all
to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.online_matches m
    where m.id = match_players.match_id
      and (m.home_user = auth.uid() or m.away_user = auth.uid())
  )
);

drop policy if exists "Participants can create both match player rows" on public.match_players;
create policy "Participants can create both match player rows"
on public.match_players for insert
to authenticated
with check (
  exists (
    select 1 from public.online_matches m
    where m.id = match_players.match_id
      and (m.home_user = auth.uid() or m.away_user = auth.uid())
      and (match_players.user_id = m.home_user or match_players.user_id = m.away_user)
  )
);

drop policy if exists "Participants can read match events" on public.match_events;
create policy "Participants can read match events"
on public.match_events for select
to authenticated
using (
  exists (
    select 1 from public.online_matches m
    where m.id = match_events.match_id
      and (m.home_user = auth.uid() or m.away_user = auth.uid())
  )
);

drop policy if exists "Participants can write own match events" on public.match_events;
create policy "Participants can write own match events"
on public.match_events for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.online_matches m
    where m.id = match_events.match_id
      and (m.home_user = auth.uid() or m.away_user = auth.uid())
  )
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_requests') then
    alter publication supabase_realtime add table public.match_requests;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'online_matches') then
    alter publication supabase_realtime add table public.online_matches;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_players') then
    alter publication supabase_realtime add table public.match_players;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_events') then
    alter publication supabase_realtime add table public.match_events;
  end if;
end;
$$;
