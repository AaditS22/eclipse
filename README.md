# Eclipse 🌒

A gamified focus tracker with a space-based them.

Everything runs in the browser; progress lives in `localStorage` and (when accounts are configured) syncs to Supabase. **Friends** adds social features — add friends by @code, live "studying now" presence, and a weekly leaderboard — backed entirely by the Supabase free tier (no dedicated server).

## Run it

```bash
npm install
npm run dev      # opens http://localhost:5180
npm run build    # production build → dist/
npm run preview  # preview the production build
```

## What's built

| Feature | Where |
|---|---|
| **Study timer** (start/stop, survives navigation) | `src/timerStore.js`, `src/views/timer.js` |
| **Weekly cognitive performance** (-10..+10 five-tier score, day-mode targets, consistency, burnout flag) | `src/cognitivePerformance.js`, `src/views/dashboard.js` |
| **Rotating wellbeing quotes** (daily discipline/nutrition/sleep/exercise reminders) | `src/quotes.js` |
| **XP / levels / credits / streaks** (spec tables, daily time-XP cap, RPG curve) | `src/xp.js`, `src/session.js` |
| **Session-complete modal + XP popup + level-up confetti** | `src/views/timer.js`, `src/pixel/starfield.js` |
| **Home HUD dashboard** (Eclipse logo, goal rocket bar, daily quests, orbit teaser, weekly constellation) | `src/views/dashboard.js` |
| **Cosmetics shop** (rarity tiers, level-gated legendaries, equip) | `src/cosmetics.js`, `src/views/shop.js` |
| **Daily quests + weekly goals** (auto-rolled, reward XP, never punish) | `src/quests.js`, `src/views/quests.js` |
| **Solar-system rank** (monthly planet journey, astronaut orbit view, monthly trophies) | `src/rank.js`, `src/views/orbit.js` |
| **Stats** (subject donut, productivity heatmap, session log) + **achievements** | `src/views/stats.js`, `src/achievements.js` |
| **Pixel art** (astronaut, rocket, planets, Eclipse logo, companions) + animated star field | `src/pixel/` |
| **Friends** (add by @code, live studying-now presence, weekly leaderboard, ghost/hide-subject privacy) | `src/social.js`, `src/views/social.js` |

## Friends / social setup

The Friends feature needs cloud accounts (Supabase) configured via `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Without them the app runs local-only and the Friends tab is hidden.

To enable it, run [`db/social.sql`](db/social.sql) once in the Supabase **SQL Editor** (Dashboard → SQL Editor → paste → Run). It's idempotent and creates:

- `profiles` — a public, queryable slice of each player (name, @code, level, avatar, weekly totals), mirrored from local state on save. The private game blob stays in `saves`.
- `friendships` — request / accept / remove, one row per pair.
- `presence` — who's studying now; written only on timer start/stop (elapsed time is derived client-side, so no heartbeat writes).

All three are protected by Row Level Security: presence and the full profile are readable **only by accepted friends**; a thin profile slice is readable by any signed-in user so friend search works. Presence is streamed over Supabase Realtime, which respects the same RLS.

All sprites are inline SVG (one `<rect>` per pixel) or canvas — no image files. Respects `prefers-reduced-motion`.

## Design notes

- **No enforcement** Quests only ever reward, incomplete quests just roll over with the new day/week and never touch your streak.
- **Anti-grind cap.** Time-based XP is capped; bonuses (streak, goal) and quest rewards are uncapped.
- **Theme/accent** is driven by the equipped Dashboard Theme cosmetic.
- Open **settings** by tapping your avatar (top-left). It includes a full reset.
- Debug from the console via `window.Eclipse`.

## Levels vs. rank

- **Levels** are lifetime and unlimited: `xpThreshold(level) = round(100 × (level−1)^1.6)`.
- **Rank** is a *monthly* journey outward through the planets (Launchpad → Mercury → … → Pluto), driven by XP earned that month (`src/rank.js`). Each month resets and the furthest planet you reached is archived as a trophy in the **Orbit** view.

## Disclaimer

This project was built almost entirely through AI-assisted development (using Claude Code), as an experiment in how far that approach can take a real, polished app. I designed the concept, features and game mechanics, directed the implementation, and used it day-to-day to refine it.
