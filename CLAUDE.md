# Coventry Dental Redesign — Project Context

An unsolicited landing page redesign concept for The Coventry & Warwickshire
Centre for Advanced Dentistry. Portfolio piece, not client work, not
affiliated with the practice.

Live: https://coventry-dental-concept.yuwenzx.workers.dev

The original PRD is no longer in the repo. Every constraint it carried that
still governs the code is written out below; there is nothing else to read.

## Stack

Astro 7.3.1 · TypeScript 6.0.3 (strict) · Tailwind 4.3.3 (@tailwindcss/vite)
@astrojs/cloudflare 14.3.0 · zod · sharp · resend

`output: 'static'`. `/api/enquiry` alone sets `prerender = false`.
Deployed as a **Worker**, not Pages — Astro 7 + adapter 14 emit a Worker with
a static-assets binding, so it is `wrangler deploy` onto a `workers.dev`
subdomain.

## Commands

    npm run dev
    npm run build      # astro check && astro build
    npm run verify     # build → Lighthouse gate → 51 Playwright tests
    npm run deploy     # verify, then wrangler deploy — only if all three pass

## Business data (real, from the live site — never invent)

- phone `+442476454350`, displayed 024 7645 4350
- 106 Marlborough Road, Coventry CV2 4ER, UK
- info@coventrydental.co.uk
- **Opening hours are not published on the source site.** The values in
  `opening-hours.json` are placeholders, labelled "indicative" on the page,
  with a `sourceNote` recording that this is a gap in the original.

## Standing rules

These are load-bearing. Several are enforced by schemas that fail the build.

- Never invent a patient quote, a real price, or a GDC number. `gdcNumber` is
  optional and empty for exactly this reason.
- **Media logos are never reproduced.** Press coverage renders as text;
  `mediaMentions` has no `logo` field and the schema is `.strict()`.
- **The clinician has no portrait** — a monogram derived from `name`, rendered
  as text. A stock face under a real dentist's name is a picture of somebody
  else presented as him, and a caption does not undo the first impression. The
  `team` schema has no `portrait` field.
- Stock imagery only, with `licence`, `sourceUrl` and `credit` on every image.
  `licence: 'placeholder'` no longer exists as a value, so an image without a
  source URL cannot be described.
- Check stock photographs of branded devices for rival wordmarks. The first
  Invisalign candidate had a competitor's mark moulded into the case, dead
  centre, on a card headed "Invisalign".
- ODbL requires visible attribution for the map. A `superRefine` demands the
  credit string name OpenStreetMap.
- No background video, no Maps JS, no analytics, no chat widget.
- Never touch the practice's real domain or infrastructure.
- `noindex, nofollow` ships on purpose. Do not "fix" it.
- Report measured numbers, never "optimized for performance".

## Out of scope

Multi-page rebuild · real booking calendar · CMS · patient or clinical data ·
payment processing · chat · blog · multi-language · A/B infrastructure.

## Requirements the code still has to meet

Fourteen behaviours, all currently passing, all covered by Playwright:

Primary CTA in the first viewport at every breakpoint · booking reachable from
any scroll position (sticky bottom bar on mobile, header CTA on desktop) ·
a separate emergency `tel:` path · nav ≤ 5 items, no submenus, anchors only ·
exactly four treatment cards · clinician block with name, years,
qualifications, press-as-text · five form fields and no more · inline
validation on blur, announced to assistive tech · confirmation state naming a
response time with the phone number as fallback · hours, address, map and
directions present · persistent non-dismissible concept disclaimer ·
indicative pricing with a caveat · three treatment-tagged testimonials · a
four-question FAQ.

Budgets: Lighthouse accessibility and best practices 1.0 · CLS ≤ 0.05 ·
LCP ≤ 2.0 s · transfer ≤ 600 KB · JS ≤ 50 KB gz · tap targets ≥ 44 px ·
WCAG 2.2 AA.

Hours, map and directions live in a `#find-us` section reachable from the nav,
not the footer. Content people navigate *to* should not be buried; the footer
repeats address, phone and the directions link anyway.

## Architecture

Content lives in five collections — treatments (4), testimonials (3), team
(1), faq (4), openingHours (1) — validated by Zod at build time. Only
`index.astro` reads them; every component takes typed props.

Ten static components ship zero JavaScript. Four islands hydrate and nothing
else: `TreatmentCard`, `EnquiryForm`, `OpeningStatus`, `StickyCta`.

Without JavaScript: cards open and close via native
`<details name="treatments">`, the form posts normally, the sticky CTA stays
visible, and `OpeningStatus` renders nothing at all — a stale open/closed pill
is worse than none.

`/api/enquiry` pipeline: parse → Zod → honeypot → Turnstile → rate limit
(SHA-256 hashed IP, 1 h window, 5/hour, KV) → Resend. **No database.** The
submission's useful life is the minutes before someone reads the email, and a
store would add a UK GDPR controller obligation, retention policy, SAR
process and breach plan for nothing.

Client and server deliberately do **not** share a schema module. They share
the wire: the endpoint returns `{ errors: { field: message } }` and the island
paints those into the same slots its native constraints use. `lib/enquiry.ts`
is server-only — importing it from an island puts the whole Zod runtime back
in the bundle.

`/CREDITS.md` is a prerendered route built from the same validated records the
page renders, mirrored to the project root by an `astro:build:done`
integration, so it cannot drift.

JSON-LD `Dentist` carries hours (with the placeholder admission in
`disambiguatingDescription`) but deliberately no `aggregateRating`, `review`
or prices — the testimonials are placeholders, and a rating would be a
fabricated claim in machine-readable form.

## Findings worth keeping

**Bundling and images**

- `Astro.locals.runtime.env` was removed in Astro v6 and throws at runtime.
  Config comes from `import { env } from 'cloudflare:workers'`, declared in
  `src/env.d.ts`.
- Reading secrets through `import.meta.env` **inlines them into `dist/server`
  as string literals**. Worker bindings only.
- Importing the slug tuple from `enquiry.ts` dragged the entire Zod runtime
  into `TreatmentCard`: 77 KB → 652 B once split into `slugs.ts`.
- Author CSS beats the browser's `[hidden]` rule, so `el.hidden = true` did
  nothing until a global `[hidden]{display:none!important}` was added.
- Astro emits a full-resolution `src` beside every `srcset` unless `width` is
  given, and no supported browser fetches it. Four dead files, 190 KB.
- `sizes` must subtract container padding, grid gap and panel padding. Saying
  `100vw` on a padded container made a 412px viewport pull the 960w candidate
  for a 372px box. Two separate occurrences; check any new image.
- Turnstile loaded eagerly cost 125 KB and 505 ms blocking. It now loads on
  `focusin` or 600px ahead via IntersectionObserver.

**Accessibility, found by axe and keyboard testing, not by Lighthouse**

Lighthouse scored this page 100 with both of these present:

- The testimonial row and pricing table scroll horizontally with nothing
  focusable inside, so a keyboard reader could not reach the second and third
  testimonials or the right-hand price columns. Both now take `tabindex="0"`.
- The skip link did nothing: `<main>` had no `tabindex="-1"`, so activating it
  scrolled but left focus on `<body>`, and the next Tab went straight back
  into the header.

**Test harness**

- Playwright runs against the **built** Worker under `wrangler dev --local`,
  never `astro dev` — two of three endpoint bugs existed only in compiled
  output.
- Wrangler reads `.dev.vars` from the config file's directory, which is
  `dist/server/`. The project-root `.env` is nowhere it looks and
  `--env-file` does not help. It fails quietly: every binding empty,
  `/api/enquiry` answering 503 to everything.
- Config for tests comes from a committed `.env.test` with Cloudflare test
  keys and a deliberately invalid Resend key. `prepare-worker.ts` refuses to
  fall back to `.env` — with a live key in it, the JavaScript-off path (which
  skips Turnstile by design) reaches the send and mails a real person.
- An unread request body kills `wrangler dev`: Astro's CSRF check rejects a
  POST with no Origin without reading the body, stranding miniflare's internal
  connection. Local dev only.
- `scroll-behavior: smooth` versus Playwright's stability check — the suite
  runs `reducedMotion: 'reduce'`.
- `pkill -f wrangler` from Git Bash does not kill Windows processes. Orphaned
  instances hold `dist/client` open and `astro build` fails `EPERM` while
  still printing "Complete!" higher up. Use PowerShell `Stop-Process`.

**Turnstile, and how the gate lied**

A junk-token 403 and a wrong-secret 403 are the same 403. This file once read
the former as proof the secret was right, while the deployed secret belonged
to a deleted widget and every real visitor was being turned away.

`verifyTurnstile` now logs siteverify's `error-codes` — codes only, never the
token. Read it with `npx wrangler tail --config dist/server/wrangler.json`
while POSTing any junk `botToken`:

- `invalid-input-response` — spent, forged or expired token. The 403 is right.
- `invalid-input-secret` — **ours.** Nobody can submit.

Which secret Cloudflare holds is readable: the widget *detail* endpoint
(`GET /client/v4/accounts/{account}/challenges/widgets/{sitekey}`) returns a
`secret` field; the list endpoint does not.

**Measurement environment — read this before trusting any score**

`benchmarkIndex` is the whole story of any low Performance number. On
identical bytes: bench 218 → 65, bench 834 → 87, bench 1941 → 100. The idle
baseline on this machine is 1836–2088. `--disable-gpu`, `text-wrap` and
`backdrop-filter` were each tested as causes and each ruled out.

The project sits in a OneDrive-synced folder and that changes the numbers:
served from `dist/client`, median Performance 77; served from a copy in system
temp minutes later, 100. `scripts/lighthouse-ci.mjs` copies the build out
before measuring.

`node_modules` is a directory junction to
`C:\Users\maLoy\node-modules-store\coventry-dental-redesign\node_modules`,
which OneDrive does not follow. **The target directory must itself be named
`node_modules`** — Node resolves through to the real path and walks up from
there, so any other name breaks every import. To undo: delete the junction and
`npm install`.

`lighthouse` is pinned to 12.8.2. 13.4.1 dies on Windows in chrome-launcher's
`destroyTmp` every run. The pin keeps numbers comparable, and the runner
treats a non-zero exit with a readable report on disk as a completed audit —
that cleanup race happens after the report is written.

Lighthouse CI asserts only what does not depend on the host: accessibility
1.0, best practices 1.0, byte budgets, CLS, structural audits. Performance is
`warn` only. Verified to be a real gate by dropping `total-byte-weight` to
1 KB and watching it exit 1.

## Deployment runbook

`wrangler.jsonc` at the project root carries the `ENQUIRY_RATE_LIMIT` binding
and its namespace id; the Vite plugin merges it into the generated
`dist/server/wrangler.json`, so editing the generated file works exactly once.

1. `npx wrangler login`
2. `npx wrangler kv namespace create ENQUIRY_RATE_LIMIT`, paste the id over
   `REPLACE_WITH_KV_NAMESPACE_ID` in `wrangler.jsonc`.
3. Secrets, one per line, never committed:
   `npx wrangler secret put TURNSTILE_SECRET_KEY --config dist/server/wrangler.json`
   and the same for `RESEND_API_KEY`, `ENQUIRY_TO_EMAIL`,
   `ENQUIRY_FROM_EMAIL`, `ENQUIRY_IP_SALT`.

   `PUBLIC_TURNSTILE_SITE_KEY` is different — read at build time and embedded
   in the page, so it goes in `.env` before `npm run build`.

   **`ENQUIRY_TO_EMAIL` must never be the practice's real inbox.** Here it is
   the developer's own mailbox, and it has to be: `ENQUIRY_FROM_EMAIL` is
   Resend's shared `onboarding@resend.dev`, which delivers only to the account
   owner's address. `wrangler secret list` returns names, never values, so
   `.env` is the only record of what was pushed.
4. `npm run deploy`
5. Re-measure against the deployed URL and record `benchmarkIndex` beside the
   score.

Also register the deployed hostname in the Turnstile widget's hostname list.
Changing the account subdomain changes the URL and silently breaks the widget.

## Measurements

**Local, idle host** (benchmarkIndex 1836–2088):

    Performance 100 · Accessibility 100 · Best Practices 100 · SEO 66
    FCP 1.1 s · LCP 1.4 s · CLS 0 · TBT 0 ms · 56 KiB

**Deployed, 2026-09-07**, 5 runs, benchmarkIndex 498–2383.5 (median 991.5):

    Performance 93 · Accessibility 100 · Best Practices 100 · SEO 69
    FCP 1.55 s · LCP 1.90 s · CLS 0 · TBT 309 ms · SI 1.64 s · 56 KiB

Per run: bench 2383.5 → 99, 1452 → 93, 991.5 → 99, 874.5 → 91, 498 → 88. LCP
moved 1.64–2.01 s while Performance moved 88–99. Everything else was identical
in every run. The host was quiet at the start and not by run 4, so 93 is a
floor, not a best case.

SEO 66–69 is the `is-crawlable` audit alone, caused by the deliberate
`noindex`. Every other SEO audit passes.

Client JS 2,238 B gz total — `EnquiryForm` 1,528 B, `TreatmentCard` 470 B,
store 240 B. Four percent of the budget.

## Verified end to end

A real browser token was accepted and the enquiry arrived at
`ENQUIRY_TO_EMAIL`, so Turnstile and Resend both work in production. The
no-JS path remains defended by honeypot and rate limit only, because Turnstile
requires JavaScript.
