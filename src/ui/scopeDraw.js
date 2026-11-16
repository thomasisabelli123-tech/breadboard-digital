// Oscilloscope screen renderer shared by the 3D model and the instrument panel.
import { fmt } from '../data/format.js';

export const SCOPE_COLORS = { ch1: '#ffd84a', ch2: '#4de3ff' };

export function drawScope(ctx, w, h, buf, p, out) {
  ctx.fillStyle = '#06130c';
  ctx.fillRect(0, 0, w, h);
  const cols = 10, rows = 8;
  ctx.strokeStyle = 'rgba(80,200,120,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= cols; i++) { const x = Math.round((i * w) / cols) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
  for (let j = 0; j <= rows; j++) { const y = Math.round((j * h) / rows) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(80,200,120,0.45)';
  ctx.beginPath();
  ctx.moveTo(0, h / 2 + 0.5); ctx.lineTo(w, h / 2 + 0.5);
  ctx.moveTo(w / 2 + 0.5, 0); ctx.lineTo(w / 2 + 0.5, h);
  ctx.stroke();

  if (buf && buf.n > 2) {
    const N = buf.t.length;
    const n = buf.n;
    const first = Math.max(0, n - N);
    const last = n - 1;
    const W = p.tdiv * cols;
    const tEnd = buf.t[last % N];
    // find a rising trigger on CH1 early enough that a full window follows it
    let start = -1;
    const tMin = tEnd - 3 * W;
    for (let i = last; i > first; i--) {
      const t1 = buf.t[i % N];
      if (t1 < tMin) break;
      if (t1 > tEnd - W) continue;
      const a0 = buf.a[(i - 1) % N], a1 = buf.a[i % N];
      if (a0 < p.trig && a1 >= p.trig) { start = i; break; }
    }
    let t0;
    let i0;
    if (start >= 0) { t0 = buf.t[start % N]; i0 = start; }
    else {
      t0 = tEnd - W;
      i0 = last;
      while (i0 > first && buf.t[(i0 - 1) % N] >= t0) i0--;
    }
    const draw = (arr, vdiv, off, color) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      let began = false;
      for (let i = i0; i <= last; i++) {
        const t = buf.t[i % N];
        if (t - t0 > W) break;
        const x = ((t - t0) / W) * w;
        const y = h / 2 - ((arr[i % N] / vdiv + off) * h) / rows;
        if (!began) { ctx.moveTo(x, y); began = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    if (out && out.on1) draw(buf.a, p.vdiv1, p.off1, SCOPE_COLORS.ch1);
    if (out && out.on2 && p.ch2on) draw(buf.b, p.vdiv2, p.off2, SCOPE_COLORS.ch2);
  }

  ctx.font = `${Math.max(10, Math.round(h / 22))}px monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = SCOPE_COLORS.ch1;
  ctx.fillText(`CH1 ${fmt(p.vdiv1, 'V')}/div`, 6, 4);
  ctx.fillStyle = SCOPE_COLORS.ch2;
  ctx.fillText(`CH2 ${fmt(p.vdiv2, 'V')}/div`, 6, 4 + Math.round(h / 20));
  ctx.fillStyle = '#9fe8b4';
  ctx.textAlign = 'right';
  ctx.fillText(`${fmt(p.tdiv, 's')}/div`, w - 6, 4);
  ctx.textAlign = 'left';
}
