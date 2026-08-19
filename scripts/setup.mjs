#!/usr/bin/env node
// One-time setup: fill in the {{...}} placeholders left across the template, then remove itself.
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const FILES = [
  'package.json',
  'README.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'CHANGELOG.md',
  'src/index.ts',
  'test/index.test.ts',
];

const rl = createInterface({ input: stdin, output: stdout });
// Pulling from the async iterator (rather than repeated rl.question() calls) matters when
// stdin arrives as one buffered chunk — piped input, or a user pasting every answer at once —
// since rl.question() races against 'line' events that already fired before it started
// listening, silently dropping answers. The iterator queues them instead.
const lines = rl[Symbol.asyncIterator]();
const ask = async (question, fallback) => {
  process.stdout.write(fallback ? `${question} (${fallback}): ` : `${question}: `);
  const { value, done } = await lines.next();
  const answer = done ? '' : value.trim();
  return answer || fallback;
};

const cwdName = process.cwd().split('/').pop();

const packageName = await ask('Package name', cwdName);
const description = await ask('Description', '');
const githubOwner = await ask('GitHub owner/org', '');
const repoName = await ask('Repository name', packageName.replace(/^@[^/]+\//, ''));
const authorName = await ask('Author name', '');
const year = await ask('Copyright year', String(new Date().getFullYear()));

rl.close();

const tokens = {
  '{{PACKAGE_NAME}}': packageName,
  '{{PACKAGE_DESCRIPTION}}': description,
  '{{GITHUB_OWNER}}': githubOwner,
  '{{REPO_NAME}}': repoName,
  '{{AUTHOR_NAME}}': authorName,
  '{{YEAR}}': year,
};

for (const file of FILES) {
  let contents;
  try {
    contents = await readFile(file, 'utf8');
  } catch {
    continue;
  }

  for (const [token, value] of Object.entries(tokens)) {
    contents = contents.split(token).join(value);
  }

  await writeFile(file, contents);
}

console.log('\nDone. Placeholders replaced in:', FILES.join(', '));
console.log('Removing scripts/setup.mjs...');
await unlink(new URL(import.meta.url));
