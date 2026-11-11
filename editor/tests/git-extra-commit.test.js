"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const extra = require("../terminal-host/git-extra-commit");
const service = require("../terminal-host/git");

async function fixture(t) {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "local-editor-commit-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  const gitSync = (...args) => execFileSync("git", ["--no-pager", ...args], { cwd, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  gitSync("init", "-b", "main");
  gitSync("config", "user.name", "Editor Test");
  gitSync("config", "user.email", "test@example.invalid");
  gitSync("config", "commit.gpgsign", "false");
  gitSync("config", "core.autocrlf", "false");
  const write = (name, text) => fs.writeFile(path.join(cwd, name), text);
  const request = async (operation, options = {}) => extra.execute({ operation, ...options }, {
    cwd, current: await service.execute({ cwd, operation: "status" }),
    git: async (_cwd, args) => gitSync(...args), status: () => service.execute({ cwd, operation: "status" })
  });
  return { cwd, git: gitSync, write, request };
}
test("commit scopes, signoff, amend, and soft undo preserve changes", async t => {
  const { cwd, git, write, request } = await fixture(t);
  await write("one.txt", "one\n"); await write("two.txt", "two\n");
  git("add", "one.txt");
  await request("commitVariant", { scope: "staged", amend: false, signoff: true, message: "initial" });
  assert.match(git("log", "-1", "--format=%B"), /Signed-off-by: Editor Test/);
  assert.equal(git("status", "--porcelain").trim(), "?? two.txt");
  await request("commitVariant", { scope: "all", amend: false, signoff: false, message: "add all" });
  await write("one.txt", "updated\n"); git("add", "one.txt");
  const beforeAmend = git("rev-parse", "HEAD").trim();
  await assert.rejects(request("commitVariant", { scope: "staged", amend: true, signoff: false, message: "", expectedHead: "stale" }), /changed/);
  await request("commitVariant", { scope: "staged", amend: true, signoff: false, message: "", expectedHead: beforeAmend });
  assert.equal(git("log", "-1", "--format=%s").trim(), "add all");
  assert.equal(git("show", "HEAD:one.txt"), "updated\n");
  await assert.rejects(request("undoLastCommit"), /Confirmation required/);
  await assert.rejects(request("undoLastCommit", { confirmed: true, expectedHead: beforeAmend }), /changed/);
  await request("undoLastCommit", { confirmed: true, expectedHead: git("rev-parse", "HEAD").trim() });
  assert.equal(git("log", "-1", "--format=%s").trim(), "initial");
  assert.match(git("diff", "--cached", "--name-only"), /one.txt/);
  assert.equal(await fs.readFile(path.join(cwd, "one.txt"), "utf8"), "updated\n");
});
test("discard restores tracked contents and removes reviewed untracked files while preserving staged changes", async t => {
  const { cwd, git, write, request } = await fixture(t);
  await write("one.txt", "base\n"); git("add", "one.txt"); git("commit", "-m", "base");
  await write("one.txt", "staged\n"); git("add", "one.txt"); await write("one.txt", "unstaged\n");
  await write("untracked.txt", "keep\n");
  await assert.rejects(request("discardAllChanges"), /Confirmation required/);
  await assert.rejects(request("discardAllChanges", { confirmed: true, paths: ["other.txt"] }), /changed/);
  await request("discardAllChanges", { confirmed: true, paths: ["one.txt", "untracked.txt"] });
  assert.equal(await fs.readFile(path.join(cwd, "one.txt"), "utf8"), "staged\n");
  await assert.rejects(fs.access(path.join(cwd, "untracked.txt")), { code: "ENOENT" });
  assert.match(git("diff", "--cached"), /staged/);
});
test("abort rebase requires confirmation and restores pre-rebase branch", async t => {
  const { git, write, request } = await fixture(t);
  await write("one.txt", "base\n"); git("add", "one.txt"); git("commit", "-m", "base");
  git("switch", "-c", "other"); await write("one.txt", "other\n"); git("commit", "-am", "other");
  git("switch", "main"); await write("one.txt", "main\n"); git("commit", "-am", "main");
  assert.throws(() => git("rebase", "other"));
  await assert.rejects(request("abortRebase"), /Confirmation required/);
  await request("abortRebase", { confirmed: true });
  assert.equal(git("branch", "--show-current").trim(), "main");
  assert.equal(git("status", "--porcelain").trim(), "");
});
test("main Git service dispatches commit variants and guards stale HEAD", async t => {
  const { cwd, git, write } = await fixture(t);
  await write("one.txt", "base\n"); git("add", "one.txt");
  await service.execute({ cwd, operation: "commitVariant", scope: "staged", amend: false, signoff: false, message: "first" });
  const initial = await service.execute({ cwd, operation: "status" });
  assert.equal(initial.headHash, git("rev-parse", "HEAD").trim());
  await assert.rejects(service.execute({ cwd, operation: "undoLastCommit", confirmed: true, expectedHead: "stale" }), /changed/);
  assert.equal(git("rev-parse", "HEAD").trim(), initial.headHash);
});
