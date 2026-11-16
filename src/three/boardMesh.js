// Builds the 3D model of a breadboard from a geometry layout (see engine/geometry.js).
// Used by the editor scene (BoardScene) and by the home-page showcase.
import * as THREE from 'three';
import { ROWS_TOP, ROWS_BOT, BOT_OFFSET } from '../engine/geometry.js';

export function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function drawBoardTop(layout) {
  const S = 32;
  const { board, spec, holes, cols, bodyY: by } = layout;
  const W = layout.w, H = layout.h;
  const c = document.createElement('canvas');
  c.width = Math.round(W * S); c.height = Math.round(H * S);
  const g = c.getContext('2d');
  const px = (x) => (x - board.x0) * S, py = (y) => (y - board.y0) * S;
  const hasRails = layout.rails.length > 0;
  g.fillStyle = '#ece8dc'; g.fillRect(0, 0, c.width, c.height);

  // centre channel
  const cy = by + 5;
  g.fillStyle = '#cfc9b8'; g.fillRect(px(0.4), py(cy), px(board.x1 - 0.4) - px(0.4), 1.2 * S);
  g.fillStyle = '#b9b3a1'; g.fillRect(px(0.4), py(cy), px(board.x1 - 0.4) - px(0.4), 3);
  g.fillRect(px(0.4), py(cy + 1.2), px(board.x1 - 0.4) - px(0.4), 3);

  g.textBaseline = 'middle'; g.textAlign = 'center';
  if (hasRails) {
    const x0 = spec.railX0, x1 = layout.railX1;
    const line = (y, color) => { g.strokeStyle = color; g.lineWidth = 3; g.beginPath(); g.moveTo(px(x0 - 0.7), py(y)); g.lineTo(px(x1 + 0.7), py(y)); g.stroke(); };
    const rails = layout.rails;
    for (let i = 0; i + 1 < rails.length; i += 2) {
      const a = rails[i], b = rails[i + 1];
      line(a.y - 0.65, a.pol === '+' ? '#d32f2f' : '#1e5bd6');
      line(b.y + 0.65, b.pol === '+' ? '#d32f2f' : '#1e5bd6');
    }
    g.font = `bold ${0.8 * S}px sans-serif`;
    const lx = x0 >= 3 ? x0 - 1.7 : x0 - 1.0;
    const rx = x1 <= cols - 2 ? x1 + 1.7 : x1 + 1.0;
    for (const r of rails) {
      const col = r.pol === '+' ? '#d32f2f' : '#1e5bd6';
      g.fillStyle = col;
      g.fillText(r.pol === '+' ? '+' : '−', px(lx), py(r.y));
      g.fillText(r.pol === '+' ? '+' : '−', px(rx), py(r.y));
    }
    // labelled buses (multi-bus lab board)
    const groups = [];
    for (let i = 0; i + 1 < rails.length; i += 2) if (rails[i].group) groups.push([rails[i], rails[i + 1]]);
    if (groups.length) {
      g.font = `bold ${0.62 * S}px sans-serif`;
      groups.forEach(([a, b], gi) => {
        g.fillStyle = '#4a4638';
        const above = gi === 0;
        const below = gi === groups.length - 1 && gi > 0;
        const y = above ? a.y - 1.15 : below ? b.y + 1.15 : (groups[gi - 1][1].y + 0.65 + a.y - 0.65) / 2;
        g.fillText(`${a.group} BUS`, px((x0 + x1) / 2), py(y));
      });
    }
  }

  // column numbers + row letters
  g.fillStyle = '#7a7768'; g.font = `${0.55 * S}px sans-serif`;
  for (let col = 1; col <= cols; col++) {
    if (col === 1 || col % 5 === 0) { g.fillText(String(col), px(col), py(by - 0.85)); g.fillText(String(col), px(col), py(by + BOT_OFFSET + 4.85)); }
  }
  ROWS_TOP.forEach((l, i) => { g.fillText(l, px(0.3), py(by + i)); g.fillText(l, px(board.x1 - 0.3), py(by + i)); });
  ROWS_BOT.forEach((l, i) => { g.fillText(l, px(0.3), py(by + BOT_OFFSET + i)); g.fillText(l, px(board.x1 - 0.3), py(by + BOT_OFFSET + i)); });

  // holes
  for (const h of holes) {
    g.fillStyle = '#9a9684'; g.fillRect(px(h.x) - 0.36 * S, py(h.y) - 0.36 * S, 0.72 * S, 0.72 * S);
    g.fillStyle = '#16161a'; g.fillRect(px(h.x) - 0.28 * S, py(h.y) - 0.28 * S, 0.56 * S, 0.56 * S);
  }
  g.fillStyle = '#8a8672';
  g.font = `bold ${(cols > 40 ? 0.7 : cols > 20 ? 0.5 : 0.36) * S}px sans-serif`;
  g.fillText(cols > 12 ? 'BREADBOARD DIGITAL' : 'BBD', px(layout.center.x), py(cy + 0.6));
  return canvasTexture(c);
}

// Returns { group, cover, coverMats, coverEdges, stripMeshes, clips, X, Z, dispose }.
// The group is centred on the layout centre (so the board centre is the local origin).
export function buildBoardMesh(layout, { shadows = true } = {}) {
  const group = new THREE.Group();
  const X = (x) => x - layout.center.x;
  const Z = (y) => y - layout.center.y;
  const topTex = drawBoardTop(layout);
  const side = new THREE.MeshStandardMaterial({ color: '#e5e0d2', roughness: 0.55, transparent: true });
  const top = new THREE.MeshStandardMaterial({ color: '#ffffff', map: topTex, roughness: 0.5, transparent: true });
  const bottom = new THREE.MeshStandardMaterial({ color: '#d8d3c4', roughness: 0.6, transparent: true });
  const coverMats = [side, side, top, bottom, side, side];
  const cover = new THREE.Mesh(new THREE.BoxGeometry(layout.w, 0.9, layout.h), coverMats);
  cover.position.set(0, -0.45, 0);
  cover.renderOrder = 3;
  cover.castShadow = shadows; cover.receiveShadow = shadows;
  group.add(cover);
  const coverEdges = new THREE.LineSegments(new THREE.EdgesGeometry(cover.geometry), new THREE.LineBasicMaterial({ color: '#8d8a78', transparent: true, opacity: 0.0 }));
  coverEdges.position.copy(cover.position);
  group.add(coverEdges);
  const base = new THREE.Mesh(new THREE.BoxGeometry(layout.w + 0.4, 0.3, layout.h + 0.4), new THREE.MeshStandardMaterial({ color: '#cfc9b8', roughness: 0.7 }));
  base.position.set(0, -1.05, 0);
  base.castShadow = shadows; base.receiveShadow = shadows;
  group.add(base);

  // internal metal strips (visible in X-ray mode)
  const stripMeshes = new Map();
  const metal = () => new THREE.MeshStandardMaterial({ color: '#b9bec7', metalness: 0.85, roughness: 0.35, emissive: '#000000' });
  for (const s of layout.strips) {
    let m;
    if (s.kind === 't') {
      const ys = s.holes.map((h) => h.y);
      const y0 = Math.min(...ys), y1 = Math.max(...ys);
      m = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, y1 - y0 + 0.7), metal());
      m.position.set(X(s.holes[0].x), -0.55, Z((y0 + y1) / 2));
    } else {
      const xs = s.holes.map((h) => h.x);
      const x0 = Math.min(...xs), x1 = Math.max(...xs);
      m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.8, 0.16, 0.5), metal());
      m.position.set(X((x0 + x1) / 2), -0.55, Z(s.holes[0].y));
    }
    group.add(m);
    stripMeshes.set(s.key, m);
  }
  // spring clips under every hole
  const clips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.62, 0.34, 0.5), new THREE.MeshStandardMaterial({ color: '#8f949d', metalness: 0.9, roughness: 0.4 }), layout.holes.length);
  const m4 = new THREE.Matrix4();
  layout.holes.forEach((h, i) => { m4.makeTranslation(X(h.x), -0.4, Z(h.y)); clips.setMatrixAt(i, m4); });
  clips.instanceMatrix.needsUpdate = true;
  group.add(clips);

  const dispose = () => {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { if (m.map) m.map.dispose(); m.dispose(); }
      }
    });
  };
  return { group, cover, coverMats, coverEdges, stripMeshes, clips, X, Z, dispose };
}

// Curved jumper wire (tube + plugs) between two 3D points.
export function makeWireMesh(a, b, color, matFn) {
  const g = new THREE.Group();
  const len = a.distanceTo(b);
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y += Math.min(9, 1.2 + len * 0.28);
  const curve = new THREE.QuadraticBezierCurve3(a.clone().add(new THREE.Vector3(0, 0.6, 0)), mid, b.clone().add(new THREE.Vector3(0, 0.6, 0)));
  const wm = matFn(color, { r: 0.45 });
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.13, 8, false), wm);
  tube.castShadow = true;
  g.add(tube);
  for (const p of [a, b]) {
    const plug = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 10), wm);
    plug.position.set(p.x, p.y + 0.35, p.z);
    plug.castShadow = true;
    g.add(plug);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 8), matFn('#c9ccd2', { m: 0.9, r: 0.3 }));
    pin.position.set(p.x, p.y - 0.1, p.z);
    g.add(pin);
  }
  return g;
}
