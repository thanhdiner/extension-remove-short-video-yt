"use strict";
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const LIMIT = 1024 * 1024;
function git(cwd, args) {
  return new Promise((resolve, reject) => execFile("git", ["--no-pager", "--literal-pathspecs", "-c", "color.ui=false", ...args], {
    cwd, windowsHide: true, encoding: "utf8", maxBuffer: LIMIT * 2, timeout: 60000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" }
  }, (error, stdout, stderr) => {
    if (error) reject(new Error(error.code === "ENOENT" ? "Git not found. Install Git for Windows, then restart Chrome." : (stderr || error.message).trim())); else resolve(stdout);
  }));
}
async function hasHead(cwd) { try { await git(cwd, ["rev-parse", "--verify", "HEAD"]); return true; } catch { return false; } }
function parseStatus(text) {
  const fields = text.split("\0"); const changes = [];
  for (let i = 0; i < fields.length; i++) {
    const item = fields[i]; if (!item) continue;
    const entry = { index: item[0], worktree: item[1], path: item.slice(3) };
    if (/[RC]/.test(item.slice(0, 2))) entry.oldPath = fields[++i];
    changes.push(entry);
  }
  return changes;
}
function filePath(value) {
  if (typeof value !== "string" || !value || value.includes("\0") || value.includes("\\") || path.posix.isAbsolute(value) || /^[a-z]:/i.test(value) || value.split("/").some(p => p === ".." || p.toLowerCase() === ".git")) throw Error("Invalid repository file path");
  return value;
}
async function status(cwd) {
  const head = await hasHead(cwd);
  const [raw, branch, history, branchData, remoteData, headHash] = await Promise.all([
    git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    git(cwd, ["symbolic-ref", "--short", "HEAD"]).catch(() => git(cwd, ["rev-parse", "--short", "HEAD"])),
    head ? git(cwd, ["log", "-40", "--date=iso-strict", "--format=%H%x00%h%x00%an%x00%aI%x00%s%x00%D%x00", "-z"]) : "",
    git(cwd, ["for-each-ref", "--format=%(refname:short)%00%(upstream:short)%00%(upstream:remotename)%00%(upstream:remoteref)", "refs/heads/"]),
    git(cwd, ["remote"]),
    head ? git(cwd, ["rev-parse", "--verify", "HEAD"]) : ""
  ]);
  const fields = history.split("\0"); const commits = [];
  for (let i = 0; i < fields.length;) {
    if (!fields[i]) { i++; continue; }
    const [hash, shortHash, author, date, subject, refs] = fields.slice(i, i + 6); i += 6;
    commits.push({ hash, shortHash, author, date, subject, refs });
  }
  const branches = branchData.trim().split("\n").filter(Boolean).map(line => { const [name, upstream, remote, remoteRef] = line.trimEnd().split("\0"); return { name, upstream, remote, remoteRef }; });
  const remotes = remoteData.trim().split(/\r?\n/).filter(Boolean);
  const tracking = branches.find(b => b.name === branch.trim());
  let ahead = 0, behind = 0;
  if (tracking?.upstream && head) {
    try { [ahead, behind] = (await git(cwd, ["rev-list", "--left-right", "--count", "HEAD...@{upstream}"])).trim().split(/\s+/).map(Number); } catch { /* Upstream ref may not have been fetched yet. */ }
  }
  return { path: cwd, name: path.basename(cwd), branch: branch.trim(), head, headHash: headHash.trim(), changes: parseStatus(raw), commits, branches, remotes, ahead, behind };
}
async function blob(cwd, spec) {
  const size = Number((await git(cwd, ["cat-file", "-s", spec])).trim());
  if (size > LIMIT) throw Error("File too large for diff (maximum 1 MB)");
  const text = await git(cwd, ["show", "--no-ext-diff", "--no-textconv", spec]);
  if (text.includes("\0")) throw Error("Binary files cannot be displayed as text");
  return text;
}
async function worktree(cwd, name) {
  const filename = path.join(cwd, filePath(name));
  const real = await fs.realpath(filename);
  const relative = path.relative(cwd, real);
  if (relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) throw Error("File is outside repository");
  const stat = await fs.stat(real);
  if (!stat.isFile() || stat.size > LIMIT) throw Error("Diff supports text files up to 1 MB");
  const bytes = await fs.readFile(real);
  if (bytes.includes(0)) throw Error("Binary files cannot be displayed as text");
  return bytes.toString("utf8");
}
function argument(value, label) {
  if (typeof value !== "string" || !value.trim() || value.startsWith("-") || value.includes("\0") || /[\r\n]/.test(value)) throw Error("Invalid " + label);
  return value;
}
function stashRef(value) {
  if (typeof value !== "string" || !/^stash@\{\d+\}$/.test(value)) throw Error("Invalid stash reference");
  return value;
}
async function execute(message) {
  if (message.operation === "clone") {
    const parent = argument(message.cwd, "destination folder");
    if (!path.isAbsolute(parent)) throw Error("Choose a destination folder first");
    const url = argument(message.url, "repository URL");
    const name = argument(message.name, "destination name");
    if (name === "." || name === ".." || /[\\/]/.test(name)) throw Error("Invalid destination name");
    const realParent = await fs.realpath(parent);
    await git(realParent, ["clone", "--", url, name]);
    return status(await fs.realpath(path.join(realParent, name)));
  }
  if (typeof message.cwd !== "string" || !path.isAbsolute(message.cwd)) throw Error("Choose a repository folder first");
  const cwd = await fs.realpath((await git(message.cwd, ["rev-parse", "--show-toplevel"])).trim());
  if (message.operation === "status") return status(cwd);
  const current = await status(cwd);
  for (const moduleName of ["./git-extra-commit", "./git-extra-stash", "./git-extra-network"]) {
    const result = await require(moduleName).execute(message, { cwd, current, git, status });
    if (result !== null) return result;
  }
  if (message.operation === "stashList") {
    const raw = await git(cwd, ["stash", "list", "--format=%gd%x00%gs%x00%H"]);
    return { stashes: raw.trim().split(/\r?\n/).filter(Boolean).map(line => { const [ref, subject, hash] = line.split("\0"); return { ref, subject, hash }; }) };
  }
  if (["stashCreate", "stashApply", "stashPop", "stashDrop"].includes(message.operation)) {
    let args;
    if (message.operation === "stashCreate") {
      args = ["stash", "push"];
      if (message.message) { if (typeof message.message !== "string" || message.message.includes("\0")) throw Error("Invalid stash message"); args.push("-m", message.message); }
    } else {
      const action = { stashApply: "apply", stashPop: "pop", stashDrop: "drop" }[message.operation];
      args = ["stash", action, stashRef(message.ref)];
    }
    const output = await git(cwd, args); return { ...await status(cwd), output };
  }
  if (message.operation === "tagList") {
    const raw = await git(cwd, ["tag", "--list"]);
    return { tags: raw.split(/\r?\n/).filter(Boolean) };
  }
  if (message.operation === "tagCreate" || message.operation === "tagDelete") {
    const name = argument(message.name, "tag name");
    await git(cwd, ["check-ref-format", "refs/tags/" + name]);
    const output = await git(cwd, message.operation === "tagCreate" ? ["tag", "--", name] : ["tag", "-d", "--", name]);
    return { ...await status(cwd), output };
  }
  if (message.operation === "remoteList") {
    const remotes = await Promise.all(current.remotes.map(async name => ({ name, url: (await git(cwd, ["remote", "get-url", name])).trim() })));
    return { remotes };
  }
  if (message.operation === "remoteAdd" || message.operation === "remoteRemove") {
    const name = argument(message.name, "remote name");
    if (message.operation === "remoteRemove" && !current.remotes.includes(name)) throw Error("Unknown remote");
    const args = message.operation === "remoteAdd" ? ["remote", "add", "--", name, argument(message.url, "remote URL")] : ["remote", "remove", "--", name];
    const output = await git(cwd, args); return { ...await status(cwd), output };
  }
  if (message.operation === "worktreeList") {
    const raw = await git(cwd, ["worktree", "list", "--porcelain", "-z"]);
    const worktrees = []; let item = {};
    for (const field of raw.split("\0")) {
      if (!field) { if (item.path) worktrees.push(item); item = {}; continue; }
      const split = field.indexOf(" "); const key = split < 0 ? field : field.slice(0, split); const value = split < 0 ? true : field.slice(split + 1);
      if (key === "worktree") item.path = value; else if (key === "HEAD") item.head = value; else if (key === "branch") item.branch = value.replace(/^refs\/heads\//, ""); else item[key] = value;
    }
    if (item.path) worktrees.push(item);
    return { worktrees };
  }
  if (message.operation === "worktreeAdd") {
    const destination = argument(message.destination, "worktree path");
    if (!path.isAbsolute(destination)) throw Error("Choose an absolute worktree path");
    const branch = argument(message.branch, "branch name");
    await git(cwd, ["check-ref-format", "--branch", branch]);
    if (!current.branches.some(b => b.name === branch)) throw Error("Unknown local branch");
    const output = await git(cwd, ["worktree", "add", "--", destination, branch]);
    return { ...await status(cwd), output };
  }
  if (message.operation === "switchBranch" || message.operation === "createBranch") {
    if (typeof message.branch !== "string" || !message.branch || message.branch.startsWith("-") || message.branch.includes("\0")) throw Error("Invalid branch name");
    await git(cwd, ["check-ref-format", "--branch", message.branch]);
    if (message.operation === "switchBranch" && !current.branches.some(b => b.name === message.branch)) throw Error("Unknown local branch");
    const output = await git(cwd, message.operation === "createBranch" ? ["switch", "-c", message.branch] : ["switch", message.branch]);
    return { ...await status(cwd), output };
  }
  if (["fetch", "pull", "push"].includes(message.operation)) {
    const tracking = current.branches.find(b => b.name === current.branch);
    const remote = tracking?.remote || (current.remotes.includes("origin") ? "origin" : current.remotes.length === 1 ? current.remotes[0] : "");
    if (!remote || remote.startsWith("-") || !current.remotes.includes(remote)) throw Error("Configure a remote/upstream for this branch in the terminal first");
    let args = ["fetch", "--no-tags", remote];
    if (message.operation !== "fetch") {
      if (!tracking || !current.head) throw Error("Select a local branch with at least one commit first");
      const remoteRef = tracking.remoteRef || "refs/heads/" + current.branch;
      args = message.operation === "pull" ? ["pull", "--ff-only", "--no-rebase", remote, remoteRef]
        : ["push", "--porcelain", "--set-upstream", remote, "HEAD:" + remoteRef];
    }
    const output = await git(cwd, args);
    return { ...await status(cwd), output };
  }
  if (message.operation === "commit") {
    if (typeof message.message !== "string" || !message.message.trim() || message.message.length > 10000 || message.message.includes("\0")) throw Error("Enter a commit message");
    if (!current.changes.some(e => e.index !== " " && e.index !== "?")) throw Error("Stage changes before committing");
    const output = await git(cwd, ["commit", "-m", message.message.trim()]);
    return { ...await status(cwd), output };
  }
  const name = filePath(message.path);
  const entry = current.changes.find(e => e.path === name);
  if (!entry) throw Error("File status changed. Refresh Source Control and try again.");
  const paths = entry.oldPath ? [filePath(entry.oldPath), name] : [name];
  if (message.operation === "stage") { await git(cwd, ["add", "--", ...(/[RC]/.test(entry.worktree) ? paths : [name])]); return status(cwd); }
  if (message.operation === "unstage") {
    await git(cwd, current.head ? ["restore", "--staged", "--source=HEAD", "--", ...paths] : ["rm", "--cached", "-f", "--ignore-unmatch", "--", ...paths]);
    return status(cwd);
  }
  if (message.operation === "diff") {
    if (entry.index === "U" || entry.worktree === "U" || ["AA", "DD"].includes(entry.index + entry.worktree)) throw Error("Resolve merge conflicts in the file, then stage it.");
    const staged = message.staged === true;
    if (staged && (entry.index === " " || entry.index === "?")) throw Error("This file has no staged changes");
    const original = staged
      ? (!current.head || entry.index === "A" ? "" : await blob(cwd, "HEAD:" + (entry.oldPath || name)))
      : (entry.index === "?" || entry.worktree === "A" ? "" : await blob(cwd, ":" + name));
    const modified = staged ? (entry.index === "D" ? "" : await blob(cwd, ":" + name))
      : (entry.worktree === "D" ? "" : await worktree(cwd, name));
    return { path: name, staged, original, modified };
  }
  throw Error("Unsupported Git operation");
}
module.exports = { execute, parseStatus };
