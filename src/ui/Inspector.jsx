import React, { useEffect, useRef, useState } from 'react';
import { useStore, WIRE_COLORS } from '../store.js';
import { engine } from '../sim.js';
import { PART_TYPES, UNITS, LED_COLORS } from '../data/catalog.js';
import { SKETCH_NAMES } from '../data/sketches.js';
import { effectiveCode } from '../engine/mcu.js';
import { useT } from '../i18n.js';
import { fmt, bestUnit, resistorBands } from '../data/format.js';
import { ScopeControls } from './Instruments.jsx';

const OUT_KEYS = [
  ['v', 'V', 'insp.v'], ['i', 'A', 'insp.i'], ['p', 'W', 'insp.p'],
  ['vw', 'V', 'Wiper V'], ['ic', 'A', 'Ic'], ['ib', 'A', 'Ib'], ['vbe', 'V', 'Vbe'], ['vce', 'V', 'Vce'],
  ['id', 'A', 'Id'], ['vgs', 'V', 'Vgs'], ['vds', 'V', 'Vds'], ['vin', 'V', 'Vin'], ['vout', 'V', 'Vout'],
  ['vpos', 'V', 'V+'], ['vneg', 'V', 'V−'], ['ipos', 'A', 'I+'], ['ineg', 'A', 'I−'], ['iout', 'A', 'Iout'],
];

function Row({ label, children }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      {children}
    </div>
  );
}

function EngField({ part, f, label }) {
  const value = part.params[f.k];
  const [unit, setUnit] = useState(() => bestUnit(f.units, value));
  const [text, setText] = useState('');
  const focus = useRef(false);
  const update = useStore((s) => s.updateParams);
  useEffect(() => { if (!focus.current) setText(String(Number((value / unit[1]).toPrecision(6)))); }, [value, unit]);
  const commit = (txt, u) => {
    const n = parseFloat(txt.replace(',', '.'));
    if (Number.isFinite(n) && n > 0) update(part.id, { [f.k]: Math.min(f.max, Math.max(f.min, n * u[1])) });
  };
  return (
    <Row label={label}>
      <div className="flex gap-1.5">
        <input
          className="field select-text" inputMode="decimal" value={text}
          onFocus={() => { focus.current = true; }}
          onBlur={() => { focus.current = false; setText(String(Number((value / unit[1]).toPrecision(6)))); }}
          onChange={(e) => { setText(e.target.value); commit(e.target.value, unit); }}
        />
        <select
          className="field !w-20"
          value={unit[0]}
          onChange={(e) => { const u = UNITS[f.units].find((x) => x[0] === e.target.value); setUnit(u); commit(text, u); }}
        >
          {UNITS[f.units].map((u) => <option key={u[0]} value={u[0]}>{u[0]}</option>)}
        </select>
      </div>
      {f.units === 'R' && part.type === 'resistor' && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-[10px] uppercase text-slate-500">{'bands'}</span>
          {resistorBands(part.params.R, part.params.tol).map((c, i) => (
            <span key={i} className="h-4 w-3 rounded-sm border border-black/50" style={{ background: c }} />
          ))}
        </div>
      )}
    </Row>
  );
}

function NumField({ part, f, label }) {
  const update = useStore((s) => s.updateParams);
  const v = part.params[f.k];
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input
          type="number" className="field select-text !w-24" value={Number(v.toPrecision(6))} min={f.min} max={f.max} step={f.step}
          onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) update(part.id, { [f.k]: Math.min(f.max, Math.max(f.min, n)) }); }}
        />
        <span className="w-10 text-xs text-slate-400">{f.unit}</span>
        <input type="range" className="min-w-0 flex-1" min={f.min} max={f.max} step={f.step} value={v}
          onChange={(e) => update(part.id, { [f.k]: parseFloat(e.target.value) })} />
      </div>
    </Row>
  );
}

// Power limit of a source: P = V * Imax. Editing it rewrites Imax, so the engine, the 3D display and the readouts follow at once.
function PowerField({ part, f, label }) {
  const update = useStore((s) => s.updateParams);
  const V = part.params.V, I = part.params.Imax;
  const P = V * I;
  const maxP = Math.max(0.01, V * f.imaxMax);
  const setP = (w) => {
    if (!(V > 0) || !Number.isFinite(w)) return;
    update(part.id, { Imax: Math.min(f.imaxMax, Math.max(0.001, w / V)) });
  };
  return (
    <Row label={label}>
      <div className="flex items-center gap-2">
        <input type="number" className="field select-text !w-24" min="0.001" max={maxP} step="0.01" value={Number(P.toPrecision(5))} onChange={(e) => setP(parseFloat(e.target.value))} />
        <span className="w-10 text-xs text-slate-400">W</span>
        <input type="range" className="min-w-0 flex-1" min="0.001" max={maxP} step={maxP / 500} value={Math.min(P, maxP)} onChange={(e) => setP(parseFloat(e.target.value))} />
      </div>
      <div className="mt-1 text-[10.5px] text-slate-500">P = V × I<sub>max</sub> = {fmt(V, 'V')} × {fmt(I, 'A')}</div>
    </Row>
  );
}

// Rolling graph (about 15 s) of the real V / A / W delivered by a power source.
function SourceChart({ part }) {
  const t = useT();
  const canvasRef = useRef(null);
  const buf = useRef({ id: null, v: [], i: [], p: [] });
  const out = engine.out.get(part.id) || {};
  const running = useStore((s) => s.running);
  useEffect(() => {
    const b = buf.current;
    if (b.id !== part.id) { b.id = part.id; b.v = []; b.i = []; b.p = []; }
    const o = engine.out.get(part.id) || {};
    const v = o.v ?? o.vpos ?? 0, i = o.i ?? o.ipos ?? 0;
    const pw = o.p ?? v * i;
    if (running || b.v.length === 0) {
      b.v.push(v); b.i.push(i); b.p.push(pw);
      for (const k of ['v', 'i', 'p']) if (b[k].length > 150) b[k].shift();
    }
    const c = canvasRef.current;
    if (!c) return;
    const g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    const bands = [['v', 'V', '#44ff88'], ['i', 'A', '#ffcc44'], ['p', 'W', '#44d0ff']];
    const bh = H / 3;
    bands.forEach(([k, unit, col], n) => {
      const y0 = n * bh;
      const arr = b[k];
      let lo = Math.min(0, ...arr), hi = Math.max(1e-6, ...arr);
      const pad = (hi - lo) * 0.12;
      hi += pad; if (lo < 0) lo -= pad;
      g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(0, y0 + 2, W, bh - 4);
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.beginPath(); g.moveTo(0, y0 + bh - 2 - ((0 - lo) / (hi - lo)) * (bh - 6)); g.lineTo(W, y0 + bh - 2 - ((0 - lo) / (hi - lo)) * (bh - 6)); g.stroke();
      g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath();
      arr.forEach((val, idx) => {
        const x = (idx / 149) * W, y = y0 + bh - 2 - ((val - lo) / (hi - lo)) * (bh - 6);
        if (idx === 0) g.moveTo(x, y); else g.lineTo(x, y);
      });
      g.stroke();
      g.fillStyle = col; g.font = 'bold 11px monospace'; g.textBaseline = 'top';
      g.fillText(`${unit} ${fmt(arr[arr.length - 1] || 0, unit)}`, 6, y0 + 5);
    });
  });
  return (
    <div className="mb-3 rounded-lg border border-bg-3 bg-bg-0 p-2.5">
      <div className="panel-title mb-1.5">{t('insp.chart')}</div>
      <canvas ref={canvasRef} width={268} height={150} className="w-full rounded" />
      {out.cc && <div className="mt-1 text-[10.5px] font-semibold text-danger">{t('insp.cc')}</div>}
    </div>
  );
}

function Knob({ value, onChange }) {
  const ref = useRef(null);
  const drag = useRef(false);
  const apply = (e) => {
    const r = ref.current.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    let a = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (a > 135) a = a < 180 ? 135 : -135 + 0; // wrap past the bottom to nearest stop
    if (a < -135) a = -135;
    onChange(Math.min(1, Math.max(0, (a + 135) / 270)));
  };
  const ang = -135 + value * 270;
  return (
    <svg
      ref={ref} width="110" height="110" viewBox="-55 -55 110 110" className="mx-auto cursor-grab touch-none"
      onPointerDown={(e) => { drag.current = true; e.currentTarget.setPointerCapture(e.pointerId); apply(e); }}
      onPointerMove={(e) => drag.current && apply(e)}
      onPointerUp={() => { drag.current = false; }}
    >
      {Array.from({ length: 11 }, (_, i) => {
        const a = ((-135 + i * 27) * Math.PI) / 180;
        return <line key={i} x1={Math.sin(a) * 44} y1={-Math.cos(a) * 44} x2={Math.sin(a) * 50} y2={-Math.cos(a) * 50} stroke="#4b5d70" strokeWidth="2" />;
      })}
      <circle r="38" fill="#1b1b20" stroke="#2dd4bf" strokeWidth="2" />
      <circle r="30" fill="#25262c" />
      <g transform={`rotate(${ang})`}><rect x="-2.5" y="-36" width="5" height="22" rx="2.5" fill="#f0f0f0" /></g>
      <text y="5" textAnchor="middle" fill="#d7e0ea" fontSize="14" fontFamily="monospace">{Math.round(value * 100)}%</text>
    </svg>
  );
}

function Hold({ part, label, latching }) {
  const down = (v) => engine.setInput(part.id, { pressed: v });
  if (latching) {
    return <button className="btn w-full" onClick={() => down(!(engine.inputs.get(part.id) || {}).pressed)}>{label}</button>;
  }
  return (
    <button className="btn w-full" onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); down(true); }} onPointerUp={() => down(false)} onPointerCancel={() => down(false)}>
      {label}
    </button>
  );
}

function Field({ part, f }) {
  const t = useT();
  const update = useStore((s) => s.updateParams);
  const label = t(`f.${f.k}`, f.k);
  const v = part.params[f.k];
  switch (f.t) {
    case 'eng': return <EngField part={part} f={f} label={label} />;
    case 'num': return <NumField part={part} f={f} label={label} />;
    case 'power': return <PowerField part={part} f={f} label={label} />;
    case 'int':
      return (
        <Row label={label}>
          <input type="number" className="field select-text !w-24" min={f.min} max={f.max} value={v}
            onChange={(e) => { const n = parseInt(e.target.value, 10); if (Number.isFinite(n)) update(part.id, { [f.k]: Math.min(f.max, Math.max(f.min, n)) }); }} />
        </Row>
      );
    case 'select':
      return (
        <Row label={label}>
          <select className="field" value={String(v)} onChange={(e) => { const o = f.options.find((x) => String(x) === e.target.value); update(part.id, { [f.k]: o }); }}>
            {f.options.map((o) => <option key={String(o)} value={String(o)}>{f.k === 'tol' ? `±${o}%` : t(`o.${o}`, String(o))}</option>)}
          </select>
        </Row>
      );
    case 'bool':
      return (
        <Row label={label}>
          <button className={`btn ${v ? 'btn-on' : ''}`} onClick={() => update(part.id, { [f.k]: !v })}>{v ? 'ON' : 'OFF'}</button>
        </Row>
      );
    case 'ledcolor':
      return (
        <Row label={label}>
          <div className="flex flex-wrap gap-1.5">
            {LED_COLORS.map((c) => (
              <button key={c.id} title={t(`led.${c.id}`)} onClick={() => update(part.id, c.id === 'custom' ? { colorId: 'custom' } : { colorId: c.id, color: c.hex, vf: c.vf })}
                className={`h-6 w-6 rounded-full border-2 ${part.params.colorId === c.id ? 'border-white' : 'border-bg-3'}`} style={{ background: c.id === 'custom' ? 'conic-gradient(red,yellow,lime,cyan,blue,magenta,red)' : c.hex }} />
            ))}
          </div>
          {part.params.colorId === 'custom' && <input type="color" className="mt-2 h-7 w-full cursor-pointer rounded border border-bg-3 bg-bg-0" value={part.params.color} onChange={(e) => update(part.id, { color: e.target.value })} />}
        </Row>
      );
    case 'knob':
      return (
        <Row label={`${label} (0–100%)`}>
          <Knob value={v} onChange={(x) => update(part.id, { pos: x })} />
          <input type="range" className="mt-1 w-full" min="0" max="1" step="0.005" value={v} onChange={(e) => update(part.id, { pos: parseFloat(e.target.value) })} />
          <div className="mt-1 text-center font-mono text-xs text-slate-300">
            {part.params.taper === 'log' ? 'log' : 'lin'} · {fmt(part.params.R * (part.params.taper === 'log' ? (Math.pow(10, 2 * v) - 1) / 99 : v), 'Ω')}
          </div>
        </Row>
      );
    case 'press':
      return <Row label={label}><Hold part={part} label={part.params.mode === 'latching' ? t('insp.latch') : t('insp.hold')} latching={part.params.mode === 'latching'} /></Row>;
    case 'sw8':
      return (
        <Row label={label}>
          <div className="flex gap-1">
            {Array.from({ length: 8 }, (_, i) => (
              <button key={i} className={`btn !px-0 h-8 w-7 ${v[i] ? 'btn-on' : ''}`} onClick={() => { const sw = [...v]; sw[i] = sw[i] ? 0 : 1; update(part.id, { sw }); }}>{i + 1}</button>
            ))}
          </div>
        </Row>
      );
    case 'keypad':
      return (
        <Row label={label}>
          <div className="grid grid-cols-4 gap-1">
            {'123A456B789C*0#D'.split('').map((k, i) => (
              <button key={i} className="btn !py-2"
                onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); const ks = new Set((engine.inputs.get(part.id) || {}).keys || []); ks.add(i); engine.setInput(part.id, { keys: ks }); }}
                onPointerUp={() => { const ks = new Set((engine.inputs.get(part.id) || {}).keys || []); ks.delete(i); engine.setInput(part.id, { keys: ks }); }}>{k}</button>
            ))}
          </div>
        </Row>
      );
    case 'code': return <CodeField part={part} label={t('insp.sketch')} />;
    default: return null;
  }
}

function CodeField({ part, label }) {
  const t = useT();
  const update = useStore((s) => s.updateParams);
  const out = engine.out.get(part.id) || {};
  const code = effectiveCode(part.params);
  return (
    <>
      <Row label={label}>
        <select className="field mb-2" value={part.params.sketch} onChange={(e) => update(part.id, e.target.value === 'custom' && !part.params.code ? { sketch: 'custom', code } : { sketch: e.target.value })}>
          {SKETCH_NAMES.map((n) => <option key={n} value={n}>{t(`o.${n}`, n)}</option>)}
        </select>
        <textarea
          className="field h-44 resize-y whitespace-pre text-[11px] leading-snug" spellCheck={false} value={code}
          onChange={(e) => update(part.id, { sketch: 'custom', code: e.target.value })}
        />
      </Row>
      {out.error && <div className="mb-2 rounded border border-danger/50 bg-danger/10 p-2 text-[11px] text-danger"><b>{t('insp.error')}:</b> {out.error}</div>}
      <Row label={t('insp.serial')}>
        <pre className="select-text h-20 overflow-auto rounded border border-bg-3 bg-bg-0 p-1.5 font-mono text-[11px] text-emerald-300">{(out.log || []).slice(-12).join('\n')}</pre>
      </Row>
    </>
  );
}

function Readouts({ part }) {
  const t = useT();
  const out = engine.out.get(part.id) || {};
  const rows = OUT_KEYS.filter(([k]) => Number.isFinite(out[k]));
  if (part.type === 'multimeter' || part.type === 'scope' || !rows.length) return null;
  return (
    <div className="mb-3 rounded-lg border border-bg-3 bg-bg-0 p-2.5">
      <div className="panel-title mb-1.5">{t('insp.readout')}</div>
      <table className="w-full font-mono text-xs">
        <tbody>
          {rows.map(([k, u, label]) => (
            <tr key={k}>
              <td className="py-0.5 text-slate-400">{label.startsWith('insp.') ? t(label) : label}</td>
              <td className="text-right text-accent">{fmt(out[k], u)}</td>
            </tr>
          ))}
          {part.type === 'ne555' && <tr><td className="py-0.5 text-slate-400">Q</td><td className="text-right text-accent">{out.q ? 'HIGH' : 'LOW'}</td></tr>}
          {out.dmg > 0.02 && <tr><td className="py-0.5 text-warn">⚠ stress</td><td className="text-right text-warn">{Math.round(Math.min(1, out.dmg) * 100)}%</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ProbeList({ part }) {
  const t = useT();
  const setProbe = useStore((s) => s.setProbe);
  const def = PART_TYPES[part.type];
  return (
    <Row label="Probes">
      <p className="mb-1.5 text-[11px] text-slate-500">{t('insp.probe')}</p>
      {def.probes.map((n) => {
        const ep = part.probes && part.probes[n];
        return (
          <div key={n} className="mb-1 flex items-center justify-between rounded bg-bg-0 px-2 py-1 text-xs">
            <span className="font-mono text-slate-300">{n}</span>
            <span className="text-slate-500">{ep ? (ep.h ? ep.h : `${ep.n}`) : t('insp.parked')}</span>
            <button className="text-slate-400 hover:text-white" disabled={!ep} onClick={() => setProbe(part.id, n, null)}>✕</button>
          </div>
        );
      })}
    </Row>
  );
}

function PartInspector({ part }) {
  const t = useT();
  const def = PART_TYPES[part.type];
  const burnt = useStore((s) => s.burnt[part.id]);
  const { rotatePart, removePart, repairPart } = useStore.getState();
  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-white">{t.comp(def)}</div>
          <div className="font-mono text-[10px] text-slate-500">{part.id} · {def.type}</div>
        </div>
        <div className="flex gap-1.5">
          <button className="btn" onClick={() => rotatePart(part.id)}>⟳</button>
          <button className="btn btn-danger" onClick={() => removePart(part.id)}>🗑</button>
        </div>
      </div>
      {burnt && (
        <div className="mb-3 rounded-lg border border-danger/60 bg-danger/10 p-2.5 text-xs">
          <div className="font-semibold text-danger">🔥 {t('insp.burnt')}</div>
          <div className="mb-2 text-slate-300">{t(`burn.${burnt.reason}`, burnt.reason)}</div>
          <button className="btn btn-accent w-full" onClick={() => repairPart(part.id)}>{t('insp.repair')}</button>
        </div>
      )}
      <Readouts part={part} />
      {['battery', 'psu', 'psu_dual'].includes(def.model) && <SourceChart part={part} />}
      {def.fields.map((f) => <Field key={f.k} part={part} f={f} />)}
      {part.type === 'scope' && <ScopeControls part={part} />}
      {def.probes && <ProbeList part={part} />}
    </div>
  );
}

function WireInspector({ wire }) {
  const t = useT();
  const { updateWire, removeWire } = useStore.getState();
  const name = (ep) => (ep.h ? ep.h : `${ep.p}.${ep.n}`);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-white">{t('insp.wire')}</div>
        <button className="btn btn-danger" onClick={() => removeWire(wire.id)}>🗑</button>
      </div>
      <Row label={t('wire.color')}>
        <div className="flex flex-wrap gap-1.5">
          {WIRE_COLORS.map((c) => (
            <button key={c} onClick={() => updateWire(wire.id, { color: c })} style={{ background: c }} className={`h-6 w-6 rounded-full border-2 ${wire.color === c ? 'border-white' : 'border-bg-3'}`} />
          ))}
          <input type="color" value={wire.color} onChange={(e) => updateWire(wire.id, { color: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-bg-3 bg-bg-0" />
        </div>
      </Row>
      <div className="font-mono text-xs text-slate-400">{name(wire.a)} ⟷ {name(wire.b)}</div>
      <div className="mt-1 font-mono text-xs text-accent">Δ {fmt(engine.endpointVoltage(wire.a) - engine.endpointVoltage(wire.b), 'V')}</div>
    </div>
  );
}

export default function Inspector() {
  const t = useT();
  const selection = useStore((s) => s.selection);
  const parts = useStore((s) => s.parts);
  const wires = useStore((s) => s.wires);
  const burnt = useStore((s) => s.burnt);
  useStore((s) => s.tick);
  let body = <p className="text-xs leading-relaxed text-slate-500">{t('insp.none')}</p>;
  if (selection && selection.kind === 'part') {
    const part = parts.find((p) => p.id === selection.id);
    if (part) body = <PartInspector part={part} />;
  } else if (selection && selection.kind === 'wire') {
    const w = wires.find((x) => x.id === selection.id);
    if (w) body = <WireInspector wire={w} />;
  }
  return (
    <aside data-tut="inspector" className="flex w-80 shrink-0 flex-col border-l border-bg-3 bg-bg-1">
      <div className="flex items-center justify-between border-b border-bg-3 px-3 py-2.5">
        <div className="panel-title">{t('insp.title')}</div>
        <div className="font-mono text-[10px] text-slate-500">{parts.length} {t('status.parts')} · {wires.length} {t('status.wires')}{Object.keys(burnt).length ? <span className="text-danger"> · {Object.keys(burnt).length} {t('status.burnt')}</span> : null}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{body}</div>
    </aside>
  );
}
