"use strict";
(() => {
  const $ = id => document.getElementById(id);
  const panel = $("git-panel"), toggle = $("git-toggle"), content = $("git-content"), status = $("git-status");
  const text = (vi, en) => language === "en" ? en : vi;
  let paths = [], repositories = [], selected = "", port = null, sequence = 0, revision = 0, busy = false;
  let diffEditor = null, diffModels = [];
  const pending = new Map(), drafts = new Map();
  const key = value => value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  function notify(message = "", error = false) { status.textContent = message; status.classList.toggle("error", error); }
  function fail(error) { const message = error.message || String(error); gitOutput.push(message); notify(message, true); }
  function connection() {
    if (port) return port;
    const active = chrome.runtime.connectNative("dinkit.editor"); port = active;
    active.onMessage.addListener(message => {
      if (message.type !== "gitResult") return;
      const task = pending.get(message.id); if (!task) return;
      pending.delete(message.id);
      if (message.error) { gitOutput.push(`[${task.operation}] ${message.error}`); task.reject(new Error(message.error)); }
      else { if (task.operation !== "status") gitOutput.push(`[${task.operation}] ${message.result?.output?.trim() || text("Hoàn tất", "Completed")}`); task.resolve(message.result); }
      if (gitOutput.length > 300) gitOutput.splice(0, gitOutput.length - 300);
    });
    active.onDisconnect.addListener(() => {
      const nativeError = chrome.runtime.lastError;
      if (port === active) port = null;
      for (const task of pending.values()) task.reject(new Error(text("Không kết nối được Git host. Cài terminal host theo README và kiểm tra Git đã cài. ", "Git host unavailable. Install the terminal host following README and check Git is installed. ") + (nativeError?.message || "")));
      pending.clear();
    });
    return active;
  }
  function request(operation, cwd, extra = {}) {
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      try { const active = connection(); pending.set(id, { resolve, reject, operation }); active.postMessage({ type: "git", id, operation, cwd, ...extra }); }
      catch (error) { pending.delete(id); reject(error); }
    });
  }
  function button(label, title, onClick) {
    const node = document.createElement("button"); node.type = "button"; node.className = "git-plain";
    node.textContent = label; node.title = title; node.setAttribute("aria-label", title);
    node.addEventListener("click", onClick); node.disabled = busy;
    return node;
  }
  function setBusy(value) {
    busy = value; panel.setAttribute("aria-busy", String(value));
    for (const node of panel.querySelectorAll("button, textarea, select, input")) node.disabled = value;
    if (!value) render();
  }
  function currentRepo() { return repositories.find(repo => key(repo.path) === key(selected)); }
  const expandedRepos = new Set(), optionsRepos = new Set(), collapsedFileSections = new Set();
  const expandedSections = { repositories: true, changes: true, history: true };
  let repositoryMenu = "";
  let historyHeight = 220;
  function applyHistoryHeight() {
    const history = content.querySelector(".git-history-pane"), splitter = content.querySelector(".git-history-splitter");
    if (!history || !splitter || history.classList.contains("collapsed")) return;
    const available = content.clientHeight;
    const max = Math.max(28, available - 70 - splitter.offsetHeight);
    const min = Math.min(100, max);
    const height = Math.min(max, Math.max(min, historyHeight));
    history.style.flexBasis = height + "px";
    splitter.setAttribute("aria-valuemin", String(Math.round(min)));
    splitter.setAttribute("aria-valuemax", String(Math.round(max)));
    splitter.setAttribute("aria-valuenow", String(Math.round(height)));
    splitter.setAttribute("aria-valuetext", Math.round(height) + " px");
  }
  function setHistoryHeight(value, save = false) {
    if (!Number.isFinite(value)) return;
    const splitter = content.querySelector(".git-history-splitter");
    const max = Math.max(28, content.clientHeight - 70 - (splitter?.offsetHeight || 0));
    historyHeight = Math.round(Math.min(max, Math.max(Math.min(100, max), value)));
    applyHistoryHeight();
    if (save) window.localWorkspace?.scheduleSave();
  }
  new ResizeObserver(applyHistoryHeight).observe(content);
  function rowIcon(pathData) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", pathData); svg.append(path); return svg;
  }
  function disclosureIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16"); svg.setAttribute("aria-hidden", "true"); svg.classList.add("git-disclosure-icon");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path"); path.setAttribute("d", "M6 3.5 10.5 8 6 12.5"); svg.append(path); return svg;
  }
  function repositoryIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16"); svg.setAttribute("aria-hidden", "true"); svg.classList.add("git-repo-icon");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M3.5 2.25h9a1 1 0 0 1 1 1v8.5h-11v-8.5a1 1 0 0 1 1-1ZM2.5 11.75h11M5.5 14h5"); svg.append(path); return svg;
  }
  const gitOutput = [];
  function closeRepositoryMenu() {
    repositoryMenu = "";
    document.querySelectorAll(".git-repository-menu, .git-menu-submenu").forEach(node => node.remove());
    panel.querySelectorAll(".git-repository-more").forEach(node => node.setAttribute("aria-expanded", "false"));
  }
  function showRepoControls(repo, focus = "select") {
    closeRepositoryMenu(); selected = repo.path; expandedSections.changes = true; expandedRepos.add(key(repo.path)); optionsRepos.add(key(repo.path)); render();
    const target = [...content.querySelectorAll(".git-repo-body")].find(node => key(node.dataset.repo) === key(repo.path));
    target?.querySelector(focus)?.focus(); target?.scrollIntoView({ block: "nearest" });
  }
  async function listOperation(repo, operation, extra = {}) {
    try { return await request(operation, repo.path, extra); } catch (error) { fail(error); return null; }
  }
  async function askInput(title, label, value = "") { return window.gitDialog.input({ title, label, value, confirm: text("Tiếp tục", "Continue") }); }
  async function chooseItem(title, items) { return window.gitDialog.choose({ title, items, empty: text("Không có mục nào.", "No items found.") }); }
  async function actOnList(repo, listOp, prop, operation, title, convert = x => ({ label: x, value: x })) {
    const result = await listOperation(repo, listOp); if (!result) return;
    const selectedValue = await chooseItem(title, result[prop].map(convert));
    if (selectedValue === null) return;
    if (["stashDrop", "tagDelete", "remoteRemove"].includes(operation)) {
      const choice = await chooseItem(text("Xác nhận xóa: ", "Confirm removal: ") + selectedValue,
        [{ label: text("Xóa", "Remove"), value: "remove" }, { label: text("Hủy", "Cancel"), value: "cancel" }]);
      if (choice !== "remove") return;
    }
    await mutate(repo, operation, { [prop === "stashes" ? "ref" : "name"]: selectedValue });
  }
  async function doClone() {
    const url = await askInput(text("Clone repository", "Clone repository"), text("URL repository", "Repository URL")); if (url === null || !url.trim()) return;
    const cwd = await askInput(text("Clone repository", "Clone repository"), text("Đường dẫn thư mục chứa", "Absolute path to parent folder")); if (cwd === null || !cwd.trim()) return;
    const name = await askInput(text("Clone repository", "Clone repository"), text("Tên thư mục mới", "New folder name")); if (name === null || !name.trim()) return;
    setBusy(true);
    try { const repo = await request("clone", cwd, { url: url.trim(), name: name.trim() });
      if (!paths.some(path => key(path) === key(repo.path))) paths.push(repo.path);
      repositories.push(repo); selected = repo.path; expandedRepos.add(key(repo.path)); window.localWorkspace?.scheduleSave(); notify(text("Clone thành công.", "Clone completed."));
    } catch (error) { fail(error); } finally { setBusy(false); }
  }
  async function stageAll(repo, staged) {
    const entries = repo.changes.filter(e => staged ? e.index !== " " && e.index !== "?" : e.worktree !== " ");
    for (const entry of entries) { if (!await mutate(repo, staged ? "unstage" : "stage", { path: entry.path })) break; }
  }
  function openRepositoryMenu(repo, anchor) {
    const disabledRemote = !repo.remotes.length;
    const item = (label, run, disabled = false) => ({ label, run, disabled });
    const remoteAction = op => () => mutate(repo, op, {});
    const branchControls = () => showRepoControls(repo, ".git-branch-tools select");
    const createBranch = async () => { const branch = await askInput(text("Tạo nhánh", "Create branch"), text("Tên nhánh", "Branch name")); if (branch) await mutate(repo, "createBranch", { branch }); };
    const remoteAdd = async () => { const name = await askInput(text("Thêm remote", "Add remote"), text("Tên remote", "Remote name")); if (!name) return; const url = await askInput(text("Thêm remote", "Add remote"), "URL"); if (url) await mutate(repo, "remoteAdd", { name, url }); };
    const tagCreate = async () => { const name = await askInput(text("Tạo tag", "Create tag"), text("Tên tag", "Tag name")); if (name) await mutate(repo, "tagCreate", { name }); };
    const stashCreate = async () => { const message = await askInput(text("Lưu thay đổi vào stash", "Stash changes"), text("Ghi chú (có thể để trống)", "Message (optional)")); if (message !== null) await mutate(repo, "stashCreate", { message }); };
    const stashChoice = action => () => actOnList(repo, "stashList", "stashes", action, text("Chọn stash", "Select stash"), x => ({ label: x.ref, detail: x.subject, value: x.ref }));
    const worktreeShow = async () => { const r = await listOperation(repo, "worktreeList"); if (r) await window.gitDialog.output({ title: "Worktrees", text: r.worktrees.map(w => `${w.path}\n  ${w.branch || w.head || ""}`).join("\n\n") || text("Không có worktree.", "No worktrees.") }); };
    const worktreeAdd = async () => { const dest = await askInput(text("Thêm worktree", "Add worktree"), text("Đường dẫn tuyệt đối mới", "New absolute path")); if (!dest) return; const branch = await chooseItem(text("Chọn nhánh", "Select branch"), repo.branches.filter(b => b.name !== repo.branch).map(b => ({ label: b.name, value: b.name }))); if (branch) await mutate(repo, "worktreeAdd", { destination: dest, branch }); };
    const confirmAction = async detail => (await chooseItem(detail, [{ label: text("Tiếp tục", "Continue"), value: "yes" }, { label: text("Hủy", "Cancel"), value: "no" }])) === "yes";
    const pickBranch = async (title, includeCurrent = false) => chooseItem(title, repo.branches.filter(b => includeCurrent || b.name !== repo.branch).map(b => ({ label: b.name, value: b.name })));
    const pickRemote = async title => chooseItem(title, repo.remotes.map(name => ({ label: name, value: name })));
    const chooseRemoteBranch = async (title, defaultBranch = repo.branch) => {
      const remote = await pickRemote(title); if (remote === null) return null;
      const branch = await askInput(title, text("Tên nhánh trên remote", "Remote branch name"), defaultBranch); return branch ? { remote, branch: branch.trim() } : null;
    };
    const remoteBranchOp = op => async () => { const params = await chooseRemoteBranch(op); if (!params) return; if (["deleteRemoteBranch"].includes(op) && !await confirmAction(text("Xóa nhánh remote: ", "Delete remote branch: ") + params.remote + "/" + params.branch)) return; await mutate(repo, op, params); };
    const selectedBranchOp = (op, title) => async () => { const branch = await pickBranch(title); if (!branch) return; if (op === "deleteBranch" && !await confirmAction(text("Xóa nhánh: ", "Delete branch: ") + branch)) return; await mutate(repo, op, { branch }); };
    const commitVariant = (scope, amend, signedOff) => async () => {
      const title = "Commit" + (amend ? " (Amend)" : "") + (signedOff ? " (Signed Off)" : "");
      const message = await askInput(title, text("Thông điệp commit", "Commit message"), drafts.get(key(repo.path)) || ""); if (message === null || !message.trim()) return;
      if (amend && !await confirmAction(text("Sửa commit cuối: ", "Amend the last commit: ") + repo.name)) return;
      if (scope === "all" && !await confirmAction(text("Commit tất cả thay đổi trên ổ đĩa, gồm cả file chưa theo dõi?", "Commit all disk changes, including untracked files?"))) return;
      await mutate(repo, "commitVariant", { message, scope, amend, signoff: signedOff, expectedHead: repo.headHash || "" });
    };
    const safeHeadOp = (op, label) => async () => { if (await confirmAction(label + " · " + repo.name)) await mutate(repo, op, { confirmed: true, expectedHead: repo.headHash || "" }); };
    const discardAll = async () => { const entries = repo.changes.filter(e => e.worktree !== " "); const paths = entries.map(e => e.path); if (!paths.length) { notify(text("Không có thay đổi chưa stage để bỏ.", "No unstaged changes to discard.")); return; } const untracked = entries.filter(e => e.worktree === "?").length; if (await confirmAction(text("Bỏ thay đổi chưa stage trong ", "Discard unstaged changes in ") + paths.length + text(" file? File đã stage được giữ lại. File chưa theo dõi sẽ bị xóa: ", " files? Staged changes are kept. Untracked files will be deleted: ") + untracked)) await mutate(repo, "discardAllChanges", { confirmed: true, paths }); };
    const renameBranch = async () => { const branch = await askInput(text("Đổi tên nhánh hiện tại", "Rename current branch"), text("Tên nhánh mới", "New branch name"), repo.branch); if (branch && branch !== repo.branch) await mutate(repo, "renameBranch", { branch }); };
    const createBranchFrom = async () => { const from = await pickBranch(text("Chọn nhánh gốc", "Select base branch"), true); if (!from) return; const branch = await askInput(text("Tạo nhánh", "Create branch"), text("Tên nhánh mới", "New branch name")); if (branch) await mutate(repo, "createBranchFrom", { branch, from }); };
    const remoteOnly = op => async () => { const remote = await pickRemote(op); if (remote) await mutate(repo, op, { remote }); };
    const remoteTagDelete = async () => { const remote = await pickRemote(text("Chọn remote", "Select remote")); if (!remote) return; const name = await askInput(text("Xóa tag remote", "Delete remote tag"), text("Tên tag", "Tag name")); if (name && await confirmAction(text("Xóa tag remote ", "Delete remote tag ") + remote + "/" + name)) await mutate(repo, "tagDeleteRemote", { remote, name }); };
    const stashCreateVariant = operation => async () => { const message = await askInput("Stash", text("Ghi chú (có thể để trống)", "Message (optional)")); if (message !== null) await mutate(repo, operation, { message }); };
    const stashDropAll = async () => { const result = await listOperation(repo, "stashList"); if (!result?.stashes?.length) { notify(text("Không có stash.", "No stashes.")); return; } if (await confirmAction(text("Xóa tất cả stash: ", "Drop all stashes: ") + result.stashes.length)) await mutate(repo, "stashDropAll", { confirmed: true, expectedHashes: result.stashes.map(x => x.hash) }); };
    const stashView = async () => { const result = await listOperation(repo, "stashList"); if (!result) return; const ref = await chooseItem("View Stash", result.stashes.map(x => ({ label: x.ref, detail: x.subject, value: x.ref }))); if (!ref) return; const data = await listOperation(repo, "stashView", { ref }); if (data) await window.gitDialog.output({ title: ref, text: data.output }); };
    const labels = [item("Pull", remoteAction("pull"), disabledRemote), item("Push", remoteAction("push"), disabledRemote), item("Clone", doClone), item("Checkout to…", branchControls), item("Fetch", remoteAction("fetch"), disabledRemote), null,
      { label: "Commit", children: [item("Commit", commitVariant("staged", false, false)), item("Commit Staged", commitVariant("staged", false, false)), item("Commit All", commitVariant("all", false, false)), item("Undo Last Commit", safeHeadOp("undoLastCommit", text("Hoàn tác commit cuối", "Undo last commit"))), item("Abort Rebase", safeHeadOp("abortRebase", text("Hủy rebase", "Abort rebase"))), null, item("Commit (Amend)", commitVariant("staged", true, false)), item("Commit Staged (Amend)", commitVariant("staged", true, false)), item("Commit All (Amend)", commitVariant("all", true, false)), null, item("Commit (Signed Off)", commitVariant("staged", false, true)), item("Commit Staged (Signed Off)", commitVariant("staged", false, true)), item("Commit All (Signed Off)", commitVariant("all", false, true))] },
      { label: "Changes", children: [item("Stage All Changes", () => stageAll(repo, false)), item("Unstage All Changes", () => stageAll(repo, true)), item("Discard All Changes", discardAll)] },
      { label: "Pull, Push", children: [item("Sync", remoteAction("sync"), disabledRemote), null, item("Pull", remoteAction("pull"), disabledRemote), item("Pull (Rebase)", remoteAction("pullRebase"), disabledRemote), item("Pull from…", remoteBranchOp("pullFrom"), disabledRemote), null, item("Push", remoteAction("push"), disabledRemote), item("Push to…", remoteBranchOp("pushTo"), disabledRemote), null, item("Fetch", remoteAction("fetch"), disabledRemote), item("Fetch (Prune)", remoteAction("fetchPrune"), disabledRemote), item("Fetch From All Remotes", remoteAction("fetchAll"), disabledRemote)] },
      { label: "Branch", children: [item("Merge…", selectedBranchOp("mergeBranch", "Merge")), item("Rebase Branch…", selectedBranchOp("rebaseBranch", "Rebase")), null, item("Create Branch…", createBranch), item("Create Branch From…", createBranchFrom), null, item("Rename Branch…", renameBranch), item("Delete Branch…", selectedBranchOp("deleteBranch", "Delete Branch")), item("Delete Remote Branch…", remoteBranchOp("deleteRemoteBranch"), disabledRemote), null, item("Publish Branch…", remoteOnly("publishBranch"), disabledRemote)] },
      { label: "Remote", children: [item(text("Xem remotes", "Show remotes"), async () => { const r = await listOperation(repo, "remoteList"); if (r) await window.gitDialog.output({ title: "Remotes", text: r.remotes.map(x => `${x.name}  ${x.url}`).join("\n") || text("Không có remote.", "No remotes.") }); }), item(text("Thêm remote…", "Add remote…"), remoteAdd), item(text("Gỡ remote…", "Remove remote…"), () => actOnList(repo, "remoteList", "remotes", "remoteRemove", text("Gỡ remote", "Remove remote"), x => ({ label: x.name, detail: x.url, value: x.name })))] },
      { label: "Stash", children: [item("Stash", stashCreate), item("Stash (Include Untracked)", stashCreateVariant("stashIncludeUntracked")), item("Stash Staged", stashCreateVariant("stashStaged")), null, item("Apply Latest Stash", remoteAction("stashApplyLatest")), item("Apply Stash…", stashChoice("stashApply")), null, item("Pop Latest Stash", remoteAction("stashPopLatest")), item("Pop Stash…", stashChoice("stashPop")), null, item("Drop Stash…", stashChoice("stashDrop")), item("Drop All Stashes…", stashDropAll), null, item("View Stash…", stashView)] },
      { label: "Tags", children: [item("Create Tag…", tagCreate), item("Delete Tag…", () => actOnList(repo, "tagList", "tags", "tagDelete", text("Xóa tag", "Delete tag"))), item("Delete Remote Tag…", remoteTagDelete, disabledRemote), null, item("Push Tags", remoteOnly("tagPush"), disabledRemote)] },
      { label: "Worktrees", children: [item(text("Xem worktrees", "Show worktrees"), worktreeShow), item(text("Thêm worktree…", "Add worktree…"), worktreeAdd)] }, null,
      item("Show Git Output", () => window.gitDialog.output({ title: "Git Output", text: gitOutput.join("\n") || text("Chưa có kết quả Git.", "No Git output yet.") }))];
    if (paths.some(p => key(p) === key(repo.path))) { labels.push(null, item(text("Gỡ khỏi Source Control", "Remove from Source Control"), () => { paths = paths.filter(p => key(p) !== key(repo.path)); window.localWorkspace?.scheduleSave(); refresh(); })); }
    const buildMenu = (items, parent, submenu = false) => {
      const menu = document.createElement("div"); menu.className = submenu ? "git-menu-submenu" : "git-repository-menu"; menu.setAttribute("role", "menu");
      for (const entry of items) {
        if (!entry) { const divider = document.createElement("div"); divider.className = "git-menu-divider"; divider.setAttribute("role", "separator"); menu.append(divider); continue; }
        const row = button("", entry.label, () => { if (entry.children) { openSubmenu(row, entry.children); return; } closeRepositoryMenu(); Promise.resolve(entry.run()).catch(fail); });
        row.className = "git-menu-row"; row.disabled = !!entry.disabled || busy; row.setAttribute("role", "menuitem");
        const caption = document.createElement("span"); caption.textContent = entry.label; row.append(caption);
        if (entry.children) { row.setAttribute("aria-haspopup", "menu"); row.setAttribute("aria-expanded", "false"); const arrow = document.createElement("span"); arrow.className = "git-menu-arrow"; row.append(arrow); row.addEventListener("pointerenter", () => openSubmenu(row, entry.children)); }
        else row.addEventListener("pointerenter", () => { document.querySelector(".git-menu-submenu")?.remove(); menu.querySelectorAll('[aria-expanded="true"]').forEach(b => b.setAttribute("aria-expanded", "false")); });
        menu.append(row);
      }
      document.body.append(menu);
      const a = parent.getBoundingClientRect(), b = menu.getBoundingClientRect(), right = a.right + (submenu ? -3 : 4), left = a.left - b.width + (submenu ? 3 : 0);
      menu.style.left = Math.max(4, right + b.width <= innerWidth - 4 ? right : left >= 4 ? left : innerWidth - b.width - 4) + "px";
      menu.style.top = Math.max(4, Math.min(a.top, innerHeight - b.height - 4)) + "px";
      menu.addEventListener("keydown", event => {
        const entries = [...menu.querySelectorAll('button:not(:disabled)')], i = entries.indexOf(document.activeElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); entries[(i + (event.key === "ArrowDown" ? 1 : -1) + entries.length) % entries.length]?.focus(); }
        else if (event.key === "ArrowRight" && document.activeElement?.getAttribute("aria-haspopup") === "menu") { event.preventDefault(); document.activeElement.click(); document.querySelector(".git-menu-submenu button:not(:disabled)")?.focus(); }
        else if (event.key === "ArrowLeft" && submenu) { event.preventDefault(); menu.remove(); parent.setAttribute("aria-expanded", "false"); parent.focus(); }
      });
      return menu;
    };
    const openSubmenu = (row, children) => { document.querySelector(".git-menu-submenu")?.remove(); row.parentElement.querySelectorAll('[aria-expanded="true"]').forEach(b => b.setAttribute("aria-expanded", "false")); row.setAttribute("aria-expanded", "true"); buildMenu(children, row, true); };
    buildMenu(labels, anchor);
  }

  function render() {
    document.querySelectorAll(".git-repository-menu, .git-menu-submenu").forEach(node => node.remove());
    $("git-add").title = $("git-add").ariaLabel = text("Chọn repository", "Choose repository");
    $("git-refresh").title = $("git-refresh").ariaLabel = text("Làm mới", "Refresh");
    $("git-diff-close").textContent = text("Đóng", "Close");
    const list = $("git-repositories");
    const scroll = { repositories: list.scrollTop, changes: content.querySelector(".git-changes-pane")?.scrollTop || 0, history: content.querySelector(".git-history-list")?.scrollTop || 0 };
    list.replaceChildren(); content.replaceChildren();
    const restoreScroll = () => { list.scrollTop = scroll.repositories; const changes = content.querySelector(".git-changes-pane"), history = content.querySelector(".git-history-list"); if (changes) changes.scrollTop = scroll.changes; if (history) history.scrollTop = scroll.history; };
    const viewHeading = (label, section, destination, extra = "") => {
      const heading = document.createElement("div"); heading.className = "git-view-heading";
      const toggle = button(label, label, () => { expandedSections[section] = !expandedSections[section]; render(); });
      toggle.classList.add("git-view-toggle"); toggle.setAttribute("aria-expanded", String(expandedSections[section]));
      toggle.prepend(disclosureIcon());
      heading.append(toggle);
      if (extra) { const detail = document.createElement("span"); detail.className = "git-view-detail"; detail.textContent = extra; detail.title = extra; heading.append(detail); }
      destination.append(heading); return heading;
    };
    viewHeading(text("Kho lưu trữ", "Repositories"), "repositories", list);
    let count = 0;
    for (const repo of repositories) {
      count += repo.changes.length;
      if (!expandedSections.repositories) continue;
      const row = document.createElement("div"); row.className = "git-repository"; row.dataset.repo = repo.path;
      row.classList.toggle("selected", key(selected) === key(repo.path));
      const select = button("", repo.path, () => { selected = repo.path; expandedRepos.add(key(repo.path)); render(); });
      select.setAttribute("aria-current", String(key(selected) === key(repo.path)));
      const name = document.createElement("span"); name.className = "git-repository-name"; name.textContent = repo.name;
      select.append(repositoryIcon(), name);
      const branch = button("", text("Nhánh: ", "Branch: ") + repo.branch, () => {
        selected = repo.path; expandedRepos.add(key(repo.path)); optionsRepos.add(key(repo.path)); repositoryMenu = ""; render();
        const target = [...content.querySelectorAll(".git-repo-body")].find(node => key(node.dataset.repo) === key(repo.path));
        target?.querySelector(".git-branch-tools select")?.focus();
      });
      branch.classList.add("git-repository-branch");
      branch.append(rowIcon("M7 3.25a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 13.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM17 3.25a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 7.25v9.5M17 7.25v2.5c0 3.5-10 2-10 7"));
      const branchName = document.createElement("span"); branchName.textContent = repo.branch + (repo.changes.length ? "*" : ""); branch.append(branchName);
      const refreshRepo = button("", text("Làm mới repository", "Refresh repository"), () => { repositoryMenu = ""; refresh(); });
      refreshRepo.classList.add("git-repository-action"); refreshRepo.append(rowIcon("M20 11a8 8 0 0 0-14-5L4 8M4 4v4h4M4 13a8 8 0 0 0 14 5l2-2m0 4v-4h-4"));
      const more = button("", text("Tùy chọn repository", "Repository actions"), () => { repositoryMenu = repositoryMenu === key(repo.path) ? "" : key(repo.path); render(); });
      more.append(rowIcon("M5 12h.01M12 12h.01M19 12h.01"));
      more.classList.add("git-repository-action", "git-repository-more"); more.setAttribute("aria-expanded", String(repositoryMenu === key(repo.path)));
      row.append(select, branch, refreshRepo, more); list.append(row);
      if (repositoryMenu === key(repo.path)) openRepositoryMenu(repo, more);
    }
    $("git-badge").textContent = count > 99 ? "99+" : String(count); $("git-badge").hidden = count === 0;
    $("git-hint").textContent = repositories.length ? "" : text("Chưa có repository. Bấm + để chọn thư mục Git. Cần Git và terminal host trên Windows.", "No repositories. Click + to choose a Git folder. Requires Git and the Windows terminal host.");
    if (!repositories.length) return;
    const changesPane = document.createElement("div"); changesPane.className = "git-changes-pane"; content.append(changesPane);
    viewHeading(text("Thay đổi", "Changes"), "changes", changesPane);
    if (expandedSections.changes) for (const repo of repositories) {
      const repoKey = key(repo.path), expanded = expandedRepos.has(repoKey);
      const heading = document.createElement("div"); heading.className = "git-repo-heading"; heading.dataset.repo = repo.path;
      const select = button("", repo.path, () => {
        selected = repo.path;
        if (expandedRepos.has(repoKey)) expandedRepos.delete(repoKey); else expandedRepos.add(repoKey);
        render();
      });
      select.classList.add("git-repo-toggle"); select.setAttribute("aria-expanded", String(expanded));
      const name = document.createElement("span"); name.className = "git-repo-name"; name.textContent = repo.name;
      const branch = document.createElement("span"); branch.className = "git-repo-branch";
      branch.append(rowIcon("M7 3.25a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 13.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM17 3.25a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 7.25v9.5M17 7.25v2.5c0 3.5-10 2-10 7"));
      const branchLabel = document.createElement("span"); branchLabel.textContent = repo.branch + (repo.changes.length ? "*" : ""); branch.append(branchLabel);
      select.append(disclosureIcon(), repositoryIcon(), name, branch); heading.append(select);
      const options = button("", text("Nhánh và đồng bộ", "Branch and synchronization"), () => {
        if (optionsRepos.has(repoKey)) optionsRepos.delete(repoKey); else optionsRepos.add(repoKey);
        expandedRepos.add(repoKey); selected = repo.path; render();
      });
      options.append(rowIcon("M5 12h.01M12 12h.01M19 12h.01"));
      options.classList.add("git-repo-options"); options.setAttribute("aria-expanded", String(optionsRepos.has(repoKey))); heading.append(options); changesPane.append(heading);
      if (!expanded) continue;
      const body = document.createElement("div"); body.className = "git-repo-body"; body.dataset.repo = repo.path; changesPane.append(body);
      const controls = document.createElement("div"); controls.className = "git-repo-controls"; controls.hidden = !optionsRepos.has(repoKey); body.append(controls);
      const branchTools = document.createElement("div"); branchTools.className = "git-branch-tools";
      const branchPicker = document.createElement("div"); branchPicker.className = "git-branch-picker";
      const branchIcon = rowIcon("M7 3.25a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 13.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM17 3.25a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 7.25v9.5M17 7.25v2.5c0 3.5-10 2-10 7"); branchIcon.classList.add("git-branch-picker-icon");
      const branchSelect = document.createElement("select"); branchSelect.ariaLabel = text("Nhánh Git", "Git branch"); branchSelect.disabled = busy;
      for (const name of [...new Set([repo.branch, ...repo.branches.map(b => b.name)])]) {
        const option = document.createElement("option"); option.value = name; option.textContent = name; branchSelect.append(option);
      }
      branchSelect.value = repo.branch;
      branchSelect.addEventListener("change", () => mutate(repo, "switchBranch", { branch: branchSelect.value }));
      const branchForm = document.createElement("form"); branchForm.className = "git-new-branch"; branchForm.hidden = true;
      const branchName = document.createElement("input"); branchName.placeholder = text("Tên nhánh mới", "New branch name"); branchName.ariaLabel = branchName.placeholder; branchName.required = true; branchName.maxLength = 200;
      const create = document.createElement("button"); create.type = "submit"; create.className = "git-plain"; create.textContent = text("Tạo", "Create");
      branchForm.append(branchName, create);
      branchForm.addEventListener("submit", event => { event.preventDefault(); if (branchName.value.trim()) mutate(repo, "createBranch", { branch: branchName.value.trim() }); });
      const newBranch = button("", text("Tạo và chuyển sang nhánh mới", "Create and switch to new branch"), () => { branchForm.hidden = !branchForm.hidden; if (!branchForm.hidden) branchName.focus(); });
      newBranch.append(rowIcon("M12 5v14M5 12h14"));
      branchPicker.append(branchIcon, branchSelect); branchTools.append(branchPicker, newBranch); controls.append(branchTools, branchForm);
      const remoteTools = document.createElement("div"); remoteTools.className = "git-remote-tools";
      for (const operation of ["fetch", "pull", "push"]) {
        const label = operation[0].toUpperCase() + operation.slice(1);
        const action = button(label + (operation === "pull" && repo.behind ? ` ↓${repo.behind}` : operation === "push" && repo.ahead ? ` ↑${repo.ahead}` : ""), operation === "pull" ? text("Pull chỉ fast-forward", "Pull (fast-forward only)") : label, () => mutate(repo, operation, {}));
        action.disabled = busy || !repo.remotes.length; remoteTools.append(action);
      }
      controls.append(remoteTools);
      const form = document.createElement("form"); form.className = "git-commit-form";
      const message = document.createElement("textarea"); message.maxLength = 10000; message.placeholder = text("Thông điệp commit…", "Message (Ctrl+Enter to commit)"); message.ariaLabel = message.placeholder;
      message.value = drafts.get(repoKey) || ""; message.disabled = busy;
      const commit = document.createElement("button"); commit.type = "submit"; commit.className = "button primary";
      const check = rowIcon("M5 12.5 9.5 17 19 7"); const commitLabel = document.createElement("span"); commitLabel.textContent = "Commit"; commit.append(check, commitLabel);
      const staged = repo.changes.filter(e => e.index !== " " && e.index !== "?");
      const updateCommit = () => { commit.disabled = busy || !staged.length || !message.value.trim(); };
      message.addEventListener("input", () => { drafts.set(repoKey, message.value); updateCommit(); });
      message.addEventListener("keydown", event => { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && !event.isComposing && !commit.disabled) { event.preventDefault(); form.requestSubmit(); } });
      updateCommit();
      form.addEventListener("submit", event => { event.preventDefault(); if (!commit.disabled) mutate(repo, "commit", { message: message.value }); });
      form.append(message, commit); body.append(form);
      const section = (label, entries, isStaged) => {
        if (isStaged && !entries.length) return;
        const sectionKey = repoKey + (isStaged ? ":staged" : ":changes"), open = !collapsedFileSections.has(sectionKey);
        const sectionHeading = document.createElement("h3"); sectionHeading.className = "git-section-title";
        const sectionToggle = button(label, label, () => { if (open) collapsedFileSections.add(sectionKey); else collapsedFileSections.delete(sectionKey); render(); });
        sectionToggle.setAttribute("aria-expanded", String(open)); sectionToggle.prepend(disclosureIcon()); sectionHeading.append(sectionToggle);
        const badge = document.createElement("span"); badge.textContent = entries.length; sectionHeading.append(badge); body.append(sectionHeading);
        if (!open) return;
        for (const entry of entries) {
          const row = document.createElement("div"); row.className = "git-file"; row.dataset.path = entry.path; row.dataset.staged = String(isStaged); row.dataset.repo = repo.path;
          const file = button("", entry.oldPath ? entry.oldPath + " → " + entry.path : entry.path, () => showDiff(repo, entry, isStaged));
          const icon = document.createElement("img"); icon.alt = ""; icon.src = materialIcon(entry.path, false);
          const parts = entry.path.replace(/\\/g, "/").split("/");
          const filename = document.createElement("span"); filename.className = "git-file-name"; filename.textContent = parts.pop(); file.append(icon, filename);
          if (parts.length) { const folder = document.createElement("span"); folder.className = "git-file-folder"; folder.textContent = parts.join("/"); file.append(folder); }
          const code = document.createElement("small"); code.textContent = isStaged ? entry.index : entry.worktree === "?" ? "U" : entry.worktree;
          const action = button(isStaged ? "−" : "+", isStaged ? text("Bỏ stage", "Unstage") : "Stage", () => mutate(repo, isStaged ? "unstage" : "stage", { path: entry.path }));
          row.append(file, code, action); body.append(row);
        }
      };
      section(text("Đã stage", "Staged Changes"), staged, true);
      section(text("Thay đổi", "Changes"), repo.changes.filter(e => e.worktree !== " "), false);
    }
    const splitter = document.createElement("div"); splitter.className = "git-history-splitter"; splitter.setAttribute("role", "separator");
    splitter.setAttribute("aria-orientation", "horizontal"); splitter.setAttribute("aria-label", text("Điều chỉnh chiều cao lịch sử Git", "Resize Git history")); splitter.tabIndex = 0;
    content.append(splitter);
    const history = document.createElement("div"); history.className = "git-history-pane"; content.append(history);
    const repo = currentRepo();
    const historyHeading = viewHeading(text("Lịch sử", "History"), "history", history, repo?.name || ""); historyHeading.classList.add("git-history-title");
    const historyRepo = historyHeading.querySelector(".git-view-detail");
    if (historyRepo) { const label = document.createElement("span"); label.textContent = repo.name; historyRepo.replaceChildren(repositoryIcon(), label); }
    if (!expandedSections.history || !repo) { splitter.hidden = true; history.classList.add("collapsed"); restoreScroll(); return; }
    let drag = null;
    splitter.addEventListener("pointerdown", event => {
      if (event.button !== 0 || drag) return;
      event.preventDefault(); splitter.focus();
      drag = { pointer: event.pointerId, startY: event.clientY, startHeight: history.getBoundingClientRect().height, savedHeight: historyHeight };
      splitter.setPointerCapture(event.pointerId); splitter.classList.add("dragging");
    });
    splitter.addEventListener("pointermove", event => {
      if (drag?.pointer !== event.pointerId) return;
      setHistoryHeight(drag.startHeight + drag.startY - event.clientY);
    });
    const endDrag = (event, cancel = false) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      if (cancel) historyHeight = drag.savedHeight;
      drag = null; splitter.classList.remove("dragging"); applyHistoryHeight();
      if (!cancel) window.localWorkspace?.scheduleSave();
    };
    splitter.addEventListener("pointerup", event => endDrag(event));
    splitter.addEventListener("pointercancel", event => endDrag(event, true));
    splitter.addEventListener("lostpointercapture", event => endDrag(event, true));
    splitter.addEventListener("keydown", event => {
      if (event.key === "Escape" && drag) { event.preventDefault(); endDrag({ pointerId: drag.pointer }, true); return; }
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const current = history.getBoundingClientRect().height;
      setHistoryHeight(event.key === "Home" ? content.clientHeight : event.key === "End" ? 0 : current + (event.key === "ArrowUp" ? 10 : -10), true);
    });
    splitter.addEventListener("dblclick", () => setHistoryHeight(220, true));
    const historyList = document.createElement("div"); historyList.className = "git-history-list"; history.append(historyList);
    if (!repo.commits.length) { const empty = document.createElement("p"); empty.className = "git-status"; empty.textContent = text("Chưa có commit.", "No commits yet."); historyList.append(empty); }
    for (const item of repo.commits) {
      const row = document.createElement("div"); row.className = "git-commit"; row.title = `${item.hash}\n${item.author}\n${item.date}\n${item.subject}`;
      const subject = document.createElement("strong"); subject.textContent = item.subject; row.append(subject);
      if (item.refs) {
        const refs = document.createElement("em"); refs.title = item.refs;
        refs.append(rowIcon("M7 3.25a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm0 13.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM17 3.25a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM7 7.25v9.5M17 7.25v2.5c0 3.5-10 2-10 7"));
        const label = document.createElement("span"); label.textContent = item.refs.replace(/\bHEAD\s*->\s*/g, ""); refs.append(label); row.append(refs);
      }
      historyList.append(row);
    }
    applyHistoryHeight(); restoreScroll();
  }
  document.addEventListener("pointerdown", event => {
    if (repositoryMenu && !event.target.closest(".git-repository-menu, .git-menu-submenu, .git-repository-more")) closeRepositoryMenu();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !repositoryMenu) return;
    const toggle = panel.querySelector('.git-repository-more[aria-expanded="true"]'); closeRepositoryMenu();
    toggle?.setAttribute("aria-expanded", "false"); toggle?.focus(); event.preventDefault();
  });

  async function refresh() {
    if (busy) return;
    const version = revision;
    const candidates = [...paths, ...explorerFolders.map(root => root.absolutePath).filter(Boolean)];
    if (!candidates.length) { repositories = []; selected = ""; render(); return; }
    setBusy(true); notify(text("Đang đọc Git…", "Reading Git…"));
    const found = [], errors = [];
    try {
      for (const cwd of [...new Set(candidates)]) {
        try { const repo = await request("status", cwd); if (!found.some(r => key(r.path) === key(repo.path))) found.push(repo); }
        catch (error) { errors.push(cwd + ": " + error.message); }
      }
      if (version !== revision) return;
      repositories = found;
      if (!currentRepo()) { selected = found[0]?.path || ""; if (selected) expandedRepos.add(key(selected)); }
      notify(errors.join("\n"), errors.length > 0);
    } catch (error) { fail(error); }
    finally { setBusy(false); if (version !== revision && !panel.hidden) refresh(); }
  }
  async function mutate(repo, operation, extra) {
    if (busy) return;
    if (state.saving || window.localWorkspace?.restoring) { fail(new Error(text("Hãy đợi lưu/khôi phục file xong.", "Wait for file saving or restoration to finish."))); return; }
    const changesFiles = ["switchBranch", "createBranch", "createBranchFrom", "pull", "pullRebase", "pullFrom", "sync", "mergeBranch", "rebaseBranch", "abortRebase", "discardAllChanges", "stashCreate", "stashApply", "stashPop", "stashIncludeUntracked", "stashStaged", "stashApplyLatest", "stashPopLatest"].includes(operation);
    if (changesFiles) {
      snapshotTab();
      if (tabs.some(tab => tab.dirty)) { fail(new Error(text("Lưu hoặc đóng các file chưa lưu trước thao tác có thể thay đổi file.", "Save or close unsaved files before an operation that may change files."))); render(); return false; }
      state.saving = true;
      for (const group of editorGroups) group.editor.updateOptions({ readOnly: true });
    }
    const version = revision; setBusy(true); notify(text("Đang xử lý…", "Working…"));
    try {
      const updated = await request(operation, repo.path, extra);
      if (version !== revision) return;
      repositories = repositories.map(r => key(r.path) === key(repo.path) ? updated : r);
      if (operation === "commit" || operation === "commitVariant") drafts.delete(key(repo.path));
      if (changesFiles) {
        state.saving = false;
        await window.localWorkspace?.refreshFolderFiles(null);
        for (const root of explorerFolders) await root.refresh?.();
      }
      notify(operation === "commit" || operation === "commitVariant" ? text("Đã commit.", "Committed.") : text("Đã hoàn tất ", "Completed ") + operation + ".");
      return true;
    } catch (error) {
      if (changesFiles) {
        state.saving = false;
        try {
          const latest = await request("status", repo.path);
          if (version === revision) repositories = repositories.map(r => key(r.path) === key(repo.path) ? latest : r);
          await window.localWorkspace?.refreshFolderFiles(null); for (const root of explorerFolders) await root.refresh?.();
        }
        catch (refreshError) { console.warn("Could not refresh files after Git operation:", refreshError); }
      }
      if (version === revision) fail(error); return false;
    }
    finally {
      if (changesFiles) {
        state.saving = false;
        for (const group of editorGroups) group.editor.updateOptions({ readOnly: !group.editor.getModel() });
      }
      setBusy(false); if (version !== revision && !panel.hidden) refresh();
    }
  }
  function closeDiff() {
    // Reuse the view so pending Monaco work never targets a disposed service.
    diffModels.forEach(model => model.setValue(""));
  }
  async function showDiff(repo, entry, staged) {
    if (busy) return;
    const version = revision; setBusy(true); notify();
    try {
      const result = await request("diff", repo.path, { path: entry.path, staged });
      if (version !== revision) return;
      closeDiff(); $("git-diff-title").textContent = entry.path + (staged ? text(" · Đã stage", " · Staged") : "");
      $("git-diff-labels").replaceChildren();
      for (const label of staged ? ["HEAD", text("Đã stage", "Index")] : [text("Đã stage", "Index"), text("Trên ổ đĩa", "Working tree")]) { const span = document.createElement("span"); span.textContent = label; $("git-diff-labels").append(span); }
      $("git-diff-dialog").showModal();
      const syntax = languageForFile(entry.path);
      if (!diffEditor) {
        diffModels = [monaco.editor.createModel(result.original, syntax), monaco.editor.createModel(result.modified, syntax)];
        diffEditor = monaco.editor.createDiffEditor($("git-diff-editor"), { automaticLayout: true, readOnly: true, originalEditable: false, renderSideBySide: true, minimap: { enabled: false }, scrollBeyondLastLine: false });
        diffEditor.setModel({ original: diffModels[0], modified: diffModels[1] });
      } else {
        diffModels[0].setValue(result.original); diffModels[1].setValue(result.modified);
        diffModels.forEach(model => monaco.editor.setModelLanguage(model, syntax));
        diffEditor.layout();
      }
    } catch (error) { fail(error); }
    finally { setBusy(false); }
  }
  function chooseRepository() {
    if (busy) return;
    const version = revision;
    setBusy(true); notify(text("Chọn thư mục repository trong Windows…", "Choose a repository folder in Windows…"));
    let picker;
    const finish = () => { if (picker) { const old = picker; picker = null; old.disconnect(); } setBusy(false); };
    try {
      picker = chrome.runtime.connectNative("dinkit.editor");
      picker.onMessage.addListener(async message => {
        if (!picker) return;
        if (message.type === "error") { finish(); fail(new Error(message.message)); return; }
        if (message.type !== "directoryChosen") return;
        finish(); if (version !== revision) return; notify(); if (!message.cwd) return;
        setBusy(true);
        try {
          const repo = await request("status", message.cwd);
          if (version !== revision) return;
          if (!paths.some(p => key(p) === key(repo.path))) paths.push(repo.path);
          repositories = [...repositories.filter(item => key(item.path) !== key(repo.path)), repo];
          selected = repo.path; expandedRepos.add(key(selected)); window.localWorkspace?.scheduleSave();
        } catch (error) { fail(error); }
        finally { setBusy(false); }
        if (version !== revision && !panel.hidden) refresh();
      });
      picker.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError; if (!picker) return;
        picker = null; setBusy(false); fail(new Error(text("Không kết nối được bộ chọn thư mục. Cài terminal host theo README. ", "Folder picker unavailable. Install the terminal host following README. ") + (error?.message || "")));
      });
      picker.postMessage({ type: "chooseDirectory" });
    } catch (error) { finish(); fail(error); }
  }
  function setVisible(visible) {
    panel.hidden = !visible; toggle.setAttribute("aria-expanded", String(visible));
    if (visible) { explorerPanel.hidden = true; explorerToggle.setAttribute("aria-expanded", "false"); refresh(); }
  }
  toggle.addEventListener("click", () => { setVisible(panel.hidden); window.localWorkspace?.scheduleSave(); });
  explorerToggle.addEventListener("click", () => { panel.hidden = true; toggle.setAttribute("aria-expanded", "false"); });
  $("git-add").addEventListener("click", chooseRepository);
  $("git-refresh").addEventListener("click", refresh);
  $("git-diff-close").addEventListener("click", () => $("git-diff-dialog").close());
  $("git-diff-dialog").addEventListener("close", closeDiff);
  window.addEventListener("focus", () => { if (!panel.hidden) refresh(); });
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  window.localSourceControl = {
    getPaths: () => [...paths],
    getHistoryHeight: () => historyHeight,
    setHistoryHeight(value) { historyHeight = Number.isFinite(value) ? Math.max(100, Math.min(4000, value)) : 220; applyHistoryHeight(); },
    isVisible: () => !panel.hidden,
    setVisible,
    setPaths(value) {
      revision++; paths = Array.isArray(value) ? value.filter(p => typeof p === "string") : [];
      repositories = []; selected = ""; drafts.clear(); expandedRepos.clear(); optionsRepos.clear(); collapsedFileSections.clear(); repositoryMenu = ""; notify();
      if ($("git-diff-dialog").open) $("git-diff-dialog").close();
      render(); if (!panel.hidden) refresh();
    },
    refresh
  };
  render();
})();
