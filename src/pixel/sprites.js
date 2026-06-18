/* ============================================================
   Pixel-art sprite system.
   Sprites are arrays of equal-ish length strings; each char maps
   to a palette color. '.' = transparent. Rendered as inline SVG
   (one <rect> per pixel) so they scale crisply with no image files.
   Strict ≤4 colors per sprite (+ transparency).
   ============================================================ */

/**
 * Render a sprite grid to an SVG string.
 * @param {string[]} grid   rows of chars
 * @param {Record<string,string>} palette  char -> css color ('.' ignored)
 * @param {number} scale    pixel size in px
 */
export function spriteSVG(grid, palette, scale = 4) {
  const h = grid.length;
  const w = grid.reduce((m, r) => Math.max(m, r.length), 0);
  let rects = '';
  for (let y = 0; y < h; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const color = palette[ch];
      if (!color) continue;
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
    }
  }
  return `<svg class="sprite" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
}

// ---------------- Astronaut ----------------
// Palette chars: O=outline, B=suit base, A=suit accent, V=visor
const ASTRONAUT = [
  '...OOOOOO...',
  '..OBBBBBBO..',
  '.OBVVVVVVBO.',
  '.OBVVVVVVBO.',
  '.OBVVVVVVBO.',
  '.OBBBBBBBBO.',
  '..OAAAAAAO..',
  '.OAABBBBAAO.',
  'OABABBBBABAO',
  'OABABBBBABAO',
  '.OAABBBBAAO.',
  '..OBB..BBO..',
  '..OO....OO..',
  '..OO....OO..',
];

const SUIT_PALETTES = {
  'suit-default': { O: '#0b0e1a', B: '#c9d2e8', A: '#8893b5', V: '#39d98a' },
  'suit-neon': { O: '#0b0e1a', B: '#7c5cfc', A: '#5a3fd6', V: '#39d98a' },
  'suit-galaxy': { O: '#0b0e1a', B: '#2a1a55', A: '#7c5cfc', V: '#f5c518' },
  'suit-blackhole': { O: '#000000', B: '#1a1a24', A: '#3a2a55', V: '#7c5cfc' },
  'suit-solar': { O: '#2a0e00', B: '#fb923c', A: '#f5c518', V: '#ff4c61' },
};

const VISOR_PALETTES = {
  'visor-gold': '#f5c518',
  'visor-nebula': '#7c5cfc',
  'visor-stardust': '#e879f9',
  'visor-alien': '#39d98a',
};

/** Build the astronaut SVG from an avatar config. */
export function astronautSVG(avatarConfig = {}, scale = 4) {
  const suit = SUIT_PALETTES[avatarConfig.suit] || SUIT_PALETTES['suit-default'];
  const visor = VISOR_PALETTES[avatarConfig.visor] || suit.V;
  return spriteSVG(ASTRONAUT, { ...suit, V: visor }, scale);
}

// ---------------- Rocket (points right, for progress bar) ----------------
const ROCKET = [
  '......OO....',
  '.....OBBO...',
  '....OBBBBO..',
  '...OBBBBBBOO',
  'OAAABBBBBBOO',
  'OAAABBBBBBOO',
  '...OBBBBBBOO',
  '....OBBBBO..',
  '.....OBBO...',
  '......OO....',
];
const ROCKET_PALETTES = {
  'rocket-default': { O: '#0b0e1a', B: '#c9d2e8', A: '#ff4c61' },
  'rocket-warp': { O: '#0b0e1a', B: '#39d98a', A: '#f5c518' },
  'rocket-stealth': { O: '#000000', B: '#3a2a55', A: '#7c5cfc' },
};
export function rocketSVG(rocketId = 'rocket-default', scale = 3) {
  const pal = ROCKET_PALETTES[rocketId] || ROCKET_PALETTES['rocket-default'];
  return spriteSVG(ROCKET, pal, scale);
}

/** Small exhaust flame pixels rendered separately so they can animate. */
export function exhaustSVG(scale = 3) {
  const flame = ['.AA', 'AYY', '.AA'];
  return spriteSVG(flame, { A: '#ff4c61', Y: '#f5c518' }, scale);
}

// ---------------- Planets (cosmetic rewards / decor) ----------------
const SATURN = [
  '...OOOO...',
  '..OYYYYO..',
  '.OYYYYYYO.',
  'OOYYYYYYOO',
  'OAAAAAAAAA',
  'OOYYYYYYOO',
  '.OYYYYYYO.',
  '..OYYYYO..',
  '...OOOO...',
];
const JUPITER = [
  '...OOOO...',
  '..ORRRBO..',
  '.OBBBRRRO.',
  'ORRRBBBRRO',
  'OBBBRRRBBO',
  'ORRRBBBRRO',
  '.OBBBRRRO.',
  '..ORRRBO..',
  '...OOOO...',
];
export function planetSVG(which = 'saturn', scale = 4) {
  if (which === 'jupiter')
    return spriteSVG(JUPITER, { O: '#0b0e1a', R: '#fb923c', B: '#f5c518' }, scale);
  return spriteSVG(SATURN, { O: '#0b0e1a', Y: '#f5c518', A: '#7c5cfc' }, scale);
}

// ---------------- Solar-system rank planets ----------------
// A banded disc reused for every planet, recoloured per body.
const PLANET_DISC = [
  '...OOO...',
  '..OAAAO..',
  '.OBBBBBO.',
  'OAAAAAAAO',
  'OBBBBBBBO',
  'OAAAAAAAO',
  '.OBBBBBO.',
  '..OAAAO..',
  '...OOO...',
];
const PLANET_PAL = {
  mercury: { O: '#0b0e1a', B: '#8893b5', A: '#5a6380' },
  venus: { O: '#2a0e00', B: '#f5c518', A: '#fb923c' },
  earth: { O: '#0b0e1a', B: '#3b82f6', A: '#39d98a' },
  mars: { O: '#2a0500', B: '#ff4c61', A: '#fb923c' },
  jupiter: { O: '#0b0e1a', B: '#fb923c', A: '#f5c518' },
  uranus: { O: '#0b0e1a', B: '#22d3ee', A: '#7c5cfc' },
  neptune: { O: '#0b0e1a', B: '#3b82f6', A: '#7c5cfc' },
  pluto: { O: '#0b0e1a', B: '#c9d2e8', A: '#8893b5' },
};
/** Icon for a rank planet (handles launchpad + ringed Saturn). */
export function planetIconSVG(id = 'mercury', scale = 4) {
  if (id === 'launch') return rocketSVG('rocket-default', scale);
  if (id === 'saturn') return spriteSVG(SATURN, { O: '#0b0e1a', Y: '#f5c518', A: '#7c5cfc' }, scale);
  return spriteSVG(PLANET_DISC, PLANET_PAL[id] || PLANET_PAL.mercury, scale);
}

// ---------------- Eclipse logo (half-moon over a sun) ----------------
const ECLIPSE_LOGO = [
  '......AA......',
  '....A.YY.A....',
  '..MMMMMYYA....',
  '.MMMMMMMYYA...',
  '.MMMMMMMYYYA..',
  'MMMMMMMMYYYYA.',
  'MMMMMMMMYYYYA.',
  'MMMMMMMMYYYYA.',
  'MMMMMMMMYYYYA.',
  '.MMMMMMMYYYA..',
  '.MMMMMMMYYA...',
  '..MMMMMYYA....',
  '....A.YY.A....',
  '......AA......',
];
export function eclipseLogoSVG(scale = 6) {
  return spriteSVG(ECLIPSE_LOGO, { M: '#1a2235', Y: '#f5c518', A: '#fb923c' }, scale);
}

// ---------------- Collection: pixel-art space objects ----------------
const COLLECTIBLES = {
  star: {
    grid: ['....Y....', '....Y....', '..Y.Y.Y..', '...YWY...', 'YYYWWWYYY', '...YWY...', '..Y.Y.Y..', '....Y....', '....Y....'],
    pal: { Y: '#f5c518', W: '#fff6c0' },
  },
  moon: {
    grid: ['..OOOO...', '.OGGGGO..', 'OGAGGO...', 'OGGGGO...', 'OGGAGO...', 'OGGGGO...', 'OGAGGO...', '.OGGGGO..', '..OOOO...'],
    pal: { O: '#0b0e1a', G: '#c9d2e8', A: '#8893b5' },
  },
  meteor: {
    grid: ['A....OOO.', '.A..OBBBO', '..A.OBKBO', 'A...OBBBO', '.A..OBKBO', '..A.OBBBO', 'A....OOO.'],
    pal: { O: '#0b0e1a', B: '#9c6b4f', K: '#5a3d2b', A: '#fb923c' },
  },
  comet: {
    grid: ['.....OOO.', 'AA..OBBBO', '.AA.OBWBO', 'AAAAOBBBO', '.AA.OBWBO', 'AA..OBBBO', '.....OOO.'],
    pal: { O: '#0b0e1a', B: '#22d3ee', W: '#e8eaf0', A: '#fb923c' },
  },
  satellite: {
    grid: ['...A...', 'P.OBO.P', 'PPOBOPP', 'PPOBOPP', 'P.OBO.P', '..OBO..', '..OOO..'],
    pal: { O: '#0b0e1a', P: '#3b82f6', B: '#c9d2e8', A: '#39d98a' },
  },
  telescope: {
    grid: ['.....OOO', '....OWWO', '...OBBO.', '..OBBO..', '.OBBO...', 'OOBO....', 'OOO.....', 'O.O.....'],
    pal: { O: '#0b0e1a', B: '#7c5cfc', W: '#22d3ee' },
  },
  ufo: {
    grid: ['..OOOOO..', '.OGGGGGO.', 'OOWOWOWOO', 'OGGGGGGGO', '.O.O.O.O.', '..A...A..'],
    pal: { O: '#0b0e1a', G: '#8893b5', W: '#39d98a', A: '#f5c518' },
  },
  galaxy: {
    grid: ['....PPPP.', '..PP...P.', '.P..WW.P.', 'P..WPPW.P', 'P.WPPW..P', '.P.WW..P.', '.P...PP..', '.PPPP....'],
    pal: { P: '#7c5cfc', W: '#e879f9' },
  },
  alien: {
    grid: ['.OOOOO.', 'OGGGGGO', 'OGEGEGO', 'OGGGGGO', 'OGGGGGO', '.OGGGO.', '..O.O..'],
    pal: { O: '#0b0e1a', G: '#39d98a', E: '#0b0e1a' },
  },
  blackhole: {
    grid: ['..YYYYY..', '.YAAAAAY.', 'YAAPPPAAY', 'YAPOOOPAY', 'YAPOOOPAY', 'YAPOOOPAY', 'YAAPPPAAY', '.YAAAAAY.', '..YYYYY..'],
    pal: { Y: '#f5c518', A: '#fb923c', P: '#7c5cfc', O: '#000000' },
  },
};
export function collectibleSVG(id, scale = 4) {
  const c = COLLECTIBLES[id];
  if (!c) return '';
  return spriteSVG(c.grid, c.pal, scale);
}

// ---------------- Companion creatures ----------------
const COMPANIONS = {
  'comp-cat': {
    grid: ['O.O.O.O', 'OBOBOBO', 'OBBBBBO', 'OBEBEBO', 'OBBPBBO', '.OBBBO.', '..OOO..'],
    pal: { O: '#0b0e1a', B: '#7c5cfc', E: '#39d98a', P: '#ff4c61' },
  },
  'comp-slime': {
    grid: ['..OOO..', '.OGGGO.', 'OGEGEGO', 'OGGGGGO', 'OGGGGGO', '.OGGGO.', 'O.O.O.O'],
    pal: { O: '#0b0e1a', G: '#39d98a', E: '#0b0e1a' },
  },
  'comp-jelly': {
    grid: ['.OOOO.', 'OPPPPO', 'OPEEPO', 'OPPPPO', '.OOOO.', 'O.O.O.', '.O.O.O'],
    pal: { O: '#0b0e1a', P: '#e879f9', E: '#f5c518' },
  },
  'comp-babyrocket': {
    grid: ['..O..', '.OBO.', '.OBO.', 'OBBBO', 'O.O.O', '.AYA.', '..A..'],
    pal: { O: '#0b0e1a', B: '#c9d2e8', A: '#ff4c61', Y: '#f5c518' },
  },
};
export function companionSVG(id, scale = 4) {
  const c = COMPANIONS[id];
  if (!c) return '';
  return spriteSVG(c.grid, c.pal, scale);
}

// ---------------- Rank badge (small chevron pip) ----------------
const BADGE = ['.OOO.', 'OYYYOY', 'OYAYYO', 'OYYYOY', '.OOO.'];
export function badgeSVG(scale = 3) {
  return spriteSVG(BADGE, { O: '#0b0e1a', Y: '#f5c518', A: '#7c5cfc' }, scale);
}

// ---------------- Streak flame ----------------
const FLAME = ['..Y..', '.YOY.', 'YORYY', 'YRRRY', '.YYY.'];
export function flameSVG(scale = 3) {
  return spriteSVG(FLAME, { Y: '#f5c518', O: '#fb923c', R: '#ff4c61' }, scale);
}

export { SUIT_PALETTES, VISOR_PALETTES, ROCKET_PALETTES };
