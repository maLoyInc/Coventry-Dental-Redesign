import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Prepares the local Worker before `wrangler dev` starts, and says so loudly if
 * it cannot.
 *
 * **This is not a Playwright `globalSetup`, and that is the whole point.** It
 * used to be. Playwright launches `config.webServer` *before* it runs
 * globalSetup, so everything below happened after the Worker had already read
 * its configuration and bound its storage — too late to affect either. The bug
 * stayed hidden for a whole stage because `dist/server/.dev.vars` survived from
 * one run to the next: the file the setup wrote too late for this run was
 * exactly the file the next run started with. Deleting it once made all seven
 * endpoint tests answer 503 "not configured".
 *
 * So this runs at module scope in playwright.config.ts instead, which is
 * evaluated before anything is launched, and it is synchronous for the same
 * reason — the config must not resolve until the work is done.
 */

/** Project root, from tests/ */
const root = new URL('../', import.meta.url);
const path = (relative: string) => fileURLToPath(new URL(relative, root));

/**
 * The only RESEND_API_KEY the suite will run with. Present, so the endpoint
 * reaches the send; invalid, so the send fails and the specs get their 502.
 */
const DUD_RESEND_KEY = 're_not_a_real_key_tests_expect_502';

/** Cloudflare's documented always-verifies secret. */
const TEST_TURNSTILE_SECRET = '1x0000000000000000000000000000000AA';

const STATE_PREFIX = 'coventry-dental-wrangler-test-state-';

/**
 * Miniflare's simulated-KV storage for this run: a directory nothing else has
 * ever used.
 *
 * Until ENQUIRY_RATE_LIMIT was created and bound, `wrangler dev --local` had no
 * namespace to simulate and lib/rate-limit.ts counted in a per-isolate Map that
 * died with the process, so every run started at zero for free. With the
 * binding in place miniflare persists the counters to disk instead and they
 * outlive the run. The suite makes two submissions that reach the limiter
 * against a limit of five per hour, so the third run inside an hour would fail
 * with 429s that no commit caused.
 *
 * A fresh directory rather than a cleared one, because clearing does not work
 * here: deleting the previous run's state failed with `EBUSY: resource busy or
 * locked, rmdir ...\v3\cache` with no wrangler process left alive to blame —
 * first under the project root, which is inside OneDrive, and then again from
 * the system temp directory, which rules OneDrive out. A unique path sidesteps
 * the question entirely: a run cannot inherit state it has never seen.
 *
 * Absolute, and a temp path can contain spaces, so playwright.config.ts quotes
 * it where it interpolates it into the server command.
 */
export const PERSIST_DIR = mkdtempSync(join(tmpdir(), STATE_PREFIX));

/**
 * Reads one KEY=value out of an env file. Deliberately not a parser: these two
 * values are asserted against exact strings, so anything it would get wrong is
 * something that should fail.
 */
const value = (contents: string, key: string): string =>
  contents.match(new RegExp(`^${key}=(.*)$`, 'm'))?.[1]?.trim() ?? '';

/**
 * Guards the credentials the local Worker is about to be handed.
 *
 * Exact matches, not shape checks. A Resend key is `re_` and then an opaque
 * string, which is also what a plausible dud looks like, so any pattern that
 * rejects a real key rejects the dud too — the first version of this guard
 * failed on its own file. Naming the accepted value removes the guesswork.
 */
function assertTestOnly(contents: string): void {
  if (value(contents, 'TURNSTILE_SECRET_KEY') !== TEST_TURNSTILE_SECRET) {
    throw new Error(
      `.env.test must carry Cloudflare's always-passes Turnstile secret ` +
        `(${TEST_TURNSTILE_SECRET}). A real secret rejects the suite's dummy ` +
        `token and every pipeline spec stops at the bot check.`,
    );
  }

  if (value(contents, 'RESEND_API_KEY') !== DUD_RESEND_KEY) {
    throw new Error(
      `RESEND_API_KEY in .env.test must be exactly "${DUD_RESEND_KEY}". Empty ` +
        `answers 503 before the pipeline runs, and a real key sends mail from a ` +
        `test run. This one is present, so the endpoint reaches Resend, and ` +
        `invalid, so the send fails with 502 — which is what the specs assert.`,
    );
  }
}

/**
 * Removes state directories left by earlier runs. Best-effort on purpose: the
 * EBUSY above is exactly what this hits on a directory Windows has not finished
 * letting go of, and a run must not fail because it could not tidy up after an
 * earlier one. Correctness comes from PERSIST_DIR being new, not from this.
 */
function sweepOldState(): void {
  let entries: string[] = [];
  try {
    entries = readdirSync(tmpdir());
  } catch {
    return;
  }

  for (const name of entries) {
    const full = join(tmpdir(), name);
    if (!name.startsWith(STATE_PREFIX) || full === PERSIST_DIR) continue;
    try {
      rmSync(full, { recursive: true, force: true });
    } catch {
      // Held by Windows. Harmless — it is not this run's state.
    }
  }
}

/**
 * Copies `.env.test` to where wrangler will look for it.
 *
 * Wrangler reads `.dev.vars` from the directory holding the config file, and
 * the config it is pointed at is the one Astro generates —
 * dist/server/wrangler.json — so the project-root env file is nowhere wrangler
 * looks. `--env-file` does not close the gap either: it was tried, and the run
 * still came up with SESSION and ASSETS as the only bindings.
 *
 * `.env.test`, never `.env`, and there is no fallback. `.env` holds the real
 * Turnstile and Resend keys used to build and deploy. Handing those to the
 * local Worker would make the bot check reject the suite's dummy token, and
 * would make the JavaScript-off form post — which skips Turnstile by design —
 * send a real email on every run. A test run must not be able to send mail.
 */
export function prepareWorker(): void {
  let contents: string;
  try {
    contents = readFileSync(path('.env.test'), 'utf-8');
  } catch {
    throw new Error(
      'tests/prepare-worker.ts: no .env.test at the project root. It is ' +
        'committed — restore it rather than pointing the suite at .env, which ' +
        'holds the real deployment keys.',
    );
  }

  assertTestOnly(contents);

  try {
    readFileSync(path('dist/server/wrangler.json'));
  } catch {
    throw new Error(
      'tests/prepare-worker.ts: dist/server is missing. Run `astro build` ' +
        'first, or use `npm run test:e2e`, which builds before testing.',
    );
  }

  copyFileSync(path('.env.test'), path('dist/server/.dev.vars'));
  sweepOldState();
}
