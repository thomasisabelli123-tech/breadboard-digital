import React, { useEffect, useRef } from 'react';
import { useStore } from '../store.js';
import { engine } from '../sim.js';
import { useT } from '../i18n.js';
import { fmt } from '../data/format.js';
import { drawScope, SCOPE_COLORS } from './scopeDraw.js';

const TDIV = [1e-6, 2e-6, 5e-6, 1e-5, 2e-5, 5e-5, 1e-4, 2e-4, 5e-4, 1e-3, 2e-3, 5e-3, 1e-2, 2e-2, 5e-2, 0.1, 0.2, 0.5, 1];
const VDIV = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];

export function ScopeControls({ part }) {
  const t = useT();
  const update = useStore((s) => s.updateParams);
  const p = part.params;
  const sel = (key, list, unit, label, color) => (
    <label className="block text-[10.5px] uppercase tracking-wide text-slate-400">
      <span style={{ color }}>{label}</span>
      <select className="field mt-1" value={p[key]} onChange={(e) => update(part.id, { [key]: parseFloat(e.target.value) })}>
        {list.map((v) => <option key={v} value={v}>{fmt(v, unit)}/div</option>)}
      </select>
    </label>
  );
  return (
    <div className="mt-2 grid grid-cols-2 gap-2">
      {sel('tdiv', TDIV, 's', t('scope.tdiv'))}
      <label className="block text-[10.5px] uppercase tracking-wide text-slate-400">
        {t('scope.trig')} ({fmt(p.trig, 'V')})
        <input type="range" className="mt-2 w-full" min="-10" max="10" step="0.1" value={p.trig} onChange={(e) => update(part.id, { trig: parseFloat(e.target.value) })} />
      </label>
      {sel('vdiv1', VDIV, 'V', t('scope.v1'), SCOPE_COLORS.ch1)}
      {sel('vdiv2', VDIV, 'V', t('scope.v2'), SCOPE_COLORS.ch2)}
      <label className="block text-[10.5px] uppercase tracking-wide text-slate-400">
        <span style={{ color: SCOPE_COLORS.ch1 }}>CH1</span> offset
        <input type="range" className="mt-2 w-full" min="-4" max="4" step="0.1" value={p.off1} onChange={(e) => update(part.id, { off1: parseFloat(e.target.value) })} />
      </label>
      <label className="block text-[10.5px] uppercase tracking-wide text-slate-400">
        <span style={{ color: SCOPE_COLORS.ch2 }}>CH2</span> offset
        <input type="range" className="mt-2 w-full" min="-4" max="4" step="0.1" value={p.off2} onChange={(e) => update(part.id, { off2: parseFloat(e.target.value) })} />
      </label>
      <label className="col-span-2 flex items-center gap-2 text-xs text-slate-300">
        <input type="checkbox" checked={p.ch2on} onChange={(e) => update(part.id, { ch2on: e.target.checked })} /> {t('scope.ch2')}
      </label>
    </div>
  );
}

function ScopePanel({ part }) {
  const t = useT();
  const canvasRef = useRef(null);
  const partRef = useRef(part);
  partRef.current = part;
  useEffect(() => {
    let raf, last = 0;
    const loop = (now) => {
      if (now - last > 40) {
        last = now;
        const c = canvasRef.current;
        if (c) {
          const p = partRef.current;
          drawScope(c.getContext('2d'), c.width, c.height, engine.scopeData(p.id), p.params, engine.out.get(p.id) || {});
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="flex gap-3">
      <canvas ref={canvasRef} width={460} height={288} className="rounded-md border border-bg-3" />
      <div className="w-72">
        <div className="panel-title">{t('scope.title')}</div>
        <ScopeControls part={part} />
      </div>
    </div>
  );
}

function MeterPanel({ part }) {
  const t = useT();
  const update = useStore((s) => s.updateParams);
  const out = engine.out.get(part.id) || {};
  const mode = part.params.mode;
  const unit = mode === 'A' ? 'A' : mode === 'Ohm' ? 'Ω' : 'V';
  const text = out.text || (out.val === Infinity ? 'OL' : Number.isFinite(out.val) ? fmt(out.val, unit, 4) : '----');
  return (
    <div className="w-64 shrink-0 rounded-lg border border-bg-3 bg-bg-0 p-2.5">
      <div className="panel-title mb-1.5">{t('mm.title')} · {part.id}</div>
      <div className="mb-2 rounded-md border border-black/40 bg-[#b9c9a6] px-3 py-2 text-right font-mono text-3xl font-bold text-[#1a2a14] shadow-inner">{text}</div>
      <div className="grid grid-cols-2 gap-1">
        {['V', 'Vac', 'A', 'Ohm'].map((m) => (
          <button key={m} className={`btn ${mode === m ? 'btn-on' : ''}`} onClick={() => update(part.id, { mode: m })} title={t(`o.${m}`)}>
            {m === 'Vac' ? 'V~' : m === 'Ohm' ? 'Ω' : m === 'V' ? 'V⎓' : 'A'}
          </button>
        ))}
      </div>
      {out.ok === false && !out.text && <p className="mt-1.5 text-[10.5px] text-slate-500">{t('mm.check')}</p>}
    </div>
  );
}

export default function InstrumentDock() {
  const parts = useStore((s) => s.parts);
  useStore((s) => s.tick);
  const scopes = parts.filter((p) => p.type === 'scope');
  const meters = parts.filter((p) => p.type === 'multimeter');
  if (!scopes.length && !meters.length) return null;
  return (
    <div className="flex max-h-[330px] shrink-0 items-start gap-3 overflow-x-auto border-t border-bg-3 bg-bg-1 p-3">
      {scopes.map((p) => <ScopePanel key={p.id} part={p} />)}
      {meters.map((p) => <MeterPanel key={p.id} part={p} />)}
    </div>
  );
}
