import React, { useEffect } from 'react';

export default function Modal({ title, subtitle, onClose, children, size = 'md', badge }) {
  useEffect(() => {
    if (!onClose) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  const w = size === 'lg' ? 'max-w-4xl' : size === 'sm' ? 'max-w-sm' : 'max-w-md';
  return (
    <div className="fixed inset-0 z-50 grid animate-fadeIn place-items-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={`relative max-h-[92vh] w-full ${w} animate-popIn overflow-auto rounded-2xl border border-bg-3 bg-bg-1 shadow-[0_30px_80px_rgba(0,0,0,.6)]`} role="dialog" aria-modal="true">
        {(title || onClose) && (
          <div className="flex items-start justify-between gap-3 border-b border-bg-3 px-5 py-3.5">
            <div>
              <div className="flex items-center gap-2 text-base font-semibold text-white">{title}{badge}</div>
              {subtitle && <div className="mt-0.5 text-xs text-slate-400">{subtitle}</div>}
            </div>
            {onClose && <button className="grid h-7 w-7 place-items-center rounded-md text-slate-400 transition hover:bg-bg-3 hover:text-white" onClick={onClose} aria-label="Close">✕</button>}
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
