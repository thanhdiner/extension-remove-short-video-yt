import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { formatJson, jsonLines, MAX_JSON_LENGTH, readJsonDocument } from '../src/json-format.mjs';

test('JSON formatter preserves exact numeric tokens, duplicate keys, escapes and key order', () => {
  const raw = '{"z":9007199254740993123456789,"z":-0,"2":1.2300e+400,"1":"\\u0061","s":"<script>\\n\\\"\\\\","__proto__":{"safe":true}}';
  const formatted = formatJson(raw);
  assert.ok(formatted);
  for (const exact of ['9007199254740993123456789', '-0', '1.2300e+400', '"\\u0061"', '"<script>\\n\\\"\\\\"']) assert.ok(formatted.text.includes(exact), exact);
  assert.equal((formatted.text.match(/"z":/g) || []).length, 2);
  assert.ok(formatted.text.indexOf('"2"') < formatted.text.indexOf('"1"'));
  assert.deepEqual(JSON.parse(formatted.text), JSON.parse(raw));
  assert.equal(formatted.raw, raw);
  assert.equal({}.safe, undefined);
});

test('objects, arrays, empty structures and all JSON root primitives format correctly', () => {
  for (const raw of ['{}', '[]', '{"x":[],"a":[1,{"b":null}]}', 'null', 'true', 'false', '-42.5e-2', '"Tiếng Việt 😀"', '\uFEFF \n {"x":1} \t']) {
    const formatted = formatJson(raw);
    assert.ok(formatted, raw);
    assert.deepEqual(JSON.parse(formatted.text), JSON.parse(raw.replace(/^\uFEFF/, '')));
    assert.equal(formatJson(formatted.text).text, formatted.text, 'formatting is idempotent');
  }
});

test('invalid JSON and oversized input are left unchanged', () => {
  for (const raw of ['', ' ', '{', '{"a":1,}', '[1,]', 'callback({"x":1})', '{/* comment */"x":1}', '{"x":NaN}', 'undefined', '01', 'true false', '"line\nbreak"', '<pre>{}</pre>', '\uFEFF\uFEFF{}']) assert.equal(formatJson(raw), null, raw);
  assert.equal(formatJson(' '.repeat(MAX_JSON_LENGTH + 1)), null);
  assert.equal(formatJson(null), null);
});

test('large and deeply nested JSON falls back to text without changing its values', () => {
  const deep = '['.repeat(300) + '90071992547409939999' + ']'.repeat(300);
  const result = formatJson(deep);
  assert.equal(result.interactive, false);
  assert.ok(result.text.includes('90071992547409939999'));
  assert.deepEqual(JSON.parse(result.text), JSON.parse(deep));
  const wide = '[' + '1,'.repeat(11000) + '2]';
  assert.equal(formatJson(wide).interactive, false);
});

test('fold ranges hide descendants including the closing line and retain trailing commas', () => {
  const data = formatJson('{"list":[{"x":1},2],"empty":{},"last":true}');
  const { lines, groups } = jsonLines(data.text);
  assert.equal(groups.length, 3);
  assert.equal(groups[1].suffix, '],');
  assert.equal(groups[2].suffix, '},');
  const list = lines.find(line => line.group === 1);
  assert.deepEqual(list.ancestors, [0]);
  const nested = lines.find(line => line.group === 2);
  assert.deepEqual(nested.ancestors, [0, 1]);
  const closing = lines.find(line => line.parts.map(part => part.text).join('') === '],');
  assert.deepEqual(closing.ancestors, [0, 1]);
  assert.equal(lines.map(line => '  '.repeat(line.indent) + line.parts.map(part => part.text).join('')).join('\n'), data.text);
});

test('extreme nesting and token counts cannot expand into unbounded formatted output', () => {
  for (const raw of ['['.repeat(90000) + '0' + ']'.repeat(90000), '[' + '0,'.repeat(110000) + '0]']) {
    const data = formatJson(raw);
    assert.ok(data);
    assert.equal(data.interactive, false);
    assert.equal(data.text, raw);
  }
});

test('document detection accepts standalone JSON MIME types and ignores HTML and existing viewers', () => {
  const fixture = (type, html) => {
    const dom = new JSDOM(html);
    Object.defineProperty(dom.window.document, 'contentType', { value: type });
    return dom;
  };
  for (const type of ['application/json', 'application/ld+json', 'application/problem+json', 'text/json', 'text/plain']) {
    const dom = fixture(type, '<body><pre>{"x":1}</pre></body>');
    try { assert.equal(readJsonDocument(dom.window.document), '{"x":1}'); } finally { dom.window.close(); }
  }
  for (const [type, html] of [
    ['text/html', '<pre>{"x":1}</pre>'], ['text/xml', '<pre>{"x":1}</pre>'],
    ['application/json', '<div>Other viewer</div><pre>{"x":1}</pre>'],
    ['application/json', '<pre><span>{}</span></pre>'],
  ]) {
    const dom = fixture(type, html);
    try { assert.equal(readJsonDocument(dom.window.document), null); } finally { dom.window.close(); }
  }
  const native = fixture('application/json', '<div class="json-formatter-container">Pretty print</div><pre>{}</pre>');
  try { assert.equal(readJsonDocument(native.window.document), '{}'); } finally { native.window.close(); }
});

test('random JSON structures retain values through formatting and folding models', () => {
  let seed = 1729;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  function value(depth = 0) {
    const choice = Math.floor(random() * (depth > 4 ? 4 : 6));
    if (choice === 0) return null;
    if (choice === 1) return random() > .5;
    if (choice === 2) return (random() - .5) * 1e20;
    if (choice === 3) return ['😀', '\n"\\', '<img onerror=alert(1)>', 'Tiếng Việt', '[]{}:,'][Math.floor(random() * 5)];
    if (choice === 4) return Array.from({ length: Math.floor(random() * 5) }, () => value(depth + 1));
    return Object.fromEntries(Array.from({ length: Math.floor(random() * 5) }, (_, i) => [`key${i}`, value(depth + 1)]));
  }
  for (let i = 0; i < 150; i++) {
    const original = value();
    const data = formatJson(JSON.stringify(original));
    assert.deepEqual(JSON.parse(data.text), original);
    const model = jsonLines(data.text);
    assert.equal(model.lines.map(line => '  '.repeat(line.indent) + line.parts.map(part => part.text).join('')).join('\n'), data.text);
  }
});
