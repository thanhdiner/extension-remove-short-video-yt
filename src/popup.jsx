import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { watchFocusFrame } from './focus-frame.mjs';
import { useLanguage } from './use-language.js';
import LanguageIcon from '@mui/icons-material/Language';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import ProxyPanel from './proxy-panel.jsx';
import AuthPanel from './auth-panel.jsx';
import AuthIcon from '@mui/icons-material/KeyOutlined';
import TextEditorIcon from '@mui/icons-material/DescriptionOutlined';
import { openTextEditor } from './editor-route.mjs';
import RulerIcon from '@mui/icons-material/Straighten';
import { openPageRuler } from './page-ruler.mjs';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ThemeProvider, createTheme, CssBaseline, Switch, Select, MenuItem, Slider, IconButton, CircularProgress } from '@mui/material';

const defaults = { enabled: true, shortsRedirect: 'block', notebookEnabled: true, jsonFormatterEnabled: true, altScrollEnabled: true, scrollSpeed: 5, smoothScroll: true, customSeekEnabled: true, seekSeconds: 20 };
const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#ff7b3a' }, background: { default: '#171717', paper: '#232323' } }, typography: { fontFamily: 'Roboto, sans-serif' }, shape: { borderRadius: 4 } });
function App() {
  const { language, t, changeLanguage } = useLanguage();
  const [settings, setSettings] = useState(null);
  const [page, setPage] = useState('home');
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [error, setError] = useState('');
  const frameRef = useRef(null);
  const stopFocusSizing = useRef(null);
  const [focusReady, setFocusReady] = useState(false);
  const [proxyReady, setProxyReady] = useState(false);
  const proxyRequested = useRef(false);
  const [authReady, setAuthReady] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const authRequested = useRef(false);
  const onAuthReady = useCallback(() => {
    setAuthReady(true);
    if (authRequested.current) { authRequested.current = false; setPage('auth'); }
  }, []);
  const onProxyReady = useCallback(() => {
    setProxyReady(true);
    if (proxyRequested.current) { proxyRequested.current = false; setPage('proxy'); }
  }, []);
  const resizeFocus = () => {
    const frame = frameRef.current;
    if (!frame) return;
    stopFocusSizing.current?.();
    stopFocusSizing.current = watchFocusFrame(frame, () => setFocusReady(true));
  };
  useEffect(() => () => stopFocusSizing.current?.(), []);
  useEffect(() => { chrome.storage.sync.get('hys_settings', result => { if (chrome.runtime.lastError) { setError('loadFailed'); return; } setSettings({ ...defaults, ...(result.hys_settings || {}) }); }); }, []);
  const save = (patch) => {
    setSettings(s => ({ ...s, ...patch }));
    setError('');
    chrome.runtime.sendMessage({ type: 'DINKIT_SETTINGS_UPDATE', patch }, result => {
      if (chrome.runtime.lastError || !result?.ok) setError('saveFailed');
    });
  };
  const toggle = (label, key) => <div className="setting-row"><span>{label}</span><Switch slotProps={{ input: { 'aria-label': label } }} checked={!!settings[key]} onChange={e => save({ [key]: e.target.checked })} /></div>;
  const slider = (label, key, min, max, step, suffix, disabled) => <div className="slider-group"><div className="slider-label"><span>{label}</span><strong>{settings[key]}{suffix}</strong></div><Slider aria-label={label} min={min} max={max} step={step} value={settings[key]} disabled={disabled} onChange={(_,value) => setSettings(s => ({ ...s, [key]: value }))} onChangeCommitted={(_,value) => save({ [key]: value })} /></div>;
  if (!settings) return <main className="popup-shell">{error ? t(error) : <CircularProgress size={24}/>}</main>;
  const tools = [
    { name: 'YouTube', icon: <PlayCircleOutlineIcon/>, action: () => setPage('youtube') },
    { name: t('utilities'), icon: <TuneIcon/>, action: () => setPage('utilities') },
    { name: 'Focus Firewall', icon: <ShieldOutlinedIcon/>, action: () => setPage('focus') },
    { name: 'Proxy', icon: <AltRouteIcon/>, action: () => { if (proxyReady) setPage('proxy'); else proxyRequested.current = true; } },
    { name: t('authTitle'), icon: <AuthIcon/>, action: () => { if (authReady) setPage('auth'); else authRequested.current = true; } },
    { name: t('textEditor'), icon: <TextEditorIcon/>, action: () => { openTextEditor().catch(() => setError('editorOpenFailed')); } },
    { name: t('rulerTitle'), icon: <RulerIcon/>, action: () => { setError(''); openPageRuler({ title: t('rulerTitle'), mode: t('rulerMode'), hint: t('rulerHint'), reset: t('rulerReset'), grid: t('rulerGrid'), close: t('rulerClose') }).then(() => window.close()).catch(() => setError('rulerUnavailable')); } },
    { name: t('language'), icon: <LanguageIcon/>, action: () => setPage('language') }
  ];
  return <main className={`popup-shell${page === 'proxy' || page === 'auth' ? ' popup-proxy' : ''}${page === 'auth' && authDialogOpen ? ' popup-auth-dialog' : ''}`}>
    {page === 'home' ? <><header className="home-header"><img src="focus-toolkit-icon32.png" alt=""/><h1>DinKit</h1></header>
      <div className="tool-list">{tools.map(tool => <button className="tool-row" key={tool.name} onClick={() => { proxyRequested.current = false; authRequested.current = false; tool.action(); }}><span className="tool-icon">{tool.icon}</span><span className="tool-copy"><strong>{tool.name}</strong></span><span className="tool-arrow"><ChevronRightIcon/></span></button>)}</div>
    </> : <><header className="detail-header"><IconButton aria-label={t('back')} onClick={() => setPage('home')} size="small"><ArrowBackIcon fontSize="small"/></IconButton><h1>{page === 'youtube' ? 'YouTube' : page === 'focus' ? 'Focus Firewall' : page === 'proxy' ? 'Proxy' : page === 'auth' ? t('authTitle') : page === 'language' ? t('language') : t('utilities')}</h1></header>
      {page === 'proxy' || page === 'auth' ? null : page === 'language' ? <section className={`settings-section${languageMenuOpen ? ' language-menu-open' : ''}`}><div className="setting-row select-row"><span>{t('language')}</span><Select size="small" value={language} open={languageMenuOpen} onOpen={() => setLanguageMenuOpen(true)} onClose={() => setLanguageMenuOpen(false)} inputProps={{ 'aria-label': t('language') }} onChange={event => { setError(''); changeLanguage(event.target.value).catch(() => setError('saveFailed')); }}><MenuItem value="vi">Tiếng Việt</MenuItem><MenuItem value="en">English</MenuItem></Select></div></section> : page === 'focus' ? (!focusReady && <div className="focus-loading"><CircularProgress size={22}/></div>) : page === 'youtube' ? <section className="settings-section">
        {toggle(t('hideShorts'), 'enabled')}
        <div className="setting-row select-row"><span>{t('shortsAction')}</span><Select size="small" value={settings.shortsRedirect} onChange={e => save({ shortsRedirect: e.target.value })} inputProps={{ 'aria-label': t('shortsAction') }}><MenuItem value="block">{t('home')}</MenuItem><MenuItem value="watch">{t('watch')}</MenuItem></Select></div>
        {toggle(t('seekToggle'), 'customSeekEnabled')}
        {slider(t('seekTime'), 'seekSeconds', 1, 120, 1, t('seconds'), !settings.customSeekEnabled)}
      </section> : <section className="settings-section">
        {toggle('JSON Formatter', 'jsonFormatterEnabled')}
        {toggle(t('notebook'), 'notebookEnabled')}{toggle(t('altScroll'), 'altScrollEnabled')}{toggle(t('smoothScroll'), 'smoothScroll')}
        {slider(t('scrollSpeed'), 'scrollSpeed', 1, 20, .5, '×', !settings.altScrollEnabled)}
      </section>}
    </>}<div hidden={page !== 'proxy'}><ProxyPanel onReady={onProxyReady}/></div><div hidden={page !== 'auth'}><AuthPanel active={page === 'auth'} onReady={onAuthReady} onDialogChange={setAuthDialogOpen}/></div><iframe ref={frameRef} className={page === 'focus' && focusReady ? 'focus-frame' : 'focus-frame focus-frame-preload'} title="Focus Firewall" src="focus/popup.html" onLoad={resizeFocus} tabIndex={page === 'focus' ? 0 : -1} aria-hidden={page !== 'focus'} />{error && <p className="error" role="alert">{t(error)}</p>}
  </main>;
}
createRoot(document.getElementById('root')).render(<ThemeProvider theme={theme}><CssBaseline/><App/></ThemeProvider>);
