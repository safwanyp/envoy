#!/usr/bin/env node
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import http from 'isomorphic-git/http/node';
import { artifactsReposUrl, mainRepoName } from '../src/cloudflare/api.js';
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
const created = await cf(artifactsReposUrl(accountId, namespace), {
  name: repo,
  description: 'Envoy demo main',
  default_branch: 'main',
});
const remote = created.remote;
const repoToken = created.token;
if (typeof remote !== 'string' || typeof repoToken !== 'string') {
  throw new Error('Artifacts create response did not include a remote and token');
}
const pushed = await pushFiles({
  remote,
  token: repoToken,
  files,
  message: 'Seed the demo API',
  http,
});
console.log(JSON.stringify({ repo, commit: pushed.oid, remote }));

/**
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {Promise<Record<string, string>>}
 */
async function loadTree(dir, prefix = '') {
  /** @type {Record<string, string>} */
  const files = {};
  for (const entry of await readdir(dir)) {
    const full = path.join(dir, entry);
    const rel = prefix.length === 0 ? entry : `${prefix}/${entry}`;
    const info = await stat(full);
    if (info.isDirectory()) Object.assign(files, await loadTree(full, rel));
    else files[rel] = await readFile(full, 'utf8');
  }
  return files;
}

/**
 * @param {string} url
 * @param {Record<string, unknown>} body
 * @returns {Promise<Record<string, unknown>>}
 */
async function cf(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const payload = /** @type {{ success?: boolean, errors?: { message?: string }[], result?: Record<string, unknown> }} */ (
    await response.json()
  );
  if (!response.ok || payload.success === false) {
    const message = payload.errors?.map((item) => item.message).join('; ') || response.statusText;
    throw new Error(message);
  }
  return payload.result ?? {};
}
