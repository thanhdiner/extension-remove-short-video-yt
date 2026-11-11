import { PROXY_KEY, DIRECT_PROXY_ID, emptyProxyConfig, normalizeProxyConfig, normalizeRule, normalizeProfile, normalizeRoute, buildPac, matchProxyRule, proxyAddress } from './proxy-core.mjs';
import { parseProxyImport, mergeProxyImport } from './proxy-import.mjs';

let queue = Promise.resolve();
let applied = null;
const authAttempts = new Set();
const serialize = task => { const result = queue.catch(() => {}).then(task); queue = result; return result; };
const readConfig = async () => { const data = await chrome.storage.local.get(PROXY_KEY); return data[PROXY_KEY] ? normalizeProxyConfig(data[PROXY_KEY]) : emptyProxyConfig(); };
const control = () => chrome.proxy.settings.get({ incognito: false });
async function apply(config) {
  const current = await control();
  if (!config.enabled || !config.rules.some(rule => rule.enabled)) {
    if (current.levelOfControl === 'controlled_by_this_extension') await chrome.proxy.settings.clear({ scope: 'regular' });
    applied = null;
    authAttempts.clear();
    return;
  }
  if (!['controllable_by_this_extension', 'controlled_by_this_extension'].includes(current.levelOfControl)) throw new Error('proxyControlled');
  await chrome.proxy.settings.set({ value: { mode: 'pac_script', pacScript: { data: buildPac(config), mandatory: true } }, scope: 'regular' });
  applied = config;
  authAttempts.clear();
}
async function state() {
  const config = await readConfig();
  const current = await control();
  return { config, control: current.levelOfControl, error: (await chrome.storage.session.get('dinkit_proxy_error')).dinkit_proxy_error || '' };
}
async function mutate(message) {
  const before = await readConfig();
  let next = structuredClone(before);
  if (message.action === 'toggle') next.enabled = message.enabled === true;
  else if (message.action === 'saveInline') {
    const rule = normalizeRule(message.rule);
    const profile = normalizeProfile({ ...rule, id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`, name: rule.domain });
    const route = normalizeRoute({ id: rule.id, pattern: message.rule.domain, subdomains: rule.subdomains, proxyId: profile.id, enabled: rule.enabled });
    const index = next.profiles.findIndex(item => item.id === profile.id);
    if (index < 0) next.profiles.push(profile); else next.profiles[index] = profile;
    const routeIndex = next.rules.findIndex(item => item.id === route.id);
    if (routeIndex < 0) next.rules.push(route); else next.rules[routeIndex] = route;
  }
  else if (message.action === 'upsert') {
    const rule = message.rule?.pattern !== undefined ? normalizeRoute(message.rule) : normalizeRule(message.rule);
    const index = next.rules.findIndex(item => item.id === rule.id);
    if (index < 0) next.rules.push(rule); else next.rules[index] = rule;
  } else if (message.action === 'saveProfile') {
    const profile = normalizeProfile(message.profile);
    const index = next.profiles.findIndex(item => item.id === profile.id);
    if (index < 0) next.profiles.push(profile); else next.profiles[index] = profile;
  } else if (message.action === 'removeProfile') {
    if (next.rules.some(rule => rule.proxyId === message.id)) throw new Error('proxyProfileInUse');
    next.profiles = next.profiles.filter(profile => profile.id !== message.id);
  } else if (message.action === 'moveRule') {
    const index = next.rules.findIndex(rule => rule.id === message.id);
    const target = index + (message.direction === -1 ? -1 : 1);
    if (index >= 0 && target >= 0 && target < next.rules.length) [next.rules[index], next.rules[target]] = [next.rules[target], next.rules[index]];
  } else if (message.action === 'import') next = mergeProxyImport(next, parseProxyImport(message.text, message.scheme));
  else if (message.action === 'remove') next.rules = next.rules.filter(rule => rule.id !== message.id);
  else if (message.action === 'toggleRule') {
    const rule = next.rules.find(rule => rule.id === message.id);
    if (!rule) throw new Error('proxyInvalidRule');
    rule.enabled = message.enabled === true;
  } else throw new Error('proxyInvalidConfig');
  next = normalizeProxyConfig(next);
  // Persist first so a worker shutdown after applying can restore the same state.
  await chrome.storage.local.set({ [PROXY_KEY]: next });
  try { await apply(next); }
  catch (error) { await chrome.storage.local.set({ [PROXY_KEY]: before }); throw error; }
  await chrome.storage.session.remove('dinkit_proxy_error');
  return state();
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'DINKIT_PROXY' || sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) return;
  const task = message.action === 'probe' ? probe(message.url) : serialize(async () => {
    if (message.action === 'state') return state();
    if (message.action === 'match') return { ...await state(), result: await testRoute(message.url) };
    return mutate(message);
  });
  task.then(value => reply({ ok: true, ...value }), error => reply({ ok: false, error: error.message.startsWith('proxy') ? error.message : 'proxySaveFailed' }));
  return true;
});

function testUrl(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 8192) throw new Error('proxyInvalidSite');
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !url.hostname) throw new Error();
    return url.href;
  } catch { throw new Error('proxyInvalidSite'); }
}
async function testRoute(value) {
  const url = testUrl(value);
  const config = await readConfig();
  const effective = await control();
  const controlled = effective.levelOfControl === 'controlled_by_this_extension';
  const selected = matchProxyRule(config, url);
  return { url, enabled: config.enabled, controlled, label: selected ? `${selected.name || selected.scheme.toUpperCase()} · ${proxyAddress(selected)}` : 'DIRECT' };
}
async function probe(value) {
  await queue.catch(() => {});
  const result = await testRoute(value);
  if (result.enabled && !result.controlled && result.label !== 'DIRECT') throw new Error('proxyControlled');
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(result.url, { method: 'GET', credentials: 'omit', cache: 'no-store', signal: controller.signal });
    await response.body?.cancel();
    return { ...await state(), result: { ...result, status: response.status, elapsed: Date.now() - started } };
  } catch { throw new Error('proxyProbeFailed'); }
  finally { clearTimeout(timer); }
}

const restore = () => serialize(async () => { try { await apply(await readConfig()); } catch (error) { await chrome.storage.session.set({ dinkit_proxy_error: error.message === 'proxyControlled' ? 'proxyControlled' : 'proxySaveFailed' }); } });
chrome.runtime.onStartup.addListener(restore);
chrome.runtime.onInstalled.addListener(restore);
restore();
chrome.proxy.onProxyError.addListener(() => {
  if (applied) chrome.storage.session.set({ dinkit_proxy_error: 'proxyConnectionFailed' }).catch(() => {});
});

chrome.webRequest.onAuthRequired.addListener((details, callback) => {
  (async () => {
    if (!details.isProxy) return {};
    // A suspended worker reloads persisted rules before answering the challenge.
    await queue.catch(() => {});
    const current = await control();
    if (current.levelOfControl !== 'controlled_by_this_extension') return {};
    const config = applied || await readConfig();
    const rule = matchProxyRule(config, details.url);
    if (!rule || rule.scheme === 'socks5' || !rule.username) return {};
    const challenger = details.challenger?.host?.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (challenger !== rule.host || details.challenger.port !== rule.port) return {};
    if (authAttempts.has(details.requestId)) return { cancel: true };
    authAttempts.add(details.requestId);
    return { authCredentials: { username: rule.username, password: rule.password } };
  })().then(callback, () => callback({}));
}, { urls: ['<all_urls>'] }, ['asyncBlocking']);
const cleanAuth = details => authAttempts.delete(details.requestId);
chrome.webRequest.onCompleted.addListener(cleanAuth, { urls: ['<all_urls>'] });
chrome.webRequest.onErrorOccurred.addListener(cleanAuth, { urls: ['<all_urls>'] });
