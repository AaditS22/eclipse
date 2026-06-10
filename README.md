# Eclipse 🌒

A gamified focus tracker with a deep-space 8-bit aesthetic. You are the astronaut. Focus is the mission.

This is the **v1 single-player core** — everything runs in the browser with `localStorage`, no backend. Social features (study rooms, friends, leaderboards) are intentionally out of scope for v1.

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
| **Study timer** (start/pause/stop, survives navigation) | `src/timerStore.js`, `src/views/timer.js` |
| **XP / levels / credits / streaks** (spec tables, daily time-XP cap, RPG curve) | `src/xp.js`, `src/session.js` |
| **Session-complete modal + XP popup + level-up confetti** | `src/views/timer.js`, `src/pixel/starfield.js` |
| **Home HUD dashboard** (Eclipse logo, goal rocket bar, daily quests, orbit teaser, weekly constellation) | `src/views/dashboard.js` |
| **Cosmetics shop** (rarity tiers, level-gated legendaries, equip) | `src/cosmetics.js`, `src/views/shop.js` |
| **Daily quests + weekly goals** (auto-rolled, reward XP, never punish) | `src/quests.js`, `src/views/quests.js` |
| **Solar-system rank** (monthly planet journey, astronaut orbit view, monthly trophies) | `src/rank.js`, `src/views/orbit.js` |
| **Stats** (subject donut, productivity heatmap, session log) + **achievements** | `src/views/stats.js`, `src/achievements.js` |
| **Pixel art** (astronaut, rocket, planets, Eclipse logo, companions) + animated star field | `src/pixel/` |

All sprites are inline SVG (one `<rect>` per pixel) or canvas — no image files. Respects `prefers-reduced-motion`.

## Design notes

- **No enforcement, no judgment.** Quests only ever reward — incomplete quests just roll over with the new day/week and never touch your streak.
- **Anti-grind cap.** Time-based XP is capped at 600/day; bonuses (streak, goal) and quest rewards are uncapped.
- **Theme/accent** is driven by the equipped Dashboard Theme cosmetic.
- Open **settings** by tapping your avatar (top-left). It includes a full reset.
- Debug from the console via `window.Eclipse`.

## Levels vs. rank

- **Levels** are lifetime and unlimited: `xpThreshold(level) = round(100 × (level−1)^1.6)`.
- **Rank** is a *monthly* journey outward through the planets (Launchpad → Mercury → … → Pluto), driven by XP earned that month (`src/rank.js`). Each month resets and the furthest planet you reached is archived as a trophy in the **Orbit** view.
