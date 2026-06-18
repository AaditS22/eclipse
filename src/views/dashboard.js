/* ============================================================
   Home Dashboard — Eclipse landing screen.
   ============================================================ */

import { getState } from '../state.js';
import * as timer from '../timerStore.js';
import { fmtDuration, isoDate, escapeHtml, DAYS } from '../util.js';
import { rocketSVG, exhaustSVG, eclipseLogoSVG, planetIconSVG } from '../pixel/sprites.js';
import { toast, renderSubjectPicker, promptNewSubject } from '../ui.js';
import { featuredPiece } from '../collection.js';
import { artSVG } from '../pixel/artgen.js';
import { prefersReducedMotion } from '../util.js';
import { rankProgress } from '../rank.js';
import { dailyProgress, totalDailyGoal, totalTodayMinutes } from '../subjects.js';

export function renderDashboard(root, { navigate }) {
  const s = getState();
  const today = isoDate();
  const ts = timer.timerState(); // a session in progress (active) hijacks the start CTA

  const totalGoal = totalDailyGoal(s);
  const totalMins = totalTodayMinutes(s, today);
  const goalPct = totalGoal > 0 ? Math.min(1, totalMins / totalGoal) : 0;
  const prog = dailyProgress(s, today);

  const rocketId = s.user.avatarConfig.rocket;
  const rocketLeft = `calc(${(goalPct * 100).toFixed(1)}% )`;
  const rp = rankProgress(s.rank?.monthlyXp || 0);

  // Featured relic (floats in the hero).
  const featured = featuredPiece(s);
  const featuredSprite = featured ? artSVG(featured, 3) : '';

  const hasSubjects = s.subjects.some((x) => !x.completedAt);

  root.innerHTML = `
    <section class="panel eclipse-hero">
      ${featuredSprite ? `<div class="hero-collectible" title="${escapeHtml(featured.name)}">${featuredSprite}</div>` : ''}
      <div class="eclipse-logo">${eclipseLogoSVG(7)}</div>
      <div class="eclipse-wordmark">ECLIPSE</div>
      <div class="eclipse-tagline">Focus is the mission.</div>
    </section>

    <section class="panel center">
      ${ts.active
        ? studyingNowHTML(ts)
        : hasSubjects
          ? `<div style="max-width:320px;margin:0 auto 14px" id="d-pick"></div>
             <button class="btn btn-primary btn-lg" id="d-start">▶ Start Studying</button>`
          : `<div class="muted" style="font-size:12px;margin-bottom:14px">Set up your subjects to begin — pick what you study and a daily time goal for each.</div>
             <button class="btn btn-primary btn-lg" id="d-setup">🛰️ Set Up Subjects</button>`
      }
    </section>

    ${hasSubjects ? `
    <section class="panel">
      <div class="between">
        <div>
          <div class="panel-title" style="margin-bottom:6px">Today</div>
          <div class="pixel" style="font-size:14px">${fmtDuration(totalMins)} <span class="muted" style="font-size:11px">/ ${fmtDuration(totalGoal)}</span></div>
        </div>
        <button class="btn btn-ghost" id="d-editsubs" style="font-size:7px">Edit Subjects</button>
      </div>
      <div class="goalbar" style="margin-top:12px">
        <div class="goalbar-fill" style="width:${(goalPct * 100).toFixed(1)}%"></div>
        <div class="goalbar-rocket" style="left:${rocketLeft}">
          ${!prefersReducedMotion() ? `<span class="goalbar-rocket-exhaust exhaust-flame" style="position:absolute;right:100%;top:50%;transform:translateY(-50%)">${exhaustSVG(2)}</span>` : ''}
          ${rocketSVG(rocketId, 2)}
        </div>
      </div>
      ${goalPct >= 1 && totalGoal > 0 ? `<div class="muted" style="margin-top:8px;color:var(--green)">🎯 Daily goal reached. Mission accomplished.</div>` : ''}
      <div id="d-subprog" style="margin-top:14px"></div>
    </section>` : ''}

    <section class="panel orbit-teaser" id="d-orbit">
      <div class="between">
        <div class="panel-title" style="margin:0">Orbital Rank · This Month</div>
        <button class="btn btn-ghost" id="d-orbitbtn" style="font-size:7px">Open Orbit →</button>
      </div>
      <div class="orbit-teaser-body" style="margin-top:12px">
        <div class="orbit-planet">${planetIconSVG(rp.planet.id, 4)}<div class="op-name">${rp.planet.name}</div></div>
        <div class="orbit-track-mini">
          <div class="gauge"><div class="gauge-fill" style="width:${(rp.pct * 100).toFixed(1)}%"></div></div>
          <div class="muted" style="font-size:10px;margin-top:6px;text-align:center">
            ${rp.isMax ? 'Maximum rank reached — legend.' : `${rp.toNext.toLocaleString()} XP to ${rp.next.name}`}
          </div>
        </div>
        <div class="orbit-planet ${rp.isMax ? '' : 'dim'}">${planetIconSVG((rp.next || rp.planet).id, 4)}<div class="op-name">${rp.isMax ? '★' : rp.next.name}</div></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">Weekly Activity · Constellation</div>
      <div id="d-constellation"></div>
    </section>
  `;

  // Center CTA: a live session takes over; otherwise the quick-start picker.
  if (ts.active) {
    root.querySelector('#d-resume').onclick = () => navigate('timer');
  } else if (hasSubjects) {
    let chosen = ts.subject || '';
    if (!s.subjects.some((x) => x.name === chosen && !x.completedAt)) chosen = '';
    const pick = root.querySelector('#d-pick');
    renderSubjectPicker(pick, { value: chosen, onChange: (name) => { chosen = name; } });

    root.querySelector('#d-start').onclick = () => {
      if (!chosen) { toast('Pick a subject first, Commander.'); return; }
      // Carry the chosen subject over, but let the Timer view pick the mode
      // (stopwatch vs countdown) rather than launching straight into one.
      timer.setSubject(chosen);
      navigate('timer');
    };
  } else {
    root.querySelector('#d-setup').onclick = () => navigate('subjects');
  }

  // Per-subject progress bars (whenever subjects exist, live session or not).
  if (hasSubjects) {
    root.querySelector('#d-editsubs').onclick = () => navigate('subjects');
    const sp = root.querySelector('#d-subprog');
    sp.innerHTML = prog
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
      .join('');
  }

  root.querySelector('#d-orbitbtn').onclick = () => navigate('orbit');
  root.querySelector('#d-orbit').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    navigate('orbit');
  });

  renderConstellation(root.querySelector('#d-constellation'));
}

/** Replaces the "Start Studying" CTA when a session is already underway, so
 *  the home screen reflects reality and offers a jump back to the Timer. */
function studyingNowHTML(ts) {
  const subj = ts.subject ? escapeHtml(ts.subject) : 'a focus session';
  const mins = Math.floor(ts.elapsedMs / 60000);
  const elapsed = mins >= 1 ? ` · ${fmtDuration(mins)}` : '';
  if (ts.running) {
    return `<div class="muted" style="font-size:11px;margin-bottom:8px">Mission in progress <span class="crew-live">● LIVE</span></div>
      <div class="pixel" style="font-size:16px;margin-bottom:14px">Studying ${subj}${elapsed}</div>
      <button class="btn btn-primary btn-lg" id="d-resume">Go to Timer →</button>`;
  }
  return `<div class="muted" style="font-size:11px;margin-bottom:8px">Session paused</div>
    <div class="pixel" style="font-size:16px;margin-bottom:14px">${subj}${elapsed}</div>
    <button class="btn btn-primary btn-lg" id="d-resume">⏸ Resume Session</button>`;
}

/**
 * Weekly constellation: one column per day (last 7). A square star per
 * session, with lines linking consecutive active days. Stars are real
 * pixel squares (absolutely positioned) so they never stretch.
 */
function renderConstellation(box) {
  const s = getState();
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c5cfc';

  const H = 150;
  const MAX_STARS = 4;
  const STAR_GAP = 24;
  const BASE_Y = H - 34;

  const cols = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const iso = isoDate(d);
    const count = s.sessions.filter((x) => isoDate(new Date(x.startTime)) === iso).length;
    cols.push({ label: DAYS[d.getDay()], count: Math.min(count, MAX_STARS), raw: count });
  }

  const n = cols.length;
  const pts = cols.map((c, i) => {
    const x = ((i + 0.5) / n) * 100;
    const topY = c.count > 0 ? BASE_Y - (c.count - 1) * STAR_GAP : null;
    return { ...c, x, topY };
  });

  let lines = '';
  let prev = null;
  for (const p of pts) {
    if (p.topY !== null) {
      if (prev) lines += `<line x1="${prev.x}" y1="${prev.topY}" x2="${p.x}" y2="${p.topY}" stroke="${accent}" stroke-width="1.4"/>`;
      prev = p;
    }
  }

  let stars = '';
  let labels = '';
  for (const p of pts) {
    labels += `<div class="const-label" style="left:${p.x}%">${p.label}</div>`;
    if (p.count > 0) {
      for (let k = 0; k < p.count; k++) {
        const y = BASE_Y - k * STAR_GAP;
        const color = k === 0 ? accent : '#f5c518';
        stars += `<div class="const-star" style="left:${p.x}%;top:${y}px;background:${color};box-shadow:0 0 6px ${color}"></div>`;
      }
    } else {
      stars += `<div class="const-star dim" style="left:${p.x}%;top:${BASE_Y}px"></div>`;
    }
  }

  box.innerHTML = `
    <div class="const-wrap" style="height:${H}px">
      <svg class="const-lines" viewBox="0 0 100 ${H}" preserveAspectRatio="none">${lines}</svg>
      ${stars}
      ${labels}
    </div>
    <div class="muted center" style="font-size:10px">${s.sessions.length === 0 ? 'No sessions yet — start your first mission.' : 'Each star is a logged session.'}</div>`;
}
