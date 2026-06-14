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
  mode: 'stopwatch', // 'stopwatch' counts up; 'countdown' counts toward a target
  targetMs: 0, // countdown goal in ms (0 for stopwatch)
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
    const targetMs = Number(saved?.targetMs ?? 0);

    t.subject = typeof saved?.subject === 'string' ? saved.subject : '';
    t.startedAt = startedAt;
    t.accumulatedMs = Number.isFinite(accumulatedMs) && accumulatedMs >= 0 ? accumulatedMs : 0;
    t.lastResumeAt = Number.isFinite(lastResumeAt) ? lastResumeAt : null;
    t.running = Boolean(saved?.running) && t.lastResumeAt !== null;
    t.mode = saved?.mode === 'countdown' ? 'countdown' : 'stopwatch';
    t.targetMs = t.mode === 'countdown' && Number.isFinite(targetMs) && targetMs > 0 ? targetMs : 0;

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
  const elapsed = elapsedMs();
  const countdown = t.mode === 'countdown';
  return {
    running: t.running,
    subject: t.subject,
    startedAt: t.startedAt,
    elapsedMs: elapsed,
    active: t.startedAt !== null,
    mode: t.mode,
    targetMs: t.targetMs,
    // Countdown-only: time left (floored at 0) and whether the goal is reached.
    remainingMs: countdown ? Math.max(0, t.targetMs - elapsed) : null,
    completed: countdown ? elapsed >= t.targetMs : false,
  };
}

/**
 * Begin (or resume) a session. On a fresh session, `opts.mode` selects
 * 'stopwatch' (default) or 'countdown'; for countdown, `opts.targetMs` sets
 * the goal. Mode/target are locked once a session is underway.
 */
export function start(subject, opts = {}) {
  if (t.running) return;
  if (t.startedAt === null) {
    t.startedAt = Date.now();
    t.accumulatedMs = 0;
    if (opts.mode === 'countdown' && Number(opts.targetMs) > 0) {
      t.mode = 'countdown';
      t.targetMs = Math.round(Number(opts.targetMs));
    } else {
      t.mode = 'stopwatch';
      t.targetMs = 0;
    }
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
  t.mode = 'stopwatch';
  t.targetMs = 0;
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

let onComplete = null;
/**
 * Register the handler fired when a countdown reaches its target. Detection
 * lives in the global ticker (not any view), so completion finalizes even if
 * the user has navigated away from the Timer view. Returns the bounded
 * session result { subject, startTime, endTime, elapsedMs, completed }.
 */
export function setOnComplete(fn) { onComplete = fn; }

function emit() {
  for (const fn of listeners) fn(timerState());
}

/** One ticker step: finalize a finished countdown, otherwise just notify. */
function onTick() {
  if (t.mode === 'countdown' && t.running && elapsedMs() >= t.targetMs) {
    finishCountdown();
    return;
  }
  emit();
}

/** A countdown hit its goal: capture bounds capped to the target, reset, notify. */
function finishCountdown() {
  const result = {
    subject: t.subject,
    startTime: t.startedAt,
    endTime: t.startedAt + t.targetMs, // cap to the goal — never over-count
    elapsedMs: t.targetMs,
    completed: true,
  };
  reset(); // clears state + emits (subscribers see the session end)
  onComplete?.(result);
}

function startTicking() {
  if (interval) return;
  interval = setInterval(onTick, 1000);
}
function stopTicking() {
  if (interval && !t.running) {
    clearInterval(interval);
    interval = null;
  }
}
