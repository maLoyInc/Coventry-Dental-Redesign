import { z } from 'astro/zod';

/**
 * Factual practice details (name, address, phone, email).
 *
 * PRD §2.3: business facts are the one thing reused from the live site — they
 * are fact, not creative work. Everything here was taken from
 * coventrydental.co.uk. Opening hours are deliberately NOT here: they live in
 * the openingHours content collection because the live site never publishes
 * them and the values in use are placeholders that must be labelled as such.
 *
 * This is parsed at module load, so a bad value fails the build in the same
 * way a content-collection failure does.
 */
const practiceSchema = z
  .object({
    name: z.string().min(3),
    /** Neutral wordmark text. The practice's real logo is not reproduced. */
    wordmark: z.string().min(3),
    phone: z.object({
      /** E.164, for tel: links. */
      e164: z.string().regex(/^\+[1-9]\d{7,14}$/),
      /** How it is written on the page. */
      display: z.string().min(7),
    }),
    email: z.email(),
    address: z.object({
      street: z.string().min(3),
      locality: z.string().min(3),
      postalCode: z.string().min(5),
      country: z.string().length(2),
    }),
    /** Google Maps directions target, built from the address. */
    directionsUrl: z.url(),
  })
  .strict();

export const practice = practiceSchema.parse({
  name: 'The Coventry & Warwickshire Centre for Advanced Dentistry',
  wordmark: 'Coventry Dental',
  phone: {
    e164: '+442476454350',
    display: '024 7645 4350',
  },
  email: 'info@coventrydental.co.uk',
  address: {
    street: '106 Marlborough Road',
    locality: 'Coventry',
    postalCode: 'CV2 4ER',
    country: 'GB',
  },
  directionsUrl:
    'https://www.google.com/maps/dir/?api=1&destination=106+Marlborough+Road+Coventry+CV2+4ER',
});

export type Practice = z.infer<typeof practiceSchema>;
