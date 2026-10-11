export const TOOLS = [
  {
    name: 'list_files',
    description: 'List files in the working tree',
    parameters: { type: 'object', properties: {} },
  },
  {
    name: 'read_file',
    description: 'Read a file',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Replace a file',
    parameters: {
      type: 'object',
      properties: { path: { type: 'string' }, content: { type: 'string' } },
      required: ['path', 'content'],
    },
  },
  {
    name: 'finish',
    description: 'Stop editing',
    parameters: { type: 'object', properties: {} },
  },
];

/**
 * @param {Record<string, string>} files
 * @param {string} name
 * @param {Record<string, unknown>} args
 * @returns {{ files: Record<string, string>, output: string, done: boolean }}
 */
export function applyTool(files, name, args) {
  if (name === 'list_files') {
    return { files, output: Object.keys(files).sort().join('\n'), done: false };
  }
  if (name === 'read_file') {
    const path = typeof args.path === 'string' ? args.path : '';
    return { files, output: files[path] ?? '', done: false };
  }
  if (name === 'write_file') {
    const path = typeof args.path === 'string' ? args.path : '';
    const content = typeof args.content === 'string' ? args.content : '';
    if (path.length === 0) return { files, output: 'missing path', done: false };
    return { files: { ...files, [path]: content }, output: `wrote ${path}`, done: false };
  }
  if (name === 'finish') return { files, output: 'done', done: true };
  return { files, output: `unknown tool ${name}`, done: false };
}
