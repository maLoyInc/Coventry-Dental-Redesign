/**
 * The one shared store (PRD §6.3).
 *
 * Two islands need to agree on a single value — which treatment the reader was
 * looking at when they decided to enquire. TreatmentCard writes it, EnquiryForm
 * reads it and pre-fills its select (PRD §5.1 step 7).
 *
 * This is a module, not a state container: Astro bundles every component script
 * into one graph, so both islands import the same instance. That is the whole
 * mechanism — no framework, no context, no global object on `window`.
 *
 * Client-only. Nothing here runs at build time.
 */
import { TREATMENT_SLUGS, type TreatmentSlug } from './slugs';

type Listener = (slug: TreatmentSlug) => void;

const listeners = new Set<Listener>();

/** The last treatment the reader expressed interest in, or null. */
let interest: TreatmentSlug | null = null;

/** Narrow an untrusted string (a URL hash, a data attribute) to a real slug. */
export function asTreatmentSlug(value: string | null | undefined): TreatmentSlug | null {
  if (!value) return null;
  return (TREATMENT_SLUGS as readonly string[]).includes(value)
    ? (value as TreatmentSlug)
    : null;
}

/** Set the interest and notify. Repeat writes of the same slug are dropped. */
export function setTreatmentInterest(slug: TreatmentSlug): void {
  if (interest === slug) return;
  interest = slug;
  for (const listener of listeners) listener(slug);
}

/**
 * Subscribe to changes. Fires immediately if a value is already set, so a late
 * subscriber cannot miss a write that happened during page load.
 */
export function onTreatmentInterest(listener: Listener): void {
  listeners.add(listener);
  if (interest) listener(interest);
}
