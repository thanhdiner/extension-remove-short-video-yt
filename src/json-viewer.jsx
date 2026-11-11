import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { ThemeProvider, createTheme, IconButton, ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import UnfoldLessIcon from '@mui/icons-material/UnfoldLess';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import { useLanguage } from './use-language.js';
import { formatJson, jsonLines, readJsonDocument } from './json-format.mjs';

const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#ff7b3a' }, background: { default: '#171717', paper: '#232323' } }, typography: { fontFamily: 'Roboto, Arial, sans-serif' }, shape: { borderRadius: 4 } });
const styles = `
:host { all: initial; position: fixed; inset: 0; z-index: 2147483647; display: block; color: #dedcda; background: #171717; font: 14px Roboto, Arial, sans-serif; color-scheme: dark; }
* { box-sizing: border-box; }
.viewer { height: 100%; display: flex; flex-direction: column; }
.toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #333236; }
.brand { font-size: 14px; font-weight: 600; margin-right: auto; white-space: nowrap; }
.actions { display: flex; align-items: center; gap: 4px; }
.code { flex: 1; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; padding: 16px; font: 13px/1.65 Consolas, 'Cascadia Code', monospace; tab-size: 2; }
pre { margin: 0; font: inherit; white-space: pre; }
.line { position: relative; white-space: pre; min-height: 22px; margin-left: 20px; }
.key { color: #9ecbff; } .string { color: #a8d79e; } .number { color: #ffba7b; } .literal { color: #c9a4f5; }
.fold { position: absolute; left: -20px; top: 1px; width: 18px; height: 20px; padding: 0; border: 0; background: transparent; color: #aaa9a8; cursor: pointer; font-size: 12px; }
.fold:hover { color: #ff986b; } button:focus-visible { outline: 2px solid #ff7b3a; outline-offset: 1px; }
.ellipsis { color: #aaa9a8; }
.feedback { align-self: center; font: 12px Roboto, Arial, sans-serif; }
`;

export async function copyJson(text) {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  // Clipboard API is unavailable on plain HTTP pages.
  const input = document.createElement('textarea');
  input.value = text;
  input.style.cssText = 'position:fixed;left:-10000px;top:0';
  document.body.append(input);
  try { input.select(); if (!document.execCommand('copy')) throw new Error('copy'); }
  finally { input.remove(); }
}

function Viewer({ data }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState('formatted');
  const [collapsed, setCollapsed] = useState(new Set());
  const [copyState, setCopyState] = useState('');
  const model = useMemo(() => data.interactive ? jsonLines(data.text) : null, [data]);
  function toggle(id) { setCollapsed(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  async function copy() {
    try { await copyJson(mode === 'raw' ? data.raw : data.text); setCopyState('copied'); }
    catch { setCopyState('copyFailed'); }
  }
  return <ThemeProvider theme={theme}><div className="viewer">
    <header className="toolbar"><span className="brand">DinKit · JSON</span><div className="actions">
      <ToggleButtonGroup size="small" exclusive value={mode} aria-label={t('jsonView')} onChange={(_, value) => { if (value) { setMode(value); setCopyState(''); } }}>
        <ToggleButton value="formatted">{t('jsonFormatted')}</ToggleButton><ToggleButton value="raw">{t('jsonRaw')}</ToggleButton>
      </ToggleButtonGroup>
      {mode === 'formatted' && model?.groups.length > 0 && <>
        <Tooltip title={t('jsonCollapseAll')}><IconButton size="small" aria-label={t('jsonCollapseAll')} onClick={() => setCollapsed(new Set(model.groups.map((_, i) => i)))}><UnfoldLessIcon fontSize="small"/></IconButton></Tooltip>
        <Tooltip title={t('jsonExpandAll')}><IconButton size="small" aria-label={t('jsonExpandAll')} onClick={() => setCollapsed(new Set())}><UnfoldMoreIcon fontSize="small"/></IconButton></Tooltip>
      </>}
      <Tooltip title={t('copy')}><IconButton size="small" aria-label={t('copy')} onClick={copy}><ContentCopyIcon fontSize="small"/></IconButton></Tooltip>
      {copyState && <span className="feedback" role="status">{t(copyState)}</span>}
    </div></header>
    <main className="code" tabIndex={0} aria-label={t('jsonContent')}>
      {mode === 'raw' || !model ? <pre>{mode === 'raw' ? data.raw : data.text}</pre> : model.lines.map((line, index) => line.ancestors.some(id => collapsed.has(id)) ? null : <div className="line" key={index} style={{ paddingLeft: `${line.indent * 20}px` }}>
        {line.group !== undefined && <button className="fold" style={{ left: `${line.indent * 20 - 20}px` }} aria-label={t(collapsed.has(line.group) ? 'jsonExpand' : 'jsonCollapse')} aria-expanded={!collapsed.has(line.group)} onClick={() => toggle(line.group)}>{collapsed.has(line.group) ? '▸' : '▾'}</button>}
        {line.parts.map((part, i) => <span key={i} className={part.kind || undefined}>{part.text}</span>)}
        {collapsed.has(line.group) && <span className="ellipsis"> … {model.groups[line.group].suffix}</span>}
      </div>)}
    </main>
  </div></ThemeProvider>;
}

if (!globalThis.dinkitJsonViewer && window.top === window) {
  let root;
  let host;
  let original;
  let savedScroll;
  function setEnabled(enabled) {
    if (!enabled && root) {
      root.unmount();
      host.replaceWith(original);
      window.scrollTo(savedScroll.x, savedScroll.y);
      root = host = original = null;
      return;
    }
    if (!enabled || root) return;
    const source = readJsonDocument(document);
    const data = source === null ? null : formatJson(source);
    if (!data) return;
    savedScroll = { x: window.scrollX, y: window.scrollY };
    host = document.createElement('div');
    host.id = 'dinkit-json-viewer';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = styles;
    const mount = document.createElement('div');
    mount.style.height = '100%';
    shadow.append(style, mount);
    const cache = createCache({ key: 'dinkit-json', container: shadow });
    root = createRoot(mount);
    original = document.createDocumentFragment();
    while (document.body.firstChild) original.append(document.body.firstChild);
    document.body.append(host);
    root.render(<CacheProvider value={cache}><Viewer data={data}/></CacheProvider>);
  }
  globalThis.dinkitJsonViewer = { setEnabled };
  try {
    let revision = 0;
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.hys_settings) { revision++; setEnabled(changes.hys_settings.newValue?.jsonFormatterEnabled !== false); }
    });
    chrome.storage.sync.get('hys_settings', data => {
      try { if (!chrome.runtime.lastError && revision === 0) setEnabled(data.hys_settings?.jsonFormatterEnabled !== false); } catch { /* Keep raw on an invalidated context. */ }
    });
  } catch { /* Keep raw when extension storage is unavailable. */ }
}
