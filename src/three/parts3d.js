// Procedural 3D models of every component. Local frame: X = pin dx, Z = pin dy, Y up,
// origin = anchor pin at board surface level (y = 0). Bench parts rest on the desk (y = DESK_Y).
import * as THREE from 'three';
import { resistorBands, fmt } from '../data/format.js';
import { drawScope } from '../ui/scopeDraw.js';

export const DESK_Y = -1.2;
export const BENCH_Y = 1.5; // height of bench terminals (wire attachment point)

// ---------------------------------------------------------------- helpers
const cache = new Map();
export function mat(color, o = {}) {
  const key = color + '|' + (o.r ?? 0.6) + '|' + (o.m ?? 0) + '|' + (o.o ?? 1);
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color, roughness: o.r ?? 0.6, metalness: o.m ?? 0,
      transparent: (o.o ?? 1) < 1, opacity: o.o ?? 1,
    });
    cache.set(key, m);
  }
  return m;
}
const METAL = () => mat('#c9ccd2', { r: 0.3, m: 0.9 });
const BRASS = () => mat('#d9b25a', { r: 0.35, m: 0.9 });
const BLACK = () => mat('#16161a', { r: 0.5 });
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

function box(w, h, d, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
}
function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 20) {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y, z);
  return o;
}
function leg(a, b, r = 0.06, m = METAL()) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), m);
  o.position.copy(a).addScaledVector(d, 0.5);
  o.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize());
  return o;
}
function pinLegs(g, pins, topY, r = 0.06) {
  for (const p of pins) g.add(leg(V3(p.dx, -0.35, p.dy), V3(p.dx, topY, p.dy), r));
}
export function textTexture(lines, w = 256, h = 96, o = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = o.bg || 'rgba(0,0,0,0)';
  if (o.bg) x.fillRect(0, 0, w, h);
  x.fillStyle = o.fg || '#e8e8e8';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const arr = Array.isArray(lines) ? lines : [lines];
  const fs = o.size || Math.floor(h / (arr.length + 0.6));
  x.font = `bold ${fs}px sans-serif`;
  arr.forEach((t, i) => x.fillText(t, w / 2, (h * (i + 1)) / (arr.length + 1)));
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  return tex;
}
function labelPlane(text, w, h, o = {}) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: textTexture(text, o.tw || 256, o.th || 96, o), transparent: true })
  );
  return m;
}
export function makeScreen(w, h, pw = 256, ph = 128) {
  const c = document.createElement('canvas');
  c.width = pw; c.height = ph;
  const tex = new THREE.CanvasTexture(c);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  return { canvas: c, ctx: c.getContext('2d'), tex, mesh };
}
let haloTex = null;
function halo() {
  if (!haloTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(c);
  }
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 }));
}

// ---------------------------------------------------------------- axial parts
function axialBody(g, span, bodyLen, r, bodyMat, y = 0.8) {
  g.add(leg(V3(0, -0.35, 0), V3(0, y, 0)), leg(V3(span, -0.35, 0), V3(span, y, 0)));
  g.add(leg(V3(0, y, 0), V3(span, y, 0)));
  const b = cyl(r, r, bodyLen, bodyMat, span / 2, y, 0);
  b.rotation.z = Math.PI / 2;
  g.add(b);
  return b;
}
function ring(g, x, y, r, len, color) {
  const o = cyl(r, r, len, mat(color, { r: 0.5 }), x, y, 0, 20);
  o.rotation.z = Math.PI / 2;
  g.add(o);
}

const B = {};

B.resistor = (part, def, pins) => {
  const g = new THREE.Group();
  const p = part.params, span = p.span;
  const bl = Math.min(span - 0.9, 3.1);
  const body = axialBody(g, span, bl, 0.42, mat(p.tol <= 2 ? '#7ab8d9' : '#d9b779', { r: 0.7 }));
  const bands = resistorBands(p.R, p.tol);
  const x0 = span / 2 - bl / 2 + 0.32;
  const step = bl > 2 ? 0.3 : 0.22;
  bands.forEach((c, i) => ring(g, x0 + i * step + (i === 3 ? step * 0.5 : 0), 0.8, 0.435, 0.12, c));
  void body;
  return g;
};

B.cap_elec = (part, def, pins) => {
  const g = new THREE.Group();
  const s = part.params.span, cx = s / 2;
  g.add(cyl(0.12, 0.12, 0.1, METAL(), 0, 0, 0)); // placeholder to keep group non-empty
  g.add(leg(V3(0, -0.35, 0), V3(0, 0.4, 0)), leg(V3(s, -0.35, 0), V3(s, 0.4, 0)));
  g.add(cyl(0.72, 0.72, 1.7, mat('#1b3a8a', { r: 0.45 }), cx, 1.25, 0));
  g.add(cyl(0.73, 0.73, 0.06, mat('#c9ccd2', { m: 0.8, r: 0.3 }), cx, 2.1, 0));
  g.add(box(0.06, 1.5, 0.5, mat('#d6dbe4'), cx + 0.72, 1.25, 0)); // polarity stripe on '-' side
  const t = labelPlane([fmt(part.params.C, 'F', 3), `${part.params.Vmax}V`], 1.0, 1.0, { tw: 128, th: 128, size: 30 });
  t.position.set(cx - 0.0, 1.25, 0.74);
  g.add(t);
  return g;
};

B.cap_disc = (part, def) => {
  const g = new THREE.Group();
  const s = part.params.span, cx = s / 2;
  g.add(leg(V3(0, -0.35, 0), V3(0, 0.9, 0)), leg(V3(s, -0.35, 0), V3(s, 0.9, 0)));
  const d = cyl(0.62, 0.62, 0.28, mat('#c8742a', { r: 0.6 }), cx, 1.5, 0, 28);
  d.rotation.x = Math.PI / 2;
  g.add(d);
  const t = labelPlane(fmt(part.params.C, 'F', 2), 0.9, 0.5, { tw: 128, th: 64, size: 26, fg: '#2a1400' });
  t.position.set(cx, 1.5, 0.15);
  g.add(t);
  return g;
};

B.cap_poly = (part, def) => {
  const g = new THREE.Group();
  const s = part.params.span;
  g.add(leg(V3(0, -0.35, 0), V3(0, 0.5, 0)), leg(V3(s, -0.35, 0), V3(s, 0.5, 0)));
  g.add(box(s + 0.7, 1.6, 0.7, mat('#d63a2f', { r: 0.5 }), s / 2, 1.1, 0));
  const t = labelPlane(fmt(part.params.C, 'F', 2), s + 0.4, 0.6, { tw: 192, th: 64, size: 30 });
  t.position.set(s / 2, 1.1, 0.36);
  g.add(t);
  return g;
};

B.inductor = (part) => {
  const g = new THREE.Group();
  const s = part.params.span;
  const core = axialBody(g, s, Math.min(s - 0.8, 3.0), 0.3, mat('#555a62', { r: 0.4, m: 0.4 }), 0.8);
  void core;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.09, 8, 20), mat('#c06a2a', { r: 0.3, m: 0.8 }));
    t.position.set(s / 2 - 1.2 + (i * 2.4) / (n - 1), 0.8, 0);
    t.rotation.y = Math.PI / 2;
    g.add(t);
  }
  return g;
};

B.pot = (part, def, pins) => {
  const g = new THREE.Group();
  pinLegs(g, pins, 0.3);
  g.add(box(3.2, 1.3, 2.6, mat('#2455b8', { r: 0.5 }), 1, 0.85, 0));
  const knob = new THREE.Group();
  knob.position.set(1, 1.5, 0);
  knob.add(cyl(0.8, 0.85, 0.7, mat('#1b1b20', { r: 0.4 }), 0, 0.35, 0, 28));
  knob.add(box(0.12, 0.05, 0.8, mat('#f0f0f0'), 0, 0.72, -0.4));
  knob.rotation.y = -(-2.35 + part.params.pos * 4.7);
  g.add(knob);
  return g;
};
B.trimmer = (part, def, pins) => {
  const g = new THREE.Group();
  pinLegs(g, pins, 0.3);
  g.add(box(3.0, 1.0, 2.8, mat('#2455b8', { r: 0.5 }), 1, 0.7, 0));
  const s = cyl(0.75, 0.75, 0.15, BRASS(), 1, 1.25, 0, 24);
  s.rotation.y = -(-2.35 + part.params.pos * 4.7);
  s.add(box(1.3, 0.2, 0.18, mat('#222'), 0, 0.08, 0));
  g.add(s);
  return g;
};
B.ldr = (part) => {
  const g = new THREE.Group();
  const s = part.params.span;
  g.add(leg(V3(0, -0.35, 0), V3(0, 0.7, 0)), leg(V3(s, -0.35, 0), V3(s, 0.7, 0)));
  const d = cyl(0.95, 0.95, 0.4, mat('#9a6a32', { r: 0.4 }), s / 2, 0.85, 0, 32);
  g.add(d);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#c9a26a'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = '#5a3a14'; x.lineWidth = 5; x.beginPath();
  for (let i = 0; i < 6; i++) { const yy = 18 + i * 18; x.moveTo(20, yy); x.lineTo(108, yy + (i % 2 ? -6 : 6)); }
  x.stroke();
  const top = new THREE.Mesh(new THREE.CircleGeometry(0.85, 32), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
  top.rotation.x = -Math.PI / 2;
  top.position.set(s / 2, 1.06, 0);
  g.add(top);
  return g;
};
B.ntc = (part) => {
  const g = new THREE.Group();
  const s = part.params.span;
  g.add(leg(V3(0, -0.35, 0), V3(0, 1.2, 0)), leg(V3(s, -0.35, 0), V3(s, 1.2, 0)));
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 16), mat(part.type === 'ptc' ? '#3a7ad9' : '#d9623a', { r: 0.4 }));
  m.scale.y = 1.2;
  m.position.set(s / 2, 1.5, 0);
  g.add(m);
  return g;
};

// ---------------------------------------------------------------- LEDs & diodes
function ledBody(g, cx, color, opts = {}) {
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.15, transparent: true, opacity: 0.82, emissive: color, emissiveIntensity: 0.0 });
  const base = cyl(0.62, 0.62, 0.2, body, cx, 0.35, 0);
  const shaft = cyl(0.55, 0.55, 0.7, body, cx, 0.8, 0);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), body);
  dome.position.set(cx, 1.15, 0);
  g.add(base, shaft, dome);
  const h = halo();
  h.position.set(cx, 1.2, 0);
  g.add(h);
  return { body, halo: h, base };
}
B.led = (part, def, pins) => {
  const g = new THREE.Group();
  const s = part.params.span;
  g.add(leg(V3(0, -0.35, 0), V3(0, 0.3, 0)), leg(V3(s, -0.35, 0), V3(s, 0.3, 0)));
  const L = ledBody(g, s / 2, part.params.color);
  const col = new THREE.Color(part.params.color);
  g.userData.update = (out) => {
    const b = out && !out.burnt ? out.b || 0 : 0;
    L.body.emissiveIntensity = Math.min(2.2, b * 1.8);
    L.body.opacity = 0.82 + Math.min(0.18, b * 0.2);
    L.halo.material.opacity = Math.min(1, b * 0.9);
    L.halo.material.color.copy(col);
    const sc = 0.8 + Math.min(1.6, b) * 2.4;
    L.halo.scale.set(sc, sc, 1);
  };
  return g;
};
B.led_rgb = (part, def, pins) => {
  const g = new THREE.Group();
  pinLegs(g, pins, 0.3);
  const L = ledBody(g, 1.5, '#ffffff');
  g.userData.update = (out) => {
    const r = out ? out.r || 0 : 0, gg = out ? out.g || 0 : 0, b = out ? out.b || 0 : 0;
    const m = Math.max(r, gg, b, 1e-6);
    const col = new THREE.Color(Math.min(1, r / m), Math.min(1, gg / m), Math.min(1, b / m));
    const on = Math.min(1.6, m);
    L.body.color.set('#f0f0f0').lerp(col, Math.min(1, on * 2));
    L.body.emissive.copy(col);
    L.body.emissiveIntensity = Math.min(2.2, on * 1.8);
    L.halo.material.color.copy(col);
    L.halo.material.opacity = Math.min(1, on * 0.9);
    const sc = 0.8 + on * 2.4;
    L.halo.scale.set(sc, sc, 1);
  };
  return g;
};
B.diode = (part) => {
  const g = new THREE.Group();
  const s = part.params.span;
  const b = axialBody(g, s, 2.2, 0.34, mat('#1d1d22', { r: 0.4 }), 0.7);
  void b;
  ring(g, s / 2 + 0.85, 0.7, 0.35, 0.28, part.params.band || '#d8d8d8');
  return g;
};
B.zener = (part) => {
  const g = new THREE.Group();
  const s = part.params.span;
  axialBody(g, s, 2.2, 0.34, mat('#e0a23c', { r: 0.2, o: 1 }), 0.7);
  ring(g, s / 2 + 0.85, 0.7, 0.35, 0.28, '#111');
  return g;
};

// ---------------------------------------------------------------- TO-92 / TO-220
B.to92 = (part, def, pins) => {
  const g = new THREE.Group();
  pinLegs(g, pins, 0.6);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 1.5, 24, 1, false, Math.PI / 2, Math.PI), mat('#17171b', { r: 0.5 }));
  body.position.set(1, 1.3, 0);
  g.add(body);
  g.add(box(1.36, 1.5, 0.02, mat('#17171b'), 1, 1.3, 0));
  const t = labelPlane(part.params.label, 1.3, 0.5, { tw: 192, th: 64, size: 26 });
  t.position.set(1, 1.35, 0.02);
  g.add(t);
  return g;
};
B.to220 = (part, def, pins) => {
  const g = new THREE.Group();
  pinLegs(g, pins, 0.9);
  g.add(box(2.7, 1.0, 0.1, mat('#b7bcc4', { m: 0.8, r: 0.3 }), 1, 3.9, -0.5)); // tab
  const hole = cyl(0.3, 0.3, 0.14, BLACK(), 1, 4.0, -0.5);
  hole.rotation.x = Math.PI / 2;
  g.add(hole);
  g.add(box(2.7, 2.6, 0.9, mat('#111114', { r: 0.5 }), 1, 2.1, 0));
  const t = labelPlane(part.params.label || '', 2.5, 0.8, { tw: 256, th: 96, size: 34 });
  t.position.set(1, 2.1, 0.46);
  g.add(t);
  return g;
};

// ---------------------------------------------------------------- switches
B.pushbutton = (part, def, pins) => {
  const g = new THREE.Group();
  pinLegs(g, pins, 0.3);
  g.add(box(2.7, 0.9, 2.7, mat('#25262b', { r: 0.5 }), 1, 0.7, 1.5));
  g.add(cyl(0.95, 0.95, 0.12, METAL(), 1, 1.2, 1.5, 24));
  const cap = cyl(0.62, 0.62, 0.7, mat('#d63a2f', { r: 0.4 }), 1, 1.55, 1.5, 24);
  cap.userData.cap = true;
  g.add(cap);
  g.userData.update = (out, input) => { cap.position.y = input && input.pressed ? 1.3 : 1.55; };
  return g;
};
function lever(g, x, y, z, pos, w = 0.6) {
  const l = box(w, 0.8, 0.5, mat('#1b1b20'), x + (pos ? 0.55 : -0.55), y, z);
  g.add(l);
}
B.slide_sw = (part, def, pins) => {
  const g = new THREE.Group();
  pinLegs(g, pins, 0.3);
  g.add(box(3.0, 1.0, 1.4, mat('#b9bec7', { m: 0.8, r: 0.3 }), 1, 0.8, 0));
  const on = part.type === 'sw_spst' ? (part.params.on ? 1 : 0) : +part.params.pos;
  lever(g, 1, 1.6, 0, on);
  return g;
};
B.slide_sw2 = (part, def, pins) => {
  const g = new THREE.Group();
  pinLegs(g, pins, 0.3);
  g.add(box(3.2, 1.2, 3.7, mat('#b9bec7', { m: 0.8, r: 0.3 }), 1, 0.9, 1.5));
  lever(g, 1, 1.8, 1.5, +part.params.pos, 0.7);
  return g;
};
B.dip_sw = (part, def, pins) => {
  const g = new THREE.Group();
  pinLegs(g, pins, 0.3);
  g.add(box(8.2, 1.8, 2.5, mat('#1f56b8', { r: 0.5 }), 3.5, 1.1, 1.5));
  const sw = part.params.sw || [];
  for (let i = 0; i < 8; i++) {
    const s = box(0.55, 0.3, 1.2, mat('#f2f2f2'), i + 0 * 1, 2.1, 1.5 + (sw[i] ? -0.45 : 0.45));
    s.userData.dipIndex = i;
    g.add(s);
    const n = labelPlane(String(i + 1), 0.5, 0.4, { tw: 64, th: 64, size: 40 });
    n.rotation.x = -Math.PI / 2; n.position.set(i, 2.02, 2.45);
    g.add(n);
  }
  return g;
};
B.keypad = (part, def, pins) => {
  const g = new THREE.Group();
  pinLegs(g, pins, 0.3);
  g.add(box(8.6, 0.5, 9.4, mat('#27282d', { r: 0.6 }), 3.5, 0.4, 5.2));
  const keys = [];
  const labels = '123A456B789C*0#D';
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
    const k = cyl(0.42, 0.42, 0.5, mat('#e7e7ea', { r: 0.4 }), 0.9 + c * 1.9, 0.9, 1.9 + r * 2.1, 20);
    k.userData.key = r * 4 + c;
    g.add(k);
    keys.push(k);
    const t = labelPlane(labels[r * 4 + c], 0.6, 0.6, { tw: 64, th: 64, size: 44, fg: '#111' });
    t.rotation.x = -Math.PI / 2; t.position.set(k.position.x, 1.16, k.position.z);
    g.add(t);
  }
  g.userData.update = (out, input) => {
    keys.forEach((k, i) => { k.position.y = input && input.keys && input.keys.has(i) ? 0.72 : 0.9; });
  };
  return g;
};

// ---------------------------------------------------------------- ICs
B.dip = (part, def, pins) => {
  const g = new THREE.Group();
  const n = pins.length, half = n / 2;
  for (const p of pins) {
    const dir = p.dy === 0 ? 1 : -1; // legs bend towards the body
    g.add(leg(V3(p.dx, -0.35, p.dy), V3(p.dx, 0.35, p.dy)));
    g.add(leg(V3(p.dx, 0.35, p.dy), V3(p.dx, 0.35, p.dy + dir * 0.45), 0.07));
  }
  const len = half - 1 + 0.8;
  g.add(box(len, 1.0, 2.4, mat('#17171c', { r: 0.45 }), (half - 1) / 2, 0.85, 1.5));
  const notch = cyl(0.25, 0.25, 0.05, mat('#000'), -0.15, 1.38, 1.5, 16);
  g.add(notch);
  const dot = cyl(0.12, 0.12, 0.05, mat('#555'), 0.1, 1.38, 2.45, 12);
  g.add(dot);
  const t = labelPlane(part.params.label || def.name.en.split(' ')[0], len - 0.8, 1.0, { tw: 384, th: 96, size: 44, fg: '#cfcfd6' });
  t.rotation.x = -Math.PI / 2;
  t.position.set((half - 1) / 2 + 0.1, 1.37, 1.5);
  g.add(t);
  return g;
};

B.arduino_nano = (part, def, pins) => {
  const g = new THREE.Group();
  pinLegs(g, pins, 0.4);
  g.add(box(15.2, 0.35, 6.9, mat('#0f5a8c', { r: 0.5 }), 7, 0.55, 3));
  g.add(box(2.4, 1.2, 3.0, METAL(), -0.6, 1.2, 3));
  g.add(box(3.2, 0.5, 3.2, BLACK(), 9.5, 0.95, 3));
  g.add(box(2.2, 0.4, 0.9, BLACK(), 4.5, 0.9, 3));
  const led = box(0.4, 0.15, 0.7, mat('#ffae00', { r: 0.3 }), 6.2, 0.8, 1.2);
  const lm = led.material.clone(); led.material = lm;
  g.add(led);
  const t = labelPlane('NANO', 3, 0.9, { tw: 256, th: 64, size: 36 });
  t.rotation.x = -Math.PI / 2; t.position.set(11, 0.76, 3.6);
  g.add(t);
  g.userData.update = (out) => {
    const on = out && !out.burnt ? out.led || 0 : 0;
    lm.emissive = new THREE.Color('#ff9a00'); lm.emissiveIntensity = on * 2;
  };
  return g;
};
B.esp32 = (part, def, pins) => {
  const g = new THREE.Group();
  pinLegs(g, pins, 0.4);
  g.add(box(18.5, 0.35, 10.2, mat('#1a1a1f', { r: 0.5 }), 7, 0.55, 4.5));
  g.add(box(6, 0.15, 6, mat('#b8bcc4', { m: 0.8, r: 0.3 }), 13, 0.85, 4.5));
  g.add(box(4.2, 0.3, 4.2, BLACK(), 5, 0.9, 4.5));
  g.add(box(2.2, 1.0, 3.0, METAL(), -1.2, 1.1, 4.5));
  const led = box(0.4, 0.15, 0.6, mat('#2a7bff'), 2.2, 0.8, 8.2);
  const lm = led.material.clone(); led.material = lm; g.add(led);
  const t = labelPlane('ESP32', 4, 1, { tw: 256, th: 64, size: 40 });
  t.rotation.x = -Math.PI / 2; t.position.set(5, 1.08, 4.5);
  g.add(t);
  g.userData.update = (out) => {
    const on = out && !out.burnt ? out.led || 0 : 0;
    lm.emissive = new THREE.Color('#2a7bff'); lm.emissiveIntensity = on * 2;
  };
  return g;
};

// ---------------------------------------------------------------- bench parts
function post(g, x, color, z = 0) {
  g.add(cyl(0.38, 0.38, 0.5, mat(color, { r: 0.4 }), x, BENCH_Y - 0.25, z, 20));
  g.add(cyl(0.2, 0.2, 0.4, METAL(), x, BENCH_Y + 0.15, z, 12));
}
function benchBody(g, w, h, d, cx, cz, color) {
  const b = box(w, h, d, mat(color, { r: 0.5 }), cx, DESK_Y + h / 2, cz);
  g.add(b);
  return b;
}

function displayUnit(w, h) { const s = makeScreen(w, h, 256, 96); return s; }

// ---- live LCD of a power source: shows the *set* values and the *real* V / A / W delivered by the engine.
const LCD_W = 384, LCD_H = 192;
function lcdScreen(w) { return makeScreen(w, w / 2, LCD_W, LCD_H); }

function paintSource(s, d) {
  const c = s.ctx;
  c.fillStyle = '#041008'; c.fillRect(0, 0, LCD_W, LCD_H);
  c.textBaseline = 'middle'; c.textAlign = 'left';
  const on = d.on !== false;
  const dim = (col, off) => (on ? col : off);
  c.font = 'bold 54px monospace'; c.fillStyle = dim('#44ff88', '#24462f');
  c.fillText(`${on ? d.v.toFixed(2) : '--.--'}V`, 10, 40);
  c.font = 'bold 40px monospace'; c.fillStyle = on ? (d.cc ? '#ff5544' : '#ffcc44') : '#4a3f1e';
  c.fillText(`${on ? Math.abs(d.i).toFixed(3) : '-.---'}A`, 10, 98);
  c.fillStyle = dim('#44d0ff', '#1f3f4a');
  c.fillText(`${on ? Math.abs(d.p).toFixed(3) : '-.---'}W`, 10, 150);
  // right column: set-points
  c.font = '20px monospace'; c.fillStyle = '#7fb89a';
  c.fillText('SET', 236, 24);
  c.font = 'bold 26px monospace'; c.fillStyle = '#9be8bd';
  c.fillText(`${d.setV.toFixed(2)}V`, 236, 52);
  c.font = '20px monospace'; c.fillStyle = '#7fb89a';
  c.fillText('LIM', 236, 88);
  c.font = 'bold 26px monospace'; c.fillStyle = '#e8cf8a';
  c.fillText(`${d.lim.toFixed(d.lim < 1 ? 3 : 2)}A`, 236, 116);
  c.font = 'bold 26px monospace';
  c.fillStyle = !on ? '#777' : d.cc ? '#ff5544' : '#44ff88';
  c.fillText(!on ? 'OFF' : d.cc ? 'CC' : 'CV', 236, 160);
  if (d.caption) { c.font = '16px monospace'; c.fillStyle = '#5f8f77'; c.textAlign = 'right'; c.fillText(d.caption, LCD_W - 8, 176); }
  s.tex.needsUpdate = true;
}

// returns the per-frame update function of a single-output source
function sourceUpdate(s, part, caption) {
  let last = -1;
  return (out, input, t, eng, live) => {
    if (t - last < 0.05) return;
    last = t;
    const P = (live || part).params;
    const o = out || {};
    const on = P.on !== false;
    paintSource(s, {
      on, v: on ? o.v || 0 : 0, i: on ? o.i || 0 : 0, p: on ? o.p || 0 : 0, cc: !!o.cc,
      setV: P.V || 0, lim: P.Imax || 0, caption,
    });
  };
}

const BAT_CAPTION = { bat_9v: 'BATTERY', bat_aa: 'AA CELL', bat_aaa: 'AAA CELL', bat_cr2032: 'COIN CELL', bat_lipo: 'LiPo' };

B.battery = (part, def, pins) => {
  const g = new THREE.Group();
  const kind = part.params.kind || 'bat_9v';
  post(g, 0, '#c62828'); post(g, 2, '#202020');
  let s;
  if (kind === 'bat_9v') {
    benchBody(g, 4.6, 2.6, 3.2, 1, 0, '#2a2a2e');
    g.add(box(4.0, 0.05, 2.6, mat('#e8a317'), 1, 1.42, 0));
    s = lcdScreen(3.5); s.mesh.position.set(1, 1.47, 0);
  } else if (kind === 'bat_cr2032') {
    g.add(cyl(1.7, 1.7, 0.32, mat('#c9ccd2', { m: 0.8, r: 0.3 }), 1, DESK_Y + 0.16, 0, 32));
    g.add(box(0.2, 0.2, 0.2, BLACK(), 1, 0, 0));
    g.add(leg(V3(0, DESK_Y + 0.2, 0), V3(0, BENCH_Y, 0), 0.05));
    s = lcdScreen(2.7); s.mesh.position.set(1, DESK_Y + 0.36, 0);
  } else if (kind === 'bat_lipo') {
    benchBody(g, 5.2, 0.9, 3.4, 1, 0, '#2d5fd1');
    s = lcdScreen(4.2); s.mesh.position.set(1, DESK_Y + 0.93, 0);
  } else {
    const len = kind === 'bat_aa' ? 5.0 : 4.2, r = kind === 'bat_aa' ? 0.9 : 0.75;
    const c = cyl(r, r, len, mat(kind === 'bat_aa' ? '#e0b020' : '#3aa0d9', { r: 0.4 }), 1, DESK_Y + r, 0.0, 24);
    c.rotation.z = Math.PI / 2;
    g.add(c);
    const nub = cyl(r * 0.45, r * 0.45, 0.2, METAL(), 1 + len / 2 + 0.05, DESK_Y + r, 0);
    nub.rotation.z = Math.PI / 2;
    g.add(nub);
    s = lcdScreen(3.1); s.mesh.position.set(1, DESK_Y + 2 * r + 0.03, 0);
  }
  s.mesh.rotation.x = -Math.PI / 2;
  g.add(s.mesh);
  g.userData.update = sourceUpdate(s, part, BAT_CAPTION[kind] || '');
  return g;
};

B.psu = (part, def, pins) => {
  const g = new THREE.Group();
  benchBody(g, 7.6, 3.2, 5, 1, 1.5, '#3b3f48');
  post(g, 0, '#c62828'); post(g, 2, '#202020');
  const s = lcdScreen(4.4);
  s.mesh.rotation.x = -Math.PI / 2; s.mesh.position.set(3.6, DESK_Y + 3.22, 1.9);
  g.add(s.mesh);
  g.add(cyl(0.45, 0.45, 0.3, mat('#d0d0d4', { m: 0.5 }), 5.4, DESK_Y + 3.35, 0.2, 20));
  g.userData.update = sourceUpdate(s, part, 'BENCH PSU');
  return g;
};

B.psu_dual = (part, def, pins) => {
  const g = new THREE.Group();
  benchBody(g, 9.6, 3.2, 5, 2, 1.5, '#3b3f48');
  post(g, 0, '#c62828'); post(g, 2, '#2c8a3a'); post(g, 4, '#2060c0');
  const s = lcdScreen(5.2);
  s.mesh.rotation.x = -Math.PI / 2; s.mesh.position.set(2, DESK_Y + 3.22, 2.3);
  g.add(s.mesh);
  let last = -1;
  g.userData.update = (out, input, t, eng, live) => {
    if (t - last < 0.05) return;
    last = t;
    const P = (live || part).params, o = out || {};
    const on = P.on !== false;
    const c = s.ctx;
    c.fillStyle = '#041008'; c.fillRect(0, 0, LCD_W, LCD_H);
    c.textBaseline = 'middle'; c.textAlign = 'left';
    const row = (y, label, v, i, col) => {
      c.font = 'bold 40px monospace'; c.fillStyle = on ? col : '#24462f';
      c.fillText(on ? `${label}${Math.abs(v).toFixed(2)}V` : `${label}--.--V`, 10, y);
      c.font = 'bold 32px monospace'; c.fillStyle = on ? '#ffcc44' : '#4a3f1e';
      c.fillText(on ? `${Math.abs(i).toFixed(3)}A` : '-.---A', 232, y);
    };
    row(36, '+', o.vpos || 0, o.ipos || 0, '#44ff88');
    row(92, '-', o.vneg || 0, o.ineg || 0, '#6aa8ff');
    const pw = Math.abs((o.vpos || 0) * (o.ipos || 0)) + Math.abs((o.vneg || 0) * (o.ineg || 0));
    c.font = 'bold 36px monospace'; c.fillStyle = on ? '#44d0ff' : '#1f3f4a';
    c.fillText(`${on ? pw.toFixed(3) : '-.---'}W`, 10, 148);
    c.font = '20px monospace'; c.fillStyle = '#7fb89a';
    c.fillText(`SET ±${(P.V || 0).toFixed(2)}V  LIM ${(P.Imax || 0).toFixed(3)}A`, 150, 150);
    c.font = '16px monospace'; c.fillStyle = '#5f8f77'; c.textAlign = 'right'; c.fillText('DUAL PSU', LCD_W - 8, 176);
    s.tex.needsUpdate = true;
  };
  return g;
};

B.ac_ct = (part) => {
  const g = new THREE.Group();
  benchBody(g, 9.6, 3.0, 5, 2, 1.5, '#5b3b2a');
  g.add(box(6, 0.2, 3, mat('#222'), 2, DESK_Y + 3.1, 2));
  post(g, 0, '#d9a017'); post(g, 2, '#2c8a3a'); post(g, 4, '#d9a017');
  const t = labelPlane(`${part.params.Vrms}-0-${part.params.Vrms}V ~`, 5.4, 1.2, { tw: 384, th: 96, size: 44 });
  t.rotation.x = -Math.PI / 2; t.position.set(2, DESK_Y + 3.22, 2);
  g.add(t);
  return g;
};
B.funcgen = (part) => {
  const g = new THREE.Group();
  benchBody(g, 7.6, 3.2, 5, 1, 1.5, '#2c4a6b');
  post(g, 0, '#d9a017'); post(g, 2, '#202020');
  const s = displayUnit(4.2, 1.5);
  s.mesh.rotation.x = -Math.PI / 2; s.mesh.position.set(3.6, DESK_Y + 3.22, 1.6);
  g.add(s.mesh);
  let last = -1;
  g.userData.update = (out, input, t) => {
    if (t - last < 0.25) return;
    last = t;
    const c = s.ctx, p = part.params;
    c.fillStyle = '#041008'; c.fillRect(0, 0, 256, 96);
    c.font = 'bold 34px monospace'; c.textBaseline = 'middle'; c.fillStyle = '#44d0ff';
    c.fillText(fmt(p.f, 'Hz', 4), 8, 28);
    c.fillText(`${p.wave} ${p.amp}Vp`, 8, 70);
    s.tex.needsUpdate = true;
  };
  return g;
};

function probeJack(g, x, color) {
  g.add(cyl(0.42, 0.42, 0.45, mat('#111'), x, BENCH_Y - 0.4, 0, 20));
  g.add(cyl(0.3, 0.3, 0.2, mat(color, { r: 0.4 }), x, BENCH_Y - 0.1, 0, 20));
}
B.multimeter = (part) => {
  const g = new THREE.Group();
  const b = benchBody(g, 6.6, 1.8, 11, 1, 6.2, '#e6b422');
  b.position.y = DESK_Y + 0.9;
  g.add(box(5.4, 0.1, 11 - 0.4, mat('#2a2a2a'), 1, DESK_Y + 1.82, 6.2));
  probeJack(g, 0, '#c62828'); probeJack(g, 2, '#111');
  const s = makeScreen(4.6, 2.4, 256, 128);
  s.mesh.rotation.x = -Math.PI / 2; s.mesh.position.set(1, DESK_Y + 1.9, 3.0);
  g.add(s.mesh);
  g.add(cyl(1.3, 1.3, 0.3, mat('#222'), 1, DESK_Y + 1.95, 7.5, 28));
  g.add(box(0.15, 0.1, 1.3, mat('#fff'), 1, DESK_Y + 2.15, 7.0));
  let last = -1;
  g.userData.update = (out, input, t) => {
    if (t - last < 0.1) return;
    last = t;
    const c = s.ctx;
    c.fillStyle = '#b9c9a6'; c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#1a2a14'; c.textBaseline = 'middle';
    const mode = part.params.mode;
    const unit = mode === 'A' ? 'A' : mode === 'Ohm' ? 'Ω' : 'V';
    let text = out && out.text ? out.text : out && Number.isFinite(out.val) ? fmt(out.val, unit, 4) : out && out.val === Infinity ? 'OL' : '----';
    if (out && out.ok === false && !out.text) text = '----';
    c.font = 'bold 54px monospace'; c.textAlign = 'right';
    c.fillText(text, 246, 56);
    c.font = '22px monospace'; c.textAlign = 'left';
    c.fillText(mode === 'Vac' ? 'V~ AC' : mode === 'V' ? 'V DC' : mode === 'A' ? 'A DC' : 'OHM', 8, 108);
    s.tex.needsUpdate = true;
  };
  return g;
};
B.scope = (part) => {
  const g = new THREE.Group();
  const b = benchBody(g, 11, 4.4, 9, 2, 5.2, '#33363f');
  b.position.y = DESK_Y + 2.2;
  probeJack(g, 0, '#e6c230'); probeJack(g, 2, '#2ac4e6'); probeJack(g, 4, '#111');
  const s = makeScreen(7.4, 5.6, 400, 300);
  s.mesh.rotation.x = -Math.PI / 2; s.mesh.position.set(1.4, DESK_Y + 4.42, 5.4);
  g.add(s.mesh);
  let last = -1;
  g.userData.update = (out, input, t, engine) => {
    if (t - last < 0.07) return;
    last = t;
    const buf = engine ? engine.scopeData(part.id) : null;
    drawScope(s.ctx, 400, 300, buf, part.params, out || {});
    s.tex.needsUpdate = true;
  };
  return g;
};

B.arduino_uno = (part, def, pins) => {
  const g = new THREE.Group();
  g.add(box(25, 0.5, 19.5, mat('#00878f', { r: 0.5 }), 10, DESK_Y + 0.25, 8.5));
  g.add(box(4.4, 3.2, 5.6, METAL(), -0.6, DESK_Y + 1.6, 4));
  g.add(box(3.4, 1.8, 4.6, BLACK(), 1.2, DESK_Y + 1.1, 14));
  g.add(box(14, 0.7, 3.6, BLACK(), 14, DESK_Y + 0.85, 8.5));
  g.add(box(4.4, 0.4, 4.4, BLACK(), 8, DESK_Y + 0.7, 8.5));
  for (const p of pins) {
    g.add(box(0.9, 1.6, 0.9, mat('#111'), p.dx, DESK_Y + 0.8, p.dy));
    g.add(cyl(0.16, 0.16, 0.5, BRASS(), p.dx, BENCH_Y - 0.1, p.dy, 8));
    g.add(leg(V3(p.dx, DESK_Y + 1.5, p.dy), V3(p.dx, BENCH_Y - 0.1, p.dy), 0.14, mat('#111')));
  }
  const led = box(0.5, 0.2, 0.9, mat('#ffae00'), 9, DESK_Y + 0.6, 3);
  const lm = led.material.clone(); led.material = lm; g.add(led);
  const t = labelPlane('ARDUINO UNO', 6, 1.2, { tw: 384, th: 80, size: 40 });
  t.rotation.x = -Math.PI / 2; t.position.set(14, DESK_Y + 1.22, 8.5);
  g.add(t);
  g.userData.update = (out) => {
    const on = out && !out.burnt ? out.led || 0 : 0;
    lm.emissive = new THREE.Color('#ff9a00'); lm.emissiveIntensity = on * 2;
  };
  return g;
};

export function buildPartModel(part, def) {
  const fn = B[def.m3d];
  const pins = def.pins(part.params);
  const g = fn ? fn(part, def, pins) : new THREE.Group();
  g.userData.partId = part.id;
  return g;
}

// pin tip height used for wire attachment
export function pinHeight(def) {
  return def.bench ? BENCH_Y : 0.0;
}

// parked probe tip position (local space) for instruments
export function jackPosition(def, name) {
  const pin = def.pins({}).find((p) => p.n === name);
  return pin ? V3(pin.dx, BENCH_Y - 0.1, pin.dy) : V3();
}
