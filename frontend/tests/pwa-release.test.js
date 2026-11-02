import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('release metadata stays uncached and navigations use network-first offline fallback', async () => {
  const [headers, template, precache] = await Promise.all([
    readFile('vercel.json', 'utf8'),
    readFile('scripts/sw-template.js', 'utf8'),
    readFile('scripts/precache.mjs', 'utf8'),
  ]);
  const config = JSON.parse(headers);
  const releaseHeaders = config.headers.find((entry) => entry.source === '/release.json');

  assert.equal(releaseHeaders.headers[0].value, 'no-store, no-cache, must-revalidate');
  assert.match(template, /if \(event\.request\.mode === 'navigate'\)/);
  assert.match(template, /const response = await fetch\(event\.request\)/);
  assert.match(template, /return \(await cache\.match\(path\)\) \|\| Response\.error\(\)/);
  assert.match(precache, /!path\.endsWith\('release\.json'\)/);
  assert.match(precache, /resolve\(publicRoot, 'release\.json'\)/);
});
