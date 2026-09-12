// Generates the PWA app icons from the logo. Build-time only; the generated
// PNGs in public/ are committed. Run with `npm run icons`.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG = '#0f172a';
const PAPER = '#e2e8f0';
const SHEET = '#38bdf8';
// Same mark as favicon.svg: a sheet of paper with a translucent picture laid
// over one corner of it — the whole app in two rectangles.
const LOGO = `<rect x="11" y="15" width="29" height="34" rx="3" fill="none" stroke="${PAPER}" stroke-width="3"/>
  <rect x="24" y="25" width="29" height="24" rx="3" fill="${SHEET}" fill-opacity="0.6" stroke="${SHEET}" stroke-width="3"/>`;

function iconSvg(size, { maskable = false } = {}) {
  // Maskable icons must be full-bleed (the OS applies its own circle/squircle
  // mask) with the mark inside the ~80% safe zone — so no rounded corners and a
  // slightly shrunk, centred logo. "any" icons keep the rounding.
  const rx = maskable ? 0 : 14;
  const mark = maskable
    ? `<g transform="translate(32 32) scale(0.78) translate(-32 -32)">${LOGO}</g>`
    : LOGO;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="${rx}" fill="${BG}"/>
  ${mark}
</svg>`;
}

async function render(name, size, opts) {
  const png = await sharp(Buffer.from(iconSvg(size, opts))).png().toBuffer();
  writeFileSync(join(publicDir, name), png);
  console.log(`  ${name} (${size}x${size})`);
}

console.log('Generating PWA icons into public/');
await render('icon-192.png', 192);
await render('icon-512.png', 512);
await render('icon-maskable-512.png', 512, { maskable: true });
console.log('Done.');
