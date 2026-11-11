// Run after reloading the same isolated tab used by cursor-blinking.browser.js.
(async () => {
  if (!new URLSearchParams(location.search).get("workspaceTest")) throw Error("Use an isolated workspaceTest tab");
  await localWorkspace.ready;
  const expected = JSON.parse(sessionStorage.getItem("cursor-blinking-regression"));
  if (localWorkspace.current.id !== expected.idA || cursorBlinking !== "phase" || editorGroups.length !== 2 || !editorGroups.every(group => group.editor.getRawOptions().cursorBlinking === "phase")) throw Error("Cursor setting did not survive reload");
  const other = await localWorkspace.store.get(expected.idB);
  if (other.settings.cursorBlinking !== "expand") throw Error("Other workspace mode was not retained");
  sessionStorage.removeItem("cursor-blinking-regression");
  return { passed: true, reloaded: true, mode: cursorBlinking, groups: editorGroups.length };
})();
