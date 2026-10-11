import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { MemoryFS } from './memory-fs.js';
import { tokenSecret } from './token.js';

/**
 * @param {string} token
 * @returns {{ username: string, password: string }}
 */
function onAuth(token) {
  return { username: 'x', password: tokenSecret(token) };
}

/**
 * Init a repo in memory, commit `files`, and push `main`.
 * @param {{ remote: string, token: string, files: Record<string, string>, message: string, http?: typeof http }} input
 * @returns {Promise<{ oid: string }>}
 */
export async function pushFiles(input) {
  const dir = '/workspace';
  const fs = new MemoryFS();
  const client = input.http ?? http;
  await git.init({ fs, dir, defaultBranch: 'main' });
  for (const [path, data] of Object.entries(input.files)) {
    await fs.promises.writeFile(`${dir}/${path}`, data);
    await git.add({ fs, dir, filepath: path });
  }
  const oid = await git.commit({
    fs,
    dir,
    message: input.message,
    author: { name: 'Envoy', email: 'envoy@localhost' },
  });
  await git.push({
    fs,
    http: client,
    dir,
    url: input.remote,
    ref: 'main',
    remoteRef: 'main',
    onAuth: () => onAuth(input.token),
  });
  return { oid };
}

/**
 * Clone `main`, write `files` on top, and push a fast-forward when anything changed.
 * @param {{ remote: string, token: string, files: Record<string, string>, message: string, http?: typeof http }} input
 * @returns {Promise<{ oid: string, created: boolean }>}
 */
export async function commitOnRemote(input) {
  const dir = '/repo';
  const fs = new MemoryFS();
  const client = input.http ?? http;
  await git.clone({
    fs,
    http: client,
    dir,
    url: input.remote,
    ref: 'main',
    singleBranch: true,
    onAuth: () => onAuth(input.token),
  });
  let changed = false;
  for (const [path, data] of Object.entries(input.files)) {
    const current = await readOptional(fs, `${dir}/${path}`);
    if (current === data) continue;
    await fs.promises.writeFile(`${dir}/${path}`, data);
    await git.add({ fs, dir, filepath: path });
    changed = true;
  }
  if (!changed) {
    const oid = await git.resolveRef({ fs, dir, ref: 'main' });
    return { oid, created: false };
  }
  const oid = await git.commit({
    fs,
    dir,
    message: input.message,
    author: { name: 'Envoy', email: 'envoy@localhost' },
  });
  await git.push({
    fs,
    http: client,
    dir,
    url: input.remote,
    ref: 'main',
    remoteRef: 'main',
    onAuth: () => onAuth(input.token),
  });
  return { oid, created: true };
}

/**
 * @param {MemoryFS} fs
 * @param {string} path
 * @returns {Promise<string | null>}
 */
async function readOptional(fs, path) {
  try {
    const data = await fs.promises.readFile(path, 'utf8');
    return typeof data === 'string' ? data : null;
  } catch {
    return null;
  }
}

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
 * Create a throwaway repo, push one file, read it back through the binding, then delete the repo.
 * @param {Artifacts} artifacts
 * @returns {Promise<{ ok: true, repo: string, commit: string, text: string, tokenHadExpirySuffix: boolean, secretKeepsSuffix: boolean }>}
 */
export async function runSpikeA(artifacts) {
  const name = `envoy-spike-a-${crypto.randomUUID().slice(0, 8)}`;
  const created = await artifacts.create(name, {
    description: 'envoy spike a',
    setDefaultBranch: 'main',
  });
  const tokenHadExpirySuffix = created.token.includes('?expires=');
  const secretKeepsSuffix = tokenSecret(created.token).includes('?expires=');
  try {
    const pushed = await pushFiles({
      remote: created.remote,
      token: created.token,
      files: { 'README.md': '# spike a\n' },
      message: 'Spike A',
    });
    let text = '';
    let lastError = '';
    for (let attempt = 0; attempt < 10; attempt++) {
      /** @type {ArtifactsRepo | undefined} */
      let repo;
      try {
        repo = await artifacts.get(name);
        const file = await repo.readFile({ ref: 'main', path: 'README.md' });
        text = file ? await file.text() : '';
        if (text === '# spike a\n') break;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        text = '';
      } finally {
        repo?.[Symbol.dispose]();
      }
      await sleep(500);
    }
    if (text !== '# spike a\n') {
      throw new Error(lastError || `readme was ${JSON.stringify(text)}`);
    }
    return {
      ok: true,
      repo: name,
      commit: pushed.oid,
      text,
      tokenHadExpirySuffix,
      secretKeepsSuffix,
    };
  } finally {
    await artifacts.delete(name);
  }
}
