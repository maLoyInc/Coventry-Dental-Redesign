/**
 * Generates src/assets/images/hero/clinic-interior.jpg.
 *
 * PRD §2.3: photography is licensed stock, no clinical or patient imagery.
 * This is an empty treatment room — a room, not a person, and not a patient.
 *
 * Source: https://unsplash.com/photos/a-dental-room-with-a-desk-and-chairs-Fdku_oMrDvk
 * Photographer: Kari Bjorn Photography (@karibjorn)
 * Licence: Unsplash License (free, commercial use, attribution not required —
 * recorded here and in /CREDITS.md regardless, because the asset policy is the
 * point of the exercise).
 *
 * The original is 2400x1600. It is stored at 1440 wide: the hero renders it at
 * 40vw on desktop and `widths` tops out at 960, so anything larger is dead
 * weight in the repo that Astro would throw away at build time.
 *
 * Not part of `npm run build`. Run: node scripts/fetch-hero-asset.mjs
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const SRC =
  'https://unsplash.com/photos/Fdku_oMrDvk/download?force=true&w=2400';

const res = await fetch(SRC, { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!res.ok) throw new Error(`${SRC} -> ${res.status}`);
const original = Buffer.from(await res.arrayBuffer());
console.log(`downloaded ${(original.length / 1024).toFixed(1)} KB`);

const out = await sharp(original)
  .resize({ width: 1440, height: 960, fit: 'cover', position: 'centre' })
  .jpeg({ quality: 82, progressive: true, mozjpeg: true })
  .toBuffer();

await mkdir('src/assets/images/hero', { recursive: true });
await writeFile('src/assets/images/hero/clinic-interior.jpg', out);
const meta = await sharp(out).metadata();
console.log(`wrote ${meta.width}x${meta.height}, ${(out.length / 1024).toFixed(1)} KB`);
