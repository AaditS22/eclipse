/* ============================================================
   Cognitive Performance (CP) — weekly study-efficiency score.

   WHY WEEKLY, NOT DAILY (section 2):
   Study sessions naturally bunch into the evenings / early mornings left
   free around a lecture timetable. If that pattern *repeats consistently*
   it isn't hurting the person — the body adapts and those windows become
   the productive ones. So we score the SHAPE OF THE WHOLE WEEK, and never
   flag a single day as "overloaded". A steady weekly rhythm is the goal.

   The week is reduced to a single score on a fixed -10..+10 scale, built
   from two inputs:
     1. adherence  — how close the week's study time is to the mode's target
     2. consistency — how regular session lengths / start-times were

   +10 is the ceiling of the entire system: the most efficient (right on
   target) and most consistent week possible. The score maps to one of five
   named tiers (see CP_TIERS). Everything is a pure function of the session
   list + the selected day-mode, so the formula tunes in one place (the CP
   and CP_TIERS constants) without touching state, XP or any view.

   Unit tests live in cognitivePerformance.test.js.
   ============================================================ */

import { weekStartISO, addDaysISO, minutesOfDay, clamp } from './util.js';
import { XP } from './xp.js';

/* ------------------------------------------------------------
   Day-type modes (section 3). Each mode carries its own optimal
   DAILY study target; the weekly target is just their sum. These are
   the baseline reference values the score compares actual time against.
   ------------------------------------------------------------ */
export const DAY_MODES = {
  lecture: {
    key: 'lecture',
    label: 'Lecture week',
    short: 'Lecture',
    // A lecture day peaks around 4h of extra study; weekends have no lecture
    // time to compete, so the healthy ceiling rises to ~8h.
    weekdayTarget: 240,
    weekendTarget: 480,
  },
  white: {
    key: 'white',
    label: 'White week',
    short: 'White',
    // No lectures (exam prep, revision) — the whole day is available.
    dailyTarget: 600,
  },
  holidays: {
    key: 'holidays',
    label: 'Holidays',
    short: 'Holiday',
    // Studying where you'd normally relax: a lighter 5h/day target, but MEETING
    // it takes extra discipline, so it earns a bonus (HOLIDAY_DISCIPLINE_BONUS).
    dailyTarget: 300,
  },
};

export const DEFAULT_DAY_MODE = 'lecture';
export const DAY_MODE_ORDER = ['lecture', 'white', 'holidays'];

/** The active day-mode key for a state, defaulting safely. */
export function dayModeOf(state) {
  const m = state?.settings?.dayMode;
  return DAY_MODES[m] ? m : DEFAULT_DAY_MODE;
}

/** Per-day target minutes for a mode. Index 0=Sun … 6=Sat (matches getDay). */
function dailyTargets(modeKey) {
  const mode = DAY_MODES[modeKey] || DAY_MODES[DEFAULT_DAY_MODE];
  const out = new Array(7);
  for (let i = 0; i < 7; i++) {
    if (mode.key === 'lecture') {
      const weekend = i === 0 || i === 6; // Sun / Sat
      out[i] = weekend ? mode.weekendTarget : mode.weekdayTarget;
    } else {
      out[i] = mode.dailyTarget;
    }
  }
  return out;
}

/** Weekly target minutes for a mode (sum of its daily targets). */
export function weeklyTargetMinutes(modeKey) {
  return dailyTargets(modeKey).reduce((a, b) => a + b, 0);
}

/* ------------------------------------------------------------
   Tunables — change these, not the formula shape, to re-calibrate.
   ------------------------------------------------------------ */
export const CP = {
  // Below this many weekly minutes there isn't enough signal to judge a week.
  MIN_MINUTES_FOR_SCORE: 30,

  // Adherence window on ratio = actual weekly minutes / weekly target.
  TARGET_LOW: 0.85, // below → sustained shortfall (Underperforming)
  TARGET_HIGH: 1.15, // within [LOW, HIGH] → the healthy "on-target" window
  OPTIMAL_OVER_MAX: 1.35, // a steady week up to here still counts as Optimal
  BURNOUT_RATIO: 1.5, // consistent excess at/above this reads as burnout risk

  // A week whose total is essentially one day's work is "No work done at all".
  ONE_DAY_DOMINANCE: 0.85,

  // Consistency (0..1) at/above this is treated as "consistent" for tiering —
  // the deciding factor between Optimal and Overperforming / No-improvement.
  CONSISTENCY_OK: 0.55,

  // Consistency sub-weights + normalization references (see consistencyScore).
  CONSISTENCY_DUR_WEIGHT: 0.5,
  CONSISTENCY_START_WEIGHT: 0.5,
  DUR_CV_REF: 1.0, // duration coefficient-of-variation mapping to 0 consistency
  START_STD_REF_MIN: 180, // start-time stddev (min) mapping to 0 consistency

  // Optimal magnitude blend: closeness-to-target vs consistency.
  OPTIMAL_ADHERE_WEIGHT: 0.5,
  OPTIMAL_CONSIST_WEIGHT: 0.5,
  ADHERE_TOL: 0.3, // |ratio-1| beyond this earns no closeness credit

  // Holidays discipline bonus (section 3): meeting the target "at a place you
  // shouldn't be" nudges the raw score up WITHIN its tier — it never changes
  // which behaviour pattern the week maps to, and never pushes past +10.
  HOLIDAY_DISCIPLINE_BONUS: 1.5,
};

/* Five tiers on the fixed -10..+10 scale (section 4). These bands are the
   single source of truth for classification — keep them named, not inlined,
   so they can be retuned without touching the logic. Ordered worst → best.

   NOTE the ordering: Optimal sits ABOVE Overperforming. Studying beyond the
   target is not, by definition, more efficient than hitting it precisely, so
   raw extra hours can never outscore an on-target + consistent week. */
export const CP_TIERS = {
  NO_WORK: { key: 'NO_WORK', label: 'No work done', min: -10, max: -6 },
  UNDERPERFORMING: { key: 'UNDERPERFORMING', label: 'Underperforming', min: -5, max: -1 },
  NO_IMPROVEMENT: { key: 'NO_IMPROVEMENT', label: 'No improvement', min: 0, max: 0 },
  OVERPERFORMING: { key: 'OVERPERFORMING', label: 'Overperforming', min: 1, max: 5 },
  OPTIMAL: { key: 'OPTIMAL', label: 'Optimal performance', min: 6, max: 10 },
};

export const CP_MAX_SCORE = 10; // ceiling of the whole system
export const CP_MIN_SCORE = -10;

/* ------------------------------------------------------------
   Small math helpers.
   ------------------------------------------------------------ */
function lerp(a, b, t) {
  return a + (b - a) * clamp(t, 0, 1);
}
function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function stddev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, x) => a + (x - m) * (x - m), 0) / xs.length;
  return Math.sqrt(v);
}
/** Circular stddev (in minutes) of times-of-day, so 23:30 and 00:30 read as
 *  close rather than 23h apart. Returns 0 for <2 points, grows large as the
 *  starts spread around the 24h clock. */
function circularStdMinutes(minsOfDay) {
  if (minsOfDay.length < 2) return 0;
  const TWO_PI = Math.PI * 2;
  let sx = 0;
  let sy = 0;
  for (const m of minsOfDay) {
    const a = (m / 1440) * TWO_PI;
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  const R = Math.sqrt(sx * sx + sy * sy) / minsOfDay.length;
  if (R >= 1) return 0;
  const stdRad = Math.sqrt(-2 * Math.log(R));
  return stdRad * (1440 / TWO_PI);
}

/* ------------------------------------------------------------
   Consistency scoring (section 5).

   Rewards sessions of similar LENGTH and similar TIME-OF-DAY. This is the
   statistical stand-in for the "healthy repeated rhythm" idea from section 2:
   a week of similar 90-min evening blocks scores high even though it's
   clustered, while wildly varying sessions score low even if the hours add up.

   Rule-based on purpose (variance of duration + start time). The shape is
   deliberately swappable for a learned model later without changing callers.
   Returns 0..1 (1 = very consistent).
   ------------------------------------------------------------ */
export function consistencyScore(weekSessions) {
  const sessions = weekSessions || [];
  if (sessions.length < 2) return 0; // one session can't establish a rhythm

  const durations = sessions.map((x) => x.durationMinutes);
  const starts = sessions.map((x) => minutesOfDay(x.startTime));

  // Duration regularity via coefficient of variation (scale-free: 30-min and
  // 3-hour rhythms are judged on relative, not absolute, spread).
  const durMean = mean(durations);
  const durCV = durMean > 0 ? stddev(durations) / durMean : 1;
  const durConsist = clamp(1 - durCV / CP.DUR_CV_REF, 0, 1);

  // Start-time regularity on the 24h clock.
  const startConsist = clamp(1 - circularStdMinutes(starts) / CP.START_STD_REF_MIN, 0, 1);

  return CP.CONSISTENCY_DUR_WEIGHT * durConsist + CP.CONSISTENCY_START_WEIGHT * startConsist;
}

/* ------------------------------------------------------------
   Weekly performance.
   ------------------------------------------------------------ */

/** Sessions that started inside the Sunday–Saturday week containing refDate. */
export function weekSessionsFor(sessions, refDate = new Date()) {
  const weekStart = weekStartISO(refDate);
  const startMs = new Date(weekStart + 'T00:00:00').getTime();
  const endMs = new Date(addDaysISO(weekStart, 7) + 'T00:00:00').getTime();
  return (sessions || [])
    .filter((x) => x.startTime >= startMs && x.startTime < endMs)
    .sort((a, b) => a.startTime - b.startTime);
}

function optimalMagnitude(ratio, consistency) {
  // Closer to exactly on-target + more consistent → nearer the +10 ceiling.
  const close = clamp(1 - Math.abs(ratio - 1) / CP.ADHERE_TOL, 0, 1);
  const p = CP.OPTIMAL_ADHERE_WEIGHT * close + CP.OPTIMAL_CONSIST_WEIGHT * consistency;
  return lerp(CP_TIERS.OPTIMAL.min, CP_TIERS.OPTIMAL.max, p);
}

/**
 * Score one week of study into the -10..+10 CP scale + its tier.
 *
 * @param {Array} sessions  full session list (filtered to the week internally)
 * @param {object} opts
 * @param {Date|number} opts.refDate  any moment inside the target week
 * @param {string} opts.mode          day-mode key (lecture | white | holidays)
 * @returns rich result: { score, tier, label, ratio, consistency, burnoutRisk, … }
 */
export function weeklyPerformance(sessions, { refDate = new Date(), mode = DEFAULT_DAY_MODE } = {}) {
  const week = weekSessionsFor(sessions, refDate);
  const weekStart = weekStartISO(refDate);

  const perDay = new Array(7).fill(0); // 0=Sun … 6=Sat
  for (const x of week) perDay[new Date(x.startTime).getDay()] += x.durationMinutes;
  const total = perDay.reduce((a, b) => a + b, 0);
  const activeDays = perDay.filter((m) => m > 0).length;
  const maxDay = perDay.reduce((a, b) => Math.max(a, b), 0);
  const maxDayShare = total > 0 ? maxDay / total : 0;

  const target = weeklyTargetMinutes(mode);
  const ratio = target > 0 ? total / target : 0;
  const consistency = consistencyScore(week);
  const consistent = consistency >= CP.CONSISTENCY_OK;
  const enough = total >= CP.MIN_MINUTES_FOR_SCORE;

  // ---- Tier + raw magnitude within the tier's band ----
  let tier;
  let raw;

  if (total < CP.MIN_MINUTES_FOR_SCORE || activeDays <= 1 || maxDayShare >= CP.ONE_DAY_DOMINANCE) {
    // Nothing logged, or the week's total came almost entirely from a single
    // day/session despite a multi-day target — the worst pattern.
    tier = CP_TIERS.NO_WORK;
    const fill = clamp(ratio / CP.TARGET_LOW, 0, 1); // 0 min → -10; a full single day → toward -6
    raw = lerp(tier.min, tier.max, fill);
  } else if (ratio < CP.TARGET_LOW) {
    // Consistently below target across the week — a sustained shortfall.
    tier = CP_TIERS.UNDERPERFORMING;
    // Deeper shortfall → nearer -5; near the window → -1. A steadier rhythm
    // softens the penalty slightly (consistency can lift a week off the floor).
    const p = 0.75 * clamp(ratio / CP.TARGET_LOW, 0, 1) + 0.25 * consistency;
    raw = lerp(tier.min, tier.max, p);
  } else if (ratio <= CP.TARGET_HIGH) {
    // Right in the target window. Consistency is the deciding factor:
    //   steady   → Optimal (the healthy, sustainable zone)
    //   erratic  → No improvement (always average, no real trend)
    if (consistent) {
      tier = CP_TIERS.OPTIMAL;
      raw = optimalMagnitude(ratio, consistency);
    } else {
      tier = CP_TIERS.NO_IMPROVEMENT;
      raw = 0;
    }
  } else {
    // Above the healthy window. A modest, steady overshoot is still Optimal;
    // otherwise it's Overperforming — positive (real effort) but capped below
    // Optimal, because excess hours are not the same as efficient hours.
    if (consistent && ratio <= CP.OPTIMAL_OVER_MAX) {
      tier = CP_TIERS.OPTIMAL;
      raw = optimalMagnitude(ratio, consistency);
    } else {
      tier = CP_TIERS.OVERPERFORMING;
      const excess = clamp((ratio - CP.TARGET_HIGH) / (CP.BURNOUT_RATIO - CP.TARGET_HIGH), 0, 1);
      // Modest + steady excess scores higher (toward 5); extreme or erratic
      // excess scores lower (toward 1).
      const p = 0.5 * (1 - excess) + 0.5 * consistency;
      raw = lerp(tier.min, tier.max, p);
    }
  }

  // ---- Holidays discipline bonus: shift the raw score up WITHIN its tier
  // (never past the band max, never past +10), and only when the week actually
  // met/approached target (a non-negative raw score). It rewards effort, it
  // does not re-label a No-work / Underperforming week. ----
  let score = raw;
  if (mode === 'holidays' && raw >= 0) {
    score = Math.min(tier.max, score + CP.HOLIDAY_DISCIPLINE_BONUS);
  }
  score = clamp(Math.round(score), CP_MIN_SCORE, CP_MAX_SCORE);

  // ---- Burnout risk: a SEPARATE health flag, deliberately NOT folded into
  // the numeric score so the score and the health signal don't get conflated
  // (section 4). Only meaningful while overperforming. ----
  let burnoutRisk = 'none';
  if (tier.key === 'OVERPERFORMING') {
    if (consistent && ratio >= CP.BURNOUT_RATIO) burnoutRisk = 'high';
    else if (consistent || ratio >= CP.BURNOUT_RATIO) burnoutRisk = 'medium';
    else burnoutRisk = 'low';
  }

  return {
    weekStart,
    mode,
    target,
    total,
    perDay,
    sessionCount: week.length,
    activeDays,
    maxDayShare,
    ratio,
    consistency,
    consistent,
    tier: tier.key,
    label: tier.label,
    score,
    enough,
    burnoutRisk,
  };
}

/** Live CP read for the CURRENT (in-progress) week, using the state's mode. */
export function currentPerformance(state, refDate = new Date()) {
  return weeklyPerformance(state.sessions, { refDate, mode: dayModeOf(state) });
}

/** CSS var name for a tier, so UI colours stay consistent with the app. */
export function tierColorVar(tierKey) {
  switch (tierKey) {
    case 'OPTIMAL':
      return '--green';
    case 'OVERPERFORMING':
      return '--accent';
    case 'NO_IMPROVEMENT':
      return '--yellow';
    default: // UNDERPERFORMING, NO_WORK
      return '--red';
  }
}

/**
 * Short, pattern-specific coaching for the weekly card. Non-judgmental and
 * capped so the card stays brief. Returns [] when there isn't enough week.
 */
export function performanceTips(perf) {
  if (!perf.enough) return [];
  const tips = [];
  switch (perf.tier) {
    case 'NO_WORK':
      tips.push(
        perf.total <= 0
          ? 'No study logged this week yet — a short session on two or three days sets the rhythm.'
          : 'Nearly all of this week landed on one day — spreading it across more days builds a steadier week.'
      );
      break;
    case 'UNDERPERFORMING':
      tips.push('Running below target most days — a small, regular top-up closes the gap without cramming.');
      break;
    case 'NO_IMPROVEMENT':
      tips.push('Right around average. Steadier session lengths and start-times are what tip this into the optimal zone.');
      break;
    case 'OVERPERFORMING':
      if (perf.burnoutRisk === 'high' || perf.burnoutRisk === 'medium')
        tips.push('Well over target and sustained — protect recovery so the extra hours keep paying off.');
      else tips.push('Above target in bursts — a steadier day-to-day rhythm scores higher than sporadic big sessions.');
      break;
    case 'OPTIMAL':
      tips.push('Consistent and on target — the sustainable zone. Keep the rhythm.');
      break;
  }
  return tips.slice(0, 2);
}

/* ------------------------------------------------------------
   Weekly settlement + streaks (drives the balanced-week XP bonus and the
   milestone badges). Mirrors the old cognitive-load settlement: a forward-only
   cursor so each elapsed week settles exactly once, clock-rewind-safe.
   ------------------------------------------------------------ */

/**
 * Settle every fully-elapsed week since the cursor. Pays a one-time bonus for
 * each week that landed in the Optimal tier and tracks the optimal-week streak.
 * MUTATES state.cp only; XP is applied by the caller.
 *
 * Past weeks are scored with the CURRENT day-mode (historical mode isn't
 * recorded); this only affects the retroactive bonus, not any live display.
 *
 * @returns {{ awardedXp:number, settled:Array }}
 */
export function settleCognitivePerformanceWeeks(state, refDate = new Date()) {
  const cur = weekStartISO(refDate);
  const cp = state.cp || (state.cp = { lastWeek: null, optimalStreak: 0, bestOptimalStreak: 0 });

  // First ever run: anchor the cursor to this week; nothing to settle retroactively.
  if (!cp.lastWeek) {
    cp.lastWeek = cur;
    return { awardedXp: 0, settled: [] };
  }

  // Never move the cursor backwards (clock set back / DST / stale save): a
  // rewind would let already-settled weeks be paid a second time.
  if (cur <= cp.lastWeek) return { awardedXp: 0, settled: [] };

  const mode = dayModeOf(state);
  let awardedXp = 0;
  const settled = [];
  let guard = 0;
  while (cp.lastWeek < cur && guard++ < 520) {
    const weekStart = cp.lastWeek;
    const perf = weeklyPerformance(state.sessions, { refDate: new Date(weekStart + 'T12:00:00'), mode });

    if (perf.tier === 'OPTIMAL') {
      cp.optimalStreak = (cp.optimalStreak || 0) + 1;
      awardedXp += XP.OPTIMAL_WEEK_BONUS;
      settled.push({ weekStart, score: perf.score, tier: perf.tier, label: perf.label, optimal: true, bonus: XP.OPTIMAL_WEEK_BONUS });
    } else {
      // Anything short of Optimal ends the streak.
      cp.optimalStreak = 0;
      if (perf.total > 0) settled.push({ weekStart, score: perf.score, tier: perf.tier, label: perf.label, optimal: false, bonus: 0 });
    }
    cp.bestOptimalStreak = Math.max(cp.bestOptimalStreak || 0, cp.optimalStreak);
    cp.lastWeek = addDaysISO(weekStart, 7);
  }

  return { awardedXp, settled };
}

// Optimal-week streak milestones (weeks). Surfaced as badges via achievements.js.
export const CP_MILESTONES = [2, 4, 8];
