import { test, expect, type Page } from '@playwright/test';
import { stubBotCheck } from '../bot-check';

/**
 * PRD §5.1 — landing to booking, step by step.
 *
 * The steps are asserted in the order a reader meets them, and each test names
 * the step it covers, so a failure says which part of the flow broke rather
 * than which selector moved.
 */

/** The practice number, in both the forms the page uses. */
const PHONE_E164 = '+442476454350';
const PHONE_DISPLAY = '024 7645 4350';

test.describe('§5.1 primary flow — landing to booking', () => {
  test.beforeEach(async ({ page }) => {
    await stubBotCheck(page);
    await page.goto('/');
  });

  test('step 1: category, provider and location land before any scroll', async ({ page }) => {
    // F11 — the disclaimer is not dismissible, so it is simply present.
    await expect(page.getByText(/not affiliated/i).first()).toBeVisible();

    const heading = page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/years/i);

    // F1 — both actions inside the first viewport, no scrolling.
    const hero = page.locator('#top');
    const book = hero.getByRole('link', { name: 'Book a consultation' });
    const call = hero.getByRole('link', { name: `Call ${PHONE_DISPLAY}` });

    for (const action of [book, call]) {
      await expect(action).toBeInViewport();
    }
    await expect(call).toHaveAttribute('href', `tel:${PHONE_E164}`);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);

    // F4 — five anchors, no submenus.
    const nav = page.getByRole('navigation').first().getByRole('link');
    expect(await nav.count()).toBeLessThanOrEqual(5);
  });

  test('step 2: the sticky bar appears once the hero actions scroll away', async ({ page }) => {
    const bar = page.locator('[data-sticky-cta]');

    // Enhanced and holding back while the hero's own buttons are on screen.
    await expect(bar).toHaveAttribute('data-enhanced', '');
    await expect(bar).toHaveAttribute('data-visible', 'false');

    await page.locator('#pricing').scrollIntoViewIfNeeded();
    await expect(bar).toHaveAttribute('data-visible', 'true');
    await expect(bar.getByRole('link', { name: 'Book a consultation' })).toBeInViewport();

    // F2 — "persists to page end".
    await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
    await expect(bar).toHaveAttribute('data-visible', 'true');
  });

  test('step 3: a card expands in place and does not navigate away', async ({ page }) => {
    // F5 — exactly four.
    const cards = page.locator('[data-treatment-card]');
    await expect(cards).toHaveCount(4);

    const before = page.url();
    const card = page.locator('#treatment-all-on-4');
    await card.getByRole('group').or(card.locator('summary')).first().click();

    await expect(card).toHaveAttribute('open', '');
    expect(new URL(page.url()).pathname).toBe(new URL(before).pathname);

    // Exclusive accordion: opening one closes the last.
    const other = page.locator('#treatment-invisalign');
    await other.locator('summary').click();
    await expect(other).toHaveAttribute('open', '');
    await expect(card).not.toHaveAttribute('open', '');
  });

  test('step 7: arriving from a card pre-fills the treatment', async ({ page }) => {
    const card = page.locator('#treatment-invisalign');
    await card.locator('summary').click();
    await card.locator('[data-enquire-about="invisalign"]').click();

    await expect(page.locator('select[name="treatmentSlug"]')).toHaveValue('invisalign');
  });

  test('step 7: a deep link to a treatment anchor pre-fills it too', async ({ page }) => {
    await page.goto('/#treatment-cosmetic-dentistry');
    await expect(page.locator('select[name="treatmentSlug"]')).toHaveValue('cosmetic-dentistry');
  });

  test('F8: errors appear on blur, not on keystroke, and are announced', async ({ page }) => {
    const email = page.locator('input[name="email"]');
    const slot = page.locator('[data-error-for="email"]');

    await email.fill('not-an-address');
    // Still typing — nothing said yet.
    await expect(slot).toBeEmpty();

    await email.blur();
    await expect(slot).toHaveText('Enter a valid email address');
    await expect(email).toHaveAttribute('aria-invalid', 'true');

    // The message is in a live region wired to the field.
    await expect(slot).toHaveAttribute('aria-live', 'polite');
    await expect(email).toHaveAttribute('aria-describedby', await slot.getAttribute('id') ?? '');

    // Fixing it clears the mark immediately rather than waiting for another blur.
    await email.fill('jo@example.com');
    await expect(slot).toBeEmpty();
    await expect(email).not.toHaveAttribute('aria-invalid', 'true');
  });

  test('F8: an empty submit reports every field and focuses the first', async ({ page }) => {
    await page.locator('#enquire').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Request a callback' }).click();

    await expect(page.locator('[data-enquiry-status]')).toHaveText(/answers need checking/);
    for (const field of ['treatmentSlug', 'name', 'phone', 'email', 'preferredTime', 'consent']) {
      await expect(page.locator(`[data-error-for="${field}"]`)).not.toBeEmpty();
    }
    await expect(page.locator('select[name="treatmentSlug"]')).toBeFocused();
  });

  test('step 8: success replaces the form with the confirmation and the number', async ({
    page,
  }) => {
    /*
     * The endpoint is intercepted rather than driven for real. The local
     * Worker has no Resend key — by design, .env.example is explicit that it
     * must never hold the practice's — so a genuine submit answers 502 every
     * time and the success branch would never run. What is under test here is
     * the island's success behaviour; the endpoint's own pipeline is covered
     * in api-enquiry.spec.ts against the real route.
     */
    let posted: Record<string, unknown> | null = null;
    await page.route('**/api/enquiry', async (route) => {
      posted = JSON.parse(route.request().postData() ?? '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, message: 'Thank you', errors: {} }),
      });
    });

    await fillEnquiry(page);
    await page.getByRole('button', { name: 'Request a callback' }).click();

    const confirmation = page.locator('[data-enquiry-confirmation]');
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole('heading')).toHaveText(/thank you/i);
    await expect(confirmation).toContainText('within one working day');
    await expect(confirmation).toBeFocused();

    // F9 — the phone number is the fallback in the success state too.
    await expect(confirmation.getByRole('link', { name: `Call ${PHONE_DISPLAY}` })).toHaveAttribute(
      'href',
      `tel:${PHONE_E164}`,
    );
    await expect(page.locator('[data-enquiry-form]')).toBeHidden();

    // F7 — five fields and the consent box. Nothing else but the bot token.
    expect(Object.keys(posted ?? {}).sort()).toEqual([
      'botToken',
      'company',
      'consent',
      'email',
      'name',
      'phone',
      'preferredTime',
      'treatmentSlug',
    ]);
  });

  test('step 8: failure keeps every answer and points at the phone number', async ({ page }) => {
    await page.route('**/api/enquiry', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, message: 'That did not send', errors: {} }),
      }),
    );

    await fillEnquiry(page);
    await page.getByRole('button', { name: 'Request a callback' }).click();

    await expect(page.locator('[data-enquiry-status]')).toHaveText(/did not send/i);
    // The form is still there, still filled, and the button works again.
    await expect(page.locator('[data-enquiry-form]')).toBeVisible();
    await expect(page.locator('input[name="name"]')).toHaveValue('Test Placeholder');
    await expect(page.getByRole('button', { name: 'Request a callback' })).toBeEnabled();

    const fallback = page.locator('[data-enquiry-form]').getByRole('link', {
      name: PHONE_DISPLAY,
    });
    await expect(fallback).toHaveAttribute('href', `tel:${PHONE_E164}`);
  });

  test('step 8: server field errors are painted into the same slots', async ({ page }) => {
    await page.route('**/api/enquiry', (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          message: 'Some answers need checking.',
          errors: { phone: 'That does not look like a phone number we can call' },
        }),
      }),
    );

    await fillEnquiry(page);
    await page.getByRole('button', { name: 'Request a callback' }).click();

    await expect(page.locator('[data-error-for="phone"]')).toHaveText(
      'That does not look like a phone number we can call',
    );
    await expect(page.locator('input[name="phone"]')).toBeFocused();
  });
});

/** Fill the five fields and the consent box with obviously-placeholder values. */
async function fillEnquiry(page: Page): Promise<void> {
  await page.locator('select[name="treatmentSlug"]').selectOption('dental-implants');
  await page.locator('input[name="name"]').fill('Test Placeholder');
  await page.locator('input[name="phone"]').fill('01234 567890');
  await page.locator('input[name="email"]').fill('test@example.com');
  await page.locator('input[name="preferredTime"][value="morning"]').check();
  await page.locator('input[name="consent"]').check();
}
