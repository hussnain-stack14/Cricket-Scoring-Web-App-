import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
await mkdir('out/icons', { recursive: true });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" rx="0" fill="#123d2b"/><path d="M333 167c-71-36-153 5-153 89s82 125 153 89" fill="none" stroke="#7fae42" stroke-width="40" stroke-linecap="round"/><path d="M270 211v91m28-91v91m-57-91v91m-6-98h70" stroke="#7fae42" stroke-width="9" stroke-linecap="round"/></svg>`;
for (const size of [192, 512])
  await sharp(Buffer.from(svg)).resize(size).png().toFile(`out/icons/icon-${size}.png`);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path);
    else if (!path.endsWith('sw.js') && !path.endsWith('.map'))
      files.push(path.replaceAll('\\', '/').slice(3));
  }
}
await walk('out');
files.sort();
const hash = createHash('sha256');
for (const file of files) hash.update(await readFile(`out${file}`));
const version = hash.digest('hex').slice(0, 16);
const source = await readFile('scripts/sw-template.js', 'utf8');
await writeFile(
  'out/sw.js',
  source.replace('__VERSION__', version).replace('__FILES__', JSON.stringify(files)),
);
await writeFile(
  'out/precache-report.json',
  JSON.stringify({ version, count: files.length, files }, null, 2),
);
console.log(`Precached ${files.length} exported resources; cache version ${version}.`);
