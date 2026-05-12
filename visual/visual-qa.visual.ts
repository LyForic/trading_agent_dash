import { expect, type Locator, type Page, test, type TestInfo } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'artifacts/visual/screenshots');
const TIME_MODE_KEY = 'gym:settings:time-mode';
const RECORDING_VIDEO = process.env.VISUAL_QA_VIDEO === '1';

async function gotoStable(page: Page, route: string) {
  await page.addInitScript(([key]) => {
    window.localStorage.setItem(key, 'daytime');
  }, [TIME_MODE_KEY]);
  await page.goto(route);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(350);
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  const filename = `${testInfo.project.name}-${name}.png`;
  const filePath = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: filePath, fullPage: false });
  await testInfo.attach(filename, {
    path: filePath,
    contentType: 'image/png',
  });
}

async function locatorScreenshot(locator: Locator, testInfo: TestInfo, name: string) {
  await fs.mkdir(SCREENSHOT_DIR, { recursive: true });
  const filename = `${testInfo.project.name}-${name}.png`;
  const filePath = path.join(SCREENSHOT_DIR, filename);
  await locator.screenshot({ path: filePath });
  await testInfo.attach(filename, {
    path: filePath,
    contentType: 'image/png',
  });
}

async function pauseForVideo(page: Page, duration = 2_400) {
  if (!RECORDING_VIDEO) return;
  await page.waitForTimeout(duration);
}

test.describe('visual QA captures', () => {
  test('town square overview @town', async ({ page }, testInfo) => {
    await gotoStable(page, '/town');
    await expect(page.getByLabel('Trading Gym town map')).toBeVisible();
    await screenshot(page, testInfo, 'town-square');
  });

  test('town square pathing into Apex room @town @apex', async ({ page }, testInfo) => {
    await gotoStable(page, '/town');
    await page.getByRole('button', { name: "Enter Apex's room" }).click();
    await page.waitForURL('**/apex', { timeout: 10_000 });
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await screenshot(page, testInfo, 'town-to-apex');
  });

  test('World V2 authored Apex slice @world-v2', async ({ page }, testInfo) => {
    const loaded = new Set<string>();
    page.on('requestfinished', (request) => {
      const url = request.url();
      if (url.includes('/world-v2/')) loaded.add(url);
    });

    await gotoStable(page, '/');
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('.world-v2-menu')).toBeVisible();
    expect([...loaded].some((url) => url.includes('/world-v2/maps/world-v2-apex-slice.tmj'))).toBe(true);
    expect([...loaded].some((url) => url.includes('/world-v2/layers/ground.png'))).toBe(true);
    expect([...loaded].some((url) => url.includes('/world-v2/layers/reference.png'))).toBe(false);
    await screenshot(page, testInfo, 'world-v2-authored-apex-slice');
  });

  test('World V2 debug overlay @world-v2', async ({ page }, testInfo) => {
    await gotoStable(page, '/?debugWorld');
    await expect(page.locator('canvas')).toBeVisible();
    await page.mouse.click(650, 520);
    await page.keyboard.press('2');
    await page.waitForTimeout(450);
    await screenshot(page, testInfo, 'world-v2-debug');
  });

  test('World V2 manifest overlay @world-v2', async ({ page }, testInfo) => {
    const loaded = new Set<string>();
    page.on('requestfinished', (request) => {
      const url = request.url();
      if (url.includes('/world-v2/')) loaded.add(url);
    });

    await gotoStable(page, '/?manifestWorld');
    await expect(page.locator('canvas')).toBeVisible();
    expect([...loaded].some((url) => url.includes('/world-v2/maps/world-v2-object-manifest.json'))).toBe(true);
    expect([...loaded].some((url) => url.includes('/world-v2/layers/reference.png'))).toBe(true);
    await screenshot(page, testInfo, 'world-v2-manifest');
  });

  test('Apex battle rig alignment @apex', async ({ page }, testInfo) => {
    await gotoStable(page, '/apex');
    await expect(page.locator('body[data-room="apex"]')).toBeAttached();
    await expect(page.locator('.room-agent--apex.room-agent--battle')).toBeVisible();
    await pauseForVideo(page);
    await screenshot(page, testInfo, 'apex-room');
    await locatorScreenshot(page.locator('.room-agent--apex.room-agent--battle'), testInfo, 'apex-battle-rig');
  });

  for (const route of ['/apex', '/gale', '/metheus'] as const) {
    test(`${route} room composition @rooms`, async ({ page }, testInfo) => {
      await gotoStable(page, route);
      await expect(page.locator(`body[data-room="${route.slice(1)}"]`)).toBeAttached();
      await screenshot(page, testInfo, `${route.slice(1)}-room`);
    });
  }
});
