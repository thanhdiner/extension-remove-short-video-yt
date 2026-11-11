import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';

const root = path.resolve(import.meta.dirname, '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const resources = new Set();
const add = (file, relativeTo = '') => {
  if (!file || /^(?:[a-z]+:|#|\/\/)/i.test(file)) return;
  const target = path.resolve(root, relativeTo, decodeURIComponent(file.split(/[?#]/)[0]));
  assert.ok(target.startsWith(root + path.sep), `Resource escapes extension: ${target}`);
  assert.ok(existsSync(target), `Missing resource: ${path.relative(root, target)}`);
  resources.add(target);
};
Object.values(manifest.icons).forEach(file => add(file));
[manifest.action.default_popup, manifest.background.service_worker, manifest.options_page].forEach(file => add(file));
for (const script of manifest.content_scripts) [...(script.js || []), ...(script.css || [])].forEach(file => add(file));
for (const entry of manifest.web_accessible_resources) entry.resources.forEach(file => add(file));
for (const file of ['popup.html', 'focus/options.html', 'focus/popup.html', 'focus/blocked.html', 'editor/editor.html']) {
  const dom = new JSDOM(read(file));
  const seen = new Set();
  for (const el of dom.window.document.querySelectorAll('[id]')) {
    assert.ok(!seen.has(el.id), `Duplicate id ${el.id} in ${file}`); seen.add(el.id);
  }
  for (const el of dom.window.document.querySelectorAll('script[src],link[href]')) add(el.getAttribute('src') || el.getAttribute('href'), path.dirname(file));
  assert.equal(dom.window.document.querySelectorAll('script:not([src])').length, 0, `Inline extension script violates CSP: ${file}`);
  dom.window.close();
}
for (const file of [...resources]) {
  if (file.endsWith('.css')) for (const match of readFileSync(file, 'utf8').matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g)) add(match[1], path.dirname(path.relative(root, file)));
}
for (const name of ['editor','css','html','json','ts']) add(`editor/monaco/${name}.worker.js`);
const worker = manifest.background.service_worker;
for (const call of read(worker).matchAll(/importScripts\(([^)]+)\)/g)) for (const entry of call[1].matchAll(/['"]([^'"]+)['"]/g)) add(entry[1], path.dirname(worker));

function walk(dir) {
  return readdirSync(dir, { withFileTypes:true }).flatMap(entry => {
    if (['node_modules','.git'].includes(entry.name)) return [];
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(name) : /\.(?:m?js)$/.test(entry.name) ? [name] : [];
  });
}
const scripts = walk(root);
for (const file of scripts) {
  const result = spawnSync(process.execPath, ['--check',file], { encoding:'utf8', windowsHide:true });
  assert.equal(result.status, 0, `${path.relative(root,file)}: ${result.stderr}`);
}
console.log(`PASS: ${resources.size} referenced assets, unique HTML IDs, CSP-compatible scripts and ${scripts.length} JavaScript syntax checks.`);
