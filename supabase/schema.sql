create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key,
  username text unique,
  avatar_url text,
  is_admin boolean default false,
  language text default 'en',
  home_country_code text,
  friend_code text not null unique,
  constraint profiles_id_fkey foreign key (id) references auth.users(id) on delete cascade
);

create table if not exists public.visited_countries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  country_code text not null,
  created_at timestamptz not null default now(),
  unique (user_id, country_code),
  constraint visited_countries_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

create table if not exists public.friends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  friend_id uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, friend_id),
  check (user_id <> friend_id),
  constraint friends_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  constraint friends_friend_id_fkey foreign key (friend_id) references public.profiles(id) on delete cascade
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  country_code text not null,
  created_at timestamptz not null default now(),
  constraint activities_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

create table if not exists public.landmark_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  landmark_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, landmark_id),
  constraint landmark_visits_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  image_url text,
  created_at timestamptz default now()
);

create table if not exists public.community_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz default now()
);

create table if not exists public.community_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  vote_type text check (vote_type in ('up', 'down')),
  created_at timestamptz default now(),
  unique(post_id, user_id)
);

alter table public.profiles enable row level security;
alter table public.visited_countries enable row level security;
alter table public.friends enable row level security;
alter table public.activities enable row level security;
alter table public.landmark_visits enable row level security;
alter table public.community_posts enable row level security;
alter table public.community_replies enable row level security;
alter table public.community_votes enable row level security;

create policy "Authenticated users can read profiles"
  on public.profiles for select
  to authenticated
  using (true);

create policy "Users can create their profile"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "Users can update their profile"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "Authenticated users can read visits"
  on public.visited_countries for select
  to authenticated
  using (true);

create policy "Users can insert own visits"
  on public.visited_countries for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own visits"
  on public.visited_countries for delete
  to authenticated
  using (user_id = auth.uid());

create policy "Users can read own friend links"
  on public.friends for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can add own friend links"
  on public.friends for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can remove own friend links"
  on public.friends for delete
  to authenticated
  using (user_id = auth.uid());

create policy "Authenticated users can read activities"
  on public.activities for select
  to authenticated
  using (true);

create policy "Users can insert own activities"
  on public.activities for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Authenticated users can read landmark visits"
  on public.landmark_visits for select
  to authenticated
  using (true);

create policy "Users can insert own landmark visits"
  on public.landmark_visits for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can delete own landmark visits"
  on public.landmark_visits for delete
  to authenticated
  using (user_id = auth.uid());

create policy "community posts readable"
  on public.community_posts for select
  using (true);

create policy "authenticated users can create posts"
  on public.community_posts for insert
  with check (auth.uid() = user_id);

create policy "users can update own posts"
  on public.community_posts for update
  using (auth.uid() = user_id);

create policy "users can delete own posts"
  on public.community_posts for delete
  using (auth.uid() = user_id);

create policy "community replies readable"
  on public.community_replies for select
  using (true);

create policy "authenticated users can create replies"
  on public.community_replies for insert
  with check (auth.uid() = user_id);

create policy "users can update own replies"
  on public.community_replies for update
  using (auth.uid() = user_id);

create policy "users can delete own replies"
  on public.community_replies for delete
  using (auth.uid() = user_id);

create policy "community votes readable"
  on public.community_votes for select
  using (true);

create policy "authenticated users can vote"
  on public.community_votes for insert
  with check (auth.uid() = user_id);

create policy "users can update own votes"
  on public.community_votes for update
  using (auth.uid() = user_id);

create policy "users can delete own votes"
  on public.community_votes for delete
  using (auth.uid() = user_id);
