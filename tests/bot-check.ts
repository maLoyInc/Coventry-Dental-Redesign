import type { Page } from '@playwright/test';

/**
 * Takes Turnstile out of the picture for a test.
 *
 * Two things this buys, and the second one is newer and more important than
 * the first.
 *
 * It keeps the suite off the network: the widget would otherwise fetch
 * challenges.cloudflare.com on every page load, and these tests are about the
 * form, not about Cloudflare's uptime.
 *
 * And it makes the suite independent of which site key the build under test
 * happens to carry. That used to be Cloudflare's test key, which renders a
 * widget that always issues a token, so a test could submit the form without
 * thinking about the bot check at all. The deployable build carries the real
 * site key, which will not issue a token for 127.0.0.1 — and a submit handler
 * that awaits a token it never gets simply never submits. The a11y spec's
 * confirmation-state test failed exactly there, on nothing but a changed
 * `.env`. Any test that submits the form calls this first.
 *
 * Must be called before `page.goto`: the route and the init script both have to
 * be in place before the document loads.
 */
export async function stubBotCheck(page: Page): Promise<void> {
  await page.route('https://challenges.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }),
  );
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => {
      const container = document.querySelector('[data-bot-check]');
      if (!container) return;
      const field = document.createElement('input');
      field.type = 'hidden';
      field.name = 'botToken';
      field.value = 'test-token';
      container.append(field);
    });
  });
}
