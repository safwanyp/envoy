#!/usr/bin/env node
import { toolCallsFrom } from '../src/agent/llm.js';
import { cfEnvelope } from '../src/cloudflare/cf.js';

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? '';
const token = process.env.CLOUDFLARE_API_TOKEN ?? '';
const rounds = 10;
const models = [
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/meta/llama-3.1-8b-instruct-fast',
];

if (accountId.length === 0 || token.length === 0) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, then re-run pnpm spike:d.');
  process.exit(1);
}

/** @type {{ model: string, ok: number, of: number }[]} */
const scores = [];
for (const model of models) {
  let ok = 0;
  for (let round = 0; round < rounds; round++) {
    const result = await cfEnvelope(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
      token,
      'POST',
      {
        messages: [
          {
            role: 'user',
            content: 'Call the write_file tool once. path must be src/server.js. content must include the text export function health(',
          },
        ],
        tools: [
          {
            name: 'write_file',
            description: 'Replace a file',
            parameters: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' },
              },
              required: ['path', 'content'],
            },
          },
        ],
      },
    );
    const calls = toolCallsFrom(result);
    const hit = calls.some((call) => {
      const filePath = call.arguments.path;
      const content = call.arguments.content;
      return (
        call.name === 'write_file' &&
        filePath === 'src/server.js' &&
        typeof content === 'string' &&
        content.includes('export function health(')
      );
    });
    if (hit) ok += 1;
  }
  scores.push({ model, ok, of: rounds });
}

const best = Math.max(...scores.map((score) => score.ok));
const tied = scores.filter((score) => score.ok === best).map((score) => score.model);
console.log(JSON.stringify({ scores, tied }, null, 2));
if (best === 0) process.exit(1);
