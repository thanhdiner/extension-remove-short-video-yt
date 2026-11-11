import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useLanguage } from './use-language.js';
import { createTheme, ThemeProvider, ClickAwayListener, FormControl, IconButton, InputLabel, MenuItem, Select, Tooltip } from '@mui/material';
import HelpOutlinedIcon from '@mui/icons-material/HelpOutlined';
const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#ff7b3a' }, background: { paper: '#232323' } }, typography: { fontFamily: 'Roboto, sans-serif' }, shape: { borderRadius: 4 } });
function OptionSelect({ nativeId, labelKey, values }) {
  const { t } = useLanguage();
  const label = t(labelKey);
  const native = document.getElementById(nativeId);
  const [value, setValue] = useState(native.value);
  useEffect(() => {
    const sync = () => setValue(native.value);
    native.addEventListener('dinkit-mode-sync', sync);
    sync();
    return () => native.removeEventListener('dinkit-mode-sync', sync);
  }, [native]);
  return <FormControl fullWidth size="small"><InputLabel id={`${nativeId}-label`}>{label}</InputLabel><Select labelId={`${nativeId}-label`} label={label} value={value} MenuProps={{ disableScrollLock: true }} onChange={event => {
    native.value = event.target.value;
    setValue(event.target.value);
    native.dispatchEvent(new Event('change', { bubbles: true }));
  }}>{values.map(([key, text]) => <MenuItem key={key} value={key}>{text === key && /^\d+$/.test(key) ? text : t(text)}</MenuItem>)}</Select></FormControl>;
}
flushSync(() => createRoot(document.getElementById('feed-options-mui')).render(<ThemeProvider theme={theme}><OptionSelect nativeId="feed-mode" labelKey="feedMode" values={[["information", "information"], ["social", "social"], ["unrestricted", "unrestricted"]]} /><OptionSelect nativeId="feed-max-posts" labelKey="postsPerSession" values={[["20", "20"], ["25", "25"], ["30", "30"]]} /></ThemeProvider>));

function FeedHelp() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return <ClickAwayListener onClickAway={() => setOpen(false)}><Tooltip disableHoverListener disableFocusListener disableTouchListener open={open} onClose={() => setOpen(false)} title={t('feedHelp')}><IconButton size="small" aria-label={t('feedHelpLabel')} aria-expanded={open} onClick={() => setOpen(value => !value)}><HelpOutlinedIcon fontSize="small"/></IconButton></Tooltip></ClickAwayListener>;
}
flushSync(() => createRoot(document.getElementById('feed-help-mui')).render(<ThemeProvider theme={theme}><FeedHelp/></ThemeProvider>));
