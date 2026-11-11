// Run in a fresh isolated editor.html?workspaceTest=... tab.
(async () => {
  if (!new URLSearchParams(location.search).get("workspaceTest")) throw Error("Use an isolated workspace");
  await localWorkspace.ready;
  const assert = (condition, label) => { if (!condition) throw Error(label); };
  const wait = async fn => { for (let i = 0; i < 200; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 20)); } throw Error("Timed out"); };
  const repo = { path: "C:\\fixture\\resize", name: "resize", branch: "main", branches: [], remotes: [], changes: [], commits: [] };
  chrome.runtime.connectNative = () => {
    let onMessage, onDisconnect;
    return { onMessage: { addListener: fn => onMessage = fn }, onDisconnect: { addListener: fn => onDisconnect = fn },
      disconnect: () => onDisconnect?.(), postMessage: message => setTimeout(() => onMessage({ type: "gitResult", id: message.id, result: repo }), 0) };
  };
  localSourceControl.setPaths([repo.path]); localSourceControl.setVisible(true);
  await wait(() => !!document.querySelector(".git-history-splitter") && document.getElementById("git-panel").getAttribute("aria-busy") !== "true");
  const splitter = () => document.querySelector(".git-history-splitter");
  const history = () => document.querySelector(".git-history-pane");
  const key = name => splitter().dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
  const before = history().getBoundingClientRect().height;
  key("ArrowUp"); assert(history().getBoundingClientRect().height === before + 10, "ArrowUp enlarges history");
  const resized = localSourceControl.getHistoryHeight();
  document.querySelector(".git-repo-toggle").click();
  assert(history().getBoundingClientRect().height === resized, "rerender retains height");
  document.querySelector(".git-history-title button").click();
  assert(splitter().hidden && localSourceControl.getHistoryHeight() === resized, "collapsed history hides separator without losing height");
  document.querySelector(".git-history-title button").click();
  assert(!splitter().hidden && history().getBoundingClientRect().height === resized, "expanded history restores height");
  await localWorkspace.saveNow();
  const record = await localWorkspace.store.get(localWorkspace.current.id);
  assert(record.gitHistoryHeight === resized, "workspace stores history height");
  key("End"); assert(history().getBoundingClientRect().height >= 28, "lower bound is usable");
  key("Home"); assert(document.querySelector(".git-changes-pane").getBoundingClientRect().height >= 69, "upper bound leaves room for Changes");
  localSourceControl.setHistoryHeight(resized);
  return { passed: true, before, resized, saved: record.gitHistoryHeight, splitter: splitter().getBoundingClientRect().toJSON() };
})();
