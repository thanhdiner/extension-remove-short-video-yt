export function isLocalTextFile(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:' && decodeURIComponent(parsed.pathname).toLowerCase().endsWith('.txt');
  } catch {
    return false;
  }
}

export async function openTextEditor(api = chrome) {
  const editorUrl = api.runtime.getURL('editor/editor.html');
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (tab?.url === editorUrl || tab?.url?.startsWith(`${editorUrl}?`)) return tab;
  const file = isLocalTextFile(tab?.url) ? `?file=${encodeURIComponent(tab.url)}` : '';
  if (!file) {
    const candidates = await api.tabs.query({ url: `${editorUrl}*` });
    const existing = candidates.find(candidate => candidate.url === editorUrl || candidate.url?.startsWith(`${editorUrl}?`));
    if (existing) {
      await api.tabs.update(existing.id, { active: true });
      await api.windows.update(existing.windowId, { focused: true });
      return existing;
    }
  }
  return api.tabs.create({ url: editorUrl + file });
}
