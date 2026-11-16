// Home-page showcase: a carousel of the four breadboard models, each slowly turning 360° with a working circuit
// mounted on it (resistors, ICs, jumper wires and pulsing LEDs). Purely visual: it has its own renderer and does not
// touch the simulation engine or the editor's shared geometry.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BOARD_TYPES, makeLayout } from '../engine/geometry.js';
import { PART_TYPES } from '../data/catalog.js';
import { buildPartModel, mat } from './parts3d.js';
import { buildBoardMesh, makeWireMesh } from './boardMesh.js';

const SPACING = 84;
const LED_COLORS = ['#ff2a2a', '#37e05a', '#ffd32a', '#3a8dff', '#ff7a1a'];

function floorGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 20, 128, 128, 126);
  r.addColorStop(0, 'rgba(45,212,191,0.55)'); r.addColorStop(0.6, 'rgba(45,212,191,0.12)'); r.addColorStop(1, 'rgba(45,212,191,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Builds the mounted circuit of one board. Returns { group, leds } (leds: pulsing LED models).
function buildCircuit(layout) {
  const group = new THREE.Group();
  const leds = [];
  const by = layout.bodyY;
  const X = (x) => x - layout.center.x;
  const Z = (y) => y - layout.center.y;
  const hole = (id) => layout.holeById.get(id);
  const pt = (h) => new THREE.Vector3(X(h.x), 0, Z(h.y));
  const posRail = layout.rails.findIndex((r) => r.pol === '+');
  const negRail = layout.rails.findIndex((r) => r.pol === '-');
  const lastPos = layout.rails.length - 1 - [...layout.rails].reverse().findIndex((r) => r.pol === '+');
  const lastNeg = layout.rails.length - 1 - [...layout.rails].reverse().findIndex((r) => r.pol === '-');
  const nRail = layout.spec.railHoles;
  const railHole = (r, k) => hole(`R${r}:${Math.max(1, Math.min(nRail, k))}`);

  const put = (type, x, y, over = {}, rot = 0) => {
    const def = PART_TYPES[type];
    const part = { id: `s${group.children.length}`, type, x, y, rot, params: { ...JSON.parse(JSON.stringify(def.params)), ...over } };
    const model = buildPartModel(part, def);
    const g = new THREE.Group();
    g.add(model);
    g.position.set(X(x), 0, Z(y));
    g.rotation.y = -rot * Math.PI / 2;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    group.add(g);
    return model;
  };
  const led = (x, y, ci, period, phase) => {
    const color = LED_COLORS[ci % LED_COLORS.length];
    const m = put('led', x, y, { color, colorId: String(ci) });
    leds.push({ model: m, period, phase });
  };
  const wire = (a, b, color) => { if (a && b) group.add(makeWireMesh(pt(a), pt(b), color, mat)); };
  const top = (col, i) => hole(`${col}${'jihgf'[i]}`);
  const bot = (col, i) => hole(`${col}${'edcba'[i]}`);

  const chain = (c0, ci, period, phase, pr, nr, ry = 1) => {
    // + rail → R (330 Ω) → LED → − rail
    put('resistor', c0, by + ry, { R: 330, span: 4 });
    led(c0 + 4, by + ry + 1, ci, period, phase);
    wire(railHole(pr, c0 + 2), top(c0, ry), '#e53935');
    wire(top(c0 + 5, ry + 1), railHole(nr, c0 + 6), '#212121');
  };

  if (layout.id === 'mini') {
    put('resistor', 3, by + 1, { R: 470, span: 4 });
    led(7, by + 2, 0, 1.6, 0);
    put('pushbutton', 11, layout.straddleY, {});
    wire(top(3, 3), bot(3, 2), '#fbc02d');
    wire(top(8, 3), bot(12, 3), '#43a047');
    put('resistor', 3, by + 7 + 1, { R: 1000, span: 4 });
    led(7, by + 7 + 2, 3, 2.3, 1.2);
    return { group, leds };
  }

  // standard rails (full / half) or the 3.3 V / 5 V rails of the multi-bus lab board
  const p0 = posRail, n0 = negRail;
  chain(4, 0, 1.7, 0, p0, n0);
  chain(14, 1, 1.7, 0.85, p0, n0);
  if (layout.cols >= 40) chain(24, 2, 2.4, 0.4, p0, n0);

  // NE555 astable with a blinking LED on the lower half
  const cx = layout.cols >= 40 ? 36 : 22;
  put('ne555', cx, layout.straddleY, {});
  put('resistor', cx - 4, by + 7 + 1, { R: 10000, span: 3 });
  put('cap_elec', cx - 2, by + 7 + 4, { C: 10e-6 }, 0);
  led(cx + 5, by + 7 + 1, 3, 0.9, 0);
  wire(railHole(lastPos, cx + 1), top(cx, 2), '#e53935');
  wire(railHole(lastNeg, cx + 3), bot(cx + 3, 4), '#212121');
  wire(top(cx + 4, 0), bot(cx + 4, 0), '#fbc02d');
  wire(bot(cx + 6, 1), railHole(lastNeg, cx + 8), '#212121');
  if (layout.cols >= 40) {
    put('resistor', 48, by + 7 + 1, { R: 220, span: 4 });
    led(52, by + 7 + 2, 4, 1.3, 0.3);
    wire(railHole(lastPos, 50), bot(48, 1), '#e53935');
    wire(bot(53, 2), railHole(lastNeg, 55), '#212121');
  }
  if (layout.id === 'multi') {
    // a 5 V pair feeding a second LED chain, to show the independent bus
    chain(44, 3, 1.1, 0.2, 2, 3, 1);
  }
  return { group, leds };
}

export class ShowcaseScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#0a1118', 0.0042);
    this.camera = new THREE.PerspectiveCamera(34, 1, 1, 900);
    this.camera.position.set(0, 58, 104);
    this.camera.lookAt(0, -2, 0);

    try {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environmentIntensity = 0.55;
      pm.dispose();
    } catch (e) { /* reflections are optional */ }
    this.scene.add(new THREE.HemisphereLight('#dfe9ff', '#1a222c', 0.5));
    const sun = new THREE.DirectionalLight('#fff1dc', 1.6);
    sun.position.set(-40, 80, 50);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 6;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.05;
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 55, bottom: -55, near: 10, far: 260 });
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#2dd4bf', 0.7);
    rim.position.set(50, 25, -60);
    this.scene.add(rim);

    // floor: shadow catcher + tech grid
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.ShadowMaterial({ opacity: 0.4 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.3;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(900, 90, '#1e5c57', '#13323a');
    grid.position.y = -1.32;
    grid.material.transparent = true;
    grid.material.opacity = 0.55;
    this.scene.add(grid);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), new THREE.MeshBasicMaterial({ map: floorGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = -1.28;
    this.scene.add(this.glow);

    this.rail = new THREE.Group();
    this.scene.add(this.rail);
    this.boards = BOARD_TYPES.map((spec, i) => {
      const layout = makeLayout(spec.id);
      const b = buildBoardMesh(layout);
      const circuit = buildCircuit(layout);
      const turn = new THREE.Group(); // spins about the vertical axis
      turn.add(b.group, circuit.group);
      const holder = new THREE.Group(); // positions + scales
      holder.add(turn);
      holder.position.x = i * SPACING;
      this.rail.add(holder);
      const fit = Math.min(2.0, 60 / Math.max(layout.w, layout.h * 1.5));
      turn.rotation.y = i * 0.9;
      return { spec, layout, board: b, turn, holder, leds: circuit.leds, fit, spin: 0.28, vel: 0 };
    });
    this.index = 0;
    this.railTarget = 0;
    this.clock = 0;
    this.interactAt = -10;
    this.drag = null;
    this.onInteract = null;
    this.running = false;
    this.lastW = 0; this.lastH = 0;
    this.handlers = {};
    this.bindPointer();
    this.resize();
  }

  get count() { return this.boards.length; }

  setIndex(i) {
    const n = this.boards.length;
    this.index = ((i % n) + n) % n;
    this.railTarget = -this.index * SPACING;
  }

  bindPointer() {
    const c = this.canvas;
    const down = (e) => { this.drag = { x: e.clientX }; c.setPointerCapture && c.setPointerCapture(e.pointerId); this.touch(); };
    const move = (e) => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x;
      this.drag.x = e.clientX;
      const b = this.boards[this.index];
      b.turn.rotation.y += dx * 0.012;
      b.vel = dx * 0.012 * 60;
      this.touch();
    };
    const up = () => { this.drag = null; };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    this.handlers = { down, move, up };
  }

  touch() { this.interactAt = this.clock; if (this.onInteract) this.onInteract(); }

  resize() {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h || (w === this.lastW && h === this.lastH)) return;
    this.lastW = w; this.lastH = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // keep the whole board in view on narrow windows
    this.camera.position.set(0, 58, 104 * Math.max(1, 1.5 / Math.max(0.5, this.camera.aspect)));
    this.camera.lookAt(0, -2, 0);
    this.camera.updateProjectionMatrix();
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  frame(dt) {
    this.clock += dt;
    this.resize();
    const k = 1 - Math.exp(-dt * 4.5);
    this.rail.position.x += (this.railTarget - this.rail.position.x) * k;
    const idle = this.clock - this.interactAt > 2.5;
    this.boards.forEach((b, i) => {
      const active = i === this.index;
      const s = b.fit * (active ? 1 : 0.7);
      b.holder.scale.setScalar(b.holder.scale.x + (s - b.holder.scale.x) * k);
      if (!this.drag || !active) {
        b.vel *= Math.exp(-dt * 2.2);
        const auto = idle || !active ? b.spin : 0;
        b.turn.rotation.y += (auto + b.vel) * dt;
      }
      b.turn.position.y = active ? 0.5 * Math.sin(this.clock * 1.2) : 0;
      for (const L of b.leds) {
        const ph = (this.clock / L.period + L.phase) % 1;
        const pulse = 0.5 + 0.5 * Math.sin(ph * Math.PI * 2 - Math.PI / 2);
        const on = Math.pow(pulse, 1.6);
        L.model.userData.update({ b: 0.08 + 1.05 * on });
      }
    });
    const a = this.boards[this.index];
    this.glow.scale.setScalar(a.fit * 0.95);
    this.glow.material.opacity = 0.75 + 0.2 * Math.sin(this.clock * 2);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    if (this.handlers.down) {
      c.removeEventListener('pointerdown', this.handlers.down);
      c.removeEventListener('pointermove', this.handlers.move);
      c.removeEventListener('pointerup', this.handlers.up);
      c.removeEventListener('pointercancel', this.handlers.up);
    }
    for (const b of this.boards) b.board.dispose();
    this.scene.traverse((o) => {
      if (o.isSprite) return;
      if (o.geometry) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) if (m.map) m.map.dispose();
    });
    this.renderer.dispose();
  }
}
