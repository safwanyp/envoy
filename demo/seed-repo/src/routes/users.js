import { getUser, insertUser } from '../lib/db.js';
import { pathnameOf, sendJson } from '../lib/http.js';

export function getUserByEmail(db, email) {
  return getUser(db, email);
}

export function createUser(db, email, password) {
  return insertUser(db, email, password);
}

export async function routeUsers(req, res, db) {
  const pathname = pathnameOf(req);
  if (req.method !== 'GET' || !pathname.startsWith('/users/')) return false;
  let email;
  try {
    email = decodeURIComponent(pathname.slice('/users/'.length));
  } catch {
    sendJson(res, 400, { error: 'bad email' });
    return true;
  }
  if (email.length === 0 || email.includes('/')) return false;
  const user = getUserByEmail(db, email);
  if (!user) {
    sendJson(res, 404, { error: 'user not found' });
    return true;
  }
  sendJson(res, 200, { id: user.id, email: user.email });
  return true;
}
