import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');
const iconsDir = join(publicDir, 'icons');
await mkdir(iconsDir, { recursive: true });

// Keep the approved mark in the build source because public/icons is generated and ignored.
const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title"><title id="title">Crease app icon</title><rect width="512" height="512" rx="112" fill="#06452d"/><path d="M103 192 C176 99 330 79 414 152" fill="none" stroke="#a9eb50" stroke-linecap="round" stroke-width="28"/><path d="M121 363 H391" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="17"/><g fill="#fff"><rect x="184" y="205" width="27" height="145" rx="13.5"/><rect x="243" y="188" width="27" height="162" rx="13.5"/><rect x="302" y="205" width="27" height="145" rx="13.5"/><rect x="184" y="193" width="145" height="14" rx="7"/><rect x="184" y="348" width="145" height="14" rx="7"/></g></svg>`;
const maskableIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title"><title id="title">Crease maskable app icon</title><rect width="512" height="512" fill="#06452d"/><path d="M134 198 C193 126 309 111 378 166" fill="none" stroke="#a9eb50" stroke-linecap="round" stroke-width="25"/><path d="M150 362 H362" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="15"/><g fill="#fff"><rect x="201" y="218" width="24" height="129" rx="12"/><rect x="244" y="204" width="24" height="143" rx="12"/><rect x="287" y="218" width="24" height="129" rx="12"/><rect x="201" y="207" width="110" height="13" rx="6.5"/><rect x="201" y="345" width="110" height="13" rx="6.5"/></g></svg>`;

await Promise.all([
  writeFile(join(iconsDir, 'crease-app-icon.svg'), appIcon),
  writeFile(join(iconsDir, 'crease-app-icon-maskable.svg'), maskableIcon),
]);

for (const [source, destination, size] of [
  [appIcon, 'icon-192.png', 192],
  [appIcon, 'icon-512.png', 512],
  [appIcon, 'apple-touch-icon.png', 180],
  [appIcon, 'favicon-32.png', 32],
  [appIcon, 'favicon-16.png', 16],
  [maskableIcon, 'icon-maskable-512.png', 512],
]) {
  await sharp(Buffer.from(source)).resize(size, size).png().toFile(join(iconsDir, destination));
}

const webpImages = [
  ['about.png', 'about.webp', 1448],
  ['about.png', 'about-mobile.webp', 800],
  ['howitwork.png', 'howitwork.webp', 1536],
  ['howitwork.png', 'howitwork-mobile.webp', 900],
  ['bg-dashboard-heading.png', 'bg-dashboard-heading.webp', 1600],
  ['bg-dashboard-heading.png', 'bg-dashboard-heading-mobile.webp', 900],
  ['ready.png', 'ready.webp', 1448],
  ['ready.png', 'ready-mobile.webp', 800],
];

for (const [source, destination, width] of webpImages) {
  const sourcePath = join(publicDir, source);
  const destinationPath = join(publicDir, destination);
  const before = (await stat(sourcePath)).size;
  const image = sharp(await readFile(sourcePath));
  const metadata = await image.metadata();
  const pipeline =
    width === metadata.width ? image : image.resize({ width, withoutEnlargement: true });
  await pipeline
    .webp({ quality: 86, effort: 6, smartSubsample: true })
    .toFile(destinationPath);
  const after = (await stat(destinationPath)).size;
  const reduction = Math.round((1 - after / before) * 100);
  console.log(`${source} -> ${destination}: ${before} -> ${after} bytes (${reduction}% smaller)`);
}
