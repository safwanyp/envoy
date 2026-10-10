import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createDb } from './lib/db.js';
import { sendJson } from './lib/http.js';
import { routeAuth } from './routes/auth.js';
import { routeTodos } from './routes/todos.js';
import { routeUsers } from './routes/users.js';

export function createServer(db) {
  return http.createServer((req, res) => {
    handleRequest(req, res, db);
  });
}

async function handleRequest(req, res, db) {
  try {
    if (await routeAuth(req, res, db)) return;
    if (await routeTodos(req, res, db)) return;
    if (await routeUsers(req, res, db)) return;
    sendJson(res, 404, { error: 'not found' });
  } catch {
    if (!res.headersSent) sendJson(res, 400, { error: 'bad request' });
  }
}

const entry = process.argv[1];
if (entry && fileURLToPath(import.meta.url) === entry) {
  const port = Number(process.env.PORT ?? 3000);
  createServer(createDb()).listen(port, '127.0.0.1');
}
