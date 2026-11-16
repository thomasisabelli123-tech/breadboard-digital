import React from 'react';
import Modal from './Modal.jsx';
import { useStore } from '../store.js';
import { useT } from '../i18n.js';
import { isFeaturedSchool } from '../auth/emailCheck.js';
import { tutorialSeen, markTutorialSeen } from '../auth/auth.js';

const Cap = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 9l10-5 10 5-10 5z" /><path d="M6 11.5V16c0 1.2 2.7 2.5 6 2.5s6-1.3 6-2.5v-4.5" /><path d="M22 9v6" /></svg>
);

export default function Welcome() {
  const t = useT();
  const user = useStore((s) => s.user);
  if (!user) return null;
  const seen = tutorialSeen(user.email);
  const first = user.name || user.email.split('@')[0];
  const isTeacher = user.role === 'teacher';
  const roleLabel = isTeacher ? t('role.teacher') : t('role.student');
  const close = () => { markTutorialSeen(user.email); useStore.getState().closeModal(); };
  const startTutorial = () => { markTutorialSeen(user.email); useStore.getState().startTutorial(); };
  const tips = [1, 2, 3, 4, 5].map((i) => t(`school.tip.${isTeacher ? 'teacher' : 'student'}.${i}`));

  if (user.school) {
    return (
      <Modal size="lg" onClose={close}>
        <div className="-m-5 overflow-hidden rounded-2xl">
          <div className="relative flex items-center gap-4 overflow-hidden bg-gradient-to-r from-teal-900 via-bg-2 to-bg-1 px-6 py-6">
            <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-accent/10 blur-2xl" />
            <div className="grid h-16 w-16 shrink-0 animate-floaty place-items-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/60"><Cap /></div>
            <div className="relative">
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-accent/60 bg-accent/10 px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-widest text-accent">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> {t('school.badge')}
              </div>
              <h2 className="font-tech text-2xl font-bold text-white">{t('school.welcome').replace('{role}', roleLabel)}</h2>
              <div className="mt-0.5 text-sm text-slate-300">{t('school.hello').replace('{name}', first)} · <span className="text-accent">{isFeaturedSchool(user.email) ? user.schoolName : user.schoolName}</span></div>
            </div>
          </div>
          <div className="grid gap-5 p-6 md:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="panel-title mb-2">{t('school.tips.title')}</div>
              <ul className="space-y-2">
                {tips.map((x, i) => (
                  <li key={i} className="flex gap-2.5 rounded-lg border border-bg-3 bg-bg-2 px-3 py-2 text-[13px] leading-snug text-slate-200">
                    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/20 text-[11px] font-bold text-accent">{i + 1}</span>{x}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col justify-between gap-4">
              <div className="rounded-xl border border-accent/40 bg-accent-dim/20 p-4">
                <div className="text-sm font-semibold text-white">{t('school.tutorial.title')}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-300">{t('school.tutorial.text')}</p>
                <button className={`btn btn-accent mt-3 w-full !py-2.5 !text-sm ${seen ? '' : 'animate-glowPulse'}`} onClick={startTutorial}>▶ {t('welcome.tutorial')}</button>
              </div>
              <button className="btn w-full !py-2" onClick={close}>{t('welcome.continue')}</button>
            </div>
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={t('welcome.title').replace('{name}', first)} subtitle={`${roleLabel} · ${user.email}`} onClose={close}>
      <p className="text-sm leading-relaxed text-slate-300">{t('welcome.text')}</p>
      <div className="mt-4 flex flex-col gap-2">
        <button className={`btn btn-accent w-full !py-2.5 !text-sm ${seen ? '' : 'animate-glowPulse'}`} onClick={startTutorial}>▶ {t('welcome.tutorial')}</button>
        <button className="btn w-full !py-2" onClick={close}>{t('welcome.continue')}</button>
      </div>
    </Modal>
  );
}
