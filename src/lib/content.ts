import { getCollection, getEntry, type CollectionEntry } from 'astro:content';
import type { ImageMetadata } from 'astro';
import { TREATMENT_SLUGS } from './enquiry';
import { LICENCE_LABELS, type Licence } from './image-ref';
import { heroImage, mapImage } from '../data/images';

/**
 * Content accessors with cardinality guards.
 *
 * Zod validates the shape of each record; these functions validate how many
 * there are and how they relate. Both run at build time and both fail the
 * build, which is what keeps "exactly four treatment cards" (PRD F5) and
 * "three testimonials maximum" (F13) from being conventions someone can
 * quietly break.
 */

const fail = (message: string): never => {
  throw new Error(`[content] ${message}`);
};

/** Exactly four, ordered 1-4 with no duplicates or gaps (PRD F5, §3.3). */
export async function getTreatments(): Promise<CollectionEntry<'treatments'>[]> {
  const treatments = await getCollection('treatments');

  if (treatments.length !== 4) {
    fail(`expected exactly 4 treatments, found ${treatments.length}`);
  }

  const orders = treatments.map((entry) => entry.data.order).sort((a, b) => a - b);
  if (orders.some((order, index) => order !== index + 1)) {
    fail(`treatment "order" must be 1,2,3,4 with no repeats — got ${orders.join(',')}`);
  }

  return treatments.sort((a, b) => a.data.order - b.data.order);
}

/**
 * The form's slug list and the treatments collection must agree, or the form
 * can offer a treatment the page does not have.
 */
export async function assertTreatmentSlugsMatchContent(): Promise<void> {
  const ids = (await getCollection('treatments')).map((entry) => entry.id).sort();
  const expected = [...TREATMENT_SLUGS].sort();

  if (ids.join('|') !== expected.join('|')) {
    fail(
      `TREATMENT_SLUGS in lib/enquiry.ts is out of sync with the treatments ` +
        `collection. Collection: ${ids.join(', ')}. Form: ${expected.join(', ')}.`,
    );
  }
}

/** Three at most, all placeholder copy (PRD F13, §2.3). */
export async function getTestimonials(): Promise<CollectionEntry<'testimonials'>[]> {
  const testimonials = await getCollection('testimonials');

  if (testimonials.length === 0 || testimonials.length > 3) {
    fail(`expected 1-3 testimonials, found ${testimonials.length}`);
  }

  return testimonials;
}

/** One clinician block (PRD F6). */
export async function getClinician(): Promise<CollectionEntry<'team'>> {
  const team = await getCollection('team');

  if (team.length !== 1) {
    fail(`expected exactly 1 team member, found ${team.length}`);
  }

  return team[0]!;
}

/** Four questions, one per anxiety topic (PRD F14, §3.10). */
export async function getFaqs(): Promise<CollectionEntry<'faq'>[]> {
  const faqs = await getCollection('faq');

  if (faqs.length !== 4) {
    fail(`expected exactly 4 FAQs, found ${faqs.length}`);
  }

  const topics = new Set(faqs.map((entry) => entry.data.topic));
  if (topics.size !== 4) {
    fail('the four FAQs must cover pain, cost, duration and longevity — one each');
  }

  const orders = faqs.map((entry) => entry.data.order).sort((a, b) => a - b);
  if (orders.some((order, index) => order !== index + 1)) {
    fail(`FAQ "order" must be 1,2,3,4 with no repeats — got ${orders.join(',')}`);
  }

  return faqs.sort((a, b) => a.data.order - b.data.order);
}

/**
 * The single opening-hours document, with the week in calendar order rather
 * than file order. Feeds the status pill, the footer table and the JSON-LD.
 */
export async function getOpeningHours(): Promise<CollectionEntry<'openingHours'>['data']> {
  const entry = await getEntry('openingHours', 'practice');

  if (!entry) {
    fail('opening-hours.json must contain a "practice" entry');
  }

  const week = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const days = entry!.data.regular.map((day) => day.day);

  if (new Set(days).size !== 7) {
    fail(`opening hours must list each weekday exactly once — got ${days.join(', ')}`);
  }

  return {
    ...entry!.data,
    regular: [...entry!.data.regular].sort(
      (a, b) => week.indexOf(a.day) - week.indexOf(b.day),
    ),
  };
}

/**
 * Every image on the page, with its provenance — the single source /CREDITS.md
 * is generated from (PRD §2.3).
 *
 * Collection images and the two standalone ones (hero, map) are gathered here
 * rather than in the endpoint, so adding an image anywhere means adding it to
 * one list, and the credits file follows. Dimensions come off the resolved
 * asset, not off a field somebody typed.
 */
export interface ImageCredit {
  /** Where on the page the reader will meet this image. */
  usedIn: string;
  file: string;
  width: number;
  height: number;
  alt: string;
  licence: Licence;
  licenceLabel: string;
  sourceUrl?: string;
  credit: string;
  isStock: boolean;
}

/**
 * Repository path for a built asset.
 *
 * `ImageMetadata.src` is `/@fs/...` in dev and `/_astro/name.hash.ext` in a
 * build — neither is a path a reader can open to check a licence. This glob is
 * evaluated by Vite at build time and maps every asset back to where it lives
 * in the repository. The fallback is the shipped URL, which is at least true.
 */
const ASSET_MODULES = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/**/*.{jpg,jpeg,png,webp,avif,gif,svg}',
  { eager: true },
);

const REPO_PATH_BY_SRC = new Map(
  Object.entries(ASSET_MODULES).map(([path, module]) => [
    module.default.src,
    path.replace(/^\//, ''),
  ]),
);

interface ImageWithProvenance {
  src: ImageMetadata;
  alt: string;
  licence: Licence;
  sourceUrl?: string;
  credit: string;
  isStock: boolean;
}

const toCredit = (usedIn: string, image: ImageWithProvenance): ImageCredit => ({
  usedIn,
  file: REPO_PATH_BY_SRC.get(image.src.src) ?? image.src.src,
  width: image.src.width,
  height: image.src.height,
  alt: image.alt,
  licence: image.licence,
  licenceLabel: LICENCE_LABELS[image.licence],
  sourceUrl: image.sourceUrl,
  credit: image.credit,
  isStock: image.isStock,
});

/**
 * The clinician block has no entry here on purpose: it renders a monogram,
 * which is text in a box rather than an image, so there is no file and no
 * licence to record. content.config.ts explains why there is no portrait.
 */
export async function getImageCredits(): Promise<ImageCredit[]> {
  const treatments = await getTreatments();

  return [
    toCredit('Hero', heroImage),
    ...treatments.map((entry) =>
      toCredit(`Treatment card — ${entry.data.name}`, entry.data.image),
    ),
    toCredit('Static map, Finding us', mapImage),
  ];
}
