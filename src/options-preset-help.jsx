import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useLanguage } from './use-language.js';
import { ClickAwayListener, createTheme, IconButton, ThemeProvider, Tooltip } from '@mui/material';
import HelpOutlinedIcon from '@mui/icons-material/HelpOutlined';
const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#ff7b3a' }, background: { paper: '#232323' } }, typography: { fontFamily: 'Roboto, sans-serif' } });
function Help({ nameKey, descriptionKey }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return <ClickAwayListener onClickAway={() => setOpen(false)}><Tooltip title={t(descriptionKey)} open={open} onClose={() => setOpen(false)} disableHoverListener disableFocusListener disableTouchListener><IconButton size="small" aria-label={t('explainPreset', { name: t(nameKey) })} aria-expanded={open} onClick={() => setOpen(value => !value)}><HelpOutlinedIcon fontSize="small" /></IconButton></Tooltip></ClickAwayListener>;
}
const keys = [['youtubeMode', 'presetYoutubeHelp'], ['socialBlock', 'presetSocialHelp'], ['redditMode', 'presetRedditHelp']];
for (const [index, item] of [...document.querySelectorAll('.preset-item')].entries()) {
  const name = item.querySelector('.preset-name');
  const details = item.querySelector('.preset-details');
  if (!name || !details) continue;
  const root = document.createElement('span');
  root.className = 'preset-help';
  name.after(root);
  const description = details.textContent.trim().replace(/\s+/g, ' ');
  details.remove();
  flushSync(() => createRoot(root).render(<ThemeProvider theme={theme}><Help nameKey={keys[index][0]} descriptionKey={keys[index][1]} /></ThemeProvider>));
}
