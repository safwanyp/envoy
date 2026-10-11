import { DurableObject } from 'cloudflare:workers';
import { applyTaskEdit } from './edits.js';

export class AgentRunner extends DurableObject {
  /**
   * @param {DurableObjectState} state
   * @param {Env} env
   */
  constructor(state, env) {
    super(state, env);
  }

  /**
   * @param {Request} request
   * @returns {Promise<Response>}
   */
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/attempt' || request.method !== 'POST') {
      return Response.json({ ok: true, service: 'agent-runner', status: 'idle' });
    }
    const body = await request.json();
    const taskId = body && typeof body === 'object' && 'taskId' in body && typeof body.taskId === 'string' ? body.taskId : '';
    const files = body && typeof body === 'object' && 'files' in body && isFileMap(body.files) ? body.files : null;
    if (taskId.length === 0 || !files) {
      return Response.json({ ok: false, error: 'bad_request' }, { status: 400 });
    }
    try {
      return Response.json({ ok: true, files: applyTaskEdit(taskId, files) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'edit failed';
      return Response.json({ ok: false, error: message }, { status: 422 });
    }
  }
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, string>}
 */
function isFileMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((item) => typeof item === 'string');
}
