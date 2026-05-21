# Skyline Dash

Skyline Dash is an ad-free 3D arcade soccer game for the browser. You control one active player while AI teammates and opponents play around you. It supports Player vs AI Team, local 1v1 Team Mode, Google login through Supabase Auth, and an optional online leaderboard.

Use Brave Browser as the primary browser for testing and playing. Brave is fast, Chromium-based, better for privacy by default, and suitable for modern WebGL game performance.

## Tech Stack

- Next.js App Router
- TypeScript
- React
- Tailwind CSS
- Three.js
- Supabase Auth and leaderboard with graceful local fallback
- Vercel deployment-ready

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in Brave Browser.

Supabase is optional for local play. If `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` is missing, matches still work and online login/leaderboard saving are disabled.

## Controls

Player 1:

- `WASD` moves the cyan player
- `Space` passes, shoots, or tackles near the ball
- `Left Shift` sprints

Player 2 in Local 1v1 Team Mode:

- `Arrow Keys` move the rose player
- `Enter` or `Right Shift` passes, shoots, or tackles near the ball
- `/` or `Right Ctrl` sprints

## Environment Variables

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Then fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Only use the Supabase anon key on the client. Do not expose service role keys.

## Supabase Setup

Create a Supabase project, open the SQL editor, and run the SQL below. The same SQL is saved in `supabase/leaderboard.sql`.

```sql
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
```

The app validates nicknames as 2-16 characters and only submits positive integer scores. Guests can play, but only authenticated users can upload online scores.

## Google OAuth Setup

1. In Supabase, go to Authentication -> Providers.
2. Enable Google.
3. Create OAuth credentials in Google Cloud Console.
4. Add the Google Client ID and Client Secret to the Supabase Google provider.
5. In Supabase Authentication -> URL Configuration, set:
   - Site URL for local testing: `http://localhost:3000`
   - Site URL for production: `https://skyline-dash.vercel.app`
   - Redirect URLs:
     - `http://localhost:3000`
     - `http://localhost:3000/**`
     - `https://skyline-dash.vercel.app`
     - `https://skyline-dash.vercel.app/**`

If you deploy to a different Vercel domain, add that exact domain and wildcard redirect URL too.

## Connect Supabase To Vercel

1. Push this repo to GitHub.
2. Create or open a Supabase project and run `supabase/leaderboard.sql`.
3. Enable Google OAuth in Supabase and add the Vercel/local redirect URLs.
4. In Vercel, import the GitHub repo as a new project.
5. Add these Environment Variables in Vercel Project Settings for Production, Preview, and Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
6. Deploy.

If you use the Supabase integration from Vercel Marketplace, Supabase can synchronize environment variables to Vercel for connected projects. Confirm the public client variables above exist with the `NEXT_PUBLIC_` prefix.

For local development after linking Vercel:

```bash
npx vercel link
npx vercel env pull .env.local
npm run dev
```

## Testing Checklist

Use Brave Browser for the primary test pass.

1. Open `http://localhost:3000` in Brave Browser.
2. Test Player vs AI Team: kickoff, movement, shooting, scoring, kickoff reset, timer, and end screen.
3. Test Local 1v1 Team Mode: Player 1 and Player 2 movement, action buttons, scoring, and timer.
4. Confirm Guest mode can play without crashing and cannot upload an online score.
5. Sign in with Google through Supabase Auth.
6. Confirm the signed-in display name or email appears.
7. Save a Player vs AI score and confirm it appears in the leaderboard.
8. Use the logout button and confirm the UI returns to Guest mode.

## Deploy On Vercel

1. Push to GitHub.
2. Import the repo in Vercel.
3. Set the Supabase environment variables listed above.
4. Run the default build command: `npm run build`.
5. Deploy the app.

Vercel detects Next.js automatically. This repo also includes `vercel.json` with the Next.js framework setting.

After deployment, open the production URL in Brave Browser for the final gameplay and login verification pass.
