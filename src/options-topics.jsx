import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal, flushSync } from 'react-dom';
import { useLanguage } from './use-language.js';
import { Autocomplete, Chip, ClickAwayListener, createTheme, IconButton, Stack, TextField, ThemeProvider, Tooltip } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlined';
const theme = createTheme({ palette: { mode: 'dark', primary: { main: '#ff7b3a' }, background: { paper: '#1f1f1f' } }, typography: { fontFamily: 'Roboto, sans-serif' } });
function TopicHelp() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const target = document.getElementById('feed-topics-header').closest('.feed-accordion');
  return createPortal(<div className="topic-help-button"><ClickAwayListener onClickAway={() => setOpen(false)}><Tooltip disableHoverListener disableFocusListener disableTouchListener title={t('topicHelp')} open={open} onOpen={() => setOpen(true)} onClose={() => setOpen(false)}><IconButton size="small" aria-label={t('topicHelpLabel')} aria-expanded={open} onClick={() => setOpen(value => !value)}><HelpOutlineIcon fontSize="small"/></IconButton></Tooltip></ClickAwayListener></div>, target);
}
function TopicInput({ id, labelKey }) {
  const { t } = useLanguage();
  const label = t(labelKey);
  const native = document.getElementById(id);
  const parse = text => text.split(',').map(x => x.trim()).filter(Boolean);
  const [topics, setTopics] = useState(() => parse(native.value));
  const [draft, setDraft] = useState('');
  const topicsRef = useRef(topics);
  const draftRef = useRef('');
  const update = values => {
    const unique = [];
    for (const text of values.flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean)) {
      if (!unique.some(existing => existing.toLocaleLowerCase() === text.toLocaleLowerCase())) unique.push(text);
    }
    const next = unique.slice(0, 20);
    topicsRef.current = next;
    native.value = next.join(', ');
    native.dataset.dirty = 'true';
    setTopics(next);
  };
  useEffect(() => {
    const sync = () => { const next = parse(native.value); topicsRef.current = next; setTopics(next); };
    const commit = () => {
      if (draftRef.current.trim()) {
        update([...topicsRef.current, draftRef.current]);
        draftRef.current = '';
        setDraft('');
      }
    };
    native.addEventListener('dinkit-topics-sync', sync);
    document.addEventListener('dinkit-topics-commit', commit);
    sync();
    return () => { native.removeEventListener('dinkit-topics-sync', sync); document.removeEventListener('dinkit-topics-commit', commit); };
  }, [native]);
  return <Autocomplete multiple freeSolo options={[]} value={topics} inputValue={draft} onInputChange={(_, value, reason) => { if (reason === 'input') native.dataset.dirty = 'true'; draftRef.current = value; setDraft(value); }} onChange={(_, value) => update(value)} filterSelectedOptions renderValue={(values, getItemProps) => values.map((value, index) => { const { key, ...props } = getItemProps({ index }); return <Chip key={key} label={value} size="small" {...props}/>; })} renderInput={params => <TextField {...params} label={label} placeholder={topics.length >= 20 ? t('topicLimit') : t('topicPlaceholder')} size="small" onKeyDown={event => { if (event.key === 'Enter') event.preventDefault(); }} />} />;
}
flushSync(() => createRoot(document.getElementById('feed-topics-mui')).render(<ThemeProvider theme={theme}><div className="topic-fields"><TopicHelp/><TopicInput id="feed-more-topics" labelKey="wantedTopics"/><TopicInput id="feed-less-topics" labelKey="hiddenTopics"/></div></ThemeProvider>));
