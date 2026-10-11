/**
 * @typedef {{ kind: 'dir', children: Set<string>, mtimeMs: number } | { kind: 'file', data: Uint8Array, mtimeMs: number }} FsEntry
 */

/**
 * isomorphic-git treats a missing path as "not found" only when `error.code` is `ENOENT`.
 * @param {string} code
 * @param {string} message
 * @returns {Error & { code: string }}
 */
function fsError(code, message) {
  const err = /** @type {Error & { code: string }} */ (new Error(`${code}: ${message}`));
  err.code = code;
  return err;
}

class MemoryStats {
  /** @param {FsEntry} entry */
  constructor(entry) {
    this.entry = entry;
  }

  get size() {
    return this.entry.kind === 'file' ? this.entry.data.byteLength : 0;
  }

  get mtimeMs() {
    return this.entry.mtimeMs;
  }

  get ctimeMs() {
    return this.entry.mtimeMs;
  }

  get mode() {
    return this.entry.kind === 'file' ? 0o100644 : 0o040000;
  }

  isFile() {
    return this.entry.kind === 'file';
  }

  isDirectory() {
    return this.entry.kind === 'dir';
  }

  isSymbolicLink() {
    return false;
  }
}

export class MemoryFS {
  constructor() {
    this.encoder = new TextEncoder();
    this.decoder = new TextDecoder();
    /** @type {Map<string, FsEntry>} */
    this.entries = new Map([['/', { kind: 'dir', children: new Set(), mtimeMs: Date.now() }]]);
    this.promises = {
      readFile: this.readFile.bind(this),
      writeFile: this.writeFile.bind(this),
      unlink: this.unlink.bind(this),
      readdir: this.readdir.bind(this),
      mkdir: this.mkdir.bind(this),
      rmdir: this.rmdir.bind(this),
      stat: this.stat.bind(this),
      lstat: this.lstat.bind(this),
      readlink: this.readlink.bind(this),
      symlink: this.symlink.bind(this),
    };
  }

  /** @param {string} input */
  normalize(input) {
    /** @type {string[]} */
    const segments = [];
    for (const part of input.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        segments.pop();
        continue;
      }
      segments.push(part);
    }
    return `/${segments.join('/')}` || '/';
  }

  /** @param {string} path */
  parent(path) {
    const normalized = this.normalize(path);
    if (normalized === '/') return '/';
    const parts = normalized.split('/').filter(Boolean);
    parts.pop();
    return parts.length ? `/${parts.join('/')}` : '/';
  }

  /** @param {string} path */
  basename(path) {
    return this.normalize(path).split('/').filter(Boolean).pop() ?? '';
  }

  /** @param {string} path */
  getEntry(path) {
    return this.entries.get(this.normalize(path));
  }

  /** @param {string} path */
  requireEntry(path) {
    const entry = this.getEntry(path);
    if (!entry) throw fsError('ENOENT', path);
    return entry;
  }

  /** @param {string} path */
  requireDir(path) {
    const entry = this.requireEntry(path);
    if (entry.kind !== 'dir') throw fsError('ENOTDIR', path);
    return entry;
  }

  /**
   * @param {string} path
   * @param {{ recursive?: boolean } | number} [options]
   */
  async mkdir(path, options) {
    const target = this.normalize(path);
    if (target === '/') return;
    const recursive = typeof options === 'object' && options !== null && options.recursive;
    const parent = this.parent(target);
    if (!this.entries.has(parent)) {
      if (!recursive) throw fsError('ENOENT', parent);
      await this.mkdir(parent, { recursive: true });
    }
    if (this.entries.has(target)) return;
    this.entries.set(target, { kind: 'dir', children: new Set(), mtimeMs: Date.now() });
    this.requireDir(parent).children.add(this.basename(target));
  }

  /**
   * @param {string} path
   * @param {string | Uint8Array | ArrayBuffer} data
   */
  async writeFile(path, data) {
    const target = this.normalize(path);
    await this.mkdir(this.parent(target), { recursive: true });
    const bytes =
      typeof data === 'string'
        ? this.encoder.encode(data)
        : data instanceof Uint8Array
          ? data
          : new Uint8Array(data);
    this.entries.set(target, { kind: 'file', data: bytes, mtimeMs: Date.now() });
    this.requireDir(this.parent(target)).children.add(this.basename(target));
  }

  /**
   * @param {string} path
   * @param {string | { encoding?: string }} [options]
   * @returns {Promise<string | Uint8Array>}
   */
  async readFile(path, options) {
    const entry = this.requireEntry(path);
    if (entry.kind !== 'file') throw fsError('EISDIR', path);
    const encoding = typeof options === 'string' ? options : options?.encoding;
    return encoding ? this.decoder.decode(entry.data) : entry.data;
  }

  /** @param {string} path */
  async readdir(path) {
    return [...this.requireDir(path).children].sort();
  }

  /** @param {string} path */
  async unlink(path) {
    const target = this.normalize(path);
    const entry = this.requireEntry(target);
    if (entry.kind !== 'file') throw fsError('EISDIR', path);
    this.entries.delete(target);
    this.requireDir(this.parent(target)).children.delete(this.basename(target));
  }

  /** @param {string} path */
  async rmdir(path) {
    const target = this.normalize(path);
    const entry = this.requireDir(target);
    if (entry.children.size > 0) throw fsError('ENOTEMPTY', path);
    this.entries.delete(target);
    this.requireDir(this.parent(target)).children.delete(this.basename(target));
  }

  /** @param {string} path */
  async stat(path) {
    return new MemoryStats(this.requireEntry(path));
  }

  /** @param {string} path */
  async lstat(path) {
    return this.stat(path);
  }

  /** @param {string} path */
  async readlink(path) {
    throw fsError('ENOTSUP', `readlink ${path}`);
  }

  /**
   * @param {string} target
   * @param {string} path
   */
  async symlink(target, path) {
    throw fsError('ENOTSUP', `symlink ${target} ${path}`);
  }
}
