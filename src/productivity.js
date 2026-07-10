/* ============================================================
   24-Hour Productivity Record.

   For each day, "% of the 24 hours spent studying" = studied
   minutes that day / 1440. The point is behavioural motivation:
   we track the user's personal best and their current streak of
   staying ABOVE their own recent average — a moving, personal bar,
   not an arbitrary universal target.

   Because this metric is specifically about clock-time occupancy of
   a calendar day, a session that crosses midnight is split across
   the two days it actually spans (by wall-clock overlap) rather than
   counted wholly on its start day. All values are derived from the
   session list (nothing manually entered).
   ============================================================ */

import { isoDate, DAYS } from './util.js';

const MINUTES_PER_DAY = 1440;

/**
 * Minutes of a single session that fall inside the calendar day `dayISO`.
 * A midnight-crossing session is split proportionally by the share of its
 * wall-clock span that overlaps the day, so each 24-hour day only counts the
 * time actually spent inside it. A same-day session returns its full duration.
 */
function sessionMinutesOnDay(session, dayISO) {
  const dayStart = new Date(dayISO + 'T00:00:00').getTime();
  const dayEnd = dayStart + 86400000;
  const start = session.startTime;
  // Guard missing/zero-length spans: treat as ≥1 min so the ratio is defined.
  const end = Math.max(session.endTime ?? start, start + 60000);
  const overlap = Math.min(end, dayEnd) - Math.max(start, dayStart);
  if (overlap <= 0) return 0;
  return session.durationMinutes * (overlap / (end - start));
}

/** Total studied minutes on a given yyyy-mm-dd (midnight-crossing split). */
export function dailyMinutes(sessions, dayISO) {
  return (sessions || []).reduce((a, x) => a + sessionMinutesOnDay(x, dayISO), 0);
}

/** Fraction (0..1) of the 24h day spent studying on `dayISO`. */
export function dailyPercent(sessions, dayISO) {
  return Math.min(1, dailyMinutes(sessions, dayISO) / MINUTES_PER_DAY);
}

/**
 * Map of yyyy-mm-dd → studied minutes, splitting midnight-crossing sessions
 * across their two days. `sinceMs` windows by session start time (a session
 * that started before the window is skipped, matching the callers' intent).
 */
function minutesByDay(sessions, sinceMs = -Infinity) {
  const byDay = {};
  for (const x of sessions || []) {
    if (x.startTime < sinceMs) continue;
    const startISO = isoDate(new Date(x.startTime));
    const endISO = isoDate(new Date(Math.max(x.endTime ?? x.startTime, x.startTime)));
    byDay[startISO] = (byDay[startISO] || 0) + sessionMinutesOnDay(x, startISO);
    if (endISO !== startISO) byDay[endISO] = (byDay[endISO] || 0) + sessionMinutesOnDay(x, endISO);
  }
  return byDay;
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
  const byDay = minutesByDay(sessions);
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
  const byDay = minutesByDay(sessions, cutoff.getTime());
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

  const byDay = minutesByDay(sessions);
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
