(async () => {
  if (!new URLSearchParams(location.search).get("workspaceTest")) throw Error("Use isolated test tab");
  await localWorkspace.ready;
  const expected = JSON.parse(sessionStorage.getItem("git-ui-regression"));
  if (localWorkspace.current.id !== expected.idA || JSON.stringify(localSourceControl.getPaths()) !== JSON.stringify(expected.paths)) throw Error("Repository paths did not survive reload");
  if (document.getElementById("git-panel").hidden) document.getElementById("git-toggle").click(); await localSourceControl.refresh();
  const until = Date.now() + 20000;
  while (document.getElementById("git-panel").getAttribute("aria-busy") === "true") { if (Date.now() > until) throw Error("Git refresh timeout"); await new Promise(r => setTimeout(r, 40)); }
  if (document.querySelectorAll(".git-repository").length !== 2 || !document.querySelector('.git-file[data-path="new file.txt"]')) throw Error("Repository status did not restore");
  return { passed: true, reloaded: true, repositories: 2 };
})();
