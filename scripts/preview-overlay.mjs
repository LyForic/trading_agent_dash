import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';

const OUT = path.resolve('artifacts/onboarding-preview');
await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
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
await page.addInitScript(() => window.localStorage.removeItem('gym:onboarding:seen-v1'));
await page.goto('http://127.0.0.1:5173/gym');
await page.waitForSelector('.onboarding-overlay', { timeout: 5000 });

// Diagnose: report video readyState + error per slide.
for (let i = 1; i <= 4; i++) {
  await page.waitForTimeout(2000);
  const state = await page.evaluate(() => {
    const v = document.querySelector('video');
    if (!v) return null;
    return {
      src: v.currentSrc || v.src,
      readyState: v.readyState,
      networkState: v.networkState,
      error: v.error ? { code: v.error.code, message: v.error.message } : null,
      currentTime: v.currentTime,
      duration: v.duration,
      videoWidth: v.videoWidth,
      videoHeight: v.videoHeight,
      paused: v.paused,
    };
  });
  console.log(`slide ${i}:`, JSON.stringify(state));
  await page.screenshot({ path: path.join(OUT, `slide-${i}.png`) });
  if (i < 4) await page.locator('.onboarding-next').click();
}

await browser.close();
