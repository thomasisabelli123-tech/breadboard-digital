import React, { useMemo, useState } from 'react';
import { CATEGORIES, PART_TYPES, searchParts } from '../data/catalog.js';
import { useStore } from '../store.js';
import { useT } from '../i18n.js';

const GLYPH = {
  battery: '🔋', psu: '⚡', psu_dual: '⚡', ac_ct: '∿', funcgen: '∿',
  resistor: '▭', cap_elec: '⫴', cap_disc: '⫴', cap_poly: '⫴', inductor: '𝓛', pot: '◔', trimmer: '◔', ldr: '☀', ntc: '🌡',
  led: '💡', led_rgb: '🌈', diode: '▶|', zener: '▶|', to92: '⏚', to220: '⏚',
  pushbutton: '◉', slide_sw: '⇆', slide_sw2: '⇆', dip_sw: '▤', keypad: '▦',
  dip: '▥', arduino_uno: '⌬', nano: '⌬', esp32: '⌬', multimeter: '⎍', scope: '〰',
};

export default function Library() {
  const t = useT();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => Object.fromEntries(CATEGORIES.map((c) => [c.id, true])));
  const armed = useStore((s) => s.armed);
  const tool = useStore((s) => s.tool);
  const arm = useStore((s) => s.arm);

  const groups = useMemo(() => {
    const list = searchParts(q);
    return CATEGORIES.map((c) => ({ cat: c, items: list.filter((p) => p.cat === c.id) })).filter((g) => g.items.length);
  }, [q]);

  return (
    <aside data-tut="library" className="flex w-72 shrink-0 flex-col border-r border-bg-3 bg-bg-1">
      <div className="border-b border-bg-3 p-3">
        <div className="panel-title mb-2">{t('lib.title')}</div>
        <input className="field" placeholder={t('lib.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <p className="mt-2 text-[10.5px] leading-snug text-slate-500">{t('lib.hint')}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {groups.length === 0 && <div className="p-4 text-center text-xs text-slate-500">{t('lib.empty')}</div>}
        {groups.map(({ cat, items }) => (
          <section key={cat.id} className="mb-2">
            <button
              className="flex w-full items-center justify-between rounded-md bg-bg-2 px-2.5 py-1.5 text-left text-xs font-semibold text-slate-200 hover:bg-bg-3"
              onClick={() => setOpen((o) => ({ ...o, [cat.id]: !o[cat.id] }))}
            >
              <span><span className="mr-1.5">{cat.icon}</span>{t.L(cat.name)}</span>
              <span className="text-slate-500">{items.length} {open[cat.id] || q ? '▾' : '▸'}</span>
            </button>
            {(open[cat.id] || q) && (
              <ul className="mt-1 space-y-1">
                {items.map((p) => {
                  const active = p.tool === 'wire' ? tool === 'wire' : armed === p.type;
                  return (
                    <li key={p.type}>
                      <button
                        draggable={!p.tool}
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.type); e.dataTransfer.effectAllowed = 'copy'; }}
                        onClick={() => arm(p.type)}
                        className={`flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition ${active ? 'border-accent bg-accent-dim/30 text-white' : 'border-transparent bg-bg-0/60 text-slate-300 hover:border-bg-3 hover:bg-bg-2'}`}
                        title={t.comp(p)}
                      >
                        <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-bg-2 text-[13px]">{p.tool === 'wire' ? '➰' : GLYPH[p.m3d] || '▪'}</span>
                        <span className="leading-tight">{t.comp(p)}</span>
                        {p.bench && <span className="ml-auto rounded bg-bg-3 px-1 text-[9px] uppercase text-slate-400">bench</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
      <div className="border-t border-bg-3 px-3 py-1.5 text-[10px] text-slate-500">{Object.keys(PART_TYPES).length} components</div>
    </aside>
  );
}
