// Run with awaitPromise in a fresh editor.html?workspaceTest=<unique-id> tab.
// All handles, picker results and writes are in memory; no user files are changed.
(async () => {
  if (!new URLSearchParams(location.search).get("workspaceTest")) throw Error("Use an isolated workspaceTest tab");
  await localWorkspace.ready;
  if (tabs.length || explorerFolders.length) throw Error("Use a fresh workspace");
  await localWorkspace.dispose();
  const assert = (value, message) => { if (!value) throw Error(message); };
  const until = async predicate => {
    for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
    throw Error("Timed out waiting for menu action");
  };
  const original = { picker: window.showDirectoryPicker, savedFolder, write: navigator.clipboard.writeText, language, autosave: elements.autosave.checked };
  const directory = name => ({ name, kind: "directory", queryPermission: async () => "granted",
    isSameEntry: async other => other === roots[name], values: async function* () {} });
  const roots = { frontend: directory("frontend"), backend: directory("backend") };
  let picked = roots.frontend, clipboardWrites = 0, legacyWrites = 0;
  const click = id => document.getElementById(id).click();
  const menuItems = () => [...treeMenu.querySelectorAll('button:not([hidden])')].map(button => button.id);
  const context = target => target.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 40, clientY: 130 }));
  const rootButton = index => explorerContent.querySelectorAll(".workspace-root")[index].querySelector(".tree-item");
  try {
    window.showDirectoryPicker = async () => picked;
    savedFolder = async () => { legacyWrites++; };
    navigator.clipboard.writeText = async () => { clipboardWrites++; };
    elements.autosave.checked = false;
    applyLanguage("en");
    context(explorerContent);
    assert(menuItems().join() === "tree-add-folder", "empty Explorer offers Add Folder only");
    click("tree-add-folder");
    await until(() => explorerFolders.length === 1 && !!rootButton(0));
    context(explorerContent);
    assert(menuItems().join() === "tree-add-folder,tree-folder-settings,tree-remove-root", "single-root background has three workspace actions");
    picked = roots.backend;
    click("tree-add-folder");
    await until(() => explorerFolders.length === 2 && !!rootButton(1));
    assert(explorerFolders[0].handle === roots.frontend, "adding preserves the existing root");
    context(explorerContent);
    assert(menuItems().join() === "tree-add-folder", "multi-root background does not guess which root to remove");
    click("tree-add-folder");
    await new Promise(resolve => setTimeout(resolve, 80));
    assert(explorerFolders.length === 2, "adding the same folder does not duplicate it");
    context(rootButton(1));
    assert(treeContext.rootDescriptor.handle === roots.backend && menuItems().includes("tree-folder-settings"), "root-row context targets the second root");
    click("tree-folder-settings");
    const dialog = document.getElementById("root-path-dialog");
    const input = document.getElementById("root-path-input");
    assert(dialog.open && document.getElementById("root-path-title").textContent.includes("backend"), "settings identifies its folder");
    input.value = "D:\\projects\\backend";
    document.getElementById("root-path-form").dispatchEvent(new Event("submit", { cancelable: true }));
    await until(() => !dialog.open);
    assert(explorerFolders[1].absolutePath === input.value && !explorerFolders[0].absolutePath && clipboardWrites === 0, "settings saves only that root without copying to clipboard");
    assert(localWorkspace.capture().folders[1].absolutePath === input.value, "workspace capture includes folder settings");
    context(rootButton(1)); click("tree-folder-settings");
    assert(input.value === "D:\\projects\\backend", "reopening settings keeps the saved path");
    dialog.close();
    const handle = { name: "draft.txt", kind: "file", isSameEntry: async other => other === handle,
      getFile: async () => new File(["disk text"], "draft.txt"), createWritable: async () => { throw Error("Unexpected disk write"); } };
    await installContent(new TextEncoder().encode("disk text"), "draft.txt", "", handle);
    editor.executeEdits("test", [{ range: new monaco.Range(1, 1, 1, 1), text: "unsaved " }]);
    const model = editor.getModel();
    context(rootButton(1)); click("tree-remove-root");
    await until(() => explorerFolders.length === 1);
    assert(explorerFolders[0].handle === roots.frontend && editor.getModel() === model && activeTab.dirty && model.getValue() === "unsaved disk text", "removing the second root preserves the other root and dirty draft");
    context(rootButton(0));
    assert(menuItems().includes("tree-new-file") && menuItems().includes("tree-add-folder"), "root menu keeps file operations alongside workspace actions");
    click("tree-remove-root");
    await until(() => !explorerFolders.length);
    context(explorerContent);
    assert(menuItems().join() === "tree-add-folder" && tabs.includes(activeTab) && activeTab.dirty, "removing the last root leaves Explorer usable and the draft intact");
    applyLanguage("vi");
    assert(document.getElementById("tree-add-folder").textContent === "Thêm thư mục vào workspace…", "menu is translated");
    return { passed: true, checks: 14, clipboardWrites, legacyWrites };
  } finally {
    hideTreeMenu(); document.getElementById("root-path-dialog").close();
    window.showDirectoryPicker = original.picker; savedFolder = original.savedFolder;
    navigator.clipboard.writeText = original.write; elements.autosave.checked = original.autosave;
    applyLanguage(original.language);
  }
})();
