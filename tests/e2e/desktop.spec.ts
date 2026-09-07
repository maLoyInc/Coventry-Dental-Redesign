import { test, expect } from '@playwright/test';

/**
 * The desktop half of PRD F2. The mobile bar and the header CTA are two halves
 * of one requirement — "persistent booking affordance from any scroll
 * position" — and each breakpoint must have exactly one of them, never both
 * and never neither.
 */

const PHONE_DISPLAY = '024 7645 4350';

test.describe('F2 at 1440px', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('the header CTA is the persistent affordance, and the mobile bar is not', async ({
    page,
  }) => {
    const header = page.getByRole('banner').last();
    const headerCta = header.getByRole('link', { name: 'Book a consultation' });
    await expect(headerCta).toBeVisible();

    // The mobile bar is md:hidden — present in the DOM, not on screen.
    await expect(page.locator('[data-sticky-cta]')).toBeHidden();

    // Persistent: still there at the end of the page.
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
    await expect(headerCta).toBeInViewport();
  });

  test('no horizontal scroll at 320px, the narrowest supported width', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('body text is at least 16px on mobile, to stop iOS zooming on focus', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const inputFontSize = await page
      .locator('input[name="email"]')
      .evaluate((node) => parseFloat(getComputedStyle(node).fontSize));
    expect(inputFontSize).toBeGreaterThanOrEqual(16);
  });

  test('the concept ships noindex and does not name the real domain', async ({ page }) => {
    const robots = await page
      .locator('meta[name="robots"]')
      .getAttribute('content');
    expect(robots).toMatch(/noindex/);
    expect(robots).toMatch(/nofollow/);

    // PRD §4 — the concept must never present itself as the practice's site.
    const html = await page.content();
    expect(html).not.toContain('coventrydental.co.uk/');
  });

  test('exactly one JSON-LD block, and it claims no rating and no prices', async ({ page }) => {
    const blocks = page.locator('script[type="application/ld+json"]');
    await expect(blocks).toHaveCount(1);

    const data = JSON.parse((await blocks.textContent()) ?? '{}');
    expect(data['@type']).toBe('Dentist');
    expect(data.telephone).toContain('442476454350');
    // Placeholder testimonials must not become a machine-readable claim.
    expect(data.aggregateRating).toBeUndefined();
    expect(data.review).toBeUndefined();
    expect(data.makesOffer).toBeUndefined();
    // The hours are indicative and say so.
    expect(JSON.stringify(data.disambiguatingDescription ?? '')).toMatch(/indicative|placeholder/i);
  });

  test('press coverage renders as text, never as a reproduced logo', async ({ page }) => {
    const dentist = page.locator('#dentist');
    await dentist.scrollIntoViewIfNeeded();

    const images = dentist.locator('img');
    for (let i = 0; i < (await images.count()); i += 1) {
      const alt = (await images.nth(i).getAttribute('alt')) ?? '';
      expect(alt.toLowerCase()).not.toMatch(/\b(bbc|the times|itv|sky|logo)\b/);
    }
    await expect(dentist).toContainText(/featured|press/i);
  });
});
