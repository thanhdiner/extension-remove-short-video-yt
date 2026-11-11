import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { encryptExport, decryptExport } from './fixtures/authen-crypto.mjs';
import { normalizeAccount, generateTotp, bytesToBase32, normalizeBase32, encryptBackup, decryptBackup, emptyAuthState, groupNames } from '../src/auth-core.mjs';
import { createGoogleAuthenticatorMigrationUri, parseMigrationUri } from '../src/auth-migration.mjs';
import { parseAuthPayload } from '../src/auth-files.mjs';
import { updateAuthState, createAuthStore } from '../src/auth-store.mjs';

const account = patch => normalizeAccount({ id: 'one', label: 'GitHub', issuer: 'Work', secret: 'JBSWY3DPEHPK3PXP', ...patch });
test('TOTP matches all 18 RFC 6238 Appendix B vectors for SHA1/SHA256/SHA512', async () => {
  const timestamps = [59, 1111111109, 1111111111, 1234567890, 2000000000, 20000000000];
  const vectors = {
    'SHA-1': ['94287082', '07081804', '14050471', '89005924', '69279037', '65353130'],
    'SHA-256': ['46119246', '68084774', '67062674', '91819424', '90698825', '77737706'],
    'SHA-512': ['90693936', '25091201', '99943326', '93441116', '38618901', '47863826'],
  };
  const base = '1234567890123456789012345678901234567890123456789012345678901234';
  for (const [algorithm, expected] of Object.entries(vectors)) {
    const keyLength = { 'SHA-1': 20, 'SHA-256': 32, 'SHA-512': 64 }[algorithm];
    const row = account({ secret: bytesToBase32(new TextEncoder().encode(base.slice(0, keyLength))), algorithm, digits: 8 });
    for (let index = 0; index < timestamps.length; index++) assert.equal(await generateTotp(row, timestamps[index]), expected[index], `${algorithm} at ${timestamps[index]}`);
  }
});

test('account parsing preserves TOTP URI parameters, issuer, Unicode and explicit custom periods', () => {
  const parsed = normalizeAccount({ secret: 'otpauth://totp/GitHub:ng%C6%B0%E1%BB%9Di%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=8&period=60&algorithm=SHA256' });
  assert.equal(parsed.label, 'người@example.com'); assert.equal(parsed.issuer, 'GitHub');
  assert.equal(parsed.digits, 8); assert.equal(parsed.period, 60); assert.equal(parsed.algorithm, 'SHA-256');
  assert.equal(normalizeBase32('jbsw y3dp-ehpk3pxp='), 'JBSWY3DPEHPK3PXP');
  for (const patch of [{ secret: 'otpauth://hotp/x?secret=JBSWY3DPEHPK3PXP' }, { secret: 'BAD!' }, { secret: 'A' }, { secret: 'AB' }, { digits: 7 }, { period: 0 }, { period: 30.5 }, { period: Infinity }, { algorithm: 'MD5' }, { label: '<script>\0' }]) assert.throws(() => account(patch));
});

test('plain Quick 2FA JSON and URI imports retain metadata and reject mixed invalid batches', () => {
  const backup = { accounts: [account({ period: 60, digits: 8, algorithm: 'SHA-512' })], groups: ['Work'] };
  const parsed = parseAuthPayload(JSON.stringify(backup));
  assert.equal(parsed.accounts[0].period, 60); assert.equal(parsed.accounts[0].algorithm, 'SHA-512');
  assert.deepEqual(parsed.groups, ['Work']);
  assert.equal(parseAuthPayload('otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP').accounts[0].label, 'Test');
  assert.throws(() => parseAuthPayload({ accounts: [account(), { secret: 'invalid!' }] }));
});

test('encrypted backup round-trips, rejects wrong passwords, tampering and hostile KDF parameters', async () => {
  const backup = { accounts: [account()], groups: ['Work'] };
  const encrypted = await encryptBackup(backup, 'test-password');
  assert.ok(!JSON.stringify(encrypted).includes('JBSWY3DPEHPK3PXP'));
  assert.deepEqual(await decryptBackup(encrypted, 'test-password'), backup);
  await assert.rejects(decryptBackup(encrypted, 'wrong'), /authPasswordError/);
  await assert.rejects(decryptBackup({ ...encrypted, iterations: 1e12 }, 'test-password'), /authPasswordError/);
  await assert.rejects(decryptBackup({ ...encrypted, iv: '' }, 'test-password'), /authPasswordError/);
  const corrupted = { ...encrypted, data: encrypted.data.slice(0, 5) + (encrypted.data[5] === 'A' ? 'B' : 'A') + encrypted.data.slice(6) };
  await assert.rejects(decryptBackup(corrupted, 'test-password'), /authPasswordError/);
});

test('encrypted files created by the original Authen implementation decrypt in DinKit and vice versa', async () => {
  const payload = { accounts: [account()] };
  const fromOriginal = await encryptExport(payload, 'compatible');
  assert.deepEqual(await decryptBackup(fromOriginal, 'compatible'), payload);
  const fromDinKit = await encryptBackup(payload, 'compatible');
  assert.equal(JSON.stringify(await decryptExport(fromDinKit, 'compatible')), JSON.stringify(payload));
});

test('Google migration QR retains algorithms, secrets, Unicode, digits and batch metadata', () => {
  const rows = [account({ label: 'Tiếng Việt 😀', algorithm: 'SHA-512', digits: 8 }), account({ id: 'two', label: 'Other', algorithm: 'SHA-256' })];
  const uri = createGoogleAuthenticatorMigrationUri(rows, { batchSize: 3, batchIndex: 1, batchId: 12345 });
  const parsed = parseMigrationUri(uri);
  assert.deepEqual(parsed.batch, { size: 3, index: 1, id: 12345 });
  for (let i = 0; i < rows.length; i++) for (const key of ['label', 'issuer', 'secret', 'algorithm', 'digits', 'period']) assert.equal(parsed.accounts[i][key], rows[i][key]);
  assert.throws(() => createGoogleAuthenticatorMigrationUri([account({ period: 60 })], { batchSize: 1, batchIndex: 0, batchId: 1 }), /authQrPeriodError/);
  for (const value of ['otpauth-migration://offline', 'otpauth-migration://offline?data=invalid', 'otpauth-migration://other?data=AQ==', 'https://example.com']) assert.throws(() => parseMigrationUri(value));
});

test('CRUD, grouping and reordering preserve accounts; deleting a group never deletes its codes', () => {
  let state = updateAuthState(emptyAuthState(), { action: 'upsert', account: account() });
  state = updateAuthState(state, { action: 'upsert', account: account({ id: 'two', label: 'Other', issuer: '' }) });
  assert.throws(() => updateAuthState(state, { action: 'upsert', account: account({ id: 'duplicate' }) }), /authDuplicate/);
  state = updateAuthState(state, { action: 'move', id: 'two', targetId: 'one' }); assert.equal(state.accounts[0].id, 'two');
  state = updateAuthState(state, { action: 'saveGroup', oldName: 'Work', name: 'Team' }); assert.equal(state.accounts[1].issuer, 'Team');
  state = updateAuthState(state, { action: 'saveGroup', name: 'Empty' });
  state = updateAuthState(state, { action: 'moveGroup', name: 'Team', direction: -1 }); assert.equal(groupNames(state)[0], 'Team');
  state = updateAuthState(state, { action: 'removeGroup', name: 'Team' }); assert.equal(state.accounts.length, 2); assert.equal(state.accounts[1].issuer, '');
  assert.throws(() => updateAuthState(state, { action: 'clear', confirm: '' }), /authConfirmError/);
  assert.equal(updateAuthState(state, { action: 'clear', confirm: 'DELETE ALL' }).accounts.length, 0);
});

test('imports are atomic and repeated Google QR batches only add new accounts', () => {
  const first = updateAuthState(emptyAuthState(), { action: 'import', accounts: [account(), account()] });
  assert.equal(first.accounts.length, 1);
  const second = updateAuthState(first, { action: 'import', accounts: [account(), account({ id: 'other', label: 'Other' })] });
  assert.equal(second.accounts.length, 2);
  const unchanged = JSON.stringify(second);
  assert.throws(() => updateAuthState(second, { action: 'import', accounts: [account({ label: 'New' }), { secret: 'bad!' }] }));
  assert.equal(JSON.stringify(second), unchanged);
});

test('serialized Authenticator writes survive concurrent saves and a failed write rolls back', async () => {
  let stored;
  let rejectWrite = false;
  const run = createAuthStore({ read: async () => stored && structuredClone(stored), write: async state => { if (rejectWrite) throw new Error('disk'); stored = state; } });
  await Promise.all([run({ action: 'upsert', account: account() }), run({ action: 'upsert', account: account({ id: 'two', label: 'Other' }) })]);
  assert.equal(stored.accounts.length, 2);
  rejectWrite = true;
  await assert.rejects(run({ action: 'remove', id: 'one' }));
  rejectWrite = false;
  assert.equal((await run({ action: 'state' })).state.accounts.length, 2);
});

test('dragging accounts across groups updates the group and places them before the drop target', () => {
  let state = emptyAuthState();
  for (const row of [account({ id: 'a', label: 'A', issuer: 'Work' }), account({ id: 'b', label: 'B', issuer: 'Personal' }), account({ id: 'c', label: 'C', issuer: 'Personal' })]) state = updateAuthState(state, { action: 'upsert', account: row });
  state = updateAuthState(state, { action: 'move', id: 'a', targetId: 'c' });
  assert.deepEqual(state.accounts.map(row => `${row.id}:${row.issuer}`), ['b:Personal', 'a:Personal', 'c:Personal']);
  state = updateAuthState(state, { action: 'saveGroup', name: 'Work' });
  state = updateAuthState(state, { action: 'moveToGroup', id: 'a', name: 'Work' });
  assert.equal(state.accounts.find(row => row.id === 'a').issuer, 'Work');
  assert.throws(() => updateAuthState(state, { action: 'moveToGroup', id: 'b', name: 'Missing' }), /authGroupError/);
});

test('dragging a group before another persists its display order', () => {
  let state = emptyAuthState();
  for (const name of ['Alpha', 'Beta', 'Gamma']) state = updateAuthState(state, { action: 'saveGroup', name });
  state = updateAuthState(state, { action: 'placeGroup', name: 'Gamma', targetName: 'Alpha' });
  assert.deepEqual(groupNames(state), ['Gamma', 'Alpha', 'Beta']);
  state = updateAuthState(state, { action: 'placeGroup', name: 'Gamma', targetName: 'Beta' });
  assert.deepEqual(groupNames(state), ['Alpha', 'Gamma', 'Beta']);
});

test('website content scripts and other extension pages cannot access the authenticator message handler', () => {
  let listener;
  vm.runInNewContext(readFileSync(new URL('../dist/auth-worker.js', import.meta.url), 'utf8'), { chrome: { runtime: { id: 'test', getURL: path => `chrome-extension://test/${path}`, onMessage: { addListener: callback => { listener = callback; } } } } });
  const message = { type: 'DINKIT_AUTH', action: 'state' };
  for (const sender of [{ id: 'test', url: 'https://site.example' }, { id: 'other', url: 'chrome-extension://test/popup.html' }, { id: 'test', url: 'chrome-extension://test/focus/blocked.html' }, { id: 'test', url: 'chrome-extension://test/popup.html.evil' }]) assert.equal(listener(message, sender, () => { throw new Error('must not answer'); }), undefined);
});
