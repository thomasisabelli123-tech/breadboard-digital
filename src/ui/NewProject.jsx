import React, { useState } from 'react';
import Modal from './Modal.jsx';
import BoardPicker from './BoardPicker.jsx';
import { useStore } from '../store.js';
import { useT } from '../i18n.js';

export default function NewProject() {
  const t = useT();
  const closeModal = useStore((s) => s.closeModal);
  const defaultBoard = useStore((s) => s.defaultBoard);
  const [board, setBoard] = useState(defaultBoard);
  const [name, setName] = useState('');
  return (
    <Modal title={t('new.title')} subtitle={t('new.sub')} onClose={closeModal} size="lg">
      <label className="mb-3 block text-[11px] uppercase tracking-wide text-slate-400">{t('new.name')}
        <input className="field mt-1 !text-sm normal-case" value={name} maxLength={60} placeholder={t('new.name.ph')} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="mb-2 text-[11px] uppercase tracking-wide text-slate-400">{t('new.board')}</div>
      <BoardPicker value={board} onChange={setBoard} />
      <p className="mt-3 text-[11px] text-slate-500">{t('new.xray.hint')}</p>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn" onClick={closeModal}>{t('common.cancel')}</button>
        <button className="btn btn-accent !px-4 !py-2 !text-sm" onClick={() => useStore.getState().newProject(board, name.trim())}>{t('new.create')}</button>
      </div>
    </Modal>
  );
}
