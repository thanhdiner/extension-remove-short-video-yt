// Run in a fresh editor.html?workspaceTest=<unique-id> tab with awaitPromise.
(async () => {
  if (!new URLSearchParams(location.search).get("workspaceTest")) throw Error("Use an isolated workspaceTest tab");
  await localWorkspace.ready;
  const assert = (ok, label) => { if (!ok) throw Error(label); };
  const globalBefore = await chrome.storage.local.get(CURSOR_BLINKING_KEY);
  const select = mode => {
    cursorBlinkingDropdown.open();
    document.querySelector(`#cursor-blinking-options [data-value="${mode}"]`).click();
  };
  const check = mode => {
    assert(cursorBlinking === mode, "selected mode " + mode);
    assert(editorGroups.every(group => group.editor.getRawOptions().cursorBlinking === mode), "all editors use " + mode);
    assert(document.querySelector(`#cursor-blinking-options [data-value="${mode}"]`).getAttribute("aria-selected") === "true", "dropdown follows " + mode);
  };
  await installContent(new TextEncoder().encode("const cursor = 'preview';\n"), "cursor-test.js", "", null);
  document.getElementById("settings-btn").click();
  for (const mode of ["blink", "smooth", "phase", "expand", "solid"]) { select(mode); check(mode); }
  document.getElementById("settings-close").click();
  splitEditorGroup(); check("solid");
  document.getElementById("settings-btn").click(); select("smooth"); check("smooth");
  // Closing Settings must not leave its dropdown open on the next visit.
  cursorBlinkingDropdown.open(); document.getElementById("settings-close").click();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert(document.getElementById("cursor-blinking-options").hidden, "dropdown closes with dialog");
  await localWorkspace.rename("Cursor modes A"); const idA = localWorkspace.current.id;
  await localWorkspace.saveNow();
  const stored = await localWorkspace.store.get(idA);
  assert(stored.settings.cursorBlinking === "smooth", "workspace stores mode");
  // Existing workspaces without this field inherit the default.
  const legacy = { ...stored, settings: { ...stored.settings } }; delete legacy.settings.cursorBlinking;
  await localWorkspace.apply(legacy); check(localWorkspace.defaultSettings.cursorBlinking);
  applyCursorBlinking("invalid-mode"); check("blink");
  document.getElementById("settings-btn").click(); select("phase"); document.getElementById("settings-close").click();
  await localWorkspace.saveNow();
  const idB = await localWorkspace.create("Cursor modes B");
  document.getElementById("settings-btn").click(); select("expand"); document.getElementById("settings-close").click();
  await localWorkspace.saveNow();
  await localWorkspace.open(idA); check("phase");
  assert(editorGroups.length === 2, "restored split editors");
  await localWorkspace.open(idB); check("expand");
  await localWorkspace.open(idA); check("phase");
  assert(JSON.stringify(await chrome.storage.local.get(CURSOR_BLINKING_KEY)) === JSON.stringify(globalBefore), "workspace choices do not change global preferences");
  await localWorkspace.saveNow();
  sessionStorage.setItem("cursor-blinking-regression", JSON.stringify({ idA, idB }));
  return { passed: true, modes: 5, groups: editorGroups.length, reloadNext: true };
})();
