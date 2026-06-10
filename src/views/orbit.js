/* ============================================================
   Orbit view — the monthly solar-system rank journey.
   You're an astronaut drifting outward from the launchpad. Your
   distance to the next planet is your monthly XP. Each month the
   rank resets and the planet you reached is logged as a trophy.
   ============================================================ */

import { getState } from '../state.js';
import { astronautSVG, planetIconSVG, exhaustSVG } from '../pixel/sprites.js';
import { prefersReducedMotion } from '../util.js';
import {
  PLANETS,
  rankProgress,
  planetIndexForXp,
  daysLeftInMonth,
  monthLabel,
  monthKey,
} from '../rank.js';
import { isoDate } from '../util.js';

export function renderOrbit(root) {
  const s = getState();
  const monthlyXp = s.rank?.monthlyXp || 0;
  const rp = rankProgress(monthlyXp);
  const reachedIdx = planetIndexForXp(monthlyXp);
  const today = isoDate();
  const avatar = s.user.avatarConfig;

  // Astronaut position along the leg between current and next planet.
  const astroPct = rp.isMax ? 100 : Math.round(rp.pct * 100);

  root.innerHTML = `
    <section class="panel">
      <div class="between">
        <div class="panel-title" style="margin:0">Orbital Journey</div>
        <span class="muted" style="font-size:10px">${monthLabel(monthKey(today))}</span>
      </div>
      <div class="muted" style="font-size:11px;margin-top:8px">Your monthly XP carries you outward through the solar system. Reach the next planet to rank up.</div>
    </section>

    <section class="panel orbit-stage">
      <div class="orbit-head">
        <div class="orbit-planet big">${planetIconSVG(rp.planet.id, 6)}<div class="op-name">${rp.planet.name}</div><div class="op-sub muted">current</div></div>
        <div class="orbit-planet big ${rp.isMax ? '' : 'dim'}">${planetIconSVG((rp.next || rp.planet).id, 6)}<div class="op-name">${rp.isMax ? 'Deep Space' : rp.next.name}</div><div class="op-sub muted">${rp.isMax ? '—' : 'next'}</div></div>
      </div>

      <div class="orbit-track">
        <div class="orbit-line"></div>
        <div class="orbit-fill" style="width:${astroPct}%"></div>
        <div class="orbit-astro" style="left:${astroPct}%">
          ${!prefersReducedMotion() && !rp.isMax ? `<span class="orbit-exhaust exhaust-flame">${exhaustSVG(2)}</span>` : ''}
          ${astronautSVG(avatar, 3)}
        </div>
      </div>

      <div class="center" style="margin-top:14px">
        <div class="pixel" style="font-size:13px;color:var(--accent)">${monthlyXp.toLocaleString()} XP</div>
        <div class="muted" style="font-size:11px;margin-top:6px">
          ${rp.isMax ? 'You have reached the furthest planet. Legend status.' : `${rp.toNext.toLocaleString()} XP to reach ${rp.next.name}`}
        </div>
        <div class="muted" style="font-size:10px;margin-top:4px">Rank resets in ${daysLeftInMonth(today)} days — your planet this month becomes a trophy.</div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">The Route</div>
      <div class="planet-route">
        ${PLANETS.map((p, i) => {
          const reached = i <= reachedIdx;
          const isCurrent = i === reachedIdx;
          return `<div class="route-planet ${reached ? 'reached' : 'locked'} ${isCurrent ? 'current' : ''}">
            <div class="rp-icon">${planetIconSVG(p.id, 3)}</div>
            <div class="rp-name">${p.name}</div>
            <div class="rp-thr muted">${p.threshold === 0 ? 'start' : p.threshold.toLocaleString() + ' XP'}</div>
            ${reached ? '<div class="rp-check">✓</div>' : ''}
          </div>`;
        }).join('')}
      </div>
    </section>

    <section class="panel">
      <div class="panel-title">Past Months · Planets Reached</div>
      <div id="orbit-history"></div>
    </section>
  `;

  const hist = root.querySelector('#orbit-history');
  const history = s.planetHistory || [];
  if (history.length === 0) {
    hist.innerHTML = `<div class="muted">No completed months yet. Keep studying — at month's end your furthest planet is recorded here forever.</div>`;
  } else {
    hist.innerHTML = `<div class="history-grid">${history
      .map(
        (h) => `<div class="history-card">
          <div class="hc-icon">${planetIconSVG(h.planetId, 3)}</div>
          <div class="hc-planet">${h.planetName}</div>
          <div class="hc-month muted">${monthLabel(h.month)}</div>
          <div class="hc-xp" style="color:var(--yellow)">${(h.xp || 0).toLocaleString()} XP</div>
        </div>`
      )
      .join('')}</div>`;
  }
}
