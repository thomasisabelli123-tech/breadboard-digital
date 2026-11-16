// Export / import of circuits as .bbd.json files (Electron dialogs, or browser download / file picker).
import { useStore } from '../store.js';
import { translate } from '../i18n.js';

const MAX_BYTES = 8 * 1024 * 1024;
const tr = (key) => translate(useStore.getState().lang, key);

export const fileSlug = (name) => (String(name || 'circuit').trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'circuit');

export async function exportProjectFile() {
  const st = useStore.getState();
  const text = JSON.stringify(st.serialize(), null, 2);
  const fname = `${fileSlug(st.projectName)}.bbd.json`;
  if (window.breadboardDigital && window.breadboardDigital.saveProject) return window.breadboardDigital.saveProject(text, fname);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = fname;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  return true;
}

// Reads a project file and loads it. Returns true on success. `fileInput` is a hidden <input type=file> used outside Electron.
export async function importProjectFile(fileInput) {
  let text = null;
  if (window.breadboardDigital && window.breadboardDigital.openProject) text = await window.breadboardDigital.openProject();
  else if (fileInput) {
    text = await new Promise((resolve) => {
      const onChange = async () => { fileInput.removeEventListener('change', onChange); const f = fileInput.files[0]; fileInput.value = ''; resolve(f ? await f.text() : null); };
      fileInput.addEventListener('change', onChange);
      fileInput.click();
    });
  }
  if (!text) return false;
  if (text.length > MAX_BYTES) throw new Error(tr('import.toolarge'));
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (_) { throw new Error(tr('import.invalid')); }
  const st = useStore.getState();
  if (!st.loadProject(data)) throw new Error(tr('import.invalid'));
  // an imported file is a new, unsaved circuit: never overwrite the cloud copy of another one
  useStore.setState({ cloudId: null });
  const dropped = (useStore.getState().loadReport || {}).dropped || 0;
  useStore.getState().setToast(dropped ? tr('import.dropped').replace('{n}', dropped) : tr('import.ok'));
  return true;
}
