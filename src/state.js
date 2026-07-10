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
      handle: null, // unique @code for friends (minted on first cloud sync)
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
      featuredCollectible: null, // legacy: pre-Foundry featured collectible (purged on load)
      collection: [], // commemorative relics (see collection.js / artgen.js)
      featuredArt: null, // id of a collection piece shown as home/timer decor
      collectionMigrated: false, // one-time retired-content purge flag
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
      ghostMode: false, // hide your studying status from friends
      hideSubject: false, // share that you're studying, but not the subject name
      hideActivity: false, // keep finished sessions out of friends' "today's activity" feed
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
    // Cognitive-load weekly bookkeeping (see cognitiveLoad.js / session.js).
    // Derived/cached — never hand-edited. `lastWeek` is a forward-only
    // settlement cursor (the Sunday-week up to which weeks have been settled);
    // it advances toward the current week so the balanced-week bonus is paid
    // exactly once. Streaks feed the low-CL milestone badges.
    cl: {
      lastWeek: null, // yyyy-mm-dd (Sunday) settlement cursor; weeks before it are settled
      lowStreak: 0, // consecutive settled weeks ending on a Low CL score
      bestLowStreak: 0, // best low-CL streak ever (drives milestone badges)
    },
  };
}

// The localStorage key doubles as a per-user cache key. In account mode
// it's set to `studyspace.v1.<userId>` so different accounts on the same
// browser don't clobber each other; in local-only mode it stays the base.
let storageKey = STORAGE_KEY;
// Optional hook the cloud-sync layer registers to push state remotely.
let persistHook = null;

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // shallow-merge over defaults so new fields appear after upgrades
    return deepDefaults(parsed, defaultState());
  } catch (e) {
    console.warn('Failed to load state, starting fresh', e);
    return defaultState();
  }
}

/** Point persistence at a specific cache key (per-user in account mode). */
export function setStorageKey(key) {
  storageKey = key;
}

/** Register a callback that receives state on every persist (cloud push). */
export function onPersist(cb) {
  persistHook = cb;
}

/**
 * Replace the whole in-memory state (e.g. with a cloud save on login).
 * Caches locally and notifies, but does NOT echo back to the cloud.
 */
export function hydrate(data) {
  state = deepDefaults(data || {}, defaultState());
  persistLocal();
  emit();
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

function persistLocal() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(state));
  } catch (e) {
    console.warn('Persist failed', e);
  }
}

export function persist() {
  persistLocal();
  if (persistHook) persistHook(state);
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
