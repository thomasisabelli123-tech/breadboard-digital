// Global application state (zustand). The simulation engine is synchronised from here.
import { create } from 'zustand';
import { PART_TYPES } from './data/catalog.js';
import { EXAMPLES } from './data/examples.js';
import { engine } from './sim.js';
import { holeAt, isOnBoard, BOARD, rotOffset, STRADDLE_Y, setBoardType, BOARD_TYPE_IDS, holeById } from './engine/geometry.js';
import { pinWorld } from './engine/netlist.js';

// ---- persisted UI settings (best effort: localStorage may be unavailable)
const SETTINGS_KEY = 'bbd.settings.v2';
function loadSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (_) { return {}; }
}
function saveSettings(patch) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...loadSettings(), ...patch })); } catch (_) { /* ignore */ }
}
const SAVED = loadSettings();
const pickBoard = (id) => (BOARD_TYPE_IDS.includes(id) ? id : 'full');

let counter = 1;
const nid = (p) => `${p}${counter++}`;
const clone = (o) => JSON.parse(JSON.stringify(o));
const epEq = (a, b) => !!a && !!b && ((a.h && a.h === b.h) || (a.p && a.p === b.p && a.n === b.n));


// ---- validation of circuits coming from files / the cloud (never trust their content)
const MAX_PARTS = 400, MAX_WIRES = 2000;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const HEX = /^#[0-9a-f]{3,8}$/i;
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// Merge raw params over the catalog defaults, keeping only values of the right type (null / NaN / strings-for-numbers fall back to the default).
function cleanParams(def, raw) {
  const out = clone(def.params);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    if (BAD_KEYS.has(k)) continue;
    if (!(k in out)) { if (isNum(v) || typeof v === 'boolean' || (typeof v === 'string' && v.length < 20000)) out[k] = v; continue; }
    const d = out[k];
    if (typeof d === 'number') { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; if (isNum(n)) out[k] = n; }
    else if (typeof d === 'boolean') { if (typeof v === 'boolean') out[k] = v; }
    else if (typeof d === 'string') { if (typeof v === 'string' && v.length < 20000 && (!HEX.test(d) || HEX.test(v))) out[k] = v; }
    else if (Array.isArray(d)) { if (Array.isArray(v) && JSON.stringify(v).length < 20000) out[k] = clone(v); }
    else if (d && typeof d === 'object') { if (v && typeof v === 'object' && !Array.isArray(v) && JSON.stringify(v).length < 20000) out[k] = { ...d, ...clone(v) }; }
    else if (isNum(v) || typeof v === 'boolean' || typeof v === 'string') out[k] = v;
  }
  return out;
}

export const WIRE_COLORS = ['#e53935', '#212121', '#fbc02d', '#43a047', '#1e88e5', '#fb8c00', '#8e24aa', '#f5f5f5'];

function pinHoles(part) {
  const def = PART_TYPES[part.type];
  return def.pins(part.params).map((pin) => {
    const w = pinWorld(part, pin);
    return { pin, hole: holeAt(w.x, w.y), w };
  });
}

// Snap a placement request. Returns { x, y, valid }.
export function snapPlacement(type, bx, by, rot, parts, ignoreId, params) {
  const def = PART_TYPES[type];
  if (!def) return { x: bx, y: by, valid: false };
  if (def.bench) {
    const x = Math.round(bx * 2) / 2;
    let y = Math.round(by * 2) / 2;
    if (isOnBoard(x, y, 3)) y = BOARD.y1 + 5;
    return { x, y, valid: true };
  }
  const pr = params || def.params;
  const pins = def.pins(pr);
  let x = Math.round(bx), y = Math.round(by);
  if (def.straddle && rot % 2 === 0) {
    const ys = pins.map((p) => rotOffset(p.dx, p.dy, rot)[1]);
    y = STRADDLE_Y - Math.min(...ys);
  }
  const probe = { id: ignoreId || '_', type, x, y, rot, params: pr };
  const ph = pinHoles(probe);
  let valid = ph.every((q) => q.hole);
  if (valid) {
    const taken = new Set();
    for (const o of parts) {
      if (o.id === ignoreId || PART_TYPES[o.type].bench) continue;
      for (const q of pinHoles(o)) if (q.hole) taken.add(q.hole.id);
    }
    valid = ph.every((q) => !taken.has(q.hole.id));
  }
  return { x, y, valid };
}

export const useStore = create((set, get) => ({
  // ---- app flow
  screen: 'home', // 'home' | 'editor'
  modal: null, // null | 'auth' | 'settings' | 'circuits' | 'newproject' | 'save' | 'welcome'
  authTab: 'login',
  user: null, // { email, name, role, school, schoolName, mode }
  projectName: '',
  cloudId: null,
  board: 'full',
  tutorial: { active: false, step: 0 },
  lightLevel: typeof SAVED.lightLevel === 'number' ? SAVED.lightLevel : 1,
  lightAngle: typeof SAVED.lightAngle === 'number' ? SAVED.lightAngle : 0,
  shadows: SAVED.shadows !== false,
  reflections: SAVED.reflections !== false,
  defaultBoard: pickBoard(SAVED.defaultBoard),
  lang: SAVED.lang === 'it' ? 'it' : 'en',
  running: true,
  speed: 1,
  xray: false,
  parts: [],
  wires: [],
  selection: null,
  tool: 'select',
  armed: null,
  armedRot: 0,
  wireColor: WIRE_COLORS[0],
  burnt: {},
  sceneNonce: 0,
  loadReport: null,
  simTime: 0,
  tick: 0,
  autoRotate: false,
  tilt: 45,
  toast: null,
  showHelp: true,

  // ---- ui
  setLang: (lang) => { saveSettings({ lang }); set({ lang }); },
  goHome: () => set({ screen: 'home', modal: null, armed: null, tool: 'select' }),
  openModal: (modal, authTab) => set(authTab ? { modal, authTab } : { modal }),
  closeModal: () => set({ modal: null }),
  setUser: (user) => set({ user }),
  setProjectName: (projectName) => set({ projectName }),
  setLightLevel: (lightLevel) => { saveSettings({ lightLevel }); set({ lightLevel }); },
  setLightAngle: (lightAngle) => { saveSettings({ lightAngle }); set({ lightAngle }); },
  setShadows: (shadows) => { saveSettings({ shadows }); set({ shadows }); },
  setReflections: (reflections) => { saveSettings({ reflections }); set({ reflections }); },
  setDefaultBoard: (defaultBoard) => { saveSettings({ defaultBoard }); set({ defaultBoard }); },
  // The tutorial always starts on an empty Full-Size board so the steps match what is on screen.
  startTutorial: () => {
    get().setBoard('full');
    set({ tutorial: { active: true, step: 0 }, screen: 'editor', modal: null, projectName: '', xray: false, running: true });
  },
  setTutorialStep: (step) => set((s) => ({ tutorial: { ...s.tutorial, step } })),
  endTutorial: () => set({ tutorial: { active: false, step: 0 } }),
  // Switch the breadboard model. The circuit is cleared (hole ids differ between boards).
  setBoard: (id) => {
    const b = pickBoard(id);
    setBoardType(b);
    set((s) => ({ board: b, parts: [], wires: [], selection: null, burnt: {}, armed: null, armedRot: 0, tool: 'select', cloudId: null, simTime: 0, sceneNonce: s.sceneNonce + 1 }));
    engine.reset();
  },
  // Open the editor with a fresh, empty circuit on the given board.
  newProject: (id, name = '') => {
    get().setBoard(id || get().defaultBoard);
    set({ screen: 'editor', modal: null, projectName: name, cloudId: null, xray: false, running: true });
  },
  setRunning: (running) => set({ running }),
  setSpeed: (speed) => set({ speed }),
  setXray: (xray) => set({ xray }),
  setTool: (tool) => set({ tool, armed: null, selection: null }),
  setWireColor: (wireColor) => set({ wireColor }),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
  setTilt: (tilt) => set({ tilt }),
  setToast: (toast) => set({ toast }),
  toggleHelp: () => set((s) => ({ showHelp: !s.showHelp })),
  arm: (type) => {
    const def = PART_TYPES[type];
    if (!def) return;
    if (def.tool === 'wire') set({ tool: 'wire', armed: null, selection: null });
    else set({ armed: type, armedRot: 0, tool: 'select', selection: null });
  },
  disarm: () => set({ armed: null }),
  rotateArmed: () => set((s) => ({ armedRot: (s.armedRot + 1) % 4 })),
  select: (selection) => set({ selection }),
  bumpTick: () => set((s) => ({ tick: s.tick + 1, simTime: engine.t })),

  // ---- parts
  addPart: (type, bx, by, rot = 0, overrides = null) => {
    const def = PART_TYPES[type];
    if (!def || def.tool) return null;
    const params = { ...clone(def.params), ...(overrides || {}) };
    const snap = snapPlacement(type, bx, by, rot, get().parts, null, params);
    if (!snap.valid) return null;
    const part = { id: nid('p'), type, x: snap.x, y: snap.y, rot, params };
    if (def.probes) part.probes = {};
    set((s) => ({ parts: [...s.parts, part], selection: { kind: 'part', id: part.id } }));
    return part.id;
  },
  commitMove: (id, bx, by) => {
    const part = get().parts.find((p) => p.id === id);
    if (!part) return false;
    const snap = snapPlacement(part.type, bx, by, part.rot, get().parts, id, part.params);
    if (!snap.valid) return false;
    set((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, x: snap.x, y: snap.y } : p)) }));
    return true;
  },
  rotatePart: (id) => {
    const part = get().parts.find((p) => p.id === id);
    if (!part) return;
    const rot = (part.rot + 1) % 4;
    const def = PART_TYPES[part.type];
    let { x, y } = part;
    if (!def.bench) {
      const snap = snapPlacement(part.type, x, y, rot, get().parts, id, part.params);
      if (!snap.valid) { get().setToast('Cannot rotate here'); return; }
      x = snap.x; y = snap.y;
    }
    set((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, rot, x, y } : p)) }));
  },
  updateParams: (id, patch) =>
    set((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, params: { ...p.params, ...patch } } : p)) })),
  setProbe: (id, name, ep) =>
    set((s) => ({ parts: s.parts.map((p) => (p.id === id ? { ...p, probes: { ...(p.probes || {}), [name]: ep } } : p)) })),
  removePart: (id) => {
    set((s) => ({
      parts: s.parts.filter((p) => p.id !== id),
      wires: s.wires.filter((w) => !(w.a.p === id || w.b.p === id)),
      selection: s.selection && s.selection.id === id ? null : s.selection,
    }));
    engine.burnt.delete(id);
    engine.dyn.delete(id);
    engine.out.delete(id);
    engine.inputs.delete(id);
    set((s) => { const b = { ...s.burnt }; delete b[id]; return { burnt: b }; });
  },
  repairPart: (id) => {
    engine.repair(id);
    // a "new" part: also clear its dynamic state
    engine.dyn.delete(id);
    engine.out.delete(id);
    engine.rebuild();
  },

  // ---- wires
  addWire: (a, b, color) => {
    if (!a || !b || epEq(a, b)) return null;
    if (get().wires.some((w) => (epEq(w.a, a) && epEq(w.b, b)) || (epEq(w.a, b) && epEq(w.b, a)))) return null;
    const wire = { id: nid('w'), a, b, color: color || get().wireColor };
    set((s) => ({ wires: [...s.wires, wire] }));
    return wire.id;
  },
  updateWire: (id, patch) => set((s) => ({ wires: s.wires.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
  removeWire: (id) => set((s) => ({ wires: s.wires.filter((w) => w.id !== id), selection: s.selection && s.selection.id === id ? null : s.selection })),
  deleteSelection: () => {
    const sel = get().selection;
    if (!sel) return;
    if (sel.kind === 'part') get().removePart(sel.id);
    else get().removeWire(sel.id);
  },

  // ---- runtime inputs (buttons, keypad)
  setInput: (id, patch) => engine.setInput(id, patch),

  // ---- simulation control
  resetSim: () => {
    engine.reset();
    set({ burnt: {}, simTime: 0, tick: get().tick + 1 });
  },
  clearBoard: () => {
    set({ parts: [], wires: [], selection: null, burnt: {} });
    engine.reset();
  },

  // ---- project files
  serialize: () => ({ app: 'Breadboard Digital', author: 'Thomas Isabelli', version: 2, name: get().projectName, board: get().board, parts: get().parts, wires: get().wires }),
  loadProject: (data) => {
    if (!data || typeof data !== 'object' || !Array.isArray(data.parts)) return false;
    const board = pickBoard(data.board);
    setBoardType(board);
    let dropped = 0;
    const srcParts = data.parts.slice(0, MAX_PARTS);
    dropped += data.parts.length - srcParts.length;
    // 1. parts: known type, finite position, typed params, valid placement on THIS board, fresh ids
    const map = new Map();
    const parts = [];
    const placed = [];
    for (const p of srcParts) {
      const def = p && PART_TYPES[p.type];
      if (!def || def.tool || !isNum(p.x) || !isNum(p.y)) { dropped++; continue; }
      const rot = ((Math.round(isNum(p.rot) ? p.rot : 0) % 4) + 4) % 4;
      const params = cleanParams(def, p.params);
      const snap = snapPlacement(p.type, p.x, p.y, rot, placed, null, params);
      if (!snap.valid) { dropped++; continue; }
      const part = { id: nid('p'), type: p.type, x: snap.x, y: snap.y, rot, params };
      if (def.probes) part.probes = {};
      if (p.id != null && !map.has(p.id)) map.set(p.id, part.id);
      placed.push(part);
      parts.push({ part, src: p });
    }
    const byId = new Map(parts.map((e) => [e.part.id, e.part]));
    // 2. endpoints: a hole that exists on this board, or a real pin of an imported part
    const epOk = (ep) => {
      if (!ep || typeof ep !== 'object') return null;
      if (typeof ep.h === 'string') return holeById.has(ep.h) ? { h: ep.h } : null;
      const np = map.get(ep.p);
      const part = np && byId.get(np);
      if (!part) return null;
      const pin = PART_TYPES[part.type].pins(part.params).find((q) => q.n === ep.n);
      return pin ? { p: np, n: ep.n } : null;
    };
    for (const { part, src } of parts) {
      const names = PART_TYPES[part.type].probes;
      if (names && src.probes && typeof src.probes === 'object') {
        for (const nm of names) { const ep = epOk(src.probes[nm]); if (ep) part.probes[nm] = ep; }
      }
    }
    // 3. wires: valid ends, no self loops, no duplicates, sane colour
    const wires = [];
    const srcWires = (Array.isArray(data.wires) ? data.wires : []).slice(0, MAX_WIRES);
    for (const w of srcWires) {
      const a = w && epOk(w.a), b = w && epOk(w.b);
      if (!a || !b || epEq(a, b) || wires.some((q) => (epEq(q.a, a) && epEq(q.b, b)) || (epEq(q.a, b) && epEq(q.b, a)))) { dropped++; continue; }
      wires.push({ id: nid('w'), a, b, color: typeof w.color === 'string' && HEX.test(w.color) ? w.color : '#e53935' });
    }
    // 4. same clean runtime state as a brand-new project, then the circuit
    set((s) => ({
      parts: parts.map((e) => e.part), wires, board, selection: null, burnt: {}, armed: null, armedRot: 0, tool: 'select',
      screen: 'editor', modal: null, projectName: typeof data.name === 'string' ? data.name.slice(0, 120) : (get().projectName || ''),
      simTime: 0, sceneNonce: s.sceneNonce + 1, loadReport: { dropped },
    }));
    engine.reset();
    return true;
  },
  loadExample: (name) => {
    const b = EXAMPLES[name]();
    get().loadProject({ parts: b.parts, wires: b.wires, board: 'full', name: '' });
    set({ running: true, cloudId: null });
  },
}));

// keep the engine in sync with the circuit description
let last = { parts: null, wires: null };
useStore.subscribe((s) => {
  if (s.parts !== last.parts || s.wires !== last.wires) {
    last = { parts: s.parts, wires: s.wires };
    try { engine.sync(s.parts, s.wires); } catch (e) {
      // an invalid circuit must never break the UI event that changed it: pause the simulation and say why
      console.error('[sim] sync failed', e);
      setTimeout(() => useStore.setState({ running: false, toast: `⚠ ${String((e && e.message) || e).slice(0, 140)}` }), 0);
    }
  }
});

engine.onBurn = (id, info) => {
  if (id === null) { useStore.setState({ burnt: {} }); return; }
  useStore.setState((s) => {
    const b = { ...s.burnt };
    if (info) b[id] = info; else delete b[id];
    return { burnt: b };
  });
};
