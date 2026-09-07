/**
 * Generates the four treatment-card photographs in
 * src/assets/images/treatments/.
 *
 * PRD §2.3: photography is licensed stock, no clinical or patient imagery.
 * Every photograph below is a model, an instrument tray or an empty treatment
 * room. None of them contains a face — a face on a treatment card invites the
 * reader to take a stock model for a patient of this practice, which is the
 * same misrepresentation the clinician monogram avoids.
 *
 * Licence: Unsplash License (free, commercial use, attribution not required —
 * recorded here, in the frontmatter, and in /CREDITS.md regardless, because
 * the asset policy is the point of the exercise).
 *
 * Stored at 1200x800. The card renders the image in a 3:2 box no wider than
 * 496 CSS px on desktop and ~687 CSS px at the widest single-column viewport,
 * and `widths` tops out at 1000, so anything above 1200 is dead weight in the
 * repository that Astro would throw away at build time.
 *
 * Not part of `npm run build`. Run: node scripts/fetch-treatment-assets.mjs
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

/** slug → the Unsplash photo it is rendered from. */
const PHOTOS = [
  {
    slug: 'dental-implants',
    id: 'W9YEY6G8LVM',
    page: 'https://unsplash.com/photos/dental-implant-model-with-teeth-W9YEY6G8LVM',
    credit: 'Jonathan Borba (@jonathanborba) on Unsplash',
  },
  {
    slug: 'all-on-4',
    id: 'VxVO1zrY5F8',
    page: 'https://unsplash.com/photos/dentures-on-white-scale-rack-VxVO1zrY5F8',
    credit: 'Quang Tri NGUYEN (@quangtri) on Unsplash',
  },
  /*
   * Aligner photographs are a minefield of rival branding. The obvious
   * candidate (WFsNCIn8OF4) has a competitor's wordmark moulded into the case
   * in the centre of the frame, which on a card headed "Invisalign" states
   * something untrue about the product. This one shows a single unbranded
   * aligner in a gloved hand.
   */
  {
    slug: 'invisalign',
    id: 'hD14Ge9DX_Q',
    page: 'https://unsplash.com/photos/a-person-in-blue-gloves-holding-a-clear-toothbrush-hD14Ge9DX_Q',
    credit: 'Katarzyna Zygnerska (@katasha) on Unsplash',
  },
  {
    slug: 'cosmetic-dentistry',
    id: 'WvVW7mRaZE8',
    page: 'https://unsplash.com/photos/a-group-of-white-objects-WvVW7mRaZE8',
    credit: 'Ozkan Guner (@dentistozkanguner) on Unsplash',
  },
];

const DIR = 'src/assets/images/treatments';
await mkdir(DIR, { recursive: true });

for (const photo of PHOTOS) {
  const url = `https://unsplash.com/photos/${photo.id}/download?force=true&w=2400`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const original = Buffer.from(await res.arrayBuffer());

  const out = await sharp(original)
    .resize({ width: 1200, height: 800, fit: 'cover', position: 'centre' })
    .jpeg({ quality: 82, progressive: true, mozjpeg: true })
    .toBuffer();

  const file = `${DIR}/${photo.slug}.jpg`;
  await writeFile(file, out);
  console.log(
    `${photo.slug}: ${(original.length / 1024).toFixed(1)} KB in, ` +
      `${(out.length / 1024).toFixed(1)} KB out → ${file}`,
  );
  console.log(`  ${photo.credit} — ${photo.page}`);
}
