/* ============================================================
   Solar-system rank engine.
   Rank is a MONTHLY journey out from the launchpad through the
   planets. Each planet has a monthly-XP threshold. Levels stay
   lifetime + unlimited (see xp.js); rank resets every month and
   the furthest planet reached is archived as an achievement.
   ============================================================ */

/** The journey, ordered outward. threshold = monthly XP to "arrive". */
export const PLANETS = [
  { id: 'launch', name: 'Launchpad', threshold: 0, color: '#8893b5', blurb: 'Boots on the pad.' },
  { id: 'mercury', name: 'Mercury', threshold: 500, color: '#8893b5', blurb: 'First burn complete.' },
  { id: 'venus', name: 'Venus', threshold: 1200, color: '#f5c518', blurb: 'Through the morning star.' },
  { id: 'earth', name: 'Earth', threshold: 2200, color: '#3b82f6', blurb: 'A pale blue dot behind you.' },
  { id: 'mars', name: 'Mars', threshold: 3600, color: '#ff4c61', blurb: 'The red frontier.' },
  { id: 'jupiter', name: 'Jupiter', threshold: 5500, color: '#fb923c', blurb: 'Past the giant.' },
  { id: 'saturn', name: 'Saturn', threshold: 8000, color: '#f5c518', blurb: 'Riding the rings.' },
  { id: 'uranus', name: 'Uranus', threshold: 11000, color: '#22d3ee', blurb: 'Into the ice giants.' },
  { id: 'neptune', name: 'Neptune', threshold: 15000, color: '#3b82f6', blurb: 'The deep blue edge.' },
  { id: 'pluto', name: 'Pluto', threshold: 20000, color: '#c9d2e8', blurb: 'The far frontier. Legend.' },
];

/** 'YYYY-MM' for an ISO date string (yyyy-mm-dd). */
export function monthKey(dateISO) {
  return dateISO.slice(0, 7);
}

/** Index of the highest planet reached for a given monthly XP. */
export function planetIndexForXp(monthlyXp) {
  let idx = 0;
  for (let i = 0; i < PLANETS.length; i++) {
    if (monthlyXp >= PLANETS[i].threshold) idx = i;
    else break;
  }
  return idx;
}

export function planetForXp(monthlyXp) {
  return PLANETS[planetIndexForXp(monthlyXp)];
}

export function planetById(id) {
  return PLANETS.find((p) => p.id === id) || PLANETS[0];
}

/**
 * Progress toward the next planet given this month's XP.
 * @returns {{planet, index, next, into, need, pct, toNext, isMax}}
 */
export function rankProgress(monthlyXp) {
  const index = planetIndexForXp(monthlyXp);
  const planet = PLANETS[index];
  const next = PLANETS[index + 1] || null;
  if (!next) {
    return { planet, index, next: null, into: 0, need: 0, pct: 1, toNext: 0, isMax: true };
  }
  const into = monthlyXp - planet.threshold;
  const need = next.threshold - planet.threshold;
  return {
    planet,
    index,
    next,
    into,
    need,
    pct: need > 0 ? Math.min(1, into / need) : 1,
    toNext: Math.max(0, next.threshold - monthlyXp),
    isMax: false,
  };
}

/** Whole days remaining in the calendar month containing todayISO. */
export function daysLeftInMonth(todayISO) {
  const d = new Date(todayISO + 'T00:00:00');
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return last - d.getDate();
}

/** Pretty month label e.g. "June 2026" from 'YYYY-MM'. */
export function monthLabel(month) {
  if (!month) return '';
  const [y, m] = month.split('-').map(Number);
  const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${names[m - 1]} ${y}`;
}

/**
 * Roll the monthly rank if the calendar month changed.
 * Archives the planet reached last month into planetHistory, then
 * resets monthlyXp. Mutates state. Safe to call repeatedly.
 */
export function ensureMonth(state, todayISO) {
  const mk = monthKey(todayISO);
  if (!state.rank) state.rank = { month: mk, monthlyXp: 0 };
  if (state.rank.month === mk) return;

  // Archive the month we are leaving (only if any progress was made).
  if (state.rank.month && state.rank.monthlyXp > 0) {
    const planet = planetForXp(state.rank.monthlyXp);
    state.planetHistory = state.planetHistory || [];
    state.planetHistory.unshift({
      month: state.rank.month,
      planetId: planet.id,
      planetName: planet.name,
      xp: state.rank.monthlyXp,
    });
  }
  state.rank.month = mk;
  state.rank.monthlyXp = 0;
}
