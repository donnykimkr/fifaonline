create table if not exists public.community_votes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.community_posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  vote_type text check (vote_type in ('up', 'down')),
  created_at timestamptz default now(),
  unique(post_id, user_id)
);

alter table public.community_votes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_votes'
      and policyname = 'community votes readable'
  ) then
    create policy "community votes readable"
    on public.community_votes
    for select
    using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_votes'
      and policyname = 'authenticated users can vote'
  ) then
    create policy "authenticated users can vote"
    on public.community_votes
    for insert
    with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_votes'
      and policyname = 'users can update own votes'
  ) then
    create policy "users can update own votes"
    on public.community_votes
    for update
    using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_votes'
      and policyname = 'users can delete own votes'
  ) then
    create policy "users can delete own votes"
    on public.community_votes
    for delete
    using (auth.uid() = user_id);
  end if;
end $$;

notify pgrst, 'reload schema';
