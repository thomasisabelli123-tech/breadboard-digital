import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { engine } from '../sim.js';
import { useT } from '../i18n.js';
import { PART_TYPES } from '../data/catalog.js';

// Each step: spotlight target (data-tut attribute) and a completion test run against the live app state.
const isSource = (p) => { const d = PART_TYPES[p.type]; return !!d && (d.model === 'psu' || d.model === 'battery'); };
const ledLit = (st) => st.parts.some((p) => {
  if (p.type !== 'led') return false;
  const o = engine.out.get(p.id) || {};
  return !st.burnt[p.id] && ((o.b || 0) > 0.15 || (o.i || 0) > 1e-3);
});

export const TUTORIAL_STEPS = [
  { id: 'intro', target: null, done: null },
  { id: 'source', target: 'library', done: (st) => st.parts.some(isSource) },
  { id: 'volts', target: 'inspector', done: null },
  { id: 'resistor', target: 'library', done: (st) => st.parts.some((p) => p.type === 'resistor') },
  { id: 'led', target: 'library', done: (st) => st.parts.some((p) => p.type === 'led') },
  { id: 'wire', target: 'viewport', done: ledLit },
  { id: 'meter', target: 'library', done: (st) => st.parts.some((p) => p.type === 'multimeter') },
  { id: 'probes', target: 'viewport', done: (st) => st.parts.some((p) => p.type === 'multimeter' && Object.values(p.probes || {}).filter(Boolean).length >= 2) },
  { id: 'xray', target: 'xray', done: (st) => st.xray },
  { id: 'end', target: null, done: null },
];

function Spotlight({ target }) {
  const [rect, setRect] = useState(null);
  useLayoutEffect(() => {
    if (!target) { setRect(null); return undefined; }
    const upd = () => {
      const el = document.querySelector(`[data-tut="${target}"]`);
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 });
    };
    upd();
    const id = setInterval(upd, 400);
    window.addEventListener('resize', upd);
    return () => { clearInterval(id); window.removeEventListener('resize', upd); };
  }, [target]);
  if (!rect) return null;
  return <div className="tut-spot fixed z-[45]" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />;
}

export default function Tutorial() {
  const t = useT();
  const tut = useStore((s) => s.tutorial);
  const step = tut.step;
  const def = TUTORIAL_STEPS[step];
  const dwell = useRef(0);

  useEffect(() => { dwell.current = Date.now(); }, [step]);
  useEffect(() => {
    if (!tut.active || !def || !def.done) return undefined;
    const id = setInterval(() => {
      const st = useStore.getState();
      if (Date.now() - dwell.current < 700) return;
      let ok = false;
      try { ok = !!def.done(st); } catch (_) { ok = false; }
      if (ok) st.setTutorialStep(Math.min(TUTORIAL_STEPS.length - 1, st.tutorial.step + 1));
    }, 300);
    return () => clearInterval(id);
  }, [tut.active, def]);

  if (!tut.active || !def) return null;
  const st = useStore.getState;
  const last = step === TUTORIAL_STEPS.length - 1;
  const total = TUTORIAL_STEPS.length - 1;
  const autoBuild = () => { st().loadExample('led'); st().setTutorialStep(5); };
  const exit = () => { st().endTutorial(); };
  const finish = () => { st().endTutorial(); st().setToast(t('tut.done.toast')); };

  return (
    <>
      <Spotlight target={def.target} />
      <div className="fixed bottom-9 left-1/2 z-[60] w-[min(660px,92vw)] -translate-x-1/2 animate-slideUp rounded-2xl border border-accent/50 bg-bg-1/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,.6)] backdrop-blur" role="dialog" aria-live="polite">
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider text-bg-0">{t('tut.badge')}</span>
          <span className="text-[11px] text-slate-400">{last || step === 0 ? '' : `${step}/${total - 1}`}</span>
          <div className="ml-2 h-1 flex-1 overflow-hidden rounded bg-bg-3"><div className="h-full rounded bg-accent transition-all duration-500" style={{ width: `${(step / (TUTORIAL_STEPS.length - 1)) * 100}%` }} /></div>
          <button className="text-[11px] text-slate-400 underline-offset-2 hover:text-white hover:underline" onClick={exit}>{t('tut.exit')}</button>
        </div>
        <div className="text-base font-semibold text-white">{t(`tut.${def.id}.title`)}</div>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-300">{t(`tut.${def.id}.text`)}</p>
        {def.id === 'wire' && (
          <ul className="mt-2 space-y-1 text-[12px] text-slate-400">
            <li>① {t('tut.wire.a')}</li><li>② {t('tut.wire.b')}</li><li>③ {t('tut.wire.c')}</li>
          </ul>
        )}
        <div className="mt-3 flex items-center justify-end gap-2">
          {def.id === 'wire' && <button className="btn" onClick={autoBuild}>{t('tut.autobuild')}</button>}
          {step > 0 && !last && <button className="btn" onClick={() => st().setTutorialStep(step - 1)}>← {t('tut.back')}</button>}
          {def.done && !last && <button className="btn" onClick={() => st().setTutorialStep(step + 1)}>{t('tut.skip')} →</button>}
          {!def.done && step > 0 && !last && <button className="btn btn-accent" onClick={() => st().setTutorialStep(step + 1)}>{t('tut.next')} →</button>}
          {step === 0 && <button className="btn btn-accent" onClick={() => st().setTutorialStep(1)}>{t('tut.start')} →</button>}
          {last && <button className="btn btn-accent" onClick={finish}>✓ {t('tut.finish')}</button>}
        </div>
      </div>
    </>
  );
}
