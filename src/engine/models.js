// Device models. Every factory receives (E, N, alloc):
//   E      per-part environment  { part, def, p (live params), dyn (persistent state), out (readouts),
//                                  input (runtime user input), burnt, burn(), damage(), probeOn() , engine }
//   N      pin name -> node index
// and returns an element:
//   { nodes, ground?, nonlinear?, dynamic?, pre?(c), stamp(c), commit?(c) }
// Context c: c.v(node) c.g(a,b,g) c.i(node,I) c.jac(nodes,J,K) c.t c.dt c.noncon
import { VT, GMIN, isFromVf, vcrit, pnjlim, stampDiode, diodeCurrent, clamp } from './common.js';
import { logicGates } from '../data/catalog.js';
import { McuRuntime, effectiveCode, OUTPUT, INPUT } from './mcu.js';

const OPEN = 1e-12;

// Thevenin drive: V(node) - V(ref) -> vt through rout
function drive(c, node, ref, vt, rout) {
  const g = 1 / rout;
  c.g(node, ref, g);
  c.i(node, vt * g);
  c.i(ref, -vt * g);
}

// Norton source with current limit (CV/CC). Returns nothing; mode kept in st.
function srcStamp(c, st, p, n, V, Rint, Imax) {
  const G = 1 / Math.max(Rint, 0.005);
  const mode = st.mode || 0;
  if (mode === 0) {
    c.g(p, n, G);
    c.i(p, V * G);
    c.i(n, -V * G);
  } else {
    c.i(p, mode * Imax);
    c.i(n, -mode * Imax);
  }
}
// After Newton converges: is the CV/CC mode consistent? Returns true if it had to change.
function srcSettle(c, st, p, n, V, Rint, Imax) {
  const G = 1 / Math.max(Rint, 0.005);
  const iest = (V - (c.v(p) - c.v(n))) * G;
  const mode = st.mode || 0;
  let next = mode;
  if (mode === 0) next = iest > Imax ? 1 : iest < -Imax ? -1 : 0;
  else if (mode === 1 && iest <= Imax) next = 0;
  else if (mode === -1 && iest >= -Imax) next = 0;
  st.mode = next;
  return next !== mode;
}
function srcCurrent(c, st, p, n, V, Rint, Imax) {
  const G = 1 / Math.max(Rint, 0.005);
  return st.mode === 0 ? (V - (c.v(p) - c.v(n))) * G : st.mode * Imax;
}

function wave(kind, t, f, amp) {
  const ph = t * f;
  switch (kind) {
    case 'square': return Math.sin(2 * Math.PI * ph) >= 0 ? amp : -amp;
    case 'triangle': return (2 * amp / Math.PI) * Math.asin(Math.sin(2 * Math.PI * ph));
    case 'saw': return 2 * amp * (ph - Math.floor(ph + 0.5));
    default: return amp * Math.sin(2 * Math.PI * ph);
  }
}

export const MODELS = {};

// ------------------------------------------------------------------ sources
MODELS.battery = (E, N) => {
  const p = N['+'], n = N['-'], st = E.dyn;
  return {
    nodes: [p, n], ground: { node: n, prio: 10 },
    stamp(c) {
      if (E.burnt) { c.g(p, n, OPEN); return; }
      srcStamp(c, st, p, n, E.p.V, E.p.Rint, E.p.Imax);
    },
    settle(c) {
      return !E.burnt && srcSettle(c, st, p, n, E.p.V, E.p.Rint, E.p.Imax);
    },
    commit(c) {
      if (E.burnt) return;
      const o = E.out;
      o.v = c.v(p) - c.v(n);
      o.i = srcCurrent(c, st, p, n, E.p.V, E.p.Rint, E.p.Imax);
      o.p = o.v * o.i;
      o.cc = st.mode !== 0;
      // a battery working at its current limit overheats
      st.hot = o.cc ? (st.hot || 0) + c.dt : Math.max(0, (st.hot || 0) - c.dt * 0.5);
      if (st.hot > 3) E.burn('overheat');
    },
  };
};

MODELS.psu = (E, N) => {
  const p = N['+'], n = N['-'], st = E.dyn;
  return {
    nodes: [p, n], ground: { node: n, prio: 10 },
    stamp(c) {
      if (E.burnt || E.p.on === false) { c.g(p, n, OPEN); return; }
      srcStamp(c, st, p, n, E.p.V, E.p.Rint, E.p.Imax);
    },
    settle(c) {
      return !E.burnt && E.p.on !== false && srcSettle(c, st, p, n, E.p.V, E.p.Rint, E.p.Imax);
    },
    commit(c) {
      const o = E.out;
      o.v = c.v(p) - c.v(n);
      o.i = E.p.on === false ? 0 : srcCurrent(c, st, p, n, E.p.V, E.p.Rint, E.p.Imax);
      o.p = o.v * o.i;
      o.cc = st.mode !== 0 && E.p.on !== false;
    },
  };
};

MODELS.psu_dual = (E, N) => {
  const p = N['+'], m = N.COM, n = N['-'];
  const a = (E.dyn.a = E.dyn.a || {}), b = (E.dyn.b = E.dyn.b || {});
  return {
    nodes: [p, m, n], ground: { node: m, prio: 10 },
    stamp(c) {
      if (E.burnt || E.p.on === false) { c.g(p, m, OPEN); c.g(m, n, OPEN); return; }
      srcStamp(c, a, p, m, E.p.V, E.p.Rint, E.p.Imax);
      srcStamp(c, b, m, n, E.p.V, E.p.Rint, E.p.Imax);
    },
    settle(c) {
      if (E.burnt || E.p.on === false) return false;
      const x = srcSettle(c, a, p, m, E.p.V, E.p.Rint, E.p.Imax);
      const y = srcSettle(c, b, m, n, E.p.V, E.p.Rint, E.p.Imax);
      return x || y;
    },
    commit(c) {
      const o = E.out, on = E.p.on !== false;
      o.vpos = c.v(p) - c.v(m);
      o.vneg = c.v(m) - c.v(n);
      o.ipos = on ? srcCurrent(c, a, p, m, E.p.V, E.p.Rint, E.p.Imax) : 0;
      o.ineg = on ? srcCurrent(c, b, m, n, E.p.V, E.p.Rint, E.p.Imax) : 0;
    },
  };
};

MODELS.ac_ct = (E, N) => {
  const A = N.A, ct = N.CT, B = N.B;
  const a = (E.dyn.a = E.dyn.a || {}), b = (E.dyn.b = E.dyn.b || {});
  return {
    nodes: [A, ct, B], ground: { node: ct, prio: 10 }, dynamic: true,
    settle(c) {
      if (E.burnt || E.p.on === false) return false;
      const e = Math.SQRT2 * E.p.Vrms * Math.sin(2 * Math.PI * E.p.f * c.t);
      const x = srcSettle(c, a, A, ct, e, E.p.Rint, E.p.Imax);
      const y = srcSettle(c, b, B, ct, -e, E.p.Rint, E.p.Imax);
      return x || y;
    },
    stamp(c) {
      if (E.burnt || E.p.on === false) { c.g(A, ct, OPEN); c.g(B, ct, OPEN); return; }
      const e = Math.SQRT2 * E.p.Vrms * Math.sin(2 * Math.PI * E.p.f * c.t);
      srcStamp(c, a, A, ct, e, E.p.Rint, E.p.Imax);
      srcStamp(c, b, B, ct, -e, E.p.Rint, E.p.Imax);
    },
    commit(c) {
      const o = E.out;
      o.va = c.v(A) - c.v(ct);
      o.vb = c.v(B) - c.v(ct);
    },
  };
};

MODELS.func_gen = (E, N) => {
  const out = N.OUT, g = N.GND, st = E.dyn;
  return {
    nodes: [out, g], ground: { node: g, prio: 10 }, dynamic: true,
    settle(c) {
      if (E.burnt || E.p.on === false) return false;
      const p = E.p;
      return srcSettle(c, st, out, g, p.offset + wave(p.wave, c.t, p.f, p.amp), p.Rout, 0.5);
    },
    stamp(c) {
      if (E.burnt || E.p.on === false) { c.g(out, g, OPEN); return; }
      const p = E.p;
      const v = p.offset + wave(p.wave, c.t, p.f, p.amp);
      srcStamp(c, st, out, g, v, p.Rout, 0.5);
    },
    commit(c) {
      E.out.v = c.v(out) - c.v(g);
    },
  };
};

// ------------------------------------------------------------------ passives
function resistorLike(E, a, b, rfn, rating) {
  return {
    nodes: [a, b],
    stamp(c) {
      if (E.burnt) { c.g(a, b, OPEN); return; }
      c.g(a, b, 1 / Math.max(rfn(), 1e-3));
    },
    commit(c) {
      const R = Math.max(rfn(), 1e-3);
      const v = c.v(a) - c.v(b);
      const o = E.out;
      o.v = v; o.i = v / R; o.p = v * o.i; o.R = R;
      if (!E.burnt && rating) E.damage(Math.abs(o.p) / rating(), 0.35, c.dt);
    },
  };
}

MODELS.resistor = (E, N) => resistorLike(E, N.A, N.B, () => E.p.R, () => E.p.P);
MODELS.ldr = (E, N) =>
  resistorLike(E, N.A, N.B, () => E.p.R10 * Math.pow(10 / Math.max(E.p.lux, 0.01), E.p.gamma), () => 0.2);
MODELS.ntc = (E, N) =>
  resistorLike(E, N.A, N.B, () => E.p.R25 * Math.exp(E.p.B * (1 / (E.p.temp + 273.15) - 1 / 298.15)), () => 0.5);
MODELS.ptc = (E, N) =>
  resistorLike(E, N.A, N.B, () => E.p.R25 * (1 + 0.005 * (E.p.temp - 25)) * (1 + 2000 / (1 + Math.exp(-(E.p.temp - E.p.Tsw) / 2.5))), () => 1);

MODELS.pot = (E, N) => {
  const A = N.A, W = N.W, B = N.B;
  const split = () => {
    const x = clamp(E.p.pos, 0, 1);
    const pe = E.p.taper === 'log' ? (Math.pow(10, 2 * x) - 1) / 99 : x;
    return [Math.max(E.p.R * pe, 0.5), Math.max(E.p.R * (1 - pe), 0.5)];
  };
  return {
    nodes: [A, W, B],
    stamp(c) {
      if (E.burnt) { c.g(A, B, OPEN); return; }
      const [r1, r2] = split();
      c.g(A, W, 1 / r1);
      c.g(W, B, 1 / r2);
    },
    commit(c) {
      const [r1, r2] = split();
      const v1 = c.v(A) - c.v(W), v2 = c.v(W) - c.v(B);
      const o = E.out;
      o.v1 = v1; o.v2 = v2; o.vw = c.v(W) - c.v(B);
      o.i1 = v1 / r1; o.i2 = v2 / r2;
      o.p = v1 * o.i1 + v2 * o.i2;
      if (!E.burnt) E.damage(o.p / 0.5, 0.35, c.dt);
    },
  };
};

MODELS.cap = (E, N) => {
  const a = N.A || N['+'], b = N.B || N['-'], st = E.dyn;
  st.v = st.v || 0;
  return {
    nodes: [a, b], dynamic: true,
    stamp(c) {
      if (E.burnt) { c.g(a, b, OPEN); return; }
      const g = E.p.C / c.dt;
      c.g(a, b, g + OPEN);
      c.i(a, g * st.v);
      c.i(b, -g * st.v);
    },
    commit(c) {
      const v = c.v(a) - c.v(b);
      const o = E.out;
      if (!E.burnt) {
        o.i = (E.p.C / c.dt) * (v - st.v);
        st.v = v;
        o.v = v;
        if (v > E.p.Vmax) E.damage(v / E.p.Vmax, 25, c.dt);
        else if (E.p.pol && v < -1.0) E.damage(1 - v, 25, c.dt);
        else E.damage(0, 1, c.dt);
      }
    },
  };
};

MODELS.inductor = (E, N) => {
  const a = N.A, b = N.B, st = E.dyn;
  st.i = st.i || 0;
  const eq = (c) => {
    const lt = E.p.L / c.dt;
    const geq = 1 / (E.p.Rdc + lt);
    return { geq, ieq: geq * lt * st.i };
  };
  return {
    nodes: [a, b], dynamic: true,
    stamp(c) {
      if (E.burnt) { c.g(a, b, OPEN); return; }
      const { geq, ieq } = eq(c);
      c.g(a, b, geq);
      c.i(a, -ieq);
      c.i(b, ieq);
    },
    commit(c) {
      if (E.burnt) return;
      const { geq, ieq } = eq(c);
      const v = c.v(a) - c.v(b);
      st.i = geq * v + ieq;
      E.out.v = v; E.out.i = st.i;
      E.damage(Math.abs(st.i) / E.p.Imax, 20, c.dt);
    },
  };
};

// ------------------------------------------------------------------ diodes / LEDs
function diodeParams(st, vf, n, iref) {
  const key = vf + '|' + n + '|' + iref;
  if (st._key !== key) { st._key = key; st._is = isFromVf(vf, n, iref); }
  return { is: st._is, nVt: n * VT };
}

MODELS.diode = (E, N) => {
  const a = N.A, k = N.K || N.B, st = E.dyn;
  return {
    nodes: [a, k], nonlinear: true,
    stamp(c) {
      if (E.burnt) { c.g(a, k, OPEN); return; }
      const { is, nVt } = diodeParams(st, E.p.vf, E.p.n, E.p.iref);
      stampDiode(c, a, k, is, nVt, st, 'vd');
    },
    commit(c) {
      if (E.burnt) return;
      const { is, nVt } = diodeParams(st, E.p.vf, E.p.n, E.p.iref);
      const v = c.v(a) - c.v(k);
      const i = diodeCurrent(c.v(a), c.v(k), is, nVt) + GMIN * v;
      const o = E.out;
      o.v = v; o.i = i; o.p = v * i;
      E.damage(Math.abs(i) / E.p.Imax, 80, c.dt);
    },
  };
};

// Reverse breakdown branch of a Zener: i(k->a) = I0 * exp((vr - Vz) / nVt)
const ZN_VT = 0.04, ZN_I0 = 0.005;
function stampZenerRev(c, k, a, vz, st) {
  const x = c.v(k) - c.v(a) - vz;
  const [xl, lim] = pnjlim(x, st.xz ?? -vz, ZN_VT, vcrit(ZN_VT, ZN_I0));
  if (lim) c.noncon = true;
  st.xz = xl;
  const e = Math.exp(Math.min(xl / ZN_VT, 60));
  const i = ZN_I0 * e;
  const g = (ZN_I0 / ZN_VT) * e + GMIN;
  const ieq = i - g * (xl + vz);
  c.g(k, a, g);
  c.i(k, -ieq);
  c.i(a, ieq);
}
function zenerRevCurrent(vk, va, vz) {
  return ZN_I0 * Math.exp(Math.min((vk - va - vz) / ZN_VT, 60));
}

MODELS.zener = (E, N) => {
  const a = N.A, k = N.B, st = E.dyn;
  return {
    nodes: [a, k], nonlinear: true,
    stamp(c) {
      if (E.burnt) { c.g(a, k, OPEN); return; }
      const f = diodeParams(st, E.p.vf, E.p.n, E.p.iref);
      stampDiode(c, a, k, f.is, f.nVt, st, 'vd');
      stampZenerRev(c, k, a, E.p.Vz, st);
    },
    commit(c) {
      if (E.burnt) return;
      const f = diodeParams(st, E.p.vf, E.p.n, E.p.iref);
      const v = c.v(a) - c.v(k);
      const i = diodeCurrent(c.v(a), c.v(k), f.is, f.nVt) - zenerRevCurrent(c.v(k), c.v(a), E.p.Vz);
      const o = E.out;
      o.v = v; o.i = i; o.p = v * i;
      E.damage(Math.abs(o.p) / E.p.Pmax, 40, c.dt);
    },
  };
};

function ledDamage(E, i, imax, dt) {
  const ratio = Math.abs(i) / imax;
  if (ratio > 6) { E.burn('overcurrent'); return; }
  E.damage(ratio, 150, dt);
}

MODELS.led = (E, N) => {
  const a = N.A, k = N.K, st = E.dyn;
  return {
    nodes: [a, k], nonlinear: true,
    stamp(c) {
      if (E.burnt) { c.g(a, k, OPEN); return; }
      const { is, nVt } = diodeParams(st, E.p.vf, 2.0, 0.02);
      stampDiode(c, a, k, is, nVt, st, 'vd');
    },
    commit(c) {
      const o = E.out;
      if (E.burnt) { o.i = 0; o.b = 0; return; }
      const { is, nVt } = diodeParams(st, E.p.vf, 2.0, 0.02);
      const v = c.v(a) - c.v(k);
      const i = Math.max(0, diodeCurrent(c.v(a), c.v(k), is, nVt));
      o.v = v; o.i = i; o.p = v * i;
      o.b = Math.min(1.6, i / 0.02);
      ledDamage(E, i, E.p.Imax, c.dt);
    },
  };
};

MODELS.led_rgb = (E, N) => {
  const st = E.dyn;
  const ch = [['R', 'vfR'], ['G', 'vfG'], ['B', 'vfB']];
  const nodes = [N.R, N.K, N.G, N.B];
  const ends = (pin) => (E.p.common === 'anode' ? [N.K, N[pin]] : [N[pin], N.K]);
  return {
    nodes, nonlinear: true,
    stamp(c) {
      if (E.burnt) { for (const [pin] of ch) c.g(N[pin], N.K, OPEN); return; }
      for (const [pin, vfk] of ch) {
        const [a, k] = ends(pin);
        const s = (st[pin] = st[pin] || {});
        const { is, nVt } = diodeParams(s, E.p[vfk], 2.0, 0.02);
        stampDiode(c, a, k, is, nVt, s, 'vd');
      }
    },
    commit(c) {
      const o = E.out;
      if (E.burnt) { o.r = o.g = o.b = 0; return; }
      let worst = 0;
      for (const [pin, vfk] of ch) {
        const [a, k] = ends(pin);
        const s = st[pin] || (st[pin] = {});
        const { is, nVt } = diodeParams(s, E.p[vfk], 2.0, 0.02);
        const i = Math.max(0, diodeCurrent(c.v(a), c.v(k), is, nVt));
        o[pin.toLowerCase()] = Math.min(1.6, i / 0.02);
        o['i' + pin] = i;
        worst = Math.max(worst, i);
      }
      ledDamage(E, worst, E.p.Imax, c.dt);
    },
  };
};

// ------------------------------------------------------------------ transistors
function expl(x) { return Math.exp(Math.min(x, 80)); }

MODELS.bjt = (E, N) => {
  const C = N.C, B = N.B, Em = N.E, st = E.dyn;
  const IS = 1e-14, nVt = VT, vc = vcrit(nVt, IS), BR = 5;
  return {
    nodes: [C, B, Em], nonlinear: true,
    stamp(c) {
      if (E.burnt) { c.g(C, Em, OPEN); return; }
      const p = E.p.pol, bf = E.p.beta;
      let vbe = p * (c.v(B) - c.v(Em));
      let vbc = p * (c.v(B) - c.v(C));
      let l;
      [vbe, l] = pnjlim(vbe, st.vbe ?? 0, nVt, vc); if (l) c.noncon = true;
      [vbc, l] = pnjlim(vbc, st.vbc ?? 0, nVt, vc); if (l) c.noncon = true;
      st.vbe = vbe; st.vbc = vbc;
      const ef = expl(vbe / nVt), er = expl(vbc / nVt);
      const If = IS * (ef - 1), Ir = IS * (er - 1);
      const gf = (IS / nVt) * ef, gr = (IS / nVt) * er;
      const Ic = If - Ir - Ir / BR, Ib = If / bf + Ir / BR;
      const gcbe = gf, gcbc = -gr * (1 + 1 / BR);
      const gbbe = gf / bf, gbbc = gr / BR;
      const Kc = p * (Ic - gcbe * vbe - gcbc * vbc);
      const Kb = p * (Ib - gbbe * vbe - gbbc * vbc);
      // node order [C, B, E]; coefficients for [Vc, Vb, Ve]
      const rc = [-gcbc, gcbe + gcbc, -gcbe];
      const rb = [-gbbc, gbbe + gbbc, -gbbe];
      const re = [-(rc[0] + rb[0]), -(rc[1] + rb[1]), -(rc[2] + rb[2])];
      c.jac([C, B, Em], [rc, rb, re], [Kc, Kb, -(Kc + Kb)]);
      c.g(B, Em, GMIN); c.g(B, C, GMIN); c.g(C, Em, GMIN);
    },
    commit(c) {
      if (E.burnt) return;
      const p = E.p.pol, bf = E.p.beta;
      const vbe = p * (c.v(B) - c.v(Em)), vbc = p * (c.v(B) - c.v(C));
      const If = IS * (expl(vbe / nVt) - 1), Ir = IS * (expl(vbc / nVt) - 1);
      const Ic = If - Ir - Ir / BR, Ib = If / bf + Ir / BR;
      const o = E.out;
      o.ic = Ic; o.ib = Ib; o.vbe = vbe; o.vce = p * (c.v(C) - c.v(Em));
      o.p = Math.abs(o.vce * Ic) + Math.abs(vbe * Ib);
      E.damage(Math.max(o.p / E.p.Pmax, Math.abs(Ic) / E.p.Imax), 15, c.dt);
      if (o.vce > 90 || vbe < -9) E.burn('breakdown'); // collector or emitter-base breakdown
    },
  };
};

function mosEval(vgs, vds, vth, K, lam) {
  const vov = vgs - vth;
  if (vov <= 0) return { id: 0, gm: 0, gds: 0 };
  const m = 1 + lam * vds;
  if (vds < vov) {
    const base = vov * vds - (vds * vds) / 2;
    return { id: K * base * m, gm: K * vds * m, gds: K * (vov - vds) * m + K * base * lam };
  }
  const half = 0.5 * K * vov * vov;
  return { id: half * m, gm: K * vov * m, gds: half * lam };
}
function mosFull(vgs, vds, vth, K, lam) {
  if (vds >= 0) return mosEval(vgs, vds, vth, K, lam);
  const r = mosEval(vgs - vds, -vds, vth, K, lam);
  return { id: -r.id, gm: -r.gm, gds: r.gm + r.gds };
}

MODELS.mosfet = (E, N) => {
  const D = N.D, G = N.G, S = N.S, st = E.dyn;
  const bodyIs = isFromVf(0.9, 1.8, 1);
  return {
    nodes: [D, G, S], nonlinear: true,
    stamp(c) {
      if (E.burnt) { c.g(D, S, OPEN); return; }
      const p = E.p.pol;
      const vgs0 = p * (c.v(G) - c.v(S)), vds0 = p * (c.v(D) - c.v(S));
      const { id, gm, gds } = mosFull(vgs0, vds0, E.p.Vth, E.p.Kp, 0.02);
      const KD = p * (id - gm * vgs0 - gds * vds0);
      c.jac([D, G, S], [[gds, gm, -gm - gds], [0, 0, 0], [-gds, -gm, gm + gds]], [KD, 0, -KD]);
      c.g(G, S, GMIN); c.g(D, S, GMIN);
      // body diode
      if (p > 0) stampDiode(c, S, D, bodyIs, 1.8 * VT, st, 'bd');
      else stampDiode(c, D, S, bodyIs, 1.8 * VT, st, 'bd');
    },
    commit(c) {
      if (E.burnt) return;
      const p = E.p.pol;
      const vgs = p * (c.v(G) - c.v(S)), vds = p * (c.v(D) - c.v(S));
      const { id } = mosFull(vgs, vds, E.p.Vth, E.p.Kp, 0.02);
      const o = E.out;
      o.id = id; o.vgs = vgs; o.vds = vds; o.p = Math.abs(vds * id);
      E.damage(o.p / E.p.Pmax, 8, c.dt);
      if (Math.abs(vgs) > 20) E.burn('gate-oxide');
      else if (Math.abs(vds) > E.p.Vdsmax * 1.05 && vds * p > 0) E.burn('breakdown');
    },
  };
};

// ------------------------------------------------------------------ switches
const RON = 1 / 0.02;
function sw(c, a, b, closed) { if (closed) c.g(a, b, RON); }

MODELS.sw_spst = (E, N) => ({
  nodes: [N.A, N.B],
  stamp(c) { c.g(N.A, N.B, OPEN); sw(c, N.A, N.B, !!E.p.on); },
});
MODELS.sw_spdt = (E, N) => ({
  nodes: [N.A, N.COM, N.B],
  stamp(c) {
    c.g(N.COM, N.A, OPEN); c.g(N.COM, N.B, OPEN);
    sw(c, N.COM, +E.p.pos === 0 ? N.A : N.B, true);
  },
});
MODELS.sw_dpdt = (E, N) => ({
  nodes: [N['1A'], N['1B'], N['1C'], N['2A'], N['2B'], N['2C']],
  stamp(c) {
    for (const k of ['1', '2']) {
      c.g(N[k + 'C'], N[k + 'A'], OPEN); c.g(N[k + 'C'], N[k + 'B'], OPEN);
      sw(c, N[k + 'C'], +E.p.pos === 0 ? N[k + 'A'] : N[k + 'B'], true);
    }
  },
});
MODELS.pushbutton = (E, N) => ({
  nodes: [N['1a'], N['1b'], N['2a'], N['2b']],
  stamp(c) {
    sw(c, N['1a'], N['1b'], true);
    sw(c, N['2a'], N['2b'], true);
    c.g(N['1a'], N['2a'], OPEN);
    sw(c, N['1a'], N['2a'], !!E.input.pressed);
  },
});
MODELS.dipsw = (E, N) => ({
  nodes: Array.from({ length: 16 }, (_, i) => N[String(i + 1)]),
  stamp(c) {
    const s = E.p.sw || [];
    for (let i = 0; i < 8; i++) { c.g(N[String(i + 1)], N[String(16 - i)], OPEN); sw(c, N[String(i + 1)], N[String(16 - i)], !!s[i]); }
  },
});
MODELS.keypad = (E, N) => ({
  nodes: ['R1', 'R2', 'R3', 'R4', 'C1', 'C2', 'C3', 'C4'].map((k) => N[k]),
  stamp(c) {
    const keys = E.input.keys;
    for (let r = 0; r < 4; r++) for (let q = 0; q < 4; q++) {
      const a = N['R' + (r + 1)], b = N['C' + (q + 1)];
      c.g(a, b, OPEN);
      if (keys && keys.has(r * 4 + q)) sw(c, a, b, true);
    }
  },
});

// ------------------------------------------------------------------ ICs
MODELS.ne555 = (E, N) => {
  const gnd = N.GND, trig = N.TRIG, out = N.OUT, rst = N.RESET, ctl = N.CTRL, thr = N.THR, dis = N.DIS, vcc = N.VCC;
  const st = E.dyn;
  st.q = st.q || 0;
  return {
    nodes: [gnd, trig, out, rst, ctl, thr, dis, vcc], dynamic: true, hasState: true,
    pre(c) {
      if (E.burnt) return;
      const cm = E.p.cmos;
      const vc = c.v(vcc) - c.v(gnd);
      st.vcc = vc;
      if (vc > (cm ? 16.5 : 18.5) || vc < -1) { E.burn('supply'); return; }
      st.pw = vc > (cm ? 2 : 4.5);
      if (!st.pw) { st.q = 0; return; }
      const vctl = c.v(ctl) - c.v(gnd), vthr = c.v(thr) - c.v(gnd), vtrig = c.v(trig) - c.v(gnd);
      if (vtrig < vctl / 2) st.q = 1;
      else if (vthr > vctl) st.q = 0;
      if (c.v(rst) - c.v(gnd) < 0.7) st.q = 0;
    },
    stamp(c) {
      if (E.burnt) { c.g(vcc, gnd, OPEN); return; }
      const cm = E.p.cmos, R = cm ? 100e3 : 5e3;
      c.g(vcc, ctl, 1 / R);
      c.g(ctl, gnd, 1 / (2 * R));
      c.g(rst, vcc, 1e-5);
      c.g(vcc, gnd, cm ? 1 / 50e3 : 1 / 1.5e3);
      if (!st.pw) return;
      const hi = Math.max(0, st.vcc - (cm ? 0.1 : 1.7));
      drive(c, out, gnd, st.q ? hi : cm ? 0.02 : 0.1, st.q ? (cm ? 30 : 60) : cm ? 30 : 15);
      if (!st.q) c.g(dis, gnd, 1 / 15);
    },
    commit(c) {
      if (E.burnt) return;
      const o = E.out;
      o.q = st.pw ? st.q : 0; o.pw = !!st.pw;
      o.vout = c.v(out) - c.v(gnd);
      const iout = Math.abs(o.vout - (st.q ? Math.max(0, st.vcc - 1.7) : 0.1)) / 60;
      if (st.pw && iout > 0.25) E.damage(iout / 0.25, 30, c.dt);
    },
  };
};

MODELS.logic = (E, N) => {
  const gates = logicGates(E.p.code);
  const gnd = N.GND, vcc = N.VCC, st = E.dyn;
  st.y = st.y || gates.map(() => 0);
  const FN = {
    and: (a) => a.every(Boolean), or: (a) => a.some(Boolean), not: (a) => !a[0],
    nand: (a) => !a.every(Boolean), nor: (a) => !a.some(Boolean), xor: (a) => a.filter(Boolean).length % 2 === 1,
  };
  const nodes = Object.values(N);
  return {
    nodes, hasState: true,
    pre(c) {
      if (E.burnt) return;
      const cm = E.p.cmos;
      const vc = c.v(vcc) - c.v(gnd);
      st.vcc = vc;
      if (vc > (cm ? 20 : 7.5) || vc < -1) { E.burn('supply'); return; }
      st.pw = vc > (cm ? 2 : 4.2);
      if (!st.pw) return;
      const thr = cm ? vc / 2 : 1.4;
      gates.forEach((g, i) => {
        const ins = g.ins.map((p) => c.v(N[p]) - c.v(gnd) > thr);
        st.y[i] = FN[g.fn](ins) ? 1 : 0;
      });
    },
    stamp(c) {
      if (E.burnt) { c.g(vcc, gnd, OPEN); return; }
      c.g(vcc, gnd, 1e-9);
      if (!st.pw) return;
      const cm = E.p.cmos;
      if (!cm) c.g(vcc, gnd, 1 / 2500);
      gates.forEach((g, i) => {
        if (!cm) for (const p of g.ins) c.g(N[p], vcc, 1 / 20e3); // TTL inputs float high
        else for (const p of g.ins) c.g(N[p], gnd, 1e-9);
        const hi = cm ? st.vcc : Math.max(0, st.vcc - 1.5);
        drive(c, N[g.out], gnd, st.y[i] ? hi : cm ? 0 : 0.2, st.y[i] ? (cm ? 50 : 80) : cm ? 50 : 30);
      });
    },
    commit(c) {
      if (E.burnt) return;
      const cm = E.p.cmos;
      E.out.y = st.y.slice(); E.out.pw = !!st.pw;
      if (!st.pw) return;
      let worst = 0;
      gates.forEach((g, i) => {
        const vt = st.y[i] ? (cm ? st.vcc : st.vcc - 1.5) : cm ? 0 : 0.2;
        const r = st.y[i] ? (cm ? 50 : 80) : cm ? 50 : 30;
        worst = Math.max(worst, Math.abs(vt - (c.v(N[g.out]) - c.v(gnd))) / r);
      });
      E.out.iout = worst;
      if (worst > 0.1) E.damage(worst / 0.1, 25, c.dt);
    },
  };
};

const OPAMP_SPEC = {
  lm358: { A: 1e5, hi: 1.5, lo: 0.05, rout: 60, rq: 12e3, vmax: 32 },
  ua741: { A: 2e5, hi: 2.0, lo: 2.0, rout: 75, rq: 18e3, vmax: 44 },
};
MODELS.opamp = (E, N) => {
  const spec = OPAMP_SPEC[E.p.kind];
  const amps = E.p.kind === 'lm358'
    ? [{ p: N['IN1+'], n: N['IN1-'], o: N.OUT1 }, { p: N['IN2+'], n: N['IN2-'], o: N.OUT2 }]
    : [{ p: N['IN+'], n: N['IN-'], o: N.OUT }];
  const vp = N['V+'], vm = N['V-'], st = E.dyn;
  const G = 1 / spec.rout;
  return {
    nodes: Object.values(N), nonlinear: true,
    stamp(c) {
      if (E.burnt) { c.g(vp, vm, OPEN); return; }
      c.g(vp, vm, 1 / spec.rq);
      const vmax = c.v(vp) - spec.hi, vmin = c.v(vm) + spec.lo;
      const half = (vmax - vmin) / 2;
      if (half < 0.15) return; // not powered
      const mid = (vmax + vmin) / 2;
      let src = 0, snk = 0;
      for (const a of amps) {
        const vd0 = c.v(a.p) - c.v(a.n);
        const z = clamp((spec.A * vd0) / half, -30, 30);
        const th = Math.tanh(z);
        const T0 = mid + half * th;
        const dT = spec.A * (1 - th * th);
        const gd = G * dT;
        const K = G * (-T0 + dT * vd0);
        c.jac([a.o, a.p, a.n], [[G, -gd, gd], [0, 0, 0], [0, 0, 0]], [K, 0, 0]);
        const io = G * (c.v(a.o) - T0);
        if (io < 0) src += -io; else snk += io;
      }
      c.i(vp, -src); // current sourced into the outputs comes from V+
      c.i(vm, snk);  // current sunk by the outputs leaves through V-
    },
    commit(c) {
      if (E.burnt) return;
      const sup = c.v(vp) - c.v(vm);
      if (sup > spec.vmax || sup < -1) { E.burn('supply'); return; }
      const vmax = c.v(vp) - spec.hi, vmin = c.v(vm) + spec.lo;
      const half = (vmax - vmin) / 2, mid = (vmax + vmin) / 2;
      let worst = 0;
      E.out.v = amps.map((a) => c.v(a.o) - c.v(vm));
      E.out.vd = amps.map((a) => c.v(a.p) - c.v(a.n));
      if (half > 0.15) {
        for (const a of amps) {
          const T = mid + half * Math.tanh(clamp((spec.A * (c.v(a.p) - c.v(a.n))) / half, -30, 30));
          worst = Math.max(worst, Math.abs(G * (c.v(a.o) - T)));
        }
      }
      E.out.iout = worst;
      if (worst > 0.06) E.damage(worst / 0.06, 8, c.dt);
    },
  };
};

MODELS.regulator = (E, N) => {
  const IN = N.IN, OUT = N.OUT, GN = E.p.adj ? N.ADJ : N.GND, st = E.dyn;
  const GO = 20;
  const target = (vin, vg) => {
    const a = vg + E.p.vset, b = vin - E.p.drop;
    let T, dTin, dTg;
    if (b >= a) { T = a; dTin = 0; dTg = 1; }
    else if (b > vg) { T = b; dTin = 1; dTg = 0; }
    else { T = vg; dTin = 0; dTg = 1; }
    return { T, dTin, dTg };
  };
  return {
    nodes: [IN, GN, OUT],
    nonlinear: true,
    settle(c) {
      if (E.burnt) return false;
      const { T } = target(c.v(IN), c.v(GN));
      const i0 = (T - c.v(OUT)) * GO;
      const next = st.lim ? i0 >= E.p.Imax : i0 > E.p.Imax;
      const ch = next !== !!st.lim;
      st.lim = next;
      return ch;
    },
    stamp(c) {
      if (E.burnt) { c.g(IN, OUT, OPEN); return; }
      const vin = c.v(IN), vg = c.v(GN), vo = c.v(OUT);
      const { T, dTin, dTg } = target(vin, vg);
      let G = T - vo > 0 ? GO : 1e-5;
      let I0 = G * (T - vo);
      let dIin = G * dTin, dIg = G * dTg, dIo = -G;
      if (st.lim) { I0 = E.p.Imax; dIin = dIg = dIo = 0; }
      const Ks = I0 - (dIin * vin + dIg * vg + dIo * vo);
      const iq = E.p.Iq * clamp((vin - vg) / 2, 0, 1);
      // rows: [OUT, IN, GND]; coefficients for [Vout, Vin, Vg]
      const rOut = [-dIo, -dIin, -dIg];
      const rIn = [dIo, dIin, dIg];
      c.jac([OUT, IN, GN], [rOut, rIn, [0, 0, 0]], [-Ks, Ks + iq, -iq]);
      // reverse-biased pass element: tiny leak OUT->IN
      c.g(OUT, IN, 1e-9);
    },
    commit(c) {
      if (E.burnt) return;
      const vin = c.v(IN), vg = c.v(GN), vo = c.v(OUT);
      const { T } = target(vin, vg);
      const i = Math.max(0, Math.min(E.p.Imax, (T - vo) * GO));
      const o = E.out;
      o.vin = vin - vg; o.vout = vo - vg; o.i = i;
      o.p = Math.max(0, (vin - vo) * i);
      if (vin - vg > 36 || vin - vg < -1) { E.burn('overvoltage'); return; }
      E.damage(o.p / 4, 0.4, c.dt); // TO-220 without heatsink
    },
  };
};

// ------------------------------------------------------------------ microcontroller boards
MODELS.mcu = (E, N) => {
  const spec = E.def.mcu;
  const gnd = N[spec.gnd[0]], st = E.dyn;
  const ioNodes = spec.io.map((io) => N[io.name]);
  const ensure = () => {
    const code = effectiveCode(E.p);
    if (!st.rt || st.code !== code) {
      st.code = code;
      st.rt = new McuRuntime(spec, code);
      E.engine.runtimes.set(E.id, st.rt);
    }
    return st.rt;
  };
  ensure();
  return {
    nodes: [...Object.values(N)], hasState: true,
    pre(c) {
      if (E.burnt) return;
      const rt = ensure();
      rt.advance(c.t * 1000, (name) => c.v(N[name]) - c.v(gnd));
      // protection: overvoltage on a pin
      for (const io of spec.io) {
        const v = c.v(N[io.name]) - c.v(gnd);
        if (v > spec.vdd + 1.0 || v < -1.0) E.damage(Math.abs(v - spec.vdd) / 1.5 + 1, 20, c.dt);
      }
    },
    stamp(c) {
      if (E.burnt) { for (const n of ioNodes) c.g(n, gnd, OPEN); return; }
      const rt = st.rt;
      for (const g of spec.gnd.slice(1)) c.g(gnd, N[g], 1000);
      for (const s of spec.supply) drive(c, N[s.pin], gnd, s.v, s.r);
      for (const io of spec.io) {
        const s = rt.pins[io.name], n = N[io.name];
        if (s.mode === OUTPUT) {
          const lvl = s.pwm != null ? s.pwm : s.out;
          drive(c, n, gnd, lvl * spec.vdd, spec.vdd > 4 ? 25 : 40);
        } else if (s.pullup) drive(c, n, gnd, spec.vdd, 35e3);
        else c.g(n, gnd, 1e-8);
      }
    },
    commit(c) {
      if (E.burnt) return;
      const rt = st.rt, o = E.out;
      o.error = rt.error; o.log = rt.log; o.pins = rt.pins;
      let worst = 0;
      for (const io of spec.io) {
        const s = rt.pins[io.name];
        if (s.mode !== OUTPUT) continue;
        const lvl = s.pwm != null ? s.pwm : s.out;
        const i = Math.abs((lvl * spec.vdd - (c.v(N[io.name]) - c.v(gnd))) / (spec.vdd > 4 ? 25 : 40));
        worst = Math.max(worst, i);
      }
      o.imax = worst;
      o.led = rt.pins[spec.vdd > 4 ? 'D13' : 'G2'] ? (rt.pins[spec.vdd > 4 ? 'D13' : 'G2'].pwm ?? rt.pins[spec.vdd > 4 ? 'D13' : 'G2'].out) : 0;
      if (worst > 0.04) E.damage(worst / 0.04, 6, c.dt);
      for (const s of spec.supply) {
        const i = Math.abs((s.v - (c.v(N[s.pin]) - c.v(gnd))) / s.r);
        if (i > 0.6) E.damage(i / 0.6, 10, c.dt);
      }
    },
  };
};

// ------------------------------------------------------------------ instruments
MODELS.multimeter = (E, N) => {
  const r = N.red, b = N.black, st = E.dyn;
  const attached = () => E.probeOn('red') && E.probeOn('black');
  return {
    nodes: [r, b],
    stamp(c) {
      if (E.burnt || !attached()) return;
      const mode = E.p.mode;
      if (mode === 'A') c.g(r, b, 1 / 0.05);
      else if (mode === 'Ohm') drive(c, r, b, 0.5, 5000);
      else c.g(r, b, 1e-7);
    },
    commit(c) {
      const o = E.out, mode = E.p.mode;
      o.mode = mode;
      if (E.burnt) { o.text = 'FUSE'; o.val = NaN; return; }
      const same = E.engine.island[r] === E.engine.island[b];
      if (!attached() || !same) { o.val = NaN; o.text = '----'; o.ok = false; return; }
      o.ok = true;
      const v = c.v(r) - c.v(b);
      if (mode === 'A') {
        const i = v / 0.05;
        o.val = i;
        if (Math.abs(i) > 10) E.burn('fuse', { smoke: false });
      } else if (mode === 'Ohm') {
        o.val = v >= 0.495 ? Infinity : v <= 0 ? 0 : (5000 * v) / (0.5 - v);
      } else if (mode === 'Vac') {
        st.ms = (st.ms || 0) + (v * v - (st.ms || 0)) * Math.min(1, c.dt / 0.1);
        o.val = Math.sqrt(st.ms);
      } else o.val = v;
    },
  };
};

const SCOPE_N = 16384;
MODELS.scope = (E, N) => {
  const ch1 = N.ch1, ch2 = N.ch2, g = N.gnd, st = E.dyn;
  if (!st.buf) st.buf = { t: new Float64Array(SCOPE_N), a: new Float32Array(SCOPE_N), b: new Float32Array(SCOPE_N), n: 0 };
  const buf = st.buf;
  return {
    nodes: [ch1, ch2, g],
    stamp(c) {
      const gOn = E.probeOn('gnd');
      if (gOn) for (const ch of [[ch1, 'ch1'], [ch2, 'ch2']]) if (E.probeOn(ch[1])) c.g(ch[0], g, 1e-6);
    },
    commit(c) {
      const ref = E.probeOn('gnd') ? c.v(g) : 0;
      const o = E.out;
      o.on1 = E.probeOn('ch1'); o.on2 = E.probeOn('ch2');
      o.v1 = o.on1 ? c.v(ch1) - ref : 0;
      o.v2 = o.on2 ? c.v(ch2) - ref : 0;
      const i = buf.n % SCOPE_N;
      buf.t[i] = c.t; buf.a[i] = o.v1; buf.b[i] = o.v2;
      buf.n++;
    },
  };
};
