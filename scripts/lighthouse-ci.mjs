/**
 * Collects Lighthouse runs for `lhci assert`, then asserts them.
 *
 * Two reasons this exists rather than a plain `lhci autorun`.
 *
 * 1. `lhci autorun`'s own collector dies on Windows. chrome-launcher removes
 *    its temp profile as soon as it has asked Chrome to exit, Chrome has not
 *    finished exiting, and the whole run ends on
 *    `EPERM, Permission denied: …\Temp\lighthouse.NNNNNNNN` — after the audits
 *    have already been generated.
 *
 *    The version matters: lighthouse 13.4.1, which lhci pulls in, hits this on
 *    every run here; 12.8.2 does not, across fifteen runs. So 12.8.2 is a
 *    pinned devDependency and this script drives its CLI one run at a time.
 *    Pinning also keeps the numbers comparable with every measurement recorded
 *    in CLAUDE.md, all of which were taken on 12.8.2.
 *
 * 2. The project lives in a OneDrive-synced folder, and serving the build from
 *    there measurably changes the result. Same commit, same machine, minutes
 *    apart: served out of OneDrive the median was Performance 77, LCP 1.92 s;
 *    served from a copy in the system temp directory it was Performance 100,
 *    LCP 1.43 s. Every read goes through OneDrive's filter driver and the sync
 *    engine competes for CPU, so the number describes the folder rather than
 *    the page. This copies dist/client out before measuring anything.
 *
 * Reports land in .lighthouseci/ as lhr-*.json, which is where `lhci assert`
 * looks for them. Thresholds live in lighthouserc.cjs.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

// fileURLToPath, not URL.pathname: the project path contains spaces, and a
// pathname hands them back as %20 — which then resolves to nothing.
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const RUNS = Number(process.env.LH_RUNS ?? 5);
const PORT = Number(process.env.LH_PORT ?? 4399);
const OUT = join(ROOT, '.lighthouseci');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.md', '.svg', '.txt']);

/** The same edge-like static server the manual measurements used. */
function serve(root, port) {
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const parts = path.split('/').filter((p) => p && p !== '.' && p !== '..');
      const file = join(root, ...parts);
      const ext = extname(file);
      const body = await readFile(file);
      const headers = {
        'content-type': MIME[ext] ?? 'application/octet-stream',
        'cache-control': path.startsWith('/_astro/')
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=0, must-revalidate',
      };
      if (COMPRESSIBLE.has(ext) && /gzip/.test(req.headers['accept-encoding'] ?? '')) {
        const gz = gzipSync(body, { level: 9 });
        res.writeHead(200, { ...headers, 'content-encoding': 'gzip', 'content-length': gz.length });
        return res.end(gz);
      }
      res.writeHead(200, { ...headers, 'content-length': body.length });
      res.end(body);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

/*
 * `shell: true` is needed for `npx` on Windows, and it means the arguments are
 * concatenated into a command line rather than passed as a vector. This project
 * path contains a space ("Web Development"), so an unquoted --output-path is
 * split in two and the report is written somewhere nobody looks. Quote
 * anything that can carry a path.
 */
const run = (command, args, options = {}) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { shell: true, stdio: 'inherit', ...options });
    child.on('close', (code) => resolve(code ?? 1));
  });

/**
 * Best-effort removal of the Chrome profiles chrome-launcher leaked. They are
 * a few MB each and one is left behind per run, so without this the temp
 * directory grows every time the gate is used.
 */
async function sweepLighthouseTemp() {
  const temp = tmpdir();
  let entries = [];
  try {
    entries = await readdir(temp);
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((name) => name.startsWith('lighthouse.'))
      .map((name) => rm(join(temp, name), { recursive: true, force: true }).catch(() => {})),
  );
}

async function main() {
  const dist = join(ROOT, 'dist', 'client');
  if (!existsSync(dist)) {
    console.error('dist/client is missing. Run `npm run build` first.');
    process.exit(1);
  }

  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const staging = await mkdtemp(join(tmpdir(), 'coventry-lh-'));
  await cp(dist, staging, { recursive: true });

  const server = await serve(staging, PORT);
  const url = `http://127.0.0.1:${PORT}/`;
  console.log(`Serving a copy of dist/client from ${staging} on ${url}`);

  const benchmarks = [];
  try {
    for (let i = 1; i <= RUNS; i += 1) {
      const report = join(OUT, `lhr-${Date.now()}.json`);
      const code = await run('npx', [
        'lighthouse',
        url,
        '--output=json',
        `--output-path="${report}"`,
        '--quiet',
        '--chrome-flags="--headless=new"',
      ]);

      /*
       * A non-zero exit is not necessarily a failed audit. chrome-launcher's
       * destroyTmp() races Chrome's shutdown on Windows and throws
       * `EPERM … \Temp\lighthouse.NNNNNNNN` *after* the report has been
       * written and flushed. Treating that as a failed run would make the gate
       * unusable on this platform, and treating every non-zero exit as fine
       * would hide real failures — so the report itself is the judge: if it is
       * on disk and parses, the audit ran.
       */
      let lhr;
      try {
        lhr = JSON.parse(await readFile(report, 'utf-8'));
      } catch {
        console.error(
          `Lighthouse run ${i} exited ${code} and wrote no readable report — real failure.`,
        );
        process.exitCode = 1;
        return;
      }
      if (code !== 0) {
        console.log(`  run ${i}/${RUNS}  exited ${code} after writing its report (see above)`);
      }
      benchmarks.push(lhr.environment.benchmarkIndex);
      const perf = Math.round(lhr.categories.performance.score * 100);
      console.log(
        `  run ${i}/${RUNS}  benchmarkIndex ${lhr.environment.benchmarkIndex}  performance ${perf}`,
      );
    }
  } finally {
    server.close();
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    await sweepLighthouseTemp();
  }

  /*
   * The host's speed is part of the result, so it is recorded next to it. A
   * Performance score on this project means nothing without it: measured on
   * this machine, benchmarkIndex 218 scored 65 and benchmarkIndex 1941 scored
   * 100, with no change to the page in between.
   */
  const sorted = [...benchmarks].sort((a, b) => a - b);
  const summary = {
    runs: RUNS,
    benchmarkIndex: { min: sorted[0], median: sorted[(sorted.length - 1) >> 1], max: sorted.at(-1) },
  };
  await writeFile(join(OUT, 'host.json'), JSON.stringify(summary, null, 2));
  console.log(
    `benchmarkIndex ${summary.benchmarkIndex.min}–${summary.benchmarkIndex.max} ` +
      `(median ${summary.benchmarkIndex.median})`,
  );

  process.exitCode = await run('npx', ['lhci', 'assert', '--config=lighthouserc.cjs']);
}

await main();
