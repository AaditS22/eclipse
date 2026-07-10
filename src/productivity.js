/* ============================================================
   24-Hour Productivity Record.

   For each day, "% of the 24 hours spent studying" = studied
   minutes that day / 1440. The point is behavioural motivation:
   we track the user's personal best and their current streak of
   staying ABOVE their own recent average — a moving, personal bar,
   not an arbitrary universal target.

   All values are derived from the session list (nothing manually
   entered), so they're always consistent with the log.
   ============================================================ */

import { isoDate, DAYS } from './util.js';

const MINUTES_PER_DAY = 1440;

/** Total studied minutes on a given yyyy-mm-dd. */
export function dailyMinutes(sessions, dayISO) {
  return (sessions || [])
    .filter((x) => isoDate(new Date(x.startTime)) === dayISO)
    .reduce((a, x) => a + x.durationMinutes, 0);
}

/** Fraction (0..1) of the 24h day spent studying on `dayISO`. */
export function dailyPercent(sessions, dayISO) {
  return Math.min(1, dailyMinutes(sessions, dayISO) / MINUTES_PER_DAY);
}

/**
 * The last `days` calendar days (oldest → newest, ending today).
 * @returns [{ iso, dayLabel, minutes, pct }]
 */
export function dailyRecords(sessions, days = 7, ref = new Date()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(ref);
    d.setDate(d.getDate() - i);
    const iso = isoDate(d);
    const minutes = dailyMinutes(sessions, iso);
    out.push({ iso, dayLabel: DAYS[d.getDay()], minutes, pct: Math.min(1, minutes / MINUTES_PER_DAY) });
  }
  return out;
}

/** Best single-day percent ever logged (the personal record to beat). */
export function personalBestPercent(sessions) {
  const byDay = {};
  for (const x of sessions || []) {
    const iso = isoDate(new Date(x.startTime));
    byDay[iso] = (byDay[iso] || 0) + x.durationMinutes;
  }
  let best = 0;
  for (const iso in byDay) best = Math.max(best, byDay[iso] / MINUTES_PER_DAY);
  return Math.min(1, best);
}

/**
 * Average daily percent across recent *active* study days (a moving personal
 * bar). Only days with study count, so the average reflects "a normal study
 * day for you" rather than being dragged to zero by rest days.
 */
export function recentAveragePercent(sessions, window = 14, ref = new Date()) {
  const cutoff = new Date(ref);
  cutoff.setDate(cutoff.getDate() - window);
  const cutoffMs = cutoff.getTime();
  const byDay = {};
  for (const x of sessions || []) {
    if (x.startTime < cutoffMs) continue;
    const iso = isoDate(new Date(x.startTime));
    byDay[iso] = (byDay[iso] || 0) + x.durationMinutes;
  }
  const pcts = Object.values(byDay).map((m) => Math.min(1, m / MINUTES_PER_DAY));
  if (pcts.length === 0) return 0;
  return pcts.reduce((a, b) => a + b, 0) / pcts.length;
}

/**
 * Current "maintaining" streak: consecutive study days (walking back from the
 * most recent one) whose percent met-or-beat the recent average. Rest days
 * don't break it — the streak is about study days you showed up strong for.
 */
export function maintainStreak(sessions, ref = new Date()) {
  const avg = recentAveragePercent(sessions, 14, ref);
  if (avg <= 0) return 0;

  const byDay = {};
  for (const x of sessions || []) {
    const iso = isoDate(new Date(x.startTime));
    byDay[iso] = (byDay[iso] || 0) + x.durationMinutes;
  }
  const studyDays = Object.keys(byDay).sort(); // ascending yyyy-mm-dd
  let streak = 0;
  for (let i = studyDays.length - 1; i >= 0; i--) {
    const pct = Math.min(1, byDay[studyDays[i]] / MINUTES_PER_DAY);
    if (pct >= avg) streak++;
    else break;
  }
  return streak;
}

/** One-call bundle for the view layer. */
export function productivitySummary(sessions, ref = new Date()) {
  return {
    best: personalBestPercent(sessions),
    average: recentAveragePercent(sessions, 14, ref),
    streak: maintainStreak(sessions, ref),
  };
}
