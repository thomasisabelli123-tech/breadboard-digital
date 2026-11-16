// Breadboard geometry. Several board models share the same pitch grid.
// Board coordinates: 1 unit = 1 pitch (2.54 mm), x to the right, y downwards (top view).
//
//   full  (830 points)   y = 0 (+) 1 (-)  |  rows j..f at 3..7  |  channel 8..9  |  rows e..a at 10..14  |  y = 17 (-) 18 (+)
//   half  (400 points)   same vertical layout, 30 columns, 25-hole rails
//   multi (lab, 3 buses) three independent +/- rail pairs (3.3 V / 5 V / 12 V), 63 columns
//   mini  (170 points)   17 columns, no power rails
//
// The *active* board is exposed through the shared (mutated-in-place) exports `holes`, `holeById`, `strips`,
// `BOARD`, `BOARD_CENTER` … and `setBoardType(id)` switches it. `makeLayout(id)` builds an independent layout
// (used by the home-page showcase, which displays several boards at once).

const L = (en, it) => ({ en, it });

export const ROWS_TOP = ['j', 'i', 'h', 'g', 'f']; // body y = bodyY .. bodyY+4
export const ROWS_BOT = ['e', 'd', 'c', 'b', 'a']; // body y = bodyY+7 .. bodyY+11
export const BOT_OFFSET = 7;
export const RAIL_COLORS = { '+': '#d32f2f', '-': '#1e5bd6' };

export const BOARD_TYPES = [
  {
    id: 'full', points: 830, cols: 63, bodyY: 3, railHoles: 50, railX0: 3,
    name: L('Standard Full-Size (830 points)', 'Standard Full-Size (830 punti)'),
    desc: L('Double power rails (+ and −) at top and bottom, centre channel.', 'Doppie barre di alimentazione (+ e −) in alto e in basso, canalina centrale.'),
    rails: [{ y: 0, pol: '+' }, { y: 1, pol: '-' }, { y: 17, pol: '-' }, { y: 18, pol: '+' }],
  },
  {
    id: 'half', points: 400, cols: 30, bodyY: 3, railHoles: 25, railX0: 2,
    name: L('Half-Size (400 points)', 'Half-Size (400 punti)'),
    desc: L('Compact board for small prototypes.', 'Compatta, ideale per piccoli prototipi.'),
    rails: [{ y: 0, pol: '+' }, { y: 1, pol: '-' }, { y: 17, pol: '-' }, { y: 18, pol: '+' }],
  },
  {
    id: 'multi', points: 930, cols: 63, bodyY: 9, railHoles: 50, railX0: 3,
    name: L('Multi-Bus Lab (3 supply lines)', 'Multi-Bus / Laboratorio (3 linee di alimentazione)'),
    desc: L('Three independent +/− rail pairs, e.g. 3.3 V, 5 V and 12 V.', 'Tre coppie di barre + e − indipendenti, es. 3.3 V, 5 V e 12 V.'),
    rails: [
      { y: 0, pol: '+', group: '3.3V' }, { y: 1, pol: '-', group: '3.3V' },
      { y: 4, pol: '+', group: '5V' }, { y: 5, pol: '-', group: '5V' },
      { y: 23, pol: '-', group: '12V' }, { y: 24, pol: '+', group: '12V' },
    ],
  },
  {
    id: 'mini', points: 170, cols: 17, bodyY: 1, railHoles: 0, railX0: 0,
    name: L('Mini Breadboard (170 points)', 'Mini Breadboard (170 punti)'),
    desc: L('No side rails, super compact.', 'Senza barre laterali, super compatta.'),
    rails: [],
  },
];
export const BOARD_TYPE_IDS = BOARD_TYPES.map((b) => b.id);
export const boardTypeDef = (id) => BOARD_TYPES.find((b) => b.id === id) || BOARD_TYPES[0];

export function makeLayout(id) {
  const spec = boardTypeDef(id);
  const holes = [];
  const holeById = new Map();
  const byXY = new Map();
  const add = (h) => { holes.push(h); holeById.set(h.id, h); byXY.set(h.x + ',' + h.y, h); };
  const by = spec.bodyY;
  for (let col = 1; col <= spec.cols; col++) {
    for (let i = 0; i < 5; i++) {
      add({ id: `${col}${ROWS_TOP[i]}`, kind: 't', col, row: ROWS_TOP[i], x: col, y: by + i, strip: `S${col}t` });
      add({ id: `${col}${ROWS_BOT[i]}`, kind: 't', col, row: ROWS_BOT[i], x: col, y: by + BOT_OFFSET + i, strip: `S${col}b` });
    }
  }
  spec.rails.forEach((rl, r) => {
    for (let k = 0; k < spec.railHoles; k++) {
      add({
        id: `R${r}:${k + 1}`, kind: 'r', rail: r, pol: rl.pol, group: rl.group || null, idx: k,
        x: spec.railX0 + k + Math.floor(k / 5), y: rl.y, strip: `R${r}`,
      });
    }
  });
  const sm = new Map();
  for (const h of holes) {
    let s = sm.get(h.strip);
    if (!s) { s = { key: h.strip, kind: h.kind, holes: [], pol: h.pol, group: h.group, y: h.y }; sm.set(h.strip, s); }
    s.holes.push(h);
  }
  const strips = [...sm.values()];
  const stripByKey = sm;
  const hasRails = spec.rails.length > 0;
  const ys = [by, by + BOT_OFFSET + 4, ...spec.rails.map((r) => r.y)];
  const board = {
    x0: 0,
    x1: spec.cols + (spec.id === 'half' ? 2 : 1),
    y0: Math.min(...ys) - (hasRails ? 1.5 : 2),
    y1: Math.max(...ys) + (hasRails ? 1.5 : 2),
  };
  const layout = {
    id: spec.id, spec, cols: spec.cols, bodyY: by, rails: spec.rails, holes, holeById, byXY, strips, stripByKey, board,
    w: board.x1 - board.x0, h: board.y1 - board.y0,
    center: { x: (board.x0 + board.x1) / 2, y: (board.y0 + board.y1) / 2 },
    channel: { y0: by + 4, y1: by + BOT_OFFSET },
    straddleY: by + 4,
    railX: (k) => spec.railX0 + k + Math.floor(k / 5),
    railX1: spec.railHoles ? spec.railX0 + (spec.railHoles - 1) + Math.floor((spec.railHoles - 1) / 5) : 0,
  };
  return layout;
}

// ------------------------------------------------------------------ active layout (shared, mutated in place)
export const holes = [];
export const holeById = new Map();
export const strips = [];
export const BOARD = { x0: 0, y0: 0, x1: 0, y1: 0 };
export const BOARD_CENTER = { x: 0, y: 0 };
export const CHANNEL = { y0: 7, y1: 10 };
export const ACTIVE = { layout: null };
const byXY = new Map();

export let COLS = 63;
export let BOARD_W = 64;
export let BOARD_H = 21;
export let BOARD_TYPE = 'full';
export let STRADDLE_Y = 7;

export function setBoardType(id) {
  const lay = makeLayout(id);
  ACTIVE.layout = lay;
  holes.length = 0; holes.push(...lay.holes);
  holeById.clear(); for (const [k, v] of lay.holeById) holeById.set(k, v);
  byXY.clear(); for (const [k, v] of lay.byXY) byXY.set(k, v);
  strips.length = 0; strips.push(...lay.strips);
  Object.assign(BOARD, lay.board);
  Object.assign(BOARD_CENTER, lay.center);
  Object.assign(CHANNEL, lay.channel);
  COLS = lay.cols;
  BOARD_W = lay.w;
  BOARD_H = lay.h;
  BOARD_TYPE = lay.id;
  STRADDLE_Y = lay.straddleY;
  return lay;
}
setBoardType('full');

export const getLayout = () => ACTIVE.layout;

export function holeAt(x, y, tol = 0.3) {
  const rx = Math.round(x);
  const ry = Math.round(y);
  if (Math.abs(x - rx) > tol || Math.abs(y - ry) > tol) return null;
  return byXY.get(rx + ',' + ry) || null;
}

export function nearestHole(x, y, maxDist = 0.8) {
  let best = null;
  let bd = maxDist * maxDist;
  for (const h of holes) {
    const dx = h.x - x;
    if (dx > maxDist || dx < -maxDist) continue;
    const dy = h.y - y;
    const d = dx * dx + dy * dy;
    if (d <= bd) { bd = d; best = h; }
  }
  return best;
}

export function holeLabel(h) {
  if (!h) return '';
  if (h.kind === 't') return `${h.col}${h.row}`;
  return `${h.pol === '+' ? '+' : '−'} ${h.group ? h.group + ' ' : ''}rail ${h.idx + 1}`;
}

export function isOnBoard(x, y, margin = 0) {
  return x >= BOARD.x0 - margin && x <= BOARD.x1 + margin && y >= BOARD.y0 - margin && y <= BOARD.y1 + margin;
}

// Rotate an offset by rot * 90 degrees clockwise (screen, y down).
export function rotOffset(dx, dy, rot) {
  let x = dx, y = dy;
  for (let i = 0; i < ((rot % 4) + 4) % 4; i++) { const t = x; x = -y; y = t; }
  return [x, y];
}
