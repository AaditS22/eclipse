/* ============================================================
   Live timer store — survives view navigation AND page reloads.
   Tracks elapsed time across pauses and notifies subscribers each
   second. The full timer is persisted to localStorage so that
   closing/reopening the site resumes the same session; because
   elapsed time is derived from real timestamps, a session that was
   running keeps counting the wall-clock time it was away.
   ============================================================ */

/** Sessions shorter than this are discarded (anti-fat-finger / anti-exploit). */
export const MIN_SESSION_MS = 60000;

const STORAGE_KEY = 'studyspace.timer.v1';

const listeners = new Set();

const t = {
  running: false,
  subject: '',
  startedAt: null, // ms, the real clock start of the session
  accumulatedMs: 0, // time banked before the current resume
  lastResumeAt: null,
};

let interval = null;

// ---- Persistence: keep the live session across reloads ----
function save() {
  try {
    if (t.startedAt === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
  } catch (e) {
    /* storage may be unavailable (private mode etc.) — degrade silently */
  }
}

function restore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    // Whitelist + coerce each field rather than trusting the blob — guards
    // against corrupt, hand-edited, or future-shaped saves producing NaN
    // math or stray keys on the live timer.
    const startedAt = Number(saved?.startedAt);
    if (!Number.isFinite(startedAt)) return;
    const accumulatedMs = Number(saved?.accumulatedMs ?? 0);
    const lastResumeAt = saved?.lastResumeAt == null ? null : Number(saved.lastResumeAt);

    t.subject = typeof saved?.subject === 'string' ? saved.subject : '';
    t.startedAt = startedAt;
    t.accumulatedMs = Number.isFinite(accumulatedMs) && accumulatedMs >= 0 ? accumulatedMs : 0;
    t.lastResumeAt = Number.isFinite(lastResumeAt) ? lastResumeAt : null;
    t.running = Boolean(saved?.running) && t.lastResumeAt !== null;

    // If it was running when we left, elapsedMs() naturally includes the
    // time the page was closed (Date.now() - lastResumeAt). Resume ticking.
    if (t.running) startTicking();
  } catch (e) {
    /* corrupt/unreadable — ignore and start clean */
  }
}

export function elapsedMs() {
  return t.accumulatedMs + (t.running && t.lastResumeAt ? Date.now() - t.lastResumeAt : 0);
}

export function timerState() {
  return {
    running: t.running,
    subject: t.subject,
    startedAt: t.startedAt,
    elapsedMs: elapsedMs(),
    active: t.startedAt !== null,
  };
}

export function start(subject) {
  if (t.running) return;
  if (t.startedAt === null) {
    t.startedAt = Date.now();
    t.accumulatedMs = 0;
  }
  t.subject = subject || t.subject;
  t.running = true;
  t.lastResumeAt = Date.now();
  startTicking();
  save();
  emit();
}

export function pause() {
  if (!t.running) return;
  t.accumulatedMs += Date.now() - t.lastResumeAt;
  t.lastResumeAt = null;
  t.running = false;
  stopTicking();
  save();
  emit();
}

export function setSubject(subject) {
  t.subject = subject;
  save();
  emit();
}

/** Stop and return the session bounds, then reset. Returns null if never started. */
export function stop() {
  if (t.startedAt === null) return null;
  if (t.running) {
    t.accumulatedMs += Date.now() - t.lastResumeAt;
  }
  const result = {
    subject: t.subject,
    startTime: t.startedAt,
    endTime: t.startedAt + t.accumulatedMs,
    elapsedMs: t.accumulatedMs,
  };
  reset();
  return result;
}

export function reset() {
  t.running = false;
  t.subject = '';
  t.startedAt = null;
  t.accumulatedMs = 0;
  t.lastResumeAt = null;
  stopTicking();
  save();
  emit();
}

// Rehydrate any in-flight session from a previous visit.
restore();

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(timerState());
}
function startTicking() {
  if (interval) return;
  interval = setInterval(emit, 1000);
}
function stopTicking() {
  if (interval && !t.running) {
    clearInterval(interval);
    interval = null;
  }
}
