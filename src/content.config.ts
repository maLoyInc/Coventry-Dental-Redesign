import { defineCollection, reference, type SchemaContext } from 'astro:content';
import { z } from 'zod';
import { glob, file } from 'astro/loaders';
import { provenanceShape, refineProvenance } from './lib/image-ref';

/**
 * Content schemas — PRD §7 (Data Model).
 *
 * Every visible value on the page comes from here and is validated at build
 * time. A schema failure fails the build, which is the mechanism that makes
 * unreplaced placeholders and empty slots structurally impossible (PRD §6.4).
 */

/* -------------------------------------------------------------------------
 * Shared types
 * ---------------------------------------------------------------------- */

/**
 * ImageRef (PRD §7.1) for images that live inside a collection.
 *
 * `src` uses Astro's `image()` helper rather than a bare string: the file must
 * exist on disk (remote URLs are rejected outright) and its real width/height
 * are read from the file itself. That is a stronger guarantee than the typed
 * `width`/`height` fields the PRD sketches — those can drift from the asset,
 * these cannot. The CLS requirement is met either way.
 *
 * Everything after `src` comes from lib/image-ref.ts, which the two standalone
 * assets in src/data/images.ts share, so provenance rules cannot differ
 * between an image in a collection and an image beside one.
 */
const imageRef = (image: SchemaContext['image']) =>
  z
    .object({ src: image(), ...provenanceShape })
    .strict()
    .superRefine(refineProvenance);

/** "HH:MM", 24-hour. */
const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'time must be "HH:MM" in 24-hour form');

/** E.164, e.g. +442476454350. */
const e164Phone = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'phone must be in E.164 form, e.g. +442476454350');

const weekday = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

/* -------------------------------------------------------------------------
 * Collections
 * ---------------------------------------------------------------------- */

/** Treatment ×4 — PRD §3.3, F5. The entry id (filename) is the slug. */
const treatments = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/treatments' }),
  schema: ({ image }) =>
    z
      .object({
        name: z.string().min(3),
        shortDescription: z.string().min(20).max(160),
        /** Indicative "from" price in whole GBP (PRD §3.6, F12). */
        priceFrom: z.number().int().positive(),
        priceCaveat: z.string().min(10),
        image: imageRef(image),
        order: z.number().int().min(1).max(4),
      })
      .strict(),
  // detailBody is the Markdown body of the file.
});

/** Testimonial ×3 — PRD §3.5, F13. */
const testimonials = defineCollection({
  loader: file('./src/content/data/testimonials.json'),
  schema: z
    .object({
      /** Validated against the treatments collection at build time. */
      treatmentSlug: reference('treatments'),
      body: z.string().min(80).max(500),
      attribution: z.string().min(3),
      /**
       * Placeholder copy only, for the whole life of this concept (PRD §2.3).
       * A literal, not a boolean: writing `false` fails the build.
       */
      isPlaceholder: z.literal(true),
    })
    .strict(),
});

/** TeamMember ×1 — PRD §3.4, F6. */
const team = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/team' }),
  schema: () =>
    z
      .object({
        name: z.string().min(3),
        role: z.string().min(3),
        /**
         * Optional: the live site does not publish it and inventing a GDC
         * number would be a false factual claim about a real clinician. The
         * page omits the line entirely when it is absent.
         */
        gdcNumber: z
          .string()
          .regex(/^\d{5,7}$/, 'GDC number is 5-7 digits')
          .optional(),
        yearsInPractice: z.number().int().min(1).max(70),
        qualifications: z.array(z.string().min(2)).min(1),
        /**
         * No `portrait` field, deliberately, and `.strict()` means adding one
         * back fails the build.
         *
         * PRD §2.3 called for a stock placeholder here. A stock face printed
         * under the name of a real, identifiable clinician is a picture of
         * someone who is not him, presented as him — the same class of false
         * claim as an invented GDC number, and not fixed by a caption. The
         * block renders a monogram built from the name instead: it says
         * "no photograph", which is true, and it cannot be misread as one.
         */
        /**
         * Press coverage as text. `.strict()` means a `logo` field is a build
         * error, not a code-review note — this is how the "media logos are not
         * reproduced" policy in PRD §2.3 is enforced structurally.
         */
        mediaMentions: z
          .array(
            z
              .object({
                outlet: z.string().min(2),
                year: z.number().int().min(1990).max(2026),
                description: z.string().min(10),
                /**
                 * True where the outlet and year are stand-ins rather than a
                 * verified appearance. The page labels those as placeholder
                 * rather than presenting them as fact.
                 */
                isPlaceholder: z.boolean(),
              })
              .strict(),
          )
          .min(1),
      })
      .strict(),
  // biography is the Markdown body of the file.
});

/** FAQ ×4 — PRD §3.10, F14. */
const faq = defineCollection({
  loader: file('./src/content/data/faq.json'),
  schema: z
    .object({
      question: z.string().min(10),
      answer: z.string().min(40),
      /** The four highest-anxiety topics. One entry each, no others. */
      topic: z.enum(['pain', 'cost', 'duration', 'longevity']),
      order: z.number().int().min(1).max(4),
    })
    .strict(),
});

/**
 * OpeningHours — single document, PRD §7.1, F10.
 * One source feeds three consumers: the open/closed pill, the footer table,
 * and the JSON-LD openingHoursSpecification. No drift.
 */
const openingHours = defineCollection({
  loader: file('./src/content/data/opening-hours.json'),
  schema: z
    .object({
      /** Europe/London so BST is handled rather than assumed away. */
      timezone: z.literal('Europe/London'),
      regular: z
        .array(
          z
            .object({
              day: weekday,
              closed: z.boolean(),
              opens: timeOfDay.optional(),
              closes: timeOfDay.optional(),
            })
            .strict()
            .superRefine((value, ctx) => {
              if (value.closed) return;
              if (!value.opens || !value.closes) {
                ctx.addIssue({
                  code: 'custom',
                  message: 'an open day needs both opens and closes',
                });
                return;
              }
              if (value.opens >= value.closes) {
                ctx.addIssue({
                  code: 'custom',
                  path: ['closes'],
                  message: 'closes must be later than opens',
                });
              }
            }),
        )
        .length(7, 'exactly seven days, monday through sunday'),
      exceptions: z.array(
        z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
            closed: z.boolean(),
            opens: timeOfDay.optional(),
            closes: timeOfDay.optional(),
            note: z.string().min(3),
          })
          .strict(),
      ),
      emergencyNote: z.string().min(20),
      phone: e164Phone,
      /**
       * The live site does not publish opening hours anywhere — that is a gap
       * in the original, not an omission here. The times in the data file are
       * invented placeholders and the page must render them labelled as such.
       */
      isPlaceholder: z.literal(true),
      sourceNote: z.string().min(20),
    })
    .strict(),
});

export const collections = { treatments, testimonials, team, faq, openingHours };
