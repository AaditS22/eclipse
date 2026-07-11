/* ============================================================
   Home Dashboard — Eclipse landing screen.
   ============================================================ */

import { getState, update } from '../state.js';
import * as timer from '../timerStore.js';
import { fmtDuration, isoDate, escapeHtml, DAYS } from '../util.js';
import { rocketSVG, exhaustSVG, eclipseLogoSVG, planetIconSVG } from '../pixel/sprites.js';
import { toast, renderSubjectPicker, promptNewSubject } from '../ui.js';
import { featuredPiece } from '../collection.js';
import { artSVG } from '../pixel/artgen.js';
import { prefersReducedMotion } from '../util.js';
import { rankProgress } from '../rank.js';
import { dailyProgress, totalDailyGoal, totalTodayMinutes } from '../subjects.js';
import {
  currentPerformance,
  tierColorVar,
  performanceTips,
  dayModeOf,
  DAY_MODES,
  DAY_MODE_ORDER,
  CP_MIN_SCORE,
  CP_MAX_SCORE,
} from '../cognitivePerformance.js';
import { dailyRecords, productivitySummary } from '../productivity.js';
import { dailyQuote } from '../quotes.js';

export function renderDashboard(root, { navigate, rerenderAll }) {
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

    ${wellbeingQuoteHTML()}

    ${performanceHTML(s)}

    ${productivityStripHTML(s)}

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

  root.querySelector('#d-recmore')?.addEventListener('click', () => navigate('profile'));

  root.querySelector('#d-orbitbtn').onclick = () => navigate('orbit');
  root.querySelector('#d-orbit').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    navigate('orbit');
  });

  // Day-mode selector on the weekly-performance card: changing it re-targets
  // the whole score, so re-render the dashboard to reflect the new mode.
  root.querySelectorAll('.cp-mode').forEach((b) =>
    b.addEventListener('click', () => {
      const mode = b.dataset.mode;
      if (mode === dayModeOf(getState())) return;
      update((st) => {
        st.settings.dayMode = mode;
      });
      rerenderAll ? rerenderAll() : navigate('dashboard', { animate: false });
    })
  );

  renderConstellation(root.querySelector('#d-constellation'));
}

/** Replaces the "Start Studying" CTA when a session is already underway, so
 *  the home screen reflects reality and offers a jump back to the Timer. */
function studyingNowHTML(ts) {
  const subj = ts.subject ? escapeHtml(ts.subject) : 'a focus session';
  const mins = Math.floor(ts.elapsedMs / 60000);
  const elapsed = mins >= 1 ? ` · ${fmtDuration(mins)}` : '';
  // Sessions are always running while active (no pause state).
  return `<div class="muted" style="font-size:11px;margin-bottom:8px">Mission in progress <span class="crew-live">● LIVE</span></div>
    <div class="pixel" style="font-size:16px;margin-bottom:14px">Studying ${subj}${elapsed}</div>
    <button class="btn btn-primary btn-lg" id="d-resume">Go to Timer →</button>`;
}

// Plain-language help for each week type: what it means + the target it sets.
// The whole point of the selector is to pick the right yardstick for YOUR week,
// so a lecture week isn't judged against exam-crunch hours and vice-versa.
const DAY_MODE_HELP = {
  lecture: { blurb: 'A normal week with lectures', target: '4h per weekday · 8h per weekend day' },
  white: { blurb: 'No lectures — revision or exam prep', target: '10h every day' },
  holidays: { blurb: 'A break — studying is a bonus here', target: '5h every day · counts for extra credit' },
};

/** The week-type selector: a clear prompt, three buttons, and a line spelling
 *  out what the chosen week means and the study target it sets. */
function dayModeSelectorHTML(s) {
  const cur = dayModeOf(s);
  const btns = DAY_MODE_ORDER.map((k) => {
    const m = DAY_MODES[k];
    return `<button class="btn ${k === cur ? 'btn-primary' : 'btn-ghost'} cp-mode" data-mode="${k}" title="${m.label}">${m.short}</button>`;
  }).join('');
  const help = DAY_MODE_HELP[cur];
  return `
    <div class="cp-mode-prompt muted">What kind of week is it?</div>
    <div class="cp-modes">${btns}</div>
    <div class="cp-mode-desc"><b>${escapeHtml(DAY_MODES[cur].label)}</b> — ${escapeHtml(help.blurb)}. Target: ${escapeHtml(help.target)}.</div>`;
}

/**
 * Weekly Cognitive Performance card (sections 2–5): a single -10..+10 score
 * for the whole week, its five-tier label, a diverging meter, the burnout-risk
 * flag (kept adjacent to the score, never folded into it), and a short tip.
 * The week-type selector always shows so the target can be set; the scored body
 * appears once there's enough of a week to judge (avoids nagging early on).
 */
function performanceHTML(s) {
  const perf = currentPerformance(s);
  const modeSel = dayModeSelectorHTML(s);
  const head = `<div class="panel-title" style="margin:0">Weekly Performance</div>`;
  // One-line framing so the number and the buttons aren't a mystery.
  const intro = `<div class="cp-intro muted">A single score for how well this week's studying matched a healthy, steady target — from −10 (barely studied / all crammed into one day) to +10 (right on target, every day). Pick your week type so it's measured against the right goal.</div>`;

  if (!perf.enough) {
    return `
    <section class="panel">
      <div class="between">${head}</div>
      ${intro}
      ${modeSel}
      <div class="cp-empty muted">Log a little study this week and your score will appear here.</div>
    </section>`;
  }

  const color = `var(${tierColorVar(perf.tier)})`;
  const signed = perf.score > 0 ? `+${perf.score}` : `${perf.score}`;
  // Diverging meter: 0 sits dead-centre, the marker slides toward -10 / +10.
  const markerPct = ((perf.score - CP_MIN_SCORE) / (CP_MAX_SCORE - CP_MIN_SCORE)) * 100;
  const consistPct = Math.round(perf.consistency * 100);

  const burnout =
    perf.burnoutRisk === 'high' || perf.burnoutRisk === 'medium'
      ? `<div class="cp-burnout ${perf.burnoutRisk}">🔥 Burnout risk: ${perf.burnoutRisk} — well over target and sustained. Build in some recovery.</div>`
      : '';

  const tips = performanceTips(perf);
  const tipCard = tips.length
    ? `<div class="cl-suggest">
         <div class="cl-suggest-head">💡 This week</div>
         ${tips.map((t) => `<div class="cl-suggest-item">${escapeHtml(t)}</div>`).join('')}
       </div>`
    : '';

  return `
    <section class="panel">
      <div class="between">
        ${head}
        <span class="cl-chip" style="background:${color}">${escapeHtml(perf.label)}</span>
      </div>
      ${intro}
      ${modeSel}
      <div class="cl-meter-row" style="margin-top:16px">
        <div class="cl-score" style="color:${color}">${signed}</div>
        <div style="flex:1">
          <div class="cp-track">
            <div class="cp-track-zero"></div>
            <div class="cp-marker" style="left:${markerPct.toFixed(1)}%;background:${color}"></div>
          </div>
          <div class="cp-scale muted">
            <span>−10 needs work</span><span>0</span><span>+10 optimal</span>
          </div>
        </div>
      </div>
      <div class="muted" style="font-size:10px;margin-top:10px">
        You've studied <b>${fmtDuration(perf.total)}</b> of this week's <b>${fmtDuration(perf.target)}</b> target, and your sessions have been <b>${consistPct}%</b> consistent day-to-day.
      </div>
      ${burnout}
      ${tipCard}
    </section>`;
}

/**
 * A short, rotating wellbeing reminder (section 7). Deterministic per calendar
 * day and drawn from discipline / nutrition / sleep / exercise / wellbeing —
 * regular, plain reminders of consequences and benefits nudge daily behaviour.
 */
function wellbeingQuoteHTML() {
  const q = dailyQuote();
  return `
    <section class="panel wellbeing-quote">
      <div class="wq-cat">${escapeHtml(q.category)}</div>
      <div class="wq-text">${escapeHtml(q.text)}</div>
    </section>`;
}

/**
 * 24-Hour Productivity strip: a ring per day (last 7) showing % of the day
 * spent studying, plus the personal best and current "maintaining" streak —
 * a moving, personal bar rather than a universal target.
 */
function productivityStripHTML(s) {
  if (s.sessions.length === 0) return '';
  const days = dailyRecords(s.sessions, 7);
  const { best, average, streak } = productivitySummary(s.sessions);
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c5cfc';

  const rings = days
    .map((d) => {
      const pct = Math.round(d.pct * 100);
      const deg = Math.max(0, Math.min(360, d.pct * 360));
      const beatsAvg = average > 0 && d.pct >= average && d.minutes > 0;
      const ringColor = beatsAvg ? 'var(--green)' : accent;
      const label = d.minutes > 0 ? `${pct >= 1 ? pct : '<1'}%` : '·';
      return `<div class="rec-day" title="${d.dayLabel}: ${fmtDuration(d.minutes)} (${pct}% of 24h)">
        <div class="rec-ring" style="background:conic-gradient(${ringColor} ${deg}deg, var(--surface-2) 0)">
          <div class="rec-ring-hole">${label}</div>
        </div>
        <div class="rec-daylabel">${d.dayLabel}</div>
      </div>`;
    })
    .join('');

  return `
    <section class="panel">
      <div class="between">
        <div class="panel-title" style="margin:0">24-Hour Record · Past Week</div>
        <button class="btn btn-ghost" id="d-recmore" style="font-size:7px">Full log →</button>
      </div>
      <div class="rec-strip" style="margin-top:12px">${rings}</div>
      <div class="rec-stats">
        <div><b style="color:var(--yellow)">${Math.round(best * 100)}%</b><span>personal best</span></div>
        <div><b style="color:var(--green)">${streak}</b><span>day maintain streak</span></div>
        <div><b>${Math.round(average * 100)}%</b><span>your recent avg</span></div>
      </div>
    </section>`;
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
