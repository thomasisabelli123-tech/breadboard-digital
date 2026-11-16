// Keeps a render error inside one panel: the rest of the app (and the circuit) stays alive instead of the window going blank.
import React from 'react';
import { useT } from '../i18n.js';

function Fallback({ error, reset }) {
  const t = useT();
  return (
    <div className="m-3 rounded-md border border-danger/50 bg-bg-1 p-3 text-xs text-slate-300">
      <div className="font-semibold text-danger">{t('err.panel')}</div>
      <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[10px] text-slate-500">{String((error && error.message) || error)}</pre>
      <button className="btn mt-2" onClick={reset}>{t('err.retry')}</button>
    </div>
  );
}

export default class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; this.retries = []; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error('[UI] panel crashed:', error, info && info.componentStack);
    // DOM nodes moved by a browser translator / extension: remount the panel on fresh nodes (max 3 times in 10 s)
    if (/removeChild|insertBefore|NotFoundError|not a child/i.test(String((error && (error.name + ' ' + error.message)) || ''))) {
      const now = Date.now();
      this.retries = this.retries.filter((x) => now - x < 10000);
      if (this.retries.length < 3) { this.retries.push(now); setTimeout(() => this.setState({ error: null }), 0); }
    }
  }
  render() {
    if (this.state.error) return <Fallback error={this.state.error} reset={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}
