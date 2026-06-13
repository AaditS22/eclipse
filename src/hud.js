/* ============================================================
   Top HUD bar: avatar + level badge + segmented XP bar + streak +
   credits. Also applies the active dashboard theme accent and
   wallpaper to the document.
   ============================================================ */

import { getState } from './state.js';
import { levelProgress } from './xp.js';
import { rankProgress } from './rank.js';
import { astronautSVG, planetIconSVG, flameSVG } from './pixel/sprites.js';
import { getCosmetic } from './cosmetics.js';
import { escapeHtml, fmtCredits } from './util.js';

const XP_SEGMENTS = 20;

export function applyTheme() {
  const s = getState();
  const themeId = s.user.avatarConfig.theme;
  const theme = getCosmetic(themeId);
  const accent = theme?.accent || '#7c5cfc';
  document.documentElement.style.setProperty('--accent', accent);

  // Wallpaper planet behind the app (subtle)
  let wall = document.getElementById('wallpaper');
  const wallId = s.user.avatarConfig.wallpaper;
  if (wallId) {
    const cos = getCosmetic(wallId);
    if (!wall) {
      wall = document.createElement('div');
      wall.id = 'wallpaper';
      wall.style.cssText =
        'position:fixed;right:-20px;top:90px;z-index:1;opacity:0.12;pointer-events:none;transform:scale(3)';
      document.getElementById('starfield').appendChild(wall);
    }
    wall.innerHTML = cos?.preview ? cos.preview(8) : '';
  } else if (wall) {
    wall.remove();
  }
}

export function renderHUD() {
  const s = getState();
  const u = s.user;
  const prog = levelProgress(u.xp);
  const onSegs = Math.round(prog.pct * XP_SEGMENTS);
  const frameId = u.avatarConfig.frame;
  const frame = getCosmetic(frameId);
  const frameStyle =
    frame && frame.color ? `border:3px solid ${frame.color};box-shadow:0 0 6px ${frame.color}` : '';

  let segs = '';
  for (let i = 0; i < XP_SEGMENTS; i++) segs += `<div class="seg ${i < onSegs ? 'on' : ''}"></div>`;

  const streakFlame = u.streak >= 3 ? `<span class="streak-flame" style="display:inline-block">${flameSVG(2)}</span>` : '🔥';

  const rp = rankProgress(s.rank?.monthlyXp || 0);

  const hud = document.getElementById('hud');
  hud.innerHTML = `
    <div class="hud-inner">
      <div class="hud-avatar" style="${frameStyle}">${astronautSVG(u.avatarConfig, 4)}</div>
      <div class="hud-id">
        <div class="hud-name">
          <span>${escapeHtml(u.username)}</span>
          <span class="hud-level-badge">LVL ${u.level}</span>
        </div>
        <div class="xpbar" style="--segs:${XP_SEGMENTS}">${segs}</div>
        <div class="xp-label">${u.xp.toLocaleString()} XP · ${prog.into}/${prog.need} → LVL ${u.level + 1}</div>
      </div>
      <div class="hud-stats">
        <span class="hud-rank" title="This month's rank">${planetIconSVG(rp.planet.id, 2)} ${rp.planet.name}</span>
        <span class="hud-streak">${streakFlame} ${u.streak}d</span>
        <span class="hud-credits">◈ ${fmtCredits(u.credits)} Cr</span>
      </div>
    </div>`;
}
