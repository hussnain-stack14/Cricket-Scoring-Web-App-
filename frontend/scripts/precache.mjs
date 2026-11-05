import { readdir, readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

const publicRoot = resolve('public');
const staticRoot = resolve('.next/static');

async function filesUnder(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (
        !path.endsWith('.map') &&
        !path.endsWith('sw.js') &&
        !path.endsWith('release.json')
      ) {
        files.push(path);
      }
    }
  }
  await walk(root);
  return files;
}

const sourcePngs = new Set([
  'about.png',
  'howitwork.png',
  'bg-dashboard-heading.png',
  'ready.png',
]);
const publicFiles = (await filesUnder(publicRoot)).filter(
  (path) => !sourcePngs.has(relative(publicRoot, path).split(sep).join('/')),
);
const staticFiles = await filesUnder(staticRoot);
const prerender = JSON.parse(await readFile('.next/prerender-manifest.json', 'utf8'));
const routes = Object.keys(prerender.routes)
  .filter(
    (route) =>
      route === '/' ||
      (!route.startsWith('/_') && route !== '/account' && !route.startsWith('/account/')),
  )
  .map((route) => (route === '/' ? '/' : `${route}/`));
const staticUrls = staticFiles.map(
  (path) => `/_next/static/${relative(staticRoot, path).split(sep).join('/')}`,
);
const publicUrls = publicFiles.map((path) => `/${relative(publicRoot, path).split(sep).join('/')}`);
const files = [...new Set([...routes, ...staticUrls, ...publicUrls])].sort();
const hash = createHash('sha256').update(await readFile('.next/BUILD_ID'));
for (const path of publicFiles.sort()) {
  hash.update(relative(publicRoot, path));
  hash.update(await readFile(path));
}
for (const path of staticUrls) hash.update(path);
const version = hash.digest('hex').slice(0, 16);
const buildId = (await readFile('.next/BUILD_ID', 'utf8')).trim();
const source = await readFile('scripts/sw-template.js', 'utf8');
await writeFile(
  resolve(publicRoot, 'sw.js'),
  source.replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files)),
);
await writeFile(
  resolve('.next', 'precache-report.json'),
  JSON.stringify({ version, count: files.length, files }, null, 2),
);
// This is deliberately outside the precache. The client fetches it with no-store
// so a foregrounded app can discover a newly deployed worker without clearing data.
await writeFile(
  resolve(publicRoot, 'release.json'),
  JSON.stringify({ version, buildId, generatedAt: new Date().toISOString() }),
);
console.log(`Precached ${files.length} Next.js resources; cache version ${version}.`);
