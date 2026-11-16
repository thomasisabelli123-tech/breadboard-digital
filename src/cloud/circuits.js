// Circuit storage: Supabase table `circuits` (see supabase/schema.sql) with a per-account local cache,
// or localStorage only when the .env keys are not set.
import { getSupabase } from '../auth/supabase.js';

const cacheKey = (email) => `bbd.circuits.v1:${email}`;
const readCache = (email) => { try { return JSON.parse(localStorage.getItem(cacheKey(email)) || '[]'); } catch (_) { return []; } };
const writeCache = (email, rows) => { try { localStorage.setItem(cacheKey(email), JSON.stringify(rows)); } catch (_) { /* ignore */ } };
const uid = () => 'loc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const meta = (r) => ({ id: r.id, name: r.name, board_type: r.board_type, updated_at: r.updated_at, local: !!r.local });

export async function listCircuits(user) {
  const sb = user.mode === 'cloud' ? await getSupabase() : null;
  if (sb) {
    const { data, error } = await sb.from('circuits').select('id,name,board_type,updated_at').eq('user_email', user.email).order('updated_at', { ascending: false });
    if (!error) return { rows: data || [], offline: false };
    return { rows: readCache(user.email).map(meta), offline: true, error: error.message };
  }
  return { rows: readCache(user.email).map(meta).sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))), offline: false };
}

// Saves (insert or overwrite by name). Returns the stored row { id, name, board_type, updated_at }.
export async function saveCircuit(user, { name, board_type, data }) {
  const now = new Date().toISOString();
  const cache = readCache(user.email);
  const sb = user.mode === 'cloud' ? await getSupabase() : null;
  let row;
  if (sb) {
    const { data: res, error } = await sb.from('circuits')
      .upsert({ user_email: user.email, name, board_type, data, updated_at: now }, { onConflict: 'user_email,name' })
      .select('id,name,board_type,updated_at').single();
    if (error) throw new Error(error.message);
    row = res;
  } else {
    const prev = cache.find((r) => r.name === name);
    row = { id: prev ? prev.id : uid(), name, board_type, updated_at: now, local: true };
  }
  // keep a local copy of every circuit (also used when the cloud is unreachable)
  const i = cache.findIndex((r) => r.name === name);
  const entry = { ...row, data, local: !sb };
  if (i >= 0) cache[i] = entry; else cache.unshift(entry);
  writeCache(user.email, cache);
  return meta(row);
}

export async function loadCircuit(user, id) {
  const sb = user.mode === 'cloud' ? await getSupabase() : null;
  if (sb) {
    const { data, error } = await sb.from('circuits').select('data,name,board_type').eq('id', id).eq('user_email', user.email).single();
    if (!error && data) return { name: data.name, board_type: data.board_type, data: data.data };
  }
  const hit = readCache(user.email).find((r) => r.id === id);
  if (!hit) throw new Error('not found');
  return { name: hit.name, board_type: hit.board_type, data: hit.data };
}

export async function deleteCircuit(user, id) {
  const sb = user.mode === 'cloud' ? await getSupabase() : null;
  if (sb) {
    const { error } = await sb.from('circuits').delete().eq('id', id).eq('user_email', user.email);
    if (error) throw new Error(error.message);
  }
  writeCache(user.email, readCache(user.email).filter((r) => r.id !== id));
}
