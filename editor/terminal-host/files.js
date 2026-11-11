"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { createHash, randomUUID } = require("node:crypto");
const MAX_BYTES = 32 * 1024 * 1024;
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
function changed() { const error = new Error("File changed on disk. Your draft was kept; reload the disk version before saving."); error.code = "FILE_CHANGED"; return error; }
function sourcePath(url) {
  const parsed = new URL(url);
  if (parsed.protocol !== "file:" || parsed.search || parsed.hash) throw Error("Expected a local TXT file URL");
  const filename = fileURLToPath(parsed);
  if (!path.isAbsolute(filename) || path.extname(filename).toLowerCase() !== ".txt") throw Error("Only existing local TXT files can be saved directly");
  return filename;
}
async function readCurrent(filename, canonical) {
  if (await fs.realpath(filename) !== canonical) throw changed();
  const stat = await fs.stat(canonical);
  if (!stat.isFile()) throw Error("Expected a regular file");
  if (stat.size > MAX_BYTES) throw Object.assign(new Error("Direct save supports TXT files up to 32 MB"), { code: "DIRECT_SAVE_UNSUPPORTED" });
  return { stat, bytes: await fs.readFile(canonical) };
}
function createSession() {
  const grants = new Map();
  return async message => {
    if (!/^[0-9a-f]{64}$/.test(message.expectedHash)) throw Error("Invalid file baseline");
    if (message.operation === "bind") {
      const filename = sourcePath(message.url), canonical = await fs.realpath(filename);
      const current = await readCurrent(filename, canonical);
      if (hash(current.bytes) !== message.expectedHash) throw changed();
      const token = randomUUID();
      // Keep one binding per source URL in this native connection.
      for (const [id, grant] of grants) if (grant.filename === filename) grants.delete(id);
      grants.set(token, { filename, canonical, hash: message.expectedHash });
      return { token };
    }
    if (message.operation !== "write") throw Error("Unsupported file operation");
    const grant = grants.get(message.token);
    if (!grant || grant.hash !== message.expectedHash) throw Error("Open the original file before saving");
    if (typeof message.data !== "string" || message.data.length > Math.ceil(MAX_BYTES / 3) * 4) throw Error("Invalid or oversized file content");
    const bytes = Buffer.from(message.data, "base64");
    if (bytes.toString("base64") !== message.data) throw Error("Invalid file content encoding");
    if (bytes.length > MAX_BYTES) throw Error("File exceeds the direct-save limit of 32 MB");
    const current = await readCurrent(grant.filename, grant.canonical);
    if (hash(current.bytes) !== grant.hash) throw changed();
    const temporary = path.join(path.dirname(grant.canonical), ".local-text-editor-" + randomUUID() + ".tmp");
    let writer;
    try {
      writer = await fs.open(temporary, "wx", current.stat.mode);
      await writer.writeFile(bytes); await writer.sync(); await writer.close(); writer = null;
      // Check again after preparing the replacement, before replacing the original.
      if (hash((await readCurrent(grant.filename, grant.canonical)).bytes) !== grant.hash) throw changed();
      await fs.rename(temporary, grant.canonical);
      grant.hash = hash(bytes);
      return { hash: grant.hash };
    } finally {
      await writer?.close().catch(() => {});
      await fs.unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
    }
  };
}
module.exports = { createSession, MAX_BYTES };
