// Real-time circuit engine: modified nodal analysis + Newton-Raphson + backward-Euler time stepping.
import { PART_TYPES } from '../data/catalog.js';
import { holeById, BOARD_TYPE } from './geometry.js';
import { buildNetlist, epKey } from './netlist.js';
import { MODELS } from './models.js';
import { solveLinear } from './linalg.js';

const GMIN_NODE = 1e-9;
const NOINPUT = Object.freeze({ pressed: false, keys: null });

class Ctx {
  constructor() { this.t = 0; this.dt = 1e-3; this.noncon = false; this.V = new Float64Array(1); this.idx = new Int32Array(1).fill(-1); this.nu = 0; this.A = []; this.b = new Float64Array(0); }
  setup(nNodes, idx) {
    this.idx = idx;
    this.V = new Float64Array(nNodes + 1);
    let nu = 0;
    for (let i = 0; i < idx.length; i++) if (idx[i] >= 0) nu++;
    this.nu = nu;
    this.A = Array.from({ length: nu }, () => new Float64Array(nu));
    this.b = new Float64Array(nu);
  }
  clear() {
    for (const r of this.A) r.fill(0);
    this.b.fill(0);
  }
  v(n) { return this.V[n]; }
  g(a, b, g) {
    const ia = this.idx[a], ib = this.idx[b];
    if (ia >= 0) this.A[ia][ia] += g;
    if (ib >= 0) this.A[ib][ib] += g;
    if (ia >= 0 && ib >= 0) { this.A[ia][ib] -= g; this.A[ib][ia] -= g; }
  }
  i(n, I) { const k = this.idx[n]; if (k >= 0) this.b[k] += I; }
  // current leaving nodes[k] into the device = K[k] + sum_j J[k][j] * V[nodes[j]]
  jac(nodes, J, K) {
    for (let k = 0; k < nodes.length; k++) {
      const ik = this.idx[nodes[k]];
      if (ik < 0) continue;
      const row = this.A[ik];
      for (let j = 0; j < nodes.length; j++) {
        const ij = this.idx[nodes[j]];
        if (ij >= 0) row[ij] += J[k][j];
      }
      this.b[ik] -= K[k];
    }
  }
}

export class Engine {
  constructor() {
    this.parts = [];
    this.wires = [];
    this.sig = '';
    this.els = [];
    this.dyn = new Map();
    this.out = new Map();
    this.burnt = new Map();
    this.inputs = new Map();
    this.runtimes = new Map();
    this.island = new Int32Array(1);
    this.nl = null;
    this.ctx = new Ctx();
    this.t = 0;
    this.stepCost = 2e-4;
    this.lastIters = 0;
    this.onBurn = null;
  }

  // ---- circuit management
  sync(parts, wires) {
    const sig =
      BOARD_TYPE + '@' +
      parts.map((p) => `${p.id}|${p.type}|${p.x}|${p.y}|${p.rot || 0}|${p.params.span ?? ''}|${JSON.stringify(p.probes || null)}`).join(';') +
      '#' + wires.map((w) => `${w.id}|${epKey(w.a)}|${epKey(w.b)}`).join(';');
    this.parts = parts;
    this.wires = wires;
    if (sig !== this.sig) {
      this.sig = sig;
      this.rebuild();
    } else {
      const byId = new Map(parts.map((p) => [p.id, p]));
      for (const el of this.els) el.E.part = byId.get(el.E.id) || el.E.part;
    }
  }

  makeEnv(part, def) {
    const eng = this;
    const id = part.id;
    if (!this.dyn.has(id)) this.dyn.set(id, {});
    if (!this.out.has(id)) this.out.set(id, {});
    return {
      engine: eng, part, id, def,
      get p() { return this.part.params; },
      dyn: this.dyn.get(id),
      out: this.out.get(id),
      get burnt() { return eng.burnt.has(id); },
      get input() { return eng.inputs.get(id) || NOINPUT; },
      probeOn(name) { return !!(this.part.probes && this.part.probes[name]); },
      burn(reason, opts = {}) {
        if (eng.burnt.has(id)) return;
        const info = { reason, t: eng.t, smoke: opts.smoke !== false };
        eng.burnt.set(id, info);
        if (eng.onBurn) eng.onBurn(id, info);
      },
      damage(ratio, rate, dt) {
        const d = this.dyn;
        if (ratio > 1) {
          d.dmg = (d.dmg || 0) + (ratio - 1) * rate * dt;
          if (d.dmg >= 1) this.burn('overload');
        } else if (d.dmg) d.dmg = Math.max(0, d.dmg - dt * 0.5);
        this.out.dmg = d.dmg || 0;
      },
    };
  }

  rebuild() {
    const nl = buildNetlist(this.parts, this.wires);
    this.nl = nl;
    let nNodes = nl.nNodes;
    const alloc = () => ++nNodes;
    const els = [];
    for (const part of this.parts) {
      const def = PART_TYPES[part.type];
      if (!def || !def.model || !MODELS[def.model]) continue;
      const E = this.makeEnv(part, def);
      const el = MODELS[def.model](E, nl.pinNodes.get(part.id) || {}, alloc);
      if (!el) continue;
      el.E = E;
      els.push(el);
    }
    this.els = els;

    // islands + ground selection
    const par = new Int32Array(nNodes + 1).map((_, i) => i);
    const find = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
    for (const el of els) for (let i = 1; i < el.nodes.length; i++) uni(el.nodes[0], el.nodes[i]);
    const best = new Map();
    for (const el of els) {
      if (!el.ground || !el.nodes.length) continue;
      const r = find(el.ground.node);
      const cur = best.get(r);
      if (!cur || el.ground.prio > cur.prio) best.set(r, el.ground);
    }
    const idx = new Int32Array(nNodes + 1).fill(-2);
    idx[0] = -1;
    const grounded = new Set();
    for (const [r, g] of best) { grounded.add(r); idx[g.node] = -1; }
    for (let n = 1; n <= nNodes; n++) {
      const r = find(n);
      if (!grounded.has(r)) { grounded.add(r); idx[n] = -1; } // island without source: first node is the reference
    }
    let k = 0;
    for (let n = 1; n <= nNodes; n++) if (idx[n] === -2) idx[n] = k++;
    for (let n = 1; n <= nNodes; n++) if (idx[n] === -2) idx[n] = -1;
    this.island = new Int32Array(nNodes + 1);
    for (let n = 0; n <= nNodes; n++) this.island[n] = find(n);
    this.hasNonlinear = els.some((e) => e.nonlinear);
    this.hasDynamic = els.some((e) => e.dynamic || e.hasState);
    this.nNodes = nNodes;
    const oldV = this.ctx.V;
    this.ctx.setup(nNodes, idx);
    // keep previous voltages where node numbering allows (helps continuity); otherwise start from 0
    if (oldV && oldV.length === this.ctx.V.length) this.ctx.V.set(oldV);
    for (let n = 1; n <= nNodes; n++) if (idx[n] < 0) this.ctx.V[n] = 0;
  }

  reset() {
    this.t = 0;
    this.dyn.clear();
    this.out.clear();
    this.burnt.clear();
    this.runtimes.clear();
    this.ctx.V.fill(0);
    this.rebuild();
    if (this.onBurn) this.onBurn(null, null);
  }

  repair(id) {
    this.burnt.delete(id);
    const d = this.dyn.get(id);
    if (d) d.dmg = 0;
    if (this.onBurn) this.onBurn(id, null);
  }

  setInput(id, patch) {
    const cur = this.inputs.get(id) || { pressed: false, keys: new Set() };
    this.inputs.set(id, { ...cur, ...patch });
  }

  // ---- stepping
  frame(realDt, speed) {
    const span = Math.min(realDt, 0.05) * speed;
    if (span <= 0) return;
    let n = 1;
    if (this.hasDynamic) {
      n = Math.ceil(span / 2e-5);
      const budget = Math.max(1, Math.floor(0.010 / Math.max(this.stepCost, 1e-6)));
      n = Math.max(1, Math.min(n, 80, budget));
    }
    const dt = span / n;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) this.step(dt);
    const cost = (performance.now() - t0) / 1000 / n;
    this.stepCost = this.stepCost * 0.9 + cost * 0.1;
  }

  step(dt) {
    const c = this.ctx;
    c.dt = dt;
    c.t = this.t + dt;
    const els = this.els;
    for (const el of els) if (el.pre) el.pre(c);

    let iters = this.newton(c);
    for (let outer = 0; outer < 4; outer++) {
      let changed = false;
      for (const el of els) if (el.settle && el.settle(c)) changed = true;
      if (!changed) break;
      iters += this.newton(c);
    }
    this.lastIters = iters;
    for (const el of els) if (el.commit) el.commit(c);
    this.t = c.t;
  }


  // Newton-Raphson with oscillation-adaptive damping. Returns the number of iterations used.
  newton(c) {
    const els = this.els;
    const nu = c.nu, idx = c.idx;
    const maxIter = this.hasNonlinear ? 80 : 1;
    let alpha = 1;
    let prevD = null;
    let iters = 0;
    for (let it = 0; it < maxIter; it++) {
      iters++;
      c.clear();
      c.noncon = false;
      for (const el of els) el.stamp(c);
      for (let i = 0; i < nu; i++) c.A[i][i] += GMIN_NODE;
      let x = solveLinear(c.A, c.b, nu);
      if (!x) {
        c.clear();
        c.noncon = false;
        for (const el of els) el.stamp(c);
        for (let i = 0; i < nu; i++) c.A[i][i] += 1e-6;
        x = solveLinear(c.A, c.b, nu);
        if (!x) break;
      }
      // Newton step with oscillation-adaptive damping
      let maxd = 0, vmax = 1, dot = 0;
      const d = new Float64Array(nu);
      for (let n = 1; n < idx.length; n++) {
        const k = idx[n];
        if (k < 0) continue;
        d[k] = x[k] - c.V[n];
        const a = Math.abs(d[k]);
        if (a > maxd) maxd = a;
        const av = Math.abs(x[k]);
        if (av > vmax) vmax = av;
        if (prevD) dot += d[k] * prevD[k];
      }
      if (!this.hasNonlinear) alpha = 1;
      else if (prevD && dot < 0) alpha = Math.max(alpha * 0.5, 1 / 64);
      else alpha = Math.min(1, alpha * 1.6);
      for (let n = 1; n < idx.length; n++) {
        const k = idx[n];
        if (k >= 0) c.V[n] += alpha * d[k];
      }
      prevD = d;
      if (!c.noncon && maxd < 1e-6 * vmax + 1e-9) break;
    }
    return iters;
  }

  // ---- queries
  keyVoltage(key) {
    if (!this.nl) return 0;
    return this.ctx.V[this.nl.nodeOfKey(key)] || 0;
  }
  holeVoltage(holeId) {
    const h = holeById.get(holeId);
    return h ? this.keyVoltage(h.strip) : 0;
  }
  endpointVoltage(ep) {
    const k = epKey(ep);
    return k ? this.keyVoltage(k) : 0;
  }
  scopeData(id) {
    const d = this.dyn.get(id);
    return d && d.buf ? d.buf : null;
  }
}
