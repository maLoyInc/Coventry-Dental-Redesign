import type { APIContext, APIRoute } from 'astro';
import { Resend } from 'resend';

import { enquiryServerSchema, fieldErrors, type EnquirySubmission } from '../../lib/enquiry';
import { practice } from '../../data/practice';
import { consume, hashClientAddress, LIMIT } from '../../lib/rate-limit';
import { missingConfig, readServerEnv, type ServerEnv } from '../../lib/runtime-env';

/**
 * /api/enquiry — the one dynamic route on an otherwise static site (PRD §6.1).
 *
 * The pipeline is PRD §6.4, in that order:
 *
 *   parse → schema → honeypot → bot check → rate limit → email → 200
 *
 * Nothing is written to a database, because there isn't one (PRD §7.2). The
 * email in the practice inbox is the record, and it lives under a retention
 * policy the practice already operates.
 *
 * Two callers, one route. The island POSTs JSON and reads JSON back. A browser
 * with JavaScript off POSTs `application/x-www-form-urlencoded` and gets an
 * HTML page, because that is the only thing it can render (PRD §5.1, §2.2).
 * `wantsJson` is the only thing that differs between them.
 */
export const prerender = false;

/** The practice number, written the way the page writes it. */
const { display: PHONE_DISPLAY, e164: PHONE_E164 } = practice.phone;

/**
 * The one thing every failure state has to say (PRD §5.1 step 8).
 *
 * Added by each surface exactly once, never baked into `message`. The island
 * writes `message` into a status line that already sits directly above "Prefer
 * to talk? Call 024 7645 4350"; the HTML page below prints this under it. A
 * message carrying its own copy said it twice on that page.
 */
const CALL_FALLBACK = `If it is easier, or you are in pain now, call ${PHONE_DISPLAY}.`;

/* ---------------------------------------------------------------------------
 * Responses
 * ------------------------------------------------------------------------ */

interface Reply {
  status: number;
  /** Sentence for the status line under the submit button. */
  message: string;
  /** Per-field messages, painted into the island's error slots. */
  errors?: Record<string, string>;
  /** Heading for the no-JavaScript HTML page. */
  heading: string;
  headers?: Record<string, string>;
}

const escape = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

/**
 * The JavaScript-off reply. A whole document, inline styles, no build step —
 * this page is served by a Worker and cannot reach the site's stylesheet
 * without shipping a second request the reader is waiting on.
 */
function htmlReply(reply: Reply, ok: boolean): Response {
  const list = Object.values(reply.errors ?? {});

  const body = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escape(reply.heading)} — ${escape(practice.wordmark)}</title>
<style>
  :root { color-scheme: light }
  body { margin: 0; padding: 2.5rem 1.25rem; background: #fff; color: #10262d;
         font: 1rem/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif }
  main { max-width: 34rem; margin-inline: auto }
  h1 { font-size: 1.75rem; line-height: 1.15; letter-spacing: -0.015em; margin: 0 0 1rem }
  ul { margin: 0 0 1.25rem; padding-left: 1.25rem; color: #991b1b; font-weight: 600 }
  a.btn { display: inline-flex; align-items: center; min-height: 3rem; padding: 0.75rem 1.5rem;
          margin-top: 0.5rem; margin-right: 0.5rem; border-radius: 0.5rem; font-weight: 600;
          text-decoration: none; background: #1f4955; color: #fff; border: 2px solid #1f4955 }
  a.btn.secondary { background: transparent; color: #193e47; border-color: #3a7285 }
  p.note { color: #4a5f66 }
  :focus-visible { outline: 3px solid #3a7285; outline-offset: 2px }
</style>
</head>
<body>
<main>
  <h1>${escape(reply.heading)}</h1>
  <p>${escape(reply.message)}</p>
  ${list.length > 0 ? `<ul>${list.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : ''}
  <p class="note">${escape(CALL_FALLBACK)}</p>
  <a class="btn" href="tel:${escape(PHONE_E164)}">Call ${escape(PHONE_DISPLAY)}</a>
  <a class="btn secondary" href="/#enquire">${ok ? 'Back to the page' : 'Back to the form'}</a>
</main>
</body>
</html>`;

  return new Response(body, {
    status: reply.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      ...reply.headers,
    },
  });
}

function jsonReply(reply: Reply, ok: boolean): Response {
  return new Response(
    JSON.stringify({ ok, message: reply.message, errors: reply.errors ?? {} }),
    {
      status: reply.status,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        ...reply.headers,
      },
    },
  );
}

const respond = (reply: Reply, wantsJson: boolean, ok = reply.status < 400): Response =>
  wantsJson ? jsonReply(reply, ok) : htmlReply(reply, ok);

/* ---------------------------------------------------------------------------
 * Request reading
 * ------------------------------------------------------------------------ */

interface ParsedBody {
  raw: Record<string, unknown>;
  wantsJson: boolean;
  readable: boolean;
}

async function readBody(request: Request): Promise<ParsedBody> {
  const contentType = request.headers.get('content-type') ?? '';
  const wantsJson = contentType.includes('application/json');

  try {
    if (wantsJson) {
      const parsed: unknown = await request.json();
      const raw =
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : {};
      return { raw, wantsJson, readable: true };
    }

    const form = await request.formData();
    const raw = Object.fromEntries(form) as Record<string, unknown>;

    // An unchecked checkbox is absent from the payload rather than false, and a
    // checked one carries its `value`. Both become the boolean the schema wants.
    raw.consent = raw.consent === 'true' || raw.consent === 'on';

    return { raw, wantsJson, readable: true };
  } catch {
    return { raw: {}, wantsJson, readable: false };
  }
}

/**
 * The address the rate limit counts against.
 *
 * `CF-Connecting-IP` is set by Cloudflare's edge and cannot be spoofed through
 * it; `x-forwarded-for` is client-controlled and is only a local-development
 * convenience. Neither is stored — see rate-limit.ts.
 */
function clientAddress(context: APIContext): string {
  const header =
    context.request.headers.get('cf-connecting-ip') ??
    context.request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();

  if (header) return header;

  try {
    return context.clientAddress;
  } catch {
    // No adapter-provided address, e.g. a direct `astro dev` request. Every
    // such caller shares one bucket, which is the safe direction to err in.
    return 'unknown';
  }
}

/* ---------------------------------------------------------------------------
 * Bot check (PRD §6.5)
 * ------------------------------------------------------------------------ */

async function verifyTurnstile(
  token: string,
  secret: string,
  remoteip: string,
): Promise<boolean> {
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (remoteip !== 'unknown') body.append('remoteip', remoteip);

  try {
    const response = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      { method: 'POST', body },
    );
    const result = (await response.json()) as {
      success?: boolean;
      'error-codes'?: string[];
    };

    if (result.success !== true) {
      // Without this line every bot-check failure looks identical from the
      // outside, and the two causes need opposite fixes: `invalid-input-response`
      // is a spent, forged or expired token — the caller's problem, and the
      // 403 is correct. `invalid-input-secret` is *ours*: the deployed
      // TURNSTILE_SECRET_KEY is not the pair of the site key in the page, so
      // every real person is turned away too. Codes only, never the token.
      console.warn(
        `[api/enquiry] Turnstile refused: ${(result['error-codes'] ?? ['(no code)']).join(', ')}`,
      );
    }

    return result.success === true;
  } catch {
    // Turnstile being unreachable is not evidence the caller is a person.
    return false;
  }
}

/* ---------------------------------------------------------------------------
 * Email (PRD §7.2 — the email is the record)
 * ------------------------------------------------------------------------ */

/**
 * Treatment names live in the content collections, which this endpoint cannot
 * read at request time. Rather than keep a second copy of the names here and
 * let it drift, the slug is written out as-is and lightly humanised. It is
 * already legible: "dental-implants".
 */
const readableSlug = (slug: string): string => slug.replace(/-/g, ' ');

async function sendEnquiry(env: ServerEnv, submission: EnquirySubmission): Promise<boolean> {
  const resend = new Resend(env.RESEND_API_KEY);

  const lines = [
    'CONCEPT SITE — this enquiry came from an unsolicited design concept, not',
    'from the practice’s own website. It is not a real patient enquiry unless',
    'you sent it yourself while testing.',
    '',
    `Treatment:      ${readableSlug(submission.treatmentSlug)}`,
    `Name:           ${submission.name}`,
    `Phone:          ${submission.phone}`,
    `Email:          ${submission.email}`,
    `Preferred call: ${submission.preferredTime}`,
    `Consent given:  yes`,
    `Submitted:      ${submission.submittedAt}`,
    '',
    'Nothing about this enquiry is stored anywhere. This email is the only',
    'copy (PRD §7.2).',
  ];

  const { error } = await resend.emails.send({
    from: env.ENQUIRY_FROM_EMAIL,
    to: [env.ENQUIRY_TO_EMAIL],
    // So a reply goes to the person who asked, not into the void.
    replyTo: submission.email,
    subject: `[Concept] Callback request — ${readableSlug(submission.treatmentSlug)}`,
    text: lines.join('\n'),
  });

  if (error) {
    // The message, never the payload: the payload is the patient's details.
    console.error('[api/enquiry] Resend rejected the send:', error.message);
    return false;
  }

  return true;
}

/* ---------------------------------------------------------------------------
 * Route
 * ------------------------------------------------------------------------ */

export const POST: APIRoute = async (context) => {
  const { raw, wantsJson, readable } = await readBody(context.request);

  if (!readable) {
    return respond(
      {
        status: 400,
        heading: 'That did not arrive in one piece',
        message: 'We could not read that submission. Please try again.',
      },
      wantsJson,
    );
  }

  const env = readServerEnv();
  const missing = missingConfig(env);

  if (missing.length > 0) {
    // Deliberately not named in the response: a misconfiguration is ours to
    // fix, and listing our own missing secrets to the public is not help.
    console.error(`[api/enquiry] not configured — missing: ${missing.join(', ')}`);
    return respond(
      {
        status: 503,
        heading: 'The form is not available right now',
        message: 'This form is temporarily unavailable. Nothing was sent.',
      },
      wantsJson,
    );
  }

  /* 1. Schema. The server's copy is the only definition of valid. */
  const parsed = enquiryServerSchema.safeParse(raw);

  if (!parsed.success) {
    return respond(
      {
        status: 400,
        heading: 'A few answers need checking',
        message: 'Some answers need checking before we can send this.',
        errors: fieldErrors(parsed.error),
      },
      wantsJson,
    );
  }

  const { botToken, company, ...enquiry } = parsed.data;

  /* 2. Honeypot. Free, and it runs before anything that costs a round trip. */
  if (company !== '') {
    // Rejected rather than silently dropped. A silent drop shows a confirmation
    // to whoever tripped it — and if that is ever a real person with an
    // over-eager autofill, they would wait for a callback that is not coming.
    return respond(
      {
        status: 400,
        heading: 'We could not send that',
        message: 'We could not send that automatically.',
      },
      wantsJson,
    );
  }

  const address = clientAddress(context);

  /* 3. Bot check. */
  if (botToken !== '') {
    if (!(await verifyTurnstile(botToken, env.TURNSTILE_SECRET_KEY, address))) {
      return respond(
        {
          status: 403,
          heading: 'The bot check did not pass',
          message: 'The bot check did not pass. Please reload the page and try again.',
        },
        wantsJson,
      );
    }
  } else if (wantsJson) {
    // JavaScript is running, so Turnstile should have produced a token. An
    // empty one means the widget failed to load or was stripped.
    return respond(
      {
        status: 403,
        heading: 'The bot check did not run',
        message: 'The bot check did not finish loading. Please reload the page and try again.',
      },
      wantsJson,
    );
  }
  // The remaining case — a form POST with no token — is the JavaScript-off
  // path. Turnstile cannot run there, so the honeypot above and the rate limit
  // below are the whole defence. That is weaker, and it is the accepted cost
  // of the form working without JavaScript (PRD §2.2).

  /* 4. Rate limit (PRD §6.4: hashed IP, 1h TTL). */
  const key = await hashClientAddress(address, env.ENQUIRY_IP_SALT);
  const limit = await consume(env.ENQUIRY_RATE_LIMIT, key);

  if (limit.usedFallback) {
    console.warn(
      '[api/enquiry] ENQUIRY_RATE_LIMIT is not bound — counting in memory, ' +
        'which is per-isolate and not a real limit.',
    );
  }

  if (!limit.allowed) {
    return respond(
      {
        status: 429,
        heading: 'That is a few too many',
        message: `We have had ${LIMIT} enquiries from this connection in the last hour.`,
        headers: { 'retry-after': String(limit.retryAfterSeconds) },
      },
      wantsJson,
    );
  }

  /* 5. Send. */
  const submission: EnquirySubmission = { ...enquiry, submittedAt: new Date().toISOString() };

  if (!(await sendEnquiry(env, submission))) {
    return respond(
      {
        status: 502,
        heading: 'That did not send',
        message: 'Sorry — that did not send. Please try again.',
      },
      wantsJson,
    );
  }

  return respond(
    {
      status: 200,
      heading: 'Thank you — that is with us',
      message:
        'We will call you back within one working day to arrange a time. There is no cost and no commitment at this stage.',
    },
    wantsJson,
  );
};

/** Anything that is not a POST. The form is the only way in. */
export const ALL: APIRoute = () =>
  new Response(null, {
    status: 405,
    headers: { allow: 'POST', 'cache-control': 'no-store' },
  });
