import React, { useEffect } from 'react';
import TopBar from './ui/TopBar.jsx';
import Library from './ui/Library.jsx';
import Viewport from './ui/Viewport.jsx';
import Inspector from './ui/Inspector.jsx';
import InstrumentDock from './ui/Instruments.jsx';
import Home from './ui/Home.jsx';
import AuthModal from './ui/AuthModal.jsx';
import Welcome from './ui/Welcome.jsx';
import MyCircuits from './ui/MyCircuits.jsx';
import SaveDialog from './ui/SaveDialog.jsx';
import SettingsModal from './ui/SettingsModal.jsx';
import NewProject from './ui/NewProject.jsx';
import Tutorial from './ui/Tutorial.jsx';
import ToastHost from './ui/ToastHost.jsx';
import ErrorBoundary from './ui/ErrorBoundary.jsx';
import { useStore } from './store.js';
import { useT } from './i18n.js';
import { restoreSession } from './auth/auth.js';

function Editor() {
  const t = useT();
  return (
    <div className="flex h-full flex-col">
      <ErrorBoundary><TopBar /></ErrorBoundary>
      <div className="flex min-h-0 flex-1">
        <ErrorBoundary><Library /></ErrorBoundary>
        <main className="flex min-w-0 flex-1 flex-col">
          <ErrorBoundary><Viewport /></ErrorBoundary>
          <ErrorBoundary><InstrumentDock /></ErrorBoundary>
        </main>
        <ErrorBoundary><Inspector /></ErrorBoundary>
      </div>
      <footer className="flex h-6 shrink-0 items-center justify-between border-t border-bg-3 bg-bg-1 px-3 text-[10.5px] text-slate-500">
        <span>{t('app.title')} — {t('app.credit')}</span>
        <span>v2.1.1</span>
      </footer>
    </div>
  );
}

export default function App() {
  const screen = useStore((s) => s.screen);
  const modal = useStore((s) => s.modal);
  const lang = useStore((s) => s.lang);

  // <html lang> always matches the UI language, and translate="no" keeps browser translators (which rewrite the DOM and break React) away
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.setAttribute('translate', 'no');
  }, [lang]);

  // restore a previous login (Supabase session or local account) at start-up
  useEffect(() => {
    let alive = true;
    restoreSession().then((u) => { if (alive && u) useStore.getState().setUser(u); }).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const show = (m) => { const msg = String((m && m.message) || m || ''); if (msg && !/ResizeObserver loop/i.test(msg)) useStore.getState().setToast(`⚠ ${msg.slice(0, 140)}`); };
    const onErr = (e) => { console.error('[app] uncaught', e.error || e.message); show(e.error || e.message); };
    const onRej = (e) => { console.error('[app] unhandled rejection', e.reason); show(e.reason); };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej); };
  }, []);

  return (
    <>
      <ErrorBoundary>{screen === 'home' ? <Home /> : <Editor />}</ErrorBoundary>
      {modal === 'auth' && <AuthModal />}
      {modal === 'welcome' && <Welcome />}
      {modal === 'circuits' && <MyCircuits />}
      {modal === 'save' && <SaveDialog />}
      {modal === 'settings' && <SettingsModal />}
      {modal === 'newproject' && <NewProject />}
      <Tutorial />
      <ToastHost />
    </>
  );
}
