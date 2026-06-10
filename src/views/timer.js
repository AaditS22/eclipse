/* ============================================================
   Study Timer view — the central mechanic.
   ============================================================ */

import { getState } from '../state.js';
import * as timer from '../timerStore.js';
import { processSessionEnd } from '../session.js';
import { fmtClock, fmtDuration, escapeHtml, isoDate, prefersReducedMotion } from '../util.js';
import { modal, xpPopup, toast, renderSubjectPicker, promptSubjectCompletion } from '../ui.js';
import { confettiBurst, startFocusFx, stopFocusFx, spawnEvent } from '../pixel/starfield.js';
import { featuredPiece } from '../collection.js';
import { artSVG } from '../pixel/artgen.js';
import { MIN_SESSION_MS } from '../timerStore.js';
import { dailyProgress, totalDailyGoal, totalTodayMinutes, subjectTotalMinutes } from '../subjects.js';

let unsub = null;

// ---- Deep-Space Focus Mode state ----
const BEAT_MS = 25 * 60 * 1000; // a "focus beat" every 25 minutes
let focusOn = false;     // is the immersive view currently applied
let immersive = true;    // user preference for THIS session (minimize toggle)
let beatsSeen = 0;       // how many 25-min beats we've celebrated
let toggleBtn = null;

function fxEnabled() {
  return getState().settings?.focusFx !== false && !prefersReducedMotion();
}

function enterFocus() {
  if (focusOn) return;
  focusOn = true;
  document.body.classList.add('focus-mode');
  if (fxEnabled()) startFocusFx();
}

function exitFocus() {
  if (!focusOn) return;
  focusOn = false;
  document.body.classList.remove('focus-mode');
  stopFocusFx();
}

/** Reconcile focus mode with the live timer + the user's minimize choice. */
function applyFocus(st) {
  const want = st.active && immersive;
  if (want) enterFocus();
  else exitFocus();
  ensureToggle(st);
  if (!st.active) beatsSeen = 0;
}

/** A fixed pill to leave/re-enter the immersive view without stopping. */
function ensureToggle(st) {
  if (!st.active) { if (toggleBtn) { toggleBtn.remove(); toggleBtn = null; } return; }
  if (!toggleBtn) {
    toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn btn-ghost focus-toggle';
    toggleBtn.onclick = () => {
      immersive = !immersive;
      applyFocus(timer.timerState());
    };
    document.body.appendChild(toggleBtn);
  }
  toggleBtn.textContent = immersive ? '⤡ exit focus' : '⤢ focus view';
}

export function renderTimer(root, { rerenderAll, navigate }) {
  const s = getState();
  const ts = timer.timerState();

  const featured = featuredPiece(s);
  const featuredSprite = featured ? artSVG(featured, 4) : '';

  root.innerHTML = `
    <section class="panel timer-hero">
      ${featuredSprite ? `<div class="timer-collectible" title="${escapeHtml(featured.name)}">${featuredSprite}</div>` : ''}
      <div class="timer-subject" id="t-subject">${ts.subject ? escapeHtml(ts.subject) : 'SELECT A SUBJECT'}</div>
      <div class="timer-clock ${ts.running ? 'running' : ''}" id="t-clock">${fmtClock(ts.elapsedMs)}</div>

      <div id="t-pickwrap" style="max-width:320px;margin:16px auto 0"></div>

      <div class="btn-row" style="justify-content:center;margin-top:18px" id="t-controls"></div>
      <div id="t-hint" class="muted" style="margin-top:12px;font-size:11px"></div>
    </section>

    <section class="panel">
      <div class="panel-title">Today's Goal</div>
      <div id="t-goal"></div>
    </section>

    <section class="panel">
      <div class="between">
        <div class="panel-title" style="margin:0">By Subject</div>
        <button class="btn btn-ghost" id="t-editsubs" style="font-size:7px">Edit →</button>
      </div>
      <div id="t-subprog" style="margin-top:12px"></div>
    </section>
  `;

  const controls = root.querySelector('#t-controls');
  const clock = root.querySelector('#t-clock');
  const subjectLabel = root.querySelector('#t-subject');
  const pickWrap = root.querySelector('#t-pickwrap');

  root.querySelector('#t-editsubs').onclick = () => navigate('subjects');

  function renderPicker() {
    const st = timer.timerState();
    if (st.active) {
      pickWrap.innerHTML = ''; // locked while a session runs
      return;
    }
    renderSubjectPicker(pickWrap, {
      value: st.subject || '',
      onChange: (name) => { timer.setSubject(name); subjectLabel.textContent = name || 'SELECT A SUBJECT'; },
    });
  }

  function renderControls() {
    const st = timer.timerState();
    if (!st.active) {
      controls.innerHTML = `<button class="btn btn-primary btn-lg" id="t-start">▶ Start Studying</button>`;
      controls.querySelector('#t-start').onclick = () => {
        const subj = (timer.timerState().subject || '').trim();
        if (!subj) { toast('Pick a subject first, Commander.'); return; }
        timer.start(subj);
      };
    } else if (st.running) {
      controls.innerHTML = `
        <button class="btn" id="t-pause">⏸ Pause</button>
        <button class="btn btn-red" id="t-stop">⏹ Stop</button>`;
      controls.querySelector('#t-pause').onclick = () => timer.pause();
      controls.querySelector('#t-stop').onclick = doStop;
    } else {
      controls.innerHTML = `
        <button class="btn btn-green" id="t-resume">▶ Resume</button>
        <button class="btn btn-red" id="t-stop">⏹ Stop</button>`;
      controls.querySelector('#t-resume').onclick = () => timer.start();
      controls.querySelector('#t-stop').onclick = doStop;
    }
  }

  function doStop() {
    const result = timer.stop();
    // Leaving the session: drop the immersive view and reset for next time.
    exitFocus();
    immersive = true;
    beatsSeen = 0;
    if (toggleBtn) { toggleBtn.remove(); toggleBtn = null; }
    if (!result) return;
    if (result.elapsedMs < MIN_SESSION_MS) { toast('Session too short to log (under a minute).'); return; }
    const summary = processSessionEnd(result.subject, result.startTime, result.endTime);
    showSummary(summary, () => rerenderAll());
  }

  let lastActive = ts.active;
  function tick(st) {
    clock.textContent = fmtClock(st.elapsedMs);
    clock.classList.toggle('running', st.running);
    subjectLabel.textContent = st.subject ? st.subject : 'SELECT A SUBJECT';
    if (st.active !== lastActive) { lastActive = st.active; renderPicker(); }
    renderControls();
    renderTimerGoals(root);

    applyFocus(st);
    // Celebrate each 25-min focus beat with a guaranteed supernova.
    if (focusOn && st.running) {
      const beats = Math.floor(st.elapsedMs / BEAT_MS);
      if (beats > beatsSeen) {
        beatsSeen = beats;
        // Each beat earns a guaranteed cosmic spectacle (cycled).
        const big = ['supernova', 'blackhole', 'quasar', 'wormhole'][(beats - 1) % 4];
        spawnEvent(big);
        toast(`✦ ${beats * 25} minutes of deep focus.`);
      }
    }
  }

  renderPicker();
  renderControls();
  renderTimerGoals(root);
  applyFocus(ts);
  if (unsub) unsub();
  unsub = timer.subscribe(tick);
}

/** Today's overall goal bar + per-subject progress, so you see what to chase. */
function renderTimerGoals(root) {
  const s = getState();
  const today = isoDate();

  const goalBox = root.querySelector('#t-goal');
  if (goalBox) {
    const todayMins = totalTodayMinutes(s, today);
    const goal = totalDailyGoal(s);
    const pct = goal > 0 ? Math.min(1, todayMins / goal) : 0;
    goalBox.innerHTML = `
      <div class="between" style="margin-bottom:8px">
        <span class="pixel" style="font-size:12px">${fmtDuration(todayMins)} <span class="muted" style="font-size:10px">/ ${fmtDuration(goal)}</span></span>
        <span class="muted" style="font-size:10px">${Math.round(pct * 100)}%</span>
      </div>
      <div class="gauge"><div class="gauge-fill" style="width:${(pct * 100).toFixed(1)}%"></div></div>`;
  }

  const subBox = root.querySelector('#t-subprog');
  if (subBox) {
    const prog = dailyProgress(s, today);
    subBox.innerHTML = prog.length
      ? prog
          .map(
            (p) => `<div class="subject-prog compact">
              <div class="sp-head">
                <span class="swatch" style="width:9px;height:9px;background:${p.color}"></span>
                <span class="sp-name">${escapeHtml(p.name)}${p.done ? ' <span style="color:var(--green)">✓</span>' : ''}</span>
                <span class="sp-nums muted">${fmtDuration(p.mins)}${p.goal > 0 ? ` / ${fmtDuration(p.goal)}` : ''}</span>
              </div>
              <div class="q-bar"><div class="q-fill" style="width:${(p.pct * 100).toFixed(0)}%;background:${p.done ? 'var(--green)' : p.color}"></div></div>
            </div>`
          )
          .join('')
      : `<div class="muted">No subjects yet. <a href="#" id="t-addsub">Add one →</a></div>`;
    subBox.querySelector('#t-addsub')?.addEventListener('click', (e) => { e.preventDefault(); root.querySelector('#t-editsubs').click(); });
  }
}

/** Session-complete modal → COLLECT triggers XP popup + level-up burst. */
function showSummary(summary, onClose) {
  const b = summary.breakdown;
  const rows = [];
  rows.push(`<div class="summary-row"><span>Subject</span><span class="v">${escapeHtml(summary.subject)}</span></div>`);
  rows.push(`<div class="summary-row"><span>Duration</span><span class="v">${fmtDuration(summary.durationMinutes)}</span></div>`);
  rows.push(
    `<div class="summary-row"><span>Time XP ${b.multiplier > 1 ? `(×${b.multiplier})` : ''}</span><span class="v">+${b.timeXp} ⭐</span></div>`
  );
  if (b.capped) rows.push(`<div class="summary-row"><span class="muted">Daily time-XP cap reached</span><span class="v muted">—</span></div>`);
  for (const bonus of b.bonuses) {
    rows.push(`<div class="summary-row bonus"><span>${bonus.label} ${bonus.icon}</span><span class="v">+${bonus.xp} ⭐</span></div>`);
  }
  // Quest rewards rolled into this session.
  for (const q of summary.completedQuests || []) {
    rows.push(`<div class="summary-row bonus"><span>Quest: ${escapeHtml(q.label)} ${q.icon}</span><span class="v">+${q.rewardXp} ⭐</span></div>`);
  }
  rows.push(`<div class="summary-row" style="border-bottom:none;font-weight:700"><span>Total XP</span><span class="v">+${summary.totalXp ?? b.total} ⭐</span></div>`);
  if (summary.creditsEarned > 0)
    rows.push(`<div class="summary-row"><span>Credits</span><span class="v" style="color:var(--green)">+${summary.creditsEarned} ◈</span></div>`);

  let extras = '';
  if (summary.rankedUp) extras += `<div class="badge-ribbon" style="background:var(--accent);color:#0b0e1a">🪐 RANK UP! Reached ${summary.newPlanet.name}</div>`;
  if (summary.leveledUp) extras += `<div class="badge-ribbon" style="background:var(--yellow)">⬆ LEVEL UP! → ${summary.newLevel}</div>`;
  for (const a of summary.newAchievements)
    extras += `<div class="badge-ribbon" style="background:var(--purple);color:#fff">${a.icon} Achievement: ${a.name}</div>`;

  // A gentle, opt-in nudge that finishing a subject is a thing — shown only
  // once a subject has real time invested, and worded so it can't be mistaken
  // for "done for today". Clicking opens the explicit, permanent confirm.
  const sub = getState().subjects.find((x) => x.name === summary.subject);
  const canFinish = sub && !sub.completedAt && subjectTotalMinutes(getState(), sub.name) >= 60;
  const finishHint = canFinish
    ? `<div class="finish-hint">Wrapping up <b>${escapeHtml(summary.subject)}</b> for good?
         <button class="btn-link" id="t-finish">Complete it &amp; forge its relic →</button></div>`
    : '';

  const close = modal(
    `<h2>★ Session Complete ★</h2>${rows.join('')}${extras}${finishHint}`,
    [
      {
        label: 'Collect',
        className: 'btn-primary',
        onClick: (c) => {
          c();
          xpPopup(`+${summary.totalXp ?? b.total} XP`);
          if (summary.rankedUp) {
            confettiBurst();
            setTimeout(() => toast(`🪐 Rank up — welcome to ${summary.newPlanet.name}!`), 200);
          } else if (summary.leveledUp) {
            confettiBurst();
            setTimeout(() => toast(`⬆ Reached Level ${summary.newLevel}!`), 200);
          }
          onClose?.();
        },
      },
    ]
  );

  if (canFinish) {
    document.getElementById('t-finish')?.addEventListener('click', () => {
      close();
      promptSubjectCompletion(summary.subject, () => onClose?.());
    });
  }
}

export function cleanupTimer() {
  if (unsub) { unsub(); unsub = null; }
  // Drop the immersive overlay when leaving the timer view. The session
  // itself keeps running in the global timer store; focus re-applies on
  // return. (Only reachable when minimized, since nav is hidden otherwise.)
  exitFocus();
  if (toggleBtn) { toggleBtn.remove(); toggleBtn = null; }
}
