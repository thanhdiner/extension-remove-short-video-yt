chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (message?.type !== 'DINKIT_JSON_VIEWER' || sender.id !== chrome.runtime.id ||
      sender.frameId !== 0 || !Number.isInteger(sender.tab?.id) || !/^(?:https?:\/\/|file:\/\/\/)/.test(sender.url || '')) return;
  (async () => {
    const { hys_settings = {} } = await chrome.storage.sync.get('hys_settings');
    if (hys_settings.jsonFormatterEnabled === false) return;
    const target = { tabId: sender.tab.id };
    // Never inject into a different document if a navigation finishes mid-request.
    if (sender.documentId) target.documentIds = [sender.documentId];
    else target.frameIds = [0];
    await chrome.scripting.executeScript({ target, files: ['dist/json-viewer.js'] });
  })().then(() => reply({ ok: true }), () => reply({ ok: false }));
  return true;
});
