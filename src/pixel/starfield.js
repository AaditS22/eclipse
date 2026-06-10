/* ============================================================
   Animated star field — 3 parallax canvas layers with twinkle.
   Also exposes a pixel-confetti level-up burst and the deep-space
   Focus-Mode FX (forward-drift speed-up + drifting space events).
   Respects prefers-reduced-motion (renders static stars).
   ============================================================ */

import { prefersReducedMotion } from '../util.js';

const LAYERS = [
  { id: 'stars-far', count: 60, speed: 2, size: 1, alpha: 0.5 },
  { id: 'stars-mid', count: 40, speed: 6, size: 2, alpha: 0.7 },
  { id: 'stars-near', count: 22, speed: 14, size: 3, alpha: 1 },
];

const STAR_COLORS = ['#e8eaf0', '#7c5cfc', '#f5c518', '#39d98a'];

let layers = [];
let raf = null;
let speedMul = 1;       // current global star-speed multiplier
let speedTarget = 1;    // eased toward this (focus mode ramps it up)

function makeStars(canvas, conf) {
  const stars = [];
  for (let i = 0; i < conf.count; i++) {
    stars.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      tw: Math.random() * Math.PI * 2, // twinkle phase
      twSpeed: 0.5 + Math.random() * 1.5,
      color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
    });
  }
  return stars;
}

export function initStarfield() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  layers = LAYERS.map((conf) => {
    const canvas = document.getElementById(conf.id);
    const ctx = canvas.getContext('2d');
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      canvas._stars = makeStars({ width: window.innerWidth, height: window.innerHeight }, conf);
    };
    resize();
    window.addEventListener('resize', debounce(resize, 150));
    return { canvas, ctx, conf };
  });

  if (prefersReducedMotion()) {
    drawStatic();
    return;
  }

  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(50, now - last) / 1000;
    last = now;
    // Ease the global speed multiplier toward its target (focus ramp).
    speedMul += (speedTarget - speedMul) * Math.min(1, dt * 2.5);
    for (const layer of layers) {
      const { ctx, canvas, conf } = layer;
      const W = window.innerWidth;
      const H = window.innerHeight;
      ctx.clearRect(0, 0, W, H);
      for (const s of canvas._stars) {
        // slow upward drift, wrap around
        s.y -= conf.speed * speedMul * dt;
        if (s.y < -2) {
          s.y = H + 2;
          s.x = Math.random() * W;
        }
        s.tw += s.twSpeed * dt;
        const twinkle = 0.55 + 0.45 * Math.sin(s.tw);
        ctx.globalAlpha = conf.alpha * twinkle;
        ctx.fillStyle = s.color;
        const sz = conf.size * (0.8 + 0.5 * twinkle);
        ctx.fillRect(Math.round(s.x), Math.round(s.y), sz, sz);
      }
      ctx.globalAlpha = 1;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

function drawStatic() {
  for (const layer of layers) {
    const { ctx, canvas, conf } = layer;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const s of canvas._stars) {
      ctx.globalAlpha = conf.alpha * 0.8;
      ctx.fillStyle = s.color;
      ctx.fillRect(Math.round(s.x), Math.round(s.y), conf.size, conf.size);
    }
    ctx.globalAlpha = 1;
  }
}

function debounce(fn, ms) {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/* ---------- Level-up pixel confetti burst ---------- */
export function confettiBurst() {
  if (prefersReducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;z-index:58;pointer-events:none;';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  document.getElementById('fx').appendChild(canvas);

  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2.4;
  const colors = ['#7c5cfc', '#f5c518', '#39d98a', '#ff4c61', '#e8eaf0'];
  const parts = [];
  for (let i = 0; i < 90; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 120 + Math.random() * 320;
    parts.push({
      x: cx,
      y: cy,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 120,
      size: 3 + Math.floor(Math.random() * 4),
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1,
    });
  }

  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(50, now - last) / 1000;
    last = now;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    let alive = false;
    for (const p of parts) {
      p.vy += 520 * dt; // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt * 0.55;
      if (p.life > 0) {
        alive = true;
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    if (alive) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}

/* ============================================================
   Deep-Space Focus FX — canvas effect engine.
   While a study session runs the starfield speeds up (forward
   drift) and brief space "events" sweep through on curved, weaving
   paths with glowing trails: shooting stars, comets, weaving
   rockets, tumbling meteors, drifting satellites, zig-zagging UFOs,
   plus the rare cosmic spectacles — an expanding supernova
   shockwave, an accretion-disk black hole, a jetting quasar, and a
   swirling wormhole. Everything is peripheral, short, additive-blended
   and never blocks input. Milestones can force a spectacle.
   ============================================================ */

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const tri = (x) => Math.asin(Math.sin(x)) * (2 / Math.PI); // triangle wave [-1,1]

// Weighted ambient pool. Rares appear often enough to actually be seen.
const EVENT_WEIGHTS = {
  shootingstar: 26, comet: 16, rocket: 13, meteor: 11, satellite: 9,
  ufo: 8, quasar: 6, blackhole: 5, supernova: 3, wormhole: 3,
};
function weightedKind() {
  const entries = Object.entries(EVENT_WEIGHTS);
  const total = entries.reduce((a, [, w]) => a + w, 0);
  let roll = Math.random() * total;
  for (const [k, w] of entries) { roll -= w; if (roll < 0) return k; }
  return 'shootingstar';
}

// ---- tiny pixel sprites drawn straight onto the canvas ----
const ROCKET_G = ['....OO....', '...OBBO...', '..OBBBBO..', '.OBBBBBBO.', 'OAABBBBBBO', 'OAABBBBBBO', '.OBBBBBBO.', '..OBBBBO..', '...OBBO...', '....OO....'];
const ROCKET_P = { O: '#0b0e1a', B: '#c9d2e8', A: '#ff4c61' };
const UFO_G = ['..OOOOO..', '.OGGGGGO.', 'OOWOWOWOO', 'OGGGGGGGO', '.O.O.O.O.', '..A...A..'];
const UFO_P = { O: '#0b0e1a', G: '#8893b5', W: '#39d98a', A: '#f5c518' };
const SAT_G = ['...A...', 'P.OBO.P', 'PPOBOPP', 'PPOBOPP', 'P.OBO.P', '..OBO..', '..OOO..'];
const SAT_P = { O: '#0b0e1a', P: '#3b82f6', B: '#c9d2e8', A: '#39d98a' };
const ROCK_G = ['.OOO.', 'OKKKO', 'OKBKO', 'OKKKO', '.OOO.'];
const ROCK_P = { O: '#2a1606', K: '#5a3d2b', B: '#9c6b4f' };

// ---- canvas + loop state ----
let fxWrap = null, fxCanvas = null, fxCtx = null, fxRaf = null, fxLast = 0;
let effects = [];
let fxTimer = null;   // ambient scheduler
let fxActive = false; // focus session in progress
let dim = 0, dimUntil = 0; // brief screen-darken when a rare event appears

/** Darken the field for `ms` so the next rare event pops. */
function triggerDim(ms = 2800) { dimUntil = performance.now() + ms; }

function sizeFxCanvas() {
  if (!fxCanvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  fxCanvas.width = window.innerWidth * dpr;
  fxCanvas.height = window.innerHeight * dpr;
  fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function ensureFxCanvas() {
  if (fxCanvas) return;
  fxWrap = document.createElement('div');
  fxWrap.id = 'focus-fx';
  fxWrap.setAttribute('aria-hidden', 'true');
  fxCanvas = document.createElement('canvas');
  fxWrap.appendChild(fxCanvas);
  document.body.appendChild(fxWrap);
  fxCtx = fxCanvas.getContext('2d');
  sizeFxCanvas();
  window.addEventListener('resize', sizeFxCanvas);
}
function teardownFxCanvas() {
  window.removeEventListener('resize', sizeFxCanvas);
  if (fxRaf) { cancelAnimationFrame(fxRaf); fxRaf = null; }
  if (fxWrap) fxWrap.remove();
  fxWrap = fxCanvas = fxCtx = null;
  effects = [];
  dim = 0; dimUntil = 0;
}
function startFxLoop() {
  if (fxRaf) return;
  fxLast = performance.now();
  const tick = (now) => {
    const dt = Math.min(50, now - fxLast) / 1000;
    fxLast = now;
    const W = window.innerWidth, H = window.innerHeight;
    fxCtx.clearRect(0, 0, W, H);
    // Screen-darken eases in while a rare event is active, then back out.
    const dtarget = now < dimUntil ? 0.55 : 0;
    dim += (dtarget - dim) * Math.min(1, dt * 3);
    if (dim > 0.01) {
      fxCtx.save();
      fxCtx.fillStyle = `rgba(3,5,12,${dim})`;
      fxCtx.fillRect(0, 0, W, H);
      fxCtx.restore();
    }
    for (const e of effects) e.update(dt, W, H);
    for (const e of effects) e.draw(fxCtx);
    effects = effects.filter((e) => !e.dead);
    if (fxActive || effects.length) fxRaf = requestAnimationFrame(tick);
    else fxRaf = null;
  };
  fxRaf = requestAnimationFrame(tick);
}

// ---- draw helpers ----
function glow(ctx, x, y, r, color) {
  if (r <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawTrail(ctx, pts, color, width) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  for (let i = 1; i < pts.length; i++) {
    const a = i / pts.length; // older → fainter/thinner
    ctx.globalAlpha = a * a * 0.9;
    ctx.lineWidth = Math.max(0.5, width * a);
    ctx.beginPath();
    ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
    ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}
function drawPixels(ctx, grid, pal, cx, cy, scale, rot = 0) {
  const h = grid.length, w = grid[0].length;
  ctx.save();
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  ctx.translate(-w * scale / 2, -h * scale / 2);
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const c = pal[ch];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * scale, y * scale, scale + 0.5, scale + 0.5);
    }
  }
  ctx.restore();
}

// ---- a curved/weaving mover with a glowing trail ----
function makeMover(o) {
  let t = 0, bx = o.x, by = o.y, ang = o.ang;
  let px = o.x, py = o.y, ppx = o.x, ppy = o.y, spin = 0;
  const trail = [];
  const e = {
    dead: false,
    update(dt, W, H) {
      t += dt;
      if (o.turn) ang += o.turn * dt;
      const dx = Math.cos(ang), dy = Math.sin(ang);
      bx += dx * o.speed * dt;
      by += dy * o.speed * dt;
      let off = 0;
      if (o.pattern === 'wave') off = o.amp * Math.sin(t * o.freq);
      else if (o.pattern === 'zigzag') off = o.amp * tri(t * o.freq);
      ppx = px; ppy = py;
      px = bx + -dy * off;
      py = by + dx * off;
      spin += (o.spinSpeed || 0) * dt;
      if (o.trail) { trail.push({ x: px, y: py }); if (trail.length > o.trail.len) trail.shift(); }
      const m = 220;
      if (t > 0.3 && (bx < -m || bx > W + m || by < -m || by > H + m)) e.dead = true;
    },
    draw(ctx) {
      const heading = Math.atan2(py - ppy, px - ppx);
      if (o.trail) drawTrail(ctx, trail, o.trail.color, o.trail.width);
      switch (o.kind) {
        case 'shootingstar':
        case 'comet': {
          glow(ctx, px, py, o.headR * 2, o.headColor);
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, o.headR * 0.3), 0, TAU); ctx.fill(); ctx.restore();
          break;
        }
        case 'rocket':
          glow(ctx, px, py, 11, 'rgba(251,146,60,0.35)');
          drawPixels(ctx, ROCKET_G, ROCKET_P, px, py, o.scale, heading);
          break;
        case 'ufo':
          glow(ctx, px, py, 17, 'rgba(57,217,138,0.5)');
          drawPixels(ctx, UFO_G, UFO_P, px, py, o.scale, 0);
          break;
        case 'satellite':
          drawPixels(ctx, SAT_G, SAT_P, px, py, o.scale, spin);
          break;
        case 'meteor':
          drawPixels(ctx, ROCK_G, ROCK_P, px, py, o.scale, spin);
          break;
      }
    },
  };
  return e;
}

// ---- cosmic spectacles ----
function supernova(x, y) {
  let t = 0; const dur = 2.9; const parts = []; let burst = false;
  return {
    dead: false,
    update(dt) {
      t += dt;
      if (!burst && t >= 0.55) {
        burst = true;
        for (let i = 0; i < 80; i++) {
          const a = Math.random() * TAU, s = rand(80, 420);
          parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, col: pick(['#fff6c0', '#f5c518', '#fb923c', '#7c5cfc', '#ff4c61']) });
        }
      }
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97; p.life -= dt * 0.5; }
      if (t > dur) this.dead = true;
    },
    draw(ctx) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const coreT = Math.min(1, t / 0.55);
      if (t < 0.55) {
        glow(ctx, x, y, 8 + coreT * coreT * 46, `rgba(255,250,220,${0.5 + 0.5 * coreT})`);
      } else {
        const rt = t - 0.55;
        glow(ctx, x, y, 60 * Math.max(0, 1 - rt / 0.4), `rgba(255,255,255,${Math.max(0, 1 - rt / 0.45)})`);
        for (const [spd, wmul] of [[460, 1], [300, 0.65]]) {
          const rr = rt * spd, ra = Math.max(0, 1 - rt / 1.9) * wmul;
          ctx.globalAlpha = ra; ctx.lineWidth = 3; ctx.strokeStyle = '#bcd0ff';
          ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke();
        }
        for (const p of parts) {
          if (p.life <= 0) continue;
          ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.col;
          ctx.fillRect(p.x, p.y, 3, 3);
        }
      }
      ctx.restore();
    },
  };
}

function blackhole(x, y) {
  let t = 0; const dur = 5.5; const parts = [];
  for (let i = 0; i < 64; i++) parts.push({ a: Math.random() * TAU, r: rand(70, 175), col: pick(['#fb923c', '#f5c518', '#fff6c0', '#ff4c61', '#7c5cfc']), w: rand(1.2, 2.6) });
  return {
    dead: false,
    update(dt) {
      t += dt;
      const pull = t < dur - 1 ? 1 : 0;
      for (const p of parts) {
        p.a += (1.5 + (180 - p.r) / 110) * dt;
        p.r -= (16 + (180 - p.r) * 0.4) * dt * pull;
        if (p.r < 7) p.r = rand(140, 190);
      }
      if (t > dur) this.dead = true;
    },
    draw(ctx) {
      const grow = Math.min(1, t / 0.8), fade = t > dur - 0.8 ? Math.max(0, (dur - t) / 0.8) : 1;
      const R = 17 * grow;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        const pxx = x + Math.cos(p.a) * p.r, pyy = y + Math.sin(p.a) * p.r * 0.42; // squashed disk
        ctx.globalAlpha = fade * Math.min(1, (180 - p.r) / 130);
        const g = ctx.createRadialGradient(pxx, pyy, 0, pxx, pyy, p.w * 3);
        g.addColorStop(0, p.col); g.addColorStop(1, 'transparent');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pxx, pyy, p.w * 3, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = fade; ctx.lineWidth = 2; ctx.strokeStyle = '#cdb8ff';
      ctx.beginPath(); ctx.ellipse(x, y, R * 1.7, R * 0.95, 0, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = fade;
      const cg = ctx.createRadialGradient(x, y, 0, x, y, R * 1.6);
      cg.addColorStop(0, '#000'); cg.addColorStop(0.68, '#000'); cg.addColorStop(1, 'transparent');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, R * 1.6, 0, TAU); ctx.fill();
      ctx.restore();
    },
  };
}

function quasar(x, y) {
  const ang = rand(0, Math.PI);
  let t = 0; const dur = 3.6;
  return {
    dead: false,
    update(dt) { t += dt; if (t > dur) this.dead = true; },
    draw(ctx) {
      const grow = Math.min(1, t / 0.6), fade = t > dur - 0.8 ? Math.max(0, (dur - t) / 0.8) : 1;
      const pulse = 0.8 + 0.2 * Math.sin(t * 12);
      const jet = grow * (window.innerWidth * 0.34);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fade;
      for (const s of [1, -1]) {
        const ex = x + Math.cos(ang) * jet * s, ey = y + Math.sin(ang) * jet * s;
        const g = ctx.createLinearGradient(x, y, ex, ey);
        g.addColorStop(0, 'rgba(124,92,252,0.9)');
        g.addColorStop(0.5, 'rgba(34,211,238,0.5)');
        g.addColorStop(1, 'transparent');
        ctx.strokeStyle = g; ctx.lineWidth = 6 * grow; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(ex, ey); ctx.stroke();
      }
      ctx.restore();
      glow(ctx, x, y, 40 * grow * pulse, 'rgba(124,92,252,0.5)');
      glow(ctx, x, y, 22 * grow * pulse, 'rgba(230,240,255,0.95)');
    },
  };
}

function wormhole(x, y) {
  let t = 0; const dur = 4.6; const cols = ['#7c5cfc', '#22d3ee', '#e879f9'];
  return {
    dead: false,
    update(dt) { t += dt; if (t > dur) this.dead = true; },
    draw(ctx) {
      const open = Math.min(1, t / 0.8) * (t > dur - 0.9 ? Math.max(0, (dur - t) / 0.9) : 1);
      const R = 78 * open;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let a = 0; a < 3; a++) {
        ctx.beginPath();
        for (let i = 0; i < 64; i++) {
          const th = i * 0.22 + t * 2.2 + a * (TAU / 3), r = R * (i / 64);
          const pxx = x + Math.cos(th) * r, pyy = y + Math.sin(th) * r * 0.6;
          i ? ctx.lineTo(pxx, pyy) : ctx.moveTo(pxx, pyy);
        }
        ctx.strokeStyle = cols[a]; ctx.globalAlpha = 0.8 * open; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.restore();
      glow(ctx, x, y, 18 * open, 'rgba(20,8,40,0.9)');
    },
  };
}

const COSMIC = { supernova, blackhole, quasar, wormhole };

// A quick bright bloom at a rare event's origin, to pull the eye to it.
function bloomFlash(x, y) {
  let t = 0; const dur = 0.75;
  return {
    dead: false,
    update(dt) { t += dt; if (t > dur) this.dead = true; },
    draw(ctx) { const k = t / dur; glow(ctx, x, y, 34 + k * 170, `rgba(255,255,255,${Math.max(0, 1 - k) * 0.85})`); },
  };
}

// ---- build a drifting mover for a kind ----
function buildEffect(kind, W, H) {
  const ltr = Math.random() < 0.5;
  const base = ltr ? 0 : Math.PI;
  const sx = ltr ? -140 : W + 140;
  const y = rand(H * 0.12, H * 0.82);
  const common = { x: sx, y, ang: base + rand(-0.3, 0.3) };

  switch (kind) {
    case 'shootingstar':
      return makeMover({
        x: ltr ? -120 : W + 120, y: rand(-40, H * 0.4),
        ang: ltr ? rand(0.18, 0.5) : Math.PI - rand(0.18, 0.5),
        speed: rand(680, 840), pattern: 'straight', kind: 'shootingstar',
        headR: 7, headColor: 'rgba(255,250,210,0.95)',
        trail: { color: 'rgba(255,246,200,0.95)', len: 24, width: 3 },
      });
    case 'comet':
      return makeMover({
        ...common, speed: rand(190, 250), pattern: 'wave', amp: rand(14, 28), freq: rand(1.1, 2),
        turn: rand(-0.06, 0.06), kind: 'comet', headR: 16, headColor: 'rgba(190,240,255,0.95)',
        trail: { color: 'rgba(120,210,255,0.9)', len: 38, width: 6 },
      });
    case 'rocket':
      return makeMover({
        ...common, speed: rand(150, 210), pattern: 'wave', amp: rand(20, 36), freq: rand(1.3, 2),
        kind: 'rocket', scale: 2.4, trail: { color: 'rgba(251,146,60,0.9)', len: 18, width: 4 },
      });
    case 'meteor':
      return makeMover({
        x: ltr ? rand(-80, W * 0.3) : rand(W * 0.7, W + 80), y: -100,
        ang: ltr ? rand(0.5, 0.95) : Math.PI - rand(0.5, 0.95),
        speed: rand(280, 360), pattern: 'straight', kind: 'meteor', scale: 3, spinSpeed: rand(-6, 6),
        trail: { color: 'rgba(255,130,50,0.85)', len: 18, width: 3 },
      });
    case 'satellite':
      return makeMover({ ...common, speed: rand(55, 82), pattern: 'wave', amp: 8, freq: 0.8, kind: 'satellite', scale: 3, spinSpeed: rand(-1.2, 1.2) });
    case 'ufo':
      return makeMover({ ...common, speed: rand(130, 178), pattern: 'zigzag', amp: rand(30, 54), freq: rand(0.9, 1.5), kind: 'ufo', scale: 3.2 });
  }
  return null;
}

/** Spawn one space event. `kind` optional — random (weighted) if omitted. */
export function spawnEvent(kind) {
  if (prefersReducedMotion()) return;
  ensureFxCanvas();
  startFxLoop();
  if (effects.length > 16) return; // never let it pile up
  kind = kind || weightedKind();
  const W = window.innerWidth, H = window.innerHeight;
  // Rare cosmic spectacles dim the field and flash a bloom so they grab focus.
  if (COSMIC[kind]) {
    const x = rand(W * 0.28, W * 0.72), y = rand(H * 0.2, H * 0.48);
    effects.push(COSMIC[kind](x, y));
    effects.push(bloomFlash(x, y));
    triggerDim();
    return;
  }
  const e = buildEffect(kind, W, H);
  if (e) effects.push(e);
}

/** Begin Focus-Mode FX: ramp star speed and schedule ambient events. */
export function startFocusFx() {
  if (fxActive) return;
  fxActive = true;
  speedTarget = 3.4; // forward-drift feel
  if (prefersReducedMotion()) return;
  ensureFxCanvas();
  startFxLoop();
  const loop = () => {
    if (!fxActive) return;
    spawnEvent();
    // Randomised cadence so it never feels metronomic; calm, not busy.
    fxTimer = setTimeout(loop, 6000 + Math.random() * 9000);
  };
  fxTimer = setTimeout(loop, 2200 + Math.random() * 2500);
}

/** End Focus-Mode FX: ease star speed back and stop spawning. */
export function stopFocusFx() {
  fxActive = false;
  speedTarget = 1;
  if (fxTimer) { clearTimeout(fxTimer); fxTimer = null; }
  teardownFxCanvas();
}
