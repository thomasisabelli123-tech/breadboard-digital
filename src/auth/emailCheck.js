// Email validation: strict syntax, known-provider allowlist, school (.edu.it) detection,
// blocklist of disposable / placeholder domains, typo suggestions, and an optional real-domain check
// through DNS-over-HTTPS (the check is skipped, not failed, when the PC is offline).

export const SCHOOL_DOMAIN_SUFFIX = '.edu.it';
export const FEATURED_SCHOOL = {
  domain: 'iisdavincisangiovanniinfiore.edu.it',
  name: 'IIS Da Vinci — San Giovanni in Fiore',
};

// Mainstream providers: accepted without a network lookup.
const KNOWN = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.it', 'hotmail.com', 'hotmail.it', 'live.com', 'live.it', 'msn.com',
  'yahoo.com', 'yahoo.it', 'ymail.com', 'icloud.com', 'me.com', 'mac.com', 'libero.it', 'virgilio.it', 'tiscali.it', 'alice.it',
  'tim.it', 'pec.it', 'legalmail.it', 'aruba.it', 'fastwebnet.it', 'vodafone.it', 'email.it', 'katamail.com', 'inwind.it', 'iol.it',
  'proton.me', 'protonmail.com', 'pm.me', 'aol.com', 'gmx.com', 'gmx.net', 'gmx.it', 'mail.com', 'yandex.com', 'zoho.com',
  'hey.com', 'fastmail.com', 'tutanota.com', 'tuta.io', FEATURED_SCHOOL.domain,
]);

// Placeholder / throw-away domains that are never a real person's mailbox.
const BLOCKED = new Set([
  'example.com', 'example.org', 'example.net', 'test.com', 'test.it', 'test.org', 'fake.com', 'fake.it', 'invalid', 'localhost',
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', 'grr.la', '10minutemail.com', '10minutemail.net',
  'tempmail.com', 'temp-mail.org', 'tempmail.net', 'yopmail.com', 'yopmail.fr', 'trashmail.com', 'getnada.com', 'dispostable.com',
  'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'emailondeck.com', 'mohmal.com', 'mintemail.com', 'spam4.me', 'mailnesia.com',
  'asdf.com', 'asd.com', 'qwerty.com', 'a.com', 'aa.com', 'abc.com', 'email.com.it', 'nomail.com', 'noemail.com',
]);

// Common typos of the big providers → suggestion.
const TYPOS = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.it': 'gmail.com',
  'gmail.con': 'gmail.com', 'gmal.com': 'gmail.com', 'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotnail.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outloook.com': 'outlook.com', 'outlook.con': 'outlook.com',
  'yaho.com': 'yahoo.com', 'yahooo.com': 'yahoo.com', 'yahoo.con': 'yahoo.com', 'yhoo.com': 'yahoo.com',
  'iclod.com': 'icloud.com', 'icloud.con': 'icloud.com', 'iclould.com': 'icloud.com',
  'libero.com': 'libero.it', 'liberio.it': 'libero.it', 'libero.iy': 'libero.it',
};

const LOCAL_RE = /^[a-z0-9]+(?:[._%+'-][a-z0-9]+)*$/;
const LABEL_RE = /^(?:[a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])$/;

export const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
export const emailDomain = (email) => normalizeEmail(email).split('@')[1] || '';

export function isSchoolEmail(email) {
  const d = emailDomain(email);
  return d.endsWith(SCHOOL_DOMAIN_SUFFIX) && d.length > SCHOOL_DOMAIN_SUFFIX.length && !d.startsWith('.');
}
export function schoolName(email) {
  const d = emailDomain(email);
  if (d === FEATURED_SCHOOL.domain) return FEATURED_SCHOOL.name;
  return d;
}
export const isFeaturedSchool = (email) => emailDomain(email) === FEATURED_SCHOOL.domain;

// Synchronous checks. Returns { ok, code, suggestion?, email, domain, school }.
// code ∈ 'empty' | 'format' | 'domain' | 'blocked' | 'typo'
export function validateEmailSync(raw) {
  const email = normalizeEmail(raw);
  const bad = (code, extra = {}) => ({ ok: false, code, email, domain: emailDomain(email), school: false, ...extra });
  if (!email) return bad('empty');
  if (email.length > 254 || /\s/.test(email)) return bad('format');
  const parts = email.split('@');
  if (parts.length !== 2) return bad('format');
  const [local, domain] = parts;
  if (!local || local.length > 64 || !LOCAL_RE.test(local)) return bad('format');
  const labels = domain.split('.');
  if (labels.length < 2 || !labels.every((l) => LABEL_RE.test(l))) return bad('domain');
  const tld = labels[labels.length - 1];
  if (!(/^[a-z]{2,24}$/.test(tld) || /^xn--[a-z0-9-]{2,20}$/.test(tld))) return bad('domain');
  if (domain === 'edu.it') return bad('domain');
  if (BLOCKED.has(domain)) return bad('blocked');
  if (TYPOS[domain]) return bad('typo', { suggestion: `${local}@${TYPOS[domain]}` });
  return { ok: true, code: 'ok', email, domain, school: isSchoolEmail(email), known: KNOWN.has(domain) };
}

async function dohHas(domain, type, timeoutMs) {
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`, { signal: ctl ? ctl.signal : undefined, headers: { accept: 'application/dns-json' } });
    if (!res.ok) return null;
    const j = await res.json();
    if (j.Status === 3) return false; // NXDOMAIN
    return Array.isArray(j.Answer) && j.Answer.length > 0;
  } catch (_) {
    return null; // offline / blocked: unknown
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// Full validation: sync rules + "does this domain really exist and receive mail?" (fails open when offline).
export async function validateEmail(raw, { dns = true, timeoutMs = 4000 } = {}) {
  const r = validateEmailSync(raw);
  if (!r.ok || r.known || !dns) return r;
  const mx = await dohHas(r.domain, 'MX', timeoutMs);
  if (mx === true) return r;
  if (mx === null) return { ...r, unverified: true };
  const a = await dohHas(r.domain, 'A', timeoutMs); // some domains receive mail on their A record
  if (a === true) return r;
  if (a === null) return { ...r, unverified: true };
  return { ...r, ok: false, code: 'domain' };
}

export function passwordIssue(pw) {
  if (!pw || pw.length < 8) return 'short';
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'weak';
  return null;
}
