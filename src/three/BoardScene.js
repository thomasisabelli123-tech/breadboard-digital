// Imperative Three.js scene: lab bench, breadboard (with X-ray internal view), components, wires, probes, smoke.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BOARD_CENTER, BOARD_W, BOARD_H, getLayout, nearestHole, holeById,
} from '../engine/geometry.js';
import { PART_TYPES } from '../data/catalog.js';
import { pinWorld } from '../engine/netlist.js';
import { buildPartModel, DESK_Y, BENCH_Y, jackPosition, mat } from './parts3d.js';
import { buildBoardMesh, makeWireMesh, canvasTexture } from './boardMesh.js';

// board coordinates -> world (the active board centre is the world origin in x/z)
const X = (x) => x - BOARD_CENTER.x;
const Z = (y) => y - BOARD_CENTER.y;
const PROBE_COLORS = { red: '#d32f2f', black: '#1a1a1a', ch1: '#e6c230', ch2: '#2ac4e6', gnd: '#333333' };

// Electrostatic-discharge (ESD) workbench mat with a millimetre grid. 1 world unit = 2.54 mm.
function drawEsdMat(wUnits, hUnits) {
  const PX = 15; // pixels per unit
  const c = document.createElement('canvas');
  c.width = Math.round(wUnits * PX); c.height = Math.round(hUnits * PX);
  const g = c.getContext('2d');
  const mm = PX / 2.54;
  g.fillStyle = '#26312d'; g.fillRect(0, 0, c.width, c.height);
  // subtle mottled rubber texture
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.035})`;
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  }
  const wmm = c.width / mm, hmm = c.height / mm;
  g.lineWidth = 1;
  for (let i = 0; i <= wmm; i++) { g.strokeStyle = i % 10 === 0 ? 'rgba(180,235,210,0.34)' : i % 5 === 0 ? 'rgba(180,235,210,0.18)' : 'rgba(180,235,210,0.07)'; g.beginPath(); g.moveTo(i * mm, 0); g.lineTo(i * mm, c.height); g.stroke(); }
  for (let j = 0; j <= hmm; j++) { g.strokeStyle = j % 10 === 0 ? 'rgba(180,235,210,0.34)' : j % 5 === 0 ? 'rgba(180,235,210,0.18)' : 'rgba(180,235,210,0.07)'; g.beginPath(); g.moveTo(0, j * mm); g.lineTo(c.width, j * mm); g.stroke(); }
  g.fillStyle = 'rgba(200,245,225,0.55)'; g.font = '11px monospace'; g.textBaseline = 'top';
  for (let i = 0; i <= wmm; i += 50) g.fillText(`${i / 10} cm`, i * mm + 3, 3);
  for (let j = 50; j <= hmm; j += 50) g.fillText(`${j / 10}`, 3, j * mm + 3);
  g.fillStyle = 'rgba(200,245,225,0.5)'; g.font = 'bold 22px sans-serif'; g.textAlign = 'right'; g.textBaseline = 'bottom';
  g.fillText('ESD SAFE · ANTI-STATIC MAT', c.width - 20, c.height - 14);
  // stitched border
  g.strokeStyle = 'rgba(230,240,235,0.35)'; g.setLineDash([8, 6]); g.lineWidth = 2; g.strokeRect(10, 10, c.width - 20, c.height - 20); g.setLineDash([]);
  return canvasTexture(c);
}

function drawBenchTop() {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const g = c.getContext('2d');
  g.fillStyle = '#4a3a2c'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 260; i++) {
    const y = Math.random() * 1024;
    g.strokeStyle = `rgba(${20 + Math.random() * 40},${12 + Math.random() * 25},${6 + Math.random() * 14},${0.12 + Math.random() * 0.25})`;
    g.lineWidth = 1 + Math.random() * 2.2;
    g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= 1024; x += 64) g.lineTo(x, y + Math.sin(x * 0.013 + i) * (3 + Math.random() * 3));
    g.stroke();
  }
  const t = canvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 4);
  return t;
}

function softCircle() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class BoardScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0d1218');
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 700);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 240;
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    this.controls.screenSpacePanning = false;
    this.camAnim = null;
    this.setView('perspective', true);

    // image-based lighting: gives the metal legs / clips / probe needles real reflections
    try {
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      this.scene.environment = this.envTex;
      this.scene.environmentIntensity = 0.5;
      pm.dispose();
    } catch (e) { this.envTex = null; }

    this.hemi = new THREE.HemisphereLight('#dfe9ff', '#2a2f38', 0.55);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#fff4e0', 1.5);
    this.sun.position.set(-30, 60, 40);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.radius = 5;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 50; sc.bottom = -50; sc.near = 5; sc.far = 220;
    this.scene.add(this.sun, this.sun.target);
    this.fill = new THREE.DirectionalLight('#9bb8ff', 0.35);
    this.fill.position.set(40, 30, -30);
    this.scene.add(this.fill);
    this.lightLevel = 1;
    this.lightAngle = 0;

    // workbench: wooden bench top + anti-static mat with millimetre grid
    const benchTex = drawBenchTop();
    const bench = new THREE.Mesh(new THREE.PlaneGeometry(520, 380), new THREE.MeshStandardMaterial({ map: benchTex, roughness: 0.75, color: '#bba58f' }));
    bench.rotation.x = -Math.PI / 2;
    bench.position.y = DESK_Y - 0.25;
    bench.receiveShadow = true;
    this.scene.add(bench);
    const MAT_W = 150, MAT_H = 100;
    this.matTex = drawEsdMat(MAT_W, MAT_H);
    this.esdMat = new THREE.Mesh(new THREE.BoxGeometry(MAT_W, 0.22, MAT_H), [
      new THREE.MeshStandardMaterial({ color: '#1c2421', roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: '#1c2421', roughness: 0.9 }),
      new THREE.MeshStandardMaterial({ map: this.matTex, roughness: 0.82, metalness: 0.02 }), new THREE.MeshStandardMaterial({ color: '#111', roughness: 1 }),
      new THREE.MeshStandardMaterial({ color: '#1c2421', roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: '#1c2421', roughness: 0.9 }),
    ]);
    this.esdMat.position.set(0, DESK_Y - 0.11, 8);
    this.esdMat.receiveShadow = true;
    this.scene.add(this.esdMat);
    // ESD ground snap stud on the mat corner
    const stud = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.5, 20), mat('#c9ccd2', { m: 0.9, r: 0.3 }));
    stud.position.set(-MAT_W / 2 + 4, DESK_Y + 0.15, 8 - MAT_H / 2 + 4);
    stud.castShadow = true;
    this.scene.add(stud);

    this.partsRoot = new THREE.Group();
    this.wiresRoot = new THREE.Group();
    this.probesRoot = new THREE.Group();
    this.fxRoot = new THREE.Group();
    this.scene.add(this.partsRoot, this.wiresRoot, this.probesRoot, this.fxRoot);

    this.buildBoard();
    this.partGroups = new Map();
    this.wireMeshes = new Map();
    this.probeGroups = new Map();
    this.partsById = new Map();
    this.burnSeen = new Set();
    this.xray = false;
    this.xrayAmount = 0;
    this.lastStripUpdate = 0;
    this.selection = null;
    this.selBox = new THREE.Box3Helper(new THREE.Box3(), '#ffd54a');
    this.selBox.visible = false;
    this.scene.add(this.selBox);

    this.ghost = null;
    this.ghostType = null;
    this.hoverRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.62, 24), new THREE.MeshBasicMaterial({ color: '#ffd54a', side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthTest: false }));
    this.hoverRing.rotation.x = -Math.PI / 2;
    this.hoverRing.visible = false;
    this.hoverRing.renderOrder = 10;
    this.scene.add(this.hoverRing);
    // glowing discs on every hole connected to the hovered one (same metal strip)
    this.hlMat = new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending });
    this.hlMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.34, 16), this.hlMat, 64);
    this.hlMesh.rotation.x = -Math.PI / 2;
    this.hlMesh.count = 0;
    this.hlMesh.frustumCulled = false;
    this.hlMesh.renderOrder = 9;
    this.scene.add(this.hlMesh);
    this.hlKey = null;
    this.previewLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffffff' }));
    this.previewLine.visible = false;
    this.scene.add(this.previewLine);

    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.initSmoke();
    this.flashes = [];
    this.flashPool = [0, 1].map(() => { const l = new THREE.PointLight('#ff8a2a', 0, 22, 2); l.visible = true; this.scene.add(l); return { light: l, busy: false }; });
    this.failed = new Set(); // ids of parts/wires whose 3D model failed to build (logged once, skipped afterwards)
    this.dragProbe = null;
    this.clock = 0;
    this.setLighting(1, 0);
  }

  // ------------------------------------------------------------ lighting
  // level 0.3 … 2 (brightness), angle -90 … 90 (degrees, rotates the key light around the board)
  setLighting(level = 1, angle = 0) {
    this.lightLevel = level; this.lightAngle = angle;
    const a = THREE.MathUtils.degToRad(angle);
    this.sun.position.set(-30 * Math.cos(a) + 40 * Math.sin(a), 60, 40 * Math.cos(a) + 30 * Math.sin(a));
    this.sun.intensity = 1.5 * level;
    this.fill.intensity = 0.35 * level;
    this.hemi.intensity = 0.55 * level;
    this.scene.environmentIntensity = 0.5 * Math.min(1.6, level);
  }

  setShadows(on) {
    this.sun.castShadow = on;
    this.renderer.shadowMap.needsUpdate = true;
  }

  setReflections(on) { this.scene.environment = on ? this.envTex : null; }

  // ------------------------------------------------------------ board
  buildBoard() {
    const layout = getLayout();
    this.layout = layout;
    const b = buildBoardMesh(layout);
    this.board = b;
    this.boardGroup = b.group;
    this.cover = b.cover;
    this.coverMats = b.coverMats;
    this.coverEdges = b.coverEdges;
    this.stripMeshes = b.stripMeshes;
    this.clips = b.clips;
    this.scene.add(b.group);
  }

  // called when the user switches board model (geometry.setBoardType has already been applied)
  rebuildBoard() {
    if (this.boardGroup) { this.scene.remove(this.boardGroup); this.board.dispose(); }
    for (const rec of this.partGroups.values()) { this.partsRoot.remove(rec.group); this.disposeGroup(rec.group); }
    for (const rec of this.wireMeshes.values()) { this.wiresRoot.remove(rec.group); rec.group.traverse((o) => o.geometry && o.geometry.dispose()); }
    for (const rec of this.probeGroups.values()) this.probesRoot.remove(rec.group);
    this.partGroups.clear(); this.wireMeshes.clear(); this.probeGroups.clear();
    this.smokeEmitters.clear(); this.burnSeen.clear(); this.failed.clear();
    for (const f of this.flashPool) { f.busy = false; f.light.intensity = 0; }
    this.flashes.length = 0;
    this.pAlpha.fill(0); for (const q of this.parts) q.age = q.life;
    this.clearGhost(); this.dragProbe = null; this.hlKey = undefined;
    this.selBox.visible = false;
    this.clearHighlight();
    this.buildBoard();
    this.esdMat.position.z = Z(BOARD_CENTER.y + 8) + 0;
    this.setView('perspective', true);
  }

  setXray(on) { this.xray = on; }

  updateCover(dt) {
    const target = this.xray ? 1 : 0;
    this.xrayAmount += (target - this.xrayAmount) * Math.min(1, dt * 6);
    if (Math.abs(this.xrayAmount - target) < 0.002) this.xrayAmount = target;
    const op = 1 - 0.9 * this.xrayAmount;
    for (const m of this.coverMats) { m.opacity = op; m.depthWrite = op > 0.98; m.needsUpdate = false; }
    this.coverEdges.material.opacity = 0.7 * this.xrayAmount;
    this.cover.visible = op > 0.011;
  }

  updateStripColors(engine) {
    if (!this.xray && this.xrayAmount < 0.01) return;
    for (const s of this.layout.strips) {
      const m = this.stripMeshes.get(s.key);
      if (!m) continue;
      const v = engine.keyVoltage(s.key);
      const c = m.material.color, e = m.material.emissive;
      c.set('#b9bec7');
      e.set('#000000');
      if (Math.abs(v) > 0.02) {
        const k = Math.min(1, Math.abs(v) / 12);
        const tint = new THREE.Color(v > 0 ? '#ff5a2a' : '#2a8bff');
        c.lerp(tint, 0.35 + 0.65 * k);
        e.copy(tint).multiplyScalar(0.15 + 0.55 * k);
      }
    }
  }

  // highlight every hole of one metal strip (the holes that are electrically connected to the hovered one)
  setStripHighlight(key) {
    if (key === this.hlKey) return;
    this.hlKey = key;
    const s = key && this.layout.stripByKey.get(key);
    if (!s) { this.hlMesh.count = 0; return; }
    const m4 = new THREE.Matrix4();
    const n = Math.min(64, s.holes.length);
    // mesh is rotated -90° about X, so local y = -world z
    for (let i = 0; i < n; i++) { m4.makeTranslation(X(s.holes[i].x), -Z(s.holes[i].y), 0.045); this.hlMesh.setMatrixAt(i, m4); }
    this.hlMesh.instanceMatrix.needsUpdate = true;
    this.hlMesh.count = n;
  }
  clearHighlight() { this.setStripHighlight(null); }

  // ------------------------------------------------------------ view control
  setView(name, instant = false) {
    const f = Math.max(0.5, Math.max(BOARD_W, BOARD_H * 1.8) / 64);
    const t = new THREE.Vector3(0, 0, 3 * f);
    let pos;
    if (name === 'top') pos = new THREE.Vector3(0, 78 * f, 3.01 * f);
    else if (name === 'front') pos = new THREE.Vector3(0, 9 * f, 62 * f);
    else if (name === 'side') pos = new THREE.Vector3(70 * f, 14 * f, 3 * f);
    else pos = new THREE.Vector3(0, 40 * f, 46 * f);
    this.animateTo(pos, t, instant);
  }

  animateTo(pos, target, instant) {
    if (instant) {
      this.camera.position.copy(pos);
      this.controls.target.copy(target);
      this.controls.update();
      this.camAnim = null;
      return;
    }
    this.camAnim = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1: pos, t1: target, k: 0 };
  }

  rotateBy(deg) {
    const off = this.camera.position.clone().sub(this.controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(deg));
    this.animateTo(this.controls.target.clone().add(off), this.controls.target.clone(), false);
  }

  setTilt(deg) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const r = off.length();
    const az = Math.atan2(off.x, off.z);
    const pol = THREE.MathUtils.clamp(THREE.MathUtils.degToRad(deg), 0.02, Math.PI * 0.495);
    const np = new THREE.Vector3(r * Math.sin(pol) * Math.sin(az), r * Math.cos(pol), r * Math.sin(pol) * Math.cos(az));
    this.animateTo(this.controls.target.clone().add(np), this.controls.target.clone(), false);
  }

  tiltDeg() {
    const off = this.camera.position.clone().sub(this.controls.target);
    return THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(off.y / off.length(), -1, 1)));
  }

  zoomBy(f) {
    const off = this.camera.position.clone().sub(this.controls.target).multiplyScalar(f);
    const len = THREE.MathUtils.clamp(off.length(), this.controls.minDistance, this.controls.maxDistance);
    off.setLength(len);
    this.animateTo(this.controls.target.clone().add(off), this.controls.target.clone(), false);
  }

  setAutoRotate(on) {
    this.controls.autoRotate = on;
    this.controls.autoRotateSpeed = 1.6;
  }

  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ world helpers
  epWorld(ep) {
    if (!ep) return null;
    if (ep.h) {
      const h = holeById.get(ep.h);
      return h ? new THREE.Vector3(X(h.x), 0.02, Z(h.y)) : null;
    }
    const part = this.partsById.get(ep.p);
    if (!part) return null;
    const def = PART_TYPES[part.type];
    const pin = def.pins(part.params).find((q) => q.n === ep.n);
    if (!pin) return null;
    const w = pinWorld(part, pin);
    if (!Number.isFinite(w.x) || !Number.isFinite(w.y)) return null;
    return new THREE.Vector3(X(w.x), def.bench ? BENCH_Y + 0.35 : 0.9, Z(w.y));
  }

  jackWorld(part, name) {
    const def = PART_TYPES[part.type];
    const l = jackPosition(def, name);
    const pin = def.pins(part.params).find((q) => q.n === name);
    const w = pinWorld(part, pin);
    return new THREE.Vector3(X(w.x), l.y, Z(w.y));
  }

  // ------------------------------------------------------------ parts / wires / probes sync
  sync(parts, wires, burnt, selection) {
    this.partsById = new Map(parts.map((p) => [p.id, p]));
    this.selection = selection;
    // parts
    const seen = new Set();
    for (const part of parts) {
      const def = PART_TYPES[part.type];
      if (!def || !def.m3d || !Number.isFinite(part.x) || !Number.isFinite(part.y)) continue;
      seen.add(part.id);
      const isBurnt = burnt && burnt[part.id];
      // live-display parts (power sources) repaint their LCD from the current params every frame, so their params stay out of the signature
      const psig = def.live3d ? String(part.params.kind || '') : JSON.stringify(part.params);
      const sig = `${part.type}|${part.x}|${part.y}|${part.rot || 0}|${psig}|${isBurnt ? 1 : 0}`;
      let rec = this.partGroups.get(part.id);
      if (rec && rec.sig === sig) { rec.part = part; continue; }
      if (rec) { this.partsRoot.remove(rec.group); this.disposeGroup(rec.group); this.partGroups.delete(part.id); }
      const group = new THREE.Group();
      let model;
      try { model = buildPartModel(part, def); } catch (e) {
        if (!this.failed.has(part.id)) { this.failed.add(part.id); console.error('[3D] model build failed for', part.type, e); }
        continue;
      }
      group.add(model);
      group.position.set(X(part.x), 0, Z(part.y));
      group.rotation.y = -(part.rot || 0) * Math.PI / 2;
      group.userData.partId = part.id;
      model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      if (isBurnt) this.charModel(model);
      this.partsRoot.add(group);
      rec = { group, model, sig, part, update: model.userData.update || null };
      this.partGroups.set(part.id, rec);
    }
    for (const [id, rec] of this.partGroups) {
      if (!seen.has(id)) { this.partsRoot.remove(rec.group); this.disposeGroup(rec.group); this.partGroups.delete(id); this.smokeEmitters.delete(id); }
    }
    // burn events
    for (const id of Object.keys(burnt || {})) {
      if (!this.burnSeen.has(id)) {
        this.burnSeen.add(id);
        const rec = this.partGroups.get(id);
        if (rec) { try { this.startBurn(id, rec, burnt[id]); } catch (e) { console.error('[3D] burn effect failed', e); } }
      }
    }
    for (const id of [...this.burnSeen]) {
      if (!burnt || !burnt[id]) { this.burnSeen.delete(id); this.smokeEmitters.delete(id); }
    }
    this.syncWires(wires);
    this.syncProbes(parts);
    this.updateSelection();
  }

  // free GPU memory of a removed part model (geometries and per-part canvas textures; shared materials are kept)
  disposeGroup(group) {
    group.traverse((o) => {
      if (o.isSprite) return;
      if (o.geometry) o.geometry.dispose();
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) if (m.map) m.map.dispose();
    });
  }

  charModel(model) {
    const char = mat('#1a1411', { r: 0.95 });
    model.traverse((o) => {
      if (o.isMesh) o.material = char;
      if (o.isSprite) o.visible = false;
    });
    model.userData.update = null;
  }

  syncWires(wires) {
    const seen = new Set();
    for (const w of wires) {
      const a = this.epWorld(w.a), b = this.epWorld(w.b);
      if (!a || !b) continue;
      seen.add(w.id);
      const sig = `${a.x},${a.y},${a.z}|${b.x},${b.y},${b.z}|${w.color}`;
      const rec = this.wireMeshes.get(w.id);
      if (rec && rec.sig === sig) continue;
      if (rec) { this.wiresRoot.remove(rec.group); rec.group.traverse((o) => o.geometry && o.geometry.dispose()); }
      let group;
      try { group = this.makeWire(a, b, w.color || '#e53935'); } catch (e) {
        if (!this.failed.has(w.id)) { this.failed.add(w.id); console.error('[3D] wire build failed', e); }
        continue;
      }
      group.userData.wireId = w.id;
      this.wiresRoot.add(group);
      this.wireMeshes.set(w.id, { group, sig });
    }
    for (const [id, rec] of this.wireMeshes) {
      if (!seen.has(id)) { this.wiresRoot.remove(rec.group); rec.group.traverse((o) => o.geometry && o.geometry.dispose()); this.wireMeshes.delete(id); }
    }
  }

  makeWire(a, b, color) { return makeWireMesh(a, b, color, mat); }

  tipPosition(part, name, ep) {
    if (ep) {
      const p = this.epWorld(ep);
      if (p) return p.clone();
    }
    const j = this.jackWorld(part, name);
    const idx = PART_TYPES[part.type].probes.indexOf(name);
    return new THREE.Vector3(j.x + (idx - 1) * 0.6, DESK_Y + 0.3, j.z - 2.6);
  }

  syncProbes(parts) {
    const seen = new Set();
    for (const part of parts) {
      const def = PART_TYPES[part.type];
      if (!def || !def.probes) continue;
      for (const name of def.probes) {
        const key = `${part.id}:${name}`;
        seen.add(key);
        const ep = part.probes && part.probes[name];
        const tip = (this.dragProbe && this.dragProbe.key === key) ? this.dragProbe.point.clone() : this.tipPosition(part, name, ep);
        const jack = this.jackWorld(part, name);
        const sig = `${tip.x.toFixed(2)},${tip.y.toFixed(2)},${tip.z.toFixed(2)}|${jack.x},${jack.z}`;
        let rec = this.probeGroups.get(key);
        if (rec && rec.sig === sig) continue;
        if (rec) { this.probesRoot.remove(rec.group); rec.group.traverse((o) => o.geometry && o.geometry.dispose()); }
        const group = new THREE.Group();
        const col = PROBE_COLORS[name] || '#888';
        const cm = mat(col, { r: 0.5 });
        const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 2.2, 12), cm);
        handle.position.set(tip.x, tip.y + 1.5, tip.z - 0.0);
        handle.userData.probeHit = true;
        const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, 0.9, 8), mat('#d8dbe0', { m: 0.9, r: 0.25 }));
        needle.position.set(tip.x, tip.y + 0.25, tip.z);
        needle.userData.probeHit = true;
        group.add(handle, needle);
        // cable from the instrument jack to the probe handle with some sag
        const top = new THREE.Vector3(tip.x, tip.y + 2.6, tip.z);
        const midp = jack.clone().add(top).multiplyScalar(0.5);
        midp.y = Math.max(jack.y, top.y) + 2.2;
        const curve = new THREE.CatmullRomCurve3([jack.clone(), midp, top]);
        group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.08, 6, false), cm));
        group.userData.probe = { partId: part.id, name };
        this.probesRoot.add(group);
        this.probeGroups.set(key, { group, sig });
      }
    }
    for (const [k, rec] of this.probeGroups) {
      if (!seen.has(k)) { this.probesRoot.remove(rec.group); this.probeGroups.delete(k); }
    }
  }

  setProbeDrag(key, point) {
    this.dragProbe = key ? { key, point } : null;
    if (key) {
      const rec = this.probeGroups.get(key);
      if (rec) rec.sig = ''; // force rebuild
    }
  }

  updateSelection() {
    const sel = this.selection;
    this.selBox.visible = false;
    if (!sel) return;
    let obj = null;
    if (sel.kind === 'part') obj = this.partGroups.get(sel.id)?.group;
    else if (sel.kind === 'wire') obj = this.wireMeshes.get(sel.id)?.group;
    if (!obj) return;
    const box = new THREE.Box3().setFromObject(obj);
    if (box.isEmpty()) return;
    box.expandByScalar(0.25);
    this.selBox.box.copy(box);
    this.selBox.visible = true;
  }

  // visually move a part while dragging (committed to the store on release)
  dragPartTo(id, x, y, valid = true) {
    const rec = this.partGroups.get(id);
    if (!rec) return;
    rec.group.position.set(X(x), 0, Z(y));
    this.dragMarked = id;
    const box = new THREE.Box3().setFromObject(rec.group);
    box.expandByScalar(0.25);
    this.selBox.box.copy(box);
    this.selBox.material.color.set(valid ? '#ffd54a' : '#ff4444');
    this.selBox.visible = true;
  }

  // ------------------------------------------------------------ ghost / hover / preview
  setGhost(type, x, y, rot, valid) {
    const def = PART_TYPES[type];
    if (!def || !def.m3d) { this.clearGhost(); return; }
    if (this.ghostType !== type || this.ghostRot !== rot) {
      this.clearGhost();
      const part = { id: 'ghost', type, x: 0, y: 0, rot: 0, params: JSON.parse(JSON.stringify(def.params)) };
      const model = buildPartModel(part, def);
      model.traverse((o) => {
        if (o.isMesh) {
          const fade = (m) => { const c = m.clone(); c.transparent = true; c.opacity = 0.55; c.depthWrite = false; return c; };
          o.material = Array.isArray(o.material) ? o.material.map(fade) : fade(o.material);
        }
        if (o.isSprite) o.visible = false;
      });
      model.userData.update = null;
      const g = new THREE.Group();
      g.add(model);
      this.scene.add(g);
      this.ghost = g;
      this.ghostType = type;
      this.ghostRot = rot;
    }
    this.ghost.position.set(X(x), 0, Z(y));
    this.ghost.rotation.y = -(rot || 0) * Math.PI / 2;
    this.ghost.traverse((o) => {
      if (o.isMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m && m.emissive) m.emissive.set(valid ? '#000000' : '#aa1111');
    });
  }

  clearGhost() {
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.traverse((o) => {
        if (!o.isMesh) return;
        if (o.geometry) o.geometry.dispose();
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m) { if (m.map) m.map.dispose(); m.dispose(); }
      });
    }
    this.ghost = null;
    this.ghostType = null;
  }

  setHover(pos3) {
    if (!pos3) { this.hoverRing.visible = false; return; }
    this.hoverRing.position.set(pos3.x, pos3.y + 0.05, pos3.z);
    this.hoverRing.visible = true;
  }

  setWirePreview(a, to, color) {
    if (!a || !to) { this.previewLine.visible = false; return; }
    const len = a.distanceTo(to);
    const mid = a.clone().add(to).multiplyScalar(0.5);
    mid.y += Math.min(9, 1.2 + len * 0.28);
    const pts = new THREE.QuadraticBezierCurve3(a, mid, to).getPoints(24);
    this.previewLine.geometry.dispose();
    this.previewLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.previewLine.material.color.set(color || '#ffffff');
    this.previewLine.visible = true;
  }

  // ------------------------------------------------------------ picking
  rayFrom(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray;
  }

  boardPoint(clientX, clientY) {
    const ray = this.rayFrom(clientX, clientY);
    const p = new THREE.Vector3();
    return ray.intersectPlane(this.plane, p) ? p : null;
  }

  pick(clientX, clientY) {
    const ray = this.rayFrom(clientX, clientY);
    const res = { probe: null, part: null, partObj: null, wire: null, hole: null, pin: null, point: null };
    // probes first
    const ph = this.raycaster.intersectObjects(this.probesRoot.children, true).find((h) => h.object.userData.probeHit);
    if (ph) {
      let o = ph.object;
      while (o && !o.userData.probe) o = o.parent;
      if (o) res.probe = o.userData.probe;
    }
    const hits = this.raycaster.intersectObjects([...this.partsRoot.children, ...this.wiresRoot.children], true);
    if (hits.length) {
      const h = hits[0];
      let o = h.object;
      res.partObj = h.object;
      while (o && o.userData.partId === undefined && o.userData.wireId === undefined) o = o.parent;
      if (o) {
        if (o.userData.partId !== undefined) res.part = o.userData.partId;
        else res.wire = o.userData.wireId;
      }
    }
    const p = new THREE.Vector3();
    if (ray.intersectPlane(this.plane, p)) {
      res.point = p;
      res.hole = nearestHole(p.x + BOARD_CENTER.x, p.z + BOARD_CENTER.y, 0.62);
    }
    // bench terminals (3D point-to-ray distance)
    let best = 0.8;
    for (const part of this.partsById.values()) {
      const def = PART_TYPES[part.type];
      if (!def || !def.bench) continue;
      const pins = def.probes ? [] : def.pins(part.params);
      for (const pin of pins) {
        const w = pinWorld(part, pin);
        const d = ray.distanceToPoint(new THREE.Vector3(X(w.x), BENCH_Y + 0.2, Z(w.y)));
        if (d < best) { best = d; res.pin = { p: part.id, n: pin.n }; }
      }
    }
    return res;
  }

  // ------------------------------------------------------------ smoke / fire
  initSmoke() {
    this.maxP = 700;
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(this.maxP * 3);
    this.pAlpha = new Float32Array(this.maxP);
    this.pSize = new Float32Array(this.maxP);
    this.pCol = new Float32Array(this.maxP * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.pAlpha, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.pSize, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.pCol, 3));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `attribute float aAlpha; attribute float aSize; attribute vec3 aColor; varying float vA; varying vec3 vC;
        void main(){ vA=aAlpha; vC=aColor; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=aSize*(260.0/-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d)*2.0; float a=smoothstep(1.0,0.0,r)*vA; if(a<0.003) discard; gl_FragColor=vec4(vC,a); }`,
    });
    this.smokePoints = new THREE.Points(g, m);
    this.smokePoints.frustumCulled = false;
    this.fxRoot.add(this.smokePoints);
    this.parts = [];
    for (let i = 0; i < this.maxP; i++) this.parts.push({ life: 0, age: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 1, spark: false });
    this.smokeEmitters = new Map();
    this.pCursor = 0;
  }

  startBurn(id, rec, info) {
    const box = new THREE.Box3().setFromObject(rec.group);
    const c = box.getCenter(new THREE.Vector3());
    const top = Math.max(box.max.y, 1);
    this.smokeEmitters.set(id, { pos: new THREE.Vector3(c.x, top, c.z), t0: this.clock, smoke: !info || info.smoke !== false });
    if (!info || info.smoke !== false) {
      const slot = this.flashPool.find((f) => !f.busy);
      if (slot && Number.isFinite(c.x + c.z + top)) {
        slot.busy = true;
        slot.light.position.set(c.x, top + 1, c.z);
        slot.light.intensity = 60;
        this.flashes.push({ slot, light: slot.light, t0: this.clock });
      }
    }
  }

  spawn(e, spark) {
    const p = this.parts[this.pCursor++ % this.maxP];
    p.age = 0;
    p.spark = spark;
    p.life = spark ? 0.35 + Math.random() * 0.4 : 2.2 + Math.random() * 1.8;
    p.x = e.pos.x + (Math.random() - 0.5) * 0.6; p.y = e.pos.y; p.z = e.pos.z + (Math.random() - 0.5) * 0.6;
    if (spark) { p.vx = (Math.random() - 0.5) * 9; p.vy = 3 + Math.random() * 7; p.vz = (Math.random() - 0.5) * 9; p.size = 0.35 + Math.random() * 0.3; }
    else { p.vx = (Math.random() - 0.5) * 0.9; p.vy = 1.6 + Math.random() * 1.4; p.vz = (Math.random() - 0.5) * 0.9; p.size = 1.0 + Math.random() * 0.8; }
  }

  updateSmoke(dt) {
    for (const e of this.smokeEmitters.values()) {
      if (!e.smoke) continue;
      const age = this.clock - e.t0;
      e.acc = (e.acc || 0) + dt * (age < 4 ? 38 : 16);
      while (e.acc > 1) { e.acc -= 1; this.spawn(e, false); }
      if (age < 0.5) { e.sacc = (e.sacc || 0) + dt * 70; while (e.sacc > 1) { e.sacc -= 1; this.spawn(e, true); } }
    }
    for (let i = 0; i < this.maxP; i++) {
      const p = this.parts[i];
      if (p.age < p.life) {
        p.age += dt;
        if (p.spark) p.vy -= 18 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const k = p.age / p.life;
        this.pPos[i * 3] = p.x; this.pPos[i * 3 + 1] = p.y; this.pPos[i * 3 + 2] = p.z;
        if (p.spark) {
          this.pAlpha[i] = 1 - k; this.pSize[i] = p.size;
          this.pCol[i * 3] = 1; this.pCol[i * 3 + 1] = 0.55 + 0.3 * (1 - k); this.pCol[i * 3 + 2] = 0.1;
        } else {
          this.pAlpha[i] = 0.5 * Math.sin(Math.PI * Math.min(1, k * 1.15)) * (1 - k * 0.4);
          this.pSize[i] = p.size * (1 + k * 3.2);
          const g = 0.28 + 0.2 * k;
          this.pCol[i * 3] = g; this.pCol[i * 3 + 1] = g; this.pCol[i * 3 + 2] = g + 0.02;
        }
      } else this.pAlpha[i] = 0;
    }
    const geo = this.smokePoints.geometry;
    for (const a of ['position', 'aAlpha', 'aSize', 'aColor']) geo.attributes[a].needsUpdate = true;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      const k = (this.clock - f.t0) / 0.7;
      if (k >= 1) { f.light.intensity = 0; f.slot.busy = false; this.flashes.splice(i, 1); } else f.light.intensity = 60 * (1 - k) * (1 - k);
    }
  }

  // ------------------------------------------------------------ frame
  frame(engine, dt, inputs) {
    if (!Number.isFinite(dt) || dt < 0) dt = 0.016;
    this.clock += dt;
    if (this.camAnim) {
      const a = this.camAnim;
      a.k = Math.min(1, a.k + dt / 0.55);
      const e = a.k < 0.5 ? 2 * a.k * a.k : 1 - Math.pow(-2 * a.k + 2, 2) / 2;
      this.camera.position.lerpVectors(a.p0, a.p1, e);
      this.controls.target.lerpVectors(a.t0, a.t1, e);
      if (a.k >= 1) this.camAnim = null;
    }
    this.controls.update();
    this.updateCover(dt);
    if (this.xray) {
      this.lastStripUpdate += dt;
      if (this.lastStripUpdate > 0.08) { this.lastStripUpdate = 0; try { this.updateStripColors(engine); } catch (e) { console.error('[3D] x-ray colours failed', e); } }
    }
    for (const [id, rec] of this.partGroups) {
      if (!rec.update) continue;
      try { rec.update(engine.out.get(id), engine.inputs.get(id), this.clock, engine, rec.part); } catch (e) {
        rec.update = null; // a broken live animation is switched off for that part only
        console.error('[3D] live update disabled for part', id, e);
      }
    }
    if (this.hlMesh.count) this.hlMat.opacity = 0.5 + 0.28 * Math.sin(this.clock * 6);
    try { this.updateSmoke(dt); } catch (e) { console.error('[3D] smoke update failed', e); }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.board) this.board.dispose();
    this.renderer.dispose();
    this.controls.dispose();
  }
}
