"use strict";

// The caller resolves the repository and supplies the same git/status helpers
// used by the main host. Arguments are passed directly to Git, never a shell.
async function execute(message, { cwd, git, status }) {
  const operation = message.operation;
  const actions = {
    stashIncludeUntracked: ["stash", "push", "--include-untracked"],
    stashStaged: ["stash", "push", "--staged"],
    stashApplyLatest: ["stash", "apply"],
    stashPopLatest: ["stash", "pop"]
  };
  if (actions[operation]) {
    const args = [...actions[operation]];
    if (operation === "stashIncludeUntracked" || operation === "stashStaged") {
      if (message.message) {
        if (typeof message.message !== "string" || message.message.includes("\0") || message.message.length > 10000) throw Error("Invalid stash message");
        args.push("-m", message.message);
      }
    }
    const output = await git(cwd, args);
    return { ...await status(cwd), output };
  }
  if (operation === "stashView") {
    if (typeof message.ref !== "string" || !/^stash@\{\d+\}$/.test(message.ref)) throw Error("Invalid stash reference");
    const output = await git(cwd, ["stash", "show", "--patch", "--include-untracked", "--no-ext-diff", "--no-textconv", message.ref]);
    return { ref: message.ref, output };
  }
  if (operation === "stashDropAll") {
    if (message.confirmed !== true || !Array.isArray(message.expectedHashes) || !message.expectedHashes.every(hash => typeof hash === "string" && /^[0-9a-f]{40,64}$/.test(hash))) throw Error("Confirm the stash list before dropping all stashes");
    const raw = await git(cwd, ["stash", "list", "--format=%H"]);
    const hashes = raw.split(/\r?\n/).filter(Boolean);
    if (!hashes.length) throw Error("There are no stashes to drop");
    if (hashes.length !== message.expectedHashes.length || hashes.some((hash, index) => hash !== message.expectedHashes[index])) throw Error("The stash list changed. Review it before dropping all stashes.");
    const output = await git(cwd, ["stash", "clear"]);
    return { ...await status(cwd), output };
  }
  return null;
}
module.exports = { execute };
