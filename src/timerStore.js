/* ============================================================
   Live timer store — survives view navigation. Tracks elapsed
   time across pauses and notifies subscribers each second.
   ============================================================ */

/** Sessions shorter than this are discarded (anti-fat-finger / anti-exploit). */
export const MIN_SESSION_MS = 60000;

const listeners = new Set();

const t = {
  running: false,
  subject: '',
  startedAt: null, // ms, the real clock start of the session
  accumulatedMs: 0, // time banked before the current resume
  lastResumeAt: null,
};

let interval = null;

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
  emit();
}

export function pause() {
  if (!t.running) return;
  t.accumulatedMs += Date.now() - t.lastResumeAt;
  t.lastResumeAt = null;
  t.running = false;
  stopTicking();
  emit();
}

export function setSubject(subject) {
  t.subject = subject;
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
  emit();
}

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
