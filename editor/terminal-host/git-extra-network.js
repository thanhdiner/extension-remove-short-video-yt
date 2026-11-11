"use strict";

// Network and branch actions operate only on configured remotes and validated refs.
const OPERATIONS = new Set([
  "sync", "pullRebase", "pullFrom", "pushTo", "fetchPrune", "fetchAll",
  "mergeBranch", "rebaseBranch", "createBranchFrom", "renameBranch", "deleteBranch",
  "deleteRemoteBranch", "publishBranch", "tagDeleteRemote", "tagPush"
]);

async function execute(message, { cwd, current, git, status }) {
  if (!OPERATIONS.has(message.operation)) return null;
  const op = message.operation;
  const remote = (value) => {
    if (typeof value !== "string" || !current.remotes.includes(value)) throw Error("Choose a configured remote");
    return value;
  };
  const defaultRemote = () => {
    const tracking = current.branches.find(b => b.name === current.branch);
    return remote(tracking?.remote || (current.remotes.includes("origin") ? "origin" : current.remotes.length === 1 ? current.remotes[0] : ""));
  };
  const branch = async (value) => {
    if (typeof value !== "string" || !value || value.startsWith("-") || /[\0\r\n]/.test(value)) throw Error("Invalid branch name");
    await git(cwd, ["check-ref-format", "--branch", value]);
    return value;
  };
  const localBranch = async (value) => {
    await branch(value);
    if (!current.branches.some(b => b.name === value)) throw Error("Unknown local branch");
    return value;
  };
  const ref = async (value) => {
    await branch(value);
    const candidates = ["refs/heads/" + value, "refs/remotes/" + value];
    for (const candidate of candidates) {
      try { await git(cwd, ["show-ref", "--verify", "--quiet", candidate]); return candidate; } catch { /* Try the next namespace. */ }
    }
    throw Error("Unknown local or remote branch");
  };
  const tracking = current.branches.find(b => b.name === current.branch);
  const requireCurrent = () => {
    if (!tracking || !current.head) throw Error("Select a local branch with at least one commit first");
    return tracking;
  };
  const upstreamRef = () => {
    const b = requireCurrent();
    const value = b.remoteRef || "refs/heads/" + current.branch;
    if (!value.startsWith("refs/heads/")) throw Error("Upstream is not a branch");
    return value;
  };
  let args;
  switch (op) {
    case "fetchAll": args = ["fetch", "--all"]; break;
    case "fetchPrune": args = ["fetch", "--prune", defaultRemote()]; break;
    case "pullRebase": args = ["pull", "--rebase", defaultRemote(), upstreamRef()]; break;
    case "sync": {
      const r = defaultRemote(), remoteRef = upstreamRef();
      const output = await git(cwd, ["pull", "--ff-only", "--no-rebase", r, remoteRef]);
      const pushed = await git(cwd, ["push", "--porcelain", "--set-upstream", r, "HEAD:" + remoteRef]);
      return { ...await status(cwd), output: [output, pushed].filter(Boolean).join("\n") };
    }
    case "pullFrom": args = ["pull", "--ff-only", "--no-rebase", remote(message.remote), "refs/heads/" + await branch(message.branch)]; break;
    case "pushTo":
      requireCurrent();
      args = ["push", "--porcelain", remote(message.remote), "HEAD:refs/heads/" + await branch(message.branch)];
      break;
    case "mergeBranch": requireCurrent(); args = ["merge", "--no-edit", await ref(message.branch)]; break;
    case "rebaseBranch": requireCurrent(); args = ["rebase", await ref(message.branch)]; break;
    case "createBranchFrom": args = ["switch", "-c", await branch(message.branch), await ref(message.from)]; break;
    case "renameBranch": requireCurrent(); args = ["branch", "-m", await branch(message.branch)]; break;
    case "deleteBranch": args = ["branch", "-d", "--", await localBranch(message.branch)]; break;
    case "deleteRemoteBranch": args = ["push", "--porcelain", remote(message.remote), ":refs/heads/" + await branch(message.branch)]; break;
    case "publishBranch": requireCurrent(); args = ["push", "--porcelain", "--set-upstream", remote(message.remote), "HEAD:refs/heads/" + await branch(current.branch)]; break;
    case "tagDeleteRemote": {
      const name = message.name;
      if (typeof name !== "string" || !name || name.startsWith("-") || /[\0\r\n]/.test(name)) throw Error("Invalid tag name");
      await git(cwd, ["check-ref-format", "refs/tags/" + name]);
      args = ["push", "--porcelain", remote(message.remote), ":refs/tags/" + name];
      break;
    }
    case "tagPush": args = ["push", "--porcelain", remote(message.remote), "--tags"]; break;
  }
  const output = await git(cwd, args);
  return { ...await status(cwd), output };
}
module.exports = { execute };

