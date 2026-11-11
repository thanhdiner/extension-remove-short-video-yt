"use strict";

// Chrome native messaging transport: stdout is reserved exclusively for framed JSON.
const fs = require("fs");
const path = require("path");
const { execFile, execFileSync } = require("child_process");
const pty = require("node-pty");
const gitService = require("./git");
const fileService = require("./files").createSession();
let fileQueue = Promise.resolve();
let gitQueue = Promise.resolve();
let shell = null;
let folderPicker = null;
let input = Buffer.alloc(0);
function send(message) {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length);
  process.stdout.write(Buffer.concat([header, payload]));
}
function validSize(value, fallback) { return Number.isInteger(value) ? Math.max(2, Math.min(500, value)) : fallback; }
function stop() { if (shell) { try { shell.kill(); } catch {} shell = null; } if (folderPicker) { try { folderPicker.kill(); } catch {} folderPicker = null; } }
function handle(message) {
  if (!message || typeof message !== "object") return;
  if (message.type === "file") {
    fileQueue = fileQueue.then(() => fileService(message)).then(
      result => send({ type: "fileResult", id: message.id, result }),
      error => send({ type: "fileResult", id: message.id, error: error.message, code: error.code })
    );
    return;
  }
  if (message.type === "git") {
    gitQueue = gitQueue.then(() => gitService.execute(message)).then(
      result => send({ type: "gitResult", id: message.id, result }),
      error => send({ type: "gitResult", id: message.id, error: error.message })
    );
    return;
  }
  if (message.type === "chooseDirectory") {
    if (folderPicker) return;
    const exe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    const script = 'Add-Type -AssemblyName System.Windows.Forms; [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = "Select folder"; $d.ShowNewFolderButton = $false; if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Write($d.SelectedPath) }; $d.Dispose()';
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    folderPicker = execFile(exe, ["-NoProfile", "-STA", "-EncodedCommand", encoded], { windowsHide: true, encoding: "utf8", maxBuffer: 65536 }, (error, stdout) => {
      folderPicker = null;
      if (error) send({ type: "error", message: "Không thể chọn thư mục: " + error.message });
      else send({ type: "directoryChosen", cwd: stdout.trim() });
    });
  } else if (message.type === "start") {
    if (shell) return;
    const cwd = typeof message.cwd === "string" && message.cwd ? message.cwd : process.env.USERPROFILE;
    if (!cwd || !path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory()) throw new Error("Thư mục terminal không hợp lệ.");
    const systemDirectory = path.join(process.env.SystemRoot || "C:\\Windows", "System32");
    let exe;
    try { exe = execFileSync(path.join(systemDirectory, "where.exe"), ["pwsh.exe"], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).split(/\r?\n/).find(Boolean); }
    catch { /* Windows PowerShell remains available as a fallback. */ }
    exe ||= path.join(systemDirectory, "WindowsPowerShell", "v1.0", "powershell.exe");
    shell = pty.spawn(exe, ["-NoLogo"], { name: "xterm-256color", cols: validSize(message.cols, 80), rows: validSize(message.rows, 24), cwd, env: process.env, useConpty: true });
    shell.onData(data => send({ type: "data", data }));
    shell.onExit(event => { shell = null; send({ type: "exit", code: event.exitCode }); });
    send({ type: "started", cwd });
  } else if (message.type === "input" && shell && typeof message.data === "string" && message.data.length <= 65536) {
    shell.write(message.data);
  } else if (message.type === "resize" && shell) {
    shell.resize(validSize(message.cols, 80), validSize(message.rows, 24));
  } else if (message.type === "stop") { stop(); }
}
process.stdin.on("data", chunk => {
  input = Buffer.concat([input, chunk]);
  while (input.length >= 4) {
    const length = input.readUInt32LE(0);
    if (length > 48 * 1024 * 1024) { process.exitCode = 1; process.stdin.destroy(); return; }
    if (input.length < 4 + length) return;
    const payload = input.subarray(4, 4 + length);
    input = input.subarray(4 + length);
    try { handle(JSON.parse(payload.toString("utf8"))); }
    catch (error) { send({ type: "error", message: error.message }); }
  }
});
process.stdin.on("end", () => { stop(); process.exit(0); });
process.on("exit", stop);
