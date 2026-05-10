/**
 * Captures component-level stills from the dev server for the onboarding videos.
 * Outputs into public/onboarding-stills/<feature>/<state>.png so Remotion can
 * import them via staticFile().
 *
 * Run with the dev server already running on http://127.0.0.1:5173. Example:
 *   npm run dev -- --host 127.0.0.1 &
 *   node scripts/capture-onboarding-stills.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'onboarding-stills');

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:5173';
const EXECUTABLE_PATH =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const VIEWPORT = { width: 412, height: 915 };
const TIME_MODE_KEY = 'gym:settings:time-mode';

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function gotoStable(page, route, mode = 'daytime') {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [TIME_MODE_KEY, mode],
  );
  await page.goto(`${BASE_URL}${route}`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(500);
}

async function shotEl(page, selector, outPath) {
  await ensureDir(path.dirname(outPath));
  const el = page.locator(selector).first();
  try {
    await el.waitFor({ state: 'visible', timeout: 4000 });
    await el.screenshot({ path: outPath, omitBackground: false });
    console.log(`  → ${path.relative(ROOT, outPath)}`);
  } catch (err) {
    console.log(`  ! skipped ${path.relative(ROOT, outPath)} (${err.message.split('\n')[0]})`);
  }
}

async function shotPage(page, outPath) {
  await ensureDir(path.dirname(outPath));
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`  → ${path.relative(ROOT, outPath)}`);
}

async function captureRoster(page) {
  console.log('• Roster + P&L window filter');
  const dir = path.join(OUT, 'roster-pnl');
  await gotoStable(page, '/gym');
  // Find the first agent card.
  await shotEl(page, '.agent-card', path.join(dir, '01-card-default.png'));
  // Switch to 7d on the first card.
  const card = page.locator('.agent-card').first();
  const sevenD = card.getByRole('radio', { name: /7d/i }).first();
  await sevenD.click().catch(() => {});
  await page.waitForTimeout(400);
  await shotEl(page, '.agent-card', path.join(dir, '02-card-7d.png'));
  // Lifetime.
  const lifetime = card.getByRole('radio', { name: /lifetime/i }).first();
  await lifetime.click().catch(() => {});
  await page.waitForTimeout(400);
  await shotEl(page, '.agent-card', path.join(dir, '03-card-lifetime.png'));
  // Just the filter pill on its own as a focal element.
  await shotEl(page, '.time-filter-pill', path.join(dir, '04-pill.png'));
}

async function captureBattleArena(page) {
  console.log('• Battle Arena bottom sheet');
  const dir = path.join(OUT, 'battle-arena');
  await gotoStable(page, '/gym');
  await page.waitForTimeout(800);
  // The In Battle pill button — accessible name is "Open battle arena for ..."
  const inBattle = page.locator('button.in-battle-pill').first();
  const hasPill = await inBattle.count();
  if (hasPill === 0) {
    console.log('  ! No In Battle pill in DOM — capturing default card only');
    await shotEl(page, '.agent-card', path.join(dir, '01-card-no-battle.png'));
    return;
  }
  // Card with In Battle pill — Apex has open position in mock data.
  await shotEl(page, '.agent-card.agent-card--in-battle', path.join(dir, '01-card-with-pill.png'));
  await shotEl(page, 'button.in-battle-pill', path.join(dir, '02-pill-focus.png'));
  await inBattle.click();
  await page.waitForTimeout(600);
  await shotPage(page, path.join(dir, '03-sheet-open.png'));
  const sheet = page.locator('[role="dialog"], .battle-arena').first();
  if (await sheet.count()) {
    await ensureDir(dir);
    await sheet.screenshot({ path: path.join(dir, '04-sheet-only.png') });
    console.log(`  → public/onboarding-stills/battle-arena/04-sheet-only.png`);
  }
}

async function captureTradeLog(page) {
  console.log('• Trade log');
  const dir = path.join(OUT, 'trade-log');
  await gotoStable(page, '/gym');
  // The trade log lives inside expanded agent card on focus pages.
  await page.goto(`${BASE_URL}/apex`);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(700);
  // Try locator for trade log. AgentCardExpandedBody renders it.
  const log = page.locator('.trade-log, [data-onboarding="trade-log"]').first();
  if (await log.count()) {
    await shotEl(page, '.trade-log, [data-onboarding="trade-log"]', path.join(dir, '01-log.png'));
  } else {
    await shotPage(page, path.join(dir, '01-page.png'));
  }
}

async function captureTimeOfDay(page) {
  console.log('• Time-of-day toggle + atmosphere');
  const dir = path.join(OUT, 'time-of-day');
  await gotoStable(page, '/gym', 'daytime');
  await shotEl(page, 'button[aria-label="Time of day settings"]', path.join(dir, '01-cog.png'));
  await page.locator('button[aria-label="Time of day settings"]').click();
  await page.waitForTimeout(300);
  await shotPage(page, path.join(dir, '02-popover-open.png'));
  // Click moonlit
  const moon = page.getByRole('button', { name: /moonlit/i }).first();
  if (await moon.count()) await moon.click();
  await page.waitForTimeout(700);
  await shotPage(page, path.join(dir, '03-moonlit.png'));
  // Dusk
  await page.locator('button[aria-label="Time of day settings"]').click();
  await page.waitForTimeout(200);
  const dusk = page.getByRole('button', { name: /dusk/i }).first();
  if (await dusk.count()) await dusk.click();
  await page.waitForTimeout(600);
  await shotPage(page, path.join(dir, '04-dusk.png'));
  // Daytime restore
  await page.locator('button[aria-label="Time of day settings"]').click();
  await page.waitForTimeout(200);
  const day = page.getByRole('button', { name: /daytime/i }).first();
  if (await day.count()) await day.click();
  await page.waitForTimeout(500);
  await shotPage(page, path.join(dir, '05-daytime.png'));
}

async function captureWorld(page) {
  console.log('• World V2 plaza atmosphere');
  const dir = path.join(OUT, 'world-v2');
  await gotoStable(page, '/');
  await page.waitForTimeout(2000); // Phaser scene boot
  await shotPage(page, path.join(dir, '01-plaza.png'));
}

async function main() {
  await ensureDir(OUT);
  const browser = await chromium.launch({
    executablePath: EXECUTABLE_PATH,
    headless: true,
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36',
  });
  const page = await ctx.newPage();
  page.on('pageerror', (err) => console.error('  ⚠ pageerror:', err.message));

  try {
    await captureRoster(page);
    await captureBattleArena(page);
    await captureTradeLog(page);
    await captureTimeOfDay(page);
    await captureWorld(page);
  } finally {
    await ctx.close();
    await browser.close();
  }
  console.log('\n✓ stills captured to public/onboarding-stills/');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
