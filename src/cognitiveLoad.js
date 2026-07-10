/* ============================================================
   Cognitive Load (CL) — detection, scoring & suggestions.

   The insight: the SAME number of study minutes carries more
   cognitive load when it's crammed into one day (or one long
   unbroken block) than when it's spread evenly across the week.
   This module turns a week of logged sessions into a single
   transparent 0–100 score (LOW = good, well-distributed) plus
   plain-language suggestions drawn from the actual pattern.

   Pure & UI-free on purpose: everything here is a function of the
   session list, so the formula can be tuned in one place (the CL
   constants below) without touching state, XP, or any view. Unit
   tests live in cognitiveLoad.test.js.
   ============================================================ */

import { DAYS, weekStartISO, addDaysISO, fmtDuration } from './util.js';
import { XP } from './xp.js';

// ---- Tunables (change these, not the formula shape, to re-calibrate) ----
export const CL = {
  // A single day holding more than this share of the week's minutes is a
  // concentration spike (the classic "did it all Thursday" pattern).
  SINGLE_DAY_SHARE: 0.6,
  // A single contiguous block holding more than this share is a cram spike.
  SINGLE_BLOCK_SHARE: 0.5,
  // Sessions closer together than this (minutes of idle gap) count as one
  // contiguous block — a 5-min bathroom break doesn't make it "two sessions".
  BLOCK_GAP_MINUTES: 30,
  // Reference points for normalizing "badness" to 0..1. A perfectly even week
  // puts 1/7 of minutes in the busiest day; a healthy longest block is a
  // modest slice of the week. We measure how far past these you are.
  IDEAL_DAY_SHARE: 1 / 7, // ≈0.143 — even spread across all 7 days
  IDEAL_BLOCK_SHARE: 0.2, // one block being ~20% of the week is fine
  // How the two signals combine into the final score. Day-concentration is
  // weighted slightly higher because it's the dominant cram pattern.
  DAY_WEIGHT: 0.55,
  BLOCK_WEIGHT: 0.45,
  // Label thresholds on the 0–100 score.
  LOW_MAX: 33, // score ≤ 33 → "Low"
  MODERATE_MAX: 66, // 34–66 → "Moderate"; > 66 → "High"
  // Below this many weekly minutes there isn't enough signal to judge load.
  MIN_MINUTES_FOR_SCORE: 30,
};

/**
 * Summarize one calendar week (Sunday–Saturday) of study.
 * @param {Array} sessions  full session list (any range; we filter to the week)
 * @param {Date|number} refDate  any moment inside the target week
 * @returns distribution: per-day minutes, busiest day, longest contiguous block
 */
export function weeklyDistribution(sessions, refDate = new Date()) {
  const weekStart = weekStartISO(refDate);
  const weekEnd = addDaysISO(weekStart, 7);
  const startMs = new Date(weekStart + 'T00:00:00').getTime();
  const endMs = new Date(weekEnd + 'T00:00:00').getTime();

  const week = (sessions || [])
    .filter((x) => x.startTime >= startMs && x.startTime < endMs)
    .sort((a, b) => a.startTime - b.startTime);

  const perDay = new Array(7).fill(0); // index 0 = Sun … 6 = Sat
  for (const x of week) perDay[new Date(x.startTime).getDay()] += x.durationMinutes;
  const total = perDay.reduce((a, b) => a + b, 0);

  // Busiest single day.
  let maxDayIndex = 0;
  for (let i = 1; i < 7; i++) if (perDay[i] > perDay[maxDayIndex]) maxDayIndex = i;
  const maxDayMinutes = perDay[maxDayIndex];

  // Longest contiguous block: merge sessions whose idle gap is under the
  // threshold, summing *studied* minutes (not wall-clock, so gaps don't count).
  let longestBlockMinutes = 0;
  let longestBlockDayIndex = maxDayIndex;
  let blockMinutes = 0;
  let blockStart = null;
  let prevEnd = null;
  const closeBlock = () => {
    if (blockStart !== null && blockMinutes > longestBlockMinutes) {
      longestBlockMinutes = blockMinutes;
      longestBlockDayIndex = new Date(blockStart).getDay();
    }
  };
  for (const x of week) {
    const gapMin = prevEnd === null ? Infinity : (x.startTime - prevEnd) / 60000;
    if (gapMin > CL.BLOCK_GAP_MINUTES) {
      closeBlock();
      blockMinutes = 0;
      blockStart = x.startTime;
    }
    blockMinutes += x.durationMinutes;
    prevEnd = x.endTime;
  }
  closeBlock();

  return {
    weekStart,
    total,
    perDay,
    sessionCount: week.length,
    maxDayIndex,
    maxDayMinutes,
    maxDayShare: total > 0 ? maxDayMinutes / total : 0,
    longestBlockMinutes,
    longestBlockDayIndex,
    longestBlockShare: total > 0 ? longestBlockMinutes / total : 0,
  };
}

/** Map a raw share to 0..1 "badness": 0 at the ideal share, 1 when fully concentrated. */
function badness(share, ideal) {
  if (share <= ideal) return 0;
  return Math.min(1, (share - ideal) / (1 - ideal));
}

/**
 * Cognitive Load Score for a weekly distribution.
 *
 * TRANSPARENT FORMULA (easy to tune above):
 *   dayBadness   = badness(busiestDayShare, IDEAL_DAY_SHARE)   // 0=even, 1=all one day
 *   blockBadness = badness(longestBlockShare, IDEAL_BLOCK_SHARE)// 0=spread, 1=one block
 *   score = 100 × (DAY_WEIGHT·dayBadness + BLOCK_WEIGHT·blockBadness)
 *
 * LOW = 0–33, MODERATE = 34–66, HIGH = 67–100. Low is good.
 * A week under MIN_MINUTES_FOR_SCORE is reported as Low/{enough:false}
 * so we never nag someone for a light week.
 */
export function cognitiveLoadScore(dist) {
  if (!dist || dist.total < CL.MIN_MINUTES_FOR_SCORE) {
    return {
      score: 0,
      label: 'Low',
      enough: false,
      dayBadness: 0,
      blockBadness: 0,
      daySpike: false,
      blockSpike: false,
    };
  }

  const dayBadness = badness(dist.maxDayShare, CL.IDEAL_DAY_SHARE);
  const blockBadness = badness(dist.longestBlockShare, CL.IDEAL_BLOCK_SHARE);
  const score = Math.round(100 * (CL.DAY_WEIGHT * dayBadness + CL.BLOCK_WEIGHT * blockBadness));

  return {
    score,
    label: clLabel(score),
    enough: true,
    dayBadness,
    blockBadness,
    // Which specific signal(s) tripped — drives targeted suggestions.
    daySpike: dist.maxDayShare > CL.SINGLE_DAY_SHARE,
    blockSpike: dist.longestBlockShare > CL.SINGLE_BLOCK_SHARE,
  };
}

/** Plain-language band for a 0–100 score. */
export function clLabel(score) {
  if (score <= CL.LOW_MAX) return 'Low';
  if (score <= CL.MODERATE_MAX) return 'Moderate';
  return 'High';
}

/** CSS var name for a label, so UI colours stay consistent with the app. */
export function clColorVar(label) {
  if (label === 'Low') return '--green';
  if (label === 'Moderate') return '--yellow';
  return '--red';
}

const FULL_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Actionable, non-judgmental suggestions built from the *actual* pattern that
 * pushed the score up — never generic boilerplate. Returns [] for a low/quiet
 * week. Capped so the card stays short and encouraging.
 */
export function clSuggestions(dist, scored) {
  const out = [];
  if (!scored.enough) return out;

  if (scored.daySpike) {
    const pct = Math.round(dist.maxDayShare * 100);
    const day = FULL_DAYS[dist.maxDayIndex];
    out.push(
      `You did ${pct}% of this week's studying on ${day} — try splitting ${day}'s session across 2 days for an easier load.`
    );
  }

  if (scored.blockSpike) {
    out.push(
      `Your longest stretch was ${fmtDuration(dist.longestBlockMinutes)} straight — breaking sessions into 45–90 min blocks with short breaks helps it stick.`
    );
  }

  // Moderate purely from combined spread (neither single spike tripped): a
  // gentle nudge rather than a specific callout.
  if (out.length === 0 && scored.score > CL.LOW_MAX) {
    out.push(`Your studying is bunching up a little — spreading it across one or two more days will lighten the week.`);
  }

  return out.slice(0, 2);
}

/** Short label for a day index, reusing the shared abbreviations. */
export function dayLabel(index) {
  return DAYS[index];
}

/** The live CL read for the *current* (in-progress) week, ready for the UI. */
export function currentCognitiveLoad(sessions, refDate = new Date()) {
  const dist = weeklyDistribution(sessions, refDate);
  const scored = cognitiveLoadScore(dist);
  return { dist, scored, suggestions: clSuggestions(dist, scored) };
}

/**
 * Settle every fully-elapsed week since the last settlement, updating the CL
 * streak bookkeeping on `state.cl` and returning the XP earned for balanced
 * weeks. MUTATES state.cl only (XP is applied by the caller so it can fold the
 * award into a session summary). Idempotent: advancing `lastWeek` to the
 * current week guarantees each week settles exactly once.
 *
 * @returns {{ awardedXp:number, settled:Array<{weekStart,score,label,low,bonus}> }}
 */
export function settleCognitiveLoadWeeks(state, refDate = new Date()) {
  const cur = weekStartISO(refDate);
  const cl = state.cl || (state.cl = { lastWeek: null, lowStreak: 0, bestLowStreak: 0 });

  // First ever run: anchor to this week; nothing to settle retroactively.
  if (!cl.lastWeek) {
    cl.lastWeek = cur;
    return { awardedXp: 0, settled: [] };
  }

  let awardedXp = 0;
  const settled = [];
  let guard = 0;
  // Settle each completed week strictly before the current one.
  while (cl.lastWeek < cur && guard++ < 520) {
    const weekStart = cl.lastWeek;
    const dist = weeklyDistribution(state.sessions, new Date(weekStart + 'T12:00:00'));
    const scored = cognitiveLoadScore(dist);

    if (scored.enough && scored.label === 'Low') {
      cl.lowStreak = (cl.lowStreak || 0) + 1;
      awardedXp += XP.LOW_CL_WEEKLY_BONUS;
      settled.push({ weekStart, score: scored.score, label: 'Low', low: true, bonus: XP.LOW_CL_WEEKLY_BONUS });
    } else {
      // A high/moderate week — or a week too quiet to judge — ends the streak.
      cl.lowStreak = 0;
      if (dist.total > 0) settled.push({ weekStart, score: scored.score, label: scored.label, low: false, bonus: 0 });
    }
    cl.bestLowStreak = Math.max(cl.bestLowStreak || 0, cl.lowStreak);
    cl.lastWeek = addDaysISO(weekStart, 7);
  }
  cl.lastWeek = cur; // keep aligned even if a clock jump left drift

  return { awardedXp, settled };
}

// Low-CL streak milestones (weeks). Surfaced as badges via achievements.js.
export const CL_MILESTONES = [2, 4, 8];
