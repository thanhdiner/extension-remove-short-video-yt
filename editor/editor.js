"use strict";

// Lưu file gốc bằng File System Access API. Trình duyệt yêu cầu người dùng
// chọn file để cấp quyền ghi; URL file:// chỉ cấp quyền đọc.
const elements = {
  filePath: document.getElementById("file-path"),
  open: document.getElementById("open-btn"),
  save: document.getElementById("save-btn"),
  status: document.getElementById("status"),
  stats: document.getElementById("stats"),
  notice: document.getElementById("notice"),
  wrap: document.getElementById("wrap-toggle"),
  autosave: document.getElementById("autosave-toggle"),
  theme: document.getElementById("theme-select"),
  themeValue: document.getElementById("theme-value"),
  themeOptions: document.getElementById("theme-options")
};

const THEME_KEY = "localTextEditorTheme";
const AUTOSAVE_KEY = "localTextEditorAutoSave";
const WRAP_KEY = "localTextEditorWrap";
const LANGUAGE_KEY = "dinkit_language";
const MULTI_TAB_KEY = "localTextEditorMultiTab";
const PREVIEW_KEY = "localTextEditorPreview";
let previewEnabled = false;
let previewChanged = false;
const INDENT_KEY = "localTextEditorIndent";
const CURSOR_BLINKING_KEY = "localTextEditorCursorBlinking";
const CURSOR_BLINKING_MODES = ["blink", "smooth", "phase", "expand", "solid"];
let cursorBlinking = "blink";
let cursorBlinkingChanged = false;
let indentSettings = { insertSpaces: false, tabSize: 4 };
let indentChanged = false;
let multiTabEnabled = true;
let multiTabChanged = false;
let language = "vi";
let languageChanged = false;
let currentStatus = "";
let currentError = "";
const english = {
  "Sẵn sàng": "Ready", "Lỗi": "Error", "Chưa lưu": "Unsaved", "Đã mở": "Opened", "Đã lưu": "Saved", "Đã tự động lưu": "Auto saved",
  "Chọn file gốc khi lưu lần đầu": "Select the original file when saving for the first time",
  "Nhấn Lưu để cấp quyền tự động lưu": "Click Save to allow auto save",
  "Chrome không hỗ trợ mở thư mục trong trang này.": "Chrome does not support opening folders on this page.",
  "Chrome không hỗ trợ File System Access API trong trang này.": "Chrome does not support the File System Access API on this page.",
  "Không thể mở thư mục: ": "Could not open folder: ", "Không thể đọc thư mục: ": "Could not read folder: ",
  "Không thể mở file: ": "Could not open file: ", "Không thể lưu: ": "Could not save: ",
  "Chỉ hỗ trợ đường dẫn file .txt.": "Only .txt file paths are supported.",
  "Không đọc được file (HTTP ": "Could not read file (HTTP ",
  "Không đọc được file từ đường dẫn Chrome. Bật 'Allow access to file URLs' trong chrome://extensions, hoặc nhấn 'Mở file'. Chi tiết: ": "Could not read the file. Enable 'Allow access to file URLs' in chrome://extensions, or click Open file. Details: ",
  "Nội dung file trên ổ đĩa đã thay đổi. Không ghi đè. Hãy dùng 'Mở file' để tải bản mới nhất.": "The file on disk has changed. It was not overwritten. Use Open file to load the latest version.",
  "File đang có thay đổi chưa lưu. Bỏ thay đổi và mở file khác?": "This file has unsaved changes. Discard them and open another file?"
};
english["Tab có thay đổi chưa lưu. Đóng và bỏ các thay đổi?"] = "This tab has unsaved changes. Close it and discard them?";
english["Có tab chưa lưu. Đóng tất cả tab và bỏ các thay đổi?"] = "Some tabs have unsaved changes. Close all tabs and discard them?";
function tr(message) {
  if (language !== "en") return message;
  const key = Object.keys(english).sort((a, b) => b.length - a.length).find(item => message.startsWith(item));
  if (key) return english[key] + message.slice(key.length);
  const wrongFile = message.match(/^Hãy chọn đúng file gốc '(.+)' để tránh ghi nhầm\.$/);
  return wrongFile ? `Choose the original file '${wrongFile[1]}' to avoid overwriting the wrong file.` : message;
}
function setText(selector, vi, en) {
  const node = document.querySelector(selector);
  if (node) node.textContent = language === "en" ? en : vi;
}
function applyLanguage(value) {
  language = value === "en" ? "en" : "vi";
  document.documentElement.lang = language;
  languageDropdown.setValue(language);
  setText("#open-btn", "Mở file", "Open file");
  const openShortcut = document.createElement("span"); openShortcut.textContent = "Ctrl+O"; elements.open.appendChild(openShortcut);
  setText("#theme-label", "Giao diện", "Theme");
  setText("#language-label", "Ngôn ngữ", "Language");
  setText('#theme-options [data-value="auto"]', "Tự động", "Auto");
  setText('#theme-options [data-value="light"]', "Sáng", "Light");
  setText('#theme-options [data-value="dark"]', "Tối", "Dark");
  elements.themeValue.textContent = themeOptions.find(option => option.getAttribute("aria-selected") === "true").textContent;
  setText("#explorer-empty", "Chưa mở thư mục", "No folder open");
  setText("#explorer-open-folder", "Mở thư mục", "Open folder");
  setText("#explorer-reconnect", "Cấp quyền mở lại thư mục", "Restore folder access");
  const folderButton = document.getElementById("open-folder");
  folderButton.title = language === "en" ? "Open folder" : "Mở thư mục";
  folderButton.setAttribute("aria-label", folderButton.title);

  editor.updateOptions({ ariaLabel: language === "en" ? "File contents" : "Nội dung file" });
  document.querySelector('label:has(#autosave-toggle)').lastChild.textContent = language === "en" ? " Auto save" : " Tự động lưu";
  document.querySelector('label:has(#wrap-toggle)').lastChild.textContent = language === "en" ? " Word wrap" : " Xuống dòng tự động";
  setText("#shortcuts-btn", "Phím tắt", "Keyboard shortcuts");
  setText("#shortcuts-title", "Phím tắt", "Keyboard shortcuts");
  setText(".shortcuts-description", "Các thao tác nhanh trong trình soạn thảo", "Quick actions in the editor");
  const descriptions = [["Cắt / sao chép dòng khi không chọn chữ", "Cut / copy the line with no selection"], ["Di chuyển dòng hoặc các dòng đã chọn", "Move the current or selected lines"], ["Nhân bản dòng hoặc các dòng đã chọn", "Duplicate the current or selected lines"], ["Xóa dòng", "Delete line"], ["Chèn dòng bên dưới", "Insert line below"], ["Chèn dòng bên trên", "Insert line above"], ["Thụt lề / giảm thụt lề", "Indent / outdent"], ["Thụt lề / giảm thụt lề dòng", "Indent / outdent lines"], ["Bật / tắt comment dòng", "Toggle line comment"], ["Bật hoặc tắt tự động xuống dòng", "Toggle word wrap"], ["Mở / lưu file", "Open / save file"]];
  document.querySelectorAll("#shortcuts-dialog dd").forEach((node, index) => { node.textContent = descriptions[index][language === "en" ? 1 : 0]; });
  setText("#shortcuts-close", "Đóng", "Close");
  setText("#settings-title", "Cài đặt", "Settings");
  setText("#cursor-blinking-label", "Nhấp nháy con trỏ", "Cursor blinking");
  setText("#cursor-blinking-description", "Kiểu chuyển động của con trỏ khi soạn thảo.", "Control the cursor animation style.");
  setText('#cursor-blinking-options [data-value="blink"]', "blink (mặc định)", "blink (default)");
  cursorBlinkingDropdown.setValue(cursorBlinking);
  setText("#settings-autosave-label", "Tự động lưu", "Auto save");
  setText("#settings-wrap-label", "Xuống dòng tự động", "Word wrap");
  setText("#settings-tabs-label", "Mở nhiều tab", "Open multiple tabs");
  setText("#settings-shortcuts", "Phím tắt", "Keyboard shortcuts");
  setText("#settings-close", "Đóng", "Close");
  setText("#terminal-top-open", "Mở terminal", "Open terminal");
  setText("#terminal-top-new", "Terminal mới", "New terminal");
  setText("#terminal-top-split", "Chia terminal", "Split terminal");
  const editTranslations = { undo: ["Hoàn tác", "Undo"], redo: ["Làm lại", "Redo"], cut: ["Cắt", "Cut"], copy: ["Sao chép", "Copy"], paste: ["Dán", "Paste"], find: ["Tìm", "Find"], replace: ["Thay thế", "Replace"], comment: ["Comment dòng", "Toggle line comment"], blockComment: ["Comment khối", "Toggle block comment"] };
  document.querySelectorAll("[data-edit-action]").forEach(button => { button.querySelector(".edit-label").textContent = editTranslations[button.dataset.editAction][language === "en" ? 1 : 0]; });
  setText("#editor-list", "File đang mở", "Show opened editors");
  setText("#editor-close-all", "Đóng tất cả", "Close all");
  setText("#editor-close-saved", "Đóng file đã lưu", "Close saved");
  setText("#editor-preview-label", "Bật tab xem trước", "Enable preview editors");
  setText("#editor-configure", "Cài đặt trình soạn thảo", "Configure editors");

  setText("#tab-context-close", "Đóng", "Close");
  setText("#tab-context-close-all", "Đóng tất cả", "Close all");
  setText("#tree-add-folder", "Thêm thư mục vào workspace…", "Add Folder to Workspace…");
  setText("#tree-folder-settings", "Mở cài đặt thư mục", "Open Folder Settings");
  setText("#tree-remove-root", "Gỡ thư mục khỏi workspace", "Remove Folder from Workspace");
  setText("#tree-new-file", "Tạo file", "New file");
  setText("#tree-new-folder", "Tạo thư mục", "New folder");
  setText("#tree-copy-path", "Sao chép đường dẫn tương đối", "Copy relative path");
  setText("#tree-copy-absolute", "Sao chép đường dẫn tuyệt đối", "Copy absolute path");
  setText("#tree-rename .tree-menu-label", "Đổi tên", "Rename");
  setText("#tree-cut .tree-menu-label", "Cắt", "Cut");
  setText("#tree-paste .tree-menu-label", "Dán", "Paste");
  setText("#tree-delete .tree-menu-label", "Xóa", "Delete");
  const settingsButton = document.getElementById("settings-btn");
  settingsButton.title = language === "en" ? "Settings" : "Cài đặt";
  settingsButton.setAttribute("aria-label", settingsButton.title);
  if (!state.name) { elements.filePath.textContent = language === "en" ? "No file open" : "Chưa mở file"; elements.filePath.title = elements.filePath.textContent; }
  refresh();
  elements.status.textContent = tr(currentStatus);
  if (currentError) elements.notice.textContent = tr(currentError);
}
let autoSaveTimer;
let autoSaveChanged = false;
let themeChanged = false;
let wrapChanged = false;
const themeOptions = Array.from(elements.themeOptions.querySelectorAll('[role="option"]'));
function applyTheme(value) {
  const theme = ["auto", "light", "dark"].includes(value) ? value : "auto";
  document.documentElement.dataset.theme = theme;
  updateEditorTheme();
  themeDropdown.setValue(theme);
}
const themeDropdown = new Dropdown(elements.theme, elements.themeOptions, elements.themeValue, value => {
  themeChanged = true;
  applyTheme(value);
  chrome.storage.local.set({ [THEME_KEY]: value }).catch(console.error);
});
const languageDropdown = new Dropdown(document.getElementById("language-select"), document.getElementById("language-options"), document.getElementById("language-value"), value => {
  languageChanged = true;
  applyLanguage(value);
  chrome.storage.sync.set({ [LANGUAGE_KEY]: language }).catch(console.error);
});
const cursorBlinkingDropdown = new Dropdown(document.getElementById("cursor-blinking-select"), document.getElementById("cursor-blinking-options"), document.getElementById("cursor-blinking-value"), value => {
  cursorBlinkingChanged = true;
  applyCursorBlinking(value);
  persistEditorSetting(CURSOR_BLINKING_KEY, cursorBlinking).catch(console.error);
});
const editorPreferenceLoads = [];
editorPreferenceLoads.push(chrome.storage.local.get(THEME_KEY).then(saved => {
  if (!themeChanged) applyTheme(saved[THEME_KEY]);
}).catch(console.error));
editorPreferenceLoads.push(chrome.storage.local.get(WRAP_KEY).then(saved => {
  if (!wrapChanged) applyWrap(saved[WRAP_KEY] === true);
}).catch(console.error));
editorPreferenceLoads.push(chrome.storage.local.get(AUTOSAVE_KEY).then(saved => {
  if (!autoSaveChanged && typeof saved[AUTOSAVE_KEY] === "boolean") {
    elements.autosave.checked = saved[AUTOSAVE_KEY];
    scheduleAutoSave();
  }
}).catch(console.error));
editorPreferenceLoads.push(chrome.storage.sync.get(LANGUAGE_KEY).then(saved => {
  if (!languageChanged) applyLanguage(saved[LANGUAGE_KEY]);
}).catch(console.error));
editorPreferenceLoads.push(chrome.storage.local.get(MULTI_TAB_KEY).then(saved => {
  if (!multiTabChanged) applyMultiTab(saved[MULTI_TAB_KEY] !== false);
}).catch(console.error));
editorPreferenceLoads.push(chrome.storage.local.get(PREVIEW_KEY).then(saved => {
  if (!previewChanged) setPreviewEnabled(saved[PREVIEW_KEY] === true);
}).catch(console.error));
editorPreferenceLoads.push(chrome.storage.local.get(INDENT_KEY).then(saved => {
  if (!indentChanged) applyIndentSettings(saved[INDENT_KEY]);
}).catch(console.error));
editorPreferenceLoads.push(chrome.storage.local.get(CURSOR_BLINKING_KEY).then(saved => {
  if (!cursorBlinkingChanged) applyCursorBlinking(saved[CURSOR_BLINKING_KEY]);
}).catch(console.error));
const editorPreferencesReady = Promise.all(editorPreferenceLoads);
function persistEditorSetting(key, value) {
  if (window.localWorkspace?.handlesSetting(key)) { window.localWorkspace.scheduleSave(); return Promise.resolve(); }
  return chrome.storage.local.set({ [key]: value });
}
chrome.storage.onChanged.addListener((changes, area) => {
  if (window.localWorkspace?.isActive()) {
    changes = Object.fromEntries(Object.entries(changes).filter(([key]) => !window.localWorkspace.handlesSetting(key)));
  }
  if (area === "local" && changes[CURSOR_BLINKING_KEY]) {
    cursorBlinkingChanged = true;
    applyCursorBlinking(changes[CURSOR_BLINKING_KEY].newValue);
  }
  if (area === "local" && changes[INDENT_KEY]) {
    indentChanged = true;
    applyIndentSettings(changes[INDENT_KEY].newValue);
  }
  if (area === "local" && changes[MULTI_TAB_KEY]) {
    multiTabChanged = true;
    applyMultiTab(changes[MULTI_TAB_KEY].newValue !== false);
  }
  if (area === "sync" && changes[LANGUAGE_KEY]) {
    languageChanged = true;
    applyLanguage(changes[LANGUAGE_KEY].newValue);
  }
  if (area === "local" && changes[THEME_KEY]) {
    themeChanged = true;
    applyTheme(changes[THEME_KEY].newValue);
  }
  if (area === "local" && changes[WRAP_KEY]) {
    wrapChanged = true;
    applyWrap(changes[WRAP_KEY].newValue === true);
  }
  if (area === "local" && changes[AUTOSAVE_KEY]) {
    autoSaveChanged = true;
    elements.autosave.checked = changes[AUTOSAVE_KEY].newValue !== false;
    scheduleAutoSave();
  }
});

const state = {
  handle: null,
  name: "",
  sourceUrl: "",
  baselineHash: "",
  cleanText: "",
  eol: "\n",
  bom: false,
  saving: false,
  dirty: false
};
const editorGroupsHost = document.getElementById("editor-panel");
const initialGroupNode = createEditorGroupNode(0);
editorGroupsHost.append(initialGroupNode);
let editor = monaco.editor.create(initialGroupNode.querySelector(".monaco-container"), {
  model: null, automaticLayout: true, readOnly: true,
  fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace', fontSize: 16, lineHeight: 26.4,
  minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: "off", tabSize: 4,
  insertSpaces: false, cursorBlinking, folding: true, renderLineHighlight: "line", fixedOverflowWidgets: true
});
const editorGroups = [describeEditorGroup(0, initialGroupNode, editor)];
let nextGroupId = 1;
let activeGroup = 0;
const groupActive = Object.create(null);
let switchingModel = false;
function createEditorGroupNode(id) {
  const node = document.getElementById("editor-group-template").content.firstElementChild.cloneNode(true);
  node.dataset.editorGroup = String(id);
  node.querySelector(".editor-group-body").id = "editor-pane-" + id;
  return node;
}
function describeEditorGroup(id, node, instance) {
  return { id, node, editor: instance, tabsElement: node.querySelector(".editor-tabs"),
    header: node.querySelector(".editor-group-header"), placeholder: node.querySelector(".editor-placeholder"),
    splitButton: node.querySelector("[data-editor-split]"), moreButton: node.querySelector("[data-editor-more]"),
    closeButton: node.querySelector("[data-editor-close-group]"), viewStates: new Map() };
}
const imageTypes = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif", svg: "image/svg+xml" };
function imageType(name) { return imageTypes[name.split(".").pop().toLowerCase()] || ""; }
function disposeTab(tab) { if (tab.imageUrl) URL.revokeObjectURL(tab.imageUrl); tab.model.dispose(); }
function updateImagePreview(group, tab) {
  const viewer = group.node.querySelector(".image-preview"), image = viewer.querySelector("img"), unavailable = viewer.querySelector(".image-preview-unavailable");
  const isImage = tab?.kind === "image";
  viewer.hidden = !isImage;
  group.node.querySelector(".monaco-container").hidden = isImage;
  if (!isImage) { image.removeAttribute("src"); return; }
  image.alt = tab.name; image.hidden = !tab.imageUrl; unavailable.hidden = !!tab.imageUrl;
  unavailable.textContent = language === "en" ? "Image unavailable. Reopen the file to restore access." : "Không thể đọc ảnh. Hãy mở lại file để cấp quyền truy cập.";
  image.onerror = () => { image.hidden = true; unavailable.hidden = false; };
  if (tab.imageUrl && image.getAttribute("src") !== tab.imageUrl) image.src = tab.imageUrl;
  if (!tab.imageUrl) image.removeAttribute("src");
}
function findEditorGroup(id = activeGroup) { return editorGroups.find(group => group.id === id); }
function setEditorModel(model) { editor.setModel(model); }
function resetActiveFile() {
  activeTab = null;
  groupActive[activeGroup] = null;
  clearTimeout(autoSaveTimer);
  Object.assign(state, { handle: null, name: "", sourceUrl: "", baselineHash: "", cleanText: "", eol: "\n", bom: false, dirty: false });
  elements.filePath.textContent = language === "en" ? "No file open" : "Chưa mở file";
  elements.filePath.title = elements.filePath.textContent;
  clearError(); showStatus(""); refresh();
}
function switchEditorGroup(id, focus = false) {
  const target = findEditorGroup(id);
  if (state.saving || !target) return;
  if (id !== activeGroup) {
    snapshotTab();
    groupActive[activeGroup] = activeTab;
    activeGroup = id;
    editor = target.editor;
    activeTab = null;
    const tab = groupActive[id];
    if (tab && tabs.includes(tab)) activateTab(tab, false);
    else resetActiveFile();
  }
  if (focus) editor.focus();
  window.localWorkspace?.scheduleSave();
}
function installEditorEvents(instance, group) {
  instance.onDidFocusEditorText(() => switchEditorGroup(group));
  instance.onDidChangeModelContent(() => {
    if (switchingModel || instance !== editor || !state.name) return;
    if (activeTab) activeTab.preview = false;
    clearError(); refresh(); scheduleAutoSave();
  });
  instance.onDidChangeCursorSelection(() => { if (instance === editor) updateEditorStatus(); window.localWorkspace?.scheduleSave(); });
  instance.onDidChangeModel(() => { if (instance === editor) updateEditorStatus(); });
  instance.onDidChangeModelOptions(() => { if (instance === editor) updateEditorStatus(); });
  instance.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.KeyZ, () => {
    elements.wrap.checked = !elements.wrap.checked;
    elements.wrap.dispatchEvent(new Event("change"));
  });
  instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveFile());
  instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO, () => openByPicker());
  instance.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Backslash, () => splitEditorGroup(group));
}
function bindEditorGroup(group) {
  installEditorEvents(group.editor, group.id);
  group.node.querySelector(".image-preview").addEventListener("pointerdown", () => switchEditorGroup(group.id));
  group.splitButton.addEventListener("click", () => splitEditorGroup(group.id));
  group.moreButton.addEventListener("click", () => showEditorMore(group.moreButton, group.id));
  group.closeButton.addEventListener("click", () => closeEditorGroup(group.id));
  group.tabsElement.addEventListener("contextmenu", event => {
    if (event.target.closest(".editor-tab")) return;
    switchEditorGroup(group.id);
    if (activeTab) showTabContextMenu(event, activeTab);
  });
}
function splitEditorGroup(sourceId = activeGroup) {
  if (state.saving) return;
  const source = findEditorGroup(sourceId);
  if (!source) return;
  switchEditorGroup(sourceId);
  if (!activeTab) return;
  snapshotTab();
  // Splitting pins the source so opening a preview cannot replace it in either group.
  activeTab.preview = false;
  const id = nextGroupId++;
  const node = createEditorGroupNode(id);
  source.node.after(node);
  const instance = monaco.editor.create(node.querySelector(".monaco-container"), {
    model: activeTab.model, automaticLayout: true, readOnly: false,
    fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace', fontSize: 16, lineHeight: 26.4,
    minimap: { enabled: false }, scrollBeyondLastLine: false,
    wordWrap: elements.wrap.checked ? "on" : "off", ...indentSettings, cursorBlinking,
    folding: true, renderLineHighlight: "line", fixedOverflowWidgets: true
  });
  const group = describeEditorGroup(id, node, instance);
  editorGroups.splice(editorGroups.indexOf(source) + 1, 0, group);
  groupActive[sourceId] = activeTab;
  groupActive[id] = activeTab;
  activeTab.groups.add(id);
  group.viewStates.set(activeTab, editor.saveViewState());
  bindEditorGroup(group);
  switchEditorGroup(id, true);
  renderTabs();
  node.scrollIntoView({ block: "nearest", inline: "nearest" });
}
function closeEditorGroup(id = activeGroup) {
  if (state.saving || editorGroups.length === 1) return;
  const group = findEditorGroup(id);
  if (!group) return;
  snapshotTab();
  const groupTabs = tabs.filter(tab => tab.groups.has(id));
  if (groupTabs.some(tab => tab.dirty && tab.groups.size === 1) && !confirm(tr("Có tab chưa lưu. Đóng tất cả tab và bỏ các thay đổi?"))) return;
  const index = editorGroups.indexOf(group);
  const wasActive = activeGroup === id;
  switchingModel = true;
  group.editor.setModel(null);
  switchingModel = false;
  for (const tab of groupTabs) {
    tab.groups.delete(id);
    if (!tab.groups.size) {
      tabs.splice(tabs.indexOf(tab), 1);
      for (const other of editorGroups) other.viewStates.delete(tab);
      disposeTab(tab);
    }
  }
  delete groupActive[id];
  editorGroups.splice(index, 1);
  group.editor.dispose();
  group.node.remove();
  hideEditorMore();
  if (wasActive) {
    activeTab = null;
    const target = editorGroups[Math.max(0, index - 1)];
    activeGroup = target.id;
    editor = target.editor;
    const tab = groupActive[activeGroup];
    if (tab && tabs.includes(tab)) activateTab(tab, false); else resetActiveFile();
    editor.focus();
    target.node.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  renderTabs();
}
function languageForFile(name) {
  const ext = name.includes(".") ? name.split(".").pop().toLowerCase() : "";
  return ({js:"javascript",mjs:"javascript",cjs:"javascript",jsx:"javascript",ts:"typescript",tsx:"typescript",html:"html",htm:"html",svg:"xml",xml:"xml",css:"css",scss:"scss",json:"json",md:"markdown",markdown:"markdown",py:"python",dart:"dart",sh:"shell",bash:"shell",yml:"yaml",yaml:"yaml",cs:"csharp",cpp:"cpp",hpp:"cpp",h:"cpp",c:"c",java:"java",go:"go",rs:"rust",php:"php",rb:"ruby",sql:"sql"})[ext] || "plaintext";
}
function updateEditorTheme() {
  const mode = document.documentElement.dataset.theme;
  const dark = mode === "dark" || (mode !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  monaco.editor.setTheme(dark ? "local-dark" : "vs");
}
monaco.editor.defineTheme("local-dark", { base: "vs-dark", inherit: true, rules: [], colors: { "editor.background": "#121314" } });
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateEditorTheme);
updateEditorTheme();
function updateEditorStatus() {
  const cursorStatus = document.getElementById("cursor-status");
  const indentStatus = document.getElementById("indent-status");
  const model = editor.getModel();
  const position = editor.getPosition();
  cursorStatus.hidden = !model || !position;
  indentStatus.hidden = !model;
  if (!model || !position) return;
  const selected = (editor.getSelections() || []).reduce((total, selection) => total + model.getValueInRange(selection).length, 0);
  const positionText = language === "en" ? `Ln ${position.lineNumber}, Col ${position.column}` : `Dòng ${position.lineNumber}, Cột ${position.column}`;
  cursorStatus.textContent = positionText + (selected ? (language === "en" ? ` (${selected} selected)` : ` (đã chọn ${selected})`) : "");
  const options = model.getOptions();
  indentStatus.textContent = (options.insertSpaces ? (language === "en" ? "Spaces" : "Dấu cách") : (language === "en" ? "Tab size" : "Cỡ tab")) + `: ${options.tabSize}`;
}
bindEditorGroup(editorGroups[0]);
const tabs = [];
function normalizeCursorBlinking(value) {
  return CURSOR_BLINKING_MODES.includes(value) ? value : "blink";
}
function applyCursorBlinking(value) {
  cursorBlinking = normalizeCursorBlinking(value);
  for (const group of editorGroups) group.editor.updateOptions({ cursorBlinking });
  cursorBlinkingDropdown.setValue(cursorBlinking);
}
function applyIndentSettings(value) {
  indentSettings = {
    insertSpaces: typeof value?.insertSpaces === "boolean" ? value.insertSpaces : false,
    tabSize: Number.isInteger(value?.tabSize) && value.tabSize >= 1 && value.tabSize <= 16 ? value.tabSize : 4
  };
  for (const group of editorGroups) group.editor.updateOptions(indentSettings);
  for (const tab of tabs) tab.model.updateOptions(indentSettings);
  updateEditorStatus();
}
const indentDialog = document.getElementById("indent-dialog");
document.getElementById("indent-status").addEventListener("click", () => {
  if (!editor.getModel()) return;
  const options = editor.getModel().getOptions();
  document.querySelector(`input[name="indent-type"][value="${options.insertSpaces ? "spaces" : "tabs"}"]`).checked = true;
  document.getElementById("indent-size").value = options.tabSize;
  setText("#indent-title", "Thụt lề", "Indentation");
  setText("#indent-spaces-label", "Dùng dấu cách", "Use spaces");
  setText("#indent-tabs-label", "Dùng tab", "Use tabs");
  setText("#indent-size-label", "Kích thước thụt lề", "Indentation size");
  setText("#indent-hint", "Áp dụng cho file đang mở và file mở sau đó; không đổi nội dung hiện có.", "Applies to open and future files; existing content is unchanged.");
  setText("#indent-cancel", "Hủy", "Cancel");
  setText("#indent-save", "Lưu", "Save");
  indentDialog.showModal();
});
document.getElementById("indent-cancel").addEventListener("click", () => indentDialog.close());
document.getElementById("indent-form").addEventListener("submit", event => {
  event.preventDefault();
  const size = Number(document.getElementById("indent-size").value);
  if (!Number.isInteger(size) || size < 1 || size > 16) return;
  indentChanged = true;
  applyIndentSettings({ insertSpaces: document.querySelector('input[name="indent-type"]:checked').value === "spaces", tabSize: size });
  persistEditorSetting(INDENT_KEY, indentSettings).catch(console.error);
  indentDialog.close();
  editor.focus();
});
let activeTab = null;
function applyMultiTab(enabled) {
  multiTabEnabled = enabled;
  document.getElementById("settings-tabs").checked = enabled;
  renderTabs();
  elements.filePath.hidden = enabled;
}
const tabContextMenu = document.getElementById("tab-context-menu");
let contextTab = null;
function hideTabContextMenu() { tabContextMenu.hidden = true; contextTab = null; }
function showTabContextMenu(event, tab) {
  event.preventDefault();
  contextTab = tab;
  tabContextMenu.hidden = false;
  const rect = tabContextMenu.getBoundingClientRect();
  tabContextMenu.style.left = Math.max(0, Math.min(event.clientX, window.innerWidth - rect.width)) + "px";
  tabContextMenu.style.top = Math.max(0, Math.min(event.clientY, window.innerHeight - rect.height)) + "px";
  document.getElementById("tab-context-close").focus();
}
document.addEventListener("pointerdown", event => { if (!tabContextMenu.contains(event.target)) hideTabContextMenu(); });
tabContextMenu.addEventListener("keydown", event => {
  if (event.key === "Escape") { event.preventDefault(); hideTabContextMenu(); return; }
  if (event.key === "Tab") { hideTabContextMenu(); return; }
  if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    event.preventDefault();
    const items = Array.from(tabContextMenu.querySelectorAll('[role="menuitem"]'));
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
  }
});
document.getElementById("tab-context-close").addEventListener("click", () => {
  const tab = contextTab; hideTabContextMenu(); if (tab) closeTab(tab);
});
document.getElementById("tab-context-close-all").addEventListener("click", () => { hideTabContextMenu(); closeAllTabs(); });
function setPreviewEnabled(enabled) {
  previewEnabled = enabled;
  document.getElementById("editor-preview").setAttribute("aria-checked", String(enabled));
  if (!enabled) { for (const tab of tabs) tab.preview = false; renderTabs(); }
}
document.getElementById("editor-preview").addEventListener("click", () => {
  previewChanged = true;
  setPreviewEnabled(!previewEnabled);
  persistEditorSetting(PREVIEW_KEY, previewEnabled).catch(console.error);
  hideEditorMore();
});
const editorMoreMenu = document.getElementById("editor-more-menu");
const editorListItems = document.getElementById("editor-list-items");
let editorMoreAnchor = null;
function hideEditorMore() {
  editorMoreMenu.hidden = true;
  for (const group of editorGroups) group.moreButton.setAttribute("aria-expanded", "false");
  editorListItems.hidden = true;
}
function showEditorMore(button, group) {
  if (!editorMoreMenu.hidden && editorMoreAnchor === button) { hideEditorMore(); return; }
  hideEditorMore();
  switchEditorGroup(group);
  if (activeGroup !== group) return;
  snapshotTab();
  const groupTabs = tabs.filter(tab => tab.groups.has(group));
  document.getElementById("editor-close-all").disabled = state.saving || !groupTabs.length;
  document.getElementById("editor-close-saved").disabled = state.saving || !groupTabs.some(tab => !tab.dirty);
  editorMoreAnchor = button;
  editorMoreMenu.hidden = false;
  button.setAttribute("aria-expanded", "true");
  const anchor = button.getBoundingClientRect();
  const menu = editorMoreMenu.getBoundingClientRect();
  editorMoreMenu.style.left = Math.max(0, Math.min(anchor.right - menu.width, window.innerWidth - menu.width)) + "px";
  editorMoreMenu.style.top = Math.max(0, Math.min(anchor.bottom, window.innerHeight - menu.height)) + "px";
}
document.addEventListener("pointerdown", event => {
  if (!event.target.closest("[data-editor-more]") && !editorMoreMenu.contains(event.target)) hideEditorMore();
});
editorMoreMenu.addEventListener("keydown", event => {
  if (event.key === "Escape") { const anchor = editorMoreAnchor; hideEditorMore(); anchor?.focus(); }
});
document.getElementById("editor-list").addEventListener("click", () => {
  if (!editorListItems.hidden) { editorListItems.hidden = true; return; }
  editorListItems.replaceChildren();
  for (const tab of tabs.filter(tab => tab.groups.has(activeGroup))) {
    const button = document.createElement("button");
    button.type = "button"; button.setAttribute("role", "menuitem");
    button.textContent = (tab === activeTab ? "✓ " : "") + tab.name + (tab.dirty ? " ●" : "");
    button.title = tab.displayPath || tab.name;
    button.addEventListener("click", () => { hideEditorMore(); activateTab(tab); });
    editorListItems.appendChild(button);
  }
  editorListItems.hidden = false;
});
document.getElementById("editor-close-all").addEventListener("click", () => { hideEditorMore(); closeAllTabs(); });
document.getElementById("editor-close-saved").addEventListener("click", () => {
  hideEditorMore();
  if (state.saving) return;
  snapshotTab();
  for (const tab of [...tabs]) if (!tab.dirty) closeTab(tab);
});
document.getElementById("editor-configure").addEventListener("click", () => {
  hideEditorMore(); document.getElementById("settings-btn").click();
});
function snapshotTab() {
  if (!activeTab) return;
  findEditorGroup()?.viewStates.set(activeTab, editor.saveViewState());
  Object.assign(activeTab, {
    handle: state.handle, name: state.name, sourceUrl: state.sourceUrl,
    baselineHash: state.baselineHash, cleanText: state.cleanText,
    eol: state.eol, bom: state.bom, dirty: state.dirty,
    text: editor.getValue(), displayPath: elements.filePath.title
  });
}
function renderTabs() {
  for (const group of editorGroups) {
    group.tabsElement.replaceChildren();
    group.header.hidden = !multiTabEnabled || (!tabs.length && editorGroups.length === 1);
    group.node.classList.toggle("active-group", group.id === activeGroup);
    group.closeButton.hidden = editorGroups.length === 1;
    const current = group.id === activeGroup ? activeTab : groupActive[group.id];
    updateImagePreview(group, current);
    group.splitButton.disabled = state.saving || !current;
    group.placeholder.hidden = !!current;
    group.placeholder.textContent = language === "en" ? "Click Open file to choose a file…" : "Nhấn Mở file để chọn một file…";
    const labels = [
      [group.splitButton, "Chia trình soạn thảo sang phải", "Split editor right"],
      [group.moreButton, "Tùy chọn tab", "Editor actions"],
      [group.closeButton, "Đóng nhóm editor", "Close editor group"]
    ];
    for (const [button, vi, en] of labels) { button.title = language === "en" ? en : vi; button.setAttribute("aria-label", button.title); }
  }
  for (const groupInfo of editorGroups) for (const tab of tabs) {
    const group = groupInfo.id;
    if (!tab.groups.has(group)) continue;
    const groupTabs = tabs.filter(t => t.groups.has(group));
    const targetTabs = groupInfo.tabsElement;
    const selected = tab === (group === activeGroup ? activeTab : groupActive[group]);
    const item = document.createElement("div");
    item.className = "editor-tab" + (selected ? " active" : "") + (tab.preview ? " preview" : "");
    item.addEventListener("contextmenu", event => { switchEditorGroup(group); showTabContextMenu(event, tab); });
    const select = document.createElement("button");
    select.type = "button"; select.className = "tab-select";
    select.setAttribute("role", "tab"); select.setAttribute("aria-selected", String(selected));
    select.setAttribute("aria-controls", "editor-pane-" + group);
    select.tabIndex = selected ? 0 : -1;
    select.title = tab.displayPath || tab.name;
    const name = document.createElement("span"); name.className = "tab-name"; name.textContent = tab.name;
    select.appendChild(name);
    if (tab.dirty) { const dot = document.createElement("span"); dot.className = "tab-dirty"; dot.textContent = "●"; select.appendChild(dot); }
    select.addEventListener("click", () => { switchEditorGroup(group); activateTab(tab); });
    select.addEventListener("dblclick", () => { tab.preview = false; renderTabs(); });
    select.addEventListener("keydown", event => {
      const index = groupTabs.indexOf(tab);
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % groupTabs.length;
      else if (event.key === "ArrowLeft") next = (index + groupTabs.length - 1) % groupTabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = groupTabs.length - 1;
      else return;
      event.preventDefault();
      targetTabs.querySelectorAll('[role="tab"]')[next].focus();
    });
    const close = document.createElement("button"); close.type = "button"; close.className = "tab-close";
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
    close.setAttribute("aria-label", (language === "en" ? "Close " : "Đóng ") + tab.name);
    close.addEventListener("click", () => { switchEditorGroup(group); closeTab(tab); });
    item.append(select, close); targetTabs.appendChild(item);
  }
  window.localWorkspace?.scheduleSave();
}
function activateTab(tab, focus = true) {
  if (state.saving || tab === activeTab) return;
  clearTimeout(autoSaveTimer);
  snapshotTab();
  activeTab = tab;
  groupActive[activeGroup] = tab;
  Object.assign(state, { handle: tab.handle, name: tab.name, sourceUrl: tab.sourceUrl, baselineHash: tab.baselineHash,
    cleanText: tab.cleanText, eol: tab.eol, bom: tab.bom, dirty: tab.dirty });
  switchingModel = true;
  setEditorModel(tab.model);
  switchingModel = false;
  elements.filePath.textContent = tab.name;
  elements.filePath.title = tab.displayPath || tab.name;
  clearError(); refresh();
  const viewState = findEditorGroup()?.viewStates.get(tab);
  if (viewState) editor.restoreViewState(viewState);
  if (!state.dirty) showStatus(state.handle || window.localFileAccess?.canSave(state.sourceUrl) ? "Đã mở" : "Chọn file gốc khi lưu lần đầu");
  else scheduleAutoSave();
  if (focus) editor.focus();
}
function closeTab(tab, confirmed = false) {
  if (state.saving || !tab.groups.has(activeGroup)) return;
  if (tab === activeTab) snapshotTab();
  if (!confirmed && tab.dirty && tab.groups.size === 1 && !confirm(tr("Tab có thay đổi chưa lưu. Đóng và bỏ các thay đổi?"))) return;
  const groupTabs = tabs.filter(t => t.groups.has(activeGroup));
  const index = groupTabs.indexOf(tab);
  tab.groups.delete(activeGroup);
  findEditorGroup()?.viewStates.delete(tab);
  if (tab === activeTab) { switchingModel = true; setEditorModel(null); switchingModel = false; }
  if (!tab.groups.size) { tabs.splice(tabs.indexOf(tab), 1); disposeTab(tab); }
  if (tab === activeTab) {
    activeTab = null; groupActive[activeGroup] = null; clearTimeout(autoSaveTimer);
    const remaining = tabs.filter(t => t.groups.has(activeGroup));
    if (remaining.length) { activateTab(remaining[Math.min(index, remaining.length - 1)]); return; }
    Object.assign(state, { handle: null, name: "", sourceUrl: "", baselineHash: "", cleanText: "", eol: "\n", bom: false, dirty: false });
    elements.filePath.textContent = language === "en" ? "No file open" : "Chưa mở file";
    elements.filePath.title = elements.filePath.textContent;
    clearError(); showStatus(""); refresh();
  } else renderTabs();
}
function closeAllTabs() {
  if (state.saving) return;
  snapshotTab();
  const groupTabs = tabs.filter(tab => tab.groups.has(activeGroup));
  if (groupTabs.some(tab => tab.dirty && tab.groups.size === 1) && !confirm(tr("Có tab chưa lưu. Đóng tất cả tab và bỏ các thay đổi?"))) return;
  for (const tab of groupTabs) closeTab(tab, true);
}

const explorerPanel = document.getElementById("explorer-panel");
const explorerToggle = document.getElementById("explorer-toggle");
const explorerSplitter = document.getElementById("explorer-splitter");
let explorerWidth = 240;
function explorerWidthBounds() {
  const available = document.querySelector(".workspace").clientWidth;
  const max = Math.max(0, available - 48 - 5 - 200);
  return { min: Math.min(170, max), max };
}
function applyExplorerWidth() {
  const { min, max } = explorerWidthBounds();
  const width = Math.max(min, Math.min(max, explorerWidth));
  explorerPanel.style.flexBasis = width + "px";
  explorerSplitter.setAttribute("aria-valuemin", String(Math.round(min)));
  explorerSplitter.setAttribute("aria-valuemax", String(Math.round(max)));
  explorerSplitter.setAttribute("aria-valuenow", String(Math.round(width)));
  explorerSplitter.setAttribute("aria-valuetext", Math.round(width) + " px");
}
function setExplorerWidth(value, save = false) {
  if (!Number.isFinite(value)) return;
  const { min, max } = explorerWidthBounds();
  explorerWidth = Math.round(Math.max(min, Math.min(max, value)));
  applyExplorerWidth();
  if (save) window.localWorkspace?.scheduleSave();
}
function restoreExplorerWidth(value) {
  explorerWidth = Number.isFinite(value) ? Math.max(100, Math.min(4000, value)) : 240;
  applyExplorerWidth();
}
new ResizeObserver(applyExplorerWidth).observe(document.querySelector(".workspace"));
let explorerDrag = null;
explorerSplitter.addEventListener("pointerdown", event => {
  if (event.button !== 0 || explorerDrag) return;
  event.preventDefault(); explorerSplitter.focus();
  explorerDrag = { pointer: event.pointerId, startX: event.clientX, startWidth: explorerPanel.getBoundingClientRect().width, savedWidth: explorerWidth, collapse: false };
  explorerSplitter.setPointerCapture(event.pointerId); explorerSplitter.classList.add("dragging");
});
explorerSplitter.addEventListener("pointermove", event => {
  if (explorerDrag?.pointer === event.pointerId) {
    const desired = explorerDrag.startWidth + event.clientX - explorerDrag.startX;
    explorerDrag.collapse = desired < Math.max(0, explorerWidthBounds().min - 55);
    setExplorerWidth(desired);
  }
});
function endExplorerDrag(event, cancel = false) {
  if (!explorerDrag || event.pointerId !== explorerDrag.pointer) return;
  const collapse = !cancel && explorerDrag.collapse;
  const previousWidth = explorerDrag.savedWidth;
  if (cancel) explorerWidth = explorerDrag.savedWidth;
  explorerDrag = null; explorerSplitter.classList.remove("dragging"); applyExplorerWidth();
  if (collapse) {
    explorerWidth = previousWidth > 24 ? previousWidth : 240;
    applyExplorerWidth(); explorerPanel.hidden = true; explorerToggle.setAttribute("aria-expanded", "false");
  }
  if (!cancel) window.localWorkspace?.scheduleSave();
}
explorerSplitter.addEventListener("pointerup", event => endExplorerDrag(event));
explorerSplitter.addEventListener("pointercancel", event => endExplorerDrag(event, true));
explorerSplitter.addEventListener("lostpointercapture", event => endExplorerDrag(event, true));
explorerSplitter.addEventListener("keydown", event => {
  if (event.key === "Escape" && explorerDrag) { event.preventDefault(); endExplorerDrag({ pointerId: explorerDrag.pointer }, true); return; }
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const width = explorerPanel.getBoundingClientRect().width;
  if (event.key === "Home" || (event.key === "ArrowLeft" && width <= explorerWidthBounds().min)) {
    explorerPanel.hidden = true; explorerToggle.setAttribute("aria-expanded", "false"); window.localWorkspace?.scheduleSave(); return;
  }
  setExplorerWidth(event.key === "End" ? explorerWidthBounds().max : width + (event.key === "ArrowLeft" ? -10 : 10), true);
});
explorerSplitter.addEventListener("dblclick", () => setExplorerWidth(240, true));
const explorerContent = document.getElementById("explorer-content");
let selectedTreeItem = null;
let explorerOpening = false;
let folderRevision = 0;
let explorerFolders = [];
let explorerRootDescriptor = null;
let explorerRoot = null;
let explorerRootPath = "";
let refreshExplorerRoot = null;
let treeContext = null;
let cutTreeFile = null;
const treeMenu = document.getElementById("tree-context-menu");
function hideTreeMenu() { treeMenu.hidden = true; treeContext = null; }
function showTreeMenu(event, handle, relativePath, refreshDirectory, parentHandle = null, refreshParent = null, rootDescriptor = explorerRootDescriptor) {
  if (rootDescriptor) activateExplorerRoot(rootDescriptor);
  event.preventDefault();
  treeContext = { handle, relativePath, refreshDirectory, parentHandle, refreshParent, rootDescriptor };
  const directory = handle?.kind === "directory";
  const workspace = !parentHandle && !!rootDescriptor;
  document.getElementById("tree-copy-path").hidden = !handle;
  document.getElementById("tree-copy-absolute").hidden = !handle;
  document.getElementById("tree-workspace-separator").hidden = !handle || !!parentHandle;
  document.getElementById("tree-add-folder").hidden = !!parentHandle;
  document.getElementById("tree-folder-settings").hidden = !workspace;
  document.getElementById("tree-new-file").hidden = !directory;
  document.getElementById("tree-new-folder").hidden = !directory;
  document.getElementById("tree-delete").hidden = !parentHandle;
  document.getElementById("tree-remove-root").hidden = !workspace;
  document.getElementById("tree-rename").hidden = !handle || directory || !parentHandle;
  document.getElementById("tree-cut").hidden = !handle || directory || !parentHandle;
  document.getElementById("tree-paste").hidden = !directory;
  document.getElementById("tree-paste").disabled = !cutTreeFile;
  treeMenu.hidden = false;
  const rect = treeMenu.getBoundingClientRect();
  treeMenu.style.left = Math.max(0, Math.min(event.clientX, innerWidth - rect.width)) + "px";
  treeMenu.style.top = Math.max(0, Math.min(event.clientY, innerHeight - rect.height)) + "px";
  treeMenu.querySelector('button:not([hidden]):not(:disabled)').focus();
}
document.addEventListener("pointerdown", event => { if (!treeMenu.contains(event.target)) hideTreeMenu(); });
treeMenu.addEventListener("keydown", event => {
  if (event.key === "Escape") { event.preventDefault(); hideTreeMenu(); return; }
  if (event.key === "Tab") { hideTreeMenu(); return; }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const items = Array.from(treeMenu.querySelectorAll('button:not([hidden]):not(:disabled)'));
  const step = event.key === "ArrowDown" ? 1 : -1;
  items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
});
async function createTreeItem(kind) {
  const target = treeContext;
  hideTreeMenu();
  if (!target || target.handle.kind !== "directory") return;
  const dialog = document.getElementById("create-dialog");
  const form = document.getElementById("create-form");
  const input = document.getElementById("create-name");
  const errorElement = document.getElementById("create-error");
  document.getElementById("create-title").textContent = kind === "file" ? (language === "en" ? "New file" : "Tạo file") : (language === "en" ? "New folder" : "Tạo thư mục");
  document.getElementById("create-location-label").textContent = language === "en" ? "Location" : "Thư mục đích";
  document.getElementById("create-location").textContent = target.rootDescriptor.handle.name + (target.relativePath ? "\\" + target.relativePath : "");
  document.getElementById("create-name-label").textContent = kind === "file" ? (language === "en" ? "File name" : "Tên file") : (language === "en" ? "Folder name" : "Tên thư mục");
  document.getElementById("create-cancel").textContent = language === "en" ? "Cancel" : "Hủy";
  document.getElementById("create-submit").textContent = language === "en" ? "Create" : "Tạo";
  input.value = "";
  errorElement.hidden = true;
  dialog.showModal();
  input.focus();
  form.onsubmit = async event => {
    event.preventDefault();
    const name = input.value;
    if (!name.trim() || name === "." || name === ".." || /[\\/\x00-\x1f<>:"|?*]/.test(name) || /[. ]$/.test(name)) {
      errorElement.textContent = language === "en" ? "Invalid file or folder name." : "Tên file hoặc thư mục không hợp lệ.";
      errorElement.hidden = false;
      return;
    }
    const submit = document.getElementById("create-submit");
    submit.disabled = true;
    try {
      if (await target.handle.requestPermission({ mode: "readwrite" }) !== "granted") return;
    // Check both entry types before creation to avoid opening an existing item as new.
    for (const method of ["getFileHandle", "getDirectoryHandle"]) {
      try { await target.handle[method](name); throw new Error(language === "en" ? "An item with this name already exists." : "Tên này đã tồn tại."); }
      catch (error) { if (error.name !== "NotFoundError" && error.name !== "TypeMismatchError") throw error; if (error.name === "TypeMismatchError") throw new Error(language === "en" ? "An item with this name already exists." : "Tên này đã tồn tại."); }
    }
    if (kind === "file") await target.handle.getFileHandle(name, { create: true });
    else await target.handle.getDirectoryHandle(name, { create: true });
      await target.refreshDirectory();
      dialog.close();
    } catch (error) {
      errorElement.textContent = (language === "en" ? "Could not create item: " : "Không thể tạo: ") + error.message;
      errorElement.hidden = false;
    } finally { submit.disabled = false; }
  };
}
document.getElementById("create-cancel").addEventListener("click", () => document.getElementById("create-dialog").close());
document.getElementById("tree-new-file").addEventListener("click", () => createTreeItem("file"));
document.getElementById("tree-new-folder").addEventListener("click", () => createTreeItem("directory"));
async function ensureFileCanMove(target, destination, name) {
  if (state.saving) throw new Error(language === "en" ? "Wait for the current save to finish." : "Hãy đợi lưu file xong.");
  if (typeof target.handle.move !== "function") throw new Error(language === "en" ? "Chrome does not support moving this file." : "Chrome không hỗ trợ di chuyển file này.");
  for (const tab of tabs) {
    if (tab.handle && await target.handle.isSameEntry(tab.handle)) throw new Error(language === "en" ? "Close this file before moving or renaming it." : "Hãy đóng file này trước khi đổi tên hoặc di chuyển.");
  }
  for (const method of ["getFileHandle", "getDirectoryHandle"]) {
    try { await destination[method](name); throw new Error(language === "en" ? "An item with this name already exists." : "Tên này đã tồn tại."); }
    catch (error) {
      if (error.name === "TypeMismatchError") throw new Error(language === "en" ? "An item with this name already exists." : "Tên này đã tồn tại.");
      if (error.name !== "NotFoundError") throw error;
    }
  }
}
document.getElementById("tree-rename").addEventListener("click", () => {
  const target = treeContext; hideTreeMenu();
  if (!target?.parentHandle || target.handle.kind !== "file") return;
  const dialog = document.getElementById("rename-dialog");
  const input = document.getElementById("rename-input");
  const error = document.getElementById("rename-error");
  document.getElementById("rename-title").textContent = language === "en" ? "Rename file" : "Đổi tên file";
  document.getElementById("rename-label").textContent = language === "en" ? "New name" : "Tên mới";
  document.getElementById("rename-cancel").textContent = language === "en" ? "Cancel" : "Hủy";
  document.getElementById("rename-submit").textContent = language === "en" ? "Rename" : "Đổi tên";
  input.value = target.handle.name; error.hidden = true; dialog.showModal(); input.focus(); input.select();
  document.getElementById("rename-form").onsubmit = async event => {
    event.preventDefault();
    const name = input.value;
    if (name === target.handle.name) { dialog.close(); return; }
    if (!name.trim() || name === "." || name === ".." || /[\\/\x00-\x1f<>:"|?*]/.test(name) || /[. ]$/.test(name)) {
      error.textContent = language === "en" ? "Invalid file name." : "Tên file không hợp lệ."; error.hidden = false; return;
    }
    const submit = document.getElementById("rename-submit"); submit.disabled = true;
    try {
      if (await target.parentHandle.requestPermission({ mode: "readwrite" }) !== "granted") return;
      await ensureFileCanMove(target, target.parentHandle, name);
      await target.handle.move(name);
      if (cutTreeFile && await cutTreeFile.handle.isSameEntry(target.handle).catch(() => false)) cutTreeFile = null;
      dialog.close();
      await target.refreshParent();
    } catch (err) { error.textContent = (language === "en" ? "Could not rename: " : "Không thể đổi tên: ") + err.message; error.hidden = false; }
    finally { submit.disabled = false; }
  };
});
document.getElementById("rename-cancel").addEventListener("click", () => document.getElementById("rename-dialog").close());
document.getElementById("tree-cut").addEventListener("click", () => {
  const target = treeContext; hideTreeMenu();
  if (!target?.parentHandle || target.handle.kind !== "file") return;
  cutTreeFile = target;
  showStatus(language === "en" ? "File cut: select a folder and choose Paste" : "Đã cắt file: chọn thư mục rồi chọn Dán");
});
document.getElementById("tree-paste").addEventListener("click", async () => {
  const destination = treeContext; const source = cutTreeFile; hideTreeMenu();
  if (!source || destination?.handle.kind !== "directory") return;
  try {
    if (await explorerRoot.requestPermission({ mode: "readwrite" }) !== "granted") return;
    if (await source.parentHandle.isSameEntry(destination.handle)) { cutTreeFile = null; return; }
    await ensureFileCanMove(source, destination.handle, source.handle.name);
    await source.handle.move(destination.handle);
    cutTreeFile = null;
    await source.refreshParent();
    await destination.refreshDirectory();
    showStatus(language === "en" ? "File moved" : "Đã di chuyển file", "ok");
  } catch (error) { showError((language === "en" ? "Could not move: " : "Không thể di chuyển: ") + error.message); }
});
document.getElementById("tree-copy-path").addEventListener("click", async () => {
  const target = treeContext;
  hideTreeMenu();
  if (!target) return;
  try { await navigator.clipboard.writeText(target.relativePath || "."); }
  catch (error) { showError((language === "en" ? "Could not copy path: " : "Không thể sao chép đường dẫn: ") + error.message); }
});
function absoluteTreePath(root, relative) {
  const separator = root.startsWith("/") ? "/" : "\\";
  return root.replace(/[\\/]+$/, "") + (relative ? separator + relative.replace(/[\\/]/g, separator) : "");
}
document.getElementById("tree-copy-absolute").addEventListener("click", () => {
  const target = treeContext;
  hideTreeMenu();
  if (!target || !explorerRoot) return;
  if (explorerRootPath) {
    navigator.clipboard.writeText(absoluteTreePath(explorerRootPath, target.relativePath)).catch(error => showError((language === "en" ? "Could not copy path: " : "Không thể sao chép đường dẫn: ") + error.message));
    return;
  }
  openRootPathDialog(target);
});
let stopPreviousRootPicker = () => {};
function openRootPathDialog(target, copyPath = true) {
  const descriptor = target.rootDescriptor;
  const root = descriptor?.handle;
  if (!root) return;
  stopPreviousRootPicker();
  activateExplorerRoot(descriptor);
  const dialog = document.getElementById("root-path-dialog");
  const input = document.getElementById("root-path-input");
  const error = document.getElementById("root-path-error");
  const browse = document.getElementById("root-path-browse");
  const submit = document.getElementById("root-path-submit");
  let pickerPort = null;
  function stopPicker() {
    const port = pickerPort; pickerPort = null;
    if (port) port.disconnect();
    browse.disabled = false; submit.disabled = false; input.disabled = false;
    browse.textContent = language === "en" ? "Choose folder…" : "Chọn thư mục…";
  }
  function validatePath(value) {
    const isAbsolute = /^(?:[a-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+|\/)/i.test(value);
    const lastComponent = value.split(/[\\/]/).pop();
    if (isAbsolute && lastComponent.toLocaleLowerCase() === root.name.toLocaleLowerCase()) return true;
    error.textContent = language === "en" ? `Choose the open root folder "${root.name}".` : `Hãy chọn thư mục gốc đang mở "${root.name}".`;
    error.hidden = false;
    return false;
  }
  document.getElementById("root-path-title").textContent = copyPath
    ? (language === "en" ? "Root folder path" : "Đường dẫn thư mục gốc")
    : (language === "en" ? "Folder Settings: " : "Cài đặt thư mục: ") + root.name;
  document.getElementById("root-path-description").textContent = copyPath
    ? (language === "en" ? "Choose the open root folder again to fill in and remember its absolute path." : "Chọn lại thư mục gốc đang mở để tự điền và ghi nhớ đường dẫn tuyệt đối.")
    : (language === "en" ? "Choose the absolute path for this folder. Used for copying paths and detecting Git repositories; saved in this workspace." : "Chọn đường dẫn tuyệt đối của thư mục này, dùng để sao chép đường dẫn và nhận diện Git. Thiết lập được lưu trong workspace này.");
  document.getElementById("root-path-label").textContent = (language === "en" ? "Path to folder: " : "Đường dẫn thư mục: ") + root.name;
  document.getElementById("root-path-cancel").textContent = language === "en" ? "Cancel" : "Hủy";
  document.getElementById("root-path-submit").textContent = copyPath ? (language === "en" ? "Save and copy" : "Lưu và sao chép") : (language === "en" ? "Save" : "Lưu");
  input.value = descriptor.absolutePath || ""; error.hidden = true; stopPicker();
  stopPreviousRootPicker = stopPicker;
  dialog.onclose = () => { if (!dialog.open) stopPicker(); };
  browse.onclick = () => {
    if (pickerPort) return;
    error.hidden = true;
    browse.disabled = true; submit.disabled = true; input.disabled = true;
    browse.textContent = language === "en" ? "Choosing…" : "Đang chọn…";
    function pickerFailed() {
      stopPicker();
      error.textContent = language === "en"
        ? "Folder picker unavailable. Install the terminal host following README, then try again, or enter the path."
        : "Chưa kết nối được bộ chọn thư mục. Cài terminal host theo README rồi thử lại, hoặc nhập đường dẫn.";
      error.hidden = false;
    }
    try {
      const port = chrome.runtime.connectNative("dinkit.editor");
      pickerPort = port;
      port.onMessage.addListener(message => {
        if (pickerPort !== port || !dialog.open) return;
        if (message.type === "error") { pickerFailed(); return; }
        if (message.type !== "directoryChosen") return;
        stopPicker();
        if (root !== explorerRoot) { dialog.close(); return; }
        const value = typeof message.cwd === "string" ? message.cwd.trim().replace(/[\\/]+$/, "") : "";
        if (value && validatePath(value)) { input.value = value; submit.focus(); }
        else browse.focus();
      });
      port.onDisconnect.addListener(() => {
        const nativeError = chrome.runtime.lastError;
        if (pickerPort !== port) return;
        pickerFailed();
      });
      port.postMessage({ type: "chooseDirectory" });
    } catch { pickerFailed(); }
  };
  dialog.showModal(); browse.focus();
  document.getElementById("root-path-form").onsubmit = event => {
    event.preventDefault();
    const value = input.value.trim().replace(/[\\/]+$/, "");
    if (pickerPort || !validatePath(value)) return;
    if (root !== explorerRoot) { dialog.close(); return; }
    const copy = copyPath ? navigator.clipboard.writeText(absoluteTreePath(value, target.relativePath)) : Promise.resolve();
    copy.then(() => {
      if (root === explorerRoot) {
        explorerRootPath = value;
        descriptor.absolutePath = value;
        window.localWorkspace?.scheduleSave();
        savedFolder("put", { handle: root, absolutePath: value }).catch(console.error);
      }
      dialog.close();
    }).catch(err => { error.textContent = (language === "en" ? "Could not copy path: " : "Không thể sao chép đường dẫn: ") + err.message; error.hidden = false; });
  };
}
document.getElementById("root-path-cancel").addEventListener("click", () => document.getElementById("root-path-dialog").close());
document.getElementById("tree-delete").addEventListener("click", async () => {
  const target = treeContext;
  hideTreeMenu();
  if (!target?.parentHandle || state.saving) return;
  const isDirectory = target.handle.kind === "directory";
  const warning = language === "en"
    ? `Delete ${isDirectory ? "folder" : "file"} "${target.relativePath}"?${isDirectory ? " All contents will also be deleted." : ""}`
    : `Xóa ${isDirectory ? "thư mục" : "file"} "${target.relativePath}"?${isDirectory ? " Toàn bộ nội dung bên trong cũng sẽ bị xóa." : ""}`;
  const dialog = document.getElementById("delete-dialog");
  document.getElementById("delete-title").textContent = language === "en" ? "Delete" : "Xóa";
  document.getElementById("delete-description").textContent = warning;
  document.getElementById("delete-cancel").textContent = language === "en" ? "Cancel" : "Hủy";
  const confirmButton = document.getElementById("delete-confirm");
  confirmButton.textContent = language === "en" ? "Delete" : "Xóa";
  dialog.showModal();
  document.getElementById("delete-cancel").focus();
  confirmButton.onclick = async () => {
  confirmButton.disabled = true;
  try {
    if (await target.parentHandle.requestPermission({ mode: "readwrite" }) !== "granted") return;
    // An open dirty file inside a deleted folder would otherwise appear saveable.
    snapshotTab();
    const affected = [];
    for (const tab of tabs) {
      if (!tab.handle) continue;
      if (isDirectory) {
        if (await target.handle.resolve(tab.handle)) affected.push(tab);
      } else if (await target.handle.isSameEntry(tab.handle)) affected.push(tab);
    }
    if (affected.some(tab => tab.dirty)) {
      dialog.close();
      showError(language === "en" ? "Save or close unsaved files before deleting them." : "Hãy lưu hoặc đóng các file chưa lưu trước khi xóa.");
      return;
    }
    await target.parentHandle.removeEntry(target.handle.name, { recursive: isDirectory });
    for (const tab of affected) closeTab(tab);
    await target.refreshParent();
    dialog.close();
  } catch (error) {
    dialog.close();
    showError((language === "en" ? "Could not delete: " : "Không thể xóa: ") + error.message);
  } finally { confirmButton.disabled = false; }
  };
});
document.getElementById("delete-cancel").addEventListener("click", () => document.getElementById("delete-dialog").close());
const FOLDER_DB = "localTextEditorFolders";
function openFolderDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(FOLDER_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function savedFolder(operation, handle) {
  const db = await openFolderDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("handles", operation === "put" ? "readwrite" : "readonly");
      const store = transaction.objectStore("handles");
      const request = operation === "put" ? store.put(handle, "current") : store.get("current");
      let result;
      request.onsuccess = () => { result = request.result; };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error || new Error("Folder storage transaction aborted"));
    });
  } finally { db.close(); }
}
function activateExplorerRoot(root) {
  explorerRootDescriptor = root;
  explorerRoot = root?.handle || null;
  explorerRootPath = root?.absolutePath || "";
  refreshExplorerRoot = root?.refresh || null;
}
async function setExplorerFolders(folders) {
  const revision = ++folderRevision;
  explorerFolders = folders.map(folder => ({ handle: folder.handle || folder, absolutePath: folder.absolutePath || "" }));
  activateExplorerRoot(explorerFolders[0] || null);
  cutTreeFile = null; selectedTreeItem = null;
  explorerContent.replaceChildren();
  if (!explorerFolders.length) {
    const empty = document.createElement("p");empty.id = "explorer-empty";empty.textContent = language === "en" ? "No folder open" : "Chưa mở thư mục";
    const button = document.createElement("button");button.type = "button";button.className = "button secondary";button.id = "explorer-open-folder";
    button.textContent = language === "en" ? "Open folder" : "Mở thư mục";button.addEventListener("click", () => chooseFolder(false));
    explorerContent.append(empty, button);return;
  }
  await Promise.all(explorerFolders.map(async root => {
    const holder = document.createElement("div");holder.className = "workspace-root";explorerContent.append(holder);
    const display = () => {
      if (revision !== folderRevision) return;
      const entry = createTreeEntry(root.handle, 0, root.handle.name, true, null, null, root);
      holder.replaceChildren(entry);root.refresh = () => entry.refreshTreeDirectory();
      if (root === explorerRootDescriptor) refreshExplorerRoot = root.refresh;
    };
    try {
      const permission = typeof root.handle.queryPermission === "function" ? await root.handle.queryPermission({ mode: "read" }) : "granted";
      if (revision !== folderRevision) return;
      if (permission === "granted") { display(); return; }
      const label = document.createElement("p");label.textContent = root.handle.name;
      const reconnect = document.createElement("button");reconnect.type = "button";reconnect.className = "button secondary explorer-reconnect";
      reconnect.textContent = language === "en" ? "Restore folder access" : "Cấp quyền mở lại thư mục";
      reconnect.addEventListener("click", async () => {
        try { if (await root.handle.requestPermission({ mode: "read" }) === "granted") { display(); await window.localWorkspace?.refreshFolderFiles(root.handle); } }
        catch (error) { showError("Không thể mở thư mục: " + error.message); }
      });holder.append(label, reconnect);
    } catch (error) { if (revision === folderRevision) holder.textContent = root.handle.name + ": " + error.message; }
  }));
}
function showFolder(directory) { return setExplorerFolders([{ handle: directory, absolutePath: explorerRootPath }]); }
explorerPanel.addEventListener("contextmenu", event => {
  if (event.target.closest(".tree-item")) return;
  showTreeMenu(event, null, "", null, null, null, explorerFolders.length === 1 ? explorerFolders[0] : null);
});
async function restoreFolder() {
  try {
    const stored = await savedFolder("get");const directory = stored?.handle || stored;
    if (directory) await setExplorerFolders([{ handle: directory, absolutePath: stored?.absolutePath || "" }]);
  } catch (error) { console.warn("Could not restore folder:", error); }
}
explorerToggle.addEventListener("click", () => {
  explorerPanel.hidden = !explorerPanel.hidden;
  explorerToggle.setAttribute("aria-expanded", String(!explorerPanel.hidden));
  window.localWorkspace?.scheduleSave();
});
async function chooseFolder(add = false) {
  if (state.saving || window.localWorkspace?.restoring) return;
  if (typeof window.showDirectoryPicker !== "function") { showError("Chrome không hỗ trợ mở thư mục trong trang này."); return; }
  try {
    const directory = await window.showDirectoryPicker({ mode: "read" });
    await window.localWorkspace?.ready;
    let existing = null;
    for (const root of explorerFolders) if (await directory.isSameEntry(root.handle)) { existing = root; break; }
    const root = existing || { handle: directory, absolutePath: "" };
    await setExplorerFolders(add ? (existing ? explorerFolders : [...explorerFolders, root]) : [root]);
    await window.localWorkspace?.refreshFolderFiles(directory);
    window.localWorkspace?.scheduleSave();
    if (!window.localWorkspace?.isActive()) await savedFolder("put", root);
  } catch (error) { if (error.name !== "AbortError") showError("Không thể mở thư mục: " + error.message); }
}
document.getElementById("open-folder").addEventListener("click", () => chooseFolder(false));
document.getElementById("explorer-open-folder").addEventListener("click", () => chooseFolder(false));
document.getElementById("tree-add-folder").addEventListener("click", () => {
  hideTreeMenu(); chooseFolder(true);
});
document.getElementById("tree-folder-settings").addEventListener("click", () => {
  const target = treeContext; hideTreeMenu();
  if (target?.rootDescriptor) openRootPathDialog(target, false);
});
document.getElementById("tree-remove-root").addEventListener("click", async () => {
  const root = treeContext?.rootDescriptor;hideTreeMenu();if (!root) return;
  await setExplorerFolders(explorerFolders.filter(entry => entry !== root));window.localWorkspace?.scheduleSave();
});
function materialIcon(name, directory, expanded = false, root = false) {
  const m = window.materialIconMap;
  const lower = name.toLowerCase();
  let key;
  if (directory) {
    const names = root ? (expanded ? m.rootFoldersOpen : m.rootFolders) : (expanded ? m.foldersOpen : m.folders);
    key = names[lower] || (root ? (expanded ? m.rootOpen : m.root) : (expanded ? m.folderOpen : m.folder));
  } else {
    key = m.files[lower];
    if (!key) {
      const parts = lower.split(".");
      for (let i = 1; i < parts.length && !key; i++) key = m.extensions[parts.slice(i).join(".")];
    }
    key ||= m.file;
  }
  return "material-icons/" + (m.definitions[key] || m.definitions[directory ? m.folder : m.file]);
}
function createTreeEntry(handle, depth, path, expandInitially = false, parentHandle = null, refreshParent = null, rootDescriptor = explorerRootDescriptor) {
  const container = document.createElement("div");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tree-item";
  if (handle.kind === "file") { (window.__dinsideExplorerFiles ||= new WeakMap()).set(button, handle); button.draggable = true; }
  button.style.setProperty("--depth", depth);
  button.title = path;
  button.addEventListener("pointerdown", () => activateExplorerRoot(rootDescriptor));
  button.addEventListener("keydown", event => {
    if (event.isComposing || event.repeat || event.altKey || event.shiftKey) return;
    const modifier = event.ctrlKey || event.metaKey;
    let action;
    if (!modifier && event.key === "F2" && handle.kind === "file" && parentHandle) action = "tree-rename";
    else if (!modifier && event.key === "Delete" && parentHandle) action = "tree-delete";
    else if (modifier && event.key.toLowerCase() === "x" && handle.kind === "file" && parentHandle) action = "tree-cut";
    else if (modifier && event.key.toLowerCase() === "v" && cutTreeFile && handle.kind === "directory") action = "tree-paste";
    else if (!modifier && event.key === "Escape" && cutTreeFile) {
      event.preventDefault(); event.stopPropagation(); cutTreeFile = null;
      showStatus(language === "en" ? "Cut canceled" : "Đã hủy cắt");
      return;
    } else return;
    event.preventDefault();
    event.stopPropagation();
    const relativePath = depth ? path.slice(rootDescriptor.handle.name.length + 1) : "";
    activateExplorerRoot(rootDescriptor);
    treeContext = { handle, relativePath, parentHandle, refreshParent, rootDescriptor,
      refreshDirectory: handle.kind === "directory" ? () => container.refreshTreeDirectory() : null };
    if (action === "tree-paste") document.getElementById(action).disabled = false;
    document.getElementById(action).click();
  });
  const chevron = document.createElement("span");
  chevron.className = "tree-chevron";
  chevron.setAttribute("aria-hidden", "true");
  const icon = document.createElement("img");
  icon.className = "tree-icon";
  icon.alt = "";
  icon.src = materialIcon(handle.name, handle.kind === "directory", false, depth === 0);
  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = handle.name;
  button.append(chevron, icon, label);
  container.appendChild(button);
  if (handle.kind === "directory") {
    chevron.innerHTML = '<svg viewBox="0 0 16 16"><path d="M6 3.5 10.5 8 6 12.5"/></svg>';
    button.setAttribute("aria-expanded", "false");
    const children = document.createElement("div");
    children.hidden = true;
    container.appendChild(children);
    let loaded = false;
    let loading = false;
    async function expand(forceRefresh = false) {
      if (loading) return;
      const opening = forceRefresh || children.hidden;
      if (forceRefresh) { loaded = false; children.replaceChildren(); }
      if (opening && !loaded) {
        loading = true;
        try {
          const entries = [];
          for await (const entry of handle.values()) entries.push(entry);
          entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }) : a.kind === "directory" ? -1 : 1));
          for (const entry of entries) children.appendChild(createTreeEntry(entry, depth + 1, path + "\\" + entry.name, false, handle, () => expand(true), rootDescriptor));
          loaded = true;
        } catch (error) {
          showError("Không thể đọc thư mục: " + error.message);
          return;
        } finally { loading = false; }
      }
      children.hidden = !opening;
      icon.src = materialIcon(handle.name, true, opening, depth === 0);
      button.setAttribute("aria-expanded", String(opening));
    }
    button.addEventListener("click", () => expand());
    button.addEventListener("contextmenu", event => showTreeMenu(event, handle, depth ? path.slice(rootDescriptor.handle.name.length + 1) : "", () => expand(true), parentHandle, refreshParent, rootDescriptor));
    container.refreshTreeDirectory = () => expand(true);
    if (expandInitially) expand();
  } else {
    button.addEventListener("contextmenu", event => showTreeMenu(event, handle, path.slice(rootDescriptor.handle.name.length + 1), null, parentHandle, refreshParent, rootDescriptor));
    let pinRequested = false;
    button.addEventListener("dblclick", () => {
      pinRequested = true;
      if (activeTab && activeTab.handle === handle) { activeTab.preview = false; renderTabs(); }
    });
    button.addEventListener("click", async event => {
      if (event.detail > 1 || state.saving || explorerOpening) return;
      pinRequested = false;
      explorerOpening = true;
      clearTimeout(autoSaveTimer);
      try {
        const file = await handle.getFile();
        if (!await installContent(new Uint8Array(await file.arrayBuffer()), handle.name, "", handle, previewEnabled)) return;
        if (pinRequested && activeTab && activeTab.handle === handle) { activeTab.preview = false; renderTabs(); }
        elements.filePath.title = path;
        if (selectedTreeItem) selectedTreeItem.removeAttribute("aria-current");
        selectedTreeItem = button;
        button.setAttribute("aria-current", "true");
        button.focus();
      } catch (error) {
        showError("Không thể mở file: " + error.message);
        scheduleAutoSave();
      } finally { explorerOpening = false; }
    });
  }
  return container;
}

const pickerOptions = {
  id: "local-text-editor",
  multiple: false,
  types: [{
    description: "Văn bản",
    accept: { "text/plain": [".txt", ".md", ".log", ".csv", ".json"] }
  }, {
    description: "Ảnh",
    accept: { "image/png": [".png"], "image/jpeg": [".jpg", ".jpeg"], "image/gif": [".gif"], "image/webp": [".webp"], "image/bmp": [".bmp"], "image/x-icon": [".ico"], "image/avif": [".avif"], "image/svg+xml": [".svg"] }
  }],
  excludeAcceptAllOption: false
};

function showStatus(message, kind = "") {
  currentStatus = message;
  elements.status.textContent = tr(message);
  elements.status.className = "status" + (kind ? " " + kind : "");
}
function showError(message) {
  currentError = message;
  elements.notice.textContent = tr(message);
  elements.notice.hidden = false;
  showStatus("Lỗi", "error");
}
function clearError() {
  currentError = "";
  elements.notice.hidden = true;
  elements.notice.textContent = "";
}
function normalizeLineEndings(text) {
  return text.replace(/\r\n?|\n/g, "\n");
}
function detectLineEnding(text) {
  if (text.includes("\r\n")) return "\r\n";
  if (text.includes("\r")) return "\r";
  return "\n";
}
async function hashBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function decodeBytes(bytes) {
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(bom ? 3 : 0));
  return { text: normalizeLineEndings(decoded), eol: detectLineEnding(decoded), bom };
}
function encodeBytes(text) {
  const normalized = normalizeLineEndings(text);
  const encoded = new TextEncoder().encode(normalized.replace(/\n/g, state.eol));
  if (!state.bom) return encoded;
  const withBom = new Uint8Array(encoded.length + 3);
  withBom.set([0xef, 0xbb, 0xbf]);
  withBom.set(encoded, 3);
  return withBom;
}
function refresh() {
  const value = editor.getValue();
  const isImage = activeTab?.kind === "image";
  state.dirty = !isImage && !!state.name && value !== state.cleanText;
  editor.updateOptions({ readOnly: state.saving || !state.name || isImage });
  elements.save.disabled = !state.name || state.saving || isImage;
  const directSave = state.handle || window.localFileAccess?.canSave(state.sourceUrl);
  elements.save.firstChild.textContent = language === "en" ? (directSave ? "Save " : "Save (choose file) ") : (directSave ? "Lưu " : "Lưu (chọn file) ");
  const lineCount = value ? value.split("\n").length : 1;
  elements.stats.textContent = language === "en"
    ? `${lineCount} ${lineCount === 1 ? "line" : "lines"} · ${value.length} ${value.length === 1 ? "character" : "characters"}`
    : `${lineCount} dòng · ${value.length} ký tự`;
  document.title = (state.dirty ? "* " : "") + (state.name || "Local Text Editor") + " — Local Text Editor";
  if (state.dirty && elements.notice.hidden) showStatus("Chưa lưu", "warn");
  snapshotTab();
  renderTabs();
  updateEditorStatus();
  window.localFileSync?.updateBanner();
} 
async function installContent(bytes, name, sourceUrl, handle, preview = false) {
  if (state.saving) return false;
  for (const tab of tabs) {
    const same = sourceUrl && tab.sourceUrl === sourceUrl ||
      (handle && tab.handle && await handle.isSameEntry(tab.handle));
    if (same) {
      if (tab.kind === "image") {
        if (tab.imageUrl) URL.revokeObjectURL(tab.imageUrl);
        tab.imageUrl = URL.createObjectURL(new Blob([bytes], { type: imageType(name) }));
      }
      tab.groups.add(activeGroup); if (!preview) tab.preview = false; activateTab(tab); renderTabs(); scheduleAutoSave(); return true;
    }
  }
  const type = imageType(name);
  const decoded = type ? { text: "", eol: "\n", bom: false } : decodeBytes(bytes);
  const hash = await hashBytes(bytes);
  if (!multiTabEnabled && tabs.length) {
    snapshotTab();
    if (tabs.some(tab => tab.dirty) && !confirm(language === "en" ? "Some files have unsaved changes. Discard them and open another file?" : "Có file chưa lưu. Bỏ thay đổi và mở file khác?")) { scheduleAutoSave(); return false; }
    clearTimeout(autoSaveTimer);
    switchingModel = true; setEditorModel(null); switchingModel = false;
    for (const tab of tabs) disposeTab(tab);
    tabs.splice(0);
    activeTab = null;
  }
  snapshotTab();
  if (preview && multiTabEnabled) {
    const oldPreview = tabs.find(tab => tab.preview && !tab.dirty && tab.groups.has(activeGroup));
    if (oldPreview) closeTab(oldPreview);
  }
  snapshotTab();
  clearTimeout(autoSaveTimer);
  activeTab = { name, kind: type ? "image" : "text", imageUrl: type ? URL.createObjectURL(new Blob([bytes], { type })) : "", groups: new Set([activeGroup]), preview: preview && multiTabEnabled, model: monaco.editor.createModel(decoded.text, languageForFile(name)) };
  activeTab.model.updateOptions(indentSettings);
  tabs.push(activeTab);
  groupActive[activeGroup] = activeTab;
  state.handle = handle;
  state.sourceUrl = sourceUrl;
  state.name = name;
  state.baselineHash = hash;
  state.eol = decoded.eol;
  state.bom = decoded.bom;
  state.cleanText = decoded.text;

  switchingModel = true; setEditorModel(activeTab.model); switchingModel = false;
  elements.filePath.textContent = name;
  elements.filePath.title = sourceUrl ? displayFileUrl(sourceUrl) : name;
  clearError();
  refresh();
  showStatus(handle || window.localFileAccess?.canSave(sourceUrl) ? "Đã mở" : "Chọn file gốc khi lưu lần đầu");
  editor.focus();
  return true;
}
function displayFileUrl(url) {
  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname);
    return path.replace(/^\/([A-Za-z]:)/, "$1").replace(/\//g, "\\");
  } catch {
    return url;
  }
}
function nameFromFileUrl(url) {
  const parts = new URL(url).pathname.split("/");
  return decodeURIComponent(parts[parts.length - 1]);
}
async function openByPicker() {
  if (state.saving) return;
  if (typeof window.showOpenFilePicker !== "function") {
    showError("Chrome không hỗ trợ File System Access API trong trang này.");
    return;
  }
  clearTimeout(autoSaveTimer);
  try {
    // Phải gọi ngay sau thao tác nhấp/phím của người dùng.
    const [handle] = await window.showOpenFilePicker(pickerOptions);
    const file = await handle.getFile();
    await installContent(new Uint8Array(await file.arrayBuffer()), handle.name, "", handle);
  } catch (error) {
    if (error.name !== "AbortError") showError("Không thể mở file: " + error.message);
    else scheduleAutoSave();
  }
}
async function openFromFileUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:" || !parsed.pathname.toLowerCase().endsWith(".txt")) {
      throw new Error("Chỉ hỗ trợ đường dẫn file .txt.");
    }
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("Không đọc được file (HTTP " + response.status + ").");
    const bytes = new Uint8Array(await response.arrayBuffer());
    await window.localFileAccess?.bind(url, await hashBytes(bytes));
    await installContent(bytes, nameFromFileUrl(url), url, null);
  } catch (error) {
    showError("Không đọc được file từ đường dẫn Chrome. Bật 'Allow access to file URLs' trong chrome://extensions, hoặc nhấn 'Mở file'. Chi tiết: " + error.message);
  }
}
function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  if (window.localWorkspace?.restoring) return;
  if (!elements.autosave.checked || !state.dirty || state.saving) return;
  if (window.localFileSync?.isBlocked(activeTab)) return;
  if (!state.handle && !window.localFileAccess?.canSave(state.sourceUrl)) {
    showStatus("Nhấn Lưu để cấp quyền tự động lưu", "warn");
    return;
  }
  autoSaveTimer = setTimeout(() => saveFile(true), 1000);
}
async function saveFile(automatic = false, retry = 0) {
  if (!state.name || state.saving || activeTab?.kind === "image") return;
  clearTimeout(autoSaveTimer);
  state.saving = true;
  for (const group of editorGroups) group.editor.updateOptions({ readOnly: true });
  elements.save.disabled = true;
  elements.open.disabled = true;
  clearError();

  let saved = false;
  let permissionNeeded = false;
  let retrySave = false;
  try {
    if (window.localFileSync && activeTab) {
      const checked = await window.localFileSync.beforeSave(activeTab);
      if (checked === "conflict" || checked === "unavailable") {
        if (!automatic) showStatus(language === "en" ? "Not saved: review the file change notice" : "Chưa lưu: xem thông báo thay đổi file", "warn");
        return;
      }
      if (checked === "clean" && !state.dirty) { saved = true; showStatus("Đã lưu", "ok"); return; }
    }
    let handle = state.handle;
    if (!handle && state.sourceUrl && window.localFileAccess) {
      const textToSave = editor.getValue();
      const result = await window.localFileAccess.save(state.sourceUrl, state.baselineHash, encodeBytes(textToSave));
      if (result) {
        state.baselineHash = result.hash; state.cleanText = textToSave; saved = true;
        refresh();
        if (!state.dirty) showStatus(automatic ? "Đã tự động lưu" : "Đã lưu", "ok");
        return;
      }
    }
    if (!handle) {
      if (automatic) { permissionNeeded = true; return; }
      if (typeof window.showOpenFilePicker !== "function") throw new Error("Chrome không hỗ trợ File System Access API trong trang này.");
      // Chrome không cho extension ghi file:// mà chưa được người dùng cấp quyền.
      // Người dùng chọn đúng file gốc một lần, sau đó Ctrl+S ghi trực tiếp.
      const selected = await window.showOpenFilePicker(pickerOptions);
      handle = selected[0];
      if (handle.name.toLowerCase() !== state.name.toLowerCase()) {
        throw new Error(tr("Hãy chọn đúng file gốc '" + state.name + "' để tránh ghi nhầm."));
      }
    }

    if (automatic && await handle.queryPermission({ mode: "readwrite" }) !== "granted") {
      permissionNeeded = true;
      return;
    }

    const diskFile = await handle.getFile();
    const diskHash = await hashBytes(new Uint8Array(await diskFile.arrayBuffer()));
    if (diskHash !== state.baselineHash) {
      throw Object.assign(new Error(tr("Nội dung file trên ổ đĩa đã thay đổi. Không ghi đè. Hãy dùng 'Mở file' để tải bản mới nhất.")), { code: "FILE_CHANGED" });
    }

    const textToSave = editor.getValue();
    const bytes = encodeBytes(textToSave);
    const writer = await handle.createWritable();
    try {
      await writer.write(bytes);
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => {});
      throw error;
    }

    state.handle = handle;
    state.baselineHash = await hashBytes(bytes);
    state.cleanText = textToSave;
    saved = true;
    refresh();
    if (!state.dirty) showStatus(automatic ? "Đã tự động lưu" : "Đã lưu", "ok");
  } catch (error) {
    if (error.code === "FILE_CHANGED" && window.localFileSync && activeTab) {
      const result = await window.localFileSync.onSaveConflict(activeTab);
      retrySave = retry < 1 && (result === "retry" || result === "unchanged");
      if (result === "clean") { saved = true; showStatus("Đã lưu", "ok"); }
      else if (!automatic && !retrySave) showStatus(language === "en" ? "Not saved: review the file change notice" : "Chưa lưu: xem thông báo thay đổi file", "warn");
    } else if (error.name !== "AbortError") showError("Không thể lưu: " + error.message);
  } finally {
    state.saving = false;
    for (const group of editorGroups) group.editor.updateOptions({ readOnly: !group.editor.getModel() });
    elements.open.disabled = false;
    refresh();
    if (permissionNeeded) showStatus("Nhấn Lưu để cấp quyền tự động lưu", "warn");
    if (retrySave) queueMicrotask(() => saveFile(automatic, retry + 1));
    else if (saved && state.dirty) scheduleAutoSave();
  }
}

const fileMenuButton = document.getElementById("file-menu-btn");
const fileMenu = document.getElementById("file-menu-options");
function closeFileMenu(restoreFocus = false) {
  fileMenu.hidden = true;
  fileMenuButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) fileMenuButton.focus();
}
fileMenuButton.addEventListener("click", () => {
  if (!fileMenu.hidden) { closeFileMenu(); return; }
  fileMenu.hidden = false;
  fileMenuButton.setAttribute("aria-expanded", "true");
  elements.open.focus();
});
fileMenuButton.addEventListener("keydown", event => {
  if (event.key === "ArrowDown" && fileMenu.hidden) { event.preventDefault(); fileMenuButton.click(); }
});
fileMenu.addEventListener("keydown", event => {
  if (event.key === "Escape") { event.preventDefault(); closeFileMenu(true); }
  else if (event.key === "Tab") closeFileMenu();
  else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const items = [elements.open, elements.save].filter(item => !item.disabled);
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
  }
});
document.addEventListener("pointerdown", event => {
  if (!event.target.closest(".file-menu")) closeFileMenu();
});
elements.open.addEventListener("click", () => { closeFileMenu(); openByPicker(); });
elements.save.addEventListener("click", () => { closeFileMenu(); saveFile(); });
const editMenuButton = document.getElementById("edit-menu-btn");
const editMenu = document.getElementById("edit-menu-options");
function closeEditMenu(restoreFocus = false) {
  editMenu.hidden = true;
  editMenuButton.setAttribute("aria-expanded", "false");
  if (restoreFocus) editMenuButton.focus();
}
editMenuButton.addEventListener("click", () => {
  closeFileMenu();
  if (!editMenu.hidden) { closeEditMenu(); return; }
  editMenu.querySelectorAll('[role="menuitem"]').forEach(item => { item.disabled = !state.name; });
  editMenu.hidden = false;
  editMenuButton.setAttribute("aria-expanded", "true");
  (editMenu.querySelector('[role="menuitem"]:not(:disabled)') || editMenuButton).focus();
});
editMenuButton.addEventListener("keydown", event => {
  if (event.key === "ArrowDown" && editMenu.hidden) { event.preventDefault(); editMenuButton.click(); }
});
editMenu.addEventListener("keydown", event => {
  if (event.key === "Escape") { event.preventDefault(); closeEditMenu(true); return; }
  if (event.key === "Tab") { closeEditMenu(); return; }
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const items = Array.from(editMenu.querySelectorAll('[role="menuitem"]:not(:disabled)'));
  if (!items.length) return;
  event.preventDefault();
  const step = event.key === "ArrowDown" ? 1 : -1;
  items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
});
document.addEventListener("pointerdown", event => { if (!event.target.closest(".edit-top-menu")) closeEditMenu(); });
editMenu.addEventListener("click", async event => {
  const item = event.target.closest('[data-edit-action]');
  if (!item || item.disabled || !state.name) return;
  const commands = { undo: "undo", redo: "redo", cut: "editor.action.clipboardCutAction", copy: "editor.action.clipboardCopyAction", paste: "editor.action.clipboardPasteAction", find: "actions.find", replace: "editor.action.startFindReplaceAction", comment: "editor.action.commentLine", blockComment: "editor.action.blockComment" };
  const command = commands[item.dataset.editAction];
  closeEditMenu();
  editor.focus();
  try {
    if (["cut", "copy", "paste"].includes(item.dataset.editAction)) await editClipboard(item.dataset.editAction);
    else if (item.dataset.editAction === "undo" || item.dataset.editAction === "redo") editor.trigger("edit-menu", command, null);
    else {
      const action = editor.getAction(command);
      if (!action || !action.isSupported()) throw new Error(language === "en" ? "This action is not available for the current file." : "Thao tác này không khả dụng cho file hiện tại.");
      await action.run();
    }
  } catch (error) { showError((language === "en" ? "Could not perform action: " : "Không thể thực hiện: ") + error.message); }
});
async function editClipboard(action) {
  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) return;
  const version = model.getVersionId();
  if (action === "paste") {
    const text = await navigator.clipboard.readText();
    if (editor.getModel() !== model || model.getVersionId() !== version) return;
    editor.pushUndoStop();
    editor.executeEdits("edit-menu", [{ range: selection, text, forceMoveMarkers: true }]);
    editor.pushUndoStop();
    return;
  }
  const empty = selection.isEmpty();
  const line = selection.startLineNumber;
  const text = empty ? model.getLineContent(line) + "\n" : model.getValueInRange(selection);
  await navigator.clipboard.writeText(text);
  if (action !== "cut" || editor.getModel() !== model || model.getVersionId() !== version) return;
  let range = selection;
  if (empty) {
    range = line < model.getLineCount()
      ? new monaco.Range(line, 1, line + 1, 1)
      : line > 1 ? new monaco.Range(line - 1, model.getLineMaxColumn(line - 1), line, model.getLineMaxColumn(line))
        : model.getFullModelRange();
  }
  editor.pushUndoStop();
  editor.executeEdits("edit-menu", [{ range, text: "", forceMoveMarkers: true }]);
  editor.pushUndoStop();
}
document.getElementById("shortcuts-btn").addEventListener("click", () => document.getElementById("shortcuts-dialog").showModal());
document.getElementById("shortcuts-close").addEventListener("click", () => document.getElementById("shortcuts-dialog").close());
const settingsDialog = document.getElementById("settings-dialog");
document.getElementById("settings-btn").addEventListener("click", () => {
  document.getElementById("settings-autosave").checked = elements.autosave.checked;
  document.getElementById("settings-wrap").checked = elements.wrap.checked;
  document.getElementById("settings-tabs").checked = multiTabEnabled;
  settingsDialog.showModal();
});
settingsDialog.addEventListener("close", () => cursorBlinkingDropdown.close());
document.getElementById("settings-tabs").addEventListener("change", event => {
  const enabled = event.target.checked;
  if (!enabled && editorGroups.length > 1) { event.target.checked = true; showError(language === "en" ? "Close the other editor groups before disabling tabs." : "Hãy đóng các nhóm editor khác trước khi tắt nhiều tab."); return; }
  if (!enabled && tabs.length > 1) {
    if (state.saving) { event.target.checked = true; return; }
    snapshotTab();
    const others = tabs.filter(tab => tab !== activeTab);
    if (others.some(tab => tab.dirty) && !confirm(language === "en" ? "Other tabs have unsaved changes. Close them and discard those changes?" : "Các tab khác có thay đổi chưa lưu. Đóng và bỏ các thay đổi đó?")) { event.target.checked = true; return; }
    for (const tab of others) { tabs.splice(tabs.indexOf(tab), 1); disposeTab(tab); }
    renderTabs();
  }
  multiTabChanged = true;
  applyMultiTab(enabled);
  persistEditorSetting(MULTI_TAB_KEY, enabled).catch(console.error);
});
document.getElementById("settings-autosave").addEventListener("change", event => {
  elements.autosave.checked = event.target.checked;
  elements.autosave.dispatchEvent(new Event("change"));
});
document.getElementById("settings-wrap").addEventListener("change", event => {
  elements.wrap.checked = event.target.checked;
  elements.wrap.dispatchEvent(new Event("change"));
});
document.getElementById("settings-close").addEventListener("click", () => settingsDialog.close());
document.getElementById("settings-shortcuts").addEventListener("click", () => {
  settingsDialog.close();
  document.getElementById("shortcuts-dialog").showModal();
});
settingsDialog.addEventListener("click", event => {
  if (event.target !== settingsDialog) return;
  const rect = settingsDialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) settingsDialog.close();
});
document.getElementById("shortcuts-dialog").addEventListener("click", event => {
  if (event.target !== event.currentTarget) return;
  const rect = event.currentTarget.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.currentTarget.close();
});
elements.autosave.addEventListener("change", () => {
  autoSaveChanged = true;
  persistEditorSetting(AUTOSAVE_KEY, elements.autosave.checked).catch(console.error);
  scheduleAutoSave();
});
function applyWrap(enabled) {
  elements.wrap.checked = enabled;
  for (const group of editorGroups) group.editor.updateOptions({ wordWrap: enabled ? "on" : "off" });
}
elements.wrap.addEventListener("change", () => {
  wrapChanged = true;
  applyWrap(elements.wrap.checked);
  persistEditorSetting(WRAP_KEY, elements.wrap.checked).catch(console.error);
});
document.addEventListener("keydown", (event) => {
  if (event.target instanceof Element && event.target.closest("#terminal-panel")) return;
  if (document.querySelector("dialog[open]")) return;
  if (document.getElementById("shortcuts-dialog").open || settingsDialog.open || document.getElementById("create-dialog").open || document.getElementById("delete-dialog").open || document.getElementById("root-path-dialog").open || document.getElementById("rename-dialog").open || indentDialog.open) return;
  if (event.isComposing || event.repeat) return;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
  if (event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveFile();
  }
  if (event.key.toLowerCase() === "o") {
    event.preventDefault();
    openByPicker();
  }
});
window.addEventListener("beforeunload", (event) => {
  if (state.dirty || tabs.some(tab => tab.dirty)) {
    event.preventDefault();
    event.returnValue = "";
  }
});

refresh();
// Workspace startup opens a file URL after restoring the selected workspace.
