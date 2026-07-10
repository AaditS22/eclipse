/* Small shared helpers. */

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Local yyyy-mm-dd for a Date (defaults now). */
export function isoDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Difference in whole calendar days between two yyyy-mm-dd strings (a - b). */
export function dayDiff(aISO, bISO) {
  const a = new Date(aISO + 'T00:00:00');
  const b = new Date(bISO + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}

/** ISO date (yyyy-mm-dd) of the Sunday that starts the week containing `d`.
 *  Sunday-based to match DAYS[] and Date.getDay(). Used as a stable weekly key. */
export function weekStartISO(d = new Date()) {
  const dt = d instanceof Date ? new Date(d) : new Date(d);
  dt.setHours(0, 0, 0, 0);
  dt.setDate(dt.getDate() - dt.getDay());
  return isoDate(dt);
}

/** yyyy-mm-dd shifted by `n` whole days (may be negative). */
export function addDaysISO(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

/** Minutes since local midnight for a Date or ms timestamp. */
export function minutesOfDay(t) {
  const d = t instanceof Date ? t : new Date(t);
  return d.getHours() * 60 + d.getMinutes();
}

/** "1h 22m" from minutes. */
export function fmtDuration(min) {
  min = Math.round(min);
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** "HH:MM:SS" from milliseconds (for the live clock). */
export function fmtClock(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/** "9:00 AM" from minutes-of-day. */
export function fmtTime(minOfDay) {
  let h = Math.floor(minOfDay / 60);
  const m = minOfDay % 60;
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, '0')} ${ap}`;
}

/** Credits can be fractional. Show up to 2 decimals, trimming trailing
 *  zeros (2 → "2", 2.5 → "2.5", 2.45 → "2.45"). */
export function fmtCredits(n) {
  const r = Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(2).replace(/\.?0+$/, '');
}

export function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/** Deterministic-ish color from a string (for subject colors). */
export const SUBJECT_COLORS = [
  '#7c5cfc',
  '#39d98a',
  '#f5c518',
  '#ff4c61',
  '#3b82f6',
  '#e879f9',
  '#fb923c',
  '#22d3ee',
];

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const prefersReducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;
