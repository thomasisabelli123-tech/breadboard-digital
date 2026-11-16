import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { useT, LANGS } from '../i18n.js';
import { fmt } from '../data/format.js';
import { BOARD_TYPES } from '../engine/geometry.js';
import { exportProjectFile, importProjectFile } from './fileio.js';
import { signOut } from '../auth/auth.js';

const pad = (n) => String(n).padStart(2, '0');
const hms = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const dur = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
};

function Clock() {
  const t = useT();
  const [now, setNow] = useState(new Date());
  const start = useRef(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 250);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="flex items-center gap-3 rounded-md border border-bg-3 bg-bg-0 px-3 py-1 font-mono">
      <div className="leading-tight">
        <div className="text-[9px] uppercase tracking-widest text-slate-500">{t('clock.now')}</div>
        <div className="text-base font-semibold text-accent" title={t('clock.now')}>{hms(now)}</div>
      </div>
      <div className="h-7 w-px bg-bg-3" />
      <div className="leading-tight">
        <div className="text-[9px] uppercase tracking-widest text-slate-500">{t('clock.session')}</div>
        <div className="text-sm text-slate-300">{dur(now.getTime() - start.current)}</div>
      </div>
    </div>
  );
}

const Icon = ({ d, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={d} /></svg>
);
const I_PLAY = 'M8 5v14l11-7z';
const I_PAUSE = 'M6 5h4v14H6zM14 5h4v14h-4z';
const I_RESET = 'M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z';

// Small dropdown menu (closes on outside click / Escape).
function Menu({ label, children, title }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button className={`btn ${open ? 'btn-on' : ''}`} onClick={() => setOpen((v) => !v)} title={title}>{label} ▾</button>
      {open && <div className="absolute right-0 top-full z-40 mt-1.5 w-64 animate-popIn overflow-hidden rounded-xl border border-bg-3 bg-bg-1 py-1 shadow-2xl" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}
const MenuItem = ({ children, onClick, danger, hint }) => (
  <button className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] transition hover:bg-bg-3 ${danger ? 'text-danger' : 'text-slate-200'}`} onClick={onClick}>
    <span>{children}</span>{hint && <span className="text-[10.5px] text-slate-500">{hint}</span>}
  </button>
);
const MenuSep = () => <div className="my-1 h-px bg-bg-3" />;

export default function TopBar() {
  const t = useT();
  const running = useStore((s) => s.running);
  const speed = useStore((s) => s.speed);
  const simTime = useStore((s) => s.simTime);
  const lang = useStore((s) => s.lang);
  const board = useStore((s) => s.board);
  const user = useStore((s) => s.user);
  const hasParts = useStore((s) => s.parts.length > 0);
  const { setRunning, setSpeed, resetSim, setLang, loadExample, clearBoard, setToast, openModal, goHome } = useStore.getState();
  const fileRef = useRef(null);

  const doExport = async () => { try { await exportProjectFile(); } catch (e) { setToast(String(e.message || e)); } };
  const doImport = async () => { try { await importProjectFile(fileRef.current); } catch (e) { setToast(String(e.message || e)); } };
  const changeBoard = (id) => {
    if (id === board) return;
    if (hasParts && !window.confirm(t('board.change.confirm'))) return;
    useStore.getState().setBoard(id);
  };

  const logSpeed = Math.log10(speed);

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-bg-3 bg-gradient-to-r from-bg-1 via-bg-1 to-bg-2 px-4">
      {/* title + credits */}
      <button className="group flex shrink-0 items-center gap-3 whitespace-nowrap rounded-lg text-left transition hover:opacity-90" onClick={goHome} title={t('top.home')}>
        <div className="grid h-9 w-9 place-items-center rounded-lg bg-accent/15 ring-1 ring-accent/50 transition group-hover:bg-accent/30">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#2dd4bf" strokeWidth="1.8"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M7 9h2M11 9h2M15 9h2M7 15h2M11 15h2M15 15h2" strokeLinecap="round" /></svg>
        </div>
        <div className="leading-tight">
          <div className="text-base font-bold tracking-tight text-white">{t('app.title')}</div>
          <div className="text-[11px] font-medium text-accent">{t('app.credit')}</div>
        </div>
      </button>

      <div className="mx-0.5 h-8 w-px shrink-0 bg-bg-3" />

      {/* simulation controls */}
      <div className="flex items-center gap-2">
        <button className={`btn ${running ? '' : 'btn-accent'}`} onClick={() => setRunning(true)} disabled={running} title={t('sim.play')}>
          <Icon d={I_PLAY} /> <span className="hidden 2xl:inline">{t('sim.play')}</span>
        </button>
        <button className={`btn ${running ? 'btn-on' : ''}`} onClick={() => setRunning(false)} disabled={!running} title={t('sim.pause')}>
          <Icon d={I_PAUSE} /> <span className="hidden 2xl:inline">{t('sim.pause')}</span>
        </button>
        <button className="btn" onClick={resetSim} title={t('sim.reset')}>
          <Icon d={I_RESET} /> <span className="hidden 2xl:inline">{t('sim.reset')}</span>
        </button>
        <div className="ml-1 flex shrink-0 items-center gap-2 rounded-md border border-bg-3 bg-bg-0 px-2 py-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">{t('sim.speed')}</span>
          <input
            type="range" min="-3" max="2" step="0.05" value={logSpeed} className="w-20"
            onChange={(e) => setSpeed(Math.pow(10, parseFloat(e.target.value)))}
            title={t('sim.speed')}
          />
          <span className="w-12 text-right font-mono text-xs text-accent">×{speed >= 10 ? speed.toFixed(0) : speed >= 1 ? speed.toFixed(1) : speed.toPrecision(2)}</span>
        </div>
        <div className="shrink-0 whitespace-nowrap rounded-md border border-bg-3 bg-bg-0 px-2 py-1 font-mono text-xs text-slate-300" title={t('sim.time')}>
          <span className="mr-1 text-[10px] uppercase text-slate-500">{t('sim.time')}</span>{fmt(simTime, 's')}
        </div>
      </div>

      <div className="flex-1" />

      {/* board model + files */}
      <div className="flex items-center gap-2">
        <select className="field !w-auto max-w-[150px] !text-xs" value={board} onChange={(e) => changeBoard(e.target.value)} title={t('board.model')} data-tut="board">
          {BOARD_TYPES.map((b) => <option key={b.id} value={b.id}>{t.L(b.name)}</option>)}
        </select>
        <button className="btn" onClick={() => openModal('save')} title={t('file.save')}>💾 <span className="hidden 2xl:inline">{t('file.save')}</span></button>
        <Menu label={t('file.menu')}>
          <MenuItem onClick={() => openModal('newproject')}>{t('file.new')}</MenuItem>
          <MenuItem onClick={() => openModal('circuits')}>{t('home.circuits')}</MenuItem>
          <MenuSep />
          <MenuItem onClick={doExport} hint=".bbd.json">{t('file.export')}</MenuItem>
          <MenuItem onClick={doImport}>{t('file.import')}</MenuItem>
          <MenuSep />
          {['led', 'dimmer', 'blink555', 'nano'].map((k) => <MenuItem key={k} onClick={() => loadExample(k)}>{t('file.examples')}: {t(`ex.${k}`)}</MenuItem>)}
          <MenuSep />
          <MenuItem danger onClick={() => { if (window.confirm(t('file.clear') + '?')) clearBoard(); }}>{t('file.clear')}</MenuItem>
        </Menu>
        <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" />
      </div>

      <Clock />

      <button className="grid h-8 w-8 place-items-center rounded-full border border-accent/60 text-sm font-bold text-accent transition hover:bg-accent hover:text-bg-0" title={t('tut.open')} aria-label={t('tut.open')}
        onClick={() => { if (!hasParts || window.confirm(t('tut.restart.confirm'))) useStore.getState().startTutorial(); }}>?</button>

      {user ? (
        <Menu label={<span className="inline-flex items-center gap-1.5"><span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-[10px] font-bold text-bg-0">{(user.name || user.email)[0].toUpperCase()}</span><span className="hidden max-w-[90px] truncate 2xl:inline">{user.name || user.email}</span>{user.school && <span className="rounded bg-accent/20 px-1 text-[9px] font-bold text-accent">EDU</span>}</span>} title={user.email}>
          <div className="px-3 py-1.5 text-[11px] text-slate-400">{user.email}</div>
          <MenuItem onClick={() => openModal('circuits')}>{t('home.circuits')}</MenuItem>
          <MenuItem onClick={() => openModal('settings')}>{t('home.settings')}</MenuItem>
          <MenuSep />
          <MenuItem danger onClick={async () => { await signOut(); useStore.getState().setUser(null); setToast(t('auth.signedout')); }}>{t('auth.logout')}</MenuItem>
        </Menu>
      ) : (
        <button className="btn" onClick={() => openModal('auth', 'login')}>{t('auth.login')}</button>
      )}
      <button className="btn" onClick={() => openModal('settings')} title={t('home.settings')} aria-label={t('home.settings')}>⚙</button>
    </header>
  );
}
