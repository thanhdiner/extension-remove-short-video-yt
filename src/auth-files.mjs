import { normalizeAccount, normalizeAccounts, decryptBackup } from './auth-core.mjs';
import { parseMigrationUri, createGoogleAuthenticatorMigrationUri } from './auth-migration.mjs';

let qrReady;
export function loadAuthQr() {
  if (globalThis.dinkitAuthQr) return Promise.resolve(globalThis.dinkitAuthQr);
  if (!qrReady) qrReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('dist/auth-qr.js');
    script.onload = () => { script.remove(); if (globalThis.dinkitAuthQr) resolve(globalThis.dinkitAuthQr); else { qrReady = null; reject(new Error('authQrError')); } };
    script.onerror = () => { script.remove(); qrReady = null; reject(new Error('authQrError')); };
    document.head.append(script);
  });
  return qrReady;
}
export function parseAuthPayload(payload) {
  if (typeof payload === 'string') {
    const value = payload.trim();
    if (/^otpauth-migration:/i.test(value)) return { ...parseMigrationUri(value), groups: [], groupOrder: [] };
    if (/^otpauth:/i.test(value)) return { accounts: [normalizeAccount({ secret: value })], groups: [], groupOrder: [] };
    try { payload = JSON.parse(value); } catch { throw new Error('authImportError'); }
  }
  return { accounts: normalizeAccounts(payload), groups: Array.isArray(payload?.groups) ? payload.groups : [], groupOrder: Array.isArray(payload?.groupOrder) ? payload.groupOrder : [] };
}
export async function readAuthFiles(files, password) {
  if (!files.length || files.length > 100) throw new Error('authImportError');
  const result = { accounts: [], groups: [], groupOrder: [], batches: [] };
  for (const file of files) {
    if (file.size > (file.type.startsWith('image/') ? 15 : 5) * 1024 * 1024) throw new Error('authFileSizeError');
    let parts;
    if (file.type.startsWith('image/')) parts = await (await loadAuthQr()).scan(file);
    else {
      const text = await file.text();
      let payload;
      try { payload = JSON.parse(text); } catch { payload = text; }
      if (payload?.encrypted) payload = await decryptBackup(payload, password);
      parts = [payload];
    }
    for (const part of parts) {
      const parsed = parseAuthPayload(part);
      result.accounts.push(...parsed.accounts); result.groups.push(...parsed.groups); result.groupOrder.push(...parsed.groupOrder);
      if (parsed.batch) result.batches.push(parsed.batch);
    }
  }
  return result;
}
export function backupPayload(state) {
  return { app: 'Quick 2FA', version: 1, exportedAt: new Date().toISOString(), accounts: state.accounts, groups: state.groups, groupOrder: state.groupOrder };
}
export async function downloadAuthFile(data, filename, mime = 'application/json') {
  const url = typeof data === 'string' && data.startsWith('data:image/') ? data : URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: mime }));
  try { await chrome.downloads.download({ url, filename, saveAs: true, conflictAction: 'uniquify' }); }
  catch { throw new Error('authExportError'); }
  finally { if (url.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(url), 60000); }
}
export async function exportAuthQr(accounts) {
  if (!accounts.length || accounts.some(account => account.period !== 30)) throw new Error('authQrPeriodError');
  const qr = await loadAuthQr();
  const batches = [];
  const divide = async rows => {
    const uri = createGoogleAuthenticatorMigrationUri(rows, { batchSize: 1, batchIndex: 0, batchId: 1 });
    try { await qr.toDataURL(uri, { errorCorrectionLevel: 'M', width: 720, margin: 2 }); batches.push(rows); }
    catch { if (rows.length === 1) throw new Error('authQrSizeError'); const half = Math.ceil(rows.length / 2); await divide(rows.slice(0, half)); await divide(rows.slice(half)); }
  };
  for (let i = 0; i < accounts.length; i += 10) await divide(accounts.slice(i, i + 10));
  const batchId = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
  for (let i = 0; i < batches.length; i++) {
    const uri = createGoogleAuthenticatorMigrationUri(batches[i], { batchSize: batches.length, batchIndex: i, batchId });
    const image = await qr.toDataURL(uri, { errorCorrectionLevel: 'M', width: 720, margin: 2 });
    await downloadAuthFile(image, `dinkit-google-auth-part-${i + 1}-of-${batches.length}-${new Date().toISOString().slice(0, 10)}.png`);
  }
  return batches.length;
}
