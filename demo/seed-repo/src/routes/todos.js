import { insertTodo, listTodoRows } from '../lib/db.js';
import { pathnameOf, readJson, sendJson } from '../lib/http.js';

export function listTodos(db) {
  return listTodoRows(db);
}

export function createTodo(db, body) {
  const title = body?.title;
  if (typeof title !== 'string' || title.length === 0) {
    return { ok: false, error: 'missing title' };
  }
  const userId = typeof body.userId === 'number' ? body.userId : null;
  return { ok: true, todo: insertTodo(db, title, userId) };
}

export async function routeTodos(req, res, db) {
  if (pathnameOf(req) !== '/todos') return false;
  if (req.method === 'GET') {
    sendJson(res, 200, listTodos(db));
    return true;
  }
  if (req.method === 'POST') {
    const body = await readJson(req);
    const result = createTodo(db, body);
    sendJson(res, result.ok ? 201 : 400, result);
    return true;
  }
  return false;
}
