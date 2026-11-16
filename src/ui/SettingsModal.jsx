import React from 'react';
import Modal from './Modal.jsx';
import { useStore } from '../store.js';
import { useT, LANGS } from '../i18n.js';
import { BOARD_TYPES } from '../engine/geometry.js';
import { authMode, signOut } from '../auth/auth.js';

// defined at module level so its children keep focus while a slider is dragged
function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-bg-3/70 py-2.5 last:border-0">
      <div className="text-sm text-slate-200">{label}</div>
      <div className="w-56 shrink-0">{children}</div>
    </div>
  );
}

export default function SettingsModal() {
  const t = useT();
  const s = useStore();
  return (
    <Modal title={t('settings.title')} onClose={s.closeModal}>
      <Row label={t('lang')}>
        <select className="field !text-sm" value={s.lang} onChange={(e) => s.setLang(e.target.value)}>{LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select>
      </Row>
      <Row label={t('settings.board')}>
        <select className="field !text-sm" value={s.defaultBoard} onChange={(e) => s.setDefaultBoard(e.target.value)}>{BOARD_TYPES.map((b) => <option key={b.id} value={b.id}>{t.L(b.name)}</option>)}</select>
      </Row>
      <Row label={`${t('light.level')} (${Math.round(s.lightLevel * 100)}%)`}>
        <input type="range" className="w-full" min="0.3" max="2" step="0.05" value={s.lightLevel} onChange={(e) => s.setLightLevel(parseFloat(e.target.value))} />
      </Row>
      <Row label={`${t('light.angle')} (${s.lightAngle}°)`}>
        <input type="range" className="w-full" min="-90" max="90" step="1" value={s.lightAngle} onChange={(e) => s.setLightAngle(parseInt(e.target.value, 10))} />
      </Row>
      <Row label={t('light.shadows')}><input type="checkbox" checked={s.shadows} onChange={(e) => s.setShadows(e.target.checked)} /></Row>
      <Row label={t('light.reflections')}><input type="checkbox" checked={s.reflections} onChange={(e) => s.setReflections(e.target.checked)} /></Row>
      <Row label={t('settings.storage')}>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${authMode() === 'cloud' ? 'bg-accent/20 text-accent' : 'bg-warn/15 text-warn'}`}>{authMode() === 'cloud' ? 'Supabase (cloud)' : t('settings.local')}</span>
      </Row>
      {s.user && (
        <Row label={s.user.email}>
          <button className="btn btn-danger w-full" onClick={async () => { await signOut(); s.setUser(null); s.closeModal(); s.setToast(t('auth.signedout')); }}>{t('auth.logout')}</button>
        </Row>
      )}
      <div className="mt-4 flex justify-end"><button className="btn btn-accent" onClick={s.closeModal}>{t('common.close')}</button></div>
    </Modal>
  );
}
