"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const network = require("../terminal-host/git-extra-network");
const host = require("../terminal-host/git");

function run(cwd, args) {
  return execFileSync("git", ["--no-pager", "-c", "color.ui=false", ...args], {
    cwd, encoding: "utf8", windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" },
    stdio: ["ignore", "pipe", "pipe"]
  });
}
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "editor-network-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const remote = path.join(root, "remote.git"), cwd = path.join(root, "repo");
  await fs.mkdir(cwd);
  run(root, ["init", "--bare", remote]);
  run(cwd, ["init", "-b", "main"]);
  run(cwd, ["config", "user.name", "Test User"]);
  run(cwd, ["config", "user.email", "test@example.invalid"]);
  await fs.writeFile(path.join(cwd, "one.txt"), "one\n");
  run(cwd, ["add", "one.txt"]);
  run(cwd, ["commit", "-m", "first"]);
  run(cwd, ["remote", "add", "origin", remote]);
  run(cwd, ["push", "-u", "origin", "main"]);
  const git = async (dir, args) => run(dir, args);
  const status = async dir => host.execute({ operation: "status", cwd: dir });
  async function act(operation, fields = {}) {
    return network.execute({ operation, ...fields }, { cwd, current: await status(cwd), git, status });
  }
  return { cwd, remote, act };
}

test("branch creation, rename, merge, publish, deletion and tag actions use the intended refs", async t => {
  const { cwd, remote, act } = await fixture(t);
  await act("createBranchFrom", { branch: "feature", from: "main" });
  assert.equal(run(cwd, ["branch", "--show-current"]).trim(), "feature");
  await act("renameBranch", { branch: "renamed" });
  await act("publishBranch", { remote: "origin" });
  assert.match(run(remote, ["show-ref", "--heads"]), /refs\/heads\/renamed/);
  run(cwd, ["switch", "main"]);
  await act("mergeBranch", { branch: "renamed" });
  await act("deleteBranch", { branch: "renamed" });
  await act("deleteRemoteBranch", { remote: "origin", branch: "renamed" });
  assert.doesNotMatch(run(remote, ["show-ref", "--heads"]), /refs\/heads\/renamed/);
  run(cwd, ["tag", "v1"]);
  await act("tagPush", { remote: "origin" });
  assert.match(run(remote, ["show-ref", "--tags"]), /refs\/tags\/v1/);
  await act("tagDeleteRemote", { remote: "origin", name: "v1" });
  assert.equal(run(remote, ["tag", "--list"]).trim(), "");
});

test("network operations target configured remote and reject unsafe arguments", async t => {
  const { cwd, act } = await fixture(t);
  await act("fetchPrune");
  await act("fetchAll");
  await act("pullRebase");
  await act("pullFrom", { remote: "origin", branch: "main" });
  await act("pushTo", { remote: "origin", branch: "another" });
  await act("sync");
  await assert.rejects(act("deleteRemoteBranch", { remote: "origin", branch: "-bad" }), /Invalid branch/);
  await assert.rejects(act("tagDeleteRemote", { remote: "origin", name: "bad..name" }));
  await assert.rejects(act("pushTo", { remote: "-bad", branch: "main" }), /configured remote/);
  await assert.rejects(act("mergeBranch", { branch: "nonexistent" }), /Unknown local or remote branch/);
  assert.equal(run(cwd, ["branch", "--show-current"]).trim(), "main");
});
