import { test, expect } from '@playwright/test';

/**
 * PRD §2.2: "`prefers-reduced-motion` respected."
 *
 * The whole suite runs with `reducedMotion: 'reduce'` because it makes
 * Playwright's stability checks deterministic against `scroll-behavior:
 * smooth`. That is only legitimate if the preference genuinely does something,
 * so this asserts it in both directions rather than trusting the config.
 */
test.describe('prefers-reduced-motion', () => {
  test('smooth scrolling is off when the preference is set', async ({ page }) => {
    await page.goto('/');
    const behaviour = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    );
    expect(behaviour).toBe('auto');
  });

  test('and on when it is not — so the rule is doing real work', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const behaviour = await page.evaluate(
      () => getComputedStyle(document.documentElement).scrollBehavior,
    );
    expect(behaviour).toBe('smooth');
  });

  test('transitions are reduced to effectively nothing', async ({ page }) => {
    await page.goto('/');
    const durations = await page.evaluate(() => {
      const bar = document.querySelector('[data-sticky-cta]');
      if (!bar) return null;
      // Chrome serialises 0.01ms as "1e-05s", so compare numbers, not strings.
      return getComputedStyle(bar)
        .transitionDuration.split(',')
        .map((part) => parseFloat(part) * (part.includes('ms') ? 1 : 1000));
    });

    expect(durations).not.toBeNull();
    expect(durations!.length).toBeGreaterThan(0);
    for (const ms of durations!) expect(ms).toBeLessThan(1);
  });
});
