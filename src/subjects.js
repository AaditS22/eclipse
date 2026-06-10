/* ============================================================
   Subjects — the user's configured study subjects and their
   per-day time goals. You define what you study and how long you
   want to study it each day, and the app tracks your progress.
   Completion is manual: mark a subject done whenever you decide
   it's finished, and you forge its commemorative relic.
   ============================================================ */

import { isoDate, SUBJECT_COLORS, uid } from './util.js';
import { generateRelic, relicTierForMinutes } from './pixel/artgen.js';

/** A fresh subject with a colour assigned by position. */
export function makeSubject(name, dailyGoalMinutes, index) {
  return {
    id: uid('subj'),
    name: name.trim(),
    color: SUBJECT_COLORS[index % SUBJECT_COLORS.length],
    dailyGoalMinutes: Math.max(0, Math.round(dailyGoalMinutes || 0)),
    completedAt: null,    // ISO date the relic was earned (also the "already minted" guard)
    completedTier: null,  // tier key earned (bronze … ruby)
    relicId: null,        // id of the minted relic in the collection
  };
}

/** Back-fill id / goal / completion fields on subjects loaded from older saves. */
export function normalizeSubjects(state) {
  let changed = false;
  state.subjects = state.subjects || [];
  state.subjects.forEach((s, i) => {
    if (!s.id) { s.id = uid('subj'); changed = true; }
    if (typeof s.dailyGoalMinutes !== 'number') { s.dailyGoalMinutes = 0; changed = true; }
    if (!('completedAt' in s)) { s.completedAt = null; changed = true; }
    if (!('completedTier' in s)) { s.completedTier = null; changed = true; }
    if (!('relicId' in s)) { s.relicId = null; changed = true; }
    if (!s.color) { s.color = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; changed = true; }
    // Retire the obsolete hours-target field from older saves.
    if ('targetMinutes' in s) { delete s.targetMinutes; changed = true; }
  });
  return changed;
}

export function findSubject(state, name) {
  return state.subjects.find((s) => s.name.toLowerCase() === String(name).toLowerCase());
}

/** Total daily goal across ACTIVE subjects (completed ones drop out). */
export function totalDailyGoal(state) {
  return state.subjects
    .filter((s) => !s.completedAt)
    .reduce((a, s) => a + (s.dailyGoalMinutes || 0), 0);
}

/** Minutes studied today for a single subject name. */
export function subjectTodayMinutes(state, name, todayISO = isoDate()) {
  return state.sessions
    .filter((x) => isoDate(new Date(x.startTime)) === todayISO && x.subject === name)
    .reduce((a, x) => a + x.durationMinutes, 0);
}

/** All-time minutes studied for a single subject name. */
export function subjectTotalMinutes(state, name) {
  return state.sessions
    .filter((x) => x.subject === name)
    .reduce((a, x) => a + x.durationMinutes, 0);
}

/** Total minutes studied today across all subjects. */
export function totalTodayMinutes(state, todayISO = isoDate()) {
  return state.sessions
    .filter((x) => isoDate(new Date(x.startTime)) === todayISO)
    .reduce((a, x) => a + x.durationMinutes, 0);
}

/** Per-subject progress for today (ACTIVE subjects only). */
export function dailyProgress(state, todayISO = isoDate()) {
  return state.subjects
    .filter((s) => !s.completedAt)
    .map((s) => {
      const mins = subjectTodayMinutes(state, s.name, todayISO);
      const goal = s.dailyGoalMinutes || 0;
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        goal,
        mins,
        pct: goal > 0 ? Math.min(1, mins / goal) : 0,
        done: goal > 0 && mins >= goal,
      };
    });
}

/**
 * Mark a subject complete and forge its relic. Mutates `st` (call inside
 * an `update`). Returns the minted relic, or null if the subject is gone
 * or already completed.
 */
export function completeSubjectInState(st, subjectId, todayISO = isoDate()) {
  const sub = st.subjects.find((x) => x.id === subjectId);
  if (!sub || sub.completedAt) return null;
  const minutes = subjectTotalMinutes(st, sub.name);
  const tier = relicTierForMinutes(minutes);
  const relic = generateRelic({ subjectName: sub.name, minutes, dateISO: todayISO, tierKey: tier.key });
  sub.completedAt = todayISO;
  sub.completedTier = tier.key;
  sub.relicId = relic.id;
  st.user.collection = st.user.collection || [];
  st.user.collection.push(relic);
  if (!st.user.featuredArt) st.user.featuredArt = relic.id; // auto-feature your first
  return relic;
}

/**
 * Undo a completion: remove the earned relic and reopen the subject so it
 * can be studied again. Mutates `st` (call inside an `update`).
 */
export function undoCompleteInState(st, subjectId) {
  const sub = st.subjects.find((x) => x.id === subjectId);
  if (!sub || !sub.completedAt) return;
  if (sub.relicId) {
    st.user.collection = (st.user.collection || []).filter((p) => p.id !== sub.relicId);
    if (st.user.featuredArt === sub.relicId) st.user.featuredArt = null;
  }
  sub.completedAt = null;
  sub.completedTier = null;
  sub.relicId = null;
}
