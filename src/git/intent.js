/** @typedef {import('./types').Intent} Intent */

/**
 * @param {Intent} intent
 * @returns {string}
 */
export function formatTrailers(intent) {
  const lines = [
    intent.summary,
    '',
    intent.rationale,
    '',
    `Envoy-Task: ${intent.task}`,
    `Envoy-Attempt: ${intent.attempt}`,
    `Envoy-Agent: ${intent.agent}`,
    `Envoy-Intent: ${intent.intent}`,
    `Envoy-Claims: ${intent.claims.join(', ')}`,
  ];
  if (intent.replayOf !== null) {
    lines.push(`Envoy-Replay-Of: ${intent.replayOf}`);
  }
  lines.push(`Envoy-Base: ${intent.base}`);
  return lines.join('\n');
}

/**
 * @param {string} message
 * @returns {Intent}
 */
export function parseTrailers(message) {
  const lines = message.replace(/\n+$/, '').split('\n');
  const summary = lines[0] ?? '';
  const envoyAt = lines.findIndex((line) => line.startsWith('Envoy-'));
  const blankAt = lines.findIndex((line) => line.trim() === '');
  let rationale = '';
  if (blankAt !== -1 && envoyAt !== -1 && blankAt < envoyAt) {
    rationale = lines.slice(blankAt + 1, envoyAt).join('\n').trim();
  }

  /** @type {Map<string, string>} */
  const found = new Map();
  const trailerLines = envoyAt === -1 ? [] : lines.slice(envoyAt);
  for (const line of trailerLines) {
    const match = /^(Envoy-[A-Za-z0-9-]+):\s*(.*)$/.exec(line);
    const key = match?.[1];
    const value = match?.[2];
    if (!key || value === undefined || found.has(key)) continue;
    found.set(key, value.trim());
  }

  const task = requiredTrailer(found, 'Envoy-Task');
  const attempt = requiredTrailer(found, 'Envoy-Attempt');
  const agent = requiredTrailer(found, 'Envoy-Agent');
  const intent = requiredTrailer(found, 'Envoy-Intent');
  const claims = requiredTrailer(found, 'Envoy-Claims');
  const base = requiredTrailer(found, 'Envoy-Base');

  return {
    summary,
    rationale,
    task,
    attempt,
    agent,
    intent,
    claims: parseClaims(claims),
    replayOf: found.get('Envoy-Replay-Of') ?? null,
    base,
  };
}

/**
 * @param {Map<string, string>} found
 * @param {string} key
 * @returns {string}
 */
function requiredTrailer(found, key) {
  const value = found.get(key);
  if (value === undefined) throw new Error(`Missing ${key}`);
  return value;
}

/**
 * @param {string} value
 * @returns {string[]}
 */
function parseClaims(value) {
  if (value === '') return [];
  return value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
