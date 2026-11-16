import React, { useCallback, useEffect, useState } from 'react';
import Modal from './Modal.jsx';
import { useStore } from '../store.js';
import { useT } from '../i18n.js';
import { boardTypeDef } from '../engine/geometry.js';
import { listCircuits, loadCircuit, deleteCircuit } from '../cloud/circuits.js';
import { BoardPreview } from './BoardPicker.jsx';
import { importProjectFile } from './fileio.js';

export default function MyCircuits() {
  const t = useT();
  const user = useStore((s) => s.user);
  const [rows, setRows] = useState(null);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const fileRef = React.useRef(null);
  const close = () => useStore.getState().closeModal();

  const refresh = useCallback(async () => {
    if (!user) return;
    setRows(null); setErr(null);
    try { const r = await listCircuits(user); setRows(r.rows); setOffline(r.offline); } catch (x) { setErr(String(x.message || x)); setRows([]); }
  }, [user]);
  useEffect(() => { refresh(); }, [refresh]);

  if (!user) {
    return (
      <Modal title={t('my.title')} onClose={close}>
        <p className="text-sm text-slate-300">{t('my.needlogin')}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={close}>{t('common.cancel')}</button>
          <button className="btn" onClick={() => useStore.getState().openModal('auth', 'register')}>{t('auth.register')}</button>
          <button className="btn btn-accent" onClick={() => useStore.getState().openModal('auth', 'login')}>{t('auth.login')}</button>
        </div>
      </Modal>
    );
  }
  const open = async (r) => {
    setBusy(r.id); setErr(null);
    try {
      const c = await loadCircuit(user, r.id);
      const data = { ...c.data, name: c.name, board: c.data.board || c.board_type };
      if (useStore.getState().loadProject(data)) useStore.setState({ cloudId: r.id, projectName: c.name });
    } catch (x) { setErr(`${t('my.err.open')} ${x.message || x}`); } finally { setBusy(null); }
  };
  const del = async (r) => {
    if (!window.confirm(t('my.confirm.delete').replace('{name}', r.name))) return;
    setBusy(r.id);
    try { await deleteCircuit(user, r.id); await refresh(); } catch (x) { setErr(String(x.message || x)); } finally { setBusy(null); }
  };
  const importFile = async () => {
    try { await importProjectFile(fileRef.current); } catch (x) { setErr(`${t('my.err.import')} ${x.message || x}`); }
  };
  const fmtDate = (d) => { try { return new Date(d).toLocaleString(t.lang === 'it' ? 'it-IT' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }); } catch (_) { return ''; } };

  return (
    <Modal title={t('my.title')} subtitle={`${user.email} · ${user.mode === 'cloud' ? t('my.cloud') : t('my.local')}`} onClose={close} size="lg">
      {offline && <div className="mb-3 rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 text-xs text-warn">{t('my.offline')}</div>}
      {err && <div className="mb-3 rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger">{err}</div>}
      {rows === null ? (
        <div className="py-10 text-center text-sm text-slate-400">{t('auth.wait')}</div>
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-400">{t('my.empty')}</div>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="group flex gap-3 rounded-xl border border-bg-3 bg-bg-2 p-3 transition hover:-translate-y-0.5 hover:border-accent hover:shadow-lg">
              <div className="grid w-24 shrink-0 place-items-center rounded-lg bg-bg-0 p-1.5"><BoardPreview id={r.board_type} width={80} /></div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="truncate text-sm font-semibold text-white" title={r.name}>{r.name}</div>
                <div className="truncate text-[11px] text-slate-400">{t.L(boardTypeDef(r.board_type).name)}</div>
                <div className="text-[10.5px] text-slate-500">{fmtDate(r.updated_at)}</div>
                <div className="mt-auto flex gap-1.5 pt-2">
                  <button className="btn btn-accent !py-1" disabled={busy === r.id} onClick={() => open(r)}>{t('my.open')}</button>
                  <button className="btn btn-danger !py-1" disabled={busy === r.id} onClick={() => del(r)}>{t('my.delete')}</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex items-center justify-between border-t border-bg-3 pt-3">
        <button className="btn" onClick={importFile}>{t('file.import')}</button>
        <button className="btn" onClick={refresh}>↻ {t('my.refresh')}</button>
      </div>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" />
    </Modal>
  );
}
