import { symbolChanges } from '../git/symbols.js';

/**
 * @param {unknown} value
 */
function disposeRpc(value) {
  if (!value || typeof value !== 'object' || !(Symbol.dispose in value)) return;
  const dispose = /** @type {{ [Symbol.dispose]?: () => void }} */ (value)[Symbol.dispose];
  dispose?.();
}

/**
 * @param {ArtifactsRepo} repo
 * @param {string} ref
 * @returns {Promise<Record<string, string>>}
 */
export async function jsFilesAt(repo, ref) {
  if (!/^[0-9a-f]{40}$/.test(ref) || /^0+$/.test(ref)) return {};
  const commit = await repo.readCommit(ref);
  try {
    if (!commit?.treeHash) return {};
    /** @type {Record<string, string>} */
    const files = {};
    await walk(repo, commit.treeHash, '', files);
    return files;
  } finally {
    disposeRpc(commit);
  }
}

/**
 * @param {ArtifactsRepo} repo
 * @param {string} before
 * @param {string} after
 * @returns {Promise<{ path: string, symbols: string[] }[]>}
 */
export async function changesBetween(repo, before, after) {
  const left = await jsFilesAt(repo, before);
  const right = await jsFilesAt(repo, after);
  return symbolChanges(left, right);
}

/**
 * @param {ArtifactsRepo} repo
 * @param {string} hash
 * @param {string} prefix
 * @param {Record<string, string>} files
 * @returns {Promise<void>}
 */
async function walk(repo, hash, prefix, files) {
  const entries = await repo.readTree(hash);
  try {
    if (!entries) return;
    for (const entry of entries) {
      const path = prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      if (entry.type === 'tree') {
        await walk(repo, entry.hash, path, files);
        continue;
      }
      if (entry.type !== 'blob' && entry.type !== 'exec') continue;
      if (!path.endsWith('.js')) continue;
      const blob = await repo.readBlob(entry.hash);
      try {
        files[path] = blob ? await blob.text() : '';
      } finally {
        disposeRpc(blob);
      }
    }
  } finally {
    disposeRpc(entries);
  }
}
