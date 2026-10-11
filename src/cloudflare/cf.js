export class CfError extends Error {
  /**
   * @param {string} message
   * @param {number} status
   */
  constructor(message, status) {
    super(message);
    this.name = 'CfError';
    this.status = status;
  }
}

/**
 * @param {string} url
 * @param {string} token
 * @param {'GET' | 'POST'} method
 * @param {Record<string, unknown>} [body]
 * @returns {Promise<unknown>}
 */
export async function cfEnvelope(url, token, method, body) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = /** @type {{ success?: boolean, errors?: { message?: string }[], result?: unknown }} */ (
    await response.json()
  );
  if (!response.ok || payload.success === false) {
    const message = payload.errors?.map((item) => item.message).filter(Boolean).join('; ') || response.statusText;
    throw new CfError(message || 'cloudflare request failed', response.status);
  }
  return payload.result;
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function alreadyExists(err) {
  if (!(err instanceof Error)) return false;
  if ('code' in err && err.code === 'ALREADY_EXISTS') return true;
  if (err instanceof CfError && err.status === 409) return true;
  return /already exists/i.test(err.message);
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isMissing(err) {
  if (!(err instanceof Error)) return false;
  if (err instanceof CfError && err.status === 404) return true;
  if ('code' in err && (err.code === 'NOT_FOUND' || err.code === 'NOT_FOUND_ERR')) return true;
  return /not found/i.test(err.message);
}
