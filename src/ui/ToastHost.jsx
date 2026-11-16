import React, { useEffect } from 'react';
import { useStore } from '../store.js';

export default function ToastHost() {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => useStore.getState().setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);
  if (!toast) return null;
  return <div className="fixed left-1/2 top-16 z-[70] max-w-[80vw] -translate-x-1/2 animate-popIn rounded-md border border-warn/60 bg-bg-1 px-3.5 py-2 text-xs text-warn shadow-xl">{toast}</div>;
}
