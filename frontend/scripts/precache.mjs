import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const publicRoot = resolve('public');
const staticRoot = resolve('.next/static');
await mkdir(resolve(publicRoot, 'icons'), { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#123d2b"/><path d="M338 155c-82-46-176 7-176 101s94 147 176 101" fill="none" stroke="#fff" stroke-width="46" stroke-linecap="round"/><path d="M292 163c-22 26-34 58-34 93s12 67 34 93" fill="none" stroke="#8fc65a" stroke-width="10" stroke-linecap="round" stroke-dasharray="16 12"/></svg>`;
for (const [file, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['icon-maskable-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(Buffer.from(svg))
    .resize(size)
    .png()
    .toFile(resolve(publicRoot, `icons/${file}`));
}

async function filesUnder(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (!path.endsWith('.map') && !path.endsWith('sw.js')) {
        files.push(path);
      }
    }
  }
  await walk(root);
  return files;
}

const publicFiles = await filesUnder(publicRoot);
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
const source = await readFile('scripts/sw-template.js', 'utf8');
await writeFile(
  resolve(publicRoot, 'sw.js'),
  source.replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files)),
);
await writeFile(
  resolve('.next', 'precache-report.json'),
  JSON.stringify({ version, count: files.length, files }, null, 2),
);
console.log(`Precached ${files.length} Next.js resources; cache version ${version}.`);
