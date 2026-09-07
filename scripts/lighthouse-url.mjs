/**
 * Audits a URL that is already on the internet, five times, and reports the
 * median of each number next to the host speed that produced it.
 *
 * Separate from scripts/lighthouse-ci.mjs on purpose. That script is a gate: it
 * builds a private copy of dist/client outside OneDrive, serves it from a local
 * static server it controls, and hands the reports to `lhci assert`. Every one
 * of those choices exists to remove a variable. This script removes none of
 * them — it measures the deployed Worker over the public internet, including
 * Cloudflare's edge, TLS and whatever the network is doing — so it asserts
 * nothing and only reports.
 *
 * Both share one rule, and it is the one that matters when reading the output:
 * a Performance score on this project is meaningless without the
 * `benchmarkIndex` beside it. Measured on this machine, benchmarkIndex 218
 * scored 65 and benchmarkIndex 1941 scored 100 with no change to the page.
 *
 * Usage: node scripts/lighthouse-url.mjs <url> [runs]
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2];
const RUNS = Number(process.argv[3] ?? 5);

if (!url) {
  console.error('Usage: node scripts/lighthouse-url.mjs <url> [runs]');
  process.exit(1);
}

/** `shell: true` for npx on Windows, so anything carrying a path is quoted. */
const run = (command, args) =>
  new Promise((resolve) => {
    const child = spawn(command, args, { shell: true, stdio: 'inherit' });
    child.on('close', (code) => resolve(code ?? 1));
  });

/** Chrome profiles chrome-launcher leaks, one per run. */
async function sweepLighthouseTemp() {
  let entries = [];
  try {
    entries = await readdir(tmpdir());
  } catch {
    return;
  }
  await Promise.all(
    entries
      .filter((name) => name.startsWith('lighthouse.'))
      .map((name) => rm(join(tmpdir(), name), { recursive: true, force: true }).catch(() => {})),
  );
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) >> 1];
};

const round = (value, places = 0) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const out = await mkdtemp(join(tmpdir(), 'coventry-lh-url-'));
const runs = [];

try {
  for (let i = 1; i <= RUNS; i += 1) {
    const report = join(out, `lhr-${i}.json`);
    const code = await run('npx', [
      'lighthouse',
      `"${url}"`,
      '--output=json',
      `--output-path="${report}"`,
      '--quiet',
      '--chrome-flags="--headless=new"',
    ]);

    /*
     * A non-zero exit is not necessarily a failed audit: chrome-launcher's
     * destroyTmp() races Chrome's shutdown on Windows and throws EPERM *after*
     * the report is written. The report on disk is the judge.
     */
    let lhr;
    try {
      lhr = JSON.parse(await readFile(report, 'utf-8'));
    } catch {
      console.error(`Run ${i} exited ${code} and wrote no readable report — real failure.`);
      process.exitCode = 1;
      break;
    }

    const audit = (id) => lhr.audits[id]?.numericValue ?? NaN;
    runs.push({
      benchmarkIndex: lhr.environment.benchmarkIndex,
      performance: Math.round(lhr.categories.performance.score * 100),
      accessibility: Math.round(lhr.categories.accessibility.score * 100),
      bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
      seo: Math.round(lhr.categories.seo.score * 100),
      fcp: audit('first-contentful-paint') / 1000,
      lcp: audit('largest-contentful-paint') / 1000,
      cls: audit('cumulative-layout-shift'),
      tbt: audit('total-blocking-time'),
      si: audit('speed-index') / 1000,
      kib: audit('total-byte-weight') / 1024,
    });

    const last = runs.at(-1);
    console.log(
      `  run ${i}/${RUNS}  benchmarkIndex ${last.benchmarkIndex}  performance ${last.performance}`,
    );
  }
} finally {
  await rm(out, { recursive: true, force: true }).catch(() => {});
  await sweepLighthouseTemp();
}

if (runs.length === 0) process.exit(1);

const column = (key) => runs.map((entry) => entry[key]);
const report = {
  url,
  runs: runs.length,
  benchmarkIndex: {
    min: Math.min(...column('benchmarkIndex')),
    median: median(column('benchmarkIndex')),
    max: Math.max(...column('benchmarkIndex')),
  },
  median: {
    performance: median(column('performance')),
    accessibility: median(column('accessibility')),
    bestPractices: median(column('bestPractices')),
    seo: median(column('seo')),
    fcpSeconds: round(median(column('fcp')), 2),
    lcpSeconds: round(median(column('lcp')), 2),
    cls: round(median(column('cls')), 3),
    tbtMs: round(median(column('tbt'))),
    speedIndexSeconds: round(median(column('si')), 2),
    transferKiB: round(median(column('kib'))),
  },
  perRun: runs.map((entry) => ({
    benchmarkIndex: entry.benchmarkIndex,
    performance: entry.performance,
    lcpSeconds: round(entry.lcp, 2),
    tbtMs: round(entry.tbt),
  })),
};

console.log(JSON.stringify(report, null, 2));
