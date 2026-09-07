/**
 * Presentation helpers.
 *
 * Kept out of the components so that "£12,000" and "9.00am" are written once.
 * Everything here is pure: same input, same output, no I/O, no dates read from
 * the machine running the build.
 */

const gbp = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

/** 12000 → "£12,000". Whole pounds; these are indicative from-prices. */
export function formatPrice(pounds: number): string {
  return gbp.format(pounds);
}

/** "monday" → "Monday". */
export function formatDay(day: string): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/**
 * "09:00" → "9.00am", "17:30" → "5.30pm".
 *
 * UK convention uses a full stop rather than a colon, and screen readers cope
 * with it. The machine-readable form goes in <time datetime> instead.
 *
 * Not exported: formatHours below is the only caller, and the components ask
 * for a whole day rather than half of one.
 */
function formatTime(time: string): string {
  const [rawHour, minute] = time.split(':');
  const hour24 = Number(rawHour);
  const suffix = hour24 < 12 ? 'am' : 'pm';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}.${minute}${suffix}`;
}

/** "09:00"–"17:30" → "9.00am to 5.30pm", or "Closed". */
export function formatHours(
  day: { closed: boolean; opens?: string; closes?: string },
): string {
  if (day.closed || !day.opens || !day.closes) return 'Closed';
  return `${formatTime(day.opens)} to ${formatTime(day.closes)}`;
}

/**
 * "+442476454350" → "tel:+442476454350".
 * Trivial, but it keeps every call link identical and E.164 (PRD F3).
 */
export function telHref(e164: string): string {
  return `tel:${e164}`;
}
