export const MAX_JSON_LENGTH = 5 * 1024 * 1024;
const tokenPattern = /"(?:\\[\s\S]|[^"\\])*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]/g;

// Format the original tokens, never a parsed/re-serialized JavaScript value.
// This preserves large numbers, exponents, duplicate keys, escapes and key order.
export function formatJson(source) {
  if (typeof source !== 'string' || source.length > MAX_JSON_LENGTH) return null;
  const input = source.replace(/^\uFEFF/, '');
  try { JSON.parse(input); } catch { return null; }
  let tokens;
  try { tokens = input.match(tokenPattern) || []; } catch { return null; }
  const plain = () => ({ raw: source, text: input.trim(), interactive: false });
  if (tokens.length > 200000) return plain();
  let depth = 0;
  let maxDepth = 0;
  const output = [];
  let outputLength = 0;
  const append = (...parts) => { output.push(...parts); for (const part of parts) outputLength += part.length; };
  const indent = () => '  '.repeat(Math.min(depth, 64));
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '{' || token === '[') {
      append(token);
      depth++;
      maxDepth = Math.max(depth, maxDepth);
      if (tokens[i + 1] !== '}' && tokens[i + 1] !== ']') append('\n', indent());
    } else if (token === '}' || token === ']') {
      depth--;
      if (tokens[i - 1] !== '{' && tokens[i - 1] !== '[') append('\n', indent());
      append(token);
    } else if (token === ',') append(',\n', indent());
    else if (token === ':') append(': ');
    else append(token);
    if (outputLength > 20 * 1024 * 1024) return plain();
  }
  return { raw: source, text: output.join(''), interactive: tokens.length <= 20000 && maxDepth <= 64 };
}

// Only standalone browser JSON/plain-text documents qualify. HTML examples,
// JSONP, iframes and another extension's viewer must keep their original UI.
export function readJsonDocument(document) {
  const type = document.contentType?.split(';')[0].toLowerCase();
  if (!/^(?:application\/(?:[a-z0-9!#$&^_.+-]+\+)?json|text\/(?:json|plain))$/.test(type || '')) return null;
  const body = document.body;
  if (!body) return null;
  const children = [...body.children];
  const pre = children.find(element => element.tagName === 'PRE');
  if (pre) {
    if (children.some(element => element !== pre && !element.classList.contains('json-formatter-container'))) return null;
    if (pre.children.length) return null;
  } else if (children.length) return null;
  const text = (pre || body).textContent;
  return text.length <= MAX_JSON_LENGTH ? text : null;
}

export function jsonLines(text) {
  const groups = [];
  const stack = [];
  const lines = text.split('\n').map(line => {
    const content = line.trimStart();
    const result = { indent: (line.length - content.length) / 2, ancestors: [...stack], parts: [] };
    const matches = [...content.matchAll(tokenPattern)];
    let offset = 0;
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      if (match.index > offset) result.parts.push({ text: content.slice(offset, match.index), kind: '' });
      const value = match[0];
      const kind = value.startsWith('"') ? (matches[i + 1]?.[0] === ':' ? 'key' : 'string') : /^[-\d]/.test(value) ? 'number' : /^(true|false|null)$/.test(value) ? 'literal' : '';
      result.parts.push({ text: value, kind });
      offset = match.index + value.length;
    }
    if (/^[}\]]/.test(content)) {
      const group = stack.pop();
      if (group !== undefined) groups[group].suffix = content;
    }
    if (/[{\[]$/.test(content)) {
      const id = groups.length;
      groups.push({ suffix: content.endsWith('{') ? '}' : ']' });
      result.group = id;
      stack.push(id);
    }
    return result;
  });
  return { lines, groups };
}
