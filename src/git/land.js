import git from 'isomorphic-git';
import { changedPaths, readTextAt } from './repo.js';

/** @typedef {import('./memory-fs.js').MemoryFS} MemoryFS */
/** @typedef {import('./types').GitIdentity} GitIdentity */
/** @typedef {import('./types').LandResult} LandResult */

const MARKER = '<<<<<<<';

/**
 * @param {string} text
 * @returns {boolean}
 */
export function hasConflictMarkers(text) {
  return text.includes(MARKER);
}

/**
 * @param {MemoryFS} fs
 * @param {string} dir
 * @param {string} fork
 * @param {string} base
 * @param {GitIdentity} identity
 * @returns {Promise<LandResult>}
 */
export async function landFork(fs, dir, fork, base, identity) {
  const mainHead = await git.resolveRef({ fs, dir, ref: 'main' });
  const forkHead = await git.resolveRef({ fs, dir, ref: fork });
  await git.checkout({ fs, dir, ref: 'main', force: true });

  if (mainHead === forkHead) {
    return { kind: 'fast-forward', sha: mainHead };
  }

  if (mainHead === base) {
    const result = await git.merge({
      fs,
      dir,
      ours: 'main',
      theirs: fork,
      author: identity,
      committer: identity,
    });
    const sha = result.oid ?? (await git.resolveRef({ fs, dir, ref: 'main' }));
    return { kind: 'fast-forward', sha };
  }

  try {
    const result = await git.merge({
      fs,
      dir,
      ours: 'main',
      theirs: fork,
      abortOnConflict: true,
      author: identity,
      committer: identity,
      message: `Merge ${fork} into main`,
    });
    const sha = result.oid ?? (await git.resolveRef({ fs, dir, ref: 'main' }));
    return { kind: result.fastForward ? 'fast-forward' : 'merge', sha };
  } catch (err) {
    if (!isMergeRefusal(err)) throw err;
    await git.checkout({ fs, dir, ref: 'main', force: true });
    const overlaid = await overlayDisjoint(fs, dir, fork, base, identity);
    if (overlaid) return overlaid;
    await git.checkout({ fs, dir, ref: 'main', force: true });
    return { kind: 'replay', reason: 'conflict' };
  }
}

/**
 * @param {MemoryFS} fs
 * @param {string} dir
 * @param {string} fork
 * @param {string} base
 * @param {GitIdentity} identity
 * @returns {Promise<LandResult | null>}
 */
export async function overlayDisjoint(fs, dir, fork, base, identity) {
  const mainHead = await git.resolveRef({ fs, dir, ref: 'main' });
  const forkHead = await git.resolveRef({ fs, dir, ref: fork });
  const forkChanged = await changedPaths(fs, dir, base, forkHead);
  const mainChanged = await changedPaths(fs, dir, base, mainHead);
  const overlap = forkChanged.filter((path) => mainChanged.includes(path));
  if (overlap.length > 0) return null;

  await git.checkout({ fs, dir, ref: 'main', force: true });
  for (const path of forkChanged) {
    const text = await readTextAt(fs, dir, forkHead, path);
    if (text === null) {
      await git.remove({ fs, dir, filepath: path });
      continue;
    }
    await fs.promises.writeFile(`${dir}/${path}`, text);
    await git.add({ fs, dir, filepath: path });
  }
  const sha = await git.commit({
    fs,
    dir,
    message: `Overlay ${fork} onto main`,
    author: identity,
    committer: identity,
    parent: [mainHead, forkHead],
  });
  return { kind: 'overlay', sha };
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
function isMergeRefusal(err) {
  if (!err || typeof err !== 'object' || !('code' in err)) return false;
  const code = String(err.code);
  return code === 'MergeConflictError' || code === 'MergeNotSupportedError';
}
