import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Accordion, AccordionSummary, AccordionDetails, Alert, Box, Button, Checkbox, FormControlLabel, IconButton, MenuItem, Stack, Switch, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpIcon from '@mui/icons-material/HelpOutlined';
import UpIcon from '@mui/icons-material/ArrowUpward';
import DownIcon from '@mui/icons-material/ArrowDownward';
import { useLanguage } from './use-language.js';
import { DIRECT_PROXY_ID, proxyAddress } from './proxy-core.mjs';
import { parseProxyImport } from './proxy-import.mjs';
import { getCurrentProxySite } from './proxy-current-site.mjs';
import { createProxyStateSync } from './proxy-state-sync.mjs';

const INLINE = '__INLINE__';
const blank = () => ({ id: crypto.randomUUID(), domain: '', subdomains: false, selection: INLINE, scheme: 'http', host: '', port: '8080', username: '', password: '', enabled: true, name: '' });
const request = message => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage({ type: 'DINKIT_PROXY', ...message }, response => {
    if (chrome.runtime.lastError || !response?.ok || !response.config) reject(new Error(response?.error || 'proxySaveFailed'));
    else resolve(response);
  });
});
export default function ProxyPanel({ onReady }) {
  const { t } = useLanguage();
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(null);
  const [profileDraft, setProfileDraft] = useState(null);
  const [section, setSection] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [importText, setImportText] = useState('');
  const [importScheme, setImportScheme] = useState('http');
  const [importStatus, setImportStatus] = useState('');
  const [testUrl, setTestUrl] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [currentSite, setCurrentSite] = useState('');
  const syncRef = useRef(null);
  const busyTimer = useRef(null);
  const readyNotified = useRef(false);
  useLayoutEffect(() => {
    if (!readyNotified.current && (state || error)) { readyNotified.current = true; onReady?.(); }
  }, [state, error, onReady]);
  useEffect(() => {
    let active = true;
    const currentSiteReady = getCurrentProxySite();
    const sync = createProxyStateSync({ read: async () => {
      const [value, site] = await Promise.all([request({ action: 'state' }), currentSiteReady]);
      if (active) setCurrentSite(site);
      return value;
    }, commit: setState, fail: () => setError('proxySaveFailed') });
    syncRef.current = sync;
    sync.refresh();
    const changed = (changes, area) => { if ((area === 'local' && changes.dinkit_proxy) || (area === 'session' && changes.dinkit_proxy_error)) sync.notify(); };
    chrome.storage.onChanged.addListener(changed);
    chrome.proxy?.settings.onChange.addListener(sync.notify);
    return () => { active = false; sync.dispose(); clearTimeout(busyTimer.current); chrome.storage.onChanged.removeListener(changed); chrome.proxy?.settings.onChange.removeListener(sync.notify); };
  }, []);
  async function send(message) {
    const sync = syncRef.current;
    if (!sync?.begin()) return null;
    const before = state;
    // Fast local saves should not flash every control into its disabled color.
    busyTimer.current = setTimeout(() => setBusy(true), 200);
    setError(''); setTestResult(null);
    if (message.action === 'toggle') setState(previous => ({ ...previous, config: { ...previous.config, enabled: message.enabled } }));
    if (message.action === 'toggleRule') setState(previous => ({ ...previous, config: { ...previous.config, rules: previous.config.rules.map(rule => rule.id === message.id ? { ...rule, enabled: message.enabled } : rule) } }));
    try { const value = await request(message); sync.finish(value); return value; }
    catch (failure) { setState(before); setError(failure.message); sync.finish(); return null; }
    finally { clearTimeout(busyTimer.current); setBusy(false); }
  }
  const patch = (setter, key, value) => { setter(previous => ({ ...previous, [key]: value })); setError(''); };
  const accordion = (key, title, children) => <Accordion disableGutters elevation={0} slotProps={{ transition: { timeout: 0 } }} expanded={section === key} onChange={(_, open) => setSection(open ? key : '')} sx={{ background: 'transparent', borderTop: '1px solid #333236', '&:before': { display: 'none' }, m: '0 !important' }}><AccordionSummary expandIcon={<ExpandMoreIcon/>} sx={{ px: 0, minHeight: 44 }}><Typography variant="body2">{title}</Typography></AccordionSummary><AccordionDetails sx={{ px: 0 }}>{children}</AccordionDetails></Accordion>;
  function endpointFields(value, setter) {
    const change = (key, next) => patch(setter, key, next);
    return <>
      <TextField select label={t('proxyProtocol')} size="small" value={value.scheme} onChange={event => setter(previous => ({ ...previous, scheme: event.target.value, username: '', password: '', port: event.target.value === 'socks5' ? '1080' : event.target.value === 'https' ? '443' : '8080' }))} fullWidth>{['http', 'https', 'socks5'].map(scheme => <MenuItem key={scheme} value={scheme}>{scheme.toUpperCase()}</MenuItem>)}</TextField>
      <Stack direction="row" spacing={1}><TextField label={t('proxyHost')} placeholder="127.0.0.1" size="small" sx={{ flex: 1, minWidth: 0 }} value={value.host} onChange={event => change('host', event.target.value)} autoComplete="off" required/><TextField label={t('proxyPort')} size="small" sx={{ width: 86 }} value={value.port} slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]+' } }} onChange={event => change('port', event.target.value)} required/></Stack>
      {value.scheme !== 'socks5' && <Accordion disableGutters elevation={0} sx={{ background: 'transparent', '&:before': { display: 'none' }, m: '0 !important' }}><AccordionSummary expandIcon={<ExpandMoreIcon/>} sx={{ px: 0, minHeight: 36, '& .MuiAccordionSummary-content': { my: .5 } }}><Typography variant="body2">{t('proxyAuth')}</Typography></AccordionSummary><AccordionDetails sx={{ px: 0 }}><Stack spacing={1.5}><TextField label={t('proxyUsername')} size="small" value={value.username} onChange={event => change('username', event.target.value)} autoComplete="off"/><TextField label={t('proxyPassword')} type="password" size="small" value={value.password} onChange={event => change('password', event.target.value)} autoComplete="new-password"/></Stack></AccordionDetails></Accordion>}
    </>;
  }
  async function saveRule(event) {
    event.preventDefault();
    const result = draft.selection === INLINE ? await send({ action: 'saveInline', rule: draft }) : await send({ action: 'upsert', rule: { id: draft.id, pattern: draft.domain, proxyId: draft.selection, enabled: draft.enabled } });
    if (result) setDraft(null);
  }
  async function importProfiles() {
    setError(''); setImportStatus('');
    const parsed = parseProxyImport(importText, importScheme);
    if (parsed.errors.length) { const first = parsed.errors[0]; setImportStatus(`${t('proxyImportLine', { line: first.line })}: ${t(first.key)}`); return; }
    if (await send({ action: 'import', text: importText, scheme: importScheme })) { setImportText(''); setImportStatus(t('proxyImported')); }
  }
  async function test(action) {
    setTesting(true); setError('');
    try { const result = await request({ action, url: testUrl }); setTestResult(result.result); }
    catch (failure) { setTestResult(null); setError(failure.message); }
    finally { setTesting(false); }
  }
  if (!state) return <Typography role="status" variant="body2">{t(error || 'proxyLoading')}</Typography>;
  const { config } = state;
  const blocked = config.enabled && config.rules.some(rule => rule.enabled) && !['controlled_by_this_extension', 'controllable_by_this_extension'].includes(state.control);
  const warning = error || (blocked ? 'proxyControlled' : state.error);
  return <section className="proxy-panel">
    <div className="setting-row"><span>{t('proxyEnable')} <Tooltip title={t('proxyHelp')} enterTouchDelay={0}><IconButton size="small" aria-label={t('proxyHelpLabel')}><HelpIcon sx={{ fontSize: 16 }}/></IconButton></Tooltip></span><Switch disabled={busy} checked={config.enabled} slotProps={{ input: { 'aria-label': t('proxyEnable') } }} onChange={event => send({ action: 'toggle', enabled: event.target.checked })}/></div>
    {warning && <Alert severity="warning" sx={{ my: 1, fontSize: 12 }}>{t(warning)}</Alert>}
    <div className="proxy-rules">{config.rules.map(rule => {
      const profile = rule.pattern ? config.profiles.find(item => item.id === rule.proxyId) : rule;
      const site = rule.pattern || (rule.subdomains ? '*.' : '') + rule.domain;
      return <div className="proxy-rule" key={rule.id}><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" noWrap title={site}>{site}</Typography><Typography variant="caption" color="text.secondary" component="div" noWrap title={profile ? proxyAddress(profile) : 'DIRECT'}>{profile ? `${profile.scheme.toUpperCase()} · ${profile.name || proxyAddress(profile)}` : 'DIRECT'}</Typography></Box>
        <Switch size="small" disabled={busy} checked={rule.enabled} slotProps={{ input: { 'aria-label': t('proxyToggleRule', { site }) } }} onChange={event => send({ action: 'toggleRule', id: rule.id, enabled: event.target.checked })}/>
        <IconButton size="small" disabled={busy} aria-label={t('proxyEditRule', { site })} onClick={() => { setDraft({ ...blank(), ...rule, domain: rule.pattern || rule.domain, selection: rule.proxyId || INLINE }); setError(''); }}><EditIcon fontSize="small"/></IconButton>
        <IconButton size="small" disabled={busy} aria-label={t('proxyDeleteRule', { site })} onClick={() => { if (draft?.id === rule.id) setDraft(null); send({ action: 'remove', id: rule.id }); }}><DeleteIcon fontSize="small"/></IconButton>
      </div>;
    })}</div>
    {!draft && <Stack direction="row" spacing={.5} sx={{ my: 1, flexWrap: 'wrap' }}><Button size="small" startIcon={<AddIcon/>} onClick={() => { setDraft({ ...blank(), selection: config.profiles[0]?.id || INLINE }); setError(''); }}>{t('proxyAddSite')}</Button>{currentSite && <Tooltip title={currentSite} describeChild><Button size="small" disabled={busy} onClick={() => {
      const existing = config.rules.find(rule => (rule.pattern || rule.domain) === currentSite);
      setDraft(existing ? { ...blank(), ...existing, domain: existing.pattern || existing.domain, selection: existing.proxyId || INLINE } : { ...blank(), domain: currentSite, selection: config.profiles[0]?.id || INLINE });
      setError('');
    }}>{t('proxyAddCurrentSite')}</Button></Tooltip>}</Stack>}
    {draft && <Box component="form" onSubmit={saveRule} sx={{ py: 2 }}><Stack spacing={1.5}>
      <TextField label={t('proxyWebsite')} placeholder="example.com / *.example.com" size="small" value={draft.domain} onChange={event => patch(setDraft, 'domain', event.target.value)} fullWidth autoComplete="off" required/>
      <TextField select label="Proxy" size="small" value={draft.selection} onChange={event => patch(setDraft, 'selection', event.target.value)}><MenuItem value={INLINE}>{t('proxyCustom')}</MenuItem><MenuItem value={DIRECT_PROXY_ID}>DIRECT</MenuItem>{config.profiles.map(profile => <MenuItem key={profile.id} value={profile.id}>{profile.name}</MenuItem>)}</TextField>
      {draft.selection === INLINE && <>{endpointFields(draft, setDraft)}<FormControlLabel sx={{ m: 0 }} control={<Checkbox size="small" checked={draft.subdomains} onChange={event => patch(setDraft, 'subdomains', event.target.checked)}/>} label={<Typography variant="body2">{t('proxySubdomains')}</Typography>}/></>}
      <Stack direction="row" spacing={1}><Button type="submit" variant="contained" size="small" disabled={busy}>{t('save')}</Button><Button size="small" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>{t('proxyCancel')}</Button>{config.rules.some(rule => rule.id === draft.id) && <><IconButton size="small" disabled={busy || config.rules[0]?.id === draft.id} aria-label={t('proxyMoveUp')} onClick={() => send({ action: 'moveRule', id: draft.id, direction: -1 })}><UpIcon fontSize="small"/></IconButton><IconButton size="small" disabled={busy || config.rules.at(-1)?.id === draft.id} aria-label={t('proxyMoveDown')} onClick={() => send({ action: 'moveRule', id: draft.id, direction: 1 })}><DownIcon fontSize="small"/></IconButton></>}</Stack>
    </Stack></Box>}
    {accordion('profiles', t('proxyProfiles'), <>
      {config.profiles.map(profile => <div className="proxy-rule" key={profile.id}><Box sx={{ flex: 1, minWidth: 0 }}><Typography variant="body2" noWrap>{profile.name}</Typography><Typography variant="caption" color="text.secondary">{profile.scheme.toUpperCase()} · {proxyAddress(profile)}</Typography></Box><IconButton size="small" disabled={busy} aria-label={t('proxyEditRule', { site: profile.name })} onClick={() => setProfileDraft({ ...profile })}><EditIcon fontSize="small"/></IconButton><IconButton size="small" disabled={busy} aria-label={t('proxyDeleteRule', { site: profile.name })} onClick={() => send({ action: 'removeProfile', id: profile.id })}><DeleteIcon fontSize="small"/></IconButton></div>)}
      {!profileDraft ? <Button size="small" startIcon={<AddIcon/>} sx={{ mt: 1 }} onClick={() => setProfileDraft(blank())}>{t('proxyAddProfile')}</Button> : <Box component="form" sx={{ pt: 2 }} onSubmit={async event => { event.preventDefault(); if (await send({ action: 'saveProfile', profile: profileDraft })) setProfileDraft(null); }}><Stack spacing={1.5}><TextField label={t('proxyName')} size="small" value={profileDraft.name} onChange={event => patch(setProfileDraft, 'name', event.target.value)}/>{endpointFields(profileDraft, setProfileDraft)}<Stack direction="row" spacing={1}><Button type="submit" variant="contained" size="small" disabled={busy}>{t('save')}</Button><Button size="small" onClick={() => setProfileDraft(null)}>{t('proxyCancel')}</Button></Stack></Stack></Box>}
    </>)}
    {accordion('import', t('proxyImport'), <Stack spacing={1.5}><TextField select size="small" label={t('proxyProtocol')} value={importScheme} onChange={event => setImportScheme(event.target.value)}>{['http', 'https', 'socks5'].map(scheme => <MenuItem value={scheme} key={scheme}>{scheme.toUpperCase()}</MenuItem>)}</TextField><TextField label={t('proxyImportData')} multiline minRows={3} maxRows={6} value={importText} onChange={event => setImportText(event.target.value)} placeholder={'127.0.0.1:8080\nsocks5://[::1]:1080\nhttp://user:pass@host:8080'}/><Button variant="outlined" size="small" disabled={busy || !importText.trim()} onClick={importProfiles}>{t('proxyImportApply')}</Button>{importStatus && <Typography variant="caption" role="status">{importStatus}</Typography>}</Stack>)}
    {accordion('test', t('proxyTest'), <Stack spacing={1.5}><TextField size="small" label="URL" value={testUrl} onChange={event => { setTestUrl(event.target.value); setTestResult(null); }} placeholder="https://example.com"/><Stack direction="row" spacing={1}><Button size="small" variant="outlined" disabled={testing || busy || !testUrl.trim()} onClick={() => test('match')}>{t('proxyMatch')}</Button><Button size="small" disabled={testing || busy || !testUrl.trim()} onClick={() => test('probe')}>{t('proxyProbe')}</Button></Stack>{testResult && <Typography variant="caption" role="status" sx={{ overflowWrap: 'anywhere' }}>{testResult.label}{!testResult.enabled ? ` · ${t('statusOff')}` : ''}{testResult.status !== undefined ? ` · HTTP ${testResult.status} · ${testResult.elapsed} ms` : ''}</Typography>}</Stack>)}
  </section>;
}
