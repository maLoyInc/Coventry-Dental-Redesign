import { z } from 'zod';

/**
 * The provenance half of ImageRef (PRD §7.1), in one place.
 *
 * Two kinds of image exist in this project and they get their `src` from
 * different places: images inside a content collection use Astro's `image()`
 * schema helper, and the two standalone assets (hero, map) are plain ESM
 * imports in `src/data/images.ts`. Everything *after* `src` — the alt text and
 * the licence fields that generate /CREDITS.md — must be identical for both,
 * so it is written once here and spread into each.
 *
 * Without this, adding a provenance field to the collection schema would
 * silently leave the hero and the map without it.
 */

/**
 * Every licence in use. Adding one means deciding its rules below.
 *
 * There is no `placeholder` member. There used to be, for the flat cards that
 * stood in for imagery through Stages 1-5; with every one of them replaced by
 * a licensed photograph there is nothing left to describe, and leaving the
 * value in would leave a way to ship an unlicensed image. `pexels` stays
 * although nothing uses it today — PRD §2.3 names it as a permitted source,
 * so it is a policy statement rather than a leftover.
 */
const LICENCES = ['unsplash', 'pexels', 'openstreetmap'] as const;

export type Licence = (typeof LICENCES)[number];

/** Human labels for /CREDITS.md. */
export const LICENCE_LABELS: Record<Licence, string> = {
  unsplash: 'Unsplash License',
  pexels: 'Pexels License',
  openstreetmap: 'Open Database License (ODbL) 1.0',
};

/**
 * Fields shared by every image, `src` excluded.
 *
 * `alt` is required and non-trivial: an image cannot exist without it.
 * `licence`/`sourceUrl`/`credit` are what /CREDITS.md is built from, so they
 * cannot be omitted for anything that came from outside this repository.
 */
export const provenanceShape = {
  alt: z.string().min(5, 'alt text must be at least 5 characters'),
  licence: z.enum(LICENCES),
  sourceUrl: z.url().optional(),
  credit: z.string().min(2),
  isStock: z.boolean(),
};

type Provenance = {
  alt: string;
  licence: Licence;
  sourceUrl?: string;
  credit: string;
  isStock: boolean;
};

/**
 * Rules that span fields. Attached with `.superRefine()` by both callers.
 *
 * The OpenStreetMap clause is not decoration: ODbL requires the attribution to
 * be shown, and the only thing that carries it to the page is `credit`. A map
 * tile credited "map" would ship an attribution failure, so it fails the build
 * instead.
 */
export function refineProvenance(value: Provenance, ctx: z.RefinementCtx): void {
  if (!value.sourceUrl) {
    ctx.addIssue({
      code: 'custom',
      path: ['sourceUrl'],
      message: `sourceUrl is required for ${value.licence} assets`,
    });
  }

  if (value.licence === 'openstreetmap') {
    if (value.isStock) {
      ctx.addIssue({
        code: 'custom',
        path: ['isStock'],
        message: 'map tiles are not stock photography — isStock must be false',
      });
    }
    if (!/openstreetmap/i.test(value.credit)) {
      ctx.addIssue({
        code: 'custom',
        path: ['credit'],
        message:
          'ODbL requires visible attribution — credit must name OpenStreetMap contributors',
      });
    }
    return;
  }

  // unsplash | pexels
  if (!value.isStock) {
    ctx.addIssue({
      code: 'custom',
      path: ['isStock'],
      message: 'unsplash/pexels imagery must be marked isStock: true',
    });
  }
}
