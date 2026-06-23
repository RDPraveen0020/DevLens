import { test, expect, chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Best-effort end-to-end smoke against a real Chromium with the unpacked
 * extension loaded. Requires a display (headed) and `npm run build:chromium`
 * first. The authoritative behavioral coverage is the Vitest suite
 * (see tests/integration/inspect-loop.test.ts). If the activation path proves
 * flaky in CI, mark this test `test.skip` and use the manual checklist in the
 * plan (Task 14, Step 8).
 */
const root = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.resolve(root, '../dist/chromium');

test('shows Angular component name in the tooltip', async () => {
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [`--disable-extensions-except=${distPath}`, `--load-extension=${distPath}`],
  });
  try {
    const page = await context.newPage();
    await page.goto('file://' + path.resolve(root, '../test-fixtures/angular-dev.html'));

    // Inject the bridge + content scripts the way the background would, then activate.
    await page.addScriptTag({ path: path.join(distPath, 'bridge.js') });
    await page.addScriptTag({ path: path.join(distPath, 'content.js') });
    await page.evaluate(() => window.postMessage({ __devlensTest: true }, '*'));

    const target = page.locator('#target');
    await target.hover();

    const overlayText = await page.evaluate(() => {
      const host = document.getElementById('devlens-overlay');
      return host?.shadowRoot?.querySelector('.dl-path')?.textContent ?? '';
    });
    expect(overlayText).toContain('app-user-card');
  } finally {
    await context.close();
  }
});
