/**
 * Generates src/assets/images/map/practice-location.png.
 *
 * PRD §6.5: the location is a static map image, never the Maps JavaScript API,
 * which would exceed the entire JavaScript budget on its own. There is no map
 * provider account behind this concept, so the tile is stitched once from
 * OpenStreetMap's standard raster tiles and committed as an asset. This script
 * exists so the asset can be regenerated and its provenance checked; it is not
 * part of `npm run build` and must not be — the build does not call OSM.
 *
 * Coordinates came from Nominatim for "106 Marlborough Road, Coventry CV2 4ER"
 * (osm way 501779768), which returned an exact building match.
 *
 * Map data © OpenStreetMap contributors, ODbL 1.0 — https://osm.org/copyright
 * The attribution is rendered as visible text beside the map on the page, not
 * burnt into the pixels, so it stays selectable and readable at any zoom.
 *
 * Run: node scripts/fetch-map-asset.mjs
 */
import sharp from 'sharp';
import { writeFile, mkdir } from 'node:fs/promises';

const LAT = 52.407005;
const LON = -1.4845847;
const Z = 17;
const W = 1200;
const H = 675;
const TILE = 256;
const UA = 'coventry-dental-concept/0.1 (one-off portfolio asset build)';

const n = 2 ** Z;
const latRad = (LAT * Math.PI) / 180;
const cx = ((LON + 180) / 360) * n * TILE;
const cy =
  ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
  n *
  TILE;

const left = cx - W / 2;
const top = cy - H / 2;
const x0 = Math.floor(left / TILE);
const y0 = Math.floor(top / TILE);
const x1 = Math.floor((left + W - 1) / TILE);
const y1 = Math.floor((top + H - 1) / TILE);
const cols = x1 - x0 + 1;
const rows = y1 - y0 + 1;

console.log(`fetching ${cols}x${rows} = ${cols * rows} tiles at z${Z}`);

const composites = [];
for (let ty = y0; ty <= y1; ty++) {
  for (let tx = x0; tx <= x1; tx++) {
    const url = `https://tile.openstreetmap.org/${Z}/${tx}/${ty}.png`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    composites.push({
      input: Buffer.from(await res.arrayBuffer()),
      left: (tx - x0) * TILE,
      top: (ty - y0) * TILE,
    });
    // Courtesy delay: OSM's tile policy exists and this is someone's donated
    // bandwidth, even for two dozen tiles.
    await new Promise((r) => setTimeout(r, 150));
  }
}

const stitched = await sharp({
  create: { width: cols * TILE, height: rows * TILE, channels: 3, background: '#e8e2d9' },
})
  .composite(composites)
  .png()
  .toBuffer();

// Brand-teal pin, drawn after the crop so its position is independent of the
// tile grid. Its tip sits on the centre pixel, which is the building.
const PIN_W = 44;
const PIN_H = 58;
const pin = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_W}" height="${PIN_H}" viewBox="0 0 44 58">` +
    `<path d="M22 2C11.5 2 3 10.5 3 21c0 13.8 16.2 32.1 17 33a2.7 2.7 0 0 0 4 0c.8-.9 17-19.2 17-33C41 10.5 32.5 2 22 2z" fill="#1f4955" stroke="#ffffff" stroke-width="3.5"/>` +
    `<circle cx="22" cy="21" r="7.5" fill="#ffffff"/></svg>`,
);

const out = await sharp(stitched)
  .extract({
    left: Math.round(left - x0 * TILE),
    top: Math.round(top - y0 * TILE),
    width: W,
    height: H,
  })
  .composite([
    { input: pin, left: Math.round(W / 2 - PIN_W / 2), top: Math.round(H / 2 - PIN_H) },
  ])
  .png({ compressionLevel: 9, palette: true, quality: 90 })
  .toBuffer();

await mkdir('src/assets/images/map', { recursive: true });
await writeFile('src/assets/images/map/practice-location.png', out);
console.log(`wrote ${W}x${H}, ${(out.length / 1024).toFixed(1)} KB`);
