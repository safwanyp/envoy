/**
 * @param {import('./types').ToolCaller | undefined} ai
 * @param {{ role: string, content: string }[]} messages
 * @param {object[]} tools
 * @param {string} [model]
 * @returns {Promise<{ ok: boolean, error: string | null, text: string, toolCalls: { name: string, arguments: Record<string, unknown> }[] }>}
 */
export async function complete(ai, messages, tools, model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast') {
  if (!ai || typeof ai.run !== 'function') {
    return { ok: false, error: 'ai_unavailable', text: '', toolCalls: [] };
  }
  const response = await ai.run(model, { messages, tools });
  return {
    ok: true,
    error: null,
    text: textFrom(response),
    toolCalls: toolCallsFrom(response),
  };
}

/**
 * @param {unknown} response
 * @returns {string}
 */
function textFrom(response) {
  if (!response || typeof response !== 'object') return '';
  if ('response' in response && typeof response.response === 'string') return response.response;
  return '';
}

/**
 * @param {unknown} response
 * @returns {{ name: string, arguments: Record<string, unknown> }[]}
 */
export function toolCallsFrom(response) {
  if (!response || typeof response !== 'object') return [];
  const raw = 'tool_calls' in response ? response.tool_calls : null;
  if (!Array.isArray(raw)) return [];
  /** @type {{ name: string, arguments: Record<string, unknown> }[]} */
  const calls = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || !('name' in item) || typeof item.name !== 'string') continue;
    const args = 'arguments' in item && item.arguments && typeof item.arguments === 'object' ? item.arguments : {};
    calls.push({ name: item.name, arguments: /** @type {Record<string, unknown>} */ (args) });
  }
  return calls;
}
