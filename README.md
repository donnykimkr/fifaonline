# Futbol Arcade Soccer

Futbol Arcade Soccer is an ad-free 3D browser football game. It focuses on fast local play: one active player, AI teammates, AI opponents, ball physics, goal kicks, throw-ins, corners, and a side broadcast camera.

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

## Audio Sources And Licensing

Futbol does not ship ripped broadcast, FIFA, eFootball, or third-party stadium audio.

- Crowd ambience and match reactions are generated at runtime with the browser Web Audio API from synthesized noise and tones.
- Commentary uses original generic lines defined in the game and the browser's built-in Speech Synthesis voice.
- Source URL: none; the audio is generated locally in the browser.
- License/attribution: original project code and text, with no external audio attribution required.

Audio begins only after the player presses Kickoff. Crowd and commentary volumes are controlled separately in Formation & Match Settings, and all active audio sources are stopped when a match resets.

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
9. Open `http://localhost:3000/?perf=1` and confirm FPS/frame time.

## Deploy On Vercel

1. Push the repo to GitHub.
2. Import or connect the repo in Vercel.
3. Set the Supabase environment variables listed above if you want anonymous analytics.
4. Run the default build command: `npm run build`.
5. Deploy.
6. Add `playfutbol.vercel.app` as the production domain in Vercel Project Settings -> Domains.

After deployment, open `https://playfutbol.vercel.app` in Brave Browser for the final gameplay verification pass.
