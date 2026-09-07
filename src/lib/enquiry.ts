import { z } from 'astro/zod';
import {
  PREFERRED_TIMES,
  TREATMENT_SLUGS,
  type PreferredTime,
  type TreatmentSlug,
} from './slugs';

// Re-exported so callers have one import for "the enquiry contract".
export { PREFERRED_TIMES, TREATMENT_SLUGS };
export type { PreferredTime, TreatmentSlug };

/**
 * EnquirySubmission — PRD §7.2.
 *
 * SERVER ONLY. This module is imported by /api/enquiry and by nothing that
 * ships to a browser: it builds Zod schemas at module scope, so importing it
 * from an island drags the whole Zod runtime into the bundle (measured: 77 KB).
 *
 * The client used to import it, on the reading of PRD §6.4 that the two sides
 * must share a schema module. They now share the wire instead — the endpoint
 * returns per-field messages and the island paints them into the same slots
 * its own markup constraints use. This schema stays the single definition of
 * what "valid" means; it is simply no longer duplicated in front of the user.
 *
 * Nothing here is persisted. The submission exists only to trigger a human
 * callback; the email in the practice inbox is the record. See PRD §7.2 for
 * why a database is deliberately absent.
 */

/**
 * Five fields plus consent (PRD §3.7). Every extra field costs completions,
 * so additions need a reason that outweighs that.
 *
 * The messages are user-facing: they are what the endpoint sends back and what
 * the reader sees under the field. Keep them in the second person and specific.
 */
const enquirySchema = z.object({
  treatmentSlug: z.enum(TREATMENT_SLUGS, {
    message: 'Choose the treatment you are interested in',
  }),
  // The `error` on each z.string() covers the case where the key is absent
  // rather than empty. Without it Zod answers "Invalid input: expected string,
  // received undefined", and that sentence is user-facing — it is rendered
  // into the error list on the JavaScript-off reply page. A browser form always
  // sends every field, so only a hand-built POST reaches it, but a reader who
  // gets there deserves the same sentence as everyone else.
  name: z
    .string({ error: 'Enter your name' })
    .trim()
    .min(2, 'Enter your name')
    .max(80, 'Name is too long'),
  phone: z
    .string({ error: 'Enter a phone number we can call you back on' })
    .trim()
    .min(7, 'Enter a phone number we can call you back on')
    .max(20, 'Phone number is too long')
    // Deliberately permissive: UK numbers get written a dozen ways and
    // rejecting a real number costs more than accepting an odd one. The
    // form's `pattern` attribute is the same shape.
    .regex(/^[\d\s()+-]+$/, 'Use digits, spaces, and + ( ) - only'),
  email: z.email('Enter a valid email address').trim().max(120),
  preferredTime: z.enum(PREFERRED_TIMES, {
    message: 'Choose when we should call',
  }),
  consent: z.literal(true, {
    message: 'We need your permission to contact you about this enquiry',
  }),
});

/**
 * The five fields plus consent, as the endpoint sees them. Not exported:
 * EnquirySubmission below is what the endpoint actually handles, and the base
 * schema is only ever extended, never parsed on its own.
 */
type EnquiryInput = z.infer<typeof enquirySchema>;

/**
 * What arrives on the wire: the fields above, plus two anti-spam carriers.
 *
 * Neither carrier is validated for *content* here, only for shape. Whether an
 * empty `botToken` is acceptable depends on how the request arrived — a
 * JavaScript-off POST cannot produce one — and that is a policy decision the
 * endpoint makes, with its own status code, not something a schema can rule on.
 */
export const enquiryServerSchema = enquirySchema.extend({
  /** Turnstile response token. Empty on the JavaScript-off path. */
  botToken: z.string().max(4096).default(''),
  /** Honeypot. Any content at all means this was not filled in by a person. */
  company: z.string().max(200).default(''),
});


/** The record handed to the email template. `submittedAt` is server-set. */
export type EnquirySubmission = EnquiryInput & {
  submittedAt: string;
};

/**
 * Zod issues, flattened to one message per field — the shape the island paints
 * into its error slots.
 *
 * First issue only. Three complaints about one field is noise: fix the first
 * and the next one appears.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field !== 'string' || field in errors) continue;
    errors[field] = issue.message;
  }

  return errors;
}
