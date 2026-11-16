import React, { useMemo, useState } from 'react';
import Modal from './Modal.jsx';
import { useStore } from '../store.js';
import { useT } from '../i18n.js';
import { signIn, signUp, authMode } from '../auth/auth.js';
import { validateEmailSync, isSchoolEmail, passwordIssue } from '../auth/emailCheck.js';

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^a-zA-Z0-9]/.test(pw)) s++;
  return Math.min(4, s);
}

export default function AuthModal() {
  const t = useT();
  const tab = useStore((s) => s.authTab);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('student');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);
  const [touched, setTouched] = useState(false);
  const reg = tab === 'register';
  const cloud = authMode() === 'cloud';

  const ev = useMemo(() => (email ? validateEmailSync(email) : null), [email]);
  const school = !!(ev && ev.ok && isSchoolEmail(email));
  const emailMsg = (code, suggestion) => {
    if (code === 'typo') return `${t('auth.err.typo')} ${suggestion || ''}`;
    return t(`auth.err.email.${code}`, t('auth.err.email.format'));
  };
  const setTab = (x) => { setErr(null); setInfo(null); useStore.getState().openModal('auth', x); };

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setInfo(null);
    if (reg && password !== password2) { setErr({ text: t('auth.err.mismatch') }); return; }
    setBusy(true);
    try {
      const res = reg ? await signUp({ email, password, role, name: name.trim() }) : await signIn({ email, password });
      if (res.needsConfirm) { setInfo(t('auth.confirm').replace('{email}', res.email)); return; }
      useStore.getState().setUser(res.user);
      useStore.getState().openModal('welcome');
    } catch (x) {
      const code = x.code || 'unknown';
      let text;
      if (code === 'invalid_email') text = emailMsg(x.reason, x.suggestion);
      else if (code === 'weak_password') text = t(`auth.err.pw.${x.reason || 'short'}`);
      else text = t(`auth.err.${code}`, t('auth.err.unknown'));
      setErr({ text, suggestion: x.suggestion });
    } finally { setBusy(false); }
  };

  const pwIssue = reg && password ? passwordIssue(password) : null;
  const st = strength(password);

  return (
    <Modal title={reg ? t('auth.register') : t('auth.login')} subtitle={t('auth.sub')} onClose={() => useStore.getState().closeModal()}>
      <div className="mb-4 grid grid-cols-2 rounded-lg bg-bg-0 p-1 text-xs font-semibold">
        {['login', 'register'].map((k) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-md py-1.5 transition ${tab === k ? 'bg-accent text-bg-0' : 'text-slate-400 hover:text-white'}`}>
            {t(k === 'login' ? 'auth.login' : 'auth.register')}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3" noValidate>
        {reg && (
          <label className="block text-[11px] uppercase tracking-wide text-slate-400">{t('auth.name')}
            <input className="field mt-1 !text-sm normal-case" value={name} maxLength={50} autoComplete="name" onChange={(e) => setName(e.target.value)} placeholder={t('auth.name.ph')} />
          </label>
        )}
        <label className="block text-[11px] uppercase tracking-wide text-slate-400">Email
          <input className={`field mt-1 !text-sm normal-case ${touched && ev && !ev.ok ? '!border-danger' : ''}`} type="email" value={email} autoComplete="email" inputMode="email"
            onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched(true)} placeholder="nome@gmail.com" required />
        </label>
        {touched && ev && !ev.ok && (
          <div className="-mt-1 text-[11px] text-danger">
            {emailMsg(ev.code, ev.suggestion)}
            {ev.suggestion && <button type="button" className="ml-2 underline" onClick={() => setEmail(ev.suggestion)}>{t('auth.use')}</button>}
          </div>
        )}
        {school && (
          <div className="flex items-center gap-2 rounded-lg border border-accent/50 bg-accent-dim/25 px-3 py-2 text-xs text-accent">
            <span aria-hidden="true">🎓</span> {t('auth.school.detected')}
          </div>
        )}

        <label className="block text-[11px] uppercase tracking-wide text-slate-400">Password
          <div className="relative mt-1">
            <input className="field !pr-16 !text-sm normal-case" type={show ? 'text' : 'password'} value={password} autoComplete={reg ? 'new-password' : 'current-password'} onChange={(e) => setPassword(e.target.value)} required />
            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-[10.5px] uppercase text-slate-400 hover:text-white" onClick={() => setShow((v) => !v)}>{show ? t('auth.hide') : t('auth.show')}</button>
          </div>
        </label>
        {reg && (
          <>
            <div className="-mt-1 flex items-center gap-2">
              <div className="flex h-1.5 flex-1 gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className={`flex-1 rounded ${i < st ? (st < 2 ? 'bg-danger' : st < 3 ? 'bg-warn' : 'bg-accent') : 'bg-bg-3'}`} />)}</div>
              <span className="text-[10.5px] text-slate-500">{pwIssue ? t(`auth.err.pw.${pwIssue}`) : t('auth.pw.ok')}</span>
            </div>
            <label className="block text-[11px] uppercase tracking-wide text-slate-400">{t('auth.password2')}
              <input className="field mt-1 !text-sm normal-case" type={show ? 'text' : 'password'} value={password2} autoComplete="new-password" onChange={(e) => setPassword2(e.target.value)} required />
            </label>
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wide text-slate-400">{t('auth.role')}</div>
              <div className="grid grid-cols-2 gap-2">
                {['student', 'teacher'].map((r) => (
                  <button key={r} type="button" onClick={() => setRole(r)} className={`rounded-lg border px-3 py-2 text-sm transition ${role === r ? 'border-accent bg-accent-dim/30 text-white' : 'border-bg-3 bg-bg-2 text-slate-300 hover:border-accent/60'}`}>
                    {r === 'student' ? '🎒 ' : '🧑‍🏫 '}{t(`role.${r}`)}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {err && <div className="rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 text-xs text-danger" role="alert">{err.text}{err.suggestion && <button type="button" className="ml-2 underline" onClick={() => { setEmail(err.suggestion); setErr(null); }}>{t('auth.use')}</button>}</div>}
        {info && <div className="rounded-lg border border-accent/50 bg-accent-dim/20 px-3 py-2 text-xs text-accent" role="status">{info}</div>}

        <button type="submit" disabled={busy} className="btn btn-accent w-full !py-2.5 !text-sm">{busy ? t('auth.wait') : reg ? t('auth.register') : t('auth.login')}</button>
      </form>
      <p className="mt-3 text-center text-[10.5px] leading-snug text-slate-500">{cloud ? t('auth.mode.cloud') : t('auth.mode.local')}</p>
    </Modal>
  );
}
