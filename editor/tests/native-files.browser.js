// Run in an isolated ?workspaceTest tab opened with ?file=<temporary TXT URL>.
// Uses the real native host and writes only the supplied temporary fixture file.
(async () => {
  if (!new URLSearchParams(location.search).get("workspaceTest")) throw Error("Use isolated fixture tab");
  await localWorkspace.ready;
  const assert = (ok, message) => { if (!ok) throw Error(message + ": " + currentError); };
  assert(state.sourceUrl.includes("local-editor-save-ui-") && !state.handle, "use temporary file URL fixture without browser handle");
  const picker = window.showOpenFilePicker, autosave = elements.autosave.checked;
  let pickers = 0;
  window.showOpenFilePicker = async () => { pickers++; throw Error("Unexpected file picker"); };
  const waitSaved = async () => {
    const until = Date.now() + 6000;
    while (state.dirty || state.saving) { if (Date.now() > until) throw Error("Auto save timeout: " + currentError); await new Promise(r => setTimeout(r, 30)); }
  };
  const disk = async () => new Uint8Array(await (await fetch(state.sourceUrl, { cache: "no-store" })).arrayBuffer());
  try {
    assert(localFileAccess.canSave(state.sourceUrl), "file URL bound to native original");
    elements.autosave.checked = false;
    editor.setValue("Ctrl+S sửa trực tiếp\n"); await saveFile();
    assert(!state.dirty && !state.handle && pickers === 0, "first save needs no file picker");
    const bytes = await disk();
    assert(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf && new TextDecoder().decode(bytes) === "Ctrl+S sửa trực tiếp\r\n", "preserves BOM and CRLF on disk");
    editor.setValue("second direct save\n"); await saveFile();
    assert(new TextDecoder().decode(await disk()) === "second direct save\r\n" && pickers === 0, "repeated direct save");
    elements.autosave.checked = true; editor.setValue("Auto Save hoạt động\n"); scheduleAutoSave(); await waitSaved();
    assert(new TextDecoder().decode(await disk()) === "Auto Save hoạt động\r\n" && pickers === 0, "auto save works without browser write permission picker");
    await localWorkspace.saveNow();
    sessionStorage.setItem("native-save-regression", JSON.stringify({ url: state.sourceUrl, text: editor.getValue() }));
    return { passed: true, directSaves: 2, autoSave: true, pickerCalls: pickers };
  } finally { window.showOpenFilePicker = picker; elements.autosave.checked = autosave; }
})();
