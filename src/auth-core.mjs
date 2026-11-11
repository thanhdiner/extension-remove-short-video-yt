export const AUTH_LIMIT = 1000;
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const fail = key => { throw new Error(key); };

export function normalizeAlgorithm(input = 'SHA-1') {
  const key = String(input).toUpperCase().replace(/-/g, '');
  const algorithm = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA512: 'SHA-512' }[key];
  if (!algorithm) fail('authAlgorithmError');
  return algorithm;
}
export function normalizeBase32(input) {
  if (typeof input !== 'string' || input.length > 4096) fail('authSecretError');
  const secret = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '');
  if (!/^[A-Z2-7]+$/.test(secret) || ![0, 2, 4, 5, 7].includes(secret.length % 8)) fail('authSecretError');
  const bytes = base32ToBytes(secret);
  if (!bytes.length || bytesToBase32(bytes) !== secret) fail('authSecretError');
  return secret;
}
export function base32ToBytes(secret) {
  let buffer = 0, bits = 0;
  const result = [];
  for (const char of secret) {
    const value = alphabet.indexOf(char);
    if (value < 0) fail('authSecretError');
    buffer = (buffer << 5) | value; bits += 5;
    if (bits >= 8) { bits -= 8; result.push((buffer >>> bits) & 255); }
  }
  return new Uint8Array(result);
}
export function bytesToBase32(bytes) {
  let buffer = 0, bits = 0, output = '';
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte; bits += 8;
    while (bits >= 5) { bits -= 5; output += alphabet[(buffer >>> bits) & 31]; }
  }
  if (bits) output += alphabet[(buffer << (5 - bits)) & 31];
  return output;
}
function text(value, max = 200) {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail('authAccountError');
  return value.trim();
}
export function normalizeAccount(input) {
  if (!input || typeof input !== 'object') fail('authAccountError');
  let value = { ...input };
  const secretInput = value.secret || value.uri || '';
  if (typeof secretInput !== 'string') fail('authSecretError');
  if (/^otpauth:/i.test(secretInput)) {
    let uri;
    try { uri = new URL(secretInput); } catch { fail('authUriError'); }
    if (uri.protocol !== 'otpauth:' || uri.hostname !== 'totp') fail('authTotpOnly');
    let label;
    try { label = decodeURIComponent(uri.pathname.slice(1)); } catch { fail('authUriError'); }
    const separator = label.indexOf(':');
    value = { ...value, secret: uri.searchParams.get('secret') || '', label: value.label || (separator < 0 ? label : label.slice(separator + 1)), issuer: value.issuer || uri.searchParams.get('issuer') || (separator < 0 ? '' : label.slice(0, separator)), digits: uri.searchParams.get('digits') || 6, period: uri.searchParams.get('period') || 30, algorithm: uri.searchParams.get('algorithm') || 'SHA1' };
  }
  const digits = Number(value.digits ?? 6), period = Number(value.period ?? 30);
  if (![6, 8].includes(digits) || !Number.isInteger(period) || period < 1 || period > 3600) fail('authParamsError');
  const id = value.id || crypto.randomUUID();
  if (typeof id !== 'string' || !/^[\w-]{1,100}$/.test(id)) fail('authAccountError');
  return { id, label: text(value.label || value.name || '') || '2FA', issuer: text(value.issuer || '', 80), secret: normalizeBase32(value.secret || secretInput), digits, period, algorithm: normalizeAlgorithm(value.algorithm), createdAt: typeof value.createdAt === 'string' ? value.createdAt.slice(0, 40) : new Date().toISOString() };
}
export function normalizeAccounts(payload) {
  const rows = Array.isArray(payload) ? payload : payload?.accounts;
  if (!Array.isArray(rows) || rows.length > AUTH_LIMIT) fail('authImportError');
  return rows.map(row => normalizeAccount({ ...row, id: crypto.randomUUID() }));
}
export const accountFingerprint = account => JSON.stringify([account.issuer, account.label, account.secret, account.algorithm, account.digits, account.period]);
export const emptyAuthState = () => ({ version: 1, accounts: [], groups: [], groupOrder: [], view: 'list' });
export function groupNames(state) {
  const names = [...new Set([...state.groups, ...state.accounts.map(account => account.issuer)].filter(Boolean))];
  return [...state.groupOrder.filter(name => names.includes(name)), ...names.filter(name => !state.groupOrder.includes(name)).sort((a, b) => a.localeCompare(b))];
}

// RFC 6238: use the entire 64-bit counter (including timestamps after 2038).
export async function generateTotp(account, timestamp = Math.floor(Date.now() / 1000)) {
  if (!Number.isFinite(timestamp) || timestamp < 0) fail('authParamsError');
  const counter = BigInt(Math.floor(timestamp / account.period));
  const message = new Uint8Array(8);
  new DataView(message.buffer).setBigUint64(0, counter, false);
  const key = await crypto.subtle.importKey('raw', base32ToBytes(account.secret), { name: 'HMAC', hash: account.algorithm }, false, ['sign']);
  const hash = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const offset = hash[hash.length - 1] & 15;
  const number = new DataView(hash.buffer).getUint32(offset, false) & 0x7fffffff;
  return String(number % 10 ** account.digits).padStart(account.digits, '0');
}
export function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
export function base64ToBytes(value) {
  if (typeof value !== 'string' || value.length > 8 * 1024 * 1024) fail('authImportError');
  try { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); } catch { fail('authImportError'); }
}
async function deriveKey(password, salt, iterations = 210000) {
  if (typeof password !== 'string' || password.length > 4096) fail('authPasswordError');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptBackup(payload, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(payload)));
  return { app: 'Quick 2FA', version: 1, encrypted: true, kdf: 'PBKDF2', iterations: 210000, salt: bytesToBase64(salt), iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)) };
}
export async function decryptBackup(payload, password) {
  try {
    if (!payload || payload.kdf !== 'PBKDF2' || !Number.isInteger(payload.iterations) || payload.iterations < 10000 || payload.iterations > 1000000) throw new Error();
    const salt = base64ToBytes(payload.salt), iv = base64ToBytes(payload.iv), cipher = base64ToBytes(payload.data);
    if (salt.length !== 16 || iv.length !== 12 || cipher.length < 16) throw new Error();
    const key = await deriveKey(password, salt, payload.iterations);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return JSON.parse(new TextDecoder().decode(plain));
  } catch { fail('authPasswordError'); }
}
