import type { APIRoute } from 'astro';
import { getImageCredits, type ImageCredit } from '../lib/content';
import { practice } from '../data/practice';

/**
 * /CREDITS.md — PRD §2.3.
 *
 * "Every image carries licence, source URL, and credit. /CREDITS.md is
 * generated from those fields at build time so it cannot drift."
 *
 * A prerendered route rather than a checked-in file or a separate script,
 * which is what makes that last clause true: the credits are produced by the
 * same build that produces the page, from the same validated records. An image
 * cannot reach the page without appearing here, because the schema will not
 * let it exist without the fields this file prints.
 *
 * `output: 'static'`, so this is written once to dist/CREDITS.md and served as
 * a file. It is not the enquiry endpoint and does not opt out of prerendering.
 */

const escapeCell = (value: string): string => value.replace(/\|/g, '\|');

const link = (credit: ImageCredit): string =>
  credit.sourceUrl ? `[Source](${credit.sourceUrl})` : '—';

/**
 * Grouped so a licensing question is answered by reading one section.
 * Returns null rather than an empty string for an unused licence, because ''
 * is a meaningful entry in the block list below — it is a blank line.
 */
function section(title: string, note: string, credits: ImageCredit[]): string | null {
  if (credits.length === 0) return null;

  const rows = credits
    .map(
      (credit) =>
        `| ${escapeCell(credit.usedIn)} | \`${credit.file}\` | ${credit.width}×${credit.height} | ` +
        `${escapeCell(credit.credit)} | ${link(credit)} |`,
    )
    .join('\n');

  return [
    `## ${title}`,
    '',
    note,
    '',
    '| Used in | File | Dimensions | Credit | Source |',
    '| --- | --- | --- | --- | --- |',
    rows,
    '',
  ].join('\n');
}

export const GET: APIRoute = async () => {
  const credits = await getImageCredits();

  const byLicence = <T extends ImageCredit['licence']>(licence: T) =>
    credits.filter((credit) => credit.licence === licence);

  const body = [
    '# Credits',
    '',
    `Generated at build time from the image records in \`src/content\` and`,
    '`src/data/images.ts`. Do not edit by hand — edit the record and rebuild.',
    '',
    `**This is an unsolicited design concept** for ${practice.name}. It is not`,
    'commissioned, reviewed, or endorsed by the practice, by Dr Jag Shergill, or',
    'by any related party. The practice name, address, telephone number and',
    'email address are factual details reproduced from public sources. Nothing',
    "else on the page is the practice's work.",
    '',
    '## Not reproduced',
    '',
    "- **Logo and brand marks.** A neutral wordmark is used instead.",
    '- **Media logos** (BBC, The Times, and any others). Press coverage renders',
    '  as plain text. The `mediaMentions` schema has no `logo` field, so adding',
    '  one fails the build rather than failing review.',
    '- **Photography from the live site.** Every image below is licensed stock',
    '  or map data, fetched by a script in /scripts that records where it came',
    '  from. Nothing is taken from the practice.',
    '- **A portrait of the clinician.** No photograph of Dr Shergill appears.',
    '  A stock face under the name of a real, identifiable person is a picture',
    '  of somebody else presented as him, which a caption does not undo. The',
    '  block shows his initials instead.',
    '',
    '## Text',
    '',
    '- **Testimonials** are placeholder copy at realistic length. No real',
    '  patient words appear anywhere. Every record carries `isPlaceholder: true`',
    '  as a literal, so writing `false` fails the build.',
    '- **Opening hours** are placeholder values. The live site does not publish',
    '  hours at all; that is a gap in the original, and the page labels the',
    '  times it shows as indicative.',
    '- **Prices** are indicative "from" figures shown with a visible caveat and',
    '  are deliberately absent from the structured data, where no caveat could',
    '  travel with them.',
    '- **GDC number** is omitted rather than invented.',
    '',
    section(
      'Licensed stock photography',
      'Free to use under the licence named. Attribution is not required by the ' +
        'Unsplash or Pexels licences; it is recorded and displayed anyway.',
      [...byLicence('unsplash'), ...byLicence('pexels')],
    ),
    section(
      'Map data',
      'Map tiles rendered from OpenStreetMap data. **Attribution is required** ' +
        'under the ODbL and is displayed beside the map on the page. See ' +
        'https://osm.org/copyright. Generated once by ' +
        '`scripts/fetch-map-asset.mjs`; the build itself makes no network calls.',
      byLicence('openstreetmap'),
    ),
    '## Licence summary',
    '',
    ...[...new Set(credits.map((credit) => credit.licence))].map((licence) => {
      const label = credits.find((credit) => credit.licence === licence)!.licenceLabel;
      const count = credits.filter((credit) => credit.licence === licence).length;
      return `- **${label}** — ${count} ${count === 1 ? 'asset' : 'assets'}`;
    }),
    '',
    '## Alt text',
    '',
    'Recorded here because it is content, not decoration, and because the',
    'schema requires it: an image without alt text cannot be added.',
    '',
    ...credits.map((credit) => `- **${credit.usedIn}** — ${credit.alt}`),
    '',
  ]
    .filter((part): part is string => part !== null)
    .join('\n');

  return new Response(`${body}\n`, {
    headers: { 'content-type': 'text/markdown; charset=utf-8' },
  });
};
