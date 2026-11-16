import React, { useEffect, useRef } from 'react';
import { BOARD_TYPES, makeLayout } from '../engine/geometry.js';
import { useT } from '../i18n.js';

// Small top-view drawing of a board model (holes + coloured rails).
export function BoardPreview({ id, width = 220 }) {
  const ref = useRef(null);
  useEffect(() => {
    const lay = makeLayout(id);
    const c = ref.current;
    const k = width / lay.w;
    c.width = Math.round(lay.w * k * 2); c.height = Math.round(lay.h * k * 2);
    const g = c.getContext('2d');
    g.scale(2 * k, 2 * k);
    const px = (x) => x - lay.board.x0, py = (y) => y - lay.board.y0;
    g.fillStyle = '#ece8dc'; g.fillRect(0, 0, lay.w, lay.h);
    g.fillStyle = '#cfc9b8'; g.fillRect(0.4, py(lay.bodyY + 5), lay.w - 0.8, 1.2);
    for (let i = 0; i + 1 < lay.rails.length; i += 2) {
      const a = lay.rails[i], b = lay.rails[i + 1];
      const x0 = lay.spec.railX0 - 0.7, x1 = lay.railX1 + 0.7;
      for (const [r, y] of [[a, a.y - 0.65], [b, b.y + 0.65]]) { g.fillStyle = r.pol === '+' ? '#d32f2f' : '#1e5bd6'; g.fillRect(px(x0), py(y) - 0.12, x1 - x0, 0.24); }
    }
    g.fillStyle = '#23232b';
    for (const h of lay.holes) g.fillRect(px(h.x) - 0.28, py(h.y) - 0.28, 0.56, 0.56);
  }, [id, width]);
  return <canvas ref={ref} style={{ width, height: 'auto' }} className="rounded-md shadow-md ring-1 ring-black/30" />;
}

export default function BoardPicker({ value, onChange }) {
  const t = useT();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {BOARD_TYPES.map((b) => (
        <button
          key={b.id} type="button" onClick={() => onChange(b.id)}
          className={`group flex flex-col gap-2 rounded-xl border p-3 text-left transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lg ${value === b.id ? 'border-accent bg-accent-dim/25 ring-1 ring-accent/60' : 'border-bg-3 bg-bg-2'}`}
        >
          <div className="grid min-h-[84px] place-items-center rounded-lg bg-bg-0 p-2"><BoardPreview id={b.id} width={b.id === 'mini' ? 90 : b.id === 'half' ? 150 : 210} /></div>
          <div>
            <div className="text-sm font-semibold text-white">{t.L(b.name)}</div>
            <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{t.L(b.desc)}</div>
            <div className="mt-1 font-mono text-[10.5px] text-accent">{b.points} {t('board.points')}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
