import type { CollectionEntry } from 'astro:content';

/**
 * The shared ImageRef shape (PRD §7.1), derived from the schema rather than
 * re-declared next to it. If the schema gains or loses a provenance field,
 * every component that takes an image fails to compile until it agrees.
 */
export type ImageRef = CollectionEntry<'treatments'>['data']['image'];

/** The single opening-hours document, already sorted into calendar order. */
export type OpeningHours = CollectionEntry<'openingHours'>['data'];

/** One day in that document. */
export type OpeningDay = OpeningHours['regular'][number];
