"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const text = (vi, en) => language === "en" ? en : vi;
  const issues = new Map();
  const dialog = $("file-conflict-dialog");
  let scanning = false, stopped = false, context = null, diff = null, models = [], actionBusy = false;
  const readable = tab => tab.kind !== "image" && (!!tab.handle || tab.sourceUrl?.startsWith("file:"));
  const alive = tab => tabs.includes(tab) && !tab.model.isDisposed();
  async function read(tab) {
    let bytes;
    if (tab.handle) bytes = new Uint8Array(await (await tab.handle.getFile()).arrayBuffer());
    else {
      const response = await fetch(tab.sourceUrl, { cache: "no-store" });
      if (!response.ok) throw Error("Could not read file (HTTP " + response.status + ")");
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    return { ...decodeBytes(bytes), hash: await hashBytes(bytes) };
  }
  function updateBanner() {
    for (const tab of issues.keys()) if (!alive(tab)) issues.delete(tab);
    if (context && !alive(context.tab) && dialog.open) dialog.close();
    const issue = issues.get(activeTab);
    $("file-change-notice").hidden = !issue;
    if (issue) {
      $("file-change-message").textContent = issue.disk
        ? text(`"${activeTab.name}" đã đổi ở ngoài. Bản nháp trong editor được giữ; chọn bản cần dùng.`, `"${activeTab.name}" changed outside. Your editor draft is kept; choose which version to use.`)
        : text(`Chưa đọc lại được "${activeTab.name}". Nội dung trong editor vẫn được giữ.`, `Could not reread "${activeTab.name}". Your editor content is kept.`);
      $("file-change-review").hidden = !issue.disk;
      $("file-change-retry").hidden = !!issue.disk;
    }
    $("file-change-review").textContent = text("So sánh và xử lý", "Compare and resolve");
    $("file-change-retry").textContent = text("Kiểm tra lại", "Retry");
  }
  function applyDisk(tab, disk, replace) {
    if (!alive(tab)) return;
    const views = editorGroups.filter(g => g.editor.getModel() === tab.model).map(g => [g.editor, g.editor.saveViewState()]);
    if (replace && tab.model.getValue() !== disk.text) {
      switchingModel = true;
      try {
        tab.model.pushStackElement();
        tab.model.pushEditOperations([], [{ range: tab.model.getFullModelRange(), text: disk.text }], () => []);
        tab.model.pushStackElement();
      } finally { switchingModel = false; }
      for (const [editor, view] of views) if (view) editor.restoreViewState(view);
    }
    Object.assign(tab, { baselineHash: disk.hash, cleanText: disk.text, eol: disk.eol, bom: disk.bom, dirty: tab.model.getValue() !== disk.text });
    if (tab === activeTab) {
      Object.assign(state, { baselineHash: tab.baselineHash, cleanText: tab.cleanText, eol: tab.eol, bom: tab.bom, dirty: tab.dirty });
      clearError();
    }
    issues.delete(tab); refresh(); updateBanner();
    window.localWorkspace?.scheduleSave();
  }
  async function bind(tab, disk) {
    if (!tab.handle && tab.sourceUrl && window.localFileAccess) {
      try { await localFileAccess.bind(tab.sourceUrl, disk.hash); } catch { /* A subsequent scan/save checks a concurrent change. */ }
    }
  }
  async function inspect(tab, saving = false) {
    if (!alive(tab) || !readable(tab)) return "skip";
    const baseline = tab.baselineHash, version = tab.model.getVersionId();
    try {
      const disk = await read(tab);
      if (!alive(tab) || baseline !== tab.baselineHash || (!saving && (state.saving || window.localWorkspace?.restoring))) return "skip";
      // Never replace text that was typed while the disk read was in flight.
      if (tab.model.getVersionId() !== version) return "skip";
      const value = tab.model.getValue();
      if (disk.hash === tab.baselineHash) {
        const resumed = issues.delete(tab); updateBanner();
        if (resumed) await bind(tab, disk);
        if (resumed && tab === activeTab && tab.model.getValue() !== tab.cleanText) scheduleAutoSave();
        return "unchanged";
      }
      if (value === tab.cleanText || value === disk.text || disk.text === tab.cleanText) {
        const replace = value === tab.cleanText;
        applyDisk(tab, disk, replace); await bind(tab, disk);
        if (tab === activeTab) {
          if (tab.dirty) scheduleAutoSave(); else showStatus(text("Đã cập nhật từ ổ đĩa", "Updated from disk"), "ok");
        }
        return tab.dirty ? "retry" : "clean";
      }
      const previous = issues.get(tab);
      issues.set(tab, { disk });
      if (tab === activeTab) { clearTimeout(autoSaveTimer); clearError(); }
      updateBanner();
      if (context?.tab === tab && dialog.open && previous?.disk?.hash !== disk.hash) renderDialog(tab, disk);
      return "conflict";
    } catch (error) {
      if (alive(tab) && baseline === tab.baselineHash && (!state.saving || saving)) {
        issues.set(tab, { error: error.message });
        if (tab === activeTab) clearTimeout(autoSaveTimer);
        updateBanner();
      }
      return "unavailable";
    }
  }
  async function scan(force = false) {
    if (stopped || scanning || state.saving || window.localWorkspace?.restoring || (!force && document.visibilityState === "hidden")) return;
    scanning = true;
    try {
      snapshotTab();
      for (const tab of [...tabs]) {
        if (stopped || state.saving || window.localWorkspace?.restoring) break;
        await inspect(tab);
      }
      updateBanner();
    } finally { scanning = false; }
  }
  // Keep one comparison view: destroying it while Monaco computes a diff can
  // leave asynchronous editor contributions using disposed services/models.
  function disposeDiff() { models.forEach(model => model.setValue("")); }
  function renderDialog(tab, disk) {
    disposeDiff(); context = { tab, disk };
    $("file-conflict-title").textContent = text("File thay đổi: ", "File changed: ") + tab.name;
    $("file-conflict-description").textContent = text("Hai bên đều có thay đổi. Dùng bản ổ đĩa sẽ bỏ bản nháp; lưu bản editor sẽ thay thế bản ổ đĩa đang hiển thị.", "Both versions have changes. Using the disk version discards your draft; saving the editor version replaces the disk version shown here.");
    $("file-conflict-labels").replaceChildren();
    for (const label of [text("Bản trên ổ đĩa", "On disk"), text("Bản trong editor", "Your editor draft")]) { const span = document.createElement("span"); span.textContent = label; $("file-conflict-labels").append(span); }
    $("file-conflict-cancel").textContent = text("Tiếp tục sửa", "Keep editing");
    $("file-conflict-disk").textContent = text("Dùng bản trên ổ đĩa", "Use disk version");
    $("file-conflict-local").textContent = text("Lưu bản trong editor", "Save editor version");
    const syntax = languageForFile(tab.name);
    if (!diff) {
      models = [monaco.editor.createModel(disk.text, syntax), monaco.editor.createModel(tab.model.getValue(), syntax)];
      diff = monaco.editor.createDiffEditor($("file-conflict-editor"), { automaticLayout: true, readOnly: true, originalEditable: false, renderSideBySide: true, minimap: { enabled: false } });
      diff.setModel({ original: models[0], modified: models[1] });
    } else {
      models[0].setValue(disk.text); models[1].setValue(tab.model.getValue());
      models.forEach(model => monaco.editor.setModelLanguage(model, syntax));
      diff.layout();
    }
  }
  function open(tab = activeTab) {
    const disk = issues.get(tab)?.disk;
    if (!disk || !alive(tab)) return;
    if (!dialog.open) dialog.showModal();
    renderDialog(tab, disk); $("file-conflict-cancel").focus();
  }
  async function choose(useDisk) {
    if (actionBusy || !context || state.saving) return;
    const reviewed = context, tab = reviewed.tab;
    if (!alive(tab) || tab !== activeTab) { dialog.close(); return; }
    actionBusy = true; for (const button of dialog.querySelectorAll("button")) button.disabled = true;
    try {
      const latest = await read(tab);
      if (!dialog.open || !context || context.tab !== tab) return;
      if (context !== reviewed || latest.hash !== reviewed.disk.hash) {
        issues.set(tab, { disk: latest }); renderDialog(tab, latest); updateBanner(); return;
      }
      // The user has reviewed this exact disk version. The save path still checks its hash.
      applyDisk(tab, latest, useDisk);
      await bind(tab, latest);
      dialog.close();
      if (useDisk) showStatus(text("Đã dùng bản trên ổ đĩa", "Loaded disk version"), "ok");
      else await saveFile();
    } catch (error) { showError(error.message); }
    finally { actionBusy = false; for (const button of dialog.querySelectorAll("button")) button.disabled = false; }
  }
  $("file-change-review").addEventListener("click", () => open());
  $("file-change-retry").addEventListener("click", () => scan(true));
  $("file-conflict-cancel").addEventListener("click", () => dialog.close());
  $("file-conflict-disk").addEventListener("click", () => choose(true));
  $("file-conflict-local").addEventListener("click", () => choose(false));
  dialog.addEventListener("close", () => { if (!dialog.open) { context = null; disposeDiff(); } });
  const focus = () => { scan().catch(console.error); };
  window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
  const languageObserver = new MutationObserver(() => { updateBanner(); if (context && dialog.open) renderDialog(context.tab, context.disk); });
  languageObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  const timer = setInterval(focus, 1500);
  window.localFileSync = {
    scan: () => scan(true), open, updateBanner,
    isBlocked: tab => issues.has(tab),
    async beforeSave(tab) { if (stopped) return "skip"; return inspect(tab, true); },
    onSaveConflict: tab => inspect(tab, true),
    stop() { stopped = true; clearInterval(timer); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); languageObserver.disconnect(); if (dialog.open) dialog.close(); }
  };
  window.localWorkspace?.ready.then(focus).catch(() => {});
})();
