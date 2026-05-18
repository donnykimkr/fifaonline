create table if not exists friend_nicknames (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  friend_id uuid references profiles(id) on delete cascade,
  nickname text,
  created_at timestamptz default now(),
  unique(user_id, friend_id)
);

alter table friend_nicknames enable row level security;

drop policy if exists "users can read own friend nicknames" on friend_nicknames;
create policy "users can read own friend nicknames"
on friend_nicknames
for select
using (auth.uid() = user_id);

drop policy if exists "users can insert own friend nicknames" on friend_nicknames;
create policy "users can insert own friend nicknames"
on friend_nicknames
for insert
with check (auth.uid() = user_id);

drop policy if exists "users can update own friend nicknames" on friend_nicknames;
create policy "users can update own friend nicknames"
on friend_nicknames
for update
using (auth.uid() = user_id);

drop policy if exists "users can delete own friend nicknames" on friend_nicknames;
create policy "users can delete own friend nicknames"
on friend_nicknames
for delete
using (auth.uid() = user_id);
