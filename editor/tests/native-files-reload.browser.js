// Run after reloading the same temporary file-URL test tab.
(async () => {
  if (!new URLSearchParams(location.search).get("workspaceTest")) throw Error("Use isolated fixture tab");
  await localWorkspace.ready;
  const expected = JSON.parse(sessionStorage.getItem("native-save-regression"));
  if (state.sourceUrl !== expected.url || editor.getValue() !== expected.text || !localFileAccess.canSave(state.sourceUrl)) throw Error("Native original-file access was not restored");
  const picker = window.showOpenFilePicker;
  let pickers = 0;
  window.showOpenFilePicker = async () => { pickers++; throw Error("Unexpected picker after reload"); };
  try {
    elements.autosave.checked = false;
    editor.setValue("saved after reload\n"); await saveFile();
    if (state.dirty || pickers || await (await fetch(state.sourceUrl, { cache: "no-store" })).text() !== "saved after reload\r\n") throw Error("Direct save after reload failed");
    return { passed: true, reloaded: true, pickerCalls: pickers };
  } finally { window.showOpenFilePicker = picker; }
})();
