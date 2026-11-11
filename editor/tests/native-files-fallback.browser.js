// Run in a fresh isolated workspaceTest tab. All file writes are in memory.
(async () => {
  if (!new URLSearchParams(location.search).get("workspaceTest")) throw Error("Use isolated fixture tab");
  await localWorkspace.ready; await localWorkspace.dispose();
  const nativeSave = localFileAccess.save, picker = window.showOpenFilePicker;
  const autosave = elements.autosave.checked;
  let calls = 0, disk = "original\n";
  const handle = { name: "fallback.txt", queryPermission: async () => "granted", isSameEntry: async other => other === handle,
    getFile: async () => ({ arrayBuffer: async () => new TextEncoder().encode(disk).buffer }),
    createWritable: async () => ({ write: async bytes => { disk = new TextDecoder().decode(bytes); }, close: async () => {}, abort: async () => {} }) };
  try {
    elements.autosave.checked = false;
    localFileAccess.save = async () => null;
    window.showOpenFilePicker = async () => { calls++; return [handle]; };
    await installContent(new TextEncoder().encode(disk), "fallback.txt", "file:///C:/fallback.txt", null);
    editor.setValue("changed\n");
    await saveFile(true);
    if (calls || !state.dirty || disk !== "original\n") throw Error("Automatic fallback must not show a picker or write");
    await saveFile();
    if (calls !== 1 || state.dirty || disk !== "changed\n" || state.handle !== handle) throw Error("Manual fallback did not obtain browser file access");
    editor.setValue("second\n"); await saveFile();
    if (calls !== 1 || disk !== "second\n" || state.dirty) throw Error("Browser handle was not reused");
    return { passed: true, automaticPickers: 0, manualPickers: calls, subsequentPicker: false };
  } finally { localFileAccess.save = nativeSave; window.showOpenFilePicker = picker; elements.autosave.checked = autosave; }
})();
