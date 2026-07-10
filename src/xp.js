/* ============================================================
   XP / Level / Credits / Streak engine
   Implements the spec's earning tables, daily caps, and curve.
   ============================================================ */

import { dayDiff } from './util.js';

// ---- Tunables from the spec ----
export const XP = {
  PER_MINUTE: 2, // the bulk of XP — you earn by putting in real minutes
  DAILY_GOAL_BONUS: 40,
  FIRST_SESSION_BONUS: 10,
  NEW_SUBJECT_BONUS: 15,
  DAILY_TIME_CAP: 1200, // cap on time-based XP per day ≈ 10h at 2 XP/min (bonuses uncapped)
  MIN_SESSION_SECONDS: 60, // sessions shorter than this don't log
  CREDITS_PER_XP: 100, // 1 credit per 100 XP
  LOW_CL_WEEKLY_BONUS: 60, // paid once when a week is settled with a Low cognitive-load score
};

const RANKS = [
  [1, 5, 'Cadet'],
  [6, 10, 'Ensign'],
  [11, 20, 'Navigator'],
  [21, 35, 'Pilot'],
  [36, 50, 'Commander'],
  [51, 75, 'Captain'],
  [76, 100, 'Admiral'],
  [101, Infinity, 'Cosmic Legend'],
];

/** Cumulative lifetime XP required to reach a given level.
 *  threshold(1) = 0 so a fresh player is level 1. Curve: 120 * (N-1)^1.7.
 *  At 2 XP/min this means ~1 focused hour to reach level 2, scaling up. */
export function xpThreshold(level) {
  if (level <= 1) return 0;
  return Math.round(120 * Math.pow(level - 1, 1.7));
}

/** Level for a given lifetime XP total. */
export function levelForXp(xp) {
  let lvl = 1;
  while (xpThreshold(lvl + 1) <= xp) lvl++;
  return lvl;
}

export function levelName(level) {
  for (const [lo, hi, name] of RANKS) if (level >= lo && level <= hi) return name;
  return 'Cadet';
}

/** Progress within the current level → { into, need, pct }. */
export function levelProgress(xp) {
  const lvl = levelForXp(xp);
  const base = xpThreshold(lvl);
  const next = xpThreshold(lvl + 1);
  const into = xp - base;
  const need = next - base;
  return { level: lvl, into, need, pct: need > 0 ? into / need : 1 };
}

/** Streak multiplier tier (highest applicable). */
export function streakMultiplier(streak) {
  if (streak >= 30) return 2.0;
  if (streak >= 7) return 1.5;
  if (streak >= 3) return 1.25;
  return 1.0;
}

/**
 * Compute the XP breakdown for a finished session.
 * Pure: does not mutate. Caller applies the result.
 *
 * @param {object} ctx
 * @param {number} ctx.durationMinutes
 * @param {number} ctx.streak              current streak (days)
 * @param {number} ctx.timeXpAwardedToday  for the daily time-XP cap
 * @param {boolean} ctx.firstSessionToday
 * @param {boolean} ctx.isNewSubject
 * @param {boolean} ctx.goalMetNow         this session pushed daily total over goal (and not yet awarded)
 */
export function computeSessionXp(ctx) {
  const mult = streakMultiplier(ctx.streak);

  // Time-based XP (subject to daily cap + streak multiplier)
  const rawTime = XP.PER_MINUTE * ctx.durationMinutes;
  let timeXp = Math.round(rawTime * mult);
  const remainingCap = Math.max(0, XP.DAILY_TIME_CAP - ctx.timeXpAwardedToday);
  const cappedTimeXp = Math.min(timeXp, remainingCap);
  const capped = cappedTimeXp < timeXp;

  // Flat bonuses (uncapped, no multiplier)
  const bonuses = [];
  if (ctx.firstSessionToday) bonuses.push({ label: 'First Session of Day', icon: '🚀', xp: XP.FIRST_SESSION_BONUS });
  if (ctx.isNewSubject) bonuses.push({ label: 'New Subject Logged', icon: '🆕', xp: XP.NEW_SUBJECT_BONUS });
  if (ctx.goalMetNow) bonuses.push({ label: 'Daily Goal Met', icon: '🎯', xp: XP.DAILY_GOAL_BONUS });

  const bonusTotal = bonuses.reduce((s, b) => s + b.xp, 0);
  const total = cappedTimeXp + bonusTotal;

  return {
    multiplier: mult,
    rawTimeXp: rawTime,
    timeXp: cappedTimeXp,
    capped,
    bonuses,
    bonusTotal,
    total,
  };
}

/** How credits change when lifetime XP goes from `oldXp` to `newXp`.
 *  Credits accrue continuously (fractionally) so every minute counts —
 *  no more all-or-nothing jumps at the 100-XP boundary. Rounded to 2
 *  decimals to keep stored balances tidy. Shop prices stay whole. */
export function creditsGained(oldXp, newXp) {
  return Math.round(((newXp - oldXp) / XP.CREDITS_PER_XP) * 100) / 100;
}

/**
 * Update streak given the last study date and today.
 * Returns the new streak value.
 *  - same day  → unchanged
 *  - +1 day    → increment
 *  - gap > 1   → reset to 1
 *  - first ever→ 1
 */
export function nextStreak(lastStudyDateISO, todayISO, currentStreak) {
  if (!lastStudyDateISO) return 1;
  const diff = dayDiff(todayISO, lastStudyDateISO);
  if (diff === 0) return currentStreak || 1;
  if (diff === 1) return (currentStreak || 0) + 1;
  return 1; // missed a day → restart (but never resets due to a *missed schedule*, only real gaps)
}
