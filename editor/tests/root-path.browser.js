// Run in a fresh editor.html?workspaceTest=<unique-id> tab with awaitPromise.
// Native picker, clipboard, and folder storage are replaced only in this tab.
(async () => {
  if (!new URLSearchParams(location.search).get("workspaceTest")) throw Error("Use an isolated workspaceTest tab");
  await localWorkspace.ready;
  const assert = (value, message) => { if (!value) throw Error(message); };
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));
  const original = { connect: chrome.runtime.connectNative, write: navigator.clipboard.writeText, savedFolder, schedule: localWorkspace.scheduleSave, language, root: explorerRoot, descriptor: explorerRootDescriptor, path: explorerRootPath, folders: explorerFolders };
  const dialog = document.getElementById("root-path-dialog");
  const input = document.getElementById("root-path-input");
  const browse = document.getElementById("root-path-browse");
  const submit = document.getElementById("root-path-submit");
  const error = document.getElementById("root-path-error");
  let port, writes = [], stores = [], scheduled = 0, failCopy = false;
  const root = { handle: { name: "frontend" }, absolutePath: "" };
  const other = { handle: { name: "backend" }, absolutePath: "" };
  const open = (descriptor = root) => {
    activateExplorerRoot(descriptor);
    treeContext = { handle: { name: "file.js", kind: "file" }, relativePath: "src/file.js", rootDescriptor: descriptor };
    document.getElementById("tree-copy-absolute").click();
  };
  const close = async () => {
    if (!dialog.open) return;
    const closed = new Promise(resolve => dialog.addEventListener('close', resolve, { once: true }));
    dialog.close(); await closed;
  };
  try {
    chrome.runtime.connectNative = name => {
      assert(name === "dinkit.editor", "uses installed terminal host");
      let message, disconnect;
      port = { onMessage: { addListener: fn => message = fn }, onDisconnect: { addListener: fn => disconnect = fn }, postMessage: request => { port.request = request; }, disconnect: () => { port.disconnected = true; disconnect?.(); }, emit: value => message(value), drop: () => disconnect() };
      return port;
    };
    navigator.clipboard.writeText = async value => { if (failCopy) throw Error("Clipboard denied"); writes.push(value); };
    savedFolder = async (operation, value) => stores.push({ operation, value });
    localWorkspace.scheduleSave = () => scheduled++;
    explorerFolders = [root, other];
    language = "en";
    open();
    assert(dialog.open && document.activeElement === browse, "picker button focused on opening");
    browse.click(); const cancelled = port;
    assert(port.request.type === "chooseDirectory" && browse.disabled && submit.disabled, "requests picker and blocks duplicate submission");
    port.emit({ type: "directoryChosen", cwd: "" });
    assert(input.value === "" && !browse.disabled && !submit.disabled && cancelled.disconnected, "cancel leaves field and storage unchanged");
    browse.click(); port.emit({ type: "directoryChosen", cwd: "C:\\projects\\wrong" });
    assert(!error.hidden && input.value === "" && !stores.length, "rejects a different folder name");
    browse.click(); port.emit({ type: "directoryChosen", cwd: "C:\\projects\\frontend\\" });
    assert(input.value === "C:\\projects\\frontend" && document.activeElement === submit, "fills chosen path and focuses save");
    failCopy = true;
    document.getElementById("root-path-form").dispatchEvent(new Event("submit", { cancelable: true })); await tick();
    assert(dialog.open && !error.hidden && !root.absolutePath, "clipboard failure keeps dialog and does not remember path");
    failCopy = false;
    document.getElementById("root-path-form").dispatchEvent(new Event("submit", { cancelable: true })); await tick();
    assert(writes[0] === "C:\\projects\\frontend\\src\\file.js" && root.absolutePath === "C:\\projects\\frontend" && stores.length === 1 && scheduled === 1 && !dialog.open, "copies full path and remembers root after successful save");
    open(); await tick();
    assert(!dialog.open && writes.length === 2, "remembered root copies directly next time");
    open(other); browse.click(); port.emit({ type: "directoryChosen", cwd: "D:\\work\\backend" });
    document.getElementById("root-path-form").dispatchEvent(new Event("submit", { cancelable: true })); await tick();
    assert(writes.at(-1) === "D:\\work\\backend\\src\\file.js" && root.absolutePath === "C:\\projects\\frontend" && other.absolutePath === "D:\\work\\backend", "keeps multiple roots separate");
    root.absolutePath = "";
    open(); browse.click(); const pending = port; await close();
    assert(pending.disconnected && !browse.disabled, "closing dialog disconnects pending picker");
    pending.emit({ type: "directoryChosen", cwd: "C:\\stale\\frontend" });
    assert(!root.absolutePath, "late result cannot save after close");
    open(); browse.click(); const oldPicker = port; dialog.close();
    open(); browse.click(); const freshPicker = port;
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    assert(oldPicker.disconnected && !freshPicker.disconnected && browse.disabled, "rapid reopen disconnects old picker and keeps new picker active");
    oldPicker.emit({ type: "directoryChosen", cwd: "C:\\stale\\frontend" });
    assert(input.value === "" && !root.absolutePath, "old picker cannot fill a newly opened dialog");
    await close();
    language = "vi";
    open(); assert(browse.textContent === "Chọn thư mục…", "Vietnamese picker label");
    browse.click(); port.drop();
    assert(!error.hidden && !input.disabled && !submit.disabled, "missing host leaves manual entry usable");
    await close();
    open(); browse.click(); activateExplorerRoot(other); port.emit({ type: "directoryChosen", cwd: "C:\\projects\\frontend" }); await tick();
    assert(!dialog.open && !root.absolutePath, "root change cancels stale selection");
    return { passed: true, checks: 14 };
  } finally {
    await close();
    chrome.runtime.connectNative = original.connect;
    navigator.clipboard.writeText = original.write;
    savedFolder = original.savedFolder;
    localWorkspace.scheduleSave = original.schedule;
    language = original.language;
    explorerFolders = original.folders; explorerRoot = original.root; explorerRootDescriptor = original.descriptor; explorerRootPath = original.path;
  }
})();
