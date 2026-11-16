// Netlist extraction: union-find over breadboard strips, wires, part pins and probes.
import { holeById, holeAt, rotOffset } from './geometry.js';
import { PART_TYPES } from '../data/catalog.js';

class UF {
  constructor() { this.p = new Map(); }
  add(k) { if (!this.p.has(k)) this.p.set(k, k); }
  find(k) {
    if (!this.p.has(k)) return null;
    let r = k;
    while (this.p.get(r) !== r) r = this.p.get(r);
    while (this.p.get(k) !== r) { const n = this.p.get(k); this.p.set(k, r); k = n; }
    return r;
  }
  union(a, b) {
    this.add(a); this.add(b);
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.p.set(ra, rb);
  }
}

export function pinWorld(part, pin) {
  const [rx, ry] = rotOffset(pin.dx, pin.dy, part.rot || 0);
  return { x: part.x + rx, y: part.y + ry };
}

// Key used by the union-find for a wire/probe endpoint.
export function epKey(ep) {
  if (!ep) return null;
  if (ep.h) {
    const h = holeById.get(ep.h);
    return h ? h.strip : null;
  }
  if (ep.p) return `${ep.p}.${ep.n}`;
  return null;
}

export function buildNetlist(parts, wires) {
  const uf = new UF();
  const pinKeys = new Map();
  const pinHole = new Map();

  for (const part of parts) {
    const def = PART_TYPES[part.type];
    if (!def || !def.pins) continue;
    const m = {};
    for (const pin of def.pins(part.params)) {
      const key = `${part.id}.${pin.n}`;
      uf.add(key);
      m[pin.n] = key;
      if (!def.bench) {
        const w = pinWorld(part, pin);
        const h = holeAt(w.x, w.y);
        if (h) {
          uf.union(key, h.strip);
          pinHole.set(key, h.id);
        }
      }
    }
    pinKeys.set(part.id, m);
    if (part.probes) {
      for (const [pn, ep] of Object.entries(part.probes)) {
        const k = epKey(ep);
        if (k && m[pn]) uf.union(m[pn], k);
      }
    }
  }
  for (const w of wires) {
    const ka = epKey(w.a), kb = epKey(w.b);
    if (ka && kb) uf.union(ka, kb);
  }

  // node numbering (1..n); node 0 is the global reference
  const nodeOfRoot = new Map();
  let n = 0;
  for (const k of uf.p.keys()) {
    const r = uf.find(k);
    if (!nodeOfRoot.has(r)) nodeOfRoot.set(r, ++n);
  }
  const nodeOfKey = (key) => {
    const r = uf.find(key);
    return r == null ? 0 : nodeOfRoot.get(r) ?? 0;
  };
  const pinNodes = new Map();
  for (const [pid, m] of pinKeys) {
    const o = {};
    for (const pn in m) o[pn] = nodeOfKey(m[pn]);
    pinNodes.set(pid, o);
  }
  return { nNodes: n, pinNodes, nodeOfKey, pinHole };
}
