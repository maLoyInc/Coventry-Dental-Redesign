import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { stubBotCheck } from '../bot-check';

/**
 * axe-core, as a build-failing check (PRD §2.2: WCAG 2.2 AA).
 *
 * Lighthouse also scores accessibility, but it runs a subset of these rules on
 * the initial render only. The states below — a card open, the form showing
 * errors, the confirmation replacing the form — are the ones a reader with a
 * screen reader actually spends time in, and none of them exist when the page
 * first paints.
 *
 * `wcag22aa` is included in the tag list, not assumed: axe only runs the 2.2
 * rules when asked for them.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const scan = (page: import('@playwright/test').Page) =>
  new AxeBuilder({ page }).withTags(TAGS);

/** Print the offending selectors rather than a bare count. */
function describe(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']): string {
  return violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.help}\n` +
        violation.nodes.map((node) => `    ${node.target.join(' ')}`).join('\n'),
    )
    .join('\n');
}

test.describe('axe-core — WCAG 2.2 AA', () => {
  test('the page as it first renders', async ({ page }) => {
    await page.goto('/');
    const { violations } = await scan(page).analyze();
    expect(describe(violations)).toBe('');
  });

  test('with a treatment card open', async ({ page }) => {
    await page.goto('/');
    await page.locator('#treatment-all-on-4 summary').click();
    await expect(page.locator('#treatment-all-on-4')).toHaveAttribute('open', '');

    const { violations } = await scan(page).analyze();
    expect(describe(violations)).toBe('');
  });

  test('with every FAQ open', async ({ page }) => {
    await page.goto('/');
    const summaries = page.locator('#faq summary');
    for (let i = 0; i < (await summaries.count()); i += 1) {
      await summaries.nth(i).click();
    }

    const { violations } = await scan(page).analyze();
    expect(describe(violations)).toBe('');
  });

  test('with the form showing validation errors', async ({ page }) => {
    await page.goto('/');
    await page.locator('#enquire').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Request a callback' }).click();
    await expect(page.locator('[data-error-for="name"]')).not.toBeEmpty();

    const { violations } = await scan(page).analyze();
    expect(describe(violations)).toBe('');
  });

  test('with the confirmation replacing the form', async ({ page }) => {
    // Without this the submit handler waits forever for a Turnstile token the
    // real site key will not issue to 127.0.0.1, and the confirmation never
    // replaces anything. See tests/bot-check.ts.
    await stubBotCheck(page);
    await page.route('**/api/enquiry', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'Thank you', errors: {} }),
      }),
    );
    await page.goto('/');

    await page.locator('select[name="treatmentSlug"]').selectOption('dental-implants');
    await page.locator('input[name="name"]').fill('Test Placeholder');
    await page.locator('input[name="phone"]').fill('01234 567890');
    await page.locator('input[name="email"]').fill('test@example.com');
    await page.locator('input[name="preferredTime"][value="morning"]').check();
    await page.locator('input[name="consent"]').check();
    await page.getByRole('button', { name: 'Request a callback' }).click();
    await expect(page.locator('[data-enquiry-confirmation]')).toBeVisible();

    const { violations } = await scan(page).analyze();
    expect(describe(violations)).toBe('');
  });

  test('the JavaScript-off reply page from /api/enquiry', async ({ page }) => {
    // A whole document written by hand in the Worker, with its own inline CSS.
    // Nothing about the site's accessibility work applies to it automatically.
    await page.goto('/');
    await page.locator('select[name="treatmentSlug"]').selectOption('dental-implants');
    await page.locator('input[name="name"]').fill('Test Placeholder');
    await page.locator('input[name="phone"]').fill('01234 567890');
    await page.locator('input[name="email"]').fill('test@example.com');
    await page.locator('input[name="preferredTime"][value="morning"]').check();
    await page.locator('input[name="consent"]').check();

    await page.evaluate(() => {
      const form = document.querySelector<HTMLFormElement>('[data-enquiry-form]');
      form?.submit(); // bypasses the island's listener — the degraded POST
    });
    await page.waitForURL(/\/api\/enquiry/);

    const { violations } = await scan(page).analyze();
    expect(describe(violations)).toBe('');
  });
});

test.describe('keyboard operability', () => {
  test('a skip link is the first tab stop and moves focus into the page', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');

    const skip = page.locator(':focus');
    await expect(skip).toBeVisible();
    await expect(skip).toHaveAttribute('href', /^#/);

    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
  });

  test('every interactive element has a visible focus ring', async ({ page }) => {
    await page.goto('/');

    const targets = page.locator('a[href], button, select, input:not([hidden])');
    const count = Math.min(await targets.count(), 40);

    for (let i = 0; i < count; i += 1) {
      const target = targets.nth(i);
      if (!(await target.isVisible())) continue;

      await target.focus();
      const outline = await target.evaluate((node) => {
        const style = getComputedStyle(node, ':focus-visible');
        return `${style.outlineStyle} ${style.outlineWidth} ${style.boxShadow}`;
      });
      expect(outline, `no focus indicator on element ${i}`).not.toBe('none 0px none');
    }
  });
});
