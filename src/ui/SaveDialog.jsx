import React, { useState } from 'react';
import Modal from './Modal.jsx';
import { useStore } from '../store.js';
import { useT } from '../i18n.js';
import { saveCircuit } from '../cloud/circuits.js';
import { exportProjectFile } from './fileio.js';

export default function SaveDialog() {
  const t = useT();
  const user = useStore((s) => s.user);
  const board = useStore((s) => s.board);
  const [name, setName] = useState(useStore.getState().projectName || '');
  const [copy, setCopy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const close = () => useStore.getState().closeModal();

  if (!user) {
    return (
      <Modal title={t('save.title')} onClose={close}>
        <p className="text-sm text-slate-300">{t('save.needlogin')}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={close}>{t('common.cancel')}</button>
          <button className="btn btn-accent" onClick={() => useStore.getState().openModal('auth', 'login')}>{t('auth.login')}</button>
        </div>
      </Modal>
    );
  }
  const submit = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) { setErr(t('save.err.name')); return; }
    setBusy(true); setErr(null);
    try {
      const st = useStore.getState();
      st.setProjectName(n);
      const row = await saveCircuit(user, { name: n, board_type: board, data: st.serialize() });
      useStore.setState({ cloudId: row.id });
      if (copy) await exportProjectFile();
      st.setToast(user.mode === 'cloud' ? t('save.ok.cloud') : t('save.ok.local'));
      close();
    } catch (x) { setErr(`${t('save.err')} ${x.message || x}`); } finally { setBusy(false); }
  };
  return (
    <Modal title={t('save.title')} subtitle={user.mode === 'cloud' ? t('save.sub.cloud') : t('save.sub.local')} onClose={close}>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-[11px] uppercase tracking-wide text-slate-400">{t('new.name')}
          <input className="field mt-1 !text-sm normal-case" value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t('new.name.ph')} />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> {t('save.copy')}</label>
        <p className="text-[11px] text-slate-500">{t('save.overwrite')}</p>
        {err && <div className="rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn" onClick={close}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-accent" disabled={busy}>{busy ? t('auth.wait') : t('file.save')}</button>
        </div>
      </form>
    </Modal>
  );
}
