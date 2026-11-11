// Run after source-control-reload.browser.js in the same isolated fixture tab.
// The fixture's origin must be a temporary local bare repository.
(async () => {
  if (!new URLSearchParams(location.search).get("workspaceTest")) throw Error("Use isolated test tab");
  await localWorkspace.ready;
  const $ = id => document.getElementById(id);
  const assert = (ok, label) => { if (!ok) throw Error(label + ": " + $("git-status").textContent); };
  const idle = async () => { const end = Date.now() + 20000; while ($("git-panel").getAttribute("aria-busy") === "true") { if (Date.now() > end) throw Error("Git timeout"); await new Promise(r => setTimeout(r, 40)); } };
  await localSourceControl.refresh(); await idle();
  assert(document.querySelectorAll(".git-remote-tools button").length === 3, "remote actions available");
  document.querySelector(".git-branch-tools > button").click();
  document.querySelector(".git-new-branch input").value = "feature/ui-test";
  document.querySelector(".git-new-branch").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await idle();
  assert(document.querySelector(".git-branch-tools select").value === "feature/ui-test", "creates and selects branch");
  let select = document.querySelector(".git-branch-tools select"); select.value = "main"; select.dispatchEvent(new Event("change")); await idle();
  assert(document.querySelector(".git-branch-tools select").value === "main", "switches local branch");
  for (const label of ["Push", "Fetch", "Pull"]) {
    [...document.querySelectorAll(".git-remote-tools button")].find(b => b.textContent.startsWith(label)).click(); await idle();
    assert(!$("git-status").classList.contains("error"), label + " succeeds against local remote");
  }
  await installContent(new TextEncoder().encode("clean\n"), "branch-protection.txt", "", null);
  editor.executeEdits("git-ui-test", [{ range: new monaco.Range(1, 1, 1, 1), text: "unsaved " }]);
  select = document.querySelector(".git-branch-tools select"); select.value = "feature/ui-test"; select.dispatchEvent(new Event("change")); await idle();
  assert($("git-status").classList.contains("error") && document.querySelector(".git-branch-tools select").value === "main", "blocks branch switch with unsaved editor");
  assert(editor.getValue().startsWith("unsaved ") && state.dirty, "unsaved text preserved");
  const current = activeTab; editor.setValue(current.cleanText); refresh(); closeTab(current);
  assert(!tabs.length, "test buffer cleaned");
  return { passed: true, branchSwitch: true, localRemoteActions: 3, protectsDraft: true };
})();
