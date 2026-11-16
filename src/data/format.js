// Formatting helpers + resistor colour code.
import { UNITS } from './catalog.js';

const PREFIX = [
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
];

export function fmt(value, unit = '', digits = 3) {
  if (value === undefined || value === null || Number.isNaN(value)) return '----';
  if (!Number.isFinite(value)) return 'OL';
  const a = Math.abs(value);
  if (a < 1e-15) return `0 ${unit}`;
  for (const [f, p] of PREFIX) {
    if (a >= f * 0.9995) {
      const v = value / f;
      const s = Number(v.toPrecision(digits)).toString();
      return `${s} ${p}${unit}`;
    }
  }
  return `${value.toExponential(2)} ${unit}`;
}

// Choose the best unit of a UNITS table for display in the inspector.
export function bestUnit(kind, value) {
  const list = UNITS[kind];
  let best = list[0];
  for (const u of list) if (Math.abs(value) >= u[1] * 0.9999) best = u;
  return best;
}

const DIGIT = ['#111111', '#7a3b0c', '#e02020', '#ff8c00', '#ffe000', '#1aa31a', '#1f4fff', '#8a2be2', '#808080', '#f4f4f4'];
const GOLD = '#d4af37';
const SILVER = '#c0c0c0';
const TOL = { 1: DIGIT[1], 2: DIGIT[2], 5: GOLD, 10: SILVER };

// 4-band resistor code: [digit1, digit2, multiplier, tolerance]
export function resistorBands(ohms, tol = 5) {
  if (!(ohms > 0)) return [DIGIT[0], DIGIT[0], DIGIT[0], TOL[tol] || GOLD];
  let e = Math.floor(Math.log10(ohms)) - 1;
  let m = Math.round(ohms / Math.pow(10, e));
  if (m >= 100) { m = Math.round(m / 10); e += 1; }
  e = Math.max(-2, Math.min(9, e));
  const d1 = Math.floor(m / 10) % 10, d2 = m % 10;
  const mult = e === -1 ? GOLD : e === -2 ? SILVER : DIGIT[e];
  return [DIGIT[d1], DIGIT[d2], mult, TOL[tol] || GOLD];
}

export function parseEng(text) {
  // accepts "4.7k", "100n", "2M2" style is not supported on purpose
  const m = /^\s*([0-9.eE+-]+)\s*([pnuµmkKMG]?)/.exec(String(text));
  if (!m) return NaN;
  const mul = { p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, k: 1e3, K: 1e3, M: 1e6, G: 1e9, '': 1 }[m[2]];
  return parseFloat(m[1]) * mul;
}
