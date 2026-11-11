import { AUTH_LIMIT, normalizeAccount, accountFingerprint, emptyAuthState, groupNames } from './auth-core.mjs';
const fail = key => { throw new Error(key); };
const group = value => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 80) fail('authGroupError');
  return value.trim();
};
export function updateAuthState(before, message) {
  const state = structuredClone(before);
  if (message.action === 'upsert') {
    const account = normalizeAccount(message.account);
    const index = state.accounts.findIndex(item => item.id === account.id);
    if (state.accounts.some(item => item.id !== account.id && accountFingerprint(item) === accountFingerprint(account))) fail('authDuplicate');
    if (index < 0) state.accounts.push(account); else state.accounts[index] = account;
  } else if (message.action === 'remove') state.accounts = state.accounts.filter(item => item.id !== message.id);
  else if (message.action === 'clear') {
    if (message.confirm !== 'DELETE ALL') fail('authConfirmError');
    state.accounts = [];
  } else if (message.action === 'import') {
    if (!Array.isArray(message.accounts) || message.accounts.length > AUTH_LIMIT) fail('authImportError');
    const rows = message.accounts.map(item => normalizeAccount({ ...item, id: crypto.randomUUID() }));
    const known = new Set(state.accounts.map(accountFingerprint));
    for (const account of rows) { const key = accountFingerprint(account); if (!known.has(key)) { state.accounts.push(account); known.add(key); } }
    for (const name of message.groups || []) { const value = group(name); if (!state.groups.includes(value)) state.groups.push(value); }
    if (Array.isArray(message.groupOrder)) state.groupOrder = [...new Set([...state.groupOrder, ...message.groupOrder.map(group)])];
  } else if (message.action === 'move') {
    const index = state.accounts.findIndex(item => item.id === message.id);
    const target = message.targetId ? state.accounts.findIndex(item => item.id === message.targetId) : index + (message.direction === -1 ? -1 : 1);
    if (index >= 0 && target >= 0 && target < state.accounts.length && index !== target) {
      const targetAccount = state.accounts[target];
      const [item] = state.accounts.splice(index, 1);
      if (message.targetId) item.issuer = targetAccount.issuer;
      const position = message.targetId ? state.accounts.findIndex(account => account.id === targetAccount.id) : target;
      state.accounts.splice(position, 0, item);
    }
  } else if (message.action === 'moveToGroup') {
    const name = group(message.name);
    if (!groupNames(state).includes(name)) fail('authGroupError');
    const index = state.accounts.findIndex(item => item.id === message.id);
    if (index >= 0) {
      const [item] = state.accounts.splice(index, 1);
      item.issuer = name;
      const target = state.accounts.findIndex(account => account.issuer === name);
      state.accounts.splice(target < 0 ? state.accounts.length : target, 0, item);
    }
  } else if (message.action === 'view') state.view = message.view === 'grid' ? 'grid' : 'list';
  else if (message.action === 'saveGroup') {
    const name = group(message.name), old = message.oldName;
    if (groupNames(state).some(item => item !== old && item.toLowerCase() === name.toLowerCase())) fail('authGroupExists');
    state.groups = [...new Set(state.groups.filter(item => item !== old).concat(name))];
    if (old) { state.accounts.forEach(item => { if (item.issuer === old) item.issuer = name; }); state.groupOrder = state.groupOrder.map(item => item === old ? name : item); }
  } else if (message.action === 'removeGroup') {
    state.groups = state.groups.filter(item => item !== message.name);
    state.groupOrder = state.groupOrder.filter(item => item !== message.name);
    state.accounts.forEach(item => { if (item.issuer === message.name) item.issuer = ''; });
  } else if (message.action === 'moveGroup') {
    const names = groupNames(state), index = names.indexOf(message.name), target = index + (message.direction === -1 ? -1 : 1);
    if (index >= 0 && target >= 0 && target < names.length) [names[index], names[target]] = [names[target], names[index]];
    state.groupOrder = names;
  } else if (message.action === 'placeGroup') {
    const names = groupNames(state), from = names.indexOf(message.name), target = names.indexOf(message.targetName);
    if (from >= 0 && target >= 0 && from !== target) {
      const [name] = names.splice(from, 1);
      names.splice(names.indexOf(message.targetName), 0, name);
      state.groupOrder = names;
    }
  } else fail('authActionError');
  if (state.accounts.length > AUTH_LIMIT || state.groups.length > AUTH_LIMIT) fail('authLimitError');
  return state;
}

export function createAuthStore({ read, write }) {
  let queue = Promise.resolve();
  return message => {
    const task = queue.catch(() => {}).then(async () => {
      const before = await read() || emptyAuthState();
      if (message.action === 'state') return { state: before };
      const state = updateAuthState(before, message);
      await write(state);
      return { state, added: state.accounts.length - before.accounts.length };
    });
    queue = task;
    return task;
  };
}
