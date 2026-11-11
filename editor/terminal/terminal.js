"use strict";
(() => {
  const panel = document.getElementById("terminal-panel");
  const area = panel.parentElement;
  const tabs = document.getElementById("terminal-tabs");
  const screens = document.getElementById("terminal-screens");
  const status = document.getElementById("terminal-status");
  const start = document.getElementById("terminal-start");
  const more = document.getElementById("terminal-more");
  const menu = document.getElementById("terminal-menu");
  const splitButton = document.getElementById("terminal-split");
  const maximizeButton = document.getElementById("terminal-maximize");
  const topButton = document.getElementById("terminal-menu-btn");
  const topMenu = document.getElementById("terminal-top-options");
  const sessions = [];
  let active = null;
  let split = false;
  let maximized = false;
  let sequence = 0;
  let lastDirectory = "";
  const en = () => document.documentElement.lang === "en";
  const ready = chrome.storage.local.get("localTextEditorTerminalDirectory").then(value => {
    lastDirectory = typeof value.localTextEditorTerminalDirectory === "string" ? value.localTextEditorTerminalDirectory : "";
  }).catch(console.error);
  function theme() {
    const mode = document.documentElement.dataset.theme;
    const dark = mode === "dark" || (mode !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    return dark ? { background: "#191a1b", foreground: "#e8e8ea", cursor: "#e8e8ea" } : { background: "#f5f6f8", foreground: "#242832", cursor: "#242832" };
  }
  function remember(value, chosen = false) {
    if (!value) return;
    lastDirectory = value;
    chrome.storage.local.set({ localTextEditorTerminalDirectory: value }).catch(console.error);
    const name = value.replace(/[\\/]+$/, "").split(/[\\/]/).pop();
    if (chosen && explorerRoot && name?.toLocaleLowerCase() === explorerRoot.name.toLocaleLowerCase()) {
      explorerRootPath = value;
      savedFolder("put", { handle: explorerRoot, absolutePath: value }).catch(console.error);
    }
  }
  function resize(session) {
    if (panel.hidden || session.closed || session.screen.hidden || !session.screen.clientWidth || !session.screen.clientHeight) return;
    session.fit.fit();
    if (session.port && session.running) session.port.postMessage({ type: "resize", cols: session.term.cols, rows: session.term.rows });
  }
  function refresh() {
    tabs.replaceChildren();
    for (const session of sessions) {
      const tab = document.createElement("button");
      tab.type = "button"; tab.className = "terminal-tab"; tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(session === active));
      tab.textContent = "pwsh " + session.id;
      tab.title = session.directory || (en() ? "User folder" : "Thư mục người dùng");
      tab.addEventListener("click", () => select(session));
      tabs.appendChild(tab);
    }
    const other = split && sessions.length > 1 ? sessions.find(s => s !== active) : null;
    for (const session of sessions) session.screen.hidden = session !== active && session !== other;
    status.textContent = active?.status || "";
    start.hidden = !active || active.starting || active.choosing || active.restarting || (active.running && !active.directoryChanged);
    start.textContent = active?.directoryChanged && active.running ? (en() ? "Restart here" : "Mở lại tại đây") : (en() ? "Start PowerShell" : "Mở PowerShell");
    splitButton.setAttribute("aria-pressed", String(split));
    maximizeButton.setAttribute("aria-pressed", String(maximized));
    const labels = { "terminal-new": ["Terminal mới", "New terminal"], "terminal-split": ["Chia terminal", "Split terminal"], "terminal-kill": ["Xóa terminal", "Kill terminal"], "terminal-more": ["Tùy chọn terminal", "Terminal options"], "terminal-maximize": [maximized ? "Thu nhỏ terminal" : "Phóng to terminal", maximized ? "Restore terminal" : "Maximize terminal"], "terminal-close": ["Ẩn terminal", "Hide terminal"] };
    Object.entries(labels).forEach(([id, texts]) => { const el = document.getElementById(id); el.title = texts[en() ? 1 : 0]; el.setAttribute("aria-label", el.title); });
    document.getElementById("terminal-browse").textContent = en() ? "Choose folder" : "Chọn thư mục";
    document.getElementById("terminal-clear").textContent = en() ? "Clear terminal" : "Xóa màn hình";
    requestAnimationFrame(() => sessions.forEach(resize));
  }
  function select(session) {
    if (session.closed) return;
    active = session; refresh();
    if (!panel.hidden) requestAnimationFrame(() => session.term.focus());
  }
  function connect(session) {
    if (typeof chrome.runtime.connectNative !== "function") throw new Error(en() ? "Reload the extension in chrome://extensions to enable the terminal." : "Hãy reload extension trong chrome://extensions để bật terminal.");
    if (session.port) return session.port;
    const port = chrome.runtime.connectNative("dinkit.editor");
    session.port = port;
    port.onMessage.addListener(message => {
      if (session.closed || session.port !== port) return;
      if (message.type === "data") session.term.write(message.data);
      else if (message.type === "started") {
        session.running = true; session.starting = false; session.restarting = false; session.directoryChanged = false;
        session.activeDirectory = message.cwd; session.directory = message.cwd; session.status = "";
        remember(message.cwd); refresh(); resize(session); if (session === active && !panel.hidden) session.term.focus();
      } else if (message.type === "directoryChosen") {
        session.choosing = false;
        if (message.cwd) { session.directory = message.cwd; remember(message.cwd, true); session.directoryChanged = session.running && message.cwd.toLocaleLowerCase() !== session.activeDirectory.toLocaleLowerCase(); }
        session.status = session.directoryChanged ? (en() ? "Restart the terminal to use the selected folder." : "Mở lại terminal để dùng thư mục vừa chọn.") : ""; refresh();
      } else if (message.type === "exit") {
        session.running = false; session.starting = false;
        if (session.restarting) { session.restarting = false; session.term.clear(); startSession(session); }
        else { session.status = en() ? `PowerShell exited (${message.code})` : `PowerShell đã kết thúc (${message.code})`; refresh(); }
      } else if (message.type === "error") {
        session.starting = false; session.choosing = false; session.restarting = false; session.status = message.message; refresh();
      }
    });
    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      if (session.closed || session.port !== port) return;
      session.port = null; session.running = false; session.starting = false; session.choosing = false; session.restarting = false;
      session.status = error ? (en() ? "Terminal host unavailable: " : "Không kết nối được terminal host: ") + error.message : (en() ? "Terminal disconnected." : "Terminal đã ngắt kết nối."); refresh();
    });
    return port;
  }
  function startSession(session) {
    if (session.closed || session.running || session.starting || session.choosing) return;
    session.starting = true; session.status = en() ? "Starting PowerShell…" : "Đang mở PowerShell…"; refresh();
    try { resize(session); connect(session).postMessage({ type: "start", cwd: session.directory, cols: session.term.cols, rows: session.term.rows }); }
    catch (error) { session.starting = false; session.status = error.message; refresh(); }
  }
  function createSession(directory) {
    const screen = document.createElement("div"); screen.className = "terminal-screen"; screens.appendChild(screen);
    const term = new LocalTerminal.Terminal({ cursorBlink: true, fontFamily: '"MesloLGS Nerd Font Mono", "Cascadia Code", Consolas, monospace', fontSize: 14, scrollback: 5000, minimumContrastRatio: 4.5, theme: theme() });
    const fit = new LocalTerminal.FitAddon(); term.loadAddon(fit); term.open(screen);
    const session = { id: ++sequence, screen, term, fit, directory, activeDirectory: "", port: null, running: false, starting: false, choosing: false, restarting: false, directoryChanged: false, closed: false, status: "" };
    session.observer = new ResizeObserver(() => resize(session)); session.observer.observe(screen);
    screen.addEventListener("pointerdown", () => { if (active !== session) select(session); });
    term.onData(data => { if (session.port && session.running) session.port.postMessage({ type: "input", data }); });
    sessions.push(session); active = session; refresh(); requestAnimationFrame(() => startSession(session));
    return session;
  }
  function kill(session) {
    if (!session) return;
    session.closed = true; session.observer.disconnect();
    if (session.port) { session.port.disconnect(); session.port = null; }
    session.term.dispose(); session.screen.remove();
    const index = sessions.indexOf(session); if (index >= 0) sessions.splice(index, 1);
    if (active === session) active = sessions[Math.min(index, sessions.length - 1)] || null;
    if (sessions.length < 2) split = false;
    if (!sessions.length) { panel.hidden = true; maximized = false; panel.classList.remove("maximized"); area.classList.remove("terminal-maximized"); }
    refresh(); if (active && !panel.hidden) active.term.focus();
  }
  function closeMenu() { menu.hidden = true; more.setAttribute("aria-expanded", "false"); }
  function closeTopMenu(restoreFocus = false) {
    topMenu.hidden = true; topButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) topButton.focus();
  }
  topButton.addEventListener("click", () => {
    closeFileMenu();
    if (!topMenu.hidden) { closeTopMenu(); return; }
    topMenu.hidden = false; topButton.setAttribute("aria-expanded", "true");
    topMenu.querySelector('[role="menuitem"]').focus();
  });
  topButton.addEventListener("keydown", event => {
    if (event.key === "ArrowDown" && topMenu.hidden) { event.preventDefault(); topButton.click(); }
  });
  topMenu.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); closeTopMenu(true); return; }
    if (event.key === "Tab") { closeTopMenu(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(topMenu.querySelectorAll('[role="menuitem"]'));
    const step = event.key === "ArrowDown" ? 1 : -1;
    items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
  });
  document.addEventListener("pointerdown", event => { if (!event.target.closest(".terminal-top-menu")) closeTopMenu(); });
  async function showPanel() {
    panel.hidden = false;
    await ready;
  }
  document.getElementById("terminal-top-open").addEventListener("click", async () => {
    closeTopMenu(); await showPanel();
    if (!sessions.length) createSession(explorerRoot ? (explorerRootPath || "") : lastDirectory);
    else { refresh(); requestAnimationFrame(() => active?.term.focus()); }
  });
  document.getElementById("terminal-top-new").addEventListener("click", async () => {
    closeTopMenu(); await showPanel();
    createSession(active?.directory || (explorerRoot ? explorerRootPath : lastDirectory));
  });
  document.getElementById("terminal-top-split").addEventListener("click", async () => {
    closeTopMenu(); await showPanel();
    if (!sessions.length) createSession(explorerRoot ? (explorerRootPath || "") : lastDirectory);
    if (sessions.length < 2) createSession(active?.directory || explorerRootPath || lastDirectory);
    split = true; refresh();
  });
  new MutationObserver(() => { sessions.forEach(s => { s.term.options.theme = theme(); }); refresh(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "lang"] });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => sessions.forEach(s => { s.term.options.theme = theme(); }));
  document.getElementById("terminal-new").addEventListener("click", () => createSession(active?.directory || explorerRootPath || lastDirectory));
  splitButton.addEventListener("click", () => {
    if (!split && sessions.length < 2) createSession(active?.directory || explorerRootPath || lastDirectory);
    split = !split; refresh();
  });
  document.getElementById("terminal-kill").addEventListener("click", () => kill(active));
  document.getElementById("terminal-close").addEventListener("click", () => { panel.hidden = true; maximized = false; panel.classList.remove("maximized"); area.classList.remove("terminal-maximized"); closeMenu(); refresh(); });
  maximizeButton.addEventListener("click", () => { maximized = !maximized; panel.classList.toggle("maximized", maximized); area.classList.toggle("terminal-maximized", maximized); refresh(); });
  more.addEventListener("click", () => { menu.hidden = !menu.hidden; more.setAttribute("aria-expanded", String(!menu.hidden)); if (!menu.hidden) document.getElementById("terminal-browse").focus(); });
  document.addEventListener("pointerdown", event => { if (!event.target.closest(".terminal-more-wrap")) closeMenu(); });
  menu.addEventListener("keydown", event => { if (event.key === "Escape") { event.preventDefault(); closeMenu(); more.focus(); } });
  document.getElementById("terminal-clear").addEventListener("click", () => { closeMenu(); active?.term.clear(); active?.term.focus(); });
  document.getElementById("terminal-browse").addEventListener("click", () => {
    closeMenu(); const session = active;
    if (!session || session.starting || session.choosing || session.restarting) return;
    session.choosing = true; session.status = en() ? "Choose a folder in Windows…" : "Chọn thư mục trong cửa sổ Windows…"; refresh();
    try { connect(session).postMessage({ type: "chooseDirectory" }); }
    catch (error) { session.choosing = false; session.status = error.message; refresh(); }
  });
  start.addEventListener("click", () => {
    const session = active; if (!session) return;
    if (session.running && session.directoryChanged) {
      session.restarting = true; session.status = en() ? "Restarting…" : "Đang mở lại…"; refresh();
      try { session.port.postMessage({ type: "stop" }); } catch (error) { session.restarting = false; session.status = error.message; refresh(); }
    } else startSession(session);
  });
  refresh();
})();
