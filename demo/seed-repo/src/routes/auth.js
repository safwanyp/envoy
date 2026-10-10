import { readJson, pathnameOf, sendJson } from '../lib/http.js';
import { createUser, getUserByEmail } from './users.js';

export function validateLogin(body) {
  const email = body?.email;
  const password = body?.password;
  if (typeof email !== 'string' || email.length === 0) {
    return { ok: false, error: 'missing email' };
  }
  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'missing password' };
  }
  if (!email.includes('@')) {
    return { ok: false, error: 'email must include @' };
  }
  return { ok: true };
}

export function login(db, body) {
  const user = getUserByEmail(db, body.email);
  if (!user || user.password !== body.password) {
    return { ok: false, error: 'invalid credentials' };
  }
  return { ok: true, user: { id: user.id, email: user.email } };
}

export function signup(db, body) {
  const email = body?.email;
  const password = body?.password;
  if (typeof email !== 'string' || email.length === 0 || typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'missing email or password' };
  }
  if (getUserByEmail(db, email)) {
    return { ok: false, error: 'email taken' };
  }
  const user = createUser(db, email, password);
  return { ok: true, user: { id: user.id, email: user.email } };
}

export async function routeAuth(req, res, db) {
  if (req.method !== 'POST') return false;
  const pathname = pathnameOf(req);
  if (pathname === '/login') {
    const body = await readJson(req);
    const check = validateLogin(body);
    if (!check.ok) {
      sendJson(res, 400, check);
      return true;
    }
    const result = login(db, body);
    sendJson(res, result.ok ? 200 : 401, result);
    return true;
  }
  if (pathname === '/signup') {
    const body = await readJson(req);
    const result = signup(db, body);
    if (!result.ok && result.error === 'email taken') {
      sendJson(res, 409, result);
      return true;
    }
    sendJson(res, result.ok ? 201 : 400, result);
    return true;
  }
  return false;
}
