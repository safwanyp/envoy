#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import http from 'isomorphic-git/http/node';
import { artifactsRepoUrl, artifactsReposUrl, artifactsTokensUrl, mainRepoName } from '../src/cloudflare/api.js';
import { alreadyExists, cfEnvelope } from '../src/cloudflare/cf.js';
import { pushFiles } from '../src/git/publish.js';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const namespace = process.env.ARTIFACTS_NAMESPACE ?? 'envoy';
const project = process.env.ENVOY_PROJECT ?? 'demo';
const repo = mainRepoName(project);

if (accountId.length === 0 || token.length === 0) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then re-run pnpm seed.');
  process.exit(1);
}

const root = path.resolve('demo/seed-repo');
const files = await loadTree(root);
const opened = await openMain();
if (opened.created) {
  const pushed = await pushFiles({
    remote: opened.remote,
    token: opened.repoToken,
    files,
    message: 'Seed the demo API',
    http,
  });
  console.log(JSON.stringify({ repo, commit: pushed.oid, remote: opened.remote, created: true }));
} else {
  const commit = await headCommit();
  console.log(JSON.stringify({ repo, commit, remote: opened.remote, created: false }));
}

/**
 * @returns {Promise<{ created: boolean, remote: string, repoToken: string }>}
 */
async function openMain() {
  try {
    const created = /** @type {{ remote?: string, token?: string }} */ (
      await cfEnvelope(artifactsReposUrl(accountId, namespace), token, 'POST', {
        name: repo,
        description: 'Envoy demo main',
        default_branch: 'main',
      })
    );
    if (typeof created.remote !== 'string' || typeof created.token !== 'string') {
      throw new Error('Artifacts create response did not include a remote and token');
    }
    return { created: true, remote: created.remote, repoToken: created.token };
  } catch (err) {
    if (!alreadyExists(err)) throw err;
    const info = /** @type {{ remote?: string }} */ (
      await cfEnvelope(artifactsRepoUrl(accountId, namespace, repo), token, 'GET')
    );
    const minted = /** @type {{ plaintext?: string }} */ (
      await cfEnvelope(artifactsTokensUrl(accountId, namespace), token, 'POST', {
        repo,
        scope: 'write',
      })
    );
    if (typeof info.remote !== 'string' || typeof minted.plaintext !== 'string') {
      throw new Error('Existing main repo did not yield a remote and write token');
    }
    return { created: false, remote: info.remote, repoToken: minted.plaintext };
  }
}

/**
 * @returns {Promise<string>}
 */
async function headCommit() {
  const log = await cfEnvelope(`${artifactsRepoUrl(accountId, namespace, repo)}/log?ref=main&limit=1`, token, 'GET');
  const head = Array.isArray(log) ? log[0] : null;
  if (!head || typeof head !== 'object') return '';
  if ('hash' in head && typeof head.hash === 'string') return head.hash;
  if ('id' in head && typeof head.id === 'string') return head.id;
  return '';
}

/**
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {Promise<Record<string, string>>}
 */
async function loadTree(dir, prefix = '') {
  /** @type {Record<string, string>} */
  const loaded = {};
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const rel = prefix.length === 0 ? entry : `${prefix}/${entry}`;
    const info = await stat(full);
    if (info.isDirectory()) Object.assign(loaded, await loadTree(full, rel));
    else loaded[rel] = await readFile(full, 'utf8');
  }
  return loaded;
}
