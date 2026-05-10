/**
 * Quick smoke test: load the dashboard, confirm the onboarding overlay is
 * visible, dismiss it, reload and confirm it stays dismissed.
 */
import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

async function main() {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE_PATH,
    headless: true,
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error('  ⚠ pageerror:', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  ⚠ console.error:', msg.text());
  });

  console.log('• 1st visit — onboarding should appear');
  await page.goto(`${BASE_URL}/gym`);
  await page.waitForLoadState('domcontentloaded');
  const overlay = page.locator('.onboarding-overlay');
  await overlay.waitFor({ state: 'visible', timeout: 5000 });
  const title = await page.locator('.onboarding-title').first().textContent();
  console.log(`  ✓ overlay visible, first slide title: "${title?.trim()}"`);

  // Walk through all slides via Next.
  for (let i = 0; i < 4; i++) {
    const t = await page.locator('.onboarding-title').first().textContent();
    console.log(`  step ${i + 1}: ${t?.trim()}`);
    await page.locator('.onboarding-next').click();
    await page.waitForTimeout(300);
  }

  // Overlay should now be gone.
  const stillVisible = await overlay.isVisible().catch(() => false);
  console.log(`  ✓ overlay closed after final tap: ${!stillVisible}`);

  console.log('• 2nd visit — onboarding should NOT appear');
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(1500);
  const reappeared = await overlay.isVisible().catch(() => false);
  console.log(`  ✓ overlay stays dismissed: ${!reappeared}`);

  if (stillVisible || reappeared) {
    console.error('\n✗ FAIL — overlay state incorrect');
    process.exit(2);
  }

  await ctx.close();
  await browser.close();
  console.log('\n✓ onboarding smoke test passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
