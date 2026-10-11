import git from 'isomorphic-git';
import { MemoryFS } from './memory-fs.js';

/** @typedef {import('./types').GitIdentity} GitIdentity */

export const REPO_DIR = '/repo';

/**
 * @param {number} timestamp
 * @returns {GitIdentity}
 */
export function identityAt(timestamp) {
  return {
    name: 'Envoy',
    email: 'envoy@localhost',
    timestamp,
    timezoneOffset: 0,
  };
}

/**
 * @returns {() => GitIdentity}
 */
export function createIdentityClock() {
  let timestamp = 1_700_000_000;
  return () => {
    timestamp += 1;
    return identityAt(timestamp);
  };
}

/**
 * @param {Record<string, string>} files
 * @param {GitIdentity} identity
 * @param {string} message
 * @returns {Promise<{ fs: MemoryFS, dir: string, sha: string }>}
 */
export async function initRepo(files, identity, message) {
  const fs = new MemoryFS();
  const dir = REPO_DIR;
  await git.init({ fs, dir, defaultBranch: 'main' });
  const sha = await commitOnBranch(fs, dir, 'main', files, message, identity);
  return { fs, dir, sha };
}

/**
 * @param {MemoryFS} fs
 * @param {string} dir
 * @param {string} branch
 * @param {Record<string, string>} files
 * @param {string} message
 * @param {GitIdentity} identity
 * @returns {Promise<string>}
 */
export async function commitOnBranch(fs, dir, branch, files, message, identity) {
  const branches = await git.listBranches({ fs, dir });
  if (branches.includes(branch)) {
    await git.checkout({ fs, dir, ref: branch, force: true });
  }
  for (const [path, data] of Object.entries(files)) {
    await fs.promises.writeFile(`${dir}/${path}`, data);
    await git.add({ fs, dir, filepath: path });
  }
  return git.commit({
    fs,
    dir,
    message,
    author: identity,
    committer: identity,
  });
}

/**
 * @param {MemoryFS} fs
 * @param {string} dir
 * @param {string} name
 * @param {string} fromRef
 * @returns {Promise<string>}
 */
export async function forkBranch(fs, dir, name, fromRef) {
  await git.branch({ fs, dir, ref: name, object: fromRef, checkout: true, force: true });
  return git.resolveRef({ fs, dir, ref: name });
}

/**
 * @param {MemoryFS} fs
 * @param {string} dir
 * @param {string} ref
 * @param {string} filepath
 * @returns {Promise<string | null>}
 */
export async function readTextAt(fs, dir, ref, filepath) {
  try {
    const oid = await git.resolveRef({ fs, dir, ref });
    const { blob } = await git.readBlob({ fs, dir, oid, filepath });
    return new TextDecoder().decode(blob);
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

/**
 * @param {MemoryFS} fs
 * @param {string} dir
 * @param {string} ref
 * @returns {Promise<Record<string, string>>}
 */
export async function readTree(fs, dir, ref) {
  const paths = await git.listFiles({ fs, dir, ref });
  /** @type {Record<string, string>} */
  const files = {};
  for (const path of paths) {
    const text = await readTextAt(fs, dir, ref, path);
    if (text !== null) files[path] = text;
  }
  return files;
}

/**
 * @param {MemoryFS} fs
 * @param {string} dir
 * @param {string} from
 * @param {string} to
 * @returns {Promise<string[]>}
 */
export async function changedPaths(fs, dir, from, to) {
  const before = await git.listFiles({ fs, dir, ref: from });
  const after = await git.listFiles({ fs, dir, ref: to });
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  /** @type {string[]} */
  const changed = [];
  for (const path of after) {
    if (!beforeSet.has(path)) {
      changed.push(path);
      continue;
    }
    const left = await readTextAt(fs, dir, from, path);
    const right = await readTextAt(fs, dir, to, path);
    if (left !== right) changed.push(path);
  }
  for (const path of before) {
    if (!afterSet.has(path)) changed.push(path);
  }
  return changed.sort();
}

/**
 * @param {MemoryFS} fs
 * @param {string} dir
 * @returns {Promise<{ sha: string, message: string }[]>}
 */
export async function logMain(fs, dir) {
  const commits = await git.log({ fs, dir, ref: 'main' });
  return commits.map((entry) => ({
    sha: entry.oid,
    message: entry.commit.message,
  }));
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isMissing(err) {
  if (!err || typeof err !== 'object') return false;
  const code = 'code' in err ? String(err.code) : '';
  if (code === 'NotFoundError' || code === 'ENOENT') return true;
  const message = err instanceof Error ? err.message : '';
  return /not found|could not find/i.test(message);
}
