import type { CollectionEntry } from 'astro:content';
import type { OpeningHours, OpeningDay } from './types';
import type { Practice } from '../data/practice';

/**
 * The one `Dentist` JSON-LD block — PRD §7.4.
 *
 * Built from the same three sources the visible page is built from: the
 * practice facts, the TeamMember record and the OpeningHours document. Nothing
 * here is typed out a second time, so the markup and the page cannot disagree
 * — which is the entire reason §7.4 asks for it to be generated rather than
 * hand-written.
 *
 * Three things are deliberately absent:
 *
 * `aggregateRating` — §7.4 rules it out by name. The three testimonials are
 * placeholder copy; a rating derived from invented reviews would be a
 * fabricated factual claim, and the fact that a machine rather than a person
 * reads it makes that worse, not better.
 *
 * `review` — same reason.
 *
 * Prices. The treatment records carry indicative "from" figures that the page
 * shows with a visible caveat ("subject to a clinical assessment"). An
 * `Offer.priceSpecification` carries no caveat with it: it is read as a
 * quoted price for a real business. The services are listed by name; what they
 * cost stays on the page where the caveat is attached to it.
 *
 * The opening hours ARE emitted, because §7.4 asks for them and one source
 * feeding three consumers is the point of the OpeningHours document. They are
 * placeholder values, which a machine cannot see the "indicative" label for —
 * so `disambiguatingDescription` says so in the markup itself, and the page
 * ships `noindex, nofollow` besides.
 */

const DAY_URI: Record<OpeningDay['day'], string> = {
  monday: 'https://schema.org/Monday',
  tuesday: 'https://schema.org/Tuesday',
  wednesday: 'https://schema.org/Wednesday',
  thursday: 'https://schema.org/Thursday',
  friday: 'https://schema.org/Friday',
  saturday: 'https://schema.org/Saturday',
  sunday: 'https://schema.org/Sunday',
};

interface HoursSpec {
  '@type': 'OpeningHoursSpecification';
  dayOfWeek?: string | string[];
  opens: string;
  closes: string;
  validFrom?: string;
  validThrough?: string;
}

/**
 * Schema.org has no "closed" flag; a zero-length window is how a closed day is
 * stated. Omitting the day instead would be ambiguous — it reads as "unknown",
 * not "shut".
 */
const CLOSED = { opens: '00:00', closes: '00:00' } as const;

/**
 * Consecutive days with identical hours collapse into one entry with a
 * `dayOfWeek` array. Seven near-identical objects would say the same thing at
 * three times the size.
 */
function groupWeek(regular: readonly OpeningDay[]): HoursSpec[] {
  const specs: HoursSpec[] = [];

  for (const day of regular) {
    const window = day.closed || !day.opens || !day.closes
      ? CLOSED
      : { opens: day.opens, closes: day.closes };

    const previous = specs.at(-1);
    if (previous && previous.opens === window.opens && previous.closes === window.closes) {
      const existing = previous.dayOfWeek;
      previous.dayOfWeek = Array.isArray(existing)
        ? [...existing, DAY_URI[day.day]]
        : [existing as string, DAY_URI[day.day]];
      continue;
    }

    specs.push({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: DAY_URI[day.day],
      ...window,
    });
  }

  return specs;
}

/** Dated one-offs — closures and early closes — as their own specifications. */
function exceptionSpecs(exceptions: OpeningHours['exceptions']): HoursSpec[] {
  return exceptions.map((exception) => ({
    '@type': 'OpeningHoursSpecification',
    ...(exception.closed || !exception.opens || !exception.closes
      ? CLOSED
      : { opens: exception.opens, closes: exception.closes }),
    validFrom: exception.date,
    validThrough: exception.date,
  }));
}

export interface DentistJsonLdInput {
  practice: Practice;
  clinician: CollectionEntry<'team'>['data'];
  hours: OpeningHours;
  treatments: readonly { name: string }[];
  geo: { latitude: number; longitude: number };
  /** Absolute URL of the page. */
  pageUrl: string;
  /** Absolute URL of the hero image, or undefined if the hero ships no image. */
  imageUrl?: string;
}

export function buildDentistJsonLd(input: DentistJsonLdInput): Record<string, unknown> {
  const { practice, clinician, hours, treatments, geo, pageUrl, imageUrl } = input;

  const qualifications = clinician.qualifications.map((qualification) => ({
    '@type': 'EducationalOccupationalCredential',
    name: qualification,
  }));

  return {
    '@context': 'https://schema.org',
    '@type': 'Dentist',
    '@id': `${pageUrl}#practice`,
    name: practice.name,
    alternateName: practice.wordmark,
    url: pageUrl,
    telephone: practice.phone.e164,
    email: practice.email,
    ...(imageUrl ? { image: imageUrl } : {}),

    /**
     * The honest label, in the markup rather than only in the banner. This is
     * an unaffiliated concept and the hours below are invented; anything that
     * reads this block deserves to be told both.
     */
    disambiguatingDescription:
      'Unaffiliated design concept, not the practice\u2019s own website and not ' +
      'endorsed by it. Business name, address and telephone number are ' +
      'factual; the opening hours are placeholder values because the ' +
      'practice does not publish them.',

    address: {
      '@type': 'PostalAddress',
      streetAddress: practice.address.street,
      addressLocality: practice.address.locality,
      postalCode: practice.address.postalCode,
      addressCountry: practice.address.country,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: geo.latitude,
      longitude: geo.longitude,
    },
    hasMap: practice.directionsUrl,
    areaServed: {
      '@type': 'City',
      name: practice.address.locality,
    },

    openingHoursSpecification: [
      ...groupWeek(hours.regular),
      ...exceptionSpecs(hours.exceptions),
    ],

    employee: {
      '@type': 'Person',
      name: clinician.name,
      jobTitle: clinician.role,
      ...(clinician.gdcNumber ? { identifier: clinician.gdcNumber } : {}),
      ...(qualifications.length ? { hasCredential: qualifications } : {}),
    },

    /** Names only. See the note on prices at the top of this file. */
    availableService: treatments.map((treatment) => ({
      '@type': 'MedicalProcedure',
      name: treatment.name,
    })),
  };
}

/**
 * Serialise for embedding in `<script type="application/ld+json">`.
 *
 * A `</script>` inside any string value would close the tag early, and `<!--`
 * would open a comment; both are ordinary characters to JSON.stringify. The
 * escapes below are read back as `<`, `>` and `&` by any JSON parser, so the
 * data is unchanged — only the bytes in the HTML are.
 *
 * Nothing on this page contains those sequences today. This is here so that
 * nothing ever can, including a value someone adds to a content file later.
 */
export function serialiseJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\u003c')
    .replaceAll('>', '\u003e')
    .replaceAll('&', '\u0026');
}
