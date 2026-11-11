import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildPac, normalizeRule, normalizeProxyConfig, normalizeProfile, normalizeRoute, matchProxyRule, DIRECT_PROXY_ID, emptyProxyConfig } from '../src/proxy-core.mjs';
import { parseProxyImport, mergeProxyImport } from '../src/proxy-import.mjs';

const rule = patch => normalizeRule({ id: 'one', domain: 'example.com', host: '127.0.0.1', port: '8080', scheme: 'http', ...patch });
const config = (...rules) => normalizeProxyConfig({ enabled: true, rules });
test('proxy inputs canonicalize domains, Unicode and IPv4/IPv6 without accepting code or paths in endpoints', () => {
  assert.equal(rule({ domain: 'https://EXAMPLE.COM/path?q=1' }).domain, 'example.com');
  assert.equal(rule({ domain: '*.example.com' }).subdomains, true);
  assert.equal(rule({ host: '[2001:db8::1]' }).host, '2001:db8::1');
  assert.equal(rule({ host: '::1' }).host, '::1');
  assert.equal(rule({ domain: 'https://[::1]/', subdomains: true }).subdomains, false);
  assert.equal(rule({ domain: 'tên.vn' }).domain, new URL('http://tên.vn').hostname);
  for (const patch of [{ host: 'x;return DIRECT' }, { host: 'http://proxy:80' }, { host: 'user@host' }, { host: 'x/path' }, { port: 0 }, { port: 65536 }, { port: 1.5 }, { port: '1e3' }, { domain: 'file:///x' }, { domain: 'https://u:p@example.com' }, { scheme: 'ftp' }, { scheme: 'socks5', username: 'u' }, { password: 'no user' }, { username: 'u\r\n' }]) assert.throws(() => rule(patch), JSON.stringify(patch));
});

test('PAC and auth selection agree about specificity, subdomain boundaries and disabled rules', () => {
  const data = config(rule({ subdomains: true }), rule({ id: 'specific', domain: 'api.example.com', host: '::1', port: 1080, scheme: 'socks5' }), rule({ id: 'off', domain: 'disabled.test', enabled: false }));
  const context = vm.createContext({});
  vm.runInContext(buildPac(data), context);
  const samples = [
    ['https://example.com/a', 'PROXY 127.0.0.1:8080'], ['http://www.example.com/', 'PROXY 127.0.0.1:8080'],
    ['https://api.example.com/', 'SOCKS5 [::1]:1080'], ['http://evilexample.com/', 'DIRECT'], ['http://example.com.evil.test/', 'DIRECT'], ['http://disabled.test/', 'DIRECT'], ['file:///example.com', 'DIRECT'],
  ];
  for (const [url, expected] of samples) {
    const host = new URL(url).hostname;
    assert.equal(context.FindProxyForURL(url, host), expected);
    assert.equal(!!matchProxyRule(data, url), expected !== 'DIRECT');
  }
  const v6 = config(rule({ domain: '[2001:db8::2]', host: '2001:db8::3', scheme: 'https', port: 443 }));
  vm.runInContext(buildPac(v6), context);
  assert.equal(context.FindProxyForURL('https://[2001:db8::2]/', '[2001:db8::2]'), 'HTTPS [2001:db8::3]:443');
  assert.ok(!buildPac(config(rule({ username: 'secret-user', password: 'secret-password' }))).includes('secret'));
});

test('duplicate websites and inconsistent credentials for the same proxy are rejected', () => {
  assert.throws(() => config(rule(), rule({ id: 'two' })), /proxyDuplicateSite/);
  assert.throws(() => config(rule({ username: 'one' }), rule({ id: 'two', domain: 'other.test', username: 'two' })), /proxyAuthConflict/);
  assert.equal(config(rule(), rule({ id: 'two', domain: 'other.test' })).rules.length, 2);
});

function workerFixture(initial = {}) {
  const listeners = {};
  const event = name => ({ addListener: callback => { listeners[name] = callback; } });
  let stored = { ...initial };
  let session = {};
  let ownership = 'controllable_by_this_extension';
  const calls = [];
  const chrome = {
    runtime: { id: 'test', getURL: path => `chrome-extension://test/${path}`, onMessage: event('message'), onStartup: event('startup'), onInstalled: event('installed') },
    storage: { local: { get: async () => structuredClone(stored), set: async patch => { stored = { ...stored, ...structuredClone(patch) }; } }, session: { get: async () => session, set: async patch => { session = { ...session, ...patch }; }, remove: async key => { delete session[key]; } } },
    proxy: { settings: { get: async () => ({ levelOfControl: ownership }), set: async spec => { calls.push(spec); ownership = 'controlled_by_this_extension'; }, clear: async () => { calls.push('clear'); ownership = 'controllable_by_this_extension'; } }, onProxyError: event('proxyError') },
    webRequest: { onAuthRequired: event('auth'), onCompleted: event('completed'), onErrorOccurred: event('failed') },
  };
  vm.runInNewContext(readFileSync(new URL('../dist/proxy-worker.js', import.meta.url), 'utf8'), { chrome, URL, structuredClone });
  const sender = { id: 'test', url: 'chrome-extension://test/popup.html' };
  const send = message => new Promise(resolve => listeners.message({ type: 'DINKIT_PROXY', ...message }, sender, resolve));
  return { listeners, send, calls, stored: () => stored, ownership: value => { ownership = value; }, auth: details => new Promise(resolve => listeners.auth(details, resolve)) };
}

test('worker stays off by default, serializes edits, applies PAC and releases ownership on disable', async () => {
  const w = workerFixture();
  assert.equal((await w.send({ action: 'state' })).config.enabled, false);
  assert.equal(w.calls.length, 0);
  await Promise.all([w.send({ action: 'upsert', rule: rule() }), w.send({ action: 'upsert', rule: rule({ id: 'two', domain: 'two.test' }) })]);
  assert.equal(w.stored().dinkit_proxy.rules.length, 2);
  assert.equal(w.calls.length, 0);
  assert.equal((await w.send({ action: 'toggle', enabled: true })).ok, true);
  assert.equal(w.calls.at(-1).value.mode, 'pac_script');
  assert.equal(w.calls.at(-1).value.pacScript.mandatory, true);
  await w.send({ action: 'toggle', enabled: false });
  assert.equal(w.calls.at(-1), 'clear');
  assert.equal(w.listeners.message({ type: 'DINKIT_PROXY', action: 'toggle', enabled: true }, { id: 'test', url: 'https://untrusted.test' }, () => {}), undefined);
});

test('external proxy control blocks activation and rolls back the saved toggle', async () => {
  const w = workerFixture();
  await w.send({ action: 'upsert', rule: rule() });
  w.ownership('controlled_by_other_extensions');
  const result = await w.send({ action: 'toggle', enabled: true });
  assert.equal(result.error, 'proxyControlled');
  assert.equal(w.stored().dinkit_proxy.enabled, false);
  assert.equal(w.calls.length, 0);
  await w.send({ action: 'toggle', enabled: false });
  assert.equal(w.calls.length, 0, 'never clears another controller');
});

test('proxy credentials are limited to the configured server, route and a single attempt', async () => {
  const w = workerFixture();
  await w.send({ action: 'upsert', rule: rule({ username: 'user', password: 'password' }) });
  await w.send({ action: 'toggle', enabled: true });
  const details = { isProxy: true, requestId: 'req', url: 'https://example.com/', challenger: { host: '127.0.0.1', port: 8080 } };
  for (const patch of [{ isProxy: false }, { challenger: { host: 'evil.test', port: 8080 } }, { url: 'https://other.test/' }]) assert.equal(JSON.stringify(await w.auth({ ...details, ...patch })), '{}');
  assert.equal(JSON.stringify(await w.auth(details)), JSON.stringify({ authCredentials: { username: 'user', password: 'password' } }));
  assert.equal((await w.auth(details)).cancel, true);
  w.listeners.completed(details);
  assert.ok((await w.auth(details)).authCredentials);
  await w.send({ action: 'toggle', enabled: false });
  assert.equal(JSON.stringify(await w.auth({ ...details, requestId: 'other' })), '{}');
});

test('stored proxy configuration is restored when the worker restarts', async () => {
  const w = workerFixture({ dinkit_proxy: config(rule()) });
  assert.equal((await w.send({ action: 'state' })).config.enabled, true);
  assert.equal(w.calls.length, 1);
});

test('Bypass Flow profiles, DIRECT, wildcards, URL prefixes and first-match ordering agree with PAC', () => {
  const profile = normalizeProfile({ id: 'shared', type: 'HTTPS', name: 'Shared', host: '::1', port: 443 });
  const data = normalizeProxyConfig({ version: 2, enabled: true, profiles: [profile], rules: [
    { id: 'direct', pattern: 'private.example.com', proxyId: DIRECT_PROXY_ID },
    { id: 'prefix', pattern: 'http://path.test:8080/news/', proxyId: 'shared' },
    { id: 'wildcard', pattern: '*.example.com', proxyId: 'shared' },
  ] });
  const context = vm.createContext({}); vm.runInContext(buildPac(data), context);
  for (const [url, expected] of [
    ['https://private.example.com/', 'DIRECT'], ['https://example.com/', 'DIRECT'],
    ['https://a.example.com/', 'HTTPS [::1]:443'], ['http://path.test:8080/news/article', 'HTTPS [::1]:443'],
    ['http://path.test:8080/other', 'DIRECT'], ['http://path.test.evil:8080/news/article', 'DIRECT'],
  ]) {
    assert.equal(context.FindProxyForURL(url, new URL(url).hostname), expected);
    assert.equal(Boolean(matchProxyRule(data, url)), expected !== 'DIRECT');
  }
  data.rules.unshift(normalizeRoute({ id: 'first', pattern: 'example.com', proxyId: 'shared' }));
  assert.equal(matchProxyRule(data, 'https://private.example.com/').id, 'shared', 'first match wins even when a later rule is more specific');
  assert.throws(() => normalizeRoute({ id: 'invalid', pattern: 'https://example.com/path', proxyId: 'shared' }), /proxyHttpsPath/);
});

test('upgrading old DinKit rules preserves routing and subsequent manual order', () => {
  const data = config(rule({ subdomains: true }), rule({ id: 'specific', domain: 'api.example.com', host: '::1' }));
  assert.equal(data.version, 2);
  assert.equal(data.rules[0].id, 'specific');
  assert.equal(matchProxyRule(data, 'https://api.example.com').host, '::1');
  data.rules.reverse();
  assert.equal(matchProxyRule(normalizeProxyConfig(data), 'https://api.example.com').host, '127.0.0.1');
});

test('bulk proxy imports accept Bypass Flow URI, colon, userinfo, pipe, CSV and IPv6 formats', () => {
  const parsed = parseProxyImport([
    '# comment', 'http://user:pa%40ss@proxy.test:8080', '127.0.0.1:8000:user:pass:with:colon',
    'user:pass@127.0.0.2:8080', '127.0.0.3:8080@user:pass', 'HTTPS|::1|443|user|p%ss',
    'SOCKS5,127.0.0.4,1080', '127.0.0.5,8080,user,pass', '[::1]:1080', 'socks5://[2001:db8::1]:1080',
  ].join('\n'));
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.profiles.length, 9);
  assert.equal(parsed.profiles[0].password, 'pa@ss');
  assert.equal(parsed.profiles[1].password, 'pass:with:colon');
  assert.equal(parsed.profiles[4].host, '::1');
  assert.equal(parsed.profiles[4].password, 'p%ss');
  assert.equal(parsed.profiles[5].scheme, 'socks5');
});

test('source JSON imports retain route order and DIRECT, deduplicate proxies and keep activation unchanged', () => {
  const parsed = parseProxyImport(JSON.stringify({ enabled: true, proxies: [
    { id: 'source', name: 'Source proxy', type: 'HTTP', host: '127.0.0.1', port: 8080 },
    { id: 'duplicate', type: 'HTTP', host: '127.0.0.1', port: 8080 },
  ], routes: [
    { id: 'exception', pattern: 'private.example.com', proxyId: DIRECT_PROXY_ID },
    { id: 'site', pattern: 'example.com', proxyId: 'duplicate' },
  ] }));
  assert.deepEqual(parsed.errors, []);
  const data = normalizeProxyConfig(mergeProxyImport(emptyProxyConfig(), parsed));
  assert.equal(data.enabled, false);
  assert.equal(data.profiles.length, 1);
  assert.equal(data.rules[0].proxyId, DIRECT_PROXY_ID);
  data.enabled = true;
  assert.equal(matchProxyRule(data, 'https://private.example.com'), null);
  assert.equal(matchProxyRule(data, 'https://www.example.com').name, 'Source proxy');
  const repeated = normalizeProxyConfig(mergeProxyImport(data, parsed));
  assert.equal(repeated.profiles.length, 1);
  assert.equal(repeated.rules.length, 2);
});

test('invalid imports report row numbers without exposing credentials and never partially merge', () => {
  for (const text of ['good.test:8080\nbad:0:user:secret', 'socks5://user:secret@proxy.test:1080', '[null]', '{not-json}', JSON.stringify([{ host: 'proxy', port: '8080junk' }])]) {
    const parsed = parseProxyImport(text);
    assert.ok(parsed.errors.length);
    assert.ok(!JSON.stringify(parsed.errors).includes('secret'));
    assert.throws(() => mergeProxyImport(emptyProxyConfig(), parsed));
  }
});

test('profile CRUD, rule order, DIRECT, import and route matching run through the worker', async () => {
  const w = workerFixture();
  await w.send({ action: 'import', text: 'http://proxy.test:8080' });
  let stored = w.stored().dinkit_proxy;
  const profile = stored.profiles[0];
  assert.equal(stored.enabled, false);
  await w.send({ action: 'upsert', rule: { id: 'all', pattern: 'example.com', proxyId: profile.id } });
  await w.send({ action: 'upsert', rule: { id: 'direct', pattern: 'private.example.com', proxyId: DIRECT_PROXY_ID } });
  assert.equal((await w.send({ action: 'removeProfile', id: profile.id })).error, 'proxyProfileInUse');
  await w.send({ action: 'toggle', enabled: true });
  assert.ok((await w.send({ action: 'match', url: 'https://private.example.com/' })).result.label.includes('8080'));
  await w.send({ action: 'moveRule', id: 'direct', direction: -1 });
  assert.equal((await w.send({ action: 'match', url: 'https://private.example.com/' })).result.label, 'DIRECT');
  const before = JSON.stringify(w.stored());
  assert.equal((await w.send({ action: 'import', text: 'good:8080\nbad' })).ok, false);
  assert.equal(JSON.stringify(w.stored()), before);
});
