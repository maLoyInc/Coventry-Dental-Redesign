/**
 * The enumerable values shared by the form, the schema and the content guards.
 *
 * These live apart from lib/enquiry.ts for one concrete reason: enquiry.ts
 * builds a Zod schema at module scope, so anything importing it drags the whole
 * Zod runtime along. The shared store needs the slug list and nothing else, and
 * it ships to every visitor — a plain tuple costs bytes in the tens, the schema
 * costs tens of kilobytes. Only the island that actually validates pays for
 * validation.
 */

/**
 * The slugs the form may submit. A literal tuple because the API endpoint runs
 * at request time and cannot read the content collections;
 * `assertTreatmentSlugsMatchContent` in ./content.ts fails the build if this
 * list ever drifts from the treatments collection.
 */
export const TREATMENT_SLUGS = [
  'dental-implants',
  'all-on-4',
  'invisalign',
  'cosmetic-dentistry',
] as const;

export type TreatmentSlug = (typeof TREATMENT_SLUGS)[number];

/** Preferred callback window (PRD F7). */
export const PREFERRED_TIMES = ['morning', 'afternoon', 'evening', 'any'] as const;

export type PreferredTime = (typeof PREFERRED_TIMES)[number];
