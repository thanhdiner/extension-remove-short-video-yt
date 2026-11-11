// Run in an isolated ?workspaceTest tab. Git requests and files stay in memory.
(async () => {
  if (!new URLSearchParams(location.search).get("workspaceTest")) throw Error("Use an isolated workspaceTest tab");
  await localWorkspace.ready;
  await localWorkspace.dispose();
  const assert = (value, label) => { if (!value) throw Error(label); };
  const panel = document.getElementById("git-panel");
  const wait = async predicate => { for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 20)); } throw Error("Git UI timed out"); };
  const idle = () => wait(() => panel.getAttribute("aria-busy") !== "true");
  const makeRepo = (name, branch) => ({ name, path: "C:\\fixture\\" + name, branch, branches: [{ name: branch }, { name: "other" }], remotes: ["origin"], ahead: 0, behind: 0,
    changes: [{ path: "shared.js", index: " ", worktree: "M" }, { path: "src/long-name.js", index: " ", worktree: "M" }],
    commits: [{ hash: name + "-hash", shortHash: "abc123", subject: "History " + name, author: "Test", date: "Today", refs: "HEAD -> " + branch + ", origin/" + branch }] });
  const repos = [makeRepo("first", "main"), makeRepo("second", "feature")], requests = [];
  const originalConnect = chrome.runtime.connectNative;
  chrome.runtime.connectNative = () => {
    let receive, disconnected;
    return { onMessage: { addListener: fn => receive = fn }, onDisconnect: { addListener: fn => disconnected = fn }, disconnect: () => disconnected?.(),
      postMessage(message) {
        requests.push({ ...message });
        const repo = repos.find(item => item.path === message.cwd);
        if (!repo) throw Error("Unexpected repository");
        const entry = repo.changes.find(item => item.path === message.path);
        if (message.operation === "stage") { entry.index = "M"; entry.worktree = " "; }
        if (message.operation === "unstage") { entry.index = " "; entry.worktree = "M"; }
        if (message.operation === "commit") { repo.changes = repo.changes.filter(item => item.index === " "); repo.commits.unshift({ hash: "new", subject: message.message, author: "Test", date: "Today", refs: repo.branch }); }
        if (message.operation === "switchBranch") repo.branch = message.branch;
        const result = message.operation === "diff" ? { original: "old\n", modified: "new\n" }
          : message.operation === "stashList" ? { stashes: [{ ref: "stash@{0}", subject: "saved", hash: "abc" }] }
          : message.operation === "tagList" ? { tags: ["v1"] } : repo;
        setTimeout(() => receive({ type: "gitResult", id: message.id, result: structuredClone(result) }), 0);
      } };
  };
  const body = name => [...panel.querySelectorAll(".git-repo-body")].find(node => node.dataset.repo === repos.find(repo => repo.name === name).path);
  const row = (name, staged) => [...body(name).querySelectorAll(".git-file")].find(node => node.dataset.path === "shared.js" && node.dataset.staged === String(staged));
  const heading = name => [...panel.querySelectorAll(".git-repo-heading")].find(node => node.dataset.repo === repos.find(repo => repo.name === name).path);
  try {
    localSourceControl.setPaths(repos.map(repo => repo.path)); localSourceControl.setVisible(true);
    await wait(() => panel.querySelectorAll(".git-repository").length === 2 && panel.getAttribute("aria-busy") !== "true");
    assert(body("first") && !body("second"), "first repository initially open");
    const repositoryRow = name => [...panel.querySelectorAll(".git-repository")].find(node => node.dataset.repo === repos.find(repo => repo.name === name).path);
    assert(repositoryRow("first").querySelector(".git-repository-branch").textContent.includes("main") && repositoryRow("first").querySelector(".git-repository-more"), "repository row shows branch and actions");
    repositoryRow("second").querySelector(".git-repository-branch").click();
    assert(!body("second").querySelector(".git-repo-controls").hidden && document.activeElement === body("second").querySelector("select"), "branch action opens the correct repository controls");
    repositoryRow("second").querySelector(".git-repository-more").click();
    assert(document.querySelector(".git-repository-menu") && document.querySelector(".git-repository-menu button:last-child").textContent.includes("Remove"), "repository menu retains remove action");
    assert([...document.querySelectorAll(".git-repository-menu button")].slice(0, 5).map(node => node.textContent).join() === "Pull,Push,Clone,Checkout to…,Fetch", "repository menu offers top-level commands");
    [...document.querySelectorAll(".git-repository-menu button")].find(node => node.textContent === "Stash").click();
    assert(document.querySelector(".git-menu-submenu")?.textContent.includes("Apply Stash"), "stash submenu opens");
    [...document.querySelectorAll(".git-repository-menu button")].find(node => node.textContent === "Fetch").click(); await idle();
    assert(requests.at(-1).operation === "fetch" && requests.at(-1).cwd === repos[1].path, "repository menu targets its own remote");
    repositoryRow("second").querySelector(".git-repository-more").click();
    repositoryRow("second").querySelector(".git-repository-more").click();
    heading("second").querySelector(".git-repo-toggle").click();
    heading("second").querySelector(".git-repo-toggle").click();
    assert(body("first") && body("second"), "two repositories can be open at once");
    const firstMessage = body("first").querySelector("textarea"); firstMessage.value = "draft first"; firstMessage.dispatchEvent(new Event("input"));
    const secondMessage = body("second").querySelector("textarea"); secondMessage.value = "draft second"; secondMessage.dispatchEvent(new Event("input"));
    heading("first").querySelector(".git-repo-toggle").click();
    assert(!body("first") && body("second").querySelector("textarea").value === "draft second", "collapse keeps other draft");
    heading("first").querySelector(".git-repo-toggle").click();
    assert(body("first").querySelector("textarea").value === "draft first", "reopening restores own draft");
    row("second", false).querySelector("button:last-child").click(); await idle();
    assert(row("second", true) && row("first", false), "staging targets second repository only");
    assert(requests.at(-1).cwd === repos[1].path, "stage request targets the right repository");
    row("second", true).querySelector("button:last-child").click(); await idle();
    assert(row("second", false) && row("first", false), "unstage targets the right repository");
    row("first", false).querySelector("button:first-child").click(); await idle();
    assert(document.getElementById("git-diff-dialog").open && requests.at(-1).cwd === repos[0].path, "diff targets the first repository");
    document.getElementById("git-diff-close").click();
    row("second", false).querySelector("button:last-child").click(); await idle();
    const message = body("second").querySelector("textarea");
    message.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })); await idle();
    assert(requests.at(-1).operation === "commit" && requests.at(-1).cwd === repos[1].path && requests.at(-1).message === "draft second", "Ctrl+Enter commits the correct staged repository");
    assert(body("first").querySelector("textarea").value === "draft first" && !body("second").querySelector("textarea").value, "commit keeps other draft and clears its own");
    panel.querySelectorAll(".git-repository > button:first-child")[0].click();
    assert(panel.querySelector(".git-history-list").textContent.includes("History first"), "history follows selected repository");
    const refBadge = panel.querySelector(".git-commit em");
    assert(refBadge.querySelector("span").textContent === "main, origin/main" && refBadge.title === "HEAD -> main, origin/main", "history badge keeps full refs in tooltip and shows a concise label");
    panel.querySelectorAll(".git-repository > button:first-child")[1].click();
    assert(panel.querySelector(".git-history-list").textContent.includes("draft second"), "history switches repository");
    if (heading("second").querySelector(".git-repo-options").getAttribute("aria-expanded") === "true") heading("second").querySelector(".git-repo-options").click();
    heading("second").querySelector(".git-repo-options").click();
    assert(!body("second").querySelector(".git-repo-controls").hidden && body("second").querySelectorAll(".git-remote-tools button").length === 3, "branch and remote actions accessible");
    const toggle = body("second").querySelector(".git-section-title button"); toggle.click();
    assert(!body("second").querySelector(".git-file"), "file group collapses");
    body("second").querySelector(".git-section-title button").click(); assert(body("second").querySelector(".git-file"), "file group reopens");
    for (const theme of ["light", "dark"]) {
      applyTheme(theme); panel.style.flexBasis = "240px";
      assert(panel.scrollWidth <= panel.clientWidth, "no horizontal panel overflow in " + theme);
    }
    panel.style.flexBasis = "";
    const expectedGroups = { Commit: ["Commit All", "Undo Last Commit", "Abort Rebase", "Commit All (Amend)", "Commit All (Signed Off)"], Changes: ["Discard All Changes"], "Pull, Push": ["Sync", "Pull (Rebase)", "Pull from…", "Push to…", "Fetch (Prune)", "Fetch From All Remotes"], Branch: ["Merge…", "Rebase Branch…", "Create Branch From…", "Rename Branch…", "Delete Branch…", "Delete Remote Branch…", "Publish Branch…"], Stash: ["Stash (Include Untracked)", "Stash Staged", "Apply Latest Stash", "Pop Latest Stash", "Drop All Stashes…", "View Stash…"], Tags: ["Delete Remote Tag…", "Push Tags"] };
    for (const [group, expected] of Object.entries(expectedGroups)) {
      repositoryRow("first").querySelector(".git-repository-more").click();
      [...document.querySelectorAll(".git-repository-menu button")].find(node => node.textContent === group).click();
      const names = [...document.querySelectorAll(".git-menu-submenu button")].map(node => node.textContent);
      assert(expected.every(name => names.includes(name)), group + " exposes its requested actions");
      repositoryRow("first").querySelector(".git-repository-more").click();
    }
    repositoryRow("first").querySelector(".git-repository-more").click();
    [...document.querySelectorAll(".git-repository-menu button")].find(node => node.textContent === "Commit").click();
    [...document.querySelectorAll(".git-menu-submenu button")].find(node => node.textContent === "Commit All (Signed Off)").click();
    await wait(() => !!document.querySelector(".git-action-dialog-input"));
    document.querySelector(".git-action-dialog-input").value = "signed test";
    document.querySelector(".git-action-dialog button.primary").click();
    await wait(() => !!document.querySelector(".git-action-dialog-choice"));
    assert(!requests.some(request => request.operation === "commitVariant"), "commit all waits for explicit confirmation");
    document.querySelector(".git-action-dialog-choice").click();
    await wait(() => requests.some(request => request.operation === "commitVariant")); await idle();
    const signed = requests.find(request => request.operation === "commitVariant");
    assert(signed.cwd === repos[0].path && signed.scope === "all" && signed.signoff === true && signed.message === "signed test", "commit all signed off targets correct repository and options");
    repositoryRow("second").querySelector(".git-repository-more").click();
    [...document.querySelectorAll(".git-repository-menu button")].find(node => node.textContent === "Stash").click();
    [...document.querySelectorAll(".git-menu-submenu button")].find(node => node.textContent === "Apply Stash…").click();
    await wait(() => !!document.querySelector(".git-action-dialog-choice"));
    document.querySelector(".git-action-dialog-choice").click(); await wait(() => requests.some(request => request.operation === "stashApply")); await idle();
    assert(requests.at(-1).cwd === repos[1].path, "stash apply targets its repository");
    await installContent(new TextEncoder().encode("clean"), "draft.txt", "", null);
    editor.executeEdits("test", [{ range: new monaco.Range(1, 1, 1, 1), text: "unsaved " }]);
    repositoryRow("first").querySelector(".git-repository-more").click();
    [...document.querySelectorAll(".git-repository-menu button")].find(node => node.textContent === "Stash").click();
    [...document.querySelectorAll(".git-menu-submenu button")].find(node => node.textContent === "Apply Stash…").click();
    await wait(() => !!document.querySelector(".git-action-dialog-choice")); document.querySelector(".git-action-dialog-choice").click();
    await wait(() => document.getElementById("git-status").classList.contains("error"));
    assert(requests.filter(request => request.operation === "stashApply").length === 1 && editor.getValue() === "unsaved clean", "unsaved editor blocks stash apply and preserves draft");
    return { passed: true, checks: 15, repositories: 2 };
  } finally { chrome.runtime.connectNative = originalConnect; }
})();
