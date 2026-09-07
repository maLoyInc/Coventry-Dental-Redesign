import { test, expect, type APIRequestContext } from '@playwright/test';
import { BASE_URL } from '../../playwright.config';

/**
 * /api/enquiry against the built Worker — the pipeline in PRD §6.4, in order:
 * parse → Zod → honeypot → Turnstile → rate limit → Resend.
 *
 * Everything up to Resend is deterministic locally. Resend is not: the local
 * Worker has no key, by design, so a valid submission ends at 502. Each test
 * below therefore stops at the gate it is about.
 */

const ORIGIN = BASE_URL;

const VALID = {
  treatmentSlug: 'dental-implants',
  name: 'Test Placeholder',
  phone: '01234 567890',
  email: 'test@example.com',
  preferredTime: 'morning',
  consent: true,
};

/** A JSON post the way the island sends one. */
const postJson = (request: APIRequestContext, body: unknown) =>
  request.post('/api/enquiry', {
    headers: { origin: ORIGIN, 'content-type': 'application/json' },
    data: body,
  });

test.describe('/api/enquiry', () => {
  test('GET is 405 with an Allow header — the form is the only way in', async ({ request }) => {
    const response = await request.get('/api/enquiry');
    expect(response.status()).toBe(405);
    expect(response.headers()['allow']).toBe('POST');
  });

  test('a form POST with no Origin is refused by the CSRF check', async ({ request }) => {
    /*
     * Documenting the trap rather than working around it: this 403 comes from
     * Astro's origin check, before the route runs at all. A browser sends
     * Origin on a same-origin form POST; curl does not, which is why a no-JS
     * test written with curl gets 403 and looks like a broken endpoint.
     *
     * Sent with NO BODY on purpose, and this is not cosmetic. Astro rejects on
     * the missing header without ever reading the request body, and an unread
     * body strands miniflare's internal proxy→worker connection: the next
     * request to reuse it answers 500 "Network connection lost." and
     * `wrangler dev` treats that as fatal and exits, taking the rest of the
     * suite with it. Reproduced consistently, and it is a local-dev bug, not a
     * defect in the endpoint — deployed, nothing reuses that socket. With no
     * body there is nothing left unread, and the assertion is unchanged: the
     * 403 is about the header.
     */
    const response = await request.post('/api/enquiry', {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    expect(response.status()).toBe(403);
  });

  test('an invalid payload is 400 with one message per broken field', async ({ request }) => {
    const response = await postJson(request, {
      treatmentSlug: 'not-a-treatment',
      name: 'x',
      phone: '!!!',
      email: 'jo@localhost',
      preferredTime: 'whenever',
      consent: false,
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(Object.keys(body.errors).sort()).toEqual([
      'consent',
      'email',
      'name',
      'phone',
      'preferredTime',
      'treatmentSlug',
    ]);
    for (const message of Object.values(body.errors) as string[]) {
      expect(message.length).toBeGreaterThan(0);
    }
  });

  test('the schema rejects an undotted domain, matching the client pattern', async ({
    request,
  }) => {
    // type="email" alone accepts this; the markup pattern and the server agree
    // that it is not deliverable.
    const response = await postJson(request, { ...VALID, email: 'jo@localhost', botToken: 'x' });
    expect(response.status()).toBe(400);
    expect((await response.json()).errors).toHaveProperty('email');
  });

  test('an absent field gets a written sentence, not a raw Zod message', async ({ request }) => {
    // The reply's messages are rendered to the reader on the JavaScript-off
    // page, so "Invalid input: expected string, received undefined" is a copy
    // defect, not an internal detail. This posts a body missing the keys
    // entirely rather than sending them empty.
    const response = await request.post('/api/enquiry', {
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      data: { treatmentSlug: 'dental-implants', consent: true },
    });

    expect(response.status()).toBe(400);
    const { errors } = await response.json();
    for (const [field, message] of Object.entries(errors) as [string, string][]) {
      expect(message, `${field} leaked a library message`).not.toMatch(/invalid input|expected/i);
      expect(message[0], `${field} does not read as a sentence`).toBe(message[0]?.toUpperCase());
    }
    expect(errors.name).toBe('Enter your name');
    expect(errors.phone).toBe('Enter a phone number we can call you back on');
  });

  test('a filled honeypot is 400 and never reaches the bot check', async ({ request }) => {
    const response = await postJson(request, { ...VALID, company: 'Acme', botToken: 'x' });
    expect(response.status()).toBe(400);
  });

  test('a JSON post with no Turnstile token is 403', async ({ request }) => {
    // JavaScript is running, so an empty token means the widget was stripped.
    const response = await postJson(request, VALID);
    expect(response.status()).toBe(403);
    expect((await response.json()).message).toMatch(/bot check/i);
  });

  test('a valid submission passes every gate and ends at the send', async ({ request }) => {
    /*
     * 502 is the pass condition. It means parse, Zod, honeypot, Turnstile (the
     * public test key always issues a valid token) and the rate limit all
     * admitted the request, and only Resend refused — because the local Worker
     * deliberately has no key. Anything earlier in the pipeline would be a
     * different status.
     */
    const response = await postJson(request, { ...VALID, botToken: 'XXXX.DUMMY.TOKEN.XXXX' });
    expect(response.status()).toBe(502);
    expect((await response.json()).message).toMatch(/did not send/i);
  });

  test('the sixth submission in an hour is 429 with a countdown', async ({ request }) => {
    /*
     * The gate the KV namespace exists for. Until ENQUIRY_RATE_LIMIT was
     * created and bound, `consume()` fell back to a per-isolate Map — enough to
     * make this pass locally while proving nothing about a deployed Worker,
     * where every isolate gets its own empty Map. With the namespace bound,
     * miniflare simulates the real store and this counts through it.
     *
     * The address is unique to this test and sent as x-forwarded-for, which
     * clientAddress() honours locally. Without that, five submissions here
     * would empty the shared window and the JavaScript-off submission test —
     * different project, same Worker, same loopback address — would 429 for
     * reasons that have nothing to do with what it asserts.
     */
    const address = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;
    const submit = () =>
      request.post('/api/enquiry', {
        headers: {
          origin: ORIGIN,
          'content-type': 'application/json',
          'x-forwarded-for': address,
        },
        data: { ...VALID, botToken: 'XXXX.DUMMY.TOKEN.XXXX' },
      });

    for (let i = 1; i <= 5; i += 1) {
      // 502 is "admitted, and only the send refused" — see the test above.
      expect((await submit()).status(), `submission ${i} of 5 should be admitted`).toBe(502);
    }

    const refused = await submit();
    expect(refused.status()).toBe(429);

    // Retry-After is what tells a caller when to come back, so it has to be a
    // real remaining time rather than a constant.
    const retryAfter = Number(refused.headers()['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(3600);
  });

  test('the reply never sets a cookie or caches', async ({ request }) => {
    // PRD §7.2 — the endpoint keeps no personal data and nothing about a
    // submission may be stored by an intermediary.
    const response = await postJson(request, VALID);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers()['set-cookie']).toBeUndefined();
  });
});
