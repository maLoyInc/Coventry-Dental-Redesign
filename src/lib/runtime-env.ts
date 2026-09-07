import { env as workerEnv } from 'cloudflare:workers';

/**
 * Server configuration, read from the Worker's own bindings.
 *
 * Two things this deliberately is not:
 *
 * `import.meta.env` — Vite substitutes those at build time, so a `.env` present
 * on the build machine gets inlined into the deployed Worker as a string
 * literal. Measured, not assumed: an earlier version of this file compiled to
 * `TURNSTILE_SECRET_KEY: text("1x00…AA")` in dist/server. A secret that ships
 * inside the bundle is not a secret, and it silently outranks the dashboard.
 *
 * `Astro.locals.runtime.env` — removed in Astro v6. Reading it now throws
 * "has been removed … Use 'import { env } from \"cloudflare:workers\"'", which
 * is what this module does. Found by running the built Worker, not by reading
 * a changelog.
 *
 * In production these are the Cloudflare Pages environment variables and KV
 * bindings. In `astro dev` and `wrangler dev` the same names come from `.env` /
 * `.dev.vars` ("Using secrets defined in .env" on start). `globalThis.process`
 * is a last-resort fallback for running this route outside a Worker at all.
 *
 * Nothing here is optional-by-omission: a missing value is an empty string, and
 * `missingConfig` turns that into a 503 rather than a silently weakened check.
 * A bot check or a rate limit that disables itself when unconfigured is worse
 * than not having one, because it still looks present.
 */

/**
 * The slice of Cloudflare KV this project uses. Typed structurally rather than
 * pulled from @cloudflare/workers-types: two methods do not justify a
 * dependency, and it keeps the fallback store trivially substitutable.
 */
export interface RateLimitStore {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<unknown>;
}

export interface ServerEnv {
  /** Turnstile secret, paired with PUBLIC_TURNSTILE_SITE_KEY (PRD §6.5). */
  TURNSTILE_SECRET_KEY: string;
  /** Resend API key — the entire backend requirement (PRD §8). */
  RESEND_API_KEY: string;
  /** Where the enquiry lands. The email is the record (PRD §7.2). */
  ENQUIRY_TO_EMAIL: string;
  /** A verified Resend sender on a domain this concept controls. */
  ENQUIRY_FROM_EMAIL: string;
  /**
   * Salt for the rate-limit key. The IP is hashed with it and never stored in
   * the clear, so the limiter holds no identifier it could be asked for.
   */
  ENQUIRY_IP_SALT: string;
  /** KV namespace for the rate limit. Unbound in dev — see rate-limit.ts. */
  ENQUIRY_RATE_LIMIT?: RateLimitStore;
}

/** Every value the endpoint refuses to run without. */
const REQUIRED = [
  'TURNSTILE_SECRET_KEY',
  'RESEND_API_KEY',
  'ENQUIRY_TO_EMAIL',
  'ENQUIRY_FROM_EMAIL',
  'ENQUIRY_IP_SALT',
] as const satisfies readonly (keyof ServerEnv)[];

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

export function readServerEnv(): ServerEnv {
  const bound: Record<string, unknown> = workerEnv ?? {};

  // Reached through globalThis because `process` does not exist on the Workers
  // runtime unless nodejs_compat is on, and this project has no @types/node.
  const host =
    (globalThis as { process?: { env?: Record<string, unknown> } }).process?.env ?? {};

  const read = (key: (typeof REQUIRED)[number]): string => text(bound[key]) || text(host[key]);

  return {
    TURNSTILE_SECRET_KEY: read('TURNSTILE_SECRET_KEY'),
    RESEND_API_KEY: read('RESEND_API_KEY'),
    ENQUIRY_TO_EMAIL: read('ENQUIRY_TO_EMAIL'),
    ENQUIRY_FROM_EMAIL: read('ENQUIRY_FROM_EMAIL'),
    ENQUIRY_IP_SALT: read('ENQUIRY_IP_SALT'),
    ENQUIRY_RATE_LIMIT: bound.ENQUIRY_RATE_LIMIT as RateLimitStore | undefined,
  };
}

/** Which required values are absent. Empty means the endpoint can run. */
export function missingConfig(env: ServerEnv): string[] {
  return REQUIRED.filter((key) => env[key] === '');
}
