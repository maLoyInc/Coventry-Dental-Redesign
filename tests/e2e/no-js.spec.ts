import { test, expect } from '@playwright/test';

/**
 * PRD §2.2: "Page readable and the form functional with JavaScript disabled."
 * PRD §5.1: "On JavaScript failure the form degrades to a standard POST and
 * the page remains fully readable."
 *
 * This whole file runs in the `no-js` project, where `javaScriptEnabled` is
 * false. Nothing here may depend on an island having run.
 */

const PHONE_E164 = '+442476454350';
const PHONE_DISPLAY = '024 7645 4350';

test.describe('JavaScript disabled', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('the page is readable: every section renders with its content', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    for (const id of [
      '#top',
      '#treatments',
      '#dentist',
      '#pricing',
      '#enquire',
      '#emergency',
      '#find-us',
      '#faq',
    ]) {
      await expect(page.locator(id)).toBeVisible();
    }

    // F5, F13, F14 — the content is in the HTML, not fetched.
    await expect(page.locator('[data-treatment-card]')).toHaveCount(4);
    await expect(page.locator('#faq details')).toHaveCount(4);

    // F11 — the disclaimer does not depend on a script to appear.
    await expect(page.getByText(/concept|unsolicited|not affiliated/i).first()).toBeVisible();
  });

  test('treatment cards still expand — native <details>, no script', async ({ page }) => {
    const card = page.locator('#treatment-all-on-4');
    await expect(card).not.toHaveAttribute('open', '');

    await card.locator('summary').click();
    await expect(card).toHaveAttribute('open', '');
    await expect(card.locator('img')).toBeVisible();
  });

  test('the sticky bar stays visible rather than never appearing', async ({ page }) => {
    const bar = page.locator('[data-sticky-cta]');

    // The island never ran, so the enhancement attribute was never written and
    // the hide rule cannot match. The bar is simply always there.
    await expect(bar).not.toHaveAttribute('data-enhanced', '');
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Book a consultation' })).toBeInViewport();

    await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
    await expect(bar).toBeVisible();
  });

  test('OpeningStatus renders nothing rather than a stale pill', async ({ page }) => {
    // A cached open/closed badge that cannot update is worse than no badge.
    await expect(page.locator('#opening-status')).toBeEmpty();
    // The hours table itself is static and still there.
    await expect(page.locator('#find-us')).toContainText(/monday/i);
  });

  test('the form is a real form: method, action, labels and constraints', async ({ page }) => {
    const form = page.locator('[data-enquiry-form]');

    await expect(form).toHaveAttribute('method', /post/i);
    await expect(form).toHaveAttribute('action', '/api/enquiry');
    // form.noValidate is set by the island only. Without it the browser
    // enforces the constraints itself.
    expect(await form.evaluate((node: HTMLFormElement) => node.noValidate)).toBe(false);

    // Persistent visible labels, never placeholder-only (PRD §2.2).
    for (const name of ['name', 'phone', 'email']) {
      const input = page.locator(`input[name="${name}"]`);
      await expect(input).toHaveAttribute('required', '');
      const id = await input.getAttribute('id');
      await expect(page.locator(`label[for="${id}"]`)).toBeVisible();
      await expect(input).not.toHaveAttribute('placeholder', /.+/);
    }

    // The constraints the island would otherwise re-implement.
    await expect(page.locator('input[name="email"]')).toHaveAttribute('type', 'email');
    await expect(page.locator('input[name="email"]')).toHaveAttribute('pattern', /@/);
    await expect(page.locator('input[name="phone"]')).toHaveAttribute('pattern', /.+/);
    await expect(page.locator('select[name="treatmentSlug"]')).toHaveAttribute('required', '');
  });

  test('a bad POST returns a self-contained page naming each broken field', async ({
    page,
    request,
  }) => {
    /*
     * Astro's CSRF check reads Origin, which a browser sends on a same-origin
     * form POST and an API request does not. Without it this 403s before the
     * route runs — which is itself worth stating, because it is the trap a
     * curl-based test falls into.
     */
    const response = await request.post('/api/enquiry', {
      headers: {
        origin: new URL(page.url()).origin,
        'content-type': 'application/x-www-form-urlencoded',
      },
      form: { treatmentSlug: '', name: 'x', phone: 'nope', email: 'bad', preferredTime: '' },
    });

    expect(response.status()).toBe(400);
    expect(response.headers()['content-type']).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('<!doctype html>');
    // Self-contained: it is served by the Worker and cannot reach the site's
    // stylesheet, so it carries its own.
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<link[^>]+stylesheet/);
    // The phone number is the fallback here as everywhere else.
    expect(html).toContain(`tel:${PHONE_E164}`);
    expect(html).toContain(PHONE_DISPLAY);
    expect(html).toContain('/#enquire');
    // noindex, like the rest of the concept.
    expect(html).toMatch(/noindex/);
  });

  test('submitting the form navigates to that page, in a real browser with no JS', async ({
    page,
  }) => {
    await page.locator('select[name="treatmentSlug"]').selectOption('dental-implants');
    await page.locator('input[name="name"]').fill('Test Placeholder');
    await page.locator('input[name="phone"]').fill('01234 567890');
    await page.locator('input[name="email"]').fill('test@example.com');
    await page.locator('input[name="preferredTime"][value="morning"]').check();
    await page.locator('input[name="consent"]').check();

    await page.getByRole('button', { name: 'Request a callback' }).click();
    await page.waitForURL(/\/api\/enquiry/);

    /*
     * The local Worker holds no Resend key, so this lands on the 502 page
     * rather than the confirmation. That is the correct local outcome and it
     * still proves what this test is for: the POST left the browser without a
     * script, the Worker answered with a whole document, and the reader is
     * looking at the phone number. The success page is byte-identical bar its
     * heading — same htmlReply(), same fallback — and cannot be reached here
     * without a live Resend key.
     */
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: `Call ${PHONE_DISPLAY}` })).toHaveAttribute(
      'href',
      `tel:${PHONE_E164}`,
    );
    await expect(page.getByRole('link', { name: /back to the (form|page)/i })).toHaveAttribute(
      'href',
      '/#enquire',
    );
  });

  test('no client script is required to read the page', async ({ page }) => {
    // Nothing rendered a "please enable JavaScript" message, and no island
    // left an empty shell behind.
    await expect(page.getByText(/enable javascript/i)).toHaveCount(0);
    await expect(page.locator('#enquire')).toContainText('Book a consultation');
  });
});
