import React, { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { useLanguage } from './use-language.js';
import { Accordion, AccordionDetails, AccordionSummary, ClickAwayListener, createTheme, IconButton, ThemeProvider, Tooltip, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import HelpOutlinedIcon from '@mui/icons-material/HelpOutlined';

const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#ff7b3a' }, background: { paper: '#1f1f1f' } }, typography: { fontFamily: 'Roboto, sans-serif' } });
function Content({ nodes }) {
  const ref = useRef(null);
  useLayoutEffect(() => { ref.current.append(...nodes); }, [nodes]);
  return <div ref={ref}/>;
}
function Help() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return <ClickAwayListener onClickAway={() => setOpen(false)}><Tooltip title={t('sourceHelp')} open={open} onClose={() => setOpen(false)} disableHoverListener disableFocusListener disableTouchListener><IconButton size="small" aria-label={t('sourceHelpLabel')} aria-expanded={open} onClick={() => setOpen(value => !value)}><HelpOutlinedIcon fontSize="small"/></IconButton></Tooltip></ClickAwayListener>;
}
function LocalizedTitle({ id }) { const { t } = useLanguage(); return <Typography variant="body2">{t(id === 'feed-topics' ? 'topicsHeading' : 'sourcesHeading')}</Typography>; }
function mount(target, title, nodes, id, helpText) {
  const root = document.createElement('div');
  root.className = 'feed-accordion';
  target.replaceWith(root);
  flushSync(() => createRoot(root).render(<ThemeProvider theme={theme}>{helpText && <span className="source-help-button"><Help/></span>}<Accordion disableGutters elevation={0} sx={{ background: 'transparent', '&:before': { display: 'none' } }}><AccordionSummary id={`${id}-header`} aria-controls={`${id}-content`} expandIcon={<ExpandMoreIcon/>}><LocalizedTitle id={id}/></AccordionSummary><AccordionDetails><Content nodes={nodes}/></AccordionDetails></Accordion></ThemeProvider>));
}
const topics = document.querySelector('.feed-topic-controls');
mount(topics, 'Chủ đề muốn xem và ẩn', [topics], 'feed-topics');
const sources = document.querySelector('#feed-sources').closest('details');
const sourceHelp = sources.querySelector('.card-desc');
const sourceDescription = sourceHelp.textContent.trim();
sourceHelp.remove();
mount(sources, sources.querySelector('summary').textContent, [...sources.children].filter(child => child.tagName !== 'SUMMARY'), 'feed-sources', sourceDescription);
