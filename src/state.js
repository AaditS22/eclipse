/* ============================================================
   Central state store + localStorage persistence
   Single-player. Everything lives in one serializable object.
   ============================================================ */

// Kept as-is across the Eclipse rebrand so existing progress (XP, sessions,
// cosmetics) survives; new fields back-fill via deepDefaults().
const STORAGE_KEY = 'studyspace.v1';

/** Default fresh-player state. */
function defaultState() {
  return {
    user: {
      username: 'Cmdr. Cadet',
      level: 1,
      xp: 0, // lifetime XP
      credits: 0,
      streak: 0,
      lastStudyDate: null, // ISO yyyy-mm-dd
      avatarConfig: {
        suit: 'suit-default',
        visor: 'visor-gold',
        theme: 'theme-nebula',
        rocket: 'rocket-default',
      },
      featuredCollectible: null, // legacy: pre-Foundry featured collectible (migrated away)
      collection: [], // forged pixel-art pieces (see collection.js / artgen.js)
      featuredArt: null, // id of a collection piece shown as home/timer decor
      collectionMigrated: false, // one-time legacy-collectible migration flag
    },
    onboarded: false, // has the user set up their subjects yet
    subjects: [
      // { id, name, color, dailyGoalMinutes }
    ],
    sessions: [
      // { sessionId, subject, startTime, endTime, durationMinutes, xpEarned }
    ],
    // Monthly solar-system rank (see rank.js). Resets each month.
    rank: { month: null, monthlyXp: 0 },
    planetHistory: [], // [{ month, planetId, planetName, xp }]
    inventory: ['suit-default', 'visor-gold', 'theme-nebula', 'rocket-default'],
    achievements: [], // unlocked badge ids
    settings: {
      reducedMotion: false,
      focusFx: true, // deep-space ambient animations while the timer runs
    },
    // bookkeeping for caps / daily bonuses
    daily: {
      date: null,
      timeXpAwarded: 0, // for the 600/day time-XP cap
      firstSessionDone: false,
      goalBonusAwarded: false,
    },
    stats: {
      xpToday: 0,
    },
  };
}

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // shallow-merge over defaults so new fields appear after upgrades
    return deepDefaults(parsed, defaultState());
  } catch (e) {
    console.warn('Failed to load state, starting fresh', e);
    return defaultState();
  }
}

/** Fill any missing keys in `obj` from `defaults` (one level deep on objects). */
function deepDefaults(obj, defaults) {
  const out = Array.isArray(defaults) ? obj ?? [] : { ...defaults, ...obj };
  if (!Array.isArray(defaults) && obj) {
    for (const k of Object.keys(defaults)) {
      if (
        defaults[k] &&
        typeof defaults[k] === 'object' &&
        !Array.isArray(defaults[k]) &&
        typeof obj[k] === 'object'
      ) {
        out[k] = deepDefaults(obj[k] ?? {}, defaults[k]);
      }
    }
  }
  return out;
}

export function getState() {
  return state;
}

/**
 * Mutate state via a callback, then persist + notify.
 * @param {(s:any)=>void} mutator
 */
export function update(mutator) {
  mutator(state);
  persist();
  emit();
}

export function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Persist failed', e);
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(state);
}

export function resetAll() {
  state = defaultState();
  persist();
  emit();
}

/** Roll the per-day bookkeeping if the calendar date changed. */
export function rolloverDaily(todayISO) {
  if (state.daily.date !== todayISO) {
    update((s) => {
      s.daily = {
        date: todayISO,
        timeXpAwarded: 0,
        firstSessionDone: false,
        goalBonusAwarded: false,
      };
      s.stats.xpToday = 0;
    });
  }
}
