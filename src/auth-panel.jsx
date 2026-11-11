import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Accordion, AccordionSummary, AccordionDetails, Alert, Autocomplete, Box, Button, Dialog, DialogTitle, DialogContent, DialogActions, IconButton, LinearProgress, Menu, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/EditOutlined';
import DeleteIcon from '@mui/icons-material/DeleteOutlined';
import MoreIcon from '@mui/icons-material/MoreVert';
import ImportIcon from '@mui/icons-material/FileDownloadOutlined';
import ExportIcon from '@mui/icons-material/FileUploadOutlined';
import QrIcon from '@mui/icons-material/QrCode';
import GroupsIcon from '@mui/icons-material/FolderOutlined';
import GridIcon from '@mui/icons-material/GridViewOutlined';
import ListIcon from '@mui/icons-material/ViewListOutlined';
import UpIcon from '@mui/icons-material/ArrowUpward';
import DownIcon from '@mui/icons-material/ArrowDownward';
import ExpandIcon from '@mui/icons-material/ExpandMore';
import DragIcon from '@mui/icons-material/DragIndicator';
import { useLanguage } from './use-language.js';
import { generateTotp, normalizeAccount, groupNames, encryptBackup } from './auth-core.mjs';
import { readAuthFiles, parseAuthPayload, backupPayload, downloadAuthFile, exportAuthQr } from './auth-files.mjs';

const fresh = () => ({ id: crypto.randomUUID(), label: '', secret: '', issuer: '', digits: 6, period: 30, algorithm: 'SHA-1' });
function request(message) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage({ type: 'DINKIT_AUTH', ...message }, response => {
    if (chrome.runtime.lastError || !response?.ok || !response.state) reject(new Error(response?.error || 'authStorageError'));
    else resolve(response);
  }));
}
const authError = error => /^auth[A-Z]\w*$/.test(error.message) ? error.message : 'authActionError';

function AuthCode({ account, now, active, onStatus }) {
  const { t } = useLanguage();
  const step = Math.floor(now / account.period);
  const [code, setCode] = useState(null);
  useEffect(() => {
    let current = true;
    if (active) generateTotp(account, now).then(value => { if (current) setCode({ step, value }); }, () => { if (current) setCode(null); });
    return () => { current = false; };
  }, [active, step, account.secret, account.algorithm, account.digits, account.period]);
  const value = code?.step === step ? code.value : '•'.repeat(account.digits);
  async function copy() {
    try { const current = await generateTotp(account); await navigator.clipboard.writeText(current); onStatus({ key: 'copied' }); }
    catch { onStatus({ key: 'copyFailed' }); }
  }
  const remaining = account.period - now % account.period;
  return <>
    <Button className="auth-code" variant="text" aria-label={t('authCopyCode', { name: account.label })} onClick={copy} sx={{ fontFamily: 'Consolas, monospace', fontSize: account.digits === 8 ? 22 : 26, letterSpacing: 2, justifyContent: 'flex-start', p: 0, minWidth: 0 }}>{value.slice(0, value.length / 2)} {value.slice(value.length / 2)}</Button>
    <div className="auth-timer"><LinearProgress variant="determinate" value={remaining / account.period * 100} sx={{ height: 2 }}/><Typography component="span" variant="caption" color="text.secondary" className="auth-timer-seconds">{remaining}s</Typography></div>
  </>;
}

export default function AuthPanel({ active = false, onReady, onDialogChange }) {
  const { t } = useLanguage();
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));
  const [error, setError] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(null);
  const [dialog, setDialog] = useState('');
  const [password, setPassword] = useState('');
  const [importText, setImportText] = useState('');
  const [files, setFiles] = useState([]);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [clearStage, setClearStage] = useState(0);
  const [confirmation, setConfirmation] = useState('');
  const [groupEditor, setGroupEditor] = useState({ name: '', oldName: '' });
  const pending = useRef(false);
  const notified = useRef(false);
  const revision = useRef(0);
  const drag = useRef(null);
  const dragScroll = useRef({ frame: null, y: null });
  function stopDrag() {
    drag.current = null;
    dragScroll.current.y = null;
    if (dragScroll.current.frame !== null) cancelAnimationFrame(dragScroll.current.frame);
    dragScroll.current.frame = null;
    document.querySelectorAll('.auth-dragging, .auth-drag-over').forEach(node => node.classList.remove('auth-dragging', 'auth-drag-over'));
  }
  function scrollDuringDrag() {
    const box = document.querySelector('.popup-proxy');
    if (!box || !drag.current || dragScroll.current.y === null) { dragScroll.current.frame = null; return; }
    const rect = box.getBoundingClientRect(), edge = Math.min(56, rect.height / 4), y = dragScroll.current.y;
    if (y < rect.top + edge) box.scrollTop -= Math.min(14, (rect.top + edge - y) / edge * 14);
    else if (y > rect.bottom - edge) box.scrollTop += Math.min(14, (y - (rect.bottom - edge)) / edge * 14);
    dragScroll.current.frame = requestAnimationFrame(scrollDuringDrag);
  }
  function dragOver(event) {
    if (!drag.current) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dragScroll.current.y = event.clientY;
    if (dragScroll.current.frame === null) dragScroll.current.frame = requestAnimationFrame(scrollDuringDrag);
  }
  useEffect(() => {
    let mounted = true;
    request({ action: 'state' }).then(result => { if (mounted) setState(result.state); }, () => { if (mounted) setError('authStorageError'); });
    return () => { mounted = false; stopDrag(); };
  }, []);
  useLayoutEffect(() => { if (!notified.current && (state || error)) { notified.current = true; onReady?.(); } }, [state, error, onReady]);
  useLayoutEffect(() => { onDialogChange?.(active && !!dialog); return () => onDialogChange?.(false); }, [active, dialog, onDialogChange]);
  useEffect(() => {
    if (!active) { setMenu(null); return; }
    setNow(Math.floor(Date.now() / 1000));
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    // Reconcile edits made by another popup without resetting this form.
    const current = ++revision.current;
    request({ action: 'state' }).then(result => { if (current === revision.current && !pending.current) setState(result.state); }, () => {});
    return () => { clearInterval(timer); revision.current++; };
  }, [active]);
  async function send(message) {
    if (pending.current) return null;
    pending.current = true; revision.current++; setBusy(true); setError(''); setStatus(null);
    try { const result = await request(message); setState(result.state); return result; }
    catch (failure) { setError(authError(failure)); return null; }
    finally { pending.current = false; setBusy(false); }
  }
  async function save(event) {
    event.preventDefault();
    let account;
    try { account = normalizeAccount(draft); } catch (failure) { setError(authError(failure)); return; }
    if (await send({ action: 'upsert', account })) setDraft(null);
  }
  function openDialog(name) { setError(''); setStatus(null); setPassword(''); setFiles([]); setImportText(''); setDialog(name); }
  function closeDialog() { if (!busy) { setDialog(''); setPassword(''); setFiles([]); setImportText(''); setError(''); } }
  async function importAccounts() {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const imported = files.length ? await readAuthFiles(files, password) : parseAuthPayload(importText);
      // Release the UI lock only after all files validate; one worker transaction commits the batch.
      const result = await request({ action: 'import', accounts: imported.accounts, groups: imported.groups, groupOrder: imported.groupOrder });
      revision.current++; setState(result.state); setStatus({ key: 'authImported', values: { added: result.added, total: imported.accounts.length } });
      setDialog(''); setPassword(''); setFiles([]); setImportText('');
    } catch (failure) { setError(authError(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function exportAccounts(qr = false) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      const latest = (await request({ action: 'state' })).state;
      if (!latest.accounts.length) throw new Error('authEmptyExport');
      if (qr) await exportAuthQr(latest.accounts);
      else {
        const payload = backupPayload(latest);
        await downloadAuthFile(password ? await encryptBackup(payload, password) : payload, `dinkit-2fa-${new Date().toISOString().slice(0, 10)}.json`);
      }
      setDialog(''); setPassword(''); setStatus({ key: 'authExported' });
    } catch (failure) { setError(authError(failure)); }
    finally { pending.current = false; setBusy(false); }
  }
  if (!state) return <Typography variant="body2" role="status">{t(error || 'authLoading')}</Typography>;
  const names = groupNames(state);
  const rows = state.accounts.filter(account => (!filter || account.issuer === filter) && `${account.issuer} ${account.label}`.toLowerCase().includes(query.toLowerCase()));
  const sections = [...names, ''].map(name => ({ name, accounts: rows.filter(account => account.issuer === name), total: state.accounts.filter(account => account.issuer === name).length })).filter(section => section.accounts.length);
  const action = (label, icon, callback, disabled = false) => <Tooltip title={label}><span style={{ display: 'inline-flex' }}><IconButton size="small" aria-label={label} disabled={busy || disabled} onClick={callback}>{icon}</IconButton></span></Tooltip>;
  const patch = (key, value) => { setDraft(previous => ({ ...previous, [key]: value })); setError(''); };
  return <section className="auth-panel" onDragOver={dragOver} onDrop={() => stopDrag()}>
    <div className="auth-toolbar">
      <Typography component="span" variant="caption" color="text.secondary" className="auth-toolbar-count">{t(state.accounts.length === 1 ? 'authOneAccount' : 'authAccountCount', { count: state.accounts.length })}</Typography>
      <Stack direction="row" spacing={.25} alignItems="center" className="auth-toolbar-actions">
        {action(t('authAdd'), <AddIcon fontSize="small"/>, () => { setDraft(fresh()); setError(''); })}
        {action(t('authImport'), <ImportIcon fontSize="small"/>, () => openDialog('import'))}
        {action(t('authExport'), <ExportIcon fontSize="small"/>, () => openDialog('export'), !state.accounts.length)}
        {action(t('authQrExport'), <QrIcon fontSize="small"/>, () => openDialog('qr'), !state.accounts.length)}
        {action(t('authGroups'), <GroupsIcon fontSize="small"/>, () => { setGroupEditor({ name: '', oldName: '' }); openDialog('groups'); })}
        {action(t('authView'), state.view === 'grid' ? <ListIcon fontSize="small"/> : <GridIcon fontSize="small"/>, () => send({ action: 'view', view: state.view === 'grid' ? 'list' : 'grid' }))}
      </Stack>
    </div>
    {!dialog && error && <Alert severity="error" sx={{ my: 1, fontSize: 12 }}>{t(error)}</Alert>}
    {status && <Typography variant="caption" color="text.secondary" role="status">{t(status.key, status.values)}</Typography>}
    {draft && <Box component="form" onSubmit={save} sx={{ py: 1.5 }}><Stack spacing={1.5}>
      <TextField size="small" label={t('authLabel')} autoComplete="off" value={draft.label} onChange={event => patch('label', event.target.value)}/>
      <TextField size="small" label={t('authSecret')} autoComplete="off" multiline minRows={2} maxRows={4} value={draft.secret} onChange={event => patch('secret', event.target.value)} slotProps={{ htmlInput: { spellCheck: false } }} required/>
      <Autocomplete freeSolo options={names} inputValue={draft.issuer} onInputChange={(_, value) => patch('issuer', value)} renderInput={params => <TextField {...params} size="small" label={t('authGroup')}/>}/>
      <Accordion disableGutters elevation={0} slotProps={{ transition: { timeout: 0 } }} sx={{ background: 'transparent', '&:before': { display: 'none' } }}><AccordionSummary expandIcon={<ExpandIcon/>} sx={{ px: 0, minHeight: 32 }}><Typography variant="body2">{t('authAdvanced')}</Typography></AccordionSummary><AccordionDetails sx={{ px: 0 }}><Stack spacing={1.5}>
        <Stack direction="row" spacing={1}><TextField select fullWidth size="small" label={t('authDigits')} value={draft.digits} onChange={event => patch('digits', Number(event.target.value))}>{[6, 8].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField><TextField fullWidth size="small" label={t('authPeriod')} type="number" value={draft.period} slotProps={{ htmlInput: { min: 1, max: 3600 } }} onChange={event => patch('period', event.target.value)}/></Stack>
        <TextField select size="small" label={t('authAlgorithm')} value={draft.algorithm} onChange={event => patch('algorithm', event.target.value)}>{['SHA-1', 'SHA-256', 'SHA-512'].map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
      </Stack></AccordionDetails></Accordion>
      <Stack direction="row" spacing={1}><Button type="submit" variant="contained" size="small" disabled={busy}>{t('save')}</Button><Button size="small" disabled={busy} onClick={() => { setDraft(null); setError(''); }}>{t('proxyCancel')}</Button></Stack>
    </Stack></Box>}
    {state.accounts.length > 0 && <Stack spacing={1} sx={{ py: 1 }}>
      <TextField type="search" size="small" label={t('authSearch')} value={query} onChange={event => setQuery(event.target.value)}/>
      {names.length > 0 && <TextField select size="small" label={t('authGroup')} value={names.includes(filter) ? filter : ''} onChange={event => setFilter(event.target.value)}><MenuItem value="">{t('authAllGroups')}</MenuItem>{names.map(name => <MenuItem key={name} value={name}>{name}</MenuItem>)}</TextField>}
    </Stack>}
    {!state.accounts.length && !draft && <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>{t('authEmpty')}</Typography>}
    {state.accounts.length > 0 && !rows.length && <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>{t('authNoMatches')}</Typography>}
    {sections.map(section => <div key={section.name} className="auth-group">
      {section.name && <div className="auth-group-heading" draggable aria-label={t('authDragGroup', { name: section.name })} onDragStart={event => { event.stopPropagation(); drag.current = { type: 'group', name: section.name }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', section.name); event.currentTarget.classList.add('auth-dragging'); }} onDragEnd={stopDrag} onDragOver={event => { if (!drag.current || (drag.current.type === 'group' && drag.current.name === section.name)) return; event.preventDefault(); event.currentTarget.classList.add('auth-drag-over'); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove('auth-drag-over'); }} onDrop={event => { event.preventDefault(); event.stopPropagation(); const item = drag.current; stopDrag(); if (item?.type === 'group' && item.name !== section.name) send({ action: 'placeGroup', name: item.name, targetName: section.name }); else if (item?.type === 'account') send({ action: 'moveToGroup', id: item.id, name: section.name }); }}><DragIcon className="auth-drag-icon"/><Typography component="h2" variant="caption" color="text.secondary">{section.name} <span className="auth-group-count">({section.total})</span></Typography></div>}
      <div className={state.view === 'grid' ? 'auth-accounts auth-grid' : 'auth-accounts'}>{section.accounts.map(account => <article className="auth-account" key={account.id} data-account-id={account.id} onDragOver={event => { if (drag.current?.type !== 'account' || drag.current.id === account.id) return; event.preventDefault(); event.currentTarget.classList.add('auth-drag-over'); }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.classList.remove('auth-drag-over'); }} onDrop={event => { if (drag.current?.type !== 'account') return; event.preventDefault(); event.stopPropagation(); const id = drag.current.id; stopDrag(); if (id !== account.id) send({ action: 'move', id, targetId: account.id }); }}>
        <div className="auth-account-heading"><span className="auth-drag-handle" draggable aria-label={t('authDragAccount', { name: account.label })} title={t('authDragAccount', { name: account.label })} onDragStart={event => { event.stopPropagation(); drag.current = { type: 'account', id: account.id }; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', account.id); event.currentTarget.closest('.auth-account')?.classList.add('auth-dragging'); }} onDragEnd={stopDrag}><DragIcon className="auth-drag-icon"/></span><Typography component="span" variant="body2" noWrap title={account.label} className="auth-account-title">{account.label}</Typography><IconButton size="small" aria-label={t('authActions', { name: account.label })} onClick={event => setMenu({ anchor: event.currentTarget, account })}><MoreIcon fontSize="small"/></IconButton></div>
        <AuthCode account={account} now={now} active={active} onStatus={setStatus}/>
      </article>)}</div>
    </div>)}
    <Menu anchorEl={menu?.anchor || null} open={!!menu && active} onClose={() => setMenu(null)} transitionDuration={0}>
      <MenuItem onClick={() => { setDraft({ ...menu.account }); setMenu(null); setError(''); }}>{t('authEdit')}</MenuItem>
      <MenuItem disabled={busy} onClick={() => { send({ action: 'move', id: menu.account.id, direction: -1 }); setMenu(null); }}>{t('proxyMoveUp')}</MenuItem>
      <MenuItem disabled={busy} onClick={() => { send({ action: 'move', id: menu.account.id, direction: 1 }); setMenu(null); }}>{t('proxyMoveDown')}</MenuItem>
      <MenuItem onClick={() => { setDeleteTarget(menu.account); setMenu(null); openDialog('delete'); }} sx={{ color: 'error.main' }}>{t('delete')}</MenuItem>
    </Menu>
    {state.accounts.length > 0 && <Button size="small" color="inherit" sx={{ mt: 1, color: 'text.secondary' }} onClick={() => { setClearStage(0); setConfirmation(''); openDialog('clear'); }}>{t('authDeleteAll')}</Button>}
    <Dialog open={!!dialog && active} onClose={closeDialog} fullWidth maxWidth="xs" transitionDuration={0} slotProps={{ paper: { sx: { m: 2, width: 'calc(100% - 32px)', maxHeight: 'calc(100% - 32px)' } } }}>
      <DialogTitle sx={{ fontSize: 16, px: 2, pt: 2, pb: 1 }}>{t(({ import: 'authImport', export: 'authExport', qr: 'authQrExport', groups: 'authGroups', delete: 'delete', clear: 'authDeleteAll' })[dialog] || 'authTitle')}</DialogTitle>
      <DialogContent sx={{ px: 2, pt: '8px !important', scrollbarWidth: 'thin', scrollbarColor: '#666 transparent' }}>
        {error && <Alert severity="error" sx={{ mb: 1.5, fontSize: 12 }}>{t(error)}</Alert>}
        {dialog === 'import' && <Stack spacing={1.5}>
          <Button variant="outlined" component="label" size="small">{t('authSelectFiles')}<input hidden type="file" accept=".json,.txt,application/json,text/plain,image/*" multiple onChange={event => { setFiles([...event.target.files]); event.target.value = ''; }}/></Button>
          {files.length > 0 && <Typography variant="caption">{t('authFileCount', { count: files.length })}</Typography>}
          {!files.length && <TextField label={t('authPaste')} size="small" multiline minRows={3} maxRows={5} value={importText} onChange={event => setImportText(event.target.value)}/>}
          <TextField label={t('authBackupPassword')} size="small" type="password" autoComplete="off" value={password} onChange={event => setPassword(event.target.value)}/>
        </Stack>}
        {dialog === 'export' && <Stack spacing={1.5}><Typography variant="body2" color="text.secondary">{t('authExportHelp')}</Typography><TextField label={t('authBackupPassword')} type="password" size="small" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)}/></Stack>}
        {dialog === 'qr' && <Typography variant="body2" color="text.secondary">{t('authQrHelp')}</Typography>}
        {dialog === 'delete' && <Typography variant="body2">{t('authDeleteOne', { name: deleteTarget?.label || '' })}</Typography>}
        {dialog === 'clear' && <Stack spacing={1.5}><Typography variant="body2">{t('authDeleteAllHelp')}</Typography>{clearStage === 1 && <TextField size="small" label="DELETE ALL" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off"/>}</Stack>}
        {dialog === 'groups' && <Stack spacing={1.5}>
          <TextField size="small" label={t('authGroupName')} value={groupEditor.name} onChange={event => setGroupEditor(previous => ({ ...previous, name: event.target.value }))}/>
          <Stack direction="row" spacing={1}><Button size="small" disabled={busy || !groupEditor.name.trim()} onClick={async () => { if (await send({ action: 'saveGroup', ...groupEditor })) setGroupEditor({ name: '', oldName: '' }); }}>{t(groupEditor.oldName ? 'save' : 'add')}</Button>{groupEditor.oldName && <Button size="small" onClick={() => setGroupEditor({ name: '', oldName: '' })}>{t('proxyCancel')}</Button>}</Stack>
          {names.map(name => <Stack direction="row" alignItems="center" key={name}><Typography variant="body2" noWrap sx={{ flex: 1, minWidth: 0 }}>{name}</Typography><IconButton size="small" aria-label={t('authRenameGroup', { name })} onClick={() => setGroupEditor({ oldName: name, name })}><EditIcon fontSize="small"/></IconButton><IconButton size="small" disabled={busy} aria-label={t('authMoveGroup', { name })} onClick={() => send({ action: 'moveGroup', name, direction: -1 })}><UpIcon fontSize="small"/></IconButton><IconButton size="small" disabled={busy} aria-label={t('authMoveGroupDown', { name })} onClick={() => send({ action: 'moveGroup', name, direction: 1 })}><DownIcon fontSize="small"/></IconButton><IconButton size="small" disabled={busy} aria-label={t('authRemoveGroup', { name })} onClick={() => send({ action: 'removeGroup', name })}><DeleteIcon fontSize="small"/></IconButton></Stack>)}
          <Typography variant="caption" color="text.secondary">{t('authRemoveGroupHelp')}</Typography>
        </Stack>}
      </DialogContent>
      <DialogActions sx={{ px: 2, pb: 2 }}><Button size="small" disabled={busy} onClick={closeDialog}>{t('proxyCancel')}</Button>
        {dialog === 'import' && <Button size="small" variant="contained" disabled={busy || (!files.length && !importText.trim())} onClick={importAccounts}>{t('authImport')}</Button>}
        {(dialog === 'export' || dialog === 'qr') && <Button size="small" variant="contained" disabled={busy} onClick={() => exportAccounts(dialog === 'qr')}>{t('authExport')}</Button>}
        {dialog === 'delete' && <Button size="small" color="error" disabled={busy} onClick={async () => { if (await send({ action: 'remove', id: deleteTarget.id })) { if (draft?.id === deleteTarget.id) setDraft(null); setDialog(''); } }}>{t('delete')}</Button>}
        {dialog === 'clear' && <Button size="small" color="error" disabled={busy || (clearStage === 1 && confirmation !== 'DELETE ALL')} onClick={async () => { if (!clearStage) setClearStage(1); else if (await send({ action: 'clear', confirm: confirmation })) { setDraft(null); setDialog(''); setConfirmation(''); } }}>{t(clearStage ? 'authDeleteAll' : 'authContinue')}</Button>}
      </DialogActions>
    </Dialog>
  </section>;
}
