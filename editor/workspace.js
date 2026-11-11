"use strict";
(() => {
  const testNamespace = new URLSearchParams(location.search).get("workspaceTest");
  const databaseName = "localTextEditorWorkspaces" + (testNamespace ? "-test-" + testNamespace : "");
  const scopedSettings = new Set([WRAP_KEY, AUTOSAVE_KEY, INDENT_KEY, MULTI_TAB_KEY, PREVIEW_KEY, CURSOR_BLINKING_KEY]);
  const text = (vi, en) => language === "en" ? en : vi;
  const report = error => showError(text("Không thể lưu workspace: ", "Could not save workspace: ") + error.message);
  const cloneSettings = () => ({ wrap: elements.wrap.checked, autosave: elements.autosave.checked,
    indent: { ...indentSettings }, multipleTabs: multiTabEnabled, preview: previewEnabled, cursorBlinking });

  class WorkspaceStore {
    async open() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore("workspaces", { keyPath: "id" });
          request.result.createObjectStore("meta");
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    async transaction(stores, mode, action) {
      const db = await this.open();
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(stores, mode);let result;let failure;
          tx.oncomplete = () => resolve(result);
          tx.onerror = () => reject(failure || tx.error);
          tx.onabort = () => reject(failure || tx.error || new Error("Workspace transaction aborted"));
          try { action(tx, value => { result = value; }, error => { failure = error; tx.abort(); }); }
          catch (error) { failure = error; tx.abort(); }
        });
      } finally { db.close(); }
    }
    get(id) { return this.transaction(["workspaces"], "readonly", (tx, result) => {
      const r = tx.objectStore("workspaces").get(id);r.onsuccess = () => result(r.result);
    }); }
    list() { return this.transaction(["workspaces"], "readonly", (tx, result) => {
      const r = tx.objectStore("workspaces").getAll();r.onsuccess = () => result(r.result.map(record => ({ id: record.id, name: record.name, updatedAt: record.updatedAt, folders: record.folders.length, files: record.documents.length })));
    }); }
    last(id) { return this.transaction(["meta"], id ? "readwrite" : "readonly", (tx, result) => {
      const store = tx.objectStore("meta");const r = id ? store.put(id, "last") : store.get("last");r.onsuccess = () => result(r.result);
    }); }
    save(record, expectedRevision, preserveConflict = false) {
      return this.transaction(preserveConflict ? ["workspaces", "meta"] : ["workspaces"], "readwrite", (tx, result, fail) => {
        const store = tx.objectStore("workspaces");const request = store.get(record.id);
        request.onsuccess = () => {
          if ((request.result?.revision || 0) !== expectedRevision) {
            if (preserveConflict) {
              // Keep both sessions. Never replace the newer snapshot from another tab.
              const copy = { ...record, id: crypto.randomUUID(), name: record.name.slice(0, 80) + text(" (bản khôi phục)", " (recovered copy)"), revision: 1 };
              store.add(copy);tx.objectStore("meta").put(copy.id, "last");result(copy);return;
            }
            fail(new Error(text("Workspace này vừa thay đổi ở tab khác. Phiên hiện tại vẫn được giữ ở tab này.", "This workspace changed in another tab. The current session is still kept in this tab.")));return;
          }
          const next = { ...record, revision: expectedRevision + 1 };
          store.put(next);result(preserveConflict ? next : next.revision);
        };
      });
    }
  }

  class WorkspaceManager {
    constructor() {
      this.store = new WorkspaceStore();this.current = null;this.restoring = true;this.disposed = false;
      this.timer = null;this.writes = Promise.resolve();this.revisions = new Map();this.defaultSettings = null;
      this.sessionCopies = new Map();
      this.visibility = () => { if (document.visibilityState === "hidden") this.saveNow().catch(report); };
      this.unload = () => { this.saveNow().catch(report); };
      document.addEventListener("visibilitychange", this.visibility);
      window.addEventListener("pagehide", this.unload);
      this.bindUI();
    }
    isActive() { return !!this.current && !this.disposed; }
    handlesSetting(key) { return this.isActive() && scopedSettings.has(key); }
    capture() {
      snapshotTab();
      return { version: 1, id: this.current.id, name: this.current.name, updatedAt: Date.now(),
        folders: explorerFolders.map(root => ({ handle: root.handle, absolutePath: root.absolutePath || "" })),
        documents: tabs.map(tab => ({ name: tab.name, kind: tab.kind, handle: tab.handle, sourceUrl: tab.sourceUrl, text: tab.model.getValue(),
          cleanText: tab.cleanText, baselineHash: tab.baselineHash, eol: tab.eol, bom: tab.bom, displayPath: tab.displayPath,
          preview: tab.preview, language: tab.model.getLanguageId() })),
        groups: editorGroups.map(group => ({ id: group.id, documents: tabs.flatMap((tab, i) => tab.groups.has(group.id) ? [i] : []),
          active: tabs.indexOf(groupActive[group.id]), views: [...group.viewStates].flatMap(([tab, view]) => tabs.includes(tab) ? [[tabs.indexOf(tab), view]] : []) })),
        activeGroup, scrollLeft: editorGroupsHost.scrollLeft, explorerHidden: explorerPanel.hidden, explorerWidth, gitPaths: window.localSourceControl?.getPaths() || [], gitVisible: window.localSourceControl?.isVisible() || false, gitHistoryHeight: window.localSourceControl?.getHistoryHeight() ?? 220, settings: cloneSettings() };
    }
    scheduleSave() {
      if (!this.isActive() || this.restoring) return;
      clearTimeout(this.timer);this.timer = setTimeout(() => this.saveNow().catch(report), 350);
    }
    saveNow() {
      clearTimeout(this.timer);
      if (!this.isActive() || this.restoring) return this.writes;
      const record = this.capture();
      const operation = this.writes.catch(() => {}).then(async () => {
        const replacement = this.sessionCopies.get(record.id);
        const snapshot = replacement ? { ...record, ...replacement } : record;
        const saved = await this.store.save(snapshot, this.revisions.get(snapshot.id) || 0, true);
        this.revisions.set(saved.id, saved.revision);
        if (saved.id !== snapshot.id) {
          this.sessionCopies.set(record.id, { id: saved.id, name: saved.name });
          showStatus(text("Đã giữ phiên này trong bản sao workspace riêng.", "This session was saved in a separate workspace copy."), "ok");
        }
        if (this.current?.id === record.id || this.current?.id === snapshot.id) {
          Object.assign(this.current, { id: saved.id, name: saved.name, updatedAt: saved.updatedAt });
          this.updateLabels();
        }
        return saved.revision;
      });
      this.writes = operation;return operation;
    }
    async start() {
      await editorPreferencesReady;this.defaultSettings = cloneSettings();
      const last = await this.store.last();let record = last ? await this.store.get(last) : null;
      if (!record) {
        if (!testNamespace) await restoreFolder();
        this.current = { id: crypto.randomUUID(), name: text("Workspace chưa đặt tên", "Untitled Workspace") };
        record = this.capture();this.restoring = false;await this.saveNow();this.restoring = true;
      }
      await this.apply(record);await this.store.last(record.id);
      const source = new URLSearchParams(location.search).get("file");
      if (source) await openFromFileUrl(source);
      this.updateLabels();return this;
    }
    async apply(record) {
      if (record.version !== 1 || !Array.isArray(record.documents) || !Array.isArray(record.groups) || !record.groups.length) throw new Error("Invalid workspace");
      if (state.saving) throw new Error(text("Hãy đợi lưu file xong.", "Wait for the current file save to finish."));
      this.restoring = true;clearTimeout(this.timer);clearTimeout(autoSaveTimer);state.saving = true;
      for (const group of editorGroups) group.editor.updateOptions({ readOnly: true });
      const models=[];const created=[];const imageUrls=[];let committed=false;let unavailable=0;
      try {
        const docs = await Promise.all(record.documents.map(async saved => {
          let doc = { ...saved };
          if (typeof doc.name !== "string" || typeof doc.text !== "string" || typeof doc.cleanText !== "string") throw new Error("Invalid workspace document");
          if (doc.kind === "image") {
            try {
              let file;
              if (doc.handle) {
                if (typeof doc.handle.queryPermission === "function" && await doc.handle.queryPermission({ mode: "read" }) !== "granted") throw new Error("Permission required");
                file = await doc.handle.getFile();
              } else if (doc.sourceUrl) {
                const response = await fetch(doc.sourceUrl, { cache: "no-store" });
                if (!response.ok) throw new Error("Could not read image");
                file = await response.blob();
              } else throw new Error("No image source");
              doc.imageUrl = URL.createObjectURL(new Blob([file], { type: imageType(doc.name) }));
              imageUrls.push(doc.imageUrl);
            } catch { unavailable++; }
            return doc;
          }
          if (doc.text === doc.cleanText && doc.handle) {
            try {
              const granted = typeof doc.handle.queryPermission !== "function" || await doc.handle.queryPermission({ mode: "read" }) === "granted";
              if (granted) {
                const file = await doc.handle.getFile();const bytes = new Uint8Array(await file.arrayBuffer());const decoded = decodeBytes(bytes);
                doc = { ...doc, text: decoded.text, cleanText: decoded.text, eol: decoded.eol, bom: decoded.bom, baselineHash: await hashBytes(bytes) };
              } else unavailable++;
            } catch { unavailable++; }
          }
          if (!doc.handle && doc.sourceUrl?.startsWith("file:") && window.localFileAccess) {
            if (doc.text === doc.cleanText) {
              try {
                const response = await fetch(doc.sourceUrl, { cache: "no-store" });
                if (!response.ok) throw new Error("Could not read file");
                const bytes = new Uint8Array(await response.arrayBuffer()), decoded = decodeBytes(bytes);
                doc = { ...doc, text: decoded.text, cleanText: decoded.text, eol: decoded.eol, bom: decoded.bom, baselineHash: await hashBytes(bytes) };
              } catch { unavailable++; }
            }
            try { await window.localFileAccess.bind(doc.sourceUrl, doc.baselineHash); }
            catch { /* Keep the workspace draft; saving will report disk conflicts. */ }
          }
          return doc;
        }));
        const groupIds = new Set(record.groups.map(group => group.id));
        if (groupIds.size !== record.groups.length || record.groups.some(group => !Number.isInteger(group.id) || group.id < 0 || !Array.isArray(group.documents) || group.documents.some(i => !Number.isInteger(i) || !docs[i]))) throw new Error("Invalid workspace groups");
        for (const doc of docs) models.push(monaco.editor.createModel(doc.text, doc.language || languageForFile(doc.name)));
        const settings = { ...this.defaultSettings, ...record.settings };
        indentSettings = { ...this.defaultSettings.indent, ...settings.indent };
        for (const saved of record.groups) {
          const node = createEditorGroupNode(saved.id);
          // Nodes are attached together after their models are ready.
          const instance = monaco.editor.create(node.querySelector(".monaco-container"), {
            model: null, automaticLayout: true, readOnly: true,
            fontFamily: '"Cascadia Code", Consolas, "Courier New", monospace', fontSize: 16, lineHeight: 26.4,
            minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: settings.wrap ? "on" : "off", ...indentSettings, cursorBlinking: normalizeCursorBlinking(settings.cursorBlinking),
            folding: true, renderLineHighlight: "line", fixedOverflowWidgets: true
          });
          created.push(describeEditorGroup(saved.id, node, instance));
        }
        switchingModel = true;
        for (const group of editorGroups) { group.editor.setModel(null);group.editor.dispose(); }
        for (const tab of tabs) disposeTab(tab);
        tabs.splice(0);for (const id of Object.keys(groupActive)) delete groupActive[id];
        editorGroups.splice(0, editorGroups.length, ...created);
        editorGroupsHost.replaceChildren(...created.map(group => group.node));
        docs.forEach((doc, i) => {
          models[i].updateOptions(indentSettings);
          tabs.push({ ...doc, model: models[i], dirty: doc.text !== doc.cleanText,
            groups: new Set(record.groups.filter(group => group.documents.includes(i)).map(group => group.id)) });
        });
        for (let i=0;i<created.length;i++) {
          const group=created[i],saved=record.groups[i];
          const tab = saved.documents.includes(saved.active) ? tabs[saved.active] : tabs[saved.documents[0]] || null;
          groupActive[group.id]=tab;group.editor.setModel(tab?.model || null);
          for (const [index, view] of saved.views || []) if (tabs[index] && saved.documents.includes(index)) group.viewStates.set(tabs[index], view);
          if (tab && group.viewStates.has(tab)) group.editor.restoreViewState(group.viewStates.get(tab));
          group.editor.updateOptions({ readOnly: !tab || tab.kind === "image" });bindEditorGroup(group);
        }
        nextGroupId = Math.max(...created.map(group => group.id)) + 1;
        activeTab=null;activeGroup=-1;editor=created[0].editor;switchingModel=false;
        this.current={ id:record.id,name:record.name,updatedAt:record.updatedAt };
        this.sessionCopies.clear();
        this.revisions.set(record.id, record.revision || this.revisions.get(record.id) || 0);
        applyCursorBlinking(settings.cursorBlinking);
        elements.autosave.checked=settings.autosave !== false;
        applyWrap(settings.wrap === true);setPreviewEnabled(settings.preview === true);
        applyMultiTab(created.length > 1 || settings.multipleTabs !== false);
        restoreExplorerWidth(record.explorerWidth);
        explorerPanel.hidden=record.explorerHidden === true;explorerToggle.setAttribute("aria-expanded",String(!explorerPanel.hidden));
        state.saving=false;
        switchEditorGroup(groupIds.has(record.activeGroup) ? record.activeGroup : created[0].id);
        await setExplorerFolders(record.folders || []);
        window.localSourceControl?.setHistoryHeight(record.gitHistoryHeight);
        window.localSourceControl?.setPaths(record.gitPaths || []);
        window.localSourceControl?.setVisible(record.gitVisible === true);
        editorGroupsHost.scrollLeft=record.scrollLeft || 0;
        committed=true;this.updateLabels();refresh();
        if (unavailable) showError(text("Một số file đang hiển thị bản lưu trong workspace. Cấp lại quyền thư mục để đọc file trên ổ đĩa.", "Some files are showing workspace snapshots. Restore folder access to read their disk contents."));
      } finally {
        switchingModel=false;state.saving=false;this.restoring=false;
        if (!committed) {
          for (const url of imageUrls) URL.revokeObjectURL(url);
          for (const group of created) if (!editorGroups.includes(group)) group.editor.dispose();
          for (const model of models) if (!editorGroups.some(group=>group.editor.getModel()===model)) model.dispose();
          for (const group of editorGroups) group.editor.updateOptions({ readOnly: !group.editor.getModel() });
        }
        this.updateLabels();
      }
    }
    async refreshFolderFiles(directory) {
      if (this.restoring || state.saving) return;
      for (const tab of [...tabs]) {
        if (tab.kind === "image" || tab.dirty || !tab.handle) continue;
        try {
          if (directory && !await directory.resolve(tab.handle)) continue;
          const model=tab.model,version=model.getVersionId();
          const file=await tab.handle.getFile();const bytes=new Uint8Array(await file.arrayBuffer());
          const decoded=decodeBytes(bytes);const baselineHash=await hashBytes(bytes);
          if (!tabs.includes(tab)||model.isDisposed()||model.getVersionId()!==version||tab.dirty) continue;
          Object.assign(tab,{cleanText:decoded.text,text:decoded.text,eol:decoded.eol,bom:decoded.bom,baselineHash,dirty:false});
          if(model.getValue()!==decoded.text){switchingModel=true;model.setValue(decoded.text);switchingModel=false;}
          if(tab===activeTab)Object.assign(state,{cleanText:tab.cleanText,eol:tab.eol,bom:tab.bom,baselineHash:tab.baselineHash,dirty:false});
        } catch(error) { console.warn("Could not refresh workspace file:",error); }
        finally { switchingModel=false; }
      }
      refresh();this.scheduleSave();
    }
    async open(id) {
      await this.ready;if(state.saving||this.restoring) throw new Error(text("Hãy đợi thao tác lưu/khôi phục hoàn tất.", "Wait for the save or restore to finish."));
      await this.saveNow();
      const record=await this.store.get(id);if(!record)throw new Error(text("Không tìm thấy workspace.","Workspace not found."));
      await this.apply(record);await this.store.last(id);
    }
    async create(name) {
      await this.ready;if(state.saving||this.restoring)throw new Error(text("Hãy đợi thao tác lưu/khôi phục hoàn tất.", "Wait for the save or restore to finish."));
      name=name.trim();if(!name||name.length>100)throw new Error(text("Tên workspace không hợp lệ.","Invalid workspace name."));
      await this.saveNow();
      const record={version:1,id:crypto.randomUUID(),name,updatedAt:Date.now(),revision:0,folders:[],documents:[],groups:[{id:0,documents:[],active:-1,views:[]}],activeGroup:0,settings:{...this.defaultSettings,indent:{...this.defaultSettings.indent}}};
      const revision=await this.store.save(record,0);record.revision=revision;
      await this.apply(record);await this.store.last(record.id);return record.id;
    }
    async rename(name) {
      await this.ready;name=name.trim();if(!name||name.length>100)throw new Error(text("Tên workspace không hợp lệ.","Invalid workspace name."));
      const old=this.current.name;this.current.name=name;
      try{await this.saveNow();this.updateLabels()}catch(error){this.current.name=old;throw error}
    }
    updateLabels() {
      const labels={"workspace-new":["Workspace mới…","New workspace…"],"workspace-open":["Mở workspace…","Open workspace…"],"workspace-rename":["Đổi tên workspace…","Rename workspace…"],"workspace-add-folder":["Thêm thư mục vào workspace…","Add folder to workspace…"],"workspace-save":["Lưu workspace","Save workspace"],"workspace-open-title":["Mở workspace","Open workspace"],"workspace-open-close":["Đóng","Close"],"workspace-name-label":["Tên workspace","Workspace name"],"workspace-name-cancel":["Hủy","Cancel"]};
      for(const [id,pair]of Object.entries(labels))document.getElementById(id).textContent=text(...pair);
      document.getElementById("workspace-menu-btn").disabled=!this.isActive()||this.restoring;
    }
    bindUI() {
      const button=document.getElementById("workspace-menu-btn"),menu=document.getElementById("workspace-menu-options");
      button.disabled=true;
      const close=()=>{menu.hidden=true;button.setAttribute("aria-expanded","false")};
      button.addEventListener("click",()=>{if(state.saving)return;menu.hidden=!menu.hidden;button.setAttribute("aria-expanded",String(!menu.hidden))});
      button.addEventListener("keydown",event=>{if(event.key==="ArrowDown"){event.preventDefault();menu.hidden=false;button.setAttribute("aria-expanded","true");menu.querySelector("button").focus()}});
      document.addEventListener("pointerdown",event=>{if(!button.contains(event.target)&&!menu.contains(event.target))close()});
      menu.addEventListener("keydown",event=>{
        if(event.key==="Escape"){close();button.focus()}
        if(event.key==="Tab")close();
        if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();const items=[...menu.querySelectorAll('button:not(:disabled)')],index=items.indexOf(document.activeElement);items[(index+(event.key==="ArrowDown"?1:-1)+items.length)%items.length].focus()}
      });
      document.getElementById("workspace-add-folder").addEventListener("click",()=>{close();chooseFolder(true)});
      document.getElementById("workspace-save").addEventListener("click",async()=>{close();try{await this.saveNow();showStatus(text("Đã lưu workspace","Workspace saved"),"ok")}catch(error){report(error)}});
      const nameDialog=document.getElementById("workspace-name-dialog"),input=document.getElementById("workspace-name-input"),error=document.getElementById("workspace-name-error");
      let naming="new";
      const promptName=mode=>{close();naming=mode;document.getElementById("workspace-name-title").textContent=mode==="new"?text("Workspace mới","New workspace"):text("Đổi tên workspace","Rename workspace");document.getElementById("workspace-name-submit").textContent=mode==="new"?text("Tạo","Create"):text("Lưu","Save");input.value=mode==="new"?"":this.current.name;error.hidden=true;nameDialog.showModal();input.focus();input.select()};
      document.getElementById("workspace-new").addEventListener("click",()=>promptName("new"));
      document.getElementById("workspace-rename").addEventListener("click",()=>promptName("rename"));
      document.getElementById("workspace-name-cancel").addEventListener("click",()=>nameDialog.close());
      document.getElementById("workspace-name-form").addEventListener("submit",async event=>{
        event.preventDefault();const submit=document.getElementById("workspace-name-submit");submit.disabled=true;
        try{if(naming==="new")await this.create(input.value);else await this.rename(input.value);nameDialog.close()}
        catch(err){error.textContent=err.message;error.hidden=false}finally{submit.disabled=false}
      });
      const openDialog=document.getElementById("workspace-open-dialog");
      document.getElementById("workspace-open-close").addEventListener("click",()=>openDialog.close());
      document.getElementById("workspace-open").addEventListener("click",async()=>{
        close();try{
          await this.saveNow();
          const records=(await this.store.list()).sort((a,b)=>b.updatedAt-a.updatedAt);const list=document.getElementById("workspace-list");list.replaceChildren();
          for(const record of records){
            const item=document.createElement("button");item.type="button";item.className="workspace-list-item";
            const title=document.createElement("strong");title.textContent=(record.id===this.current?.id?"✓ ":"")+record.name;
            const detail=document.createElement("span");detail.textContent=text(`${record.folders} thư mục · ${record.files} file`,`${record.folders} ${record.folders === 1 ? "folder" : "folders"} · ${record.files} ${record.files === 1 ? "file" : "files"}`);item.append(title,detail);
            item.addEventListener("click",async()=>{item.disabled=true;try{if(record.id!==this.current.id)await this.open(record.id);openDialog.close()}catch(error){report(error)}finally{item.disabled=false}});list.append(item);
          }openDialog.showModal();
        }catch(error){report(error)}
      });
      this.languageObserver=new MutationObserver(()=>this.updateLabels());this.languageObserver.observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
    }
    async dispose() {
      window.localFileSync?.stop();
      clearTimeout(this.timer);this.disposed=true;
      document.removeEventListener("visibilitychange",this.visibility);window.removeEventListener("pagehide",this.unload);
      this.languageObserver.disconnect();await this.writes.catch(()=>{});
    }
    async deleteTestDatabase() {
      if(!testNamespace)throw new Error("Only isolated test databases can be deleted");
      await this.dispose();return new Promise((resolve,reject)=>{const request=indexedDB.deleteDatabase(databaseName);request.onsuccess=resolve;request.onerror=()=>reject(request.error)});
    }
  }
  const manager=new WorkspaceManager();window.localWorkspace=manager;
  manager.ready=manager.start().catch(error=>{manager.restoring=false;report(error);throw error});
  // Attach a handler immediately; callers can still await ready and receive startup errors.
  manager.ready.catch(()=>{});
})();
