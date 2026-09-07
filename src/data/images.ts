import { z } from 'zod';
import type { ImageMetadata } from 'astro';
import { provenanceShape, refineProvenance } from '../lib/image-ref';

import heroSrc from '../assets/images/hero/clinic-interior.jpg';
import mapSrc from '../assets/images/map/practice-location.png';

/**
 * The two images that do not belong to any content collection.
 *
 * A treatment photo belongs to a treatment and a portrait belongs to a person,
 * so both live in their entry's frontmatter. The hero photograph and the map
 * tile belong to the page itself — there is no record for them to hang off —
 * so they are declared here instead, and validated with the same provenance
 * rules (lib/image-ref.ts) that the collection schemas use. Nothing about
 * being outside a collection lets an image skip its licence fields.
 *
 * Both assets are fetched and processed by the scripts in /scripts, which
 * record where each one came from. Neither script runs during `npm run build`:
 * the build reads the committed files and touches no network.
 */

const standaloneImage = z
  .object({
    /**
     * An ESM image import, so Vite resolves the file at build time and Astro
     * gets real width/height for the CLS guarantee. A missing file is a build
     * error before this schema ever runs; this check catches a string path
     * pasted in by hand.
     */
    src: z.custom<ImageMetadata>(
      (value) =>
        !!value &&
        typeof value === 'object' &&
        'src' in value &&
        'width' in value &&
        'height' in value,
      'src must be an imported image asset, not a path string',
    ),
    ...provenanceShape,
  })
  .strict()
  .superRefine(refineProvenance);

/**
 * Hero — PRD §2.3: licensed stock, no clinical or patient imagery. An empty
 * treatment room qualifies on both counts; it is a room, and nobody is in it.
 */
export const heroImage = standaloneImage.parse({
  src: heroSrc,
  alt: 'An empty dental treatment room with a reclined chair, overhead light and worktop',
  licence: 'unsplash',
  sourceUrl:
    'https://unsplash.com/photos/a-dental-room-with-a-desk-and-chairs-Fdku_oMrDvk',
  credit: 'Kari Bjorn Photography (@karibjorn) on Unsplash',
  isStock: true,
});

/**
 * Static map — PRD §3.9, §6.5. An image, never the Maps JavaScript API.
 *
 * Rendered from OpenStreetMap raster tiles centred on the practice. ODbL
 * requires the attribution to be visible, so `credit` is printed beside the
 * map rather than only in /CREDITS.md — and the schema refuses a credit that
 * does not name OpenStreetMap.
 */
export const mapImage = standaloneImage.parse({
  src: mapSrc,
  alt: 'Street map showing the practice marked on Marlborough Road, off Binley Road in Coventry',
  licence: 'openstreetmap',
  sourceUrl: 'https://www.openstreetmap.org/#map=17/52.40701/-1.48458',
  credit: 'Map data © OpenStreetMap contributors',
  isStock: false,
});

/** The practice's coordinates, as geocoded for the map. Feeds the JSON-LD. */
export const practiceGeo = { latitude: 52.407005, longitude: -1.4845847 } as const;
