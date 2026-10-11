import { commitOnRemote } from './publish.js';
import {
  artifactsFileUrl,
  artifactsForkUrl,
  artifactsRepoUrl,
  artifactsReposUrl,
  artifactsTokensUrl,
} from '../cloudflare/api.js';
import { CfError, alreadyExists, cfEnvelope, isMissing } from '../cloudflare/cf.js';

/**
 * @typedef {Object} RepoRef
 * @property {string} name
 * @property {string} remote
 * @property {string} token
 * @property {string | null} source
 */

/**
 * @typedef {Object} RepoControl
 * @property {(name: string, description: string) => Promise<RepoRef>} create
 * @property {(name: string) => Promise<{ name: string, remote: string, source: string | null } | null>} find
 * @property {(sourceName: string, forkName: string, description: string) => Promise<RepoRef>} fork
 * @property {(name: string) => Promise<string>} writeToken
 * @property {(name: string, ref: string, path: string) => Promise<string | null>} readText
 */

/**
 * @typedef {Object} PublishedFork
 * @property {string} name
 * @property {string} commit
 * @property {boolean} created
 * @property {string} remote
 * @property {string} token
 */

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * @param {RepoControl} control
 * @param {string} sourceName
 * @param {string} forkName
 * @param {string} description
 * @returns {Promise<RepoRef>}
 */
export async function ensureFork(control, sourceName, forkName, description) {
  let lastError = /** @type {unknown} */ (null);
  for (let attempt = 0; attempt < 8; attempt++) {
    const existing = await control.find(forkName);
    if (existing) {
      try {
        const token = await control.writeToken(forkName);
        return { ...existing, token };
      } catch (err) {
        lastError = err;
        if (!isInProgress(err)) throw err;
        await sleep(500 * (attempt + 1));
        continue;
      }
    }
    try {
      return await control.fork(sourceName, forkName, description);
    } catch (err) {
      lastError = err;
      if (!alreadyExists(err) && !isInProgress(err)) throw err;
      await sleep(500 * (attempt + 1));
    }
  }
  const message = lastError instanceof Error ? lastError.message : `fork ${forkName} was not ready`;
  throw new Error(message);
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isInProgress(err) {
  if (!(err instanceof Error)) return false;
  if ('code' in err && (err.code === 'FORK_IN_PROGRESS' || err.code === 'CREATE_IN_PROGRESS')) return true;
  return /in progress/i.test(err.message);
}

/**
 * @param {RepoControl} control
 * @param {{ sourceName: string, forkName: string, description: string, files: Record<string, string>, message: string, http?: import('isomorphic-git/http/web').default }} input
 * @returns {Promise<PublishedFork>}
 */
export async function publishAgentFork(control, input) {
  const handle = await ensureFork(control, input.sourceName, input.forkName, input.description);
  let lastError = /** @type {unknown} */ (null);
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const pushed = await commitOnRemote({
        remote: handle.remote,
        token: handle.token,
        files: input.files,
        message: input.message,
        http: input.http,
      });
      return {
        name: input.forkName,
        commit: pushed.oid,
        created: pushed.created,
        remote: handle.remote,
        token: handle.token,
      };
    } catch (err) {
      lastError = err;
      await sleep(500 * (attempt + 1));
    }
  }
  const message = lastError instanceof Error ? lastError.message : 'fork push failed';
  throw new Error(message);
}

/**
 * @param {string} accountId
 * @param {string} token
 * @param {string} namespace
 * @returns {RepoControl}
 */
export function restControl(accountId, token, namespace) {
  return {
    async create(name, description) {
      const created = /** @type {{ name?: string, remote?: string, token?: string }} */ (
        await cfEnvelope(artifactsReposUrl(accountId, namespace), token, 'POST', {
          name,
          description,
          default_branch: 'main',
        })
      );
      return repoRef(created, null);
    },
    async find(name) {
      try {
        const info = /** @type {{ name?: string, remote?: string, source?: string | null }} */ (
          await cfEnvelope(artifactsRepoUrl(accountId, namespace, name), token, 'GET')
        );
        if (typeof info.remote !== 'string') return null;
        return {
          name: typeof info.name === 'string' ? info.name : name,
          remote: info.remote,
          source: typeof info.source === 'string' ? info.source : null,
        };
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      }
    },
    async fork(sourceName, forkName, description) {
      const created = /** @type {{ name?: string, remote?: string, token?: string }} */ (
        await cfEnvelope(artifactsForkUrl(accountId, namespace, sourceName), token, 'POST', {
          name: forkName,
          description,
          default_branch_only: true,
        })
      );
      return repoRef(created, sourceName);
    },
    async writeToken(name) {
      const created = /** @type {{ plaintext?: string }} */ (
        await cfEnvelope(artifactsTokensUrl(accountId, namespace), token, 'POST', {
          repo: name,
          scope: 'write',
        })
      );
      if (typeof created.plaintext !== 'string' || created.plaintext.length === 0) {
        throw new CfError(`token for ${name} was empty`, 502);
      }
      return created.plaintext;
    },
    async readText(name, ref, path) {
      const response = await fetch(artifactsFileUrl(accountId, namespace, name, ref, path), {
        headers: { authorization: `Bearer ${token}` },
      });
      if (response.status === 404) return null;
      const type = response.headers.get('content-type') ?? '';
      if (type.includes('json')) {
        const payload = /** @type {{ success?: boolean, errors?: { message?: string }[] }} */ (await response.json());
        if (!response.ok || payload.success === false) {
          const message = payload.errors?.map((item) => item.message).join('; ') || response.statusText;
          if (response.status === 404 || /not found/i.test(message)) return null;
          throw new CfError(message, response.status);
        }
      }
      if (!response.ok) throw new CfError(response.statusText, response.status);
      return response.text();
    },
  };
}

/**
 * @param {Artifacts} artifacts
 * @returns {RepoControl}
 */
export function bindingControl(artifacts) {
  return {
    async create(name, description) {
      const created = await artifacts.create(name, { description, setDefaultBranch: 'main' });
      return { name: created.name, remote: created.remote, token: created.token, source: null };
    },
    async find(name) {
      /** @type {ArtifactsRepo | undefined} */
      let repo;
      try {
        repo = await artifacts.get(name);
        const info = await repo.info();
        return { name: info.name, remote: info.remote, source: info.source };
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      } finally {
        repo?.[Symbol.dispose]();
      }
    },
    async fork(sourceName, forkName, description) {
      /** @type {ArtifactsRepo | undefined} */
      let repo;
      try {
        repo = await artifacts.get(sourceName);
        const created = await repo.fork(forkName, { description, defaultBranchOnly: true });
        return { name: created.name, remote: created.remote, token: created.token, source: sourceName };
      } finally {
        repo?.[Symbol.dispose]();
      }
    },
    async writeToken(name) {
      /** @type {ArtifactsRepo | undefined} */
      let repo;
      try {
        repo = await artifacts.get(name);
        const created = await repo.createToken('write');
        return created.plaintext;
      } finally {
        repo?.[Symbol.dispose]();
      }
    },
    async readText(name, ref, path) {
      /** @type {ArtifactsRepo | undefined} */
      let repo;
      try {
        repo = await artifacts.get(name);
        const file = await repo.readFile({ ref, path });
        return file ? await file.text() : null;
      } catch (err) {
        if (isMissing(err)) return null;
        throw err;
      } finally {
        repo?.[Symbol.dispose]();
      }
    },
  };
}

/**
 * @param {{ name?: string, remote?: string, token?: string }} created
 * @param {string | null} source
 * @returns {RepoRef}
 */
function repoRef(created, source) {
  if (typeof created.name !== 'string' || typeof created.remote !== 'string' || typeof created.token !== 'string') {
    throw new CfError('Artifacts response did not include a name, remote, and token', 502);
  }
  return { name: created.name, remote: created.remote, token: created.token, source };
}
