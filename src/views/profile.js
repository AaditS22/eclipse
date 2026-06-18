/* ============================================================
   Profile — the player's hub. A themed user card (avatar + suit,
   recoloured by the equipped Dashboard theme, with any featured
   art), then their stats, their earned commemorative relics,
   achievements, and the session log.
   ============================================================ */

import { getState, update } from '../state.js';
import { ACHIEVEMENTS } from '../achievements.js';
import { fmtDuration, isoDate, escapeHtml, fmtCredits, DAYS } from '../util.js';
import { artSVG, seedSig, fitScale, getRelicTier } from '../pixel/artgen.js';
import { astronautSVG, planetIconSVG } from '../pixel/sprites.js';
import { levelName } from '../xp.js';
import { rankProgress } from '../rank.js';
import { modal, toast } from '../ui.js';

export function renderProfile(root, { rerenderAll }) {
  const s = getState();
  const u = s.user;
  const sessions = s.sessions;

  const totalMin = sessions.reduce((a, x) => a + x.durationMinutes, 0);
  const weekMin = rangeMinutes(sessions, 7);
  const monthMin = rangeMinutes(sessions, 30);
  const avgLen = sessions.length ? Math.round(totalMin / sessions.length) : 0;

  const relics = [...(u.collection || [])]
    .filter((p) => p.kind === 'relic')
    .sort((a, b) => b.createdAt - a.createdAt);

  root.innerHTML = `
    ${userCardHTML(s, totalMin)}

    <section class="panel">
      <div class="panel-title">Mission Log Stats</div>
      <div class="stat-grid">
        <div class="stat-box"><div class="v">${fmtDuration(weekMin)}</div><div class="k">This Week</div></div>
        <div class="stat-box"><div class="v">${fmtDuration(monthMin)}</div><div class="k">This Month</div></div>
        <div class="stat-box"><div class="v">${fmtDuration(totalMin)}</div><div class="k">All Time</div></div>
        <div class="stat-box"><div class="v">${fmtDuration(avgLen)}</div><div class="k">Avg Session</div></div>
        <div class="stat-box"><div class="v">${sessions.length}</div><div class="k">Sessions</div></div>
        <div class="stat-box"><div class="v">${new Set(sessions.map((x) => x.subject)).size}</div><div class="k">Subjects</div></div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">Time by Subject</div>
      <div id="pf-donut"></div>
    </section>

    <section class="panel">
      <div class="panel-title">Most Productive Time</div>
      <div id="pf-heat"></div>
    </section>

    ${relics.length ? `<section class="panel relic-panel">
      <div class="panel-title">🏆 Commemorative Relics · ${relics.length}</div>
      <div class="muted" style="font-size:11px;margin-bottom:12px">Earned by completing a subject — colour reflects the tier you reached.</div>
      <div class="polaroid-grid">${relics.map((p) => polaroidHTML(p, s)).join('')}</div>
    </section>` : ''}

    <section class="panel">
      <div class="panel-title">Achievements</div>
      <div class="ach-grid">
        ${ACHIEVEMENTS.map((a) => {
          const unlocked = s.achievements.includes(a.id);
          return `<div class="ach ${unlocked ? 'unlocked' : 'locked'}">
            <div class="ico">${a.icon}</div>
            <div class="a-name">${a.name}</div>
            <div class="a-desc">${unlocked ? a.desc : '???'}</div>
          </div>`;
        }).join('')}
      </div>
    </section>

    <section class="panel">
      <div class="between">
        <div class="panel-title" style="margin:0">Session Log</div>
        <select id="pf-filter" style="max-width:160px"></select>
      </div>
      <div class="session-log" id="pf-log" style="margin-top:12px"></div>
    </section>
  `;

  renderDonut(root.querySelector('#pf-donut'), sessions);
  renderHeatmap(root.querySelector('#pf-heat'), sessions);
  renderLog(root, sessions);

  root.querySelectorAll('.piece-card').forEach((el) =>
    el.addEventListener('click', () => openPiece(el.dataset.id, rerenderAll))
  );
}

/* ---------------- User card ---------------- */
function userCardHTML(s, totalMin) {
  const u = s.user;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7c5cfc';
  const rp = rankProgress(s.rank?.monthlyXp || 0);
  const hours = (totalMin / 60).toFixed(totalMin >= 600 ? 0 : 1).replace(/\.0$/, '');
  const featured = u.featuredArt ? (u.collection || []).find((p) => p.id === u.featuredArt) : null;

  const featuredHTML = featured
    ? `<div class="pc-featured">
         <div class="pl-frame">${artSVG(featured, fitScale(featured, 64))}</div>
         <div class="pl-cap">${escapeHtml(featured.name)}</div>
       </div>`
    : `<div class="pc-featured empty"><div class="muted" style="font-size:9px;text-align:center;line-height:1.4">Feature<br>art</div></div>`;

  return `<section class="profile-card" style="border-color:${accent};background:linear-gradient(140deg, ${accent}24, var(--surface-2) 62%);box-shadow:0 0 22px ${accent}33">
    <div class="pc-main">
      <div class="pc-avatar" style="border-color:${accent}">${astronautSVG(u.avatarConfig, 5)}</div>
      <div class="pc-id">
        <div class="pc-name">${escapeHtml(u.username)}</div>
        <div class="pc-sub" style="color:${accent}">LVL ${u.level} · ${levelName(u.level)}</div>
        <div class="pc-planet muted">${planetIconSVG(rp.planet.id, 2)} ${rp.planet.name}</div>
      </div>
      ${featuredHTML}
    </div>
    <div class="pc-stats">
      <div><b>${hours}h</b><span>studied</span></div>
      <div><b>${u.level}</b><span>level</span></div>
      <div><b>${u.streak}</b><span>day streak</span></div>
      <div><b>${fmtCredits(u.credits)}</b><span>credits</span></div>
    </div>
  </section>`;
}

/* ---------------- Collection: relic polaroids ---------------- */
function polaroidHTML(p, s) {
  const featured = s.user.featuredArt === p.id;
  const tint = p.tierColor || getRelicTier(p.tier).color;
  const tag = featured ? '★ FEATURED' : `🏆 ${(p.tierLabel || getRelicTier(p.tier).label)}`;
  return `<figure class="polaroid piece-card${featured ? ' featured' : ''}" data-id="${p.id}" style="--tint:${tint}">
    <div class="pl-frame">${artSVG(p, fitScale(p, 104))}</div>
    <figcaption class="pl-cap">${escapeHtml(p.name)}</figcaption>
    <div class="pl-tag" style="color:${tint}">${tag}</div>
  </figure>`;
}

function openPiece(id, rerenderAll) {
  const s = getState();
  const p = (s.user.collection || []).find((x) => x.id === id);
  if (!p || p.kind !== 'relic') return;
  const featured = s.user.featuredArt === id;
  const tier = getRelicTier(p.tier);

  const meta = `
    <div class="center" style="margin:8px 0 14px;filter:drop-shadow(0 0 10px ${tier.color})">${artSVG(p, fitScale(p, 130))}</div>
    <div class="summary-row"><span>Type</span><span class="v" style="color:${tier.color}">🏆 ${tier.label} Relic</span></div>
    <div class="summary-row"><span>Earned for</span><span class="v">${escapeHtml(p.engraving)}</span></div>
    <div class="summary-row"><span>Studied</span><span class="v">${(p.minutes / 60).toFixed(1).replace(/\.0$/, '')} hours</span></div>
    <div class="summary-row"><span>Completed</span><span class="v">${p.earnedAt || isoDate(new Date(p.createdAt))}</span></div>
    <div class="summary-row"><span>Seed</span><span class="v">#${seedSig(p)}</span></div>
  `;

  const actions = [
    { label: 'Close', className: 'btn-ghost', onClick: (c) => c() },
    {
      label: featured ? 'Unfeature' : 'Feature on card',
      className: featured ? 'btn' : 'btn-green',
      onClick: (close) => {
        update((st) => { st.user.featuredArt = featured ? null : id; });
        close();
        toast(featured ? 'No longer featured.' : `Featured: ${p.name}`);
        rerenderAll();
      },
    },
  ];

  modal(`<h2>🏆 ${escapeHtml(p.name)}</h2>${meta}`, actions);
}

/* ---------------- Stats charts (moved from the old Stats tab) ---------------- */
function rangeMinutes(sessions, days) {
  const cutoff = Date.now() - days * 86400000;
  return sessions.filter((x) => x.startTime >= cutoff).reduce((a, x) => a + x.durationMinutes, 0);
}

function renderDonut(box, sessions) {
  if (sessions.length === 0) {
    box.innerHTML = `<div class="muted">No data yet. Log a session to see your breakdown.</div>`;
    return;
  }
  const bysubj = {};
  for (const x of sessions) bysubj[x.subject] = (bysubj[x.subject] || 0) + x.durationMinutes;
  const subjColors = Object.fromEntries(getState().subjects.map((s) => [s.name, s.color]));
  const entries = Object.entries(bysubj).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((a, [, v]) => a + v, 0);

  let acc = 0;
  const stops = entries
    .map(([name, v], i) => {
      const color = subjColors[name] || ['#7c5cfc', '#39d98a', '#f5c518', '#ff4c61', '#3b82f6'][i % 5];
      const from = (acc / total) * 360;
      acc += v;
      const to = (acc / total) * 360;
      return `${color} ${from}deg ${to}deg`;
    })
    .join(', ');

  const legend = entries
    .map(([name, v], i) => {
      const color = subjColors[name] || ['#7c5cfc', '#39d98a', '#f5c518', '#ff4c61', '#3b82f6'][i % 5];
      return `<div class="between" style="margin-bottom:6px">
        <span><span class="dot" style="display:inline-block;width:10px;height:10px;background:${color};margin-right:8px"></span>${escapeHtml(name)}</span>
        <span class="muted">${fmtDuration(v)} · ${Math.round((v / total) * 100)}%</span>
      </div>`;
    })
    .join('');

  box.innerHTML = `<div class="row" style="align-items:center;gap:20px;flex-wrap:wrap">
    <div style="width:120px;height:120px;border-radius:50%;background:conic-gradient(${stops});
      -webkit-mask:radial-gradient(circle, transparent 38px, #000 39px);
      mask:radial-gradient(circle, transparent 38px, #000 39px);
      image-rendering:auto;clip-path:polygon(50% 0,61% 10%,75% 5%,80% 20%,95% 25%,90% 40%,100% 50%,90% 60%,95% 75%,80% 80%,75% 95%,61% 90%,50% 100%,39% 90%,25% 95%,20% 80%,5% 75%,10% 60%,0 50%,10% 40%,5% 25%,20% 20%,25% 5%,39% 10%)"></div>
    <div style="flex:1;min-width:180px">${legend}</div>
  </div>`;
}

function renderHeatmap(box, sessions) {
  if (sessions.length === 0) {
    box.innerHTML = `<div class="muted">No data yet.</div>`;
    return;
  }
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const x of sessions) {
    const d = new Date(x.startTime);
    grid[d.getDay()][d.getHours()] += x.durationMinutes;
  }
  const max = Math.max(1, ...grid.flat());

  let rows = '';
  rows += `<div class="heatmap"><div></div>` +
    Array.from({ length: 24 }, (_, h) => `<div style="color:#5a6380;text-align:center">${h % 6 === 0 ? h : ''}</div>`).join('') +
    `</div>`;
  for (let day = 0; day < 7; day++) {
    rows += `<div class="heatmap"><div style="color:#5a6380;display:flex;align-items:center">${DAYS[day]}</div>`;
    for (let h = 0; h < 24; h++) {
      const v = grid[day][h];
      const bg = v === 0 ? 'var(--surface-2)' : mix(v / max);
      rows += `<div class="heat-cell" style="background:${bg}" title="${DAYS[day]} ${h}:00 · ${fmtDuration(v)}"></div>`;
    }
    rows += `</div>`;
  }
  box.innerHTML = rows;

  let peak = { day: 0, h: 0, v: 0 };
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) if (grid[d][h] > peak.v) peak = { day: d, h, v: grid[d][h] };
  if (peak.v > 0)
    box.innerHTML += `<div class="muted center" style="margin-top:10px;font-size:11px">⭐ Peak focus: ${DAYS[peak.day]} around ${peak.h}:00</div>`;
}

function mix(t) {
  const a = [124, 92, 252];
  const b = [57, 217, 138];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const alpha = 0.25 + 0.75 * t;
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

function renderLog(root, sessions) {
  const subjects = ['All', ...new Set(sessions.map((x) => x.subject))];
  const filter = root.querySelector('#pf-filter');
  filter.innerHTML = subjects.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
  const logBox = root.querySelector('#pf-log');

  function draw() {
    const f = filter.value;
    const rows = sessions
      .slice()
      .sort((a, b) => b.startTime - a.startTime)
      .filter((x) => f === 'All' || x.subject === f)
      .slice(0, 50);
    if (rows.length === 0) {
      logBox.innerHTML = `<div class="muted">No sessions logged yet.</div>`;
      return;
    }
    logBox.innerHTML = rows
      .map((x) => {
        const d = new Date(x.startTime);
        const subjColor = getState().subjects.find((s) => s.name === x.subject)?.color || 'var(--accent)';
        return `<div class="log-row">
          <span class="swatch" style="width:8px;height:8px;background:${subjColor}"></span>
          <span style="width:96px" class="muted">${isoDate(d)}</span>
          <span style="flex:1">${escapeHtml(x.subject)}</span>
          <span class="muted">${fmtDuration(x.durationMinutes)}</span>
          <span style="color:var(--yellow);width:64px;text-align:right">+${x.xpEarned} ⭐</span>
        </div>`;
      })
      .join('');
  }
  filter.onchange = draw;
  draw();
}
