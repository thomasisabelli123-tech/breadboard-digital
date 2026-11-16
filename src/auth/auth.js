// Email + password accounts. Cloud mode (Supabase Auth) when .env has the keys, otherwise local accounts in localStorage.
import { getSupabase, hasSupabase } from './supabase.js';
import { validateEmail, validateEmailSync, passwordIssue, normalizeEmail, isSchoolEmail, schoolName } from './emailCheck.js';

const USERS_KEY = 'bbd.users.v1';
const SESSION_KEY = 'bbd.session.v1';

export class AuthError extends Error {
  constructor(code, extra = {}) { super(code); this.code = code; Object.assign(this, extra); }
}

const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* ignore */ } };

export const authMode = () => (hasSupabase() ? 'cloud' : 'local');

function makeUser(email, role, name, mode) {
  const e = normalizeEmail(email);
  const school = isSchoolEmail(e);
  return { email: e, name: name || e.split('@')[0], role: role === 'teacher' ? 'teacher' : 'student', school, schoolName: school ? schoolName(e) : '', mode };
}

// ---- local (offline) accounts: salted PBKDF2/SHA-256 hashes. This is convenience storage for a single PC, not a security boundary.
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hashPassword(pw, salt) {
  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 120000 }, key, 256);
    return hex(bits);
  } catch (_) {
    // very old runtimes without WebCrypto: simple iterated string hash (still salted)
    let h = 5381;
    for (let r = 0; r < 4000; r++) for (const ch of salt + pw + r) h = ((h << 5) + h + ch.charCodeAt(0)) | 0;
    return 'x' + (h >>> 0).toString(16);
  }
}
const newSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));

async function localSignUp(email, password, role, name) {
  const users = lsGet(USERS_KEY, {});
  if (users[email]) throw new AuthError('exists');
  const salt = newSalt();
  users[email] = { salt, hash: await hashPassword(password, salt), role, name: name || '', created: Date.now() };
  lsSet(USERS_KEY, users);
  lsSet(SESSION_KEY, { email });
  return makeUser(email, role, name, 'local');
}
async function localSignIn(email, password) {
  const users = lsGet(USERS_KEY, {});
  const u = users[email];
  if (!u || (await hashPassword(password, u.salt)) !== u.hash) throw new AuthError('invalid_credentials');
  lsSet(SESSION_KEY, { email });
  return makeUser(email, u.role, u.name, 'local');
}

function mapSupabaseError(err) {
  const m = String((err && err.message) || err || '').toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) return new AuthError('exists');
  if (m.includes('invalid login')) return new AuthError('invalid_credentials');
  if (m.includes('email not confirmed')) return new AuthError('confirm_email');
  if (m.includes('password')) return new AuthError('weak_password');
  if (m.includes('rate limit') || m.includes('too many')) return new AuthError('rate_limit');
  if (m.includes('fetch') || m.includes('network')) return new AuthError('network');
  return new AuthError('unknown', { detail: String((err && err.message) || err) });
}

async function checkCredentials(email, password, { strict }) {
  const v = await validateEmail(email);
  if (!v.ok) throw new AuthError('invalid_email', { reason: v.code, suggestion: v.suggestion });
  if (strict) {
    const issue = passwordIssue(password);
    if (issue) throw new AuthError('weak_password', { reason: issue });
  } else if (!password) throw new AuthError('invalid_credentials');
  return v.email;
}

// Returns { user, needsConfirm }
export async function signUp({ email, password, role, name }) {
  const e = await checkCredentials(email, password, { strict: true });
  const sb = await getSupabase();
  if (!sb) return { user: await localSignUp(e, password, role, name), needsConfirm: false };
  const { data, error } = await sb.auth.signUp({ email: e, password, options: { data: { role, name: name || '' } } });
  if (error) throw mapSupabaseError(error);
  if (!data.session) return { user: null, needsConfirm: true, email: e }; // email confirmation is enabled in Supabase
  return { user: makeUser(e, role, name, 'cloud'), needsConfirm: false };
}

export async function signIn({ email, password }) {
  const v = validateEmailSync(email);
  if (!v.ok) throw new AuthError('invalid_email', { reason: v.code, suggestion: v.suggestion });
  const sb = await getSupabase();
  if (!sb) return { user: await localSignIn(v.email, password) };
  const { data, error } = await sb.auth.signInWithPassword({ email: v.email, password });
  if (error) throw mapSupabaseError(error);
  const md = (data.user && data.user.user_metadata) || {};
  return { user: makeUser(v.email, md.role, md.name, 'cloud') };
}

export async function signOut() {
  const sb = await getSupabase();
  if (sb) { try { await sb.auth.signOut(); } catch (_) { /* ignore */ } }
  try { localStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
}

// Restore a previous session at start-up. Returns a user or null.
export async function restoreSession() {
  const sb = await getSupabase();
  if (sb) {
    try {
      const { data } = await sb.auth.getSession();
      const u = data && data.session && data.session.user;
      if (u && u.email) { const md = u.user_metadata || {}; return makeUser(u.email, md.role, md.name, 'cloud'); }
    } catch (_) { /* ignore */ }
    return null;
  }
  const s = lsGet(SESSION_KEY, null);
  const users = lsGet(USERS_KEY, {});
  if (s && users[s.email]) return makeUser(s.email, users[s.email].role, users[s.email].name, 'local');
  return null;
}

// "tutorial already shown" flag per account (this PC)
const tutKey = (email) => `bbd.tutorial.done:${normalizeEmail(email)}`;
export const tutorialSeen = (email) => { try { return localStorage.getItem(tutKey(email)) === '1'; } catch (_) { return false; } };
export const markTutorialSeen = (email) => { try { localStorage.setItem(tutKey(email), '1'); } catch (_) { /* ignore */ } };
