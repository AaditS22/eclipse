/* ============================================================
   Wellbeing quotes (section 7).

   A small tagged list of short, plain, factual reminders across
   discipline, nutrition, sleep, exercise and general wellbeing. The idea
   is behavioural: a regular, low-key reminder of a consequence (poor sleep
   dulls focus) or a benefit (a walk lifts mood) nudges better daily habits.
   Tone is motivational but never preachy.

   `dailyQuote` rotates deterministically once per calendar day, walking the
   whole list in order before any repeat (no-repeat-until-exhausted).
   ============================================================ */

export const QUOTES = [
  // ---- Discipline ----
  { category: 'Discipline', text: 'Discipline is choosing what you want most over what you want now. Small daily reps compound.' },
  { category: 'Discipline', text: 'Motivation gets you started; a routine keeps you going. Show up on the flat days too.' },
  { category: 'Discipline', text: 'You don’t have to be extreme, just consistent. A steady hour beats a rare marathon.' },
  { category: 'Discipline', text: 'Starting is the hardest rep. Give it five honest minutes and the rest usually follows.' },

  // ---- Nutrition ----
  { category: 'Nutrition', text: 'The brain runs on what you feed it. Steady meals keep focus level; skipping them invites the mid-study crash.' },
  { category: 'Nutrition', text: 'Even mild dehydration measurably slows concentration and memory. Keep water within reach.' },
  { category: 'Nutrition', text: 'A sugar spike is a loan against your afternoon — protein and whole foods pay you back with steadier energy.' },
  { category: 'Nutrition', text: 'Heavy, late meals cost you sleep quality, and poor sleep costs you tomorrow’s focus.' },

  // ---- Sleep ----
  { category: 'Sleep', text: 'Sleep is when memories consolidate. A studied topic sticks far better after a full night than after cramming.' },
  { category: 'Sleep', text: 'Every hour of sleep debt is borrowed focus. There’s no long-term way to cheat the bill.' },
  { category: 'Sleep', text: 'Screens late at night delay the sleep signal. Dim the lights an hour before bed and fall asleep faster.' },
  { category: 'Sleep', text: 'A consistent bedtime beats a long one. Your brain rewards a rhythm it can predict.' },

  // ---- Exercise ----
  { category: 'Exercise', text: 'A short walk raises blood flow to the brain and sharpens attention — a reset, not a distraction.' },
  { category: 'Exercise', text: 'Regular movement improves memory and mood as reliably as almost anything you can do for your studying.' },
  { category: 'Exercise', text: 'Sitting for hours quietly drains you. Stand and stretch every study block to keep energy up.' },
  { category: 'Exercise', text: 'Exercise is a stress valve. Twenty minutes moving can clear a fog that another hour at the desk won’t.' },

  // ---- General wellbeing ----
  { category: 'Wellbeing', text: 'Rest is part of the work. A real break restores the focus that pushing through erodes.' },
  { category: 'Wellbeing', text: 'Sunlight early in the day steadies your body clock and lifts your mood — open the curtains.' },
  { category: 'Wellbeing', text: 'Progress, not perfection. Comparing your day to your own yesterday is the only fair scoreboard.' },
  { category: 'Wellbeing', text: 'A few slow breaths genuinely lowers stress. Reset before the next block instead of carrying tension into it.' },
];

/** Whole-day index (local calendar) so the choice is stable for a given date. */
function dayNumber(date = new Date()) {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor(local.getTime() / 86400000);
}

/**
 * Deterministic quote for a calendar day. Sequential index mod length walks
 * every quote before repeating (the no-repeat-until-exhausted property).
 */
export function dailyQuote(date = new Date()) {
  const n = dayNumber(date);
  const i = ((n % QUOTES.length) + QUOTES.length) % QUOTES.length;
  return QUOTES[i];
}
