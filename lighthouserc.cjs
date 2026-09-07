/**
 * Lighthouse CI — a build-failing performance and accessibility gate.
 *
 * Two things shape every number below.
 *
 * 1. `benchmarkIndex`. This project has measured, repeatedly, that the
 *    Performance score on a contended host tracks the host and not the page:
 *    bench 218 gave Perf 65 and TBT 2,474 ms, bench 1941 gave Perf 100 and TBT
 *    0 ms, with no change to the site in between. A hard `performance >= 0.99`
 *    assertion would therefore fail on a busy CI runner for reasons the commit
 *    has nothing to do with. So the *scores* that gate the build are the ones
 *    that do not depend on CPU — accessibility, best practices, and the
 *    resource budgets from PRD §2.2 — and the timing metrics are asserted at
 *    thresholds a slow runner can still clear. `numberOfRuns: 5` with LHCI's
 *    median aggregation removes most of the rest.
 *
 * 2. PRD §2.2 sets the budgets: images ≤ 350 KB, JavaScript ≤ 50 KB gzipped.
 *    Those are byte counts, they are deterministic, and a regression in either
 *    is a real defect. They are asserted as errors.
 *
 * SEO is deliberately not gated: the concept ships `noindex, nofollow` on
 * purpose (PRD §4), which caps the category at 66. Every other SEO audit
 * passes, so `is-crawlable` is turned off individually rather than the whole
 * category being ignored.
 */
module.exports = {
  ci: {
    /*
     * No `collect` block: scripts/lighthouse-ci.mjs does the collecting and
     * then shells `lhci assert` against what it wrote into .lighthouseci/.
     * LHCI's own collector dies on Windows cleaning up Chrome's temp profile,
     * and its staticDistDir would serve the build from inside the OneDrive
     * folder, which measurably changes the numbers. The script explains both.
     */

    assert: {
      assertions: {
        /* Scores that do not depend on the runner's CPU. */
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: 1 }],
        'categories:seo': 'off',
        'is-crawlable': 'off',

        /*
         * Performance is a warning, not an error, for the benchmarkIndex
         * reason above. It still shows up in the report, so a genuine
         * regression is visible; what it may not do is fail a build because
         * the runner was busy.
         */
        'categories:performance': ['warn', { minScore: 0.9 }],

        /* PRD §2.2 budgets. Bytes, not timings — these are deterministic. */
        'total-byte-weight': ['error', { maxNumericValue: 400_000 }],
        'resource-summary:script:size': ['error', { maxNumericValue: 51_200 }],
        'resource-summary:image:size': ['error', { maxNumericValue: 358_400 }],

        /* Layout stability is not CPU-bound either. Nothing may shift. */
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.01 }],

        /*
         * Timings, at thresholds a slow runner can clear. These catch a real
         * regression (a render-blocking script, an unsized hero) without
         * failing on host noise.
         */
        'largest-contentful-paint': ['error', { maxNumericValue: 4000 }],
        'first-contentful-paint': ['error', { maxNumericValue: 3000 }],
        'total-blocking-time': ['warn', { maxNumericValue: 600 }],

        /* Structural audits. Cheap, deterministic, and each one is a PRD line. */
        'errors-in-console': ['error', { minScore: 1 }],
        'image-size-responsive': ['error', { minScore: 1 }],
        'unsized-images': ['error', { minScore: 1 }],
        'render-blocking-resources': ['error', { minScore: 1 }],
        'uses-responsive-images': ['warn', { minScore: 1 }],
        'modern-image-formats': ['error', { minScore: 1 }],
        'viewport': ['error', { minScore: 1 }],
        'font-display': ['error', { minScore: 1 }],
      },
    },

    upload: { target: 'filesystem', outputDir: './.lighthouseci' },
  },
};
