# Coventry Dental — landing page redesign concept

**[View the live page →](https://coventry-dental-concept.yuwenzx.workers.dev)**

> **Unsolicited concept. Not affiliated with the practice.** This was not
> commissioned, reviewed, or endorsed by The Coventry & Warwickshire Centre
> for Advanced Dentistry, Dr Jag Shergill, or anyone connected to them. All
> photography is licensed stock. All testimonial text is placeholder. Business
> details are drawn from public sources and reproduced factually. The page
> ships `noindex, nofollow` so it can never appear in search results beside
> the real practice.

A rebuild of one landing page for a real UK dental practice, done as a
portfolio piece.

## The problem

The practice has genuine authority — 30+ years in practice, a named lead
clinician, national press coverage, and high-value treatments. The homepage
undermines all of it:

- Template placeholders never replaced. Captions reading "Photo By: John Doe";
  buttons labelled "Button"
- 12 empty image slots in the gallery
- The "As Seen On" media section duplicated, with logos that don't render
- 30+ testimonials stacked on one page, attributed by initials only
- 13 top-level navigation items, with 13 more in a submenu
- Footer copyright reading 2023
- A background video plus dozens of testimonial blocks, on a page whose
  audience is mostly on mobile

For most businesses these are cosmetic. For an implant practice they aren't: a
patient weighing a £2,500 single implant against a £12,000 full-arch treatment
is running a risk assessment on the clinician, and every unfinished element is
evidence on the wrong side of it.

## What changed

| | Original | Concept |
|---|---|---|
| Navigation | 13 items + 13 submenu | 5 anchors, no submenu |
| Testimonials | 30+, initials only | 3, tagged by treatment |
| Unreplaced placeholders | Present on the homepage | None |
| Client JavaScript | — | 2.2 KB gzipped |
| First-load transfer | — | 56 KiB |
| Taps to the booking form | Buried | 1, from any scroll position |
| Emergency path | Mixed into general contact | Separate, one-tap `tel:` |

Nothing was invented to fill gaps. Opening hours aren't published on the
source site, so they're marked indicative rather than guessed at. The
clinician has no GDC number on the page because inventing one for a real
dentist would be a false claim, and no portrait because a stock face under a
real person's name is a picture of somebody else.

## Measured

Lighthouse 12.8.2, mobile, against the deployed URL. Five runs, median:

**Performance 93 · Accessibility 100 · Best Practices 100**
LCP 1.90 s · CLS 0 · TBT 309 ms · 56 KiB transferred

Performance ranged 88–99 across those runs while the bytes stayed identical —
the score tracked host load, not the page. `benchmarkIndex` is recorded beside
every number in `CLAUDE.md` for that reason.

SEO scores 69. The only failing audit is `is-crawlable`, caused by the
deliberate `noindex`. Indexing a concept page for a real business is the harm
that audit exists to warn about, so it stays.

## Built with

Astro · TypeScript · Tailwind · Cloudflare Workers · Zod · Turnstile · Resend

Ten static components ship zero JavaScript. Four islands hydrate and nothing
else. The page is fully readable and the enquiry form still submits with
JavaScript disabled.

Content is validated by Zod at build time, which is what makes the original's
failure mode structurally impossible here: an image without alt text, a
testimonial pointing at a treatment that doesn't exist, or a media mention
carrying a logo file all fail the build rather than reaching production.

## Running it

    npm install
    cp .env.example .env    # Cloudflare test keys, form works out of the box
    npm run dev

    npm run verify          # build → Lighthouse gate → 51 Playwright tests

Deployment steps, environment gotchas, and the reasoning behind each
constraint are in [`CLAUDE.md`](./CLAUDE.md).

## Credits

Image licences and attribution: [`CREDITS.md`](./CREDITS.md).
Map data © OpenStreetMap contributors, ODbL.
