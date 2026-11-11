// Run in an isolated editor.html?workspaceTest=... tab.
(async () => {
  if (!new URLSearchParams(location.search).get("workspaceTest")) throw Error("Use an isolated workspace");
  await localWorkspace.ready;
  restoreExplorerWidth(240);
  const assert = (value, label) => { if (!value) throw Error(label); };
  const splitter = document.getElementById("explorer-splitter");
  const key = value => splitter.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }));
  assert(!explorerPanel.hidden && getComputedStyle(splitter).display !== "none", "splitter visible with Explorer");
  const before = explorerPanel.getBoundingClientRect().width;
  key("ArrowRight"); assert(explorerPanel.getBoundingClientRect().width === before + 10, "keyboard increases width");
  const resized = explorerWidth; await localWorkspace.saveNow();
  assert((await localWorkspace.store.get(localWorkspace.current.id)).explorerWidth === resized, "workspace stores width");
  key("End"); assert(document.querySelector(".editor-area").getBoundingClientRect().width >= 199, "leaves room for editor");
  const fixture = createTreeEntry({ name: "this-is-a-very-long-filename-for-testing-truncation.js", kind: "file" }, 0, "test\\this-is-a-very-long-filename-for-testing-truncation.js", false, null, null, { handle: { name: "test" } });
  explorerContent.append(fixture); setExplorerWidth(170);
  const label = fixture.querySelector(".tree-label");
  assert(getComputedStyle(label).whiteSpace === "nowrap" && getComputedStyle(label).textOverflow === "ellipsis" && label.scrollWidth > label.clientWidth, "long names truncate without wrapping");
  fixture.remove();
  restoreExplorerWidth(resized);
  key("Home"); assert(explorerPanel.hidden && getComputedStyle(splitter).display === "none", "Home collapses Explorer");
  explorerToggle.click(); assert(getComputedStyle(splitter).display !== "none" && explorerPanel.getBoundingClientRect().width === resized, "width retained when Explorer reopens");
  return { passed: true, resized, splitter: splitter.getBoundingClientRect().toJSON() };
})();
