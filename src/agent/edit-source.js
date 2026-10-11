import { applyTaskEdit } from './edits.js';
import { complete } from './llm.js';
import { editPrompt } from './prompts.js';
import { TOOLS, applyTool } from './tools.js';

/** @typedef {import('../git/types').ReplayContext} ReplayContext */
/** @typedef {import('./types').ToolCaller} ToolCaller */

/**
 * @typedef {Object} DemoEditContext
 * @property {string} taskId
 * @property {string} attemptId
 * @property {Record<string, string>} files
 * @property {ReplayContext | null} replay
 * @property {string} prompt
 * @property {string[]} touches
 */

/** @type {Record<string, string>} */
const MARKERS = {
  t_rate_limit: 'allowLogin(',
  t_validate_login: 'password too short',
  t_rename_email: 'emailAddress',
  t_health: 'export function health(',
  t_request_log: 'export function logRequest(',
  t_todos_page: 'query?.limit',
};

/**
 * @param {ToolCaller | undefined} ai
 * @returns {{ edit: (ctx: DemoEditContext) => Promise<Record<string, string>>, tally: { calls: number, workersAi: number, scripted: number, lastError: string } }}
 */
export function createDemoEdit(ai) {
  const tally = { calls: 0, workersAi: 0, scripted: 0, lastError: '' };
  /** @type {Map<string, Record<string, string>>} */
  const cache = new Map();
  return {
    tally,
    /**
     * @param {DemoEditContext} ctx
     * @returns {Promise<Record<string, string>>}
     */
    async edit(ctx) {
      const key = `${ctx.attemptId}:${ctx.replay ? 'replay' : 'edit'}`;
      const cached = cache.get(key);
      if (cached) return cached;
      const scripted = applyTaskEdit(ctx.taskId, ctx.files);
      if (!ai) {
        tally.scripted += 1;
        cache.set(key, scripted);
        return scripted;
      }
      tally.calls += 1;
      let produced;
      try {
        produced = await fromModel(ai, ctx, scripted);
      } catch (err) {
        tally.lastError = err instanceof Error ? err.message : 'ai failed';
        tally.scripted += 1;
        cache.set(key, scripted);
        return scripted;
      }
      cache.set(key, produced.files);
      if (produced.source === 'workers-ai') tally.workersAi += 1;
      else tally.scripted += 1;
      return produced.files;
    },
  };
}

/**
 * @param {ToolCaller} ai
 * @param {DemoEditContext} ctx
 * @param {Record<string, string>} scripted
 * @returns {Promise<{ source: 'workers-ai' | 'scripted', files: Record<string, string> }>}
 */
async function fromModel(ai, ctx, scripted) {
  const result = await complete(ai, [
    { role: 'system', content: editPrompt(ctx.replay) },
    { role: 'user', content: userPrompt(ctx) },
  ], TOOLS);
  if (!result.ok || result.toolCalls.length === 0) return { source: 'scripted', files: scripted };
  const marker = MARKERS[ctx.taskId];
  const partial = { ...scripted };
  let kept = false;
  let files = { ...ctx.files };
  for (const call of result.toolCalls) {
    const applied = applyTool(files, call.name, call.arguments);
    files = applied.files;
    if (call.name === 'write_file') {
      const path = typeof call.arguments.path === 'string' ? call.arguments.path : '';
      const text = typeof call.arguments.content === 'string' ? call.arguments.content : '';
      if (path.length > 0 && text.length > 0 && !text.includes('<<<<<<<') && (!marker || text.includes(marker))) {
        partial[path] = text;
        kept = true;
      }
    }
    if (applied.done) break;
  }
  if (!kept) return { source: 'scripted', files: scripted };
  return { source: 'workers-ai', files: partial };
}

/**
 * @param {DemoEditContext} ctx
 * @returns {string}
 */
function userPrompt(ctx) {
  const paths = [...new Set(ctx.touches.map((touch) => touch.split('#')[0] ?? touch))];
  const files = paths
    .map((path) => `FILE ${path}\n${ctx.files[path] ?? ''}`)
    .join('\n');
  return `${ctx.prompt}\nWrite the files this task needs, then finish.\n${files}`;
}
