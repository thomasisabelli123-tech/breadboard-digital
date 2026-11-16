// Shared helpers for device models.
export const VT = 0.025852; // thermal voltage at 300 K
export const GMIN = 1e-12;

// Saturation current so that I(vf) = iref for an ideal diode with emission coeff n.
export function isFromVf(vf, n = 1.8, iref = 0.01) {
  return iref / Math.exp(vf / (n * VT));
}

export function vcrit(nVt, is) {
  return nVt * Math.log(nVt / (Math.SQRT2 * is));
}

// SPICE-style junction voltage limiting. Returns [limitedVoltage, wasLimited].
export function pnjlim(vnew, vold, nVt, vc) {
  if (vnew > vc && Math.abs(vnew - vold) > 2 * nVt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / nVt;
      vnew = arg > 0 ? vold + nVt * Math.log(arg) : vc;
    } else {
      vnew = nVt * Math.log(vnew / nVt);
    }
    return [vnew, true];
  }
  return [vnew, false];
}

// Exponential junction current and conductance (guarded against overflow).
export function junction(v, is, nVt) {
  const e = Math.exp(Math.min(v / nVt, 80));
  return { i: is * (e - 1), g: (is / nVt) * e };
}

// Stamp the linearised diode i(v) = is*(exp(v/nVt)-1) between anode a and cathode k.
// Uses/updates el.st[key] as the limited junction voltage. Returns current at linearisation point.
export function stampDiode(c, a, k, is, nVt, st, key) {
  const vd = c.v(a) - c.v(k);
  const [vl, lim] = pnjlim(vd, st[key] ?? 0, nVt, vcrit(nVt, is));
  if (lim) c.noncon = true;
  st[key] = vl;
  const { i, g } = junction(vl, is, nVt);
  const gd = g + GMIN;
  const ieq = i + GMIN * vl - gd * vl;
  c.g(a, k, gd);
  c.i(a, -ieq);
  c.i(k, ieq);
  return i + GMIN * vl;
}

// Real diode current at the actual (non-limited) solution.
export function diodeCurrent(va, vk, is, nVt) {
  return junction(va - vk, is, nVt).i;
}

export function clamp(x, lo, hi) {
  return x < lo ? lo : x > hi ? hi : x;
}
