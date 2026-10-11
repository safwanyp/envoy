/** @typedef {import('./types').SourceSymbol} SourceSymbol */

/**
 * @typedef {'code' | 'line' | 'block' | 'single' | 'double' | 'template'} LexMode
 */

/**
 * @param {string} source
 * @returns {SourceSymbol[]}
 */
export function extractSymbols(source) {
  const lines = source.split('\n');
  const states = lineStates(source, lines.length);
  /** @type {SourceSymbol[]} */
  const symbols = [];
  let offset = 0;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex] ?? '';
    const state = states[lineIndex];
    if (state?.code && state.depth === 0) {
      const decl = matchDeclaration(line);
      if (decl) {
        const endLine = declarationEndLine(source, offset, decl.kind, lines.length);
        if (endLine !== null) {
          symbols.push({
            name: decl.name,
            startLine: lineIndex + 1,
            endLine,
          });
        }
      }
    }
    offset += line.length + 1;
  }
  return symbols;
}

/**
 * @param {Record<string, string>} before
 * @param {Record<string, string>} after
 * @returns {{ path: string, symbols: string[] }[]}
 */
export function symbolChanges(before, after) {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  /** @type {{ path: string, symbols: string[] }[]} */
  const changes = [];
  for (const path of paths) {
    if (!path.endsWith('.js')) continue;
    const left = before[path] ?? '';
    const right = after[path] ?? '';
    if (left === right) continue;
    const symbols = changedSymbols(left, right);
    if (symbols.length > 0) changes.push({ path, symbols });
  }
  return changes;
}

/**
 * @param {string} before
 * @param {string} after
 * @returns {string[]}
 */
export function changedSymbols(before, after) {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');
  const beforeGroups = groupByName(extractSymbols(before));
  const afterGroups = groupByName(extractSymbols(after));
  /** @type {Set<string>} */
  const touched = new Set();
  const names = new Set([...beforeGroups.keys(), ...afterGroups.keys()]);
  for (const name of names) {
    const left = beforeGroups.get(name) ?? [];
    const right = afterGroups.get(name) ?? [];
    if (left.length !== right.length) touched.add(name);
    const pairs = Math.min(left.length, right.length);
    for (let index = 0; index < pairs; index++) {
      const leftSymbol = left[index];
      const rightSymbol = right[index];
      if (!leftSymbol || !rightSymbol) continue;
      if (!sameBody(beforeLines, leftSymbol, afterLines, rightSymbol)) touched.add(name);
    }
  }
  return [...touched].sort();
}

/**
 * @param {string} line
 * @returns {{ kind: 'function' | 'arrow' | 'class', name: string } | null}
 */
function matchDeclaration(line) {
  const text = line.trimStart();
  const fn = /^(?:export\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/.exec(text);
  if (fn?.[1]) return { kind: 'function', name: fn[1] };
  const arrow = /^const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\(/.exec(text);
  if (arrow?.[1]) return { kind: 'arrow', name: arrow[1] };
  const cls = /^class\s+([A-Za-z_$][\w$]*)\b/.exec(text);
  if (cls?.[1]) return { kind: 'class', name: cls[1] };
  return null;
}

/**
 * @param {string} source
 * @param {number} lineStart
 * @param {'function' | 'arrow' | 'class'} kind
 * @param {number} lineCount
 * @returns {number | null}
 */
function declarationEndLine(source, lineStart, kind, lineCount) {
  let index = lineStart;
  while (source.charAt(index) === ' ' || source.charAt(index) === '\t') index++;

  if (kind === 'class') {
    const head = /^class\s+[A-Za-z_$][\w$]*/.exec(source.slice(index));
    if (!head) return null;
    const open = findClassOpenBrace(source, index + head[0].length);
    if (open === null) return lineCount;
    const close = matchingDelim(source, open, '{', '}');
    return close === null ? lineCount : lineNumberAt(source, close);
  }

  if (kind === 'function') {
    const head = /^(?:export\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.exec(source.slice(index));
    if (!head) return null;
    const closeParen = matchingDelim(source, index + head[0].length - 1, '(', ')');
    if (closeParen === null) return lineCount;
    const open = skipTrivia(source, closeParen + 1);
    if (open === null || source.charAt(open) !== '{') return lineCount;
    const close = matchingDelim(source, open, '{', '}');
    return close === null ? lineCount : lineNumberAt(source, close);
  }

  const head = /^const\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?\(/.exec(source.slice(index));
  if (!head) return null;
  const closeParen = matchingDelim(source, index + head[0].length - 1, '(', ')');
  if (closeParen === null) return null;
  const arrow = skipTrivia(source, closeParen + 1);
  if (arrow === null || source.slice(arrow, arrow + 2) !== '=>') return null;
  const open = skipTrivia(source, arrow + 2);
  if (open === null || source.charAt(open) !== '{') return lineCount;
  const close = matchingDelim(source, open, '{', '}');
  return close === null ? lineCount : lineNumberAt(source, close);
}

/**
 * @param {string} source
 * @param {number} lineCount
 * @returns {{ depth: number, code: boolean }[]}
 */
function lineStates(source, lineCount) {
  /** @type {{ depth: number, code: boolean }[]} */
  const states = Array.from({ length: lineCount }, () => ({ depth: 0, code: true }));
  /** @type {LexMode[]} */
  const modes = ['code'];
  /** @type {number[]} */
  const resumeAt = [];
  let braces = 0;
  let line = 0;
  let atLineStart = true;
  const mode = () => modes[modes.length - 1] ?? 'code';

  const mark = () => {
    if (!atLineStart || line >= lineCount) return;
    states[line] = { depth: braces, code: mode() === 'code' };
    atLineStart = false;
  };

  for (let index = 0; index < source.length; ) {
    const ch = source.charAt(index);
    const next = source.charAt(index + 1);
    if (ch === '\n') {
      mark();
      if (mode() === 'line') modes.pop();
      line++;
      atLineStart = true;
      index++;
      continue;
    }
    mark();
    const current = mode();
    if (current === 'line') {
      index++;
      continue;
    }
    if (current === 'block') {
      if (ch === '*' && next === '/') {
        modes.pop();
        index += 2;
        continue;
      }
      index++;
      continue;
    }
    if (current === 'single' || current === 'double') {
      if (ch === '\\') {
        if (next === '\n') {
          line++;
          atLineStart = true;
        }
        index += 2;
        continue;
      }
      if (ch === (current === 'single' ? "'" : '"')) modes.pop();
      index++;
      continue;
    }
    if (current === 'template') {
      if (ch === '\\') {
        if (next === '\n') {
          line++;
          atLineStart = true;
        }
        index += 2;
        continue;
      }
      if (ch === '`') {
        modes.pop();
        index++;
        continue;
      }
      if (ch === '$' && next === '{') {
        resumeAt.push(braces);
        braces++;
        modes.push('code');
        index += 2;
        continue;
      }
      index++;
      continue;
    }
    if (ch === '/' && next === '/') {
      modes.push('line');
      index += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      modes.push('block');
      index += 2;
      continue;
    }
    if (ch === "'") {
      modes.push('single');
      index++;
      continue;
    }
    if (ch === '"') {
      modes.push('double');
      index++;
      continue;
    }
    if (ch === '`') {
      modes.push('template');
      index++;
      continue;
    }
    if (ch === '{') braces++;
    if (ch === '}') {
      braces--;
      const resume = resumeAt[resumeAt.length - 1];
      if (resume !== undefined && braces === resume) {
        resumeAt.pop();
        modes.pop();
      }
    }
    index++;
  }

  if (atLineStart && line < lineCount) {
    states[line] = { depth: braces, code: mode() === 'code' };
  }
  return states;
}

/**
 * Code characters only. `${` inside a template is delivered as a `{` so brace
 * depth stays balanced across the interpolation.
 * @param {string} source
 * @param {number} start
 * @param {(index: number, ch: string) => boolean} onCode
 * @returns {number | null}
 */
function scanCode(source, start, onCode) {
  /** @type {LexMode[]} */
  const modes = ['code'];
  /** @type {number[]} */
  const resumeAt = [];
  let braces = 0;
  const mode = () => modes[modes.length - 1] ?? 'code';

  for (let index = start; index < source.length; ) {
    const ch = source.charAt(index);
    const next = source.charAt(index + 1);
    if (ch === '\n' && mode() === 'line') {
      modes.pop();
      index++;
      continue;
    }
    const current = mode();
    if (current === 'line') {
      index++;
      continue;
    }
    if (current === 'block') {
      if (ch === '*' && next === '/') {
        modes.pop();
        index += 2;
        continue;
      }
      index++;
      continue;
    }
    if (current === 'single' || current === 'double') {
      if (ch === '\\') {
        index += 2;
        continue;
      }
      if (ch === (current === 'single' ? "'" : '"')) modes.pop();
      index++;
      continue;
    }
    if (current === 'template') {
      if (ch === '\\') {
        index += 2;
        continue;
      }
      if (ch === '`') {
        modes.pop();
        index++;
        continue;
      }
      if (ch === '$' && next === '{') {
        resumeAt.push(braces);
        braces++;
        modes.push('code');
        if (onCode(index + 1, '{')) return index + 1;
        index += 2;
        continue;
      }
      index++;
      continue;
    }
    if (ch === '/' && next === '/') {
      modes.push('line');
      index += 2;
      continue;
    }
    if (ch === '/' && next === '*') {
      modes.push('block');
      index += 2;
      continue;
    }
    if (ch === "'") {
      modes.push('single');
      index++;
      continue;
    }
    if (ch === '"') {
      modes.push('double');
      index++;
      continue;
    }
    if (ch === '`') {
      modes.push('template');
      index++;
      continue;
    }
    if (ch === '{') braces++;
    if (ch === '}') {
      braces--;
      const resume = resumeAt[resumeAt.length - 1];
      if (resume !== undefined && braces === resume) {
        resumeAt.pop();
        modes.pop();
      }
    }
    if (onCode(index, ch)) return index;
    index++;
  }
  return null;
}

/**
 * @param {string} source
 * @param {number} openIndex
 * @param {'(' | '{'} open
 * @param {')' | '}'} close
 * @returns {number | null}
 */
function matchingDelim(source, openIndex, open, close) {
  let depth = 0;
  return scanCode(source, openIndex, (_index, ch) => {
    if (ch === open) depth++;
    if (ch === close) {
      depth--;
      return depth === 0;
    }
    return false;
  });
}

/**
 * @param {string} source
 * @param {number} from
 * @returns {number | null}
 */
function findClassOpenBrace(source, from) {
  let parens = 0;
  let braces = 0;
  return scanCode(source, from, (_index, ch) => {
    if (ch === '{' && parens === 0 && braces === 0) return true;
    if (ch === '(') parens++;
    else if (ch === ')') parens--;
    else if (ch === '{') braces++;
    else if (ch === '}') braces--;
    return false;
  });
}

/**
 * @param {string} source
 * @param {number} index
 * @returns {number | null}
 */
function skipTrivia(source, index) {
  let cursor = index;
  while (cursor < source.length) {
    const ch = source.charAt(cursor);
    const next = source.charAt(cursor + 1);
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      cursor++;
      continue;
    }
    if (ch === '/' && next === '/') {
      cursor += 2;
      while (cursor < source.length && source.charAt(cursor) !== '\n') cursor++;
      continue;
    }
    if (ch === '/' && next === '*') {
      cursor += 2;
      while (cursor + 1 < source.length && !(source.charAt(cursor) === '*' && source.charAt(cursor + 1) === '/')) {
        cursor++;
      }
      cursor = Math.min(cursor + 2, source.length);
      continue;
    }
    return cursor;
  }
  return null;
}

/**
 * @param {string} source
 * @param {number} index
 * @returns {number}
 */
function lineNumberAt(source, index) {
  let line = 1;
  const stop = Math.min(index, source.length);
  for (let cursor = 0; cursor < stop; cursor++) {
    if (source.charCodeAt(cursor) === 10) line++;
  }
  return line;
}

/**
 * @param {SourceSymbol[]} symbols
 * @returns {Map<string, SourceSymbol[]>}
 */
function groupByName(symbols) {
  /** @type {Map<string, SourceSymbol[]>} */
  const groups = new Map();
  for (const symbol of symbols) {
    const list = groups.get(symbol.name);
    if (list) list.push(symbol);
    else groups.set(symbol.name, [symbol]);
  }
  return groups;
}

/**
 * @param {string[]} leftLines
 * @param {SourceSymbol} left
 * @param {string[]} rightLines
 * @param {SourceSymbol} right
 * @returns {boolean}
 */
function sameBody(leftLines, left, rightLines, right) {
  const leftBody = leftLines.slice(left.startLine - 1, left.endLine);
  const rightBody = rightLines.slice(right.startLine - 1, right.endLine);
  if (leftBody.length !== rightBody.length) return false;
  for (let index = 0; index < leftBody.length; index++) {
    if (leftBody[index] !== rightBody[index]) return false;
  }
  return true;
}
