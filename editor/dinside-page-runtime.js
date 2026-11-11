(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // integrations/local-text-editor/context-bridge.js
  var require_context_bridge = __commonJS({
    "integrations/local-text-editor/context-bridge.js"(exports, module) {
      (() => {
        "use strict";
        const DINSIDE_ID = "lbnijnbomgbpkdjehldjhpdclmpifkkc";
        const TYPE = "DINSIDE_LOCAL_EDITOR_CONTEXT";
        const MAX_TEXT = 5e4, MAX_SELECTION = 12e3, MAX_VIEWPORT = 8e3;
        function capture({ editor: editor2, activeTab: activeTab2, state: state2, location: location2, innerWidth: innerWidth2, innerHeight: innerHeight2 }, kind = "snapshot") {
          const model = editor2?.getModel();
          if (!model || model.isDisposed() || !activeTab2) {
            const pageState2 = {
              url: location2.href,
              title: "Local Text Editor",
              textLength: 0,
              revision: 0,
              dirty: false,
              localEditor: { status: "empty" },
              selectedText: "",
              selection: null,
              selectionDragging: false
            };
            return kind === "state" ? { pageState: pageState2 } : { pageState: pageState2, context: null, viewport: null };
          }
          const name = activeTab2.name || state2.name || "Untitled";
          const id = model.uri.toString(), revision = model.getVersionId();
          const language = model.getLanguageId(), totalChars = model.getValueLength();
          const ranges = (editor2.getVisibleRanges() || []).slice(0, 40);
          const selected = (editor2.getSelections() || []).filter((range) => !range.isEmpty()).slice(0, 20);
          let selectedText = "";
          for (const range of selected) {
            if (selectedText.length >= MAX_SELECTION) break;
            selectedText += (selectedText ? "\n\n" : "") + model.getValueInRange(range).slice(0, MAX_SELECTION - selectedText.length);
          }
          const selection = selectedText ? {
            text: selectedText,
            title: name,
            url: location2.href,
            sourceRef: `${name}:${selected[0].startLineNumber}-${selected.at(-1).endLineNumber}`,
            domContext: { section: name, element: "code", block: `Language: ${language}`, blockId: `local-editor:${id}` }
          } : null;
          const info = {
            id,
            name,
            language,
            revision,
            dirty: state2.dirty === true,
            lineCount: model.getLineCount(),
            textLength: totalChars,
            cursor: editor2.getPosition()
          };
          const pageState = {
            url: location2.href,
            title: `${name} \u2014 Local Text Editor`,
            textLength: totalChars,
            revision,
            dirty: true,
            localEditor: info,
            selectedText,
            selection,
            selectionDragging: false,
            articleCount: 0,
            headingCount: 1,
            linkCount: 0
          };
          if (kind === "state") return { pageState };
          const end = model.getPositionAt(Math.min(totalChars, MAX_TEXT));
          const text = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: end.lineNumber,
            endColumn: end.column
          });
          const metadata = [
            `File: ${name}`,
            `Language: ${language}`,
            `Lines: ${info.lineCount}`,
            `Unsaved changes: ${info.dirty ? "yes" : "no"}`
          ].join("\n");
          const context = {
            url: location2.href,
            title: pageState.title,
            text: `${metadata}

${text}`,
            textTruncated: totalChars > MAX_TEXT,
            extractor: "local-text-editor",
            localEditor: info,
            links: [],
            images: [],
            buttons: [],
            semanticItems: [],
            capturedAt: Date.now()
          };
          let used = 0;
          const blocks = [];
          for (const range of ranges) {
            if (used >= MAX_VIEWPORT) break;
            const visible = model.getValueInRange(range).slice(0, MAX_VIEWPORT - used);
            if (visible) {
              blocks.push({ tag: "code", text: visible });
              used += visible.length;
            }
          }
          const viewport = {
            url: location2.href,
            title: pageState.title,
            localEditor: info,
            scrollY: Math.round(editor2.getScrollTop()),
            scrollPercent: Math.round(100 * editor2.getScrollTop() / Math.max(1, editor2.getScrollHeight() - editor2.getLayoutInfo().height)),
            viewportWidth: innerWidth2,
            viewportHeight: innerHeight2,
            headings: [name, language],
            blocks,
            selectedText,
            images: [],
            videos: [],
            capturedAt: Date.now()
          };
          return { pageState, context, viewport };
        }
        function install2({ chrome: chrome2, getSource: getSource2, actions: actions2 = {}, eventTarget = globalThis }) {
          let disposed = false, ownTabId = null, listening = false;
          const pending = /* @__PURE__ */ new Set();
          const ownTab = chrome2.tabs.getCurrent();
          const listener = (request, sender, respond) => {
            if (disposed || ownTabId !== request?.tabId || sender.id !== DINSIDE_ID || sender.url !== `chrome-extension://${DINSIDE_ID}/sidepanel.html` || ![TYPE, "DINSIDE_LOCAL_EDITOR_ACTION"].includes(request?.type) || request.version !== 1 || !Number.isSafeInteger(request.tabId)) return false;
            const action = request.type === "DINSIDE_LOCAL_EDITOR_ACTION";
            if (action ? !Object.hasOwn(actions2, request.action) || !Array.isArray(request.args) : !["state", "snapshot"].includes(request.kind)) return false;
            const finish = (value) => {
              if (!pending.delete(finish)) return;
              try {
                respond(value);
              } catch (_) {
              }
            };
            pending.add(finish);
            Promise.resolve().then(async () => {
              if (disposed) return;
              try {
                const payload = action ? { url: getSource2().location.href, result: await actions2[request.action](...request.args) } : capture(getSource2(), request.kind);
                finish({ ok: true, version: 1, provider: "local-text-editor", tabId: ownTabId, ...payload });
              } catch (error) {
                finish({ ok: false, version: 1, tabId: ownTabId, error: error.message });
              }
            }).catch(() => {
            });
            return true;
          };
          ownTab.then((tab) => {
            if (disposed || !Number.isSafeInteger(tab?.id)) return;
            ownTabId = tab.id;
            chrome2.runtime.onMessageExternal.addListener(listener);
            listening = true;
          }).catch(() => {
          });
          const dispose = () => {
            disposed = true;
            for (const finish of pending) finish({
              ok: false,
              version: 1,
              tabId: ownTabId,
              errorCode: "EDITOR_RELOADING",
              error: "Local Text Editor is reloading."
            });
            if (listening) chrome2.runtime.onMessageExternal.removeListener(listener);
            eventTarget.removeEventListener?.("pagehide", dispose);
          };
          eventTarget.addEventListener?.("pagehide", dispose, { once: true });
          return dispose;
        }
        function installEvents2({ chrome: chrome2, window: window2, getSource: getSource2 }) {
          let currentEditor, subscriptions = [], timer, disposed = false, dragging = false;
          const send = async (kind, captured) => {
            if (disposed || dragging) return;
            try {
              const source = getSource2(), tab = await chrome2.tabs.getCurrent();
              if (!tab?.id || disposed) return;
              await chrome2.runtime.sendMessage(DINSIDE_ID, {
                type: "DINSIDE_LOCAL_EDITOR_EVENT",
                version: 1,
                tabId: tab.id,
                url: source.location.href,
                kind,
                ...captured || capture(source, "state")
              });
            } catch (_) {
            }
          };
          const schedule = (kind = "selection") => {
            window2.clearTimeout(timer);
            timer = window2.setTimeout(() => send(kind), 60);
          };
          const bind = () => {
            try {
              const next = getSource2().editor;
              if (next === currentEditor) return;
              subscriptions.forEach((item) => item.dispose());
              subscriptions = [];
              currentEditor = next;
              for (const [method, kind] of [
                ["onDidChangeCursorSelection", "selection"],
                ["onDidChangeModel", "page"],
                ["onDidChangeModelContent", "page"],
                ["onDidScrollChange", "viewport"]
              ]) {
                if (next?.[method]) subscriptions.push(next[method](() => schedule(kind)));
              }
            } catch (_) {
            }
          };
          const down = (event) => {
            if (event.target?.closest?.(".monaco-editor")) {
              dragging = true;
              bind();
            }
          };
          const up = () => {
            if (dragging) {
              dragging = false;
              bind();
              schedule();
            }
          };
          const focus = () => {
            bind();
            schedule();
          };
          const keydown = (event) => {
            if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing || event.key?.toLowerCase() !== "l") return;
            try {
              const source = getSource2();
              if (!source.editor?.hasTextFocus()) return;
              const snapshot = capture(source, "state");
              if (!snapshot.pageState.selection?.text.trim()) return;
              event.preventDefault();
              event.stopImmediatePropagation();
              if (event.repeat) return;
              window2.clearTimeout(timer);
              void send("keep-selection", snapshot);
            } catch (_) {
            }
          };
          window2.addEventListener("keydown", keydown, true);
          window2.document.addEventListener("pointerdown", down, true);
          window2.addEventListener("pointerup", up, true);
          window2.addEventListener("pointercancel", up, true);
          window2.document.addEventListener("focusin", focus, true);
          window2.addEventListener("focus", focus);
          bind();
          const dispose = () => {
            disposed = true;
            window2.clearTimeout(timer);
            subscriptions.forEach((item) => item.dispose());
            window2.document.removeEventListener("pointerdown", down, true);
            window2.removeEventListener("pointerup", up, true);
            window2.removeEventListener("pointercancel", up, true);
            window2.document.removeEventListener("focusin", focus, true);
            window2.removeEventListener("focus", focus);
            window2.removeEventListener("keydown", keydown, true);
          };
          window2.addEventListener("pagehide", dispose, { once: true });
          return dispose;
        }
        if (typeof module !== "undefined" && module.exports) module.exports = { capture, install: install2, installEvents: installEvents2, DINSIDE_ID, TYPE };
        else if (!globalThis.__dinSideEditorContextBridge) {
          globalThis.__dinSideEditorContextBridge = install2({
            chrome,
            getSource: () => ({ editor, activeTab, state, location, innerWidth, innerHeight })
          });
        }
      })();
    }
  });

  // src/shared/google-workspace-files.js
  var fileTypes = [
    { path: "document", label: "Google Docs", mime: "application/vnd.google-apps.document", exportFormat: "docx" },
    { path: "spreadsheets", label: "Google Sheets", mime: "application/vnd.google-apps.spreadsheet", exportFormat: "xlsx" },
    { path: "presentation", label: "Google Slides", mime: "application/vnd.google-apps.presentation", exportFormat: "pptx" },
    { path: "videos", label: "Google Vids", mime: "application/vnd.google-apps.vid", exportFormat: "mp4" },
    { path: "drawings", label: "Google Drawings", mime: "application/vnd.google-apps.drawing", exportFormat: "pdf" },
    { path: "script", label: "Google Apps Script", mime: "application/vnd.google-apps.script", exportFormat: "json", host: "script.google.com" },
    { path: "forms", label: "Google Forms", mime: "application/vnd.google-apps.form", exportFormat: "pdf", mode: "form-print" },
    { path: "sites", label: "Google Sites", mime: "application/vnd.google-apps.site", exportFormat: "pdf", host: "sites.google.com", mode: "site-pages" },
    { path: "maps", label: "Google My Maps", mime: "application/vnd.google-apps.map", exportFormat: "kml", host: "www.google.com" },
    { path: "images", label: "Google Pics", mime: "application/vnd.google-apps.pic", exportFormat: "jpg" }
  ];
  var colabType = { path: "colab", label: "Google Colaboratory", mime: "application/vnd.google.colaboratory", exportFormat: "ipynb", mode: "drive-original" };
  var aiStudioType = { path: "aistudio", label: "Google AI Studio", mode: "drive-original" };
  var nativeTypes = [
    { path: "gem", label: "Gemini Gem", mime: "application/vnd.google-gemini.gem", mode: "native-original" },
    { path: "conversation", label: "Gemini Conversation", mime: "application/vnd.google-gemini.conversation", mode: "native-original" },
    { path: "email-layouts", label: "Email layout", mime: "application/vnd.google-apps.mail-layout", mode: "native-original" }
  ];
  var workspaceLabelAliases = {
    "google t\xE0i li\u1EC7u": "google docs",
    "t\xE0i li\u1EC7u google": "google docs",
    "google trang t\xEDnh": "google sheets",
    "trang t\xEDnh google": "google sheets",
    "google trang tr\xECnh b\xE0y": "google slides",
    "trang tr\xECnh b\xE0y google": "google slides",
    "google b\u1EA3n v\u1EBD": "google drawings",
    "b\u1EA3n v\u1EBD google": "google drawings",
    "google bi\u1EC3u m\u1EABu": "google forms",
    "bi\u1EC3u m\u1EABu google": "google forms",
    "google b\u1EA3n \u0111\u1ED3 c\u1EE7a t\xF4i": "google my maps",
    "b\u1EA3n \u0111\u1ED3 c\u1EE7a t\xF4i tr\xEAn google": "google my maps"
  };
  function googleWorkspaceFileType(mime = "", label = "") {
    label = label.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
    label = Object.hasOwn(workspaceLabelAliases, label) ? workspaceLabelAliases[label] : label;
    if (!mime && label === aiStudioType.label.toLowerCase()) return aiStudioType;
    if (mime.toLowerCase() === colabType.mime || !mime && /^(?:Google Colab(?:oratory)?|Colab(?:oratory)?)$/i.test(label)) return colabType;
    const native = nativeTypes.find((type) => mime ? type.mime === mime.toLowerCase() : type.label.toLowerCase() === label.toLowerCase());
    if (native) return native;
    return fileTypes.find((type) => mime ? type.mime === mime.toLowerCase() : type.label.toLowerCase() === label.toLowerCase()) || null;
  }
  function getGoogleWorkspaceFileInfo(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return null;
    }
    if (!/^https?:$/.test(parsed.protocol)) return null;
    if (parsed.hostname === "aistudio.google.com") {
      const prompt = parsed.pathname.match(/^\/prompts\/([\w-]{20,})(?:\/|$)/);
      if (!prompt) return null;
      return {
        ...aiStudioType,
        id: prompt[1],
        origin: parsed.origin,
        accountPath: "",
        authuser: parsed.searchParams.get("authuser"),
        resourceKey: parsed.searchParams.get("resourcekey")
      };
    }
    if (parsed.hostname === "docs.google.com") {
      const layout = parsed.pathname.match(/^\/email-layouts(\/u\/\d+)?\/d\/([\w-]+)(?:\/|$)/i);
      if (layout) return {
        ...nativeTypes.find((type) => type.path === "email-layouts"),
        id: layout[2],
        origin: parsed.origin,
        accountPath: layout[1] || "",
        authuser: parsed.searchParams.get("authuser"),
        resourceKey: parsed.searchParams.get("resourcekey")
      };
    }
    if (parsed.hostname === "colab.research.google.com") {
      const notebook = parsed.pathname.match(/^(?:\/u\/\d+)?\/drive\/([\w-]+)(?:\/|$)/i);
      if (!notebook) return null;
      return {
        ...colabType,
        id: notebook[1],
        origin: parsed.origin,
        accountPath: "",
        authuser: parsed.searchParams.get("authuser") || parsed.pathname.match(/\/u\/(\d+)(?:\/|$)/)?.[1] || null,
        resourceKey: parsed.searchParams.get("resourcekey")
      };
    }
    if (["www.google.com", "google.com"].includes(parsed.hostname)) {
      const map = parsed.pathname.match(/^\/maps\/d(\/u\/\d+)?\/(?:edit|viewer|kml)\/?$/i);
      const id = parsed.searchParams.get("mid");
      if (!map || !/^[\w-]+$/.test(id || "")) return null;
      return {
        ...fileTypes.find((type) => type.path === "maps"),
        id,
        origin: "https://www.google.com",
        accountPath: map[1] || "",
        authuser: parsed.searchParams.get("authuser"),
        resourceKey: parsed.searchParams.get("resourcekey")
      };
    }
    if (parsed.hostname === "sites.google.com") {
      const site = parsed.pathname.match(/^(\/u\/\d+)?\/d\/([\w-]+)(?:\/|$)/i);
      if (!site) return null;
      return {
        ...fileTypes.find((type) => type.path === "sites"),
        id: site[2],
        origin: parsed.origin,
        accountPath: site[1] || "",
        authuser: parsed.searchParams.get("authuser"),
        resourceKey: parsed.searchParams.get("resourcekey")
      };
    }
    if (parsed.hostname === "script.google.com") {
      const script = parsed.pathname.match(/^(?:\/a\/[^/]+)?(\/u\/\d+)?\/(?:home\/projects|d)\/(?!e\/)([\w-]+)(?:\/|$)/i);
      if (!script) return null;
      return {
        ...fileTypes.find((type) => type.path === "script"),
        id: script[2],
        origin: parsed.origin,
        accountPath: script[1] || "",
        authuser: parsed.searchParams.get("authuser"),
        resourceKey: parsed.searchParams.get("resourcekey")
      };
    }
    if (parsed.hostname !== "docs.google.com") return null;
    const form = parsed.pathname.match(/^\/forms(\/u\/\d+)?\/d\/(e\/)?([\w-]+)(?:\/|$)/i);
    if (form) return {
      ...fileTypes.find((type) => type.path === "forms"),
      id: form[3],
      published: !!form[2],
      origin: parsed.origin,
      accountPath: form[1] || "",
      authuser: parsed.searchParams.get("authuser"),
      resourceKey: parsed.searchParams.get("resourcekey")
    };
    const match = parsed.pathname.match(/^\/(document|spreadsheets|presentation|videos|drawings|images)(\/u\/\d+)?\/d\/(?!e\/)([\w-]+)(?:\/|$)/i);
    if (!match) return null;
    return {
      ...fileTypes.find((type) => type.path === match[1].toLowerCase()),
      id: match[3],
      origin: parsed.origin,
      accountPath: match[2] || "",
      authuser: parsed.searchParams.get("authuser"),
      resourceKey: parsed.searchParams.get("resourcekey")
    };
  }
  function googleWorkspaceEditorUrl(type, id, { accountPath = "", authuser = "", resourceKey = "" } = {}) {
    const url = new URL(type.mode === "native-original" ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view` : type.path === "aistudio" ? `https://aistudio.google.com/prompts/${encodeURIComponent(id)}` : type.path === "colab" ? `https://colab.research.google.com/drive/${encodeURIComponent(id)}` : type.path === "script" ? `https://script.google.com${accountPath}/home/projects/${encodeURIComponent(id)}/edit` : type.path === "maps" ? `https://www.google.com/maps/d${accountPath}/edit?mid=${encodeURIComponent(id)}` : type.path === "sites" ? `https://sites.google.com${accountPath}/d/${encodeURIComponent(id)}/edit` : `https://docs.google.com/${type.path}${accountPath}/d/${encodeURIComponent(id)}/edit`);
    if (authuser) url.searchParams.set("authuser", authuser);
    if (resourceKey) url.searchParams.set("resourcekey", resourceKey);
    return url.href;
  }

  // src/shared/google-workspace-home.js
  var officeTypes = {
    Word: { path: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
    Excel: { path: "spreadsheets", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    PowerPoint: { path: "presentation", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
  };
  function workspaceHomeCandidate(node, pageUrl) {
    if (!node.matches?.('.docs-homescreen-list-item[role="option"], .docs-homescreen-grid-item[role="option"]') || node.getAttribute("aria-disabled") === "true") return null;
    let page;
    try {
      page = new URL(pageUrl);
    } catch (_) {
      return null;
    }
    const home = page.hostname === "docs.google.com" ? page.pathname.match(/^\/(document|spreadsheets|presentation|videos|images|forms)(?:\/u\/\d+)?\/?$/)?.[1] : page.hostname === "sites.google.com" && /^\/(?:u\/\d+\/)?(?:new|)?\/?$/.test(page.pathname) ? "sites" : null;
    if (!home) return null;
    const names = node.querySelectorAll(".docs-homescreen-list-item-title[title], .docs-homescreen-grid-item-title[title]");
    const controls = node.querySelectorAll('.docs-homescreen-item-overflow[role="button"][aria-haspopup="true"]');
    if (names.length !== 1 || controls.length !== 1 || controls[0].getAttribute("aria-disabled") === "true") return null;
    const title = names[0].getAttribute("title")?.trim();
    const label = names[0].getAttribute("aria-label") || "";
    if (!title || !label.startsWith(`${title} `)) return null;
    const type = label.slice(title.length + 1).trim();
    const native = googleWorkspaceFileType("", type);
    const office = Object.hasOwn(officeTypes, type) ? officeTypes[type] : null;
    if ((native?.path || office?.path) !== home) return null;
    return {
      kind: "download-action",
      title,
      element: node,
      scopeElement: node,
      actionElement: controls[0],
      workspaceHome: { path: home, ...office ? { originalMime: office.mime } : {} }
    };
  }

  // src/shared/page-files.js
  var documentExtension = /\.(?:pdf|docx?|xlsx?|pptx?|txt|csv|tsv|md|rtf|odt|ods|odp|epub|json|png|jpe?g|webp|gif|svg|bmp|tiff?|heic|mp4|webm|mov|avi|mp3|wav|ogg|m4a|flac|zip|gz|tar|7z|rar|py|ipynb|js|ts|css|xml|kml|kmz|ya?ml)(?=$|[?#\s,;:()[\]{}|·—–])/i;
  var documentFormat = /^(?:pdf|docx?|xlsx?|pptx?|txt|csv|tsv|md|rtf|odt|ods|odp|epub|json|png|jpe?g|webp|gif|svg|bmp|tiff?|heic|mp4|webm|mov|avi|mp3|wav|ogg|m4a|flac|zip|gz|tar|7z|rar|py|ipynb|js|ts|css|xml|kml|kmz|ya?ml)$/i;
  var documentMime = /^(?:image\/|audio\/|video\/|application\/(?:pdf|msword|rtf|json|xml|zip|gzip|x-(?:tar|7z-compressed|ipynb\+json)|epub\+zip|vnd\.(?:rar|google-earth\.|openxmlformats-officedocument\.|ms-excel|ms-powerpoint|oasis\.opendocument\.))|text\/(?:plain|csv|tab-separated-values|markdown|rtf|x-python|javascript|css|xml))/i;
  var resourceAttributes = ["data-download-url", "data-file-url", "data-download-href", "data-href", "data-url"];
  var clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  var decode = (value) => {
    try {
      return decodeURIComponent(value);
    } catch (_) {
      return value;
    }
  };
  function filename(value) {
    const text = clean(value);
    const match = text.match(documentExtension);
    return match && text.length <= 400 ? text.slice(0, match.index + match[0].length) : "";
  }
  function namedFile(value) {
    const text = clean(value);
    const match = text.match(/\.[a-z][a-z0-9]{0,11}(?=$|[?#\s,;:()[\]{}|·—–])/i);
    return match && text.length <= 400 ? text.slice(0, match.index + match[0].length) : "";
  }
  function cardFilenames(node) {
    const names = /* @__PURE__ */ new Set();
    const metadata = [node, ...node.querySelectorAll("[data-filename], [data-file-name], [title]")].slice(0, 60);
    for (const item of metadata) for (const key of ["data-filename", "data-file-name", "title"]) {
      const name = namedFile(item.getAttribute(key));
      if (name) names.add(name);
    }
    if (!names.size) {
      const name = namedFile(nodeTitle(node));
      if (name) names.add(name);
    }
    return names;
  }
  function downloadControls(node) {
    const label = /^(?:download(?: (?:file|document|attachment|pdf))?|tải (?:xuống|về|file|tệp|tài liệu))$/i;
    const icon = /^(?:(?:fa|fas|far|lucide|ri|bi|mdi|icon|outline|solid|regular)[-_:])*(?:file[-_:]|cloud[-_:])?download(?:[-_:](?:file|outline|solid|fill|line|icon|cloud))?$/i;
    const selector = 'a, button, [role="button"], [title], [aria-label], [data-tooltip], [icon], [data-icon], [data-lucide], svg, i[class], span[class]';
    const controls = /* @__PURE__ */ new Set();
    for (const hint of [...node.querySelectorAll(selector)].slice(0, 120)) {
      const labels = ["title", "aria-label", "data-tooltip"].map((key) => clean(hint.getAttribute(key)));
      labels.push(clean(hint.textContent));
      const icons = ["icon", "data-icon", "data-lucide"].map((key) => clean(hint.getAttribute(key)));
      icons.push(...String(hint.getAttribute("class") || "").split(/\s+/));
      if (!labels.some((value) => label.test(value)) && !icons.some((value) => icon.test(value))) continue;
      let control = hint.closest('a, button, [role="button"], [tabindex], [icon], [data-icon], [data-lucide]') || hint;
      if (control.namespaceURI === "http://www.w3.org/2000/svg") control = control.parentElement;
      if (!control || !node.contains(control) || control === node || control.disabled || control.getAttribute("aria-disabled") === "true" || /^(?:true|1|disabled)$/i.test(control.getAttribute("data-disabled") || "")) continue;
      if ([...controls].some((existing) => existing.contains(control))) continue;
      for (const existing of controls) if (control.contains(existing)) controls.delete(existing);
      controls.add(control);
    }
    return [...controls];
  }
  function pageFileCandidate(url, title = "", { download = false, allowTitle = true } = {}) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (_) {
      return null;
    }
    if (!/^https?:$/.test(parsed.protocol)) return null;
    const workspace = getGoogleWorkspaceFileInfo(parsed.href);
    const driveFile = parsed.hostname === "drive.google.com" && (/\/file\/(?:u\/\d+\/)?d\/[^/]+/i.test(parsed.pathname) || /\/(?:open|uc)$/.test(parsed.pathname) && parsed.searchParams.has("id"));
    const path = decode(parsed.pathname);
    const hints = ["filename", "file_name", "download_filename", "file", "path", "name", "download"].map((key) => parsed.searchParams.get(key) || "");
    const queryName = hints.map((value) => filename(decode(value).split("/").at(-1))).find(Boolean);
    const format = parsed.searchParams.get("format") || parsed.searchParams.get("output") || "";
    const nestedDocument = ["url", "file", "pdf", "src"].some((key) => {
      const value = parsed.searchParams.get(key);
      if (!value) return false;
      try {
        const nested = new URL(value, parsed);
        return /^https?:$/.test(nested.protocol) && documentExtension.test(decode(nested.pathname).replace(/\/+$/, ""));
      } catch (_) {
        return false;
      }
    });
    const explicitDownload = parsed.searchParams.get("action") === "download" || parsed.searchParams.get("export") === "download" || parsed.searchParams.has("download") && !/^(?:0|false)$/i.test(parsed.searchParams.get("download"));
    const direct = documentExtension.test(path.replace(/\/+$/, "")) || queryName || nestedDocument || documentFormat.test(format) || allowTitle && documentExtension.test(title);
    if (!workspace && !driveFile && !direct && !download && !explicitDownload) return null;
    const pathName = path.split("/").filter(Boolean).at(-1);
    const label = filename(title) || queryName || filename(pathName) || clean(title) || pathName || "document";
    return { url: parsed.href, title: label.slice(0, 240) };
  }
  function nodeTitle(node) {
    const values = ["download", "data-filename", "data-file-name", "title", "aria-label", "data-tooltip"].map((key) => node.getAttribute?.(key)).filter(Boolean);
    values.push(clean(node.innerText || node.textContent));
    return values.map(filename).find(Boolean) || values.find((value) => value.length <= 400) || "";
  }
  function driveCardCandidate(node, pageUrl) {
    if (!node.matches?.('[role="row"][data-id], [role="gridcell"][data-id], [role="listitem"][data-id]')) return null;
    let page;
    try {
      page = new URL(pageUrl);
    } catch (_) {
      return null;
    }
    if (page.hostname !== "drive.google.com") return null;
    const id = node.getAttribute("data-id") || "";
    if (!/^[\w-]{20,}$/.test(id) || !/[a-z]/i.test(id)) return null;
    const owned = [...node.querySelectorAll("[data-id]")].slice(0, 30).filter((item) => item.getAttribute("data-id") === id);
    const nameNode = owned.find((item) => item.hasAttribute("data-tooltip"));
    const title = clean(nameNode?.textContent) || nodeTitle(node);
    let type = clean(owned.find((item) => !item.hasAttribute("data-tooltip") && clean(item.textContent))?.textContent);
    const mime = node.getAttribute("data-mime-type") || "";
    const label = nameNode?.getAttribute("data-tooltip") || "";
    const suffix = label.startsWith(`${title} `) ? clean(label.slice(title.length)) : "";
    if (!type && googleWorkspaceFileType("", suffix)) type = suffix;
    if (/folder|thư mục/i.test(type) || mime === "application/vnd.google-apps.folder" || /(?: Folder| Thư mục)(?: with color .*)?$/i.test(label)) return null;
    const workspace = googleWorkspaceFileType(mime, type);
    const shortcut = mime === "application/vnd.google-apps.shortcut" || /^(?:Shortcut to|Lối tắt (?:đến|tới))\s/i.test(type);
    if (!title || !nameNode && !mime && !type) return null;
    const account = page.searchParams.get("authuser") || page.pathname.match(/\/u\/(\d+)(?:\/|$)/)?.[1];
    const accountPath = /^\d+$/.test(account || "") ? `/u/${account}` : "";
    const url = new URL(workspace && !shortcut ? googleWorkspaceEditorUrl(workspace, id, { accountPath }) : `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`);
    if (account) url.searchParams.set("authuser", account);
    const resourceKey = node.getAttribute("data-resource-key") || page.searchParams.get("resourcekey");
    if (resourceKey) url.searchParams.set("resourcekey", resourceKey);
    const candidate = {
      url: url.href,
      title,
      element: node,
      drive: {
        id,
        mimeType: mime,
        type,
        ...account ? { authuser: account } : {},
        ...resourceKey ? { resourceKey } : {},
        ...shortcut ? { shortcut: true } : {}
      }
    };
    if (!workspace && !shortcut && (/^application\/vnd\.google-apps\./i.test(mime) || /^Google\s/i.test(type))) {
      const controls = downloadControls(node);
      if (controls.length === 1) return { ...candidate, kind: "download-action", actionElement: controls[0], scopeElement: node };
    }
    return candidate;
  }
  function candidateFromNode(node, pageUrl, fallbackTitle = "") {
    const card = driveCardCandidate(node, pageUrl) || workspaceHomeCandidate(node, pageUrl);
    if (card) return card;
    const tag = node.tagName?.toLowerCase();
    const values = resourceAttributes.map((key) => ({ value: node.getAttribute?.(key), explicit: key !== "data-href" && key !== "data-url" }));
    if (["a", "area"].includes(tag)) values.push({ value: node.getAttribute("href") });
    if (["iframe", "embed"].includes(tag)) values.push({ value: node.getAttribute("src") });
    if (tag === "object") values.push({ value: node.getAttribute("data") });
    if (!values.some((item) => item.value)) return null;
    const ownTitle = nodeTitle(node);
    const title = filename(ownTitle) || filename(fallbackTitle) || ownTitle || fallbackTitle;
    const downloadLabel = /^(?:download(?: (?:file|document|attachment|pdf))?|tải (?:xuống|về|file|tệp|tài liệu))$/i.test(clean(title));
    const mime = node.getAttribute?.("type") || node.getAttribute?.("data-mime-type") || "";
    for (const { value, explicit } of values) {
      if (!value) continue;
      let url;
      const base = /^https?:/i.test(node.baseURI || "") ? node.baseURI : pageUrl;
      try {
        url = new URL(value, base).href;
      } catch (_) {
        continue;
      }
      const candidate = pageFileCandidate(url, title, { download: explicit || node.hasAttribute("download") || downloadLabel || documentMime.test(mime) });
      if (candidate) return { ...candidate, element: node };
    }
    return null;
  }
  function downloadActionFromCard(node) {
    if (node.childElementCount > 12 || (node.textContent || "").length > 600) return null;
    const names = cardFilenames(node);
    if (names.size !== 1) return null;
    const controls = downloadControls(node);
    if (controls.length !== 1) return null;
    let scope = node;
    for (let parent = node.parentElement, depth = 0; parent && depth < 6; parent = parent.parentElement, depth += 1) {
      if (parent.matches('body, html, main, nav, section, [role="main"], [role="grid"], [role="table"], [role="list"]') || parent.childElementCount > 12 || (parent.textContent || "").length > 1200) break;
      const parentNames = cardFilenames(parent);
      if (parentNames.size !== 1 || !parentNames.has(names.values().next().value)) break;
      const parentControls = downloadControls(parent);
      if (parentControls.length !== 1 || parentControls[0] !== controls[0]) break;
      scope = parent;
      if (parent.id || parent.hasAttribute("data-file-id") || parent.hasAttribute("data-message-id")) break;
    }
    const rect = node.getBoundingClientRect?.();
    const element = rect?.width > 0 && rect.height > 0 ? node : scope;
    return { kind: "download-action", title: names.values().next().value, element, actionElement: controls[0], scopeElement: scope };
  }
  function fileCandidateFromElement(element, pageUrl) {
    const ancestors = [];
    for (let node = element; node && ancestors.length < 12; node = node.parentElement || node.getRootNode?.().host) {
      if (["BODY", "HTML"].includes(node.tagName)) break;
      if (node.matches?.('main, nav, table, tbody, [role="main"], [role="grid"], [role="table"], [role="list"]')) break;
      ancestors.push(node);
      const candidate = candidateFromNode(node, pageUrl);
      if (candidate) return candidate;
    }
    const selector = "a[href], area[href], [data-download-url], [data-file-url], [data-download-href], [data-href], [data-url]";
    for (const node of ancestors.slice(0, 6)) {
      if (node.matches?.('main, nav, section, table, tbody, [role="main"], [role="grid"], [role="table"], [role="list"]')) break;
      if (node.childElementCount > 12 || (node.textContent || "").length > 500) continue;
      const title = nodeTitle(node);
      if (!filename(title) && !node.matches?.('li, tr, [role="row"], [role="listitem"], [data-filename], [data-file-name], .file-card, .attachment')) continue;
      const links = node.querySelectorAll?.(selector) || [];
      if (!links.length || links.length > 8) continue;
      const candidates = /* @__PURE__ */ new Map();
      for (const link of links) {
        const candidate = candidateFromNode(link, pageUrl, title);
        if (candidate) candidates.set(candidate.url, candidate);
      }
      if (candidates.size === 1) return { ...candidates.values().next().value, element: node };
      if (candidates.size > 1) return null;
    }
    for (const node of ancestors.slice(0, 7)) {
      if (node.matches?.('main, nav, section, table, tbody, [role="main"], [role="grid"], [role="table"], [role="list"]')) break;
      const candidate = downloadActionFromCard(node);
      if (candidate) return candidate;
    }
    return null;
  }

  // src/shared/resource-scope.js
  function createScope(window2, { active: initiallyActive = true } = {}) {
    let active = initiallyActive;
    let generation = 0;
    const cleanups = /* @__PURE__ */ new Set();
    const timers = /* @__PURE__ */ new Map();
    const frames = /* @__PURE__ */ new Map();
    const groups = /* @__PURE__ */ new Map();
    const idleCallbacks = /* @__PURE__ */ new Map();
    function own(cleanup) {
      if (!active) {
        cleanup();
        return () => {
        };
      }
      cleanups.add(cleanup);
      return () => cleanups.delete(cleanup);
    }
    function listen(target, type, listener, options) {
      if (!active || !target) return;
      target.addEventListener(type, listener, options);
      own(() => target.removeEventListener(type, listener, options));
    }
    function chromeListen(event, listener) {
      if (!active || !event) return;
      const token = generation;
      function dispatch(...args) {
        if (current(token)) return listener.apply(this, args);
      }
      event.addListener(dispatch);
      own(() => event.removeListener(dispatch));
    }
    function observe(target, callback, options) {
      if (!active || !target) return null;
      const observer = new window2.MutationObserver(callback);
      observer.observe(target, options);
      own(() => observer.disconnect());
      return observer;
    }
    function idle(callback, options) {
      if (!active) return null;
      const id = window2.requestIdleCallback((deadline) => {
        idleCallbacks.delete(id);
        if (active) callback(deadline);
      }, options);
      idleCallbacks.set(id, () => window2.cancelIdleCallback(id));
      return id;
    }
    function cancelIdle(id) {
      window2.cancelIdleCallback(id);
      idleCallbacks.delete(id);
    }
    function clearTimeout2(id) {
      window2.clearTimeout(id);
      timers.delete(id);
    }
    function timeout(callback, delay2) {
      if (!active) return null;
      const id = window2.setTimeout(() => {
        timers.delete(id);
        if (active) callback();
      }, delay2);
      timers.set(id, () => window2.clearTimeout(id));
      return id;
    }
    function delay(ms) {
      if (!active) return Promise.resolve();
      return new Promise((resolve) => {
        const release = own(() => {
          clearTimeout2(id);
          resolve();
        });
        const id = timeout(() => {
          release();
          resolve();
        }, ms);
      });
    }
    function frame(callback) {
      if (!active) return null;
      const id = window2.requestAnimationFrame(() => {
        frames.delete(id);
        if (active) callback();
      });
      frames.set(id, () => window2.cancelAnimationFrame(id));
      return id;
    }
    function group(key) {
      groups.get(key)?.dispose();
      const child = createScope(window2);
      if (!active) child.dispose();
      groups.set(key, child);
      return child;
    }
    function dispose() {
      if (!active) return;
      active = false;
      generation += 1;
      for (const child of groups.values()) child.dispose();
      groups.clear();
      for (const cancel of timers.values()) cancel();
      timers.clear();
      for (const cancel of idleCallbacks.values()) cancel();
      idleCallbacks.clear();
      for (const cancel of frames.values()) cancel();
      frames.clear();
      for (const cleanup of cleanups) cleanup();
      cleanups.clear();
    }
    function current(token) {
      return active && token === generation;
    }
    return Object.freeze({
      listen,
      chromeListen,
      observe,
      own,
      timeout,
      clearTimeout: clearTimeout2,
      idle,
      cancelIdle,
      delay,
      frame,
      group,
      dispose,
      activate() {
        if (!active) {
          active = true;
          generation += 1;
        }
      },
      token: () => generation,
      current,
      get active() {
        return active;
      }
    });
  }
  var resource_scope_default = Object.freeze({ createScope });

  // src/content/selection.js
  function create(bindings) {
    const SELECTION_BLOCK_SELECTOR = [
      "pre",
      "blockquote",
      "li",
      "td",
      "th",
      "tr",
      "p",
      "figcaption",
      "dt",
      "dd",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      '[role="heading"]',
      '[role="listitem"]',
      '[role="row"]',
      '[role="cell"]',
      '[role="gridcell"]',
      ".cm-line",
      ".cm-content",
      ".view-line",
      ".view-lines",
      ".ace_line",
      ".CodeMirror-line",
      ".xterm-rows",
      "#terminal",
      ".terminal"
    ].join(",");
    const SELECTION_HEADING_SELECTOR = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
    const SELECTION_SOURCE_CHUNK_CHARS = 1800;
    function readCurrentSelectionText() {
      const selection = bindings.window.getSelection();
      if (!bindings.selectedTextContextEnabled || !selection?.rangeCount || selection.isCollapsed || selectionIsEditable(selection)) return "";
      return selection.toString().trim();
    }
    function selectionAnchorElement(selection) {
      if (!selection?.anchorNode) return null;
      return selection.anchorNode.nodeType === bindings.Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement;
    }
    function selectionIsEditable(selection) {
      const isEditable = (element) => {
        if (!element?.closest) return false;
        if (element.closest("input, textarea, select")) return true;
        if (bindings.isCodeEditorOrTerminalElement(element)) return false;
        const owner = element.closest("[contenteditable]");
        return Boolean(element.isContentEditable || element.closest('[role="textbox"]') || owner && ["", "true", "plaintext-only"].includes(owner.getAttribute("contenteditable").toLowerCase()));
      };
      let active = bindings.document.activeElement;
      if (active?.id?.startsWith("__dinside_")) active = null;
      while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
      return [active, selectionAnchorElement(selection), selectionNodeElement(selection?.focusNode)].some(isEditable);
    }
    function selectionNodeElement(node) {
      if (!node) return null;
      return node.nodeType === bindings.Node.ELEMENT_NODE ? node : node.parentElement;
    }
    function compactSelectionSupportText(value = "") {
      return String(value || "").replace(/\r/g, "").split("\n").map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n").trim();
    }
    function selectionElementType(element) {
      if (!element?.closest) return "text";
      const candidates = [
        [".cm-editor, .cm-content, .CodeMirror, .monaco-editor, .ace_editor, pre, code", "code block"],
        ['.xterm, #terminal, .terminal, [class*="terminal"], .repl-output', "terminal output"],
        ['td, th, [role="cell"], [role="gridcell"]', "table cell"],
        ['tr, [role="row"]', "table row"],
        ['a[href], [role="link"]', "link"],
        ['li, [role="listitem"]', "list item"],
        ["blockquote", "blockquote"],
        [SELECTION_HEADING_SELECTOR, "heading"],
        ["p", "paragraph"],
        ["figcaption", "figure caption"],
        ["dt", "definition term"],
        ["dd", "definition description"]
      ];
      for (const [selector, label] of candidates) {
        if (element.closest(selector)) return label;
      }
      return String(element.tagName || "text").toLowerCase();
    }
    function selectionBlockElement(range) {
      if (!range) return null;
      const start = selectionNodeElement(range.startContainer);
      const end = selectionNodeElement(range.endContainer);
      const startBlock = start?.closest?.(SELECTION_BLOCK_SELECTOR) || null;
      const endBlock = end?.closest?.(SELECTION_BLOCK_SELECTOR) || null;
      if (startBlock && startBlock === endBlock) return startBlock;
      const common = selectionNodeElement(range.commonAncestorContainer);
      const commonBlock = common?.closest?.(SELECTION_BLOCK_SELECTOR) || null;
      if (commonBlock && (!start || commonBlock.contains(start)) && (!end || commonBlock.contains(end))) {
        const commonText = compactSelectionSupportText(commonBlock.innerText || commonBlock.textContent || "");
        if (commonText.length <= 2600) return commonBlock;
      }
      return startBlock || endBlock || common;
    }
    function nearestSelectionHeading(block) {
      if (!block) return "";
      if (block.matches?.(SELECTION_HEADING_SELECTOR)) {
        return compactSelectionSupportText(block.innerText || block.textContent || "").slice(0, 240);
      }
      const section = block.closest?.('section, article, main, [role="region"]') || null;
      const root = section || bindings.document.querySelector('main, article, [role="main"]') || bindings.document.body;
      if (!root?.querySelectorAll) return "";
      let nearest = "";
      for (const heading of root.querySelectorAll(SELECTION_HEADING_SELECTOR)) {
        if (heading === block || heading.contains(block)) {
          nearest = compactSelectionSupportText(heading.innerText || heading.textContent || "");
          break;
        }
        const position = heading.compareDocumentPosition(block);
        if (position & bindings.Node.DOCUMENT_POSITION_FOLLOWING) {
          nearest = compactSelectionSupportText(heading.innerText || heading.textContent || "");
          continue;
        }
        if (position & bindings.Node.DOCUMENT_POSITION_PRECEDING) break;
      }
      return nearest.slice(0, 240);
    }
    function selectionSourceChunk(block, exactSelectionText) {
      if (!block) return "";
      const full = compactSelectionSupportText(block.innerText || block.textContent || "");
      const selected = compactSelectionSupportText(exactSelectionText);
      if (!full || full === selected) return "";
      if (selected && full.length && selected.length / full.length >= 0.7) return "";
      if (full.length <= SELECTION_SOURCE_CHUNK_CHARS) return full;
      const probe = selected.slice(0, 320);
      let index = probe ? full.indexOf(probe) : -1;
      if (index < 0) index = 0;
      const before = 520;
      let start = Math.max(0, index - before);
      let end = Math.min(full.length, start + SELECTION_SOURCE_CHUNK_CHARS);
      if (end === full.length) start = Math.max(0, end - SELECTION_SOURCE_CHUNK_CHARS);
      return `${start > 0 ? "\u2026" : ""}${full.slice(start, end)}${end < full.length ? "\u2026" : ""}`;
    }
    function selectionBlockId(block) {
      if (!block?.tagName) return "";
      const parts = [];
      let current = block;
      let depth = 0;
      while (current?.tagName && current !== bindings.document.documentElement && depth < 8) {
        const tag = current.tagName.toLowerCase();
        const stableId = String(current.id || "").trim();
        if (stableId && stableId.length <= 80) {
          parts.unshift(`${tag}#${stableId}`);
          break;
        }
        let sameTagIndex = 1;
        let sibling = current.previousElementSibling;
        while (sibling) {
          if (sibling.tagName === current.tagName) sameTagIndex += 1;
          sibling = sibling.previousElementSibling;
        }
        parts.unshift(`${tag}:nth-of-type(${sameTagIndex})`);
        current = current.parentElement;
        depth += 1;
      }
      return parts.join(">");
    }
    function getDomAwareSelection(selection = bindings.window.getSelection()) {
      if (!bindings.selectedTextContextEnabled || !selection?.rangeCount || selection.isCollapsed || selectionIsEditable(selection)) return null;
      const text = selection.toString();
      if (!text || !text.trim()) return null;
      const range = selection.getRangeAt(0);
      const startElement = selectionNodeElement(range.startContainer) || selectionAnchorElement(selection);
      const block = selectionBlockElement(range);
      const semanticElement = startElement?.closest?.(
        'td, th, [role="cell"], [role="gridcell"], tr, [role="row"], a[href], [role="link"], pre, code, .cm-editor, .CodeMirror, .monaco-editor, .ace_editor, .xterm, #terminal, li, [role="listitem"], blockquote, h1, h2, h3, h4, h5, h6, [role="heading"], p, figcaption, dt, dd'
      ) || startElement;
      return describeSelection(text, startElement, semanticElement, block);
    }
    function describeSelection(text, startElement, semanticElement, block, includeSource = true) {
      return {
        text: text.slice(0, 12e3),
        title: bindings.document.title,
        url: bindings.location.href,
        domContext: {
          section: nearestSelectionHeading(block),
          element: selectionElementType(startElement),
          tag: String(semanticElement?.tagName || "").toLowerCase(),
          block: String(block?.tagName || "").toLowerCase(),
          blockId: selectionBlockId(block)
        },
        sourceChunk: includeSource ? selectionSourceChunk(block, text) : ""
      };
    }
    function getElementSelection(element, text) {
      if (!element || !text?.trim()) return null;
      return describeSelection(text, element, element, element, false);
    }
    function selectionPayloadKey(selection) {
      if (!selection?.text) return "";
      return [
        selection.url || "",
        selection.text,
        selection.domContext?.section || "",
        selection.domContext?.element || "",
        selection.domContext?.block || "",
        selection.domContext?.blockId || "",
        selection.sourceChunk || ""
      ].join("\n");
    }
    function publishSelectedText({ force = false } = {}) {
      if (!bindings.extensionContextAlive || !bindings.selectedTextContextEnabled) return;
      const snapshot = getDomAwareSelection();
      if (!snapshot) {
        if (!bindings.lastSelectionPayload) return;
        bindings.lastSelectionPayload = "";
        bindings.safeSendMessage({
          type: bindings.messages.TEXT_SELECTION_CLEARED,
          url: bindings.location.href
        });
        return;
      }
      const payloadKey = selectionPayloadKey(snapshot);
      if (payloadKey === bindings.lastSelectionPayload && !force) return;
      bindings.lastSelectionPayload = payloadKey;
      bindings.safeSendMessage({
        type: bindings.messages.TEXT_SELECTED,
        selection: snapshot
      });
    }
    return Object.freeze({ readCurrentSelectionText, selectionAnchorElement, selectionIsEditable, selectionNodeElement, compactSelectionSupportText, selectionElementType, selectionBlockElement, nearestSelectionHeading, selectionSourceChunk, selectionBlockId, getDomAwareSelection, getElementSelection, selectionPayloadKey, publishSelectedText });
  }
  var selection_default = Object.freeze({ create });

  // src/content/element-selection.js
  var OMIT = 'script,style,noscript,template,input,textarea,select,[contenteditable]:not([contenteditable="false"]),[hidden],[aria-hidden="true"],[id^="__dinside_"]';
  var BLOCK = 'p,li,pre,blockquote,td,th,figcaption,dt,dd,h1,h2,h3,h4,h5,h6,button,a[href],[role="heading"],[role="listitem"],[role="cell"],[role="gridcell"]';
  var MAX_CHARS = 12e3;
  var eligibleElement = (element, document2) => Boolean(element && element !== document2.body && element !== document2.documentElement && !element.closest(OMIT) && element.isConnected);
  var textElementAt = (element, document2) => eligibleElement(element, document2) ? element.closest(BLOCK) || element.closest('div,section,article,table,figure,[role="region"]') || element : null;
  function readElementText(element, window2) {
    let text = "", visited = 0;
    function walk(node) {
      if (text.length >= MAX_CHARS || ++visited > 2e4) return;
      if (node.nodeType === window2.Node.TEXT_NODE) {
        text += node.textContent;
        return;
      }
      if (node.nodeType !== window2.Node.ELEMENT_NODE || node.matches(OMIT)) return;
      const style = window2.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse" || style.opacity === "0") return;
      const cell = node.tagName === "TD" || node.tagName === "TH";
      const block = !cell && style.display && !style.display.startsWith("inline") && style.display !== "contents";
      if (block || node.tagName === "BR") text += "\n";
      for (const child of node.childNodes) walk(child);
      if (cell) text += "	";
      else if (block) text += "\n";
    }
    walk(element);
    return text.replace(/\r/g, "").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n").trim().slice(0, MAX_CHARS);
  }
  function create2(window2) {
    const { document: document2 } = window2;
    const selection = selection_default.create({ window: window2, document: document2, Node: window2.Node, location: window2.location });
    let current = null;
    function cancel(sessionId) {
      if (!sessionId || current?.id === sessionId) current?.finish(null);
    }
    function pick(labels) {
      cancel();
      return new Promise((resolve) => {
        const scope = createScope(window2);
        const host = document2.createElement("div");
        host.id = "__dinside_element_picker__";
        host.dataset.sessionId = labels.sessionId;
        host.dataset.captureStartedAt = String(Date.now());
        host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
        const shadow = host.attachShadow({ mode: "closed" });
        const style = document2.createElement("style");
        style.textContent = `
        .surface { position:fixed; inset:0; cursor:crosshair; }
        .outline { position:fixed; display:none; box-sizing:border-box; border:2px solid #60a5fa;
          border-radius:4px; background:#60a5fa22; box-shadow:0 0 0 1px #fff; pointer-events:none; }
        .hint { position:fixed; top:16px; left:50%; transform:translateX(-50%); display:flex;
          align-items:center; gap:12px; max-width:calc(100vw - 32px); box-sizing:border-box;
          padding:10px 14px; border-radius:10px; background:#18181b; color:#fff;
          font:13px/1.4 system-ui,sans-serif; box-shadow:0 4px 18px #0004; }
        button { padding:4px 8px; border:1px solid #71717a; border-radius:6px;
          background:transparent; color:#fff; font:inherit; cursor:pointer; }
        button:hover,button:focus-visible { background:#3f3f46; }
      `;
        const surface = document2.createElement("div");
        surface.className = "surface";
        const outline = document2.createElement("div");
        outline.className = "outline";
        const hint = document2.createElement("div");
        hint.className = "hint";
        hint.setAttribute("role", "status");
        const text = document2.createElement("span");
        text.textContent = labels.hint;
        const button = document2.createElement("button");
        button.type = "button";
        button.textContent = labels.cancel;
        hint.append(text, button);
        shadow.append(style, surface, outline, hint);
        document2.documentElement.append(host);
        let target = null, frame = null, point = null, parents = [];
        let settled = false;
        function finish(result) {
          if (settled) return;
          settled = true;
          scope.dispose();
          host.remove();
          if (current?.id === labels.sessionId) current = null;
          resolve(result);
        }
        current = { id: labels.sessionId, finish };
        function eligible(element) {
          return eligibleElement(element, document2);
        }
        function atPoint(x, y) {
          host.style.pointerEvents = "none";
          try {
            let element = document2.elementFromPoint(x, y);
            while (element?.shadowRoot) {
              const inner = element.shadowRoot.elementFromPoint(x, y);
              if (!inner || inner === element) break;
              element = inner;
            }
            return textElementAt(element, document2);
          } finally {
            host.style.pointerEvents = "";
          }
        }
        function highlight(element) {
          target = eligible(element) ? element : null;
          outline.style.display = target ? "block" : "none";
          if (!target) return;
          text.textContent = labels.hint;
          const rect = target.getBoundingClientRect();
          Object.assign(outline.style, {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`
          });
        }
        function select() {
          if (!eligible(target)) return;
          const content = readElementText(target, window2);
          if (!content) {
            text.textContent = labels.empty;
            return;
          }
          finish(selection.getElementSelection(target, content));
        }
        scope.listen(surface, "pointermove", (event) => {
          point = { x: event.clientX, y: event.clientY };
          if (frame !== null) return;
          frame = scope.group("hover").frame(() => {
            frame = null;
            parents = [];
            highlight(atPoint(point.x, point.y));
          });
        });
        scope.listen(surface, "pointerleave", () => {
          scope.group("hover");
          frame = null;
          point = null;
          parents = [];
          highlight(null);
        });
        scope.listen(surface, "pointerdown", (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
        });
        scope.listen(surface, "click", (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (frame !== null) {
            scope.group("hover");
            frame = null;
          }
          if (!parents.length) highlight(atPoint(event.clientX, event.clientY));
          select();
        });
        scope.listen(button, "click", () => finish(null));
        scope.listen(window2, "keydown", (event) => {
          if (event.isComposing || !["Escape", "Enter", "ArrowUp", "ArrowDown", "Tab"].includes(event.key)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          if (event.key === "Escape") finish(null);
          else if (event.key === "Enter") {
            if (shadow.activeElement === button) finish(null);
            else select();
          } else if (event.key === "Tab") button.focus();
          else if (event.key === "ArrowUp" && eligible(target?.parentElement)) {
            parents.push(target);
            highlight(target.parentElement);
          } else if (event.key === "ArrowDown" && parents.length) highlight(parents.pop());
        }, true);
        scope.listen(window2, "scroll", () => {
          if (target) highlight(target);
        }, true);
        scope.listen(window2, "resize", () => {
          if (target) highlight(target);
        });
        scope.listen(window2, "pagehide", () => finish(null), true);
        scope.listen(window2, "__DINSIDE_CANCEL_ELEMENT_PICKER__", (event) => cancel(event.detail?.sessionId), true);
      });
    }
    return Object.freeze({ pick, cancel });
  }

  // src/content/page-selection.js
  function pageCandidateFromElement(element, window2) {
    if (!eligibleElement(element, window2.document)) return null;
    const file = fileCandidateFromElement(element, window2.location.href);
    const image = element.tagName === "IMG" && (element.currentSrc || element.src) ? element : null;
    const explicitFile = file && (file.drive || file.kind === "download-action" || file.element.matches("[download],[data-filename],[data-file-name],[data-download-url],[data-file-url]"));
    if (file && (!image || explicitFile)) return { ...file, selectionType: "file" };
    if (image) return { selectionType: "image", element: image, src: image.currentSrc || image.src };
    const text = textElementAt(element, window2.document);
    return text ? { selectionType: "text", element: text } : null;
  }
  function textPageCandidate(element, window2) {
    return eligibleElement(element, window2.document) ? { selectionType: "text", element } : null;
  }
  function pageSelectionResult(candidate, window2) {
    const pageUrl = window2.location.href;
    if (candidate.selectionType === "image") return {
      selectionType: "image",
      src: candidate.src,
      pageUrl,
      selectionKey: `image:${candidate.src}`
    };
    if (candidate.selectionType !== "text") return null;
    const content = readElementText(candidate.element, window2);
    if (!content) return null;
    const selection = selection_default.create({ window: window2, document: window2.document, Node: window2.Node, location: window2.location });
    const result = selection.getElementSelection(candidate.element, content);
    return {
      ...result,
      selectionType: "text",
      pageUrl,
      selectionKey: `text:${JSON.stringify(result.domContext)}:${content}`
    };
  }

  // src/shared/selection-scroll.js
  function installSelectionScroll(window2 = globalThis) {
    const { document: document2 } = window2;
    const parentOf = (node) => node.assignedSlot || node.parentElement || node.getRootNode()?.host;
    function scrollAxis(node, delta, horizontal, mode) {
      const root = document2.scrollingElement || document2.documentElement;
      const position = horizontal ? "scrollLeft" : "scrollTop";
      const size = horizontal ? "clientWidth" : "clientHeight";
      const extent = horizontal ? "scrollWidth" : "scrollHeight";
      const overflow = horizontal ? "overflowX" : "overflowY";
      const overscroll = horizontal ? "overscrollBehaviorX" : "overscrollBehaviorY";
      let remaining = null;
      for (let current = node; current; current = parentOf(current)) {
        const style = window2.getComputedStyle(current);
        const isRoot = current === root;
        const policy = style[overflow] || style.overflow;
        if (isRoot && (/hidden|clip/.test(policy) || (!policy || policy === "visible") && /hidden|clip/.test(window2.getComputedStyle(document2.body)[overflow]))) return;
        if (current[extent] <= current[size] || !isRoot && !/^(auto|scroll|overlay)$/.test(policy)) continue;
        if (remaining === null) {
          const unit = mode === 1 ? parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.2 : mode === 2 ? current[size] : 1;
          remaining = delta * unit;
        }
        const before = current[position];
        current.scrollBy({ [horizontal ? "left" : "top"]: remaining, behavior: "instant" });
        remaining -= current[position] - before;
        if (Math.abs(remaining) < 0.5 || /^(contain|none)$/.test(style[overscroll] || style.overscrollBehavior) || isRoot) return;
      }
    }
    window2.__DINSIDE_SELECTION_SCROLL__ = (surface, elementAt, onScroll) => {
      function wheel(event) {
        if (event.ctrlKey || event.metaKey || !event.deltaX && !event.deltaY) return;
        const node = elementAt(event.clientX, event.clientY);
        if (!node) return;
        event.preventDefault();
        event.stopPropagation();
        const horizontal = event.shiftKey && !event.deltaX;
        if (event.deltaX || horizontal) scrollAxis(node, event.deltaX || event.deltaY, true, event.deltaMode);
        if (event.deltaY && !horizontal) scrollAxis(node, event.deltaY, false, event.deltaMode);
        onScroll?.(event);
      }
      surface.addEventListener("wheel", wheel, { passive: false });
      return () => surface.removeEventListener("wheel", wheel);
    };
    return true;
  }
  function enableSelectionScroll(window2, surface, elementAt, onScroll) {
    installSelectionScroll(window2);
    return window2.__DINSIDE_SELECTION_SCROLL__(surface, elementAt, onScroll);
  }

  // src/content/file-selection.js
  function create3(window2, {
    candidateFromElement = pageCandidateFromElement,
    readSelection = pageSelectionResult,
    parentCandidate = textPageCandidate
  } = {}) {
    const { document: document2 } = window2;
    let current = null;
    function cancel(sessionId) {
      if (!sessionId || current?.id === sessionId) current?.finish(null, true);
    }
    function pick(labels) {
      current?.finish(null, true);
      {
        const results = [];
        const feedback = /* @__PURE__ */ new Map();
        const selectedKeys = /* @__PURE__ */ new Set();
        let candidate = null, parents = [], hoverFrame = null, hoverPoint = null;
        let actionSequence = 0;
        let waiting = null;
        const next = () => {
          if (results.length) {
            const result = results.shift();
            if (settled && !results.length && current?.id === labels.sessionId) current = null;
            return Promise.resolve(result);
          }
          return settled ? Promise.resolve(null) : new Promise((resolve) => {
            waiting = resolve;
          });
        };
        const host = document2.createElement("div");
        host.id = labels.auto ? "__dinside_page_picker__" : "__dinside_file_picker__";
        host.dataset.sessionId = labels.sessionId;
        host.dataset.captureStartedAt = String(Date.now());
        host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
        const shadow = host.attachShadow({ mode: "closed" });
        const style = document2.createElement("style");
        style.textContent = `
        .surface{position:fixed;inset:0;cursor:crosshair}
        .outline{position:fixed;display:none;box-sizing:border-box;border:2px solid #6ff7cc;
          border-radius:6px;background:#6ff7cc14;pointer-events:none}
        .type-badge{position:absolute;left:-2px;top:-25px;box-sizing:border-box;padding:4px 7px;
          border:1px solid #6ff7cc80;border-radius:5px;background:#0a1511;color:#9bffdb;
          font:600 11px/1.2 system-ui,sans-serif;white-space:nowrap}
        .type-badge[hidden]{display:none}
        .selection-feedback{position:fixed;z-index:1;box-sizing:border-box;pointer-events:none;border:1px solid #6ff7cca6;
          border-radius:7px;background:#6ff7cc1c;box-shadow:inset 0 0 0 1px #6ff7cc26,0 0 14px #6ff7cc26;
          animation:file-selection-received 650ms ease-out both}
        .selection-feedback-badge{position:absolute;right:7px;top:50%;transform:translateY(-50%);
          display:inline-flex;align-items:center;gap:4px;max-width:calc(100% - 10px);box-sizing:border-box;
          padding:5px 7px;border:1px solid #6ff7cc73;border-radius:999px;background:#0a1511f5;
          color:#9bffdb;font:600 11px/1.1 system-ui,sans-serif;white-space:nowrap;box-shadow:0 2px 8px #0003}
        .selection-feedback-badge svg{width:14px;height:14px;flex:none;fill:none;stroke:currentColor;
          stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        .selection-feedback-label{overflow:hidden;text-overflow:ellipsis}
        .selection-feedback[data-compact] .selection-feedback-badge{right:3px;padding:3px}
        .selection-feedback[data-compact] .selection-feedback-label{display:none}
        @keyframes file-selection-received{
          0%{opacity:1;transform:scale(.99)}12%,65%{opacity:1;transform:scale(1)}
          100%{opacity:0;transform:scale(1.015)}}
        @media(prefers-reduced-motion:reduce){.selection-feedback{animation:none}}
        .hint{position:fixed;z-index:2;top:16px;left:50%;transform:translateX(-50%);display:flex;
          align-items:center;gap:12px;max-width:calc(100vw - 32px);box-sizing:border-box;
          padding:10px 14px;border:1px solid #ffffff20;border-radius:10px;background:#0a0a0a;
          color:#eee;font:13px/1.4 system-ui,sans-serif;box-shadow:0 4px 18px #0004}
        button{padding:4px 8px;border:1px solid #ffffff30;border-radius:6px;background:transparent;
          color:inherit;font:inherit;cursor:pointer}button:focus-visible{outline:2px solid #6ff7cc}
      `;
        const surface = document2.createElement("div");
        surface.className = "surface";
        const outline = document2.createElement("div");
        outline.className = "outline";
        const badge = document2.createElement("span");
        badge.className = "type-badge";
        badge.hidden = true;
        outline.append(badge);
        const hint = document2.createElement("div");
        hint.className = "hint";
        hint.setAttribute("role", "status");
        const text = document2.createElement("span");
        text.textContent = labels.hint;
        const close = document2.createElement("button");
        close.type = "button";
        close.textContent = labels.cancel;
        hint.append(text, close);
        shadow.append(style, surface, outline, hint);
        const removeFeedback = (url, receipt) => {
          window2.clearTimeout(receipt.timer);
          receipt.element.remove();
          if (feedback.get(url) === receipt) feedback.delete(url);
        };
        const clearFeedback = () => {
          for (const [url, receipt] of feedback) removeFeedback(url, receipt);
        };
        const showFeedback = (candidate2) => {
          const previous = feedback.get(candidate2.url);
          if (previous) removeFeedback(candidate2.url, previous);
          const rect = candidate2.element.getBoundingClientRect();
          const element = document2.createElement("div");
          element.className = "selection-feedback";
          element.setAttribute("aria-hidden", "true");
          Object.assign(element.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
          if (rect.width < 110 || rect.height < 28) element.setAttribute("data-compact", "");
          const badge2 = document2.createElement("span");
          badge2.className = "selection-feedback-badge";
          const check = document2.createElementNS("http://www.w3.org/2000/svg", "svg");
          check.setAttribute("viewBox", "0 0 16 16");
          const path = document2.createElementNS("http://www.w3.org/2000/svg", "path");
          path.setAttribute("d", "m3 8 3.5 3.5L13 5");
          check.append(path);
          const label = document2.createElement("span");
          label.className = "selection-feedback-label";
          label.textContent = labels.selected || "Selected";
          badge2.append(check, label);
          element.append(badge2);
          shadow.append(element);
          const receipt = { element, timer: null };
          feedback.set(candidate2.url, receipt);
          receipt.timer = window2.setTimeout(() => removeFeedback(candidate2.url, receipt), 650);
        };
        let settled = false;
        const finish = (result, discard = false) => {
          if (settled) {
            if (discard) {
              results.length = 0;
              if (current?.id === labels.sessionId) current = null;
            }
            return;
          }
          settled = true;
          window2.removeEventListener("keydown", keydown, true);
          window2.removeEventListener("pagehide", onCancel, true);
          window2.removeEventListener("__DINSIDE_CANCEL_FILE_PICKER__", onCancel, true);
          window2.removeEventListener("scroll", viewportChanged, true);
          window2.removeEventListener("resize", viewportChanged, true);
          window2.removeEventListener("__DINSIDE_PAGE_PICK_RESULT__", onPickResult, true);
          removeScroll();
          if (hoverFrame !== null) window2.cancelAnimationFrame(hoverFrame);
          clearFeedback();
          host.remove();
          if (discard) results.length = 0;
          if (current?.id === labels.sessionId && !results.length) current = null;
          waiting?.(result);
          waiting = null;
        };
        const onCancel = (event) => {
          if (event.detail?.sessionId && event.detail.sessionId !== labels.sessionId) return;
          finish(null, true);
        };
        const keydown = (event) => {
          if (labels.auto && !event.isComposing && ["Enter", "ArrowUp", "ArrowDown", "Tab"].includes(event.key)) {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.key === "Tab") close.focus();
            else if (event.key === "Enter") {
              if (shadow.activeElement === close) finish(null);
              else {
                if (hoverPoint && !parents.length) highlight(candidateAt(hoverPoint.x, hoverPoint.y));
                selectCandidate(candidate);
              }
            } else if (event.key === "ArrowUp") {
              const parent = parentCandidate(candidate?.element.parentElement, window2);
              if (parent) {
                parents.push(candidate);
                highlight(parent);
              }
            } else if (parents.length) highlight(parents.pop());
            return;
          }
          if (event.key !== "Escape") return;
          event.preventDefault();
          event.stopImmediatePropagation();
          finish(null);
        };
        const hide = () => {
          if (hoverFrame !== null) window2.cancelAnimationFrame(hoverFrame);
          hoverFrame = null;
          hoverPoint = null;
          candidate = null;
          parents = [];
          outline.style.display = "none";
          text.textContent = labels.hint;
          clearFeedback();
        };
        const elementAt = (x, y) => {
          host.style.pointerEvents = "none";
          try {
            let node = document2.elementFromPoint(x, y);
            while (node?.shadowRoot) {
              const child = node.shadowRoot.elementFromPoint(x, y);
              if (!child || child === node) break;
              node = child;
            }
            return node;
          } finally {
            host.style.pointerEvents = "";
          }
        };
        const candidateAt = (x, y) => {
          const node = elementAt(x, y);
          return labels.auto ? candidateFromElement(node, window2, { x, y }) : fileCandidateFromElement(node, window2.location.href);
        };
        const highlight = (value) => {
          candidate = value;
          outline.style.display = candidate ? "block" : "none";
          text.textContent = labels.auto ? labels.hint : candidate?.title || labels.hint;
          badge.hidden = !labels.auto || !candidate;
          if (!candidate) return;
          const rect = candidate.element.getBoundingClientRect();
          if (labels.auto) {
            badge.textContent = labels[candidate.selectionType];
            badge.style.top = rect.top < 28 ? "3px" : "-25px";
          }
          Object.assign(outline.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
        };
        const refreshHover = () => {
          if (hoverFrame !== null) return;
          hoverFrame = window2.requestAnimationFrame(() => {
            hoverFrame = null;
            parents = [];
            highlight(candidateAt(hoverPoint.x, hoverPoint.y));
          });
        };
        const viewportChanged = () => {
          const point = hoverPoint;
          hide();
          if (labels.auto && point) {
            hoverPoint = point;
            refreshHover();
          }
        };
        const removeScroll = enableSelectionScroll(window2, surface, elementAt, (event) => {
          hoverPoint = { x: event.clientX, y: event.clientY };
          viewportChanged();
        });
        surface.addEventListener("pointermove", (event) => {
          if (!labels.auto) {
            highlight(candidateAt(event.clientX, event.clientY));
            return;
          }
          hoverPoint = { x: event.clientX, y: event.clientY };
          refreshHover();
        });
        surface.addEventListener("pointerleave", hide);
        const selectCandidate = (candidate2) => {
          if (!candidate2?.element.isConnected) return;
          if (labels.auto && results.length >= 32) {
            text.textContent = labels.queueFull;
            return;
          }
          let result = labels.auto && candidate2.selectionType !== "file" ? readSelection(candidate2, window2) : null;
          if (labels.auto && candidate2.selectionType !== "file" && !result) {
            text.textContent = labels.empty;
            return;
          }
          let action = null;
          if (candidate2.kind === "download-action") {
            const scope = candidate2.scopeElement || candidate2.element;
            const previous = scope.getAttribute("data-dinside-file-root") || candidate2.actionElement.getAttribute("data-dinside-file-action");
            const id = previous?.startsWith(`${labels.sessionId}:`) ? previous : `${labels.sessionId}:${++actionSequence}`;
            candidate2.actionElement.setAttribute("data-dinside-file-action", id);
            scope.setAttribute("data-dinside-file-root", id);
            candidate2.url = `dinside-file-action:${id}`;
            action = {
              id,
              sessionId: labels.sessionId,
              ...candidate2.workspaceHome ? { workspaceHome: candidate2.workspaceHome } : {}
            };
          }
          result ||= {
            url: candidate2.url,
            title: candidate2.title,
            pageUrl: window2.location.href,
            ...candidate2.drive ? { drive: candidate2.drive } : {},
            ...action ? { action } : {}
          };
          if (labels.auto && candidate2.selectionType === "file") Object.assign(result, { selectionType: "file", selectionKey: `file:${result.url}` });
          if (labels.auto && selectedKeys.has(result.selectionKey)) return;
          if (labels.persistent) showFeedback({ ...candidate2, url: result.selectionKey || candidate2.url });
          if (results.some((item) => (item.selectionKey || item.url) === (result.selectionKey || result.url))) return;
          if (labels.auto) selectedKeys.add(result.selectionKey);
          if (!labels.persistent) {
            finish(result);
            return;
          }
          text.textContent = labels.added || labels.hint;
          if (waiting) {
            const resolve = waiting;
            waiting = null;
            resolve(result);
          } else results.push(result);
        };
        const selectAt = (event) => {
          if (hoverFrame !== null) {
            window2.cancelAnimationFrame(hoverFrame);
            hoverFrame = null;
          }
          if (!labels.auto || !parents.length) highlight(candidateAt(event.clientX, event.clientY));
          selectCandidate(candidate);
        };
        const onPickResult = (event) => {
          if (event.detail?.sessionId !== labels.sessionId || !labels.auto) return;
          if (!event.detail.ok || event.detail.selectionType === "file") selectedKeys.delete(event.detail.selectionKey);
          text.textContent = event.detail.ok ? labels.hint : event.detail.error || labels.hint;
        };
        let suppressReleaseClick = false;
        surface.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          suppressReleaseClick = event.button === 0 && event.pointerType !== "touch" && event.isPrimary !== false;
          if (suppressReleaseClick) selectAt(event);
        });
        surface.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
          const suppressed = suppressReleaseClick && event.detail > 0;
          suppressReleaseClick = false;
          if (event.button !== 0 || suppressed) return;
          selectAt(event);
        });
        close.addEventListener("click", () => finish(null));
        window2.addEventListener("keydown", keydown, true);
        window2.addEventListener("pagehide", onCancel, true);
        window2.addEventListener("__DINSIDE_CANCEL_FILE_PICKER__", onCancel, true);
        window2.addEventListener("scroll", viewportChanged, true);
        window2.addEventListener("resize", viewportChanged, true);
        window2.addEventListener("__DINSIDE_PAGE_PICK_RESULT__", onPickResult, true);
        current = { id: labels.sessionId, finish, next };
        document2.documentElement.append(host);
        return next();
      }
    }
    return Object.freeze({
      pick,
      cancel,
      finish: (sessionId) => {
        if (current?.id === sessionId) current.finish(null);
      },
      next: (sessionId) => current?.id === sessionId ? current.next() : Promise.resolve(null)
    });
  }

  // src/content/read-page-image.js
  async function readPageImage(selection, window2, labels) {
    const maxBytes = 20 * 1024 * 1024;
    const abort = new window2.AbortController();
    let cancelled = false;
    const cancel = (event) => {
      if (!event.detail?.sessionId || event.detail.sessionId === labels.sessionId) {
        cancelled = true;
        abort.abort();
      }
    };
    const leave = () => {
      cancelled = true;
      abort.abort();
    };
    window2.addEventListener("__DINSIDE_CANCEL_FILE_PICKER__", cancel, true);
    window2.addEventListener("pagehide", leave, true);
    const timer = window2.setTimeout(() => abort.abort(), 8e3);
    const result = { ...selection, dataUrl: "" };
    try {
      if (window2.__DINSIDE_CANCELLED_FILE_PICKERS__?.has(labels.sessionId)) {
        cancelled = true;
        abort.abort();
      }
      if (cancelled) return null;
      const response = await window2.fetch(selection.src, { credentials: "include", signal: abort.signal });
      if (!response.ok) throw Error(labels.failed);
      if (Number(response.headers.get("content-length")) > maxBytes) throw Error(labels.tooLarge);
      const blob = await response.blob();
      if (blob.size > maxBytes) throw Error(labels.tooLarge);
      if (cancelled) return null;
      if (abort.signal.aborted) throw Error(labels.failed);
      result.dataUrl = await new Promise((resolve, reject) => {
        const reader = new window2.FileReader();
        const stop = () => {
          reader.abort();
          reject(Error(labels.failed));
        };
        abort.signal.addEventListener("abort", stop, { once: true });
        const done = (callback) => {
          abort.signal.removeEventListener("abort", stop);
          callback();
        };
        reader.onload = () => done(() => resolve(reader.result));
        reader.onerror = () => done(() => reject(Error(labels.failed)));
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      if (cancelled) return null;
      if (error.message === labels.tooLarge || !/^https?:/i.test(selection.src)) result.error = error.message || labels.failed;
    } finally {
      window2.clearTimeout(timer);
      window2.removeEventListener("__DINSIDE_CANCEL_FILE_PICKER__", cancel, true);
      window2.removeEventListener("pagehide", leave, true);
    }
    return cancelled ? null : result;
  }

  // src/content/image-selection-main.js
  (() => {
    if (globalThis.__DINSIDE_IMAGE_PICKER_VERSION__ === 3) return;
    window.dispatchEvent(new Event("__DINSIDE_CANCEL_IMAGE_PICKER__"));
    globalThis.__DINSIDE_IMAGE_PICKER_VERSION__ = 3;
    let current = null;
    const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
    globalThis.__DINSIDE_PICK_IMAGE__ = (labels) => {
      if (current?.id === labels.sessionId) return current.next();
      current?.finish(true);
      const host = document.createElement("div");
      host.id = "__dinside_image_picker__";
      host.dataset.sessionId = labels.sessionId;
      host.dataset.captureStartedAt = String(Date.now());
      host.style.cssText = "all:initial;position:fixed;inset:0;z-index:2147483647;";
      const shadow = host.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = `
      .surface { position:fixed; inset:0; cursor:crosshair; }
      .outline { position:fixed; display:none; box-sizing:border-box;
        border:3px solid #60a5fa; border-radius:4px; background:#60a5fa22;
        box-shadow:0 0 0 1px #fff; pointer-events:none; }
      .hint { position:fixed; top:16px; left:50%; transform:translateX(-50%);
        display:flex; align-items:center; gap:12px; max-width:calc(100vw - 32px);
        box-sizing:border-box; padding:10px 14px; border-radius:10px;
        background:#18181b; color:#fff; font:13px/1.4 system-ui,sans-serif;
        box-shadow:0 4px 18px #0004; }
      button { padding:4px 8px; border:1px solid #71717a; border-radius:6px;
        background:transparent; color:#fff; font:inherit; cursor:pointer; }
      button:hover, button:focus-visible { background:#3f3f46; }
    `;
      const surface = document.createElement("div");
      surface.className = "surface";
      const outline = document.createElement("div");
      outline.className = "outline";
      const hint = document.createElement("div");
      hint.className = "hint";
      hint.setAttribute("role", "status");
      const text = document.createElement("span");
      text.textContent = labels.hint;
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.textContent = labels.done;
      hint.append(text, cancel);
      shadow.append(style, surface, outline, hint);
      document.documentElement.appendChild(host);
      let accepting = true;
      let discarded = false;
      let activeReadAbort = null;
      let wake = null;
      const queue = [];
      const selectedSources = /* @__PURE__ */ new Set();
      const updateHint = () => {
        text.textContent = selectedSources.size ? labels.selected.replace("{0}", String(selectedSources.size)) : labels.hint;
      };
      const finish = (discard) => {
        if (discard) {
          discarded = true;
          queue.length = 0;
          activeReadAbort?.abort();
        }
        accepting = false;
        window.removeEventListener("keydown", onKeyDown, true);
        if (discard) {
          window.removeEventListener("__DINSIDE_CANCEL_IMAGE_PICKER__", onCancel, true);
          window.removeEventListener("pagehide", onCancel, true);
        }
        window.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("__DINSIDE_IMAGE_PICK_RESULT__", onPickResult, true);
        host.remove();
        wake?.();
      };
      const onCancel = (event) => {
        if (event.detail?.sessionId && event.detail.sessionId !== labels.sessionId) return;
        finish(event.detail?.discard !== false);
      };
      const onScroll = () => {
        outline.style.display = "none";
      };
      const onKeyDown = (event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        finish(false);
      };
      const onPickResult = (event) => {
        if (event.detail?.sessionId !== labels.sessionId || event.detail.ok) return;
        selectedSources.delete(event.detail.src);
        updateHint();
      };
      window.addEventListener("keydown", onKeyDown, true);
      window.addEventListener("__DINSIDE_CANCEL_IMAGE_PICKER__", onCancel, true);
      window.addEventListener("pagehide", onCancel, true);
      window.addEventListener("scroll", onScroll, true);
      window.addEventListener("__DINSIDE_IMAGE_PICK_RESULT__", onPickResult, true);
      cancel.addEventListener("click", () => finish(false));
      const imageAtPoint = (x, y) => {
        host.style.pointerEvents = "none";
        let element;
        try {
          element = document.elementFromPoint(x, y);
          while (element?.shadowRoot) {
            const inner = element.shadowRoot.elementFromPoint(x, y);
            if (!inner || inner === element) break;
            element = inner;
          }
        } finally {
          host.style.pointerEvents = "";
        }
        return element?.tagName === "IMG" && (element.currentSrc || element.src) ? element : null;
      };
      const highlight = (image) => {
        outline.style.display = image ? "block" : "none";
        if (!image) return;
        const rect = image.getBoundingClientRect();
        Object.assign(outline.style, {
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`
        });
        outline.style.borderColor = selectedSources.has(image.currentSrc || image.src) ? "#4ade80" : "#60a5fa";
      };
      surface.addEventListener("pointermove", (event) => {
        highlight(imageAtPoint(event.clientX, event.clientY));
      });
      surface.addEventListener("pointerleave", () => highlight(null));
      surface.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      });
      surface.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!accepting) return;
        const image = imageAtPoint(event.clientX, event.clientY);
        if (!image) return;
        const src = image.currentSrc || image.src;
        if (selectedSources.has(src)) return;
        selectedSources.add(src);
        queue.push({ src, pageUrl: location.href, dataUrl: "" });
        highlight(image);
        updateHint();
        wake?.();
      });
      const next = async () => {
        while (accepting && !queue.length) {
          await new Promise((resolve) => {
            wake = resolve;
          });
          wake = null;
        }
        if (discarded || !queue.length) {
          window.removeEventListener("__DINSIDE_CANCEL_IMAGE_PICKER__", onCancel, true);
          window.removeEventListener("pagehide", onCancel, true);
          selectedSources.clear();
          return null;
        }
        const selection = queue.shift();
        const abort = new AbortController();
        activeReadAbort = abort;
        const fetchTimer = setTimeout(() => abort.abort(), 8e3);
        try {
          const response = await fetch(selection.src, { credentials: "include", signal: abort.signal });
          if (!response.ok) throw new Error(labels.failed);
          if (Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES) {
            throw new Error(labels.tooLarge);
          }
          const blob = await response.blob();
          if (blob.size > MAX_IMAGE_BYTES) throw new Error(labels.tooLarge);
          selection.dataUrl = await new Promise((done, reject) => {
            const reader = new FileReader();
            reader.onload = () => done(reader.result);
            reader.onerror = () => reject(new Error(labels.failed));
            reader.readAsDataURL(blob);
          });
        } catch (error) {
          if (error.message === labels.tooLarge || !/^https?:/i.test(selection.src)) {
            selection.error = error.message || labels.failed;
          }
        } finally {
          clearTimeout(fetchTimer);
          activeReadAbort = null;
        }
        selection.finishedSelecting = !accepting;
        return discarded ? null : selection;
      };
      current = { id: labels.sessionId, next, finish };
      return next();
    };
  })();

  // src/sidepanel/capture/region-picker.js
  function selectCaptureRegionInPage(captureHint, sessionId, options = {}) {
    return new Promise((resolve) => {
      window.__DINSIDE_REGION_PICKER__?.cancel();
      const old = document.getElementById("__dinside_capture_overlay__");
      old?.remove();
      const persistent = options.persistent === true;
      const overlay = document.createElement("div");
      overlay.id = "__dinside_capture_overlay__";
      overlay.dataset.sessionId = sessionId;
      overlay.dataset.captureStartedAt = String(Date.now());
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
        cursor: "crosshair",
        userSelect: "none",
        touchAction: "none",
        background: "rgba(0,0,0,.16)"
      });
      const selection = document.createElement("div");
      Object.assign(selection.style, {
        position: "fixed",
        display: "none",
        border: "2px solid #fff",
        borderRadius: "4px",
        boxShadow: "0 0 0 9999px rgba(0,0,0,.42)",
        pointerEvents: "none"
      });
      const sizeLabel = document.createElement("div");
      Object.assign(sizeLabel.style, {
        position: "absolute",
        left: "0",
        top: "-30px",
        padding: "4px 7px",
        borderRadius: "6px",
        background: "rgba(15,17,21,.92)",
        color: "#fff",
        font: "12px/1.3 system-ui,sans-serif",
        whiteSpace: "nowrap",
        pointerEvents: "none"
      });
      selection.append(sizeLabel);
      const hint = document.createElement("div");
      Object.assign(hint.style, {
        position: "fixed",
        top: "16px",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        maxWidth: "calc(100vw - 32px)",
        boxSizing: "border-box",
        padding: "7px 10px",
        borderRadius: "8px",
        background: "rgba(15,17,21,.92)",
        color: "#fff",
        font: "12px/1.3 system-ui,sans-serif",
        boxShadow: "0 4px 18px rgba(0,0,0,.25)"
      });
      const text = document.createElement("span");
      text.textContent = captureHint;
      const done = document.createElement("button");
      done.type = "button";
      done.textContent = options.done || "";
      Object.assign(done.style, {
        padding: "4px 8px",
        border: "1px solid #71717a",
        borderRadius: "6px",
        background: "transparent",
        color: "#fff",
        font: "inherit",
        cursor: "pointer",
        flexShrink: "0"
      });
      hint.append(text);
      if (persistent) hint.append(done);
      overlay.append(selection, hint);
      let waiting = resolve, queued = null, pending = null, frame = null;
      let stopped = false, cancelled = false, ready = true, dragging = false, pointerId = null, startX = 0, startY = 0;
      const cleanup = () => {
        window.removeEventListener("keydown", keydown, true);
        window.removeEventListener("__DINSIDE_CANCEL_CAPTURE__", cancelEvent, true);
        window.removeEventListener("__DINSIDE_FINISH_CAPTURE__", finishEvent, true);
        window.removeEventListener("pagehide", pagehide, true);
        window.removeEventListener("resize", resetDrag, true);
        removeScroll();
        overlay.remove();
        if (!queued && window.__DINSIDE_REGION_PICKER__ === api) delete window.__DINSIDE_REGION_PICKER__;
      };
      const stop = (discard) => {
        if (discard) {
          cancelled = true;
          queued = null;
          if (frame !== null) window.cancelAnimationFrame(frame);
          frame = null;
          pending?.(null);
          pending = null;
        }
        stopped = true;
        dragging = false;
        cleanup();
        waiting?.(null);
        waiting = null;
      };
      const deliver = (callback, region) => {
        pending = callback;
        frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => {
            frame = null;
            const complete = pending;
            pending = null;
            complete?.(cancelled ? null : region);
          });
        });
      };
      const next = (id) => {
        if (id !== sessionId || cancelled) return Promise.resolve(null);
        if (queued) {
          const region = queued;
          queued = null;
          if (stopped) cleanup();
          return new Promise((callback) => deliver(callback, region));
        }
        return stopped ? Promise.resolve(null) : new Promise((callback) => {
          waiting = callback;
        });
      };
      const resume = (id, status = {}) => {
        if (id !== sessionId || stopped) return false;
        ready = status.ready !== false;
        selection.style.display = "none";
        overlay.style.opacity = "1";
        overlay.style.background = "rgba(0,0,0,.16)";
        overlay.style.cursor = ready ? "crosshair" : "wait";
        text.textContent = status.hint || captureHint;
        return true;
      };
      const api = Object.freeze({
        sessionId,
        next,
        resume,
        finish: (id) => {
          if (!id || id === sessionId) stop(false);
        },
        cancel: (id) => {
          if (!id || id === sessionId) stop(true);
        }
      });
      if (persistent) window.__DINSIDE_REGION_PICKER__ = api;
      const resetDrag = () => {
        if (!dragging) return;
        dragging = false;
        pointerId = null;
        selection.style.display = "none";
        overlay.style.background = "rgba(0,0,0,.16)";
      };
      const elementAt = (x, y) => {
        const previous = overlay.style.pointerEvents;
        overlay.style.pointerEvents = "none";
        try {
          let node = document.elementFromPoint(x, y);
          while (node?.shadowRoot) {
            const child = node.shadowRoot.elementFromPoint(x, y);
            if (!child || child === node) break;
            node = child;
          }
          return node;
        } finally {
          overlay.style.pointerEvents = previous;
        }
      };
      const locked = () => dragging || overlay.style.opacity === "0";
      const matches = (event) => !event.detail?.sessionId || event.detail.sessionId === sessionId;
      const cancelEvent = (event) => {
        if (matches(event)) stop(true);
      };
      const finishEvent = (event) => {
        if (matches(event)) stop(false);
      };
      const pagehide = () => stop(true);
      const keydown = (event) => {
        if (event.isComposing) return;
        if (locked() && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (persistent && event.key === "Tab") {
          event.preventDefault();
          event.stopImmediatePropagation();
          done.focus();
        }
        if (event.key !== "Escape") return;
        event.preventDefault();
        event.stopImmediatePropagation();
        stop(false);
      };
      const update = (x, y) => {
        const left = Math.max(0, Math.min(startX, x)), top = Math.max(0, Math.min(startY, y));
        const right = Math.min(innerWidth, Math.max(startX, x)), bottom = Math.min(innerHeight, Math.max(startY, y));
        const width = Math.max(0, right - left), height = Math.max(0, bottom - top);
        Object.assign(selection.style, { display: "block", left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
        sizeLabel.textContent = `${Math.round(width)} \xD7 ${Math.round(height)}`;
        return {
          x: Math.round(left),
          y: Math.round(top),
          width: Math.round(width),
          height: Math.round(height),
          viewportWidth: innerWidth,
          viewportHeight: innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1
        };
      };
      done.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        stop(false);
      });
      overlay.addEventListener("pointerdown", (event) => {
        if (hint.contains(event.target)) {
          event.stopPropagation();
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!ready || stopped || event.button !== 0 || event.isPrimary === false) return;
        dragging = true;
        pointerId = event.pointerId;
        startX = Math.max(0, Math.min(innerWidth, event.clientX));
        startY = Math.max(0, Math.min(innerHeight, event.clientY));
        overlay.setPointerCapture?.(event.pointerId);
        overlay.style.background = "transparent";
        update(startX, startY);
      }, true);
      overlay.addEventListener("pointermove", (event) => {
        if (!dragging || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        update(event.clientX, event.clientY);
      }, true);
      overlay.addEventListener("pointerup", (event) => {
        if (!dragging || event.pointerId !== pointerId) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        dragging = false;
        if (overlay.hasPointerCapture?.(pointerId)) overlay.releasePointerCapture(pointerId);
        const region = update(event.clientX, event.clientY);
        if (region.width < 8 || region.height < 8) {
          if (!persistent) stop(false);
          else {
            selection.style.display = "none";
            overlay.style.background = "rgba(0,0,0,.16)";
          }
          return;
        }
        ready = false;
        overlay.style.opacity = "0";
        overlay.style.cursor = "wait";
        const callback = waiting;
        waiting = null;
        if (!persistent) {
          stopped = true;
          cleanup();
        }
        if (callback) deliver(callback, region);
        else queued = region;
      }, true);
      overlay.addEventListener("pointercancel", resetDrag, true);
      overlay.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      overlay.addEventListener("wheel", (event) => {
        if (locked()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, { passive: false });
      const removeScroll = window.__DINSIDE_SELECTION_SCROLL__?.(
        overlay,
        elementAt,
        () => {
          selection.style.display = "none";
        }
      ) || (() => {
      });
      window.addEventListener("keydown", keydown, true);
      window.addEventListener("__DINSIDE_CANCEL_CAPTURE__", cancelEvent, true);
      window.addEventListener("__DINSIDE_FINISH_CAPTURE__", finishEvent, true);
      window.addEventListener("pagehide", pagehide, true);
      window.addEventListener("resize", resetDrag, true);
      document.documentElement.append(overlay);
    });
  }

  // src/sidepanel/capture/annotation.js
  function drawAnnotationInPage(labels, sessionId) {
    return new Promise((resolve) => {
      document.getElementById("__dinside_draw_overlay__")?.remove();
      const dpr = window.devicePixelRatio || 1;
      const overlay = document.createElement("div");
      overlay.id = "__dinside_draw_overlay__";
      overlay.dataset.sessionId = sessionId;
      overlay.dataset.captureStartedAt = String(Date.now());
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0",
        zIndex: "2147483647",
        cursor: "crosshair",
        userSelect: "none",
        touchAction: "none"
      });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
      Object.assign(canvas.style, { width: "100vw", height: "100vh", display: "block" });
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#ff4d4f";
      const bar = document.createElement("div");
      Object.assign(bar.style, {
        position: "fixed",
        top: "14px",
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: "4px",
        padding: "5px",
        borderRadius: "12px",
        background: "rgba(24,24,24,.96)",
        boxShadow: "0 8px 28px rgba(0,0,0,.35)",
        color: "#fff",
        font: "12px/1 system-ui,sans-serif",
        pointerEvents: "auto"
      });
      let tool = "pen";
      let drawing = false;
      let startX = 0;
      let startY = 0;
      let snapshot = null;
      const undoStack = [];
      const redoStack = [];
      const HISTORY_LIMIT = 50;
      const captureState = () => ctx.getImageData(0, 0, canvas.width, canvas.height);
      const restoreState = (imageData) => {
        ctx.clearRect(0, 0, innerWidth, innerHeight);
        if (imageData) ctx.putImageData(imageData, 0, 0);
      };
      const pushUndo = (imageData = captureState()) => {
        undoStack.push(imageData);
        if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
        redoStack.length = 0;
        updateHistoryButtons();
      };
      const undo = () => {
        if (!undoStack.length || drawing) return;
        redoStack.push(captureState());
        restoreState(undoStack.pop());
        updateHistoryButtons();
      };
      const redo = () => {
        if (!redoStack.length || drawing) return;
        undoStack.push(captureState());
        restoreState(redoStack.pop());
        updateHistoryButtons();
      };
      let activeTextEditor = null;
      const cancelTextEditor = () => {
        if (!activeTextEditor) return;
        activeTextEditor.remove();
        activeTextEditor = null;
        if (tool === "text") setTool("pen");
      };
      const commitTextEditor = () => {
        if (!activeTextEditor) return false;
        const editor2 = activeTextEditor;
        const value = editor2.value.replace(/\r/g, "");
        const x = Number(editor2.dataset.x) || 0;
        const y = Number(editor2.dataset.y) || 0;
        editor2.remove();
        activeTextEditor = null;
        if (!value.trim()) {
          if (tool === "text") setTool("pen");
          return false;
        }
        pushUndo();
        ctx.save();
        ctx.fillStyle = "#ff4d4f";
        ctx.font = "18px system-ui, sans-serif";
        ctx.textBaseline = "top";
        const lineHeight = 23;
        value.split("\n").forEach((line, index) => {
          ctx.fillText(line || " ", x, y + index * lineHeight);
        });
        ctx.restore();
        setTool("pen");
        return true;
      };
      const openTextEditor = (x, y) => {
        if (activeTextEditor) commitTextEditor();
        const editor2 = document.createElement("textarea");
        editor2.dataset.x = String(x);
        editor2.dataset.y = String(y);
        editor2.rows = 1;
        editor2.placeholder = labels["Type\u2026"] || "Type\u2026";
        Object.assign(editor2.style, {
          position: "fixed",
          left: `${Math.max(4, x)}px`,
          top: `${Math.max(4, y)}px`,
          zIndex: "2147483647",
          minWidth: "140px",
          minHeight: "28px",
          maxWidth: "360px",
          padding: "4px 6px",
          border: "1px solid rgba(255,77,79,.75)",
          borderRadius: "6px",
          outline: "none",
          resize: "both",
          overflow: "hidden",
          background: "rgba(24,24,24,.92)",
          color: "#ff4d4f",
          caretColor: "#ff4d4f",
          font: "18px/23px system-ui,sans-serif",
          boxShadow: "0 4px 16px rgba(0,0,0,.28)",
          pointerEvents: "auto"
        });
        editor2.addEventListener("pointerdown", (event) => event.stopPropagation());
        editor2.addEventListener("keydown", (event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            cancelTextEditor();
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            commitTextEditor();
          }
        });
        editor2.addEventListener("input", () => {
          editor2.style.height = "auto";
          editor2.style.height = `${Math.min(180, Math.max(28, editor2.scrollHeight))}px`;
        });
        overlay.appendChild(editor2);
        activeTextEditor = editor2;
        requestAnimationFrame(() => editor2.focus());
      };
      const mkBtn = (label, title, onClick) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = labels[label] || label;
        btn.title = labels[title] || title;
        btn._restBackground = "transparent";
        btn._hoverBackground = "rgba(255,255,255,.09)";
        Object.assign(btn.style, {
          height: "30px",
          minWidth: "30px",
          padding: "0 8px",
          border: "0",
          borderRadius: "8px",
          background: btn._restBackground,
          color: "#eee",
          font: "12px system-ui,sans-serif",
          cursor: "pointer"
        });
        btn.addEventListener("mouseenter", () => {
          if (!btn.disabled) btn.style.background = btn._hoverBackground;
        });
        btn.addEventListener("mouseleave", () => {
          btn.style.background = btn._restBackground;
        });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          onClick(btn);
        });
        return btn;
      };
      const toolButtons = {};
      const refreshToolButtons = () => {
        const activeBg = "rgba(255,255,255,.14)";
        toolButtons.rect._restBackground = tool === "rect" ? activeBg : "transparent";
        toolButtons.arrow._restBackground = tool === "arrow" ? activeBg : "transparent";
        toolButtons.text._restBackground = tool === "text" ? activeBg : "transparent";
        for (const btn of Object.values(toolButtons)) btn.style.background = btn._restBackground;
      };
      const setTool = (next) => {
        tool = next;
        refreshToolButtons();
        canvas.style.cursor = "crosshair";
      };
      toolButtons.rect = mkBtn("", "Rect", () => setTool(tool === "rect" ? "pen" : "rect"));
      toolButtons.rect.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px;display:block;margin:auto;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><rect x="5" y="5" width="14" height="14" rx="1.5"/></svg>';
      toolButtons.arrow = mkBtn("\u2197", "Arrow", () => setTool(tool === "arrow" ? "pen" : "arrow"));
      toolButtons.text = mkBtn("T", "Text", () => setTool(tool === "text" ? "pen" : "text"));
      const undoBtn = mkBtn("\u21B6", "Undo (Ctrl+Z)", undo);
      const redoBtn = mkBtn("\u21B7", "Redo (Ctrl+Y / Ctrl+Shift+Z)", redo);
      for (const btn of [toolButtons.rect, toolButtons.arrow, toolButtons.text, undoBtn, redoBtn]) {
        Object.assign(btn.style, {
          width: "34px",
          minWidth: "34px",
          height: "34px",
          padding: "0",
          fontSize: "18px",
          lineHeight: "1",
          fontWeight: "500"
        });
      }
      function updateHistoryButtons() {
        for (const [btn, enabled] of [[undoBtn, undoStack.length > 0], [redoBtn, redoStack.length > 0]]) {
          btn.disabled = !enabled;
          btn.style.opacity = enabled ? "1" : ".35";
          btn.style.cursor = enabled ? "pointer" : "default";
        }
      }
      const clearBtn = mkBtn("Clear", "Clear", () => {
        pushUndo();
        ctx.clearRect(0, 0, innerWidth, innerHeight);
      });
      const cancelBtn = mkBtn("Cancel", "Cancel", () => finish(null));
      const doneBtn = mkBtn("Done", "Done", () => {
        commitTextEditor();
        finish(canvas.toDataURL("image/png"));
      });
      doneBtn._restBackground = "#fff";
      doneBtn._hoverBackground = "#ececec";
      Object.assign(doneBtn.style, { background: doneBtn._restBackground, color: "#111", fontWeight: "600" });
      bar.append(toolButtons.rect, toolButtons.arrow, toolButtons.text, undoBtn, redoBtn, clearBtn, cancelBtn, doneBtn);
      updateHistoryButtons();
      overlay.style.pointerEvents = "none";
      canvas.style.pointerEvents = "auto";
      bar.style.pointerEvents = "auto";
      overlay.append(canvas, bar);
      document.documentElement.appendChild(overlay);
      setTool("pen");
      const point = (event) => ({ x: event.clientX, y: event.clientY });
      const restoreSnapshot = () => {
        if (!snapshot) return;
        ctx.putImageData(snapshot, 0, 0);
      };
      const drawArrow = (x1, y1, x2, y2) => {
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const head = 12;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      };
      canvas.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        const p = point(event);
        if (tool === "text") {
          event.preventDefault();
          event.stopPropagation();
          openTextEditor(p.x, p.y);
          return;
        }
        drawing = true;
        startX = p.x;
        startY = p.y;
        snapshot = captureState();
        pushUndo(snapshot);
        if (tool === "pen") {
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }
        canvas.setPointerCapture?.(event.pointerId);
        event.preventDefault();
      });
      canvas.addEventListener("pointermove", (event) => {
        if (!drawing) return;
        const p = point(event);
        if (tool === "pen") {
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        } else {
          restoreSnapshot();
          if (tool === "rect") {
            ctx.strokeRect(startX, startY, p.x - startX, p.y - startY);
          } else if (tool === "arrow") {
            drawArrow(startX, startY, p.x, p.y);
          }
        }
        event.preventDefault();
      });
      canvas.addEventListener("pointerup", (event) => {
        if (!drawing) return;
        drawing = false;
        const p = point(event);
        const completedTool = tool;
        if (tool === "pen") {
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
        }
        snapshot = null;
        if (completedTool === "rect" || completedTool === "arrow") setTool("pen");
        event.preventDefault();
      });
      const onKey = (event) => {
        const mod = event.ctrlKey || event.metaKey;
        if (mod && event.key.toLowerCase() === "z") {
          event.preventDefault();
          event.stopPropagation();
          if (event.shiftKey) redo();
          else undo();
          return;
        }
        if (mod && event.key.toLowerCase() === "y") {
          event.preventDefault();
          event.stopPropagation();
          redo();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          if (activeTextEditor) {
            cancelTextEditor();
            return;
          }
          finish(null);
        }
      };
      const onExternalCancel = (event) => {
        if (event.detail?.sessionId && event.detail.sessionId !== sessionId) return;
        finish(null);
      };
      overlay.addEventListener("DINSIDE_CANCEL_DRAW", onExternalCancel);
      window.addEventListener("keydown", onKey, true);
      function finish(value) {
        window.removeEventListener("keydown", onKey, true);
        overlay.removeEventListener("DINSIDE_CANCEL_DRAW", onExternalCancel);
        overlay.remove();
        requestAnimationFrame(() => requestAnimationFrame(() => resolve(value)));
      }
    });
  }
  function createAnnotationService({
    state: state2,
    messages,
    executeScript,
    sendRuntimeMessage,
    getActiveTab,
    isRestrictedUrl,
    cancelImageSelection,
    beginCaptureSession,
    captureSessionMatches,
    finishCaptureSession,
    cancelCaptureOverlay,
    attachScreenshotToEmbeddedProvider,
    setDrawButtonActive,
    setStatus,
    t,
    createImage,
    createCanvas
  }) {
    async function mergeAnnotationDataUrl(baseDataUrl, annotationDataUrl) {
      const [base, annotation] = await Promise.all([createImage(), createImage()]);
      base.src = baseDataUrl;
      annotation.src = annotationDataUrl;
      await Promise.all([base.decode(), annotation.decode()]);
      const canvas = createCanvas();
      canvas.width = base.naturalWidth;
      canvas.height = base.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(base, 0, 0);
      ctx.drawImage(annotation, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    }
    async function startDrawMode(tabId, sessionId = "") {
      const results = await executeScript({
        localEditorAction: "draw-start",
        target: { tabId },
        args: [Object.fromEntries(["Rect", "Arrow", "Text", "Undo (Ctrl+Z)", "Redo (Ctrl+Y / Ctrl+Shift+Z)", "Clear", "Cancel", "Done", "Type\u2026"].map((key) => [key, t(key)])), sessionId],
        func: drawAnnotationInPage
      });
      return results?.[0]?.result || null;
    }
    async function syncDrawModeUI() {
      try {
        const tab = await getActiveTab();
        if (!tab?.id || isRestrictedUrl(tab.url)) {
          setDrawButtonActive(false);
          return false;
        }
        const pageUrl = tab.url || "";
        let active = state2.drawModePages.get(tab.id) === pageUrl;
        if (active) {
          try {
            const result = await executeScript({
              localEditorAction: "draw-active",
              target: { tabId: tab.id },
              func: () => Boolean(document.getElementById("__dinside_draw_overlay__"))
            });
            active = Boolean(result?.[0]?.result);
          } catch (_) {
            active = false;
          }
          if (!active && state2.drawModePages.get(tab.id) === pageUrl) {
            state2.drawModePages.delete(tab.id);
          }
        }
        setDrawButtonActive(active);
        return active;
      } catch (_) {
        setDrawButtonActive(false);
        return false;
      }
    }
    async function drawOnPage() {
      if (state2.imagePicker) await cancelImageSelection();
      let tab = null;
      const session = beginCaptureSession("draw");
      const onCancel = () => cancelCaptureOverlay(session);
      session.abort.signal.addEventListener("abort", onCancel, { once: true });
      try {
        tab = await getActiveTab();
        if (!tab?.id) throw new Error(t("No active tab found."));
        if (isRestrictedUrl(tab.url)) throw new Error(t("Chrome internal pages cannot be drawn on."));
        const pageUrl = tab.url || "";
        session.tabId = tab.id;
        session.url = pageUrl;
        if (!await captureSessionMatches(session)) return null;
        if (state2.drawModePages.get(tab.id) === pageUrl) {
          try {
            await executeScript({
              localEditorAction: "cancel-draw",
              target: { tabId: tab.id },
              func: () => document.getElementById("__dinside_draw_overlay__")?.dispatchEvent(new CustomEvent("DINSIDE_CANCEL_DRAW"))
            });
          } catch (_) {
          }
          if (state2.drawModePages.get(tab.id) === pageUrl) state2.drawModePages.delete(tab.id);
          await syncDrawModeUI();
          setStatus(() => t("Draw cancelled"), "idle");
          return null;
        }
        state2.drawModePages.set(tab.id, pageUrl);
        state2.drawModeSessions.set(tab.id, session);
        setDrawButtonActive(true);
        setStatus(() => t("Draw on the page \xB7 Esc to cancel"), "busy");
        const annotation = await startDrawMode(tab.id, session.id);
        if (!await captureSessionMatches(session)) return null;
        if (!annotation) {
          setStatus(() => t("Draw cancelled"), "idle");
          return null;
        }
        const response = await sendRuntimeMessage({
          type: messages.CAPTURE_VISIBLE_TAB,
          tabId: tab.id,
          windowId: tab.windowId,
          url: tab.url
        });
        if (!await captureSessionMatches(session)) return null;
        if (!response?.ok || !response.dataUrl) throw new Error(response?.error || t("Capture failed."));
        const finalDataUrl = await mergeAnnotationDataUrl(response.dataUrl, annotation);
        if (!await captureSessionMatches(session)) return null;
        const attachResponse = await attachScreenshotToEmbeddedProvider(finalDataUrl, void 0, { signal: session.abort.signal });
        if (!await captureSessionMatches(session)) return null;
        if (!attachResponse?.ok) throw new Error(attachResponse?.error || t("Could not attach annotated screenshot."));
        setStatus(() => t("Annotated screenshot attached"), "ready");
        return finalDataUrl;
      } catch (error) {
        if (!session.abort.signal.aborted) setStatus(() => error.message || t("Draw failed"), "error");
        return null;
      } finally {
        session.abort.signal.removeEventListener("abort", onCancel);
        finishCaptureSession(session);
        if (tab?.id && state2.drawModeSessions.get(tab.id) === session) {
          state2.drawModePages.delete(tab.id);
          state2.drawModeSessions.delete(tab.id);
        }
        await syncDrawModeUI();
      }
    }
    return Object.freeze({ mergeAnnotationDataUrl, startDrawMode, syncDrawModeUI, drawOnPage });
  }
  var annotation_default = Object.freeze({ drawAnnotationInPage, createAnnotationService });

  // src/sidepanel/capture/local-editor-actions.js
  var editorPageActions = Object.freeze({
    "cancel-draw": () => document.getElementById("__dinside_draw_overlay__")?.dispatchEvent(new CustomEvent("DINSIDE_CANCEL_DRAW")),
    "draw-active": () => Boolean(document.getElementById("__dinside_draw_overlay__")),
    "draw-start": drawAnnotationInPage,
    "scroll-install": installSelectionScroll,
    "region-start": selectCaptureRegionInPage,
    "region-next": (id) => window.__DINSIDE_REGION_PICKER__?.next(id) || null,
    "region-resume": (id, status) => window.__DINSIDE_REGION_PICKER__?.resume(id, status) || false,
    "region-finish": (sessionId) => window.dispatchEvent(new CustomEvent("__DINSIDE_FINISH_CAPTURE__", { detail: { sessionId } })),
    "capture-cancel": (kind, sessionId) => {
      if (kind === "region") window.dispatchEvent(new CustomEvent("__DINSIDE_CANCEL_CAPTURE__", { detail: { sessionId } }));
      if (kind === "element") window.dispatchEvent(new CustomEvent("__DINSIDE_CANCEL_ELEMENT_PICKER__", { detail: { sessionId } }));
      if (kind === "draw") document.getElementById("__dinside_draw_overlay__")?.dispatchEvent(new CustomEvent("DINSIDE_CANCEL_DRAW", { detail: { sessionId } }));
    },
    "element-pick": (labels) => globalThis.__DINSIDE_ELEMENT_PICKER__.pick(labels),
    "page-pick": (labels) => globalThis.__DINSIDE_CANCELLED_FILE_PICKERS__?.has(labels.sessionId) ? null : globalThis.__DINSIDE_FILE_PICKER__.page.pick(labels),
    "page-next": (id) => globalThis.__DINSIDE_FILE_PICKER__?.page.next(id),
    "page-finish": (id) => globalThis.__DINSIDE_FILE_PICKER__?.page.finish(id),
    "page-result": (detail) => window.dispatchEvent(new CustomEvent("__DINSIDE_PAGE_PICK_RESULT__", { detail })),
    "image-read": (selection, labels) => globalThis.__DINSIDE_FILE_PICKER__.readImage(selection, labels),
    "image-pick": (labels) => globalThis.__DINSIDE_PICK_IMAGE__(labels),
    "image-cancel": (discard, sessionId) => window.dispatchEvent(new CustomEvent("__DINSIDE_CANCEL_IMAGE_PICKER__", { detail: { discard, sessionId } })),
    "image-result": (sessionId, src) => window.dispatchEvent(new CustomEvent("__DINSIDE_IMAGE_PICK_RESULT__", { detail: { sessionId, src, ok: false } })),
    "file-cancel": (id) => {
      const cancelled = globalThis.__DINSIDE_CANCELLED_FILE_PICKERS__ ||= /* @__PURE__ */ new Set();
      cancelled.add(id);
      if (cancelled.size > 32) cancelled.delete(cancelled.values().next().value);
      window.dispatchEvent(new CustomEvent("__DINSIDE_CANCEL_FILE_PICKER__", { detail: { sessionId: id } }));
    }
  });

  // integrations/local-text-editor/page-runtime.js
  var import_context_bridge = __toESM(require_context_bridge());

  // integrations/local-text-editor/picker-hooks.js
  function createEditorPickerHooks(getSource2) {
    function candidate(element, window2, point) {
      const source = getSource2(), { editor: editor2 } = source;
      if (!element?.closest(".monaco-editor")) return point ? pageCandidateFromElement(element, window2) : textPageCandidate(element, window2);
      if (!editor2.getDomNode()?.contains(element)) return null;
      const model = editor2.getModel();
      if (!model || model.isDisposed()) return null;
      const overlay = window2.document.getElementById("__dinside_page_picker__");
      const previous = overlay?.style.pointerEvents;
      let line;
      try {
        if (overlay) overlay.style.pointerEvents = "none";
        line = point && editor2.getTargetAtClientPoint(point.x, point.y)?.position?.lineNumber;
      } finally {
        if (overlay) overlay.style.pointerEvents = previous;
      }
      const ranges = editor2.getVisibleRanges();
      if (point && !line) return null;
      const start = line || ranges[0]?.startLineNumber || 1;
      const end = line || ranges.at(-1)?.endLineNumber || model.getLineCount();
      return {
        selectionType: "text",
        element: element.closest(".view-line") || element,
        editorModelId: model.uri.toString(),
        editorRange: {
          startLineNumber: start,
          startColumn: 1,
          endLineNumber: end,
          endColumn: model.getLineMaxColumn(end)
        }
      };
    }
    return {
      candidateFromElement: candidate,
      parentCandidate: (element, window2) => candidate(element, window2),
      readSelection(value, window2) {
        if (!value.editorRange) return pageSelectionResult(value, window2);
        const { editor: editor2, activeTab: activeTab2 } = getSource2(), model = editor2.getModel();
        if (!model || model.uri.toString() !== value.editorModelId) return null;
        const text = model.getValueInRange(value.editorRange).slice(0, 12e3);
        if (!text.trim()) return null;
        const name = activeTab2.name, { startLineNumber, endLineNumber } = value.editorRange;
        return {
          text,
          title: name,
          url: window2.location.href,
          pageUrl: window2.location.href,
          sourceRef: `${name}:${startLineNumber}-${endLineNumber}`,
          domContext: {
            section: name,
            element: "code",
            block: `Language: ${model.getLanguageId()}`,
            blockId: `local-editor:${value.editorModelId}:${startLineNumber}-${endLineNumber}`
          },
          selectionType: "text",
          selectionKey: `editor:${value.editorModelId}:${startLineNumber}-${endLineNumber}:${text}`
        };
      }
    };
  }

  // src/shared/page-drop.js
  var PAGE_DROP_MIME = "application/x-dinside-page-file";
  var PAGE_DROP_LIFETIME = 18e4;
  var validPageDropToken = (value) => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

  // src/shared/file-attachments.js
  var MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024;
  var mimeTypes = Object.freeze({
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain",
    md: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    rtf: "application/rtf",
    odt: "application/vnd.oasis.opendocument.text",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    bmp: "image/bmp",
    tif: "image/tiff",
    tiff: "image/tiff",
    heic: "image/heic",
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    flac: "audio/flac",
    zip: "application/zip",
    gz: "application/gzip",
    tar: "application/x-tar",
    "7z": "application/x-7z-compressed",
    rar: "application/vnd.rar",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    js: "text/javascript",
    xml: "application/xml",
    kml: "application/vnd.google-earth.kml+xml",
    kmz: "application/vnd.google-earth.kmz",
    yaml: "text/plain",
    yml: "text/plain",
    py: "text/x-python",
    ipynb: "application/x-ipynb+json",
    tsv: "text/tab-separated-values",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    odp: "application/vnd.oasis.opendocument.presentation",
    epub: "application/epub+zip"
  });
  function attachmentMimeType(file) {
    const supplied = String(file.type || "").toLowerCase();
    if (supplied && supplied !== "application/octet-stream") return supplied;
    return mimeTypes[String(file.name || "").split(".").at(-1).toLowerCase()] || supplied || "application/octet-stream";
  }

  // integrations/local-text-editor/file-drag.js
  function create4({ window: window2, getHandle, getTabs, getPath = (node, handle) => node.title || handle.name, isTrusted = (event) => event.isTrusted }) {
    const items = /* @__PURE__ */ new Map();
    function release(token, claimId) {
      const item = items.get(token);
      if (!item || item.claimId && item.claimId !== claimId) return;
      window2.clearTimeout(item.timer);
      items.delete(token);
    }
    function requireItem(token, claimId) {
      const item = validPageDropToken(token) && items.get(token);
      if (!item || !item.node.isConnected || typeof claimId !== "string" || !/^[\w:-]{1,128}$/.test(claimId)) {
        throw Error("The dragged file expired. Drag it again from Explorer.");
      }
      if (item.claimId && item.claimId !== claimId) throw Error("This dragged file is already in use.");
      return item;
    }
    async function prepare(item) {
      let open;
      for (const tab of getTabs()) {
        if (!tab.handle) continue;
        if (tab.handle === item.handle || await item.handle.isSameEntry?.(tab.handle)) {
          open = tab;
          break;
        }
      }
      const model = open?.model;
      if (model && !model.isDisposed()) {
        if (model.getValueLength() > MAX_ATTACHMENT_BYTES) throw Error("File attachments must be 50 MB or smaller.");
        return new window2.File([model.getValue()], item.handle.name, { type: attachmentMimeType({ name: item.handle.name }) });
      }
      const file = await item.handle.getFile();
      if (file.size > MAX_ATTACHMENT_BYTES) throw Error("File attachments must be 50 MB or smaller.");
      return file;
    }
    function start(event) {
      if (!isTrusted(event) || !event.dataTransfer) return;
      const node = event.target?.closest?.(".tree-item"), handle = node && getHandle(node);
      if (handle?.kind !== "file") return;
      const token = window2.crypto.randomUUID();
      if (items.size >= 32) {
        const oldest = items.keys().next().value;
        const old = items.get(oldest);
        release(oldest, old.claimId);
      }
      const item = { node, handle, claimId: null };
      item.timer = window2.setTimeout(() => release(token, item.claimId), PAGE_DROP_LIFETIME);
      items.set(token, item);
      event.dataTransfer.clearData();
      event.dataTransfer.setData(PAGE_DROP_MIME, token);
      event.dataTransfer.effectAllowed = "copy";
      event.stopPropagation();
    }
    const actions2 = {
      "file-drop-claim": async (token, claimId, mode = "file") => {
        const item = requireItem(token, claimId);
        if (!["file", "path"].includes(mode) || item.mode && item.mode !== mode) throw Error("Invalid editor drop mode.");
        item.claimId = claimId;
        item.mode = mode;
        if (mode === "path") {
          const path = await getPath(item.node, item.handle);
          if (items.get(token) !== item || !item.node.isConnected) throw Error("The dragged file expired. Drag it again from Explorer.");
          if (typeof path !== "string" || !path.trim() || path.length > 4096 || [...path].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)) throw Error("The editor file path is unavailable.");
          return { path };
        }
        item.file ||= prepare(item);
        const file = await item.file;
        if (items.get(token) !== item) throw Error("The dragged file expired. Drag it again from Explorer.");
        if (file.size > MAX_ATTACHMENT_BYTES) throw Error("File attachments must be 50 MB or smaller.");
        return { name: file.name, type: attachmentMimeType(file), size: file.size };
      },
      "file-drop-read": async (token, claimId, offset) => {
        const item = requireItem(token, claimId);
        if (!item.claimId || !item.file || !Number.isSafeInteger(offset) || offset < 0) throw Error("Invalid file read.");
        const file = await item.file;
        if (offset >= file.size) throw Error("Invalid file offset.");
        const bytes = new Uint8Array(await file.slice(offset, offset + 524288).arrayBuffer());
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        return { offset, data: window2.btoa(binary) };
      },
      "file-drop-release": (token, claimId) => {
        release(token, claimId);
        return null;
      }
    };
    function dispose() {
      window2.document.removeEventListener("dragstart", start, true);
      for (const [token, item] of items) release(token, item.claimId);
      window2.removeEventListener("pagehide", dispose);
    }
    window2.document.addEventListener("dragstart", start, true);
    window2.addEventListener("pagehide", dispose, { once: true });
    return Object.freeze({ actions: actions2, dispose });
  }

  // integrations/local-text-editor/page-runtime.js
  var getSource = () => ({ editor, activeTab, state, location, innerWidth, innerHeight });
  globalThis.__DINSIDE_FILE_PICKER__ = Object.freeze({
    ...create3(window),
    page: create3(window, createEditorPickerHooks(getSource)),
    readImage: (selection, labels) => readPageImage(selection, window, labels),
    version: 15
  });
  globalThis.__DINSIDE_ELEMENT_PICKER__ = create2(window);
  var fileDrag = create4({
    window,
    getHandle: (node) => window.__dinsideExplorerFiles?.get(node),
    getTabs: () => tabs,
    getPath: async (node, handle) => {
      for (const root of explorerFolders) {
        const relative = await root.handle.resolve(handle);
        if (relative) return [root.absolutePath?.replace(/[\\/]$/, "") || root.handle.name, ...relative].join("\\");
      }
      throw Error("The editor file path is unavailable.");
    }
  });
  var actions = { ...editorPageActions, ...fileDrag.actions, load: (files) => {
    if (!Array.isArray(files) || !files.every((file) => ["file-selection.js", "element-selection.js", "image-selection.js"].includes(file))) throw Error("Unsupported editor script.");
    return null;
  } };
  globalThis.__dinSideEditorContextBridge?.();
  globalThis.__dinSideEditorContextBridge = (0, import_context_bridge.install)({
    chrome,
    actions,
    getSource
  });
  (0, import_context_bridge.installEvents)({ chrome, window, getSource });
})();
