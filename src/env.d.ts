/// <reference types="astro/client" />

/**
 * `cloudflare:workers` is a virtual module the Workers runtime provides; it has
 * no package behind it and therefore no types. @cloudflare/workers-types would
 * supply them, but this project uses exactly one export from it — see
 * src/lib/runtime-env.ts — and a whole runtime typings package is a large
 * dependency to carry for one binding bag.
 *
 * `env` is deliberately typed as unknown values rather than a hand-written
 * binding interface. A declaration file cannot verify what the Cloudflare
 * dashboard actually has bound, and a shape asserted here would be a claim, not
 * a check. runtime-env.ts narrows each value at the point it reads it.
 */
declare module 'cloudflare:workers' {
  export const env: Record<string, unknown>;
}
