const LIMITER = `const hits = new Map();

export function allowLogin(key) {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((at) => now - at < 60000);
  if (recent.length >= 5) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
`;

/**
 * @param {string} taskId
 * @param {Record<string, string>} files
 * @returns {Record<string, string>}
 */
export function applyTaskEdit(taskId, files) {
  switch (taskId) {
    case 't_rate_limit':
      return editRateLimit(files);
    case 't_validate_login':
      return editValidation(files);
    case 't_rename_email':
      return editRename(files);
    case 't_health':
      return editHealth(files);
    case 't_request_log':
      return editRequestLog(files);
    case 't_todos_page':
      return editTodosPage(files);
    default:
      throw new Error(`No scripted edit for ${taskId}`);
  }
}

/**
 * @param {Record<string, string>} files
 * @returns {Record<string, string>}
 */
function editRateLimit(files) {
  const path = 'src/routes/auth.js';
  const source = required(files, path);
  const field = source.includes('body?.emailAddress') ? 'emailAddress' : 'email';
  let next = source;
  if (!next.includes("from '../lib/limiter.js'")) {
    next = `import { allowLogin } from '../lib/limiter.js';\n${next}`;
  }
  if (!next.includes('allowLogin(')) {
    const anchor = `  if (!${field}.includes('@')) {`;
    if (!next.includes(anchor)) throw new Error('rate limit anchor missing');
    const insert = `  if (!allowLogin(${field})) {\n    return { ok: false, error: 'rate limited' };\n  }\n`;
    next = next.replace(anchor, `${insert}${anchor}`);
  }
  return {
    'src/lib/limiter.js': LIMITER,
    [path]: next.endsWith('\n') ? next : `${next}\n`,
  };
}

/**
 * @param {Record<string, string>} files
 * @returns {Record<string, string>}
 */
function editValidation(files) {
  const path = 'src/routes/auth.js';
  const source = required(files, path);
  if (source.includes('password too short')) return {};
  const anchor = '  return { ok: true };';
  const at = source.indexOf(anchor);
  if (at === -1) throw new Error('validation anchor missing');
  const insert = `  if (password.length < 8) {\n    return { ok: false, error: 'password too short' };\n  }\n`;
  const next = `${source.slice(0, at)}${insert}${source.slice(at)}`;
  return { [path]: next };
}

/**
 * @param {Record<string, string>} files
 * @returns {Record<string, string>}
 */
function editRename(files) {
  return {
    'src/lib/db.js': renameDb(required(files, 'src/lib/db.js')),
    'src/routes/users.js': renameUsers(required(files, 'src/routes/users.js')),
    'src/routes/auth.js': renameAuth(required(files, 'src/routes/auth.js')),
  };
}

/**
 * @param {Record<string, string>} files
 * @returns {Record<string, string>}
 */
function editHealth(files) {
  const path = 'src/server.js';
  let source = required(files, path);
  if (!source.includes('export function health(')) {
    source = source.replace(
      "import { sendJson } from './lib/http.js';",
      "import { pathnameOf, sendJson } from './lib/http.js';",
    );
    source = source.replace(
      'export function createServer(db) {',
      `export function health() {\n  return { ok: true };\n}\n\nexport function createServer(db) {`,
    );
    source = source.replace(
      "    sendJson(res, 404, { error: 'not found' });",
      `    if (req.method === 'GET' && pathnameOf(req) === '/health') {\n      sendJson(res, 200, health());\n      return;\n    }\n    sendJson(res, 404, { error: 'not found' });`,
    );
  }
  return { [path]: source };
}

/**
 * @param {Record<string, string>} files
 * @returns {Record<string, string>}
 */
function editRequestLog(files) {
  const path = 'src/server.js';
  let source = required(files, path);
  if (!source.includes('export function logRequest(')) {
    source = source.replace(
      '  try {\n',
      '  try {\n    logRequest(req);\n',
    );
    source = `${source}\nexport function logRequest(req) {\n  return \`\${req.method ?? 'GET'} \${req.url ?? '/'}\`;\n}\n`;
  }
  return { [path]: source };
}

/**
 * @param {Record<string, string>} files
 * @returns {Record<string, string>}
 */
function editTodosPage(files) {
  const path = 'src/routes/todos.js';
  let source = required(files, path);
  if (!source.includes('query?.limit')) {
    source = source.replace(
      'export function listTodos(db) {\n  return listTodoRows(db);\n}',
      `export function listTodos(db, query) {\n  const rows = listTodoRows(db);\n  const limit = Number(query?.limit ?? 20);\n  const offset = Number(query?.offset ?? 0);\n  const start = Number.isFinite(offset) && offset > 0 ? offset : 0;\n  const end = Number.isFinite(limit) && limit > 0 ? start + limit : start + 20;\n  return rows.slice(start, end);\n}`,
    );
    source = source.replace(
      '    sendJson(res, 200, listTodos(db));',
      `    const url = new URL(req.url ?? '/', 'http://127.0.0.1');\n    sendJson(res, 200, listTodos(db, {\n      limit: url.searchParams.get('limit'),\n      offset: url.searchParams.get('offset'),\n    }));`,
    );
  }
  return { [path]: source };
}

/**
 * @param {string} source
 * @returns {string}
 */
function renameAuth(source) {
  if (source.includes('emailAddress')) return source;
  return source
    .replaceAll('body?.email', 'body?.emailAddress')
    .replaceAll('body.email', 'body.emailAddress')
    .replaceAll('user.email', 'user.emailAddress')
    .replaceAll('const email =', 'const emailAddress =')
    .replaceAll('typeof email ', 'typeof emailAddress ')
    .replaceAll('email.length', 'emailAddress.length')
    .replaceAll('!email.includes', '!emailAddress.includes')
    .replaceAll('getUserByEmail(db, email)', 'getUserByEmail(db, emailAddress)')
    .replaceAll('createUser(db, email, password)', 'createUser(db, emailAddress, password)')
    .replaceAll('email: user.emailAddress', 'emailAddress: user.emailAddress');
}

/**
 * @param {string} source
 * @returns {string}
 */
function renameDb(source) {
  if (source.includes('emailAddress')) return source;
  return source
    .replaceAll('user.email', 'user.emailAddress')
    .replaceAll('(db, email)', '(db, emailAddress)')
    .replaceAll('(db, email, password)', '(db, emailAddress, password)')
    .replaceAll('{ id: db.nextUserId, email, password }', '{ id: db.nextUserId, emailAddress, password }');
}

/**
 * @param {string} source
 * @returns {string}
 */
function renameUsers(source) {
  if (source.includes('emailAddress')) return source;
  return source
    .replaceAll('user.email', 'user.emailAddress')
    .replaceAll('email: user.emailAddress', 'emailAddress: user.emailAddress');
}

/**
 * @param {Record<string, string>} files
 * @param {string} path
 * @returns {string}
 */
function required(files, path) {
  const text = files[path];
  if (text === undefined) throw new Error(`missing ${path}`);
  return text;
}
