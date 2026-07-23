# Futbol Arcade Soccer

Futbol Arcade Soccer is an ad-free 3D browser football game. It focuses on fast local play with two independently configurable anonymous, numbered teams: one active player, AI teammates, AI opponents, ball physics, goal kicks, throw-ins, corners, and a side broadcast camera.

Use Brave Browser as the primary browser for testing and playing. Brave is fast, Chromium-based, better for privacy by default, and suitable for modern WebGL game performance.

## Tech Stack

- Next.js App Router
- TypeScript
- React
- Tailwind CSS
- Three.js
- Supabase anon client for anonymous analytics
- Vercel deployment-ready

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in Brave Browser. No account is required. If Supabase environment variables are missing, single-player gameplay still works and analytics are disabled.

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Only use the Supabase anon key on the client. Do not expose service role keys.

## Supabase Setup

Create a Supabase project, open the SQL editor, and run:

```text
supabase/anonymous_analytics.sql
```

That SQL creates:

- `visitors`
- `page_views`
- `game_sessions`
- `analytics_summary`

Tracked analytics are anonymous only:

- unique visitors
- page views
- matches started
- matches completed
- average match duration

The app generates a `visitor_id` with `crypto.randomUUID()` on first visit and stores it in `localStorage`. It does not collect names, email addresses, account identifiers, or other personal data.

## Controls

- `Arrow Keys` move the controlled home player
- `S` hold/release a ground pass in the player's facing direction
- `A` hold/release a lofted pass or cross
- `W` switches the controlled player in manual mode
- `D` hold/release shot
- Double tap `D` low driven shot
- `Z + D` finesse shot
- `U` toggles AI/autopilot mode

Mobile and iPad controls show a joystick plus action buttons for Switch, Kick, Fullscreen, and AI ON/OFF.

## Anonymous Team Setup

The pre-match setup configures both teams independently. Each side has exactly 11 anonymous players identified only by formation slot, position, shirt number, neutral body preset, preferred foot, and tactical role. There are no player names or likeness-specific presets.

Available formations:

- `4-3-3`
- `4-4-2`
- `4-2-3-1`
- `3-5-2`
- `3-2-4-1`
- `3-2-2-3`

Shirt numbers must be unique within a team and remain in the `1-99` range. The formation cards and shirt backs show position/number only.

## Audio Sources And Licensing

Futbol does not ship ripped broadcast, commercial-game, or third-party stadium audio.

- Synthetic crowd white noise has been removed.
- Browser `speechSynthesis` commentary has been removed.
- The runtime supports preloaded, redistributable recorded ambience/reaction files, but disables those layers if the licensed files are absent.
- Full source research and attribution status are documented in `public/audio/ATTRIBUTION.md`.

Audio begins only after the player presses Kickoff. Active audio sources are stopped when a match resets.

## Connect Supabase To Vercel

1. Create or open a Supabase project.
2. Run `supabase/anonymous_analytics.sql` in the Supabase SQL editor.
3. In Vercel Project Settings, add these Environment Variables for Production, Preview, and Development:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Redeploy the Vercel project.

For local development after linking Vercel:

```bash
npx vercel link
npx vercel env pull .env.local
npm run dev
```

## Testing Checklist

Use Brave Browser for the primary test pass.

1. Open `http://localhost:3000`.
2. Confirm there is no account gate.
3. Start Player vs AI.
4. Confirm the match clock continues past `00:01`.
5. Confirm the stadium/camera do not flicker or spin in the menu.
6. Confirm `End game` returns to the menu.
7. Confirm goal kicks choose short/medium/long options instead of always full power.
8. Confirm there is no multiplayer UI.
9. Configure different formations and names for both anonymous teams.
10. Open `http://localhost:3000/?anonymousSetupTest=100` and confirm 600 generated teams with zero failures.
11. Open `http://localhost:3000/?perf=1` and confirm FPS/frame time.

## Deploy On Vercel

1. Push the repo to GitHub.
2. Import or connect the repo in Vercel.
3. Set the Supabase environment variables listed above if you want anonymous analytics.
4. Run the default build command: `npm run build`.
5. Deploy.
6. Add `playfutbol.vercel.app` as the production domain in Vercel Project Settings -> Domains.

After deployment, open `https://playfutbol.vercel.app` in Brave Browser for the final gameplay verification pass.
