import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, createTheme, FormControl, Select, MenuItem } from '@mui/material';
const native = document.getElementById('feed-mode');
const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#ff7b3a' }, background: { paper: '#232323' } }, typography: { fontFamily: 'Roboto, sans-serif' }, shape: { borderRadius: 4 } });
function FeedSelect() {
  const [value, setValue] = useState(native.value);
  useEffect(() => { const sync = () => setValue(native.value); native.addEventListener('dinkit-mode-sync', sync); return () => native.removeEventListener('dinkit-mode-sync', sync); }, []);
  return <FormControl fullWidth size="small"><Select value={value} inputProps={{ 'aria-label': 'Facebook Healthy Feed' }} onChange={event => { native.value = event.target.value; setValue(event.target.value); native.dispatchEvent(new Event('change', { bubbles: true })); }}><MenuItem value="information">Information</MenuItem><MenuItem value="social">Social</MenuItem><MenuItem value="unrestricted">Unrestricted</MenuItem></Select></FormControl>;
}
createRoot(document.getElementById('feed-mode-mui')).render(<ThemeProvider theme={theme}><FeedSelect/></ThemeProvider>);
