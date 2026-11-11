import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useLanguage } from './use-language.js';
import { ThemeProvider, createTheme, CssBaseline, Box, Button, Chip, Divider, FormControl, MenuItem, Select, Stack, TextField, Typography } from '@mui/material';

const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#ff7b3a' }, background: { default: '#171717', paper: '#232323' } }, typography: { fontFamily: 'Roboto, sans-serif' }, shape: { borderRadius: 4 } });

function FeedSelect() {
  const { t } = useLanguage();
  const [value, setValue] = useState('unrestricted');
  useEffect(() => {
    const native = document.getElementById('feed-mode');
    const sync = () => setValue(native.value);
    sync();
    native.addEventListener('dinkit-mode-sync', sync);
    return () => native.removeEventListener('dinkit-mode-sync', sync);
  }, []);
  return <FormControl fullWidth size="small"><Select value={value} inputProps={{ 'aria-label': 'Facebook Healthy Feed' }} onChange={event => {
    const native = document.getElementById('feed-mode');
    native.value = event.target.value;
    setValue(event.target.value);
    native.dispatchEvent(new Event('change', { bubbles: true }));
  }}><MenuItem value="information">{t('modeInfo')}</MenuItem><MenuItem value="social">{t('modeSocial')}</MenuItem><MenuItem value="unrestricted">{t('modeUnlimited')}</MenuItem></Select></FormControl>;
}

function FocusPopup() {
  const { t } = useLanguage();
  return <ThemeProvider theme={theme}><CssBaseline/><main className="popup-container">
    <header className="focus-header"><Typography component="h1" variant="subtitle1" className="focus-title">Focus Firewall</Typography><Chip id="status-badge" size="small" label={<span id="status-badge-label">OFF</span>} variant="outlined" /></header>
    <Box id="pending-log-container" className="focus-section" sx={{ display: 'none' }}>
      <Typography variant="body2" color="error">{t('logResult')}</Typography><Typography id="ended-task-name" variant="body2">-</Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 1 }}><Button id="log-done-btn" variant="contained" size="small" fullWidth>{t('done')}</Button><Button id="log-failed-btn" variant="outlined" color="error" size="small" fullWidth>{t('failed')}</Button></Stack>
    </Box>
    <Box id="focus-active-view" className="focus-section" sx={{ display: 'none' }}>
      <div className="focus-details"><Typography variant="body2" color="text.secondary">{t('currentTask')}</Typography><Typography id="active-task-desc" variant="body2">-</Typography></div>
      <div className="focus-details"><Typography variant="body2" color="text.secondary">{t('timeRemaining')}</Typography><Typography id="active-time-remaining" variant="subtitle1">-</Typography></div>
      <Button id="stop-focus-btn" variant="outlined" color="error" size="small" fullWidth sx={{ display: 'none', mt: 1 }}>{t('stopFocus')}</Button>
      <Typography id="strict-warning" variant="caption" color="error" sx={{ display: 'none' }}>{t('strictWarning')}</Typography>
    </Box>
    <Box id="focus-inactive-view" className="focus-section">
      <TextField id="task-input" placeholder={t('enterTask')} inputProps={{ 'aria-label': t('focusTask') }} size="small" fullWidth autoComplete="off" />
      <Typography id="input-error" role="alert" variant="caption" color="error" sx={{ display: 'none' }}>{t('taskRequired')}</Typography>
      <Stack direction="row" spacing={.75} sx={{ mt: 1 }}>{[25,50,90].map(duration => <Button key={duration} className="btn-start" data-duration={duration} aria-label={t('startMinutes', { minutes: duration })} variant="outlined" size="small" fullWidth>{t('minutes', { minutes: duration })}</Button>)}</Stack>
    </Box>
    <Divider/>
    <Box className="focus-section">
      <Typography component="div" variant="caption" color="text.secondary" sx={{ mb: .75 }}>{t('blockCurrentPage')}</Typography>
      <Stack direction="row" spacing={1}>
        <Button className="block-current-page" data-scope="site" variant="outlined" size="small" fullWidth>{t('blockWholeSite')}</Button>
        <Button className="block-current-page" data-scope="exact" variant="outlined" size="small" fullWidth>{t('blockExactUrl')}</Button>
      </Stack>
      <Typography component="p" id="block-current-status" className="focus-info" variant="caption" role="status" aria-live="polite" />
    </Box>
    <Box className="focus-section"><Typography component="div" variant="caption" color="text.secondary" sx={{ mb: .75 }}>Facebook · Healthy Feed</Typography>
      <select id="feed-mode" className="native-feed-mode" aria-hidden="true" tabIndex={-1} defaultValue="unrestricted"><option value="information">Information</option><option value="social">Social</option><option value="unrestricted">Unrestricted</option></select>
      <FeedSelect/>
      <Typography component="p" id="feed-status" className="focus-info" variant="caption" color="text.secondary" role="status" aria-live="polite" />
      <Typography component="p" id="feed-warning" className="focus-error" variant="caption" color="error" role="alert" hidden />
      <Button id="feed-start" variant="contained" size="small">{t('readUpdates')}</Button>
    </Box>
    <Box className="focus-section focus-stats"><div><Typography variant="caption" color="text.secondary">{t('wastedToday')}</Typography><Typography id="wasted-time-stat" variant="body2" fontWeight={600}>-</Typography></div><div><Typography variant="caption" color="text.secondary">{t('blocksToday')}</Typography><Typography id="blocks-count-stat" variant="body2" fontWeight={600}>-</Typography></div></Box>
    <Button id="open-rules-btn" variant="text" size="small" fullWidth>{t('rulesSettings')}</Button>
  </main></ThemeProvider>;
}
flushSync(() => createRoot(document.getElementById('focus-root')).render(<FocusPopup/>));
