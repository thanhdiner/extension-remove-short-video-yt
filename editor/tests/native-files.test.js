"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const { createSession } = require("../terminal-host/files");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function fixture(t, content = Buffer.from("original\r\n")) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "local-editor-save-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filename = path.join(directory, "có dấu # + %.txt"); await fs.writeFile(filename, content);
  return { directory, filename, url: pathToFileURL(filename).href, content };
}
test("binds the exact URL and saves UTF-8 BOM/CRLF, repeated edits and empty content", async t => {
  const f = await fixture(t); const execute = createSession();
  const { token } = await execute({ operation: "bind", url: f.url, expectedHash: hash(f.content) });
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("đã sửa\r\ndòng hai\r\n")]);
  let result = await execute({ operation: "write", token, expectedHash: hash(f.content), data: bytes.toString("base64") });
  assert.equal(result.hash, hash(bytes)); assert.deepEqual(await fs.readFile(f.filename), bytes);
  assert.deepEqual(await fs.readdir(f.directory), [path.basename(f.filename)]);
  result = await execute({ operation: "write", token, expectedHash: result.hash, data: "" });
  assert.equal(result.hash, hash(Buffer.alloc(0))); assert.equal((await fs.stat(f.filename)).size, 0);
});
test("rejects external edits, wrong baselines and writes without a connection binding", async t => {
  const f = await fixture(t); const execute = createSession();
  await assert.rejects(execute({ operation: "bind", url: f.url, expectedHash: hash("wrong") }), { code: "FILE_CHANGED" });
  const { token } = await execute({ operation: "bind", url: f.url, expectedHash: hash(f.content) });
  await fs.writeFile(f.filename, "external edit");
  await assert.rejects(execute({ operation: "write", token, expectedHash: hash(f.content), data: Buffer.from("draft").toString("base64") }), { code: "FILE_CHANGED" });
  assert.equal(await fs.readFile(f.filename, "utf8"), "external edit");
  await assert.rejects(createSession()({ operation: "write", token, expectedHash: hash(f.content), data: "" }), /Open the original/);
  assert.deepEqual(await fs.readdir(f.directory), [path.basename(f.filename)]);
});
test("rejects invalid URLs, missing files and malformed content without changing disk", async t => {
  const f = await fixture(t); const execute = createSession();
  for (const url of ["https://example.com/a.txt", pathToFileURL(path.join(f.directory, "other.js")).href, f.url + "?other", f.url + "#fragment", pathToFileURL(path.join(f.directory, "missing.txt")).href]) {
    await assert.rejects(execute({ operation: "bind", url, expectedHash: hash(f.content) }));
  }
  const { token } = await execute({ operation: "bind", url: f.url, expectedHash: hash(f.content) });
  await assert.rejects(execute({ operation: "write", token, expectedHash: hash(f.content), data: "invalid!" }), /encoding/);
  assert.deepEqual(await fs.readFile(f.filename), f.content);
});
test("native transport handles direct saves above 1 MB and correlates errors", async t => {
  const f = await fixture(t);
  const host = spawn(process.execPath, [path.join(__dirname, "../terminal-host/host.js")], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  t.after(() => { host.stdin.end(); host.kill(); });
  let buffer = Buffer.alloc(0), next = 0; const pending = new Map();
  host.stdout.on("data", chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4 && buffer.length >= 4 + buffer.readUInt32LE(0)) {
      const n = buffer.readUInt32LE(0); const message = JSON.parse(buffer.subarray(4, 4 + n)); buffer = buffer.subarray(4 + n);
      pending.get(message.id)?.(message); pending.delete(message.id);
    }
  });
  const send = data => new Promise((resolve, reject) => {
    const id = ++next, timer = setTimeout(() => reject(Error("Host timeout")), 15000);
    pending.set(id, message => { clearTimeout(timer); resolve(message); });
    const payload = Buffer.from(JSON.stringify({ type: "file", id, ...data })); const header = Buffer.alloc(4); header.writeUInt32LE(payload.length); host.stdin.write(Buffer.concat([header, payload]));
  });
  const binding = await send({ operation: "bind", url: f.url, expectedHash: hash(f.content) }); assert.ok(binding.result.token);
  const bytes = Buffer.from("large text\r\n".repeat(100000));
  const written = await send({ operation: "write", token: binding.result.token, expectedHash: hash(f.content), data: bytes.toString("base64") });
  assert.equal(written.result.hash, hash(bytes)); assert.deepEqual(await fs.readFile(f.filename), bytes);
  await fs.writeFile(f.filename, "outside update");
  const failed = await send({ operation: "write", token: binding.result.token, expectedHash: hash(bytes), data: "" });
  assert.equal(failed.code, "FILE_CHANGED"); assert.equal(await fs.readFile(f.filename, "utf8"), "outside update");
});
