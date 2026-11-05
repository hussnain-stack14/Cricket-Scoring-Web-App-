import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const icons = join(root, 'public', 'icons');
const renders = [
  ['crease-app-icon.svg', 'icon-192.png', 192],
  ['crease-app-icon.svg', 'icon-512.png', 512],
  ['crease-app-icon.svg', 'apple-touch-icon.png', 180],
  ['crease-app-icon.svg', 'favicon-32.png', 32],
  ['crease-app-icon.svg', 'favicon-16.png', 16],
  ['crease-app-icon-maskable.svg', 'icon-maskable-512.png', 512],
];

for (const [source, destination, size] of renders) {
  const svg = await readFile(join(icons, source));
  await sharp(svg).resize(size, size).png().toFile(join(icons, destination));
}
