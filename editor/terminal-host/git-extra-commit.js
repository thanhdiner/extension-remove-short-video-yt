"use strict";

// The host supplies its argument-safe Git runner and the status already read for
// this request. Returning null lets the caller continue with other operations.
async function execute(message, { cwd, current, git, status }) {
  const operation = message.operation;
  if (!["commitVariant", "undoLastCommit", "abortRebase", "discardAllChanges"].includes(operation)) return null;

  if (operation === "commitVariant") {
    if (!["staged", "all"].includes(message.scope)) throw Error("Invalid commit scope");
    if (typeof message.amend !== "boolean" || typeof message.signoff !== "boolean") throw Error("Invalid commit options");
    if (message.amend && !current.head) throw Error("There is no commit to amend");
    if (message.amend && message.expectedHead !== current.headHash) throw Error("The last commit changed. Review it before amending.");
    const text = message.message;
    if (typeof text !== "string" || text.length > 10000 || text.includes("\0") || (!message.amend && !text.trim())) throw Error("Enter a commit message");
    if (message.scope === "all") await git(cwd, ["add", "--all", "--", "."]);
    else if (!message.amend && !current.changes.some(e => e.index !== " " && e.index !== "?")) throw Error("Stage changes before committing");
    const args = ["commit"];
    if (message.amend) args.push("--amend");
    if (message.signoff) args.push("--signoff");
    if (text.trim()) args.push("-m", text.trim());
    else args.push("--no-edit");
    const output = await git(cwd, args);
    return { ...await status(cwd), output };
  }

  if (message.confirmed !== true) throw Error("Confirmation required");
  let args;
  if (operation === "undoLastCommit") {
    if (!current.head || message.expectedHead !== current.headHash) throw Error("The last commit changed. Review it before undoing.");
    // Soft reset preserves both the index and working files.
    await git(cwd, ["rev-parse", "--verify", "HEAD^", "--"]);
    args = ["reset", "--soft", "HEAD^"];
  } else if (operation === "abortRebase") {
    args = ["rebase", "--abort"];
  } else {
    // Work only on the exact reviewed file list; staged contents stay intact.
    if (!Array.isArray(message.paths) || !message.paths.length || !message.paths.every(p => typeof p === "string" && p && !p.includes("\0") && !p.includes("\\") && !p.startsWith("/") && !/^[a-z]:/i.test(p) && !p.split("/").some(part => part === ".." || part.toLowerCase() === ".git"))) throw Error("Select tracked changes to discard");
    const actual = current.changes.filter(e => e.worktree !== " ").map(e => e.path).sort();
    const expected = [...new Set(message.paths)].sort();
    if (actual.length !== expected.length || actual.some((value, i) => value !== expected[i])) throw Error("The changed file list has changed. Review it before discarding.");
    const untracked = current.changes.filter(e => e.worktree === "?").map(e => e.path);
    const tracked = expected.filter(p => !untracked.includes(p));
    const output = [];
    if (tracked.length) output.push(await git(cwd, ["restore", "--worktree", "--", ...tracked]));
    if (untracked.length) output.push(await git(cwd, ["clean", "-f", "--", ...untracked]));
    return { ...await status(cwd), output: output.filter(Boolean).join("\n") };
  }
  const output = await git(cwd, args);
  return { ...await status(cwd), output };
}
module.exports = { execute };
