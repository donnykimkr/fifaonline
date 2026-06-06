create extension if not exists pgcrypto;

create table if not exists leaderboard (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null,
  score integer not null,
  goals_scored integer not null default 0,
  result text not null default 'draw',
  gems integer not null default 0,
  level integer not null default 1,
  created_at timestamptz default now(),
  constraint leaderboard_nickname_length check (char_length(nickname) between 2 and 16),
  constraint leaderboard_positive_score check (score > 0),
  constraint leaderboard_nonnegative_goals check (goals_scored >= 0),
  constraint leaderboard_valid_result check (result in ('win', 'lose', 'draw')),
  constraint leaderboard_nonnegative_gems check (gems >= 0),
  constraint leaderboard_positive_level check (level > 0)
);

alter table leaderboard
add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table leaderboard
add column if not exists goals_scored integer not null default 0;

alter table leaderboard
add column if not exists result text not null default 'draw';

alter table leaderboard
drop constraint if exists leaderboard_nonnegative_goals;

alter table leaderboard
add constraint leaderboard_nonnegative_goals check (goals_scored >= 0);

alter table leaderboard
drop constraint if exists leaderboard_valid_result;

alter table leaderboard
add constraint leaderboard_valid_result check (result in ('win', 'lose', 'draw'));

alter table leaderboard enable row level security;

drop policy if exists "Anyone can read leaderboard" on leaderboard;
create policy "Anyone can read leaderboard"
on leaderboard
for select
using (true);

drop policy if exists "Anyone can submit leaderboard scores" on leaderboard;
drop policy if exists "Authenticated users can submit their own scores" on leaderboard;
create policy "Authenticated users can submit their own scores"
on leaderboard
for insert
to authenticated
with check (
  auth.uid() is not null
  and user_id = auth.uid()
  and char_length(nickname) between 2 and 16
  and score > 0
  and goals_scored >= 0
  and result in ('win', 'lose', 'draw')
  and gems >= 0
  and level > 0
);

create index if not exists leaderboard_score_idx
on leaderboard (score desc, created_at asc);
