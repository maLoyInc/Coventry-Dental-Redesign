import { defineConfig, devices } from '@playwright/test';
import { PERSIST_DIR, prepareWorker } from './tests/prepare-worker';

/*
 * Runs at module scope, before Playwright launches anything, because that is
 * the only place early enough. This used to be a `globalSetup`, which
 * Playwright runs *after* it starts config.webServer — so the Worker had
 * already read its configuration by the time the setup wrote it. See
 * tests/prepare-worker.ts.
 */
prepareWorker();

/**
 * End-to-end coverage for the two flows in PRD §5, run against the *built*
 * Worker rather than `astro dev`.
 *
 * That matters more here than it usually does. Two of the three bugs found in
 * Stage 4 — `Astro.locals.runtime.env` being gone, and secrets inlined by
 * `import.meta.env` — only exist in the compiled output. A suite that drove the
 * dev server would have passed through both of them.
 *
 * `wrangler dev --local` serves dist/client as static assets and dist/server as
 * the Worker, so /api/enquiry is the real endpoint with the real pipeline.
 */
export const BASE_URL = 'http://127.0.0.1:8788';

/** PRD §2.2: designed at 360px first. 412×915 is the Lighthouse mobile frame. */
const MOBILE = { width: 412, height: 915 };

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',

    /*
     * The page sets `scroll-behavior: smooth` on the root. Playwright scrolls a
     * target into view and then waits for it to hold still, so against smooth
     * scrolling it can spend the whole timeout watching an element glide —
     * "element is not stable", intermittently, depending on how far it had to
     * travel.
     *
     * Emulating `prefers-reduced-motion: reduce` removes the fight, and it is
     * not a fudge: global.css turns smooth scrolling off under that query
     * precisely because PRD §2.2 requires the preference to be respected, so
     * this runs the suite through a state the page is required to support.
     * reduced-motion.spec.ts asserts the preference actually takes effect,
     * rather than leaving it as an assumption this config quietly relies on.
     */
    reducedMotion: 'reduce',
  },

  projects: [
    {
      name: 'mobile',
      use: { ...devices['Desktop Chrome'], viewport: MOBILE, isMobile: false },
      testMatch: /(primary-flow|emergency-flow|api-enquiry|a11y|reduced-motion)\.spec\.ts/,
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testMatch: /desktop\.spec\.ts/,
    },
    {
      /*
       * PRD §2.2: "Page readable and the form functional with JavaScript
       * disabled." This is the only project that proves it, so it gets its own
       * spec file rather than a flag inside the others — a test that can be
       * accidentally run with JavaScript on is not evidence of anything.
       */
      name: 'no-js',
      use: {
        ...devices['Desktop Chrome'],
        viewport: MOBILE,
        javaScriptEnabled: false,
      },
      testMatch: /no-js\.spec\.ts/,
    },
  ],

  webServer: {
    /*
     * dist/ must already exist: `npm run test:e2e` builds first.
     *
     * Configuration reaches the Worker through dist/server/.dev.vars, written
     * by prepareWorker() above from .env.test — never from .env, which holds
     * the real deployment keys. Without it every binding is empty,
     * /api/enquiry answers 503 "not configured" to everything, and the local
     * Worker falls over partway through the suite.
     */
    // --log-level warn: wrangler's info stream logs every asset request, which
    // buries the endpoint's own warnings under a few hundred lines per run.
    //
    // --persist-to: ENQUIRY_RATE_LIMIT is a bound KV namespace now, so miniflare
    // simulates it against disk instead of the per-isolate Map that used to die
    // with the process. Left at the default location the rate-limit counters
    // would survive from one run to the next and the third run inside an hour
    // would 429. prepareWorker() hands over a directory made fresh for this run.
    command:
      'npx wrangler dev --config dist/server/wrangler.json --port 8788 --local ' +
      `--log-level warn --persist-to "${PERSIST_DIR}"`,
    url: BASE_URL,
    // Always own the lifecycle. A server left over from another session may
    // have different bindings, and a stale one silently invalidates a pass.
    reuseExistingServer: false,
    // 120s was not enough on a loaded host: npx resolution plus wrangler's cold
    // start ran past it and the suite failed with "Timed out waiting for
    // config.webServer" while the server was still coming up.
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
