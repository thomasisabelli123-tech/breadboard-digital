// Dense linear solver (Gaussian elimination with partial pivoting).
// Solves A x = b in place on copies; returns x (Float64Array) or null if singular.
export function solveLinear(A, b, n) {
  const M = A; // caller passes a scratch matrix (array of Float64Array); it is destroyed
  const x = Float64Array.from(b);
  for (let k = 0; k < n; k++) {
    let p = k;
    let max = Math.abs(M[k][k]);
    for (let i = k + 1; i < n; i++) {
      const a = Math.abs(M[i][k]);
      if (a > max) { max = a; p = i; }
    }
    if (max < 1e-30) return null;
    if (p !== k) {
      const t = M[p]; M[p] = M[k]; M[k] = t;
      const tb = x[p]; x[p] = x[k]; x[k] = tb;
    }
    const rowK = M[k];
    const piv = rowK[k];
    for (let i = k + 1; i < n; i++) {
      const rowI = M[i];
      const f = rowI[k] / piv;
      if (f === 0) continue;
      for (let j = k; j < n; j++) rowI[j] -= f * rowK[j];
      x[i] -= f * x[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    const row = M[i];
    for (let j = i + 1; j < n; j++) s -= row[j] * x[j];
    x[i] = s / row[i];
  }
  return x;
}
