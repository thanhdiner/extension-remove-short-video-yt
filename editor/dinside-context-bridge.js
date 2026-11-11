/* Private, read-only integration for the user's DinSide fork. */
/* global module, chrome, editor, activeTab, state, location, innerWidth, innerHeight */
(() => {
  'use strict';
  const DINSIDE_ID = 'lbnijnbomgbpkdjehldjhpdclmpifkkc';
  const TYPE = 'DINSIDE_LOCAL_EDITOR_CONTEXT';
  const MAX_TEXT = 50000, MAX_SELECTION = 12000, MAX_VIEWPORT = 8000;

  function capture({ editor, activeTab, state, location, innerWidth, innerHeight }, kind = 'snapshot') {
    const model = editor?.getModel();
    if (!model || model.isDisposed() || !activeTab) {
      const pageState = { url: location.href, title: 'Local Text Editor', textLength: 0, revision: 0,
        dirty: false, localEditor: { status: 'empty' }, selectedText: '', selection: null, selectionDragging: false };
      return kind === 'state' ? { pageState } : { pageState, context: null, viewport: null };
    }
    const name = activeTab.name || state.name || 'Untitled';
    const id = model.uri.toString(), revision = model.getVersionId();
    const language = model.getLanguageId(), totalChars = model.getValueLength();
    const ranges = (editor.getVisibleRanges() || []).slice(0, 40);
    const selected = (editor.getSelections() || []).filter(range => !range.isEmpty()).slice(0, 20);
    let selectedText = '';
    for (const range of selected) {
      if (selectedText.length >= MAX_SELECTION) break;
      selectedText += (selectedText ? '\n\n' : '') + model.getValueInRange(range).slice(0, MAX_SELECTION - selectedText.length);
    }
    const selection = selectedText ? { text: selectedText, title: name, url: location.href,
      sourceRef: `${name}:${selected[0].startLineNumber}-${selected.at(-1).endLineNumber}`,
      domContext: { section: name, element: 'code', block: `Language: ${language}`, blockId: `local-editor:${id}` } } : null;
    const info = { id, name, language, revision, dirty: state.dirty === true,
      lineCount: model.getLineCount(), textLength: totalChars, cursor: editor.getPosition() };
    const pageState = { url: location.href, title: `${name} — Local Text Editor`,
      textLength: totalChars, revision, dirty: true, localEditor: info,
      selectedText, selection, selectionDragging: false, articleCount: 0, headingCount: 1, linkCount: 0 };
    if (kind === 'state') return { pageState };
    const end = model.getPositionAt(Math.min(totalChars, MAX_TEXT));
    const text = model.getValueInRange({ startLineNumber: 1, startColumn: 1,
      endLineNumber: end.lineNumber, endColumn: end.column });
    const metadata = [`File: ${name}`, `Language: ${language}`, `Lines: ${info.lineCount}`,
      `Unsaved changes: ${info.dirty ? 'yes' : 'no'}`].join('\n');
    const context = { url: location.href, title: pageState.title,
      text: `${metadata}\n\n${text}`, textTruncated: totalChars > MAX_TEXT,
      extractor: 'local-text-editor', localEditor: info, links: [], images: [], buttons: [], semanticItems: [], capturedAt: Date.now() };
    let used = 0;
    const blocks = [];
    for (const range of ranges) {
      if (used >= MAX_VIEWPORT) break;
      const visible = model.getValueInRange(range).slice(0, MAX_VIEWPORT - used);
      if (visible) { blocks.push({ tag: 'code', text: visible }); used += visible.length; }
    }
    const viewport = { url: location.href, title: pageState.title, localEditor: info,
      scrollY: Math.round(editor.getScrollTop()),
      scrollPercent: Math.round(100 * editor.getScrollTop() / Math.max(1, editor.getScrollHeight() - editor.getLayoutInfo().height)),
      viewportWidth: innerWidth, viewportHeight: innerHeight, headings: [name, language], blocks,
      selectedText, images: [], videos: [], capturedAt: Date.now() };
    return { pageState, context, viewport };
  }

  function install({ chrome, getSource, actions = {}, eventTarget = globalThis }) {
    let disposed = false, ownTabId = null, listening = false;
    const pending = new Set();
    const ownTab = chrome.tabs.getCurrent();
    const listener = (request, sender, respond) => {
      if (disposed || ownTabId !== request?.tabId || sender.id !== DINSIDE_ID || sender.url !== `chrome-extension://${DINSIDE_ID}/sidepanel.html` ||
          ![TYPE, 'DINSIDE_LOCAL_EDITOR_ACTION'].includes(request?.type) || request.version !== 1 || !Number.isSafeInteger(request.tabId)) return false;
      const action = request.type === 'DINSIDE_LOCAL_EDITOR_ACTION';
      if (action ? !Object.hasOwn(actions, request.action) || !Array.isArray(request.args) : !['state', 'snapshot'].includes(request.kind)) return false;
      const finish = value => { if (!pending.delete(finish)) return; try { respond(value); } catch (_) {} };
      pending.add(finish);
      Promise.resolve().then(async () => {
        if (disposed) return;
        try {
          const payload = action ? { url: getSource().location.href, result: await actions[request.action](...request.args) }
            : capture(getSource(), request.kind);
          finish({ ok: true, version: 1, provider: 'local-text-editor', tabId: ownTabId, ...payload });
        } catch (error) {
          finish({ ok: false, version: 1, tabId: ownTabId, error: error.message });
        }
      }).catch(() => {});
      return true;
    };
    ownTab.then(tab => {
      if (disposed || !Number.isSafeInteger(tab?.id)) return;
      ownTabId = tab.id;
      chrome.runtime.onMessageExternal.addListener(listener); listening = true;
    }).catch(() => {});
    const dispose = () => {
      disposed = true;
      for (const finish of pending) finish({ ok: false, version: 1, tabId: ownTabId,
        errorCode: 'EDITOR_RELOADING', error: 'Local Text Editor is reloading.' });
      if (listening) chrome.runtime.onMessageExternal.removeListener(listener);
      eventTarget.removeEventListener?.('pagehide', dispose);
    };
    eventTarget.addEventListener?.('pagehide', dispose, { once: true });
    return dispose;
  }
  function installEvents({ chrome, window, getSource }) {
    let currentEditor, subscriptions = [], timer, disposed = false, dragging = false;
    const send = async (kind, captured) => {
      if (disposed || dragging) return;
      try {
        const source = getSource(), tab = await chrome.tabs.getCurrent();
        if (!tab?.id || disposed) return;
        await chrome.runtime.sendMessage(DINSIDE_ID, { type: 'DINSIDE_LOCAL_EDITOR_EVENT', version: 1,
          tabId: tab.id, url: source.location.href, kind, ...(captured || capture(source, 'state')) });
      } catch (_) { /* DinSide may be closed; never interrupt the editor. */ }
    };
    const schedule = (kind = 'selection') => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => send(kind), 60);
    };
    const bind = () => {
      try {
        const next = getSource().editor;
        if (next === currentEditor) return;
        subscriptions.forEach(item => item.dispose()); subscriptions = []; currentEditor = next;
        for (const [method, kind] of [['onDidChangeCursorSelection', 'selection'], ['onDidChangeModel', 'page'],
          ['onDidChangeModelContent', 'page'], ['onDidScrollChange', 'viewport']]) {
          if (next?.[method]) subscriptions.push(next[method](() => schedule(kind)));
        }
      } catch (_) {}
    };
    const down = event => { if (event.target?.closest?.('.monaco-editor')) { dragging = true; bind(); } };
    const up = () => { if (dragging) { dragging = false; bind(); schedule(); } };
    const focus = () => { bind(); schedule(); };
    const keydown = event => {
      if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing ||
          event.key?.toLowerCase() !== 'l') return;
      try {
        const source = getSource();
        if (!source.editor?.hasTextFocus()) return;
        const snapshot = capture(source, 'state');
        if (!snapshot.pageState.selection?.text.trim()) return;
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.repeat) return;
        window.clearTimeout(timer);
        void send('keep-selection', snapshot);
      } catch (_) {}
    };
    window.addEventListener('keydown', keydown, true);
    window.document.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.document.addEventListener('focusin', focus, true);
    window.addEventListener('focus', focus);
    bind();
    const dispose = () => {
      disposed = true; window.clearTimeout(timer); subscriptions.forEach(item => item.dispose());
      window.document.removeEventListener('pointerdown', down, true); window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.document.removeEventListener('focusin', focus, true); window.removeEventListener('focus', focus);
      window.removeEventListener('keydown', keydown, true);
    };
    window.addEventListener('pagehide', dispose, { once: true });
    return dispose;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { capture, install, installEvents, DINSIDE_ID, TYPE };
  else if (!globalThis.__dinSideEditorContextBridge) {
    globalThis.__dinSideEditorContextBridge = install({ chrome,
      getSource: () => ({ editor, activeTab, state, location, innerWidth, innerHeight }) });
  }
})();
