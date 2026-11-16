import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { useT, LANGS } from '../i18n.js';
import { ShowcaseScene } from '../three/ShowcaseScene.js';
import { BOARD_TYPES } from '../engine/geometry.js';
import { importProjectFile } from './fileio.js';
import { signOut } from '../auth/auth.js';

const Ico = ({ d, size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS = {
  new: <><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></>,
  circuits: <><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  tutorial: <><circle cx="12" cy="12" r="9" /><path d="M10 8.5l5 3.5-5 3.5z" /></>,
  import: <><path d="M12 3v12M7 10l5 5 5-5M4 20h16" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};

// Pill button: shows icon + label; on hover/focus it widens and reveals the description.
function HomeButton({ icon, label, desc, onClick, primary, delay = 0 }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{ animationDelay: `${delay}ms` }}
      className={`home-btn group flex w-[17.5rem] animate-slideUp flex-col overflow-hidden rounded-2xl border px-3 py-2.5 text-left backdrop-blur-sm hover:w-[27rem] focus-visible:w-[27rem] focus-visible:outline-none ${primary ? 'border-accent/70 bg-accent-dim/35' : 'border-bg-3 bg-bg-1/70'}`}
    >
      <span className="flex items-center gap-3">
        <span className={`home-btn-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl ${primary ? 'bg-accent text-bg-0' : 'bg-bg-3 text-accent'}`}><Ico d={ICONS[icon]} /></span>
        <span className="font-techsub text-lg font-semibold tracking-wide text-white">{label}</span>
        <span className="home-btn-arrow ml-auto pr-1 text-accent" aria-hidden="true">→</span>
      </span>
      <span className="home-btn-desc block overflow-hidden pl-[3.25rem] pr-2 text-[12.5px] leading-snug text-slate-300">{desc}</span>
    </button>
  );
}

function UserChip() {
  const t = useT();
  const user = useStore((s) => s.user);
  const { openModal, setUser, setToast } = useStore.getState();
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <button className="btn !px-3 !py-1.5 !text-[13px]" onClick={() => openModal('auth', 'login')}>{t('auth.login')}</button>
        <button className="btn btn-accent !px-3 !py-1.5 !text-[13px]" onClick={() => openModal('auth', 'register')}>{t('auth.register')}</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-full border border-bg-3 bg-bg-1/80 py-1 pl-1 pr-3 backdrop-blur">
      <span className="grid h-8 w-8 place-items-center rounded-full bg-accent text-sm font-bold text-bg-0">{(user.name || user.email)[0].toUpperCase()}</span>
      <div className="leading-tight">
        <div className="max-w-[190px] truncate text-xs font-semibold text-white">{user.name || user.email}</div>
        <div className="flex items-center gap-1 text-[10px] text-slate-400">
          {user.school && <span className="rounded bg-accent/20 px-1 font-semibold text-accent">EDU</span>}
          {user.role === 'teacher' ? t('role.teacher') : t('role.student')}
        </div>
      </div>
      <button className="ml-1 text-[11px] text-slate-400 hover:text-white" onClick={async () => { await signOut(); setUser(null); setToast(t('auth.signedout')); }}>{t('auth.logout')}</button>
    </div>
  );
}

export default function Home() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const user = useStore((s) => s.user);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const fileRef = useRef(null);
  const lastTouch = useRef(0);
  const [index, setIndex] = useState(0);
  const [glFail, setGlFail] = useState(false);
  const { openModal, setLang } = useStore.getState();

  useEffect(() => {
    let sc = null;
    try {
      sc = new ShowcaseScene(canvasRef.current);
      sc.onInteract = () => { lastTouch.current = Date.now(); };
      sc.start();
      sceneRef.current = sc;
    } catch (e) { setGlFail(true); }
    return () => { if (sc) sc.dispose(); sceneRef.current = null; };
  }, []);
  useEffect(() => { if (sceneRef.current) sceneRef.current.setIndex(index); }, [index]);
  useEffect(() => {
    const id = setInterval(() => { if (Date.now() - lastTouch.current > 9000) setIndex((i) => (i + 1) % BOARD_TYPES.length); }, 7000);
    return () => clearInterval(id);
  }, []);
  const go = (i) => { lastTouch.current = Date.now(); setIndex((i + BOARD_TYPES.length) % BOARD_TYPES.length); };
  const cur = BOARD_TYPES[index];

  const importFile = async () => {
    try { await importProjectFile(fileRef.current); } catch (e) { useStore.getState().setToast(String(e.message || e)); }
  };

  return (
    <div className="home-bg relative h-full w-full overflow-hidden">
      {/* 3D showcase */}
      <canvas ref={canvasRef} className="absolute inset-y-0 right-0 h-full w-full cursor-grab touch-none active:cursor-grabbing lg:w-[68%]" aria-label={t('home.showcase')} />
      {glFail && <div className="absolute right-10 top-1/2 max-w-xs -translate-y-1/2 text-center text-sm text-slate-500">{t('home.nogl')}</div>}

      {/* top bar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-end gap-4 p-4">
        <div className="pointer-events-auto flex items-center gap-3">
          <select className="field !w-auto !bg-bg-1/80 !text-sm" value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t('lang')}>
            {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>
          <UserChip />
        </div>
      </div>

      {/* title + buttons */}
      <div className="pointer-events-none relative z-10 flex h-full flex-col justify-center gap-7 px-8 pb-10 pt-16 sm:px-14">
        <div className="animate-slideUp">
          <div className="mb-2 flex items-center gap-2 font-techsub text-sm font-semibold uppercase tracking-[.35em] text-accent/90">
            <span className="h-px w-10 bg-accent/70" /> {t('home.kicker')}
          </div>
          <h1 className="tech-title text-5xl font-extrabold leading-[1.05] sm:text-6xl xl:text-7xl">Breadboard<br />Digitale</h1>
          <p className="mt-4 max-w-md font-techsub text-xl font-medium leading-snug text-slate-300">{t('home.tagline')}</p>
        </div>
        <div className="pointer-events-auto flex flex-col gap-2.5">
          <HomeButton primary icon="new" label={t('home.new')} desc={t('home.new.desc')} onClick={() => openModal('newproject')} delay={80} />
          <HomeButton icon="circuits" label={t('home.circuits')} desc={user ? t('home.circuits.desc') : t('home.circuits.desc.guest')} onClick={() => openModal('circuits')} delay={150} />
          <HomeButton icon="tutorial" label={t('home.tutorial')} desc={t('home.tutorial.desc')} onClick={() => useStore.getState().startTutorial()} delay={220} />
          <HomeButton icon="import" label={t('file.import')} desc={t('home.import.desc')} onClick={importFile} delay={290} />
          <HomeButton icon="settings" label={t('home.settings')} desc={t('home.settings.desc')} onClick={() => openModal('settings')} delay={360} />
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" />

      {/* carousel controls */}
      <div className="pointer-events-none absolute bottom-12 right-0 z-10 flex w-full flex-col items-center gap-2 lg:w-[68%]">
        <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-bg-3 bg-bg-1/75 px-3 py-1.5 backdrop-blur">
          <button className="grid h-8 w-8 place-items-center rounded-full text-slate-300 transition hover:bg-accent hover:text-bg-0" onClick={() => go(index - 1)} aria-label="Previous">‹</button>
          <div className="min-w-[14rem] text-center">
            <div className="font-techsub text-base font-semibold text-white">{t.L(cur.name)}</div>
            <div className="text-[11px] text-slate-400">{t.L(cur.desc)}</div>
          </div>
          <button className="grid h-8 w-8 place-items-center rounded-full text-slate-300 transition hover:bg-accent hover:text-bg-0" onClick={() => go(index + 1)} aria-label="Next">›</button>
        </div>
        <div className="pointer-events-auto flex gap-2">
          {BOARD_TYPES.map((b, i) => <button key={b.id} onClick={() => go(i)} aria-label={b.id} className={`h-2 rounded-full transition-all ${i === index ? 'w-7 bg-accent' : 'w-2 bg-bg-3 hover:bg-slate-500'}`} />)}
        </div>
        <div className="text-[11px] text-slate-500">{t('home.drag')}</div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10 flex h-8 items-center justify-between px-5 text-[11px] text-slate-500">
        <span>{t('app.credit')}</span><span>v2.0.0</span>
      </div>
    </div>
  );
}
