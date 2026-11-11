export const PROXY_KEY = 'dinkit_proxy';
export const DIRECT_PROXY_ID = '__DIRECT__';
export const emptyProxyConfig = () => ({ version: 2, enabled: false, rules: [], profiles: [] });
const invalid = key => { throw new Error(key); };

function canonicalHost(input, error) {
  if (typeof input !== 'string' || !input.trim() || /[\s/@?#\\]/.test(input)) invalid(error);
  let raw = input.trim();
  if (raw.includes(':') && !raw.startsWith('[')) raw = `[${raw}]`;
  let host;
  try { const url = new URL(`http://${raw}/`); if (url.port || url.username || url.password) invalid(error); host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, ''); }
  catch { invalid(error); }
  if (!host.includes(':') && (host.length > 253 || host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) invalid(error);
  return host;
}

export function normalizeSite(input) {
  if (typeof input !== 'string') invalid('proxyInvalidSite');
  let raw = input.trim();
  let subdomains = raw.startsWith('*.');
  if (subdomains) raw = raw.slice(2);
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      if (url.username || url.password) invalid('proxyInvalidSite');
      raw = url.hostname;
    } catch { invalid('proxyInvalidSite'); }
  }
  const domain = canonicalHost(raw, 'proxyInvalidSite');
  if (/^[\d.]+$/.test(domain) || domain.includes(':')) subdomains = false;
  return { domain, subdomains };
}

export function normalizeRule(rule) {
  if (!rule || typeof rule !== 'object') invalid('proxyInvalidRule');
  if (typeof rule.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(rule.id)) invalid('proxyInvalidRule');
  const { domain, subdomains } = normalizeSite(rule.domain);
  if (!['http', 'https', 'socks5'].includes(rule.scheme)) invalid('proxyInvalidScheme');
  const host = canonicalHost(rule.host, 'proxyInvalidHost');
  const port = typeof rule.port === 'number' ? rule.port : /^\d+$/.test(rule.port || '') ? Number(rule.port) : NaN;
  if (!Number.isInteger(port) || port < 1 || port > 65535) invalid('proxyInvalidPort');
  const username = typeof rule.username === 'string' ? rule.username : '';
  const password = typeof rule.password === 'string' ? rule.password : '';
  if (username.length > 512 || password.length > 512 || /[\r\n\0]/.test(username + password) || (!username && password)) invalid('proxyInvalidAuth');
  if (rule.scheme === 'socks5' && (username || password)) invalid('proxySocksAuth');
  const isIp = /^[\d.]+$/.test(domain) || domain.includes(':');
  return { id: rule.id, domain, subdomains: !isIp && (subdomains || rule.subdomains === true), scheme: rule.scheme, host, port, username, password, enabled: rule.enabled !== false };
}

export function normalizeProxyConfig(config) {
  if (!config || typeof config !== 'object' || !Array.isArray(config.rules) || config.rules.length > 200) invalid('proxyInvalidConfig');
  if (config.profiles && !Array.isArray(config.profiles)) invalid('proxyInvalidConfig');
  const profiles = (config.profiles || []).map(normalizeProfile);
  if (profiles.length > 200 || new Set(profiles.map(profile => profile.id)).size !== profiles.length) invalid('proxyInvalidConfig');
  let rules = config.rules.map(rule => rule.pattern !== undefined ? normalizeRoute(rule) : normalizeRule(rule));
  // Preserve previous DinKit routing when upgrading to first-match rule order.
  if (config.version !== 2 && rules.every(rule => !rule.pattern)) rules.sort((a, b) => b.domain.length - a.domain.length);
  if (new Set(rules.map(rule => rule.id)).size !== rules.length || new Set(rules.map(rule => rule.pattern || rule.domain)).size !== rules.length) invalid('proxyDuplicateSite');
  if (rules.some(rule => rule.pattern && rule.proxyId !== DIRECT_PROXY_ID && !profiles.some(profile => profile.id === rule.proxyId))) invalid('proxyMissingProfile');
  // Chromium caches proxy credentials per server, not per destination website.
  const credentials = new Map();
  for (const entry of rules.filter(rule => rule.enabled)) {
    const rule = entry.pattern ? profiles.find(profile => profile.id === entry.proxyId) : entry;
    if (!rule) continue;
    const endpoint = `${rule.scheme}|${rule.host}|${rule.port}`;
    const auth = JSON.stringify([rule.username, rule.password]);
    if (credentials.has(endpoint) && credentials.get(endpoint) !== auth) invalid('proxyAuthConflict');
    credentials.set(endpoint, auth);
  }
  return { version: 2, enabled: config.enabled === true, rules, profiles };
}

export function orderedRules(config) {
  const rules = config.rules.filter(rule => rule.enabled);
  return config.version === 2 ? rules : rules.sort((a, b) => b.domain.length - a.domain.length);
}

export function matchProxyRule(config, url) {
  if (!config.enabled) return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  for (const rule of orderedRules(config)) {
    const matches = rule.pattern ? routeMatches(parsed.href, host, rule.matcher) : host === rule.domain || (rule.subdomains && host.endsWith('.' + rule.domain));
    if (!matches) continue;
    return rule.pattern ? config.profiles.find(profile => profile.id === rule.proxyId) || null : rule;
  }
  return null;
}

export function proxyAddress(rule) { return `${rule.host.includes(':') ? `[${rule.host}]` : rule.host}:${rule.port}`; }
export function buildPac(config) {
  const rules = config.enabled ? orderedRules(config).map(rule => {
    const profile = rule.pattern ? config.profiles.find(profile => profile.id === rule.proxyId) : rule;
    return { matcher: rule.matcher || { kind: 'domain', host: rule.domain, subdomains: rule.subdomains }, proxy: profile ? `${({ http: 'PROXY', https: 'HTTPS', socks5: 'SOCKS5' })[profile.scheme]} ${proxyAddress(profile)}` : 'DIRECT' };
  }) : [];
  return `function FindProxyForURL(url, host) {\n` +
    ` if (!/^(https?|wss?):/i.test(url)) return "DIRECT";\n` +
    ` host = host.toLowerCase().replace(/^\\[|\\]$/g, "").replace(/\\.$/, "");\n` +
    ` var rules = ${JSON.stringify(rules)};\n` +
    ` var routeMatches = ${routeMatches.toString()};\n` +
    ` for (var i = 0; i < rules.length; i++) { var r = rules[i];\n` +
    `  if (routeMatches(url, host, r.matcher)) return r.proxy;\n` +
    ` }\n return "DIRECT";\n}`;
}

// Kept self-contained so the tester and Chromium PAC execute identical matching.
export function routeMatches(url, host, matcher) {
  if (matcher.kind === 'url') return url.indexOf(matcher.prefix) === 0;
  if (matcher.kind === 'wildcard') return host !== matcher.host && host.slice(-(matcher.host.length + 1)) === '.' + matcher.host;
  return host === matcher.host || (matcher.subdomains && host.slice(-(matcher.host.length + 1)) === '.' + matcher.host);
}

export function normalizeProfile(profile) {
  const normalized = normalizeRule({ ...profile, domain: 'profile.invalid', scheme: String(profile.scheme || profile.type || 'http').toLowerCase() });
  const { domain, subdomains, enabled, ...value } = normalized;
  return { ...value, name: String(profile.name || '').trim().slice(0, 100) || proxyAddress(value) };
}

export function normalizeRoute(route) {
  if (!route || typeof route.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(route.id) || typeof route.pattern !== 'string') invalid('proxyInvalidRule');
  let pattern = route.pattern.trim();
  let matcher;
  if (/^https?:\/\//i.test(pattern)) {
    let url;
    try { url = new URL(pattern); } catch { invalid('proxyInvalidSite'); }
    if (url.username || url.password || url.hash) invalid('proxyInvalidSite');
    // Chrome removes HTTPS paths before calling PAC. Refuse misleading rules.
    if (url.protocol === 'https:' && (url.pathname !== '/' || url.search)) invalid('proxyHttpsPath');
    pattern = url.href;
    matcher = { kind: 'url', prefix: pattern };
  } else {
    const wildcard = pattern.startsWith('*.');
    const site = normalizeSite(pattern);
    pattern = (wildcard ? '*.' : '') + (site.domain.includes(':') ? `[${site.domain}]` : site.domain);
    matcher = { kind: wildcard ? 'wildcard' : 'domain', host: site.domain, subdomains: route.subdomains !== false && !site.domain.includes(':') && !/^[\d.]+$/.test(site.domain) };
  }
  if (typeof route.proxyId !== 'string' || !route.proxyId) invalid('proxyMissingProfile');
  return { id: route.id, pattern, matcher, proxyId: route.proxyId, enabled: route.enabled !== false, ...(route.subdomains === false ? { subdomains: false } : {}) };
}
