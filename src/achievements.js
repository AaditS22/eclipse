/* ============================================================
   Achievements — unlockable pixel-art badges.
   Each has a pure `check(state, ctx)` predicate evaluated after a
   session. ctx carries the just-finished session for time-of-day
   checks. Returns true once the condition is met.
   ============================================================ */

import { isoDate } from './util.js';

export const ACHIEVEMENTS = [
  {
    id: 'first-contact',
    name: 'First Contact',
    icon: '👋',
    desc: 'Complete your first session.',
    check: (s) => s.sessions.length >= 1,
  },
  {
    id: 'night-owl',
    name: 'Night Owl',
    icon: '🦉',
    desc: 'Study after midnight.',
    check: (s, ctx) => ctx && new Date(ctx.session.startTime).getHours() >= 0 && new Date(ctx.session.startTime).getHours() < 4,
  },
  {
    id: 'early-bird',
    name: 'Early Bird',
    icon: '🐤',
    desc: 'Study before 6am.',
    check: (s, ctx) => ctx && new Date(ctx.session.startTime).getHours() < 6 && new Date(ctx.session.startTime).getHours() >= 4,
  },
  {
    id: 'marathon',
    name: 'Marathon',
    icon: '🏃',
    desc: 'A single session of 3+ hours.',
    check: (s) => s.sessions.some((x) => x.durationMinutes >= 180),
  },
  {
    id: 'speed-run',
    name: 'Speed Run',
    icon: '⚡',
    desc: '5 sessions in one day.',
    check: (s) => {
      const counts = {};
      for (const x of s.sessions) {
        const d = isoDate(new Date(x.startTime));
        counts[d] = (counts[d] || 0) + 1;
        if (counts[d] >= 5) return true;
      }
      return false;
    },
  },
  {
    id: 'consistent',
    name: 'Consistent',
    icon: '📆',
    desc: '30-day study streak.',
    check: (s) => s.user.streak >= 30,
  },
  {
    id: 'subject-master',
    name: 'Subject Master',
    icon: '🎓',
    desc: '100 hours in one subject.',
    check: (s) => {
      const mins = {};
      for (const x of s.sessions) {
        mins[x.subject] = (mins[x.subject] || 0) + x.durationMinutes;
        if (mins[x.subject] >= 6000) return true;
      }
      return false;
    },
  },
  {
    id: 'voyager',
    name: 'Voyager',
    icon: '🪐',
    desc: 'Reach Jupiter or beyond in a month.',
    check: (s) => (s.rank?.monthlyXp || 0) >= 5500,
  },
  {
    id: 'polymath',
    name: 'Polymath',
    icon: '🧠',
    desc: 'Log 5 different subjects.',
    check: (s) => new Set(s.sessions.map((x) => x.subject)).size >= 5,
  },
  {
    id: 'galaxy-brain',
    name: 'Galaxy Brain',
    icon: '🌌',
    desc: 'Reach level 50.',
    check: (s) => s.user.level >= 50,
  },
  // ---- Cognitive-load milestones: reward well-distributed study weeks. ----
  {
    id: 'steady-orbit',
    name: 'Steady Orbit',
    icon: '🌗',
    desc: '2 weeks in a row with low cognitive load.',
    check: (s) => (s.cl?.bestLowStreak || 0) >= 2,
  },
  {
    id: 'balanced-flight',
    name: 'Balanced Flight',
    icon: '🛰️',
    desc: '4 weeks in a row with low cognitive load.',
    check: (s) => (s.cl?.bestLowStreak || 0) >= 4,
  },
  {
    id: 'zen-navigator',
    name: 'Zen Navigator',
    icon: '🧘',
    desc: '8 weeks in a row with low cognitive load.',
    check: (s) => (s.cl?.bestLowStreak || 0) >= 8,
  },
];

/** Evaluate all achievements; return newly-unlocked ones (and mutate state.achievements). */
export function evaluateAchievements(state, ctx) {
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (state.achievements.includes(a.id)) continue;
    if (a.check(state, ctx)) {
      state.achievements.push(a.id);
      newly.push(a);
    }
  }
  return newly;
}
