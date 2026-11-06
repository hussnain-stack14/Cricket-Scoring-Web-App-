import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicDir = join(root, 'public');
const iconsDir = join(publicDir, 'icons');
await mkdir(iconsDir, { recursive: true });

// Canonical approved stumps artwork. Check the generated public/icons files into Git too,
// so deployments that invoke Next directly still serve the logo before this script runs.
const appIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title"><title id="title">Crease app icon</title><rect width="512" height="512" rx="112" fill="#06452d"/><path d="M103 192 C176 99 330 79 414 152" fill="none" stroke="#a9eb50" stroke-linecap="round" stroke-width="28"/><path d="M121 363 H391" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="17"/><g fill="#fff"><rect x="184" y="205" width="27" height="145" rx="13.5"/><rect x="243" y="188" width="27" height="162" rx="13.5"/><rect x="302" y="205" width="27" height="145" rx="13.5"/><rect x="184" y="193" width="145" height="14" rx="7"/><rect x="184" y="348" width="145" height="14" rx="7"/></g></svg>`;
const maskableIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title"><title id="title">Crease maskable app icon</title><rect width="512" height="512" fill="#06452d"/><path d="M134 198 C193 126 309 111 378 166" fill="none" stroke="#a9eb50" stroke-linecap="round" stroke-width="25"/><path d="M150 362 H362" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="15"/><g fill="#fff"><rect x="201" y="218" width="24" height="129" rx="12"/><rect x="244" y="204" width="24" height="143" rx="12"/><rect x="287" y="218" width="24" height="129" rx="12"/><rect x="201" y="207" width="110" height="13" rx="6.5"/><rect x="201" y="345" width="110" height="13" rx="6.5"/></g></svg>`;

await Promise.all([
  writeFile(join(iconsDir, 'crease-app-icon.svg'), appIcon),
  writeFile(join(iconsDir, 'crease-app-icon-maskable.svg'), maskableIcon),
  writeFile(join(iconsDir, 'crease-app-icon-v2.svg'), appIcon),
  writeFile(join(iconsDir, 'crease-app-icon-maskable-v2.svg'), maskableIcon),
]);

for (const [source, destination, size] of [
  [appIcon, 'icon-192.png', 192],
  [appIcon, 'icon-512.png', 512],
  [appIcon, 'apple-touch-icon.png', 180],
  [appIcon, 'favicon-32.png', 32],
  [appIcon, 'favicon-16.png', 16],
  [maskableIcon, 'icon-maskable-512.png', 512],
  [appIcon, 'crease-192-v2.png', 192],
  [appIcon, 'crease-512-v2.png', 512],
  [maskableIcon, 'crease-maskable-512-v2.png', 512],
  [appIcon, 'apple-touch-icon-v2.png', 180],
  [appIcon, 'favicon-32-v2.png', 32],
  [appIcon, 'favicon-16-v2.png', 16],
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

// A public 1200x630 share image; generated from the existing stadium art and approved icon.
const socialBackdrop = await sharp(join(publicDir, 'bg-dashboard-heading.png'))
  .resize(1200, 630, { fit: 'cover' })
  .toBuffer();
const socialOverlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><linearGradient id="shade"><stop stop-color="#07291e" stop-opacity=".96"/><stop offset=".65" stop-color="#07291e" stop-opacity=".78"/><stop offset="1" stop-color="#07291e" stop-opacity=".24"/></linearGradient></defs>
  <rect width="1200" height="630" fill="url(#shade)"/>
  <text x="84" y="324" font-family="Arial, sans-serif" font-size="100" font-weight="700" fill="white">crease<tspan fill="#a9eb50">.</tspan></text>
  <text x="86" y="405" font-family="Arial, sans-serif" font-size="43" font-weight="600" fill="white">Every Ball. Every Moment.</text>
  <text x="87" y="468" font-family="Arial, sans-serif" font-size="28" fill="white">Cricket scoring, online or offline.</text>
</svg>`);
await sharp(socialBackdrop)
  .composite([
    { input: socialOverlay, top: 0, left: 0 },
    { input: await sharp(Buffer.from(appIcon)).resize(106, 106).png().toBuffer(), top: 67, left: 84 },
  ])
  .png()
  .toFile(join(publicDir, 'crease-social.png'));
