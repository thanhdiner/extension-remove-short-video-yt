// Import formats supported by the local Bypass Flow source, validated through
// DinKit's shared normalizers before anything is saved or applied.
import { normalizeProfile, normalizeRoute, DIRECT_PROXY_ID } from './proxy-core.mjs';
const id = () => `import_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
const fail = key => { throw new Error(key); };
const scheme = value => { const text = String(value || 'http').toLowerCase(); if (text === 'socks') return 'socks5'; if (!['http', 'https', 'socks5'].includes(text)) fail('proxyInvalidScheme'); return text; };
const decode = text => { try { return decodeURIComponent(text || ''); } catch { return String(text || ''); } };
const errorKey = error => error.message?.startsWith('proxy') ? error.message : 'proxyImportInvalid';

function lineProfile(raw, fallback) {
  let line = raw.trim().replace(/,\s*$/, '');
  if ((line.startsWith('"') && line.endsWith('"')) || (line.startsWith("'") && line.endsWith("'"))) line = line.slice(1, -1);
  let profile = { id: id(), scheme: fallback, username: '', password: '' };
  if (/^[a-z][\w+.-]*:\/\//i.test(line)) {
    let url;
    try { url = new URL(line); } catch { fail('proxyInvalidHost'); }
    profile.scheme = scheme(url.protocol.slice(0, -1));
    if (url.pathname && url.pathname !== '/' || url.search || url.hash) fail('proxyInvalidHost');
    profile.host = url.hostname;
    profile.port = url.port || ({ http: 80, https: 443, socks5: 1080 })[profile.scheme];
    profile.username = decode(url.username); profile.password = decode(url.password);
    return normalizeProfile(profile);
  }
  if (line.includes('|') || (line.includes(',') && !line.includes('@'))) {
    const separator = line.includes('|') ? '|' : ',';
    const parts = line.split(separator).map(value => value.trim());
    if (/^(http|https|socks5|socks)$/i.test(parts[0])) profile.scheme = scheme(parts.shift());
    if (parts.length < 2) fail('proxyInvalidHost');
    [profile.host, profile.port, profile.username = ''] = parts;
    profile.password = parts.slice(3).join(separator);
    return normalizeProfile(profile);
  }
  if (line.includes('@')) {
    const at = line.lastIndexOf('@');
    const left = line.slice(0, at), right = line.slice(at + 1);
    const reverse = /^(?:\[[^\]]+\]|[^:]+):\d+$/.test(left) && !/^(?:\[[^\]]+\]|[^:]+):\d+$/.test(right);
    const auth = reverse ? right : left;
    line = reverse ? left : right;
    const colon = auth.indexOf(':');
    profile.username = decode(colon < 0 ? auth : auth.slice(0, colon));
    profile.password = decode(colon < 0 ? '' : auth.slice(colon + 1));
  }
  const match = /^(\[[^\]]+\]|[^:@]+):(\d+)(?::([^:]*)(?::(.*))?)?$/.exec(line);
  if (!match) fail('proxyInvalidHost');
  profile.host = match[1]; profile.port = match[2];
  if (match[3] !== undefined) { profile.username = decode(match[3]); profile.password = decode(match[4]); }
  return normalizeProfile(profile);
}

export function parseProxyImport(text, defaultScheme = 'http') {
  const result = { profiles: [], routes: [], errors: [] };
  if (typeof text !== 'string' || !text.trim() || text.length > 1024 * 1024) return { ...result, errors: [{ line: 0, key: 'proxyImportInvalid' }] };
  let fallback;
  try { fallback = scheme(defaultScheme); } catch { return { ...result, errors: [{ line: 0, key: 'proxyInvalidScheme' }] }; }
  const raw = text.trim();
  if (raw.startsWith('{') || (raw.startsWith('[') && !/^\[[a-f\d:]+\]:/i.test(raw))) {
    try {
      const data = JSON.parse(raw);
      const entries = Array.isArray(data) ? data : data.proxies || data.profiles || (data.proxyConfig ? [{ ...data.proxyConfig, id: 'proxy_legacy' }] : null);
      if (!Array.isArray(entries) || entries.length > 200) fail('proxyImportInvalid');
      entries.forEach((entry, index) => {
        try {
          let value;
          const sourceId = String(entry.id || `proxy_${index + 1}`);
          if (entry.host != null && entry.port != null) value = normalizeProfile({ ...entry, id: sourceId, scheme: scheme(entry.scheme || entry.type || entry.protocol || fallback), username: entry.username || entry.user || '', password: entry.password || entry.pass || '' });
          else { value = lineProfile(entry.endpoint || entry.address || entry.proxy || '', fallback); value.id = sourceId; value = normalizeProfile({ ...value, name: entry.name }); }
          result.profiles.push(value);
        } catch (error) { result.errors.push({ line: index + 1, key: errorKey(error) }); }
      });
      const routes = !Array.isArray(data) ? data.routes || (Array.isArray(data.rules) ? data.rules.map((pattern, index) => ({ id: `legacy_${index}`, pattern, proxyId: result.profiles[0]?.id || DIRECT_PROXY_ID })) : []) : [];
      if (!Array.isArray(routes) || routes.length > 200) fail('proxyImportInvalid');
      for (const [index, route] of routes.entries()) {
        try { result.routes.push(normalizeRoute({ ...route, id: String(route.id || `route_${index}`), proxyId: route.proxyId || DIRECT_PROXY_ID })); }
        catch (error) { result.errors.push({ line: index + 1, key: errorKey(error) }); }
      }
    } catch (error) { result.errors.push({ line: 0, key: error.message.startsWith('proxy') ? error.message : 'proxyImportInvalid' }); }
  } else {
    const lines = raw.split(/\r?\n/);
    if (lines.length > 1000) return { ...result, errors: [{ line: 0, key: 'proxyImportInvalid' }] };
    lines.forEach((line, index) => {
      if (!line.trim() || /^\s*(#|\/\/)/.test(line)) return;
      try { result.profiles.push(lineProfile(line, fallback)); } catch (error) { result.errors.push({ line: index + 1, key: errorKey(error) }); }
    });
  }
  if (result.profiles.length > 200 || !result.profiles.length) result.errors.push({ line: 0, key: 'proxyImportInvalid' });
  if (new Set(result.profiles.map(profile => profile.id)).size !== result.profiles.length) result.errors.push({ line: 0, key: 'proxyImportInvalid' });
  return result;
}

export function mergeProxyImport(config, parsed) {
  if (parsed.errors.length) fail(parsed.errors[0].key);
  const next = structuredClone(config);
  const remap = new Map();
  const fingerprint = profile => JSON.stringify([profile.scheme, profile.host, profile.port, profile.username, profile.password]);
  for (const profile of parsed.profiles) {
    const existing = next.profiles.find(item => fingerprint(item) === fingerprint(profile));
    if (existing) { remap.set(profile.id, existing.id); continue; }
    const newId = id(); remap.set(profile.id, newId); next.profiles.push({ ...profile, id: newId });
  }
  for (const route of parsed.routes) {
    if (next.rules.some(item => (item.pattern || item.domain) === route.pattern)) continue;
    const proxyId = route.proxyId === DIRECT_PROXY_ID ? DIRECT_PROXY_ID : remap.get(route.proxyId);
    if (!proxyId) fail('proxyMissingProfile');
    next.rules.push(normalizeRoute({ ...route, id: id(), proxyId }));
  }
  return next;
}
