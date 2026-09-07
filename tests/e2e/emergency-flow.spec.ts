import { test, expect } from '@playwright/test';

/**
 * PRD §5.2 — landing to emergency call.
 *
 * The whole point of this path is that it is not the booking path: no form, no
 * gate, no callback promise. Every assertion below is either "the number dials"
 * or "nothing stands in front of it".
 */

const PHONE_E164 = '+442476454350';
const PHONE_DISPLAY = '024 7645 4350';
const TEL = `tel:${PHONE_E164}`;

test.describe('§5.2 emergency flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('step 1: the hero Call button dials without scrolling', async ({ page }) => {
    const call = page.locator('#top').getByRole('link', { name: `Call ${PHONE_DISPLAY}` });

    await expect(call).toBeInViewport();
    await expect(call).toHaveAttribute('href', TEL);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // WCAG 2.2 AA 2.5.3 Label in Name: the accessible name starts with the
    // visible text, so a voice user can say what they can see.
    const accessibleName = await call.evaluate(
      (node) => node.getAttribute('aria-label') ?? node.textContent?.trim() ?? '',
    );
    expect(accessibleName.replace(/\s+/g, ' ')).toContain(PHONE_DISPLAY);
  });

  test('step 1: the Call button is a tap target of at least 44×44', async ({ page }) => {
    const box = await page
      .locator('#top')
      .getByRole('link', { name: `Call ${PHONE_DISPLAY}` })
      .boundingBox();

    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test('step 2: the call icon sits beside booking in the sticky bar', async ({ page }) => {
    await page.locator('#pricing').scrollIntoViewIfNeeded();

    const bar = page.locator('[data-sticky-cta]');
    await expect(bar).toHaveAttribute('data-visible', 'true');

    const call = bar.getByRole('link', { name: `Call the practice on ${PHONE_DISPLAY}` });
    await expect(call).toHaveAttribute('href', TEL);
    await expect(call).toBeInViewport();

    const box = await call.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  });

  test('step 3: the emergency band is separate, and routes to a call not a form', async ({
    page,
  }) => {
    const band = page.locator('#emergency');
    await band.scrollIntoViewIfNeeded();

    await expect(band.getByRole('heading')).toBeVisible();
    await expect(band).toContainText(/111/);

    const call = band.getByRole('link', { name: new RegExp(PHONE_DISPLAY) });
    await expect(call).toHaveAttribute('href', TEL);

    // "No form, no gate, no callback promise on this path."
    await expect(band.locator('form')).toHaveCount(0);
    await expect(band.locator('input, select, textarea')).toHaveCount(0);

    // A large target, not an inline link among prose.
    const box = await call.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  });

  test('the band is visually distinct from the booking path', async ({ page }) => {
    const band = page.locator('#emergency');
    await band.scrollIntoViewIfNeeded();

    const bandBg = await band.evaluate((node) => getComputedStyle(node).backgroundColor);
    const heroBg = await page
      .locator('#top')
      .evaluate((node) => getComputedStyle(node).backgroundColor);

    expect(bandBg).not.toBe(heroBg);
  });

  test('every route to the number uses the same E.164 href', async ({ page }) => {
    const hrefs = await page
      .locator('a[href^="tel:"]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));

    expect(hrefs.length).toBeGreaterThan(0);
    expect(new Set(hrefs)).toEqual(new Set([TEL]));
  });
});
