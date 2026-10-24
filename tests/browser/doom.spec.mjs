import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start Eden', exact: true })).toBeEnabled({ timeout: 40_000 });
  return page.frames().find((frame) => frame.url().includes('/doom/'));
}

test('Doom boots offline with a nonblank source at Deck resolution', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const frame = await boot(page);
  await expect.poll(() => frame.evaluate(() => window.doomBridge.frames)).toBeGreaterThan(5);
  const image = await frame.evaluate(() => {
    const canvas = window.doomBridge.source;
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let nonblack = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i] + pixels[i + 1] + pixels[i + 2] > 20) nonblack++;
    return nonblack / (pixels.length / 4);
  });
  expect(image).toBeGreaterThan(.2);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/doom-deck-original.png' });
});

test('keyboard and analog gamepad move the real Doom player; unplug releases movement', async ({ page }) => {
  const frame = await boot(page);
  const before = await frame.evaluate(() => window.doomBridge.pose);
  await page.locator('#doom').focus();
  await page.keyboard.down('w');
  await expect.poll(() => frame.evaluate(async () => {
    const state = await import('/doom/src/doomstat.js');
    return state.players[state.consoleplayer].cmd.forwardmove;
  })).toBe(6);
  await page.waitForTimeout(350); await page.keyboard.up('w');
  const keyboard = await frame.evaluate(() => window.doomBridge.pose);
  expect(keyboard).not.toEqual(before);
  await frame.evaluate(() => {
    window.testPad = { connected: true, mapping: 'standard', axes: [0, -1, .7, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [window.testPad] });
  });
  await page.waitForTimeout(400);
  const analogCommand = await frame.evaluate(async () => {
    const state = await import('/doom/src/doomstat.js');
    return { forward: state.players[state.consoleplayer].cmd.forwardmove, turn: state.players[state.consoleplayer].cmd.angleturn };
  });
  expect(analogCommand.forward).toBe(6);
  expect(Math.abs(analogCommand.turn)).toBeGreaterThan(0);
  expect(Math.abs(analogCommand.turn)).toBeLessThanOrEqual(320);
  const analog = await frame.evaluate(() => window.doomBridge.pose);
  expect(analog.angle).not.toEqual(keyboard.angle);
  expect([analog.x, analog.y]).not.toEqual([keyboard.x, keyboard.y]);
  await frame.evaluate(() => { window.testPad = null; });
  await page.waitForTimeout(100);
  const released = await frame.evaluate(() => window.doomBridge.pose);
  await page.waitForTimeout(250);
  const stopped = await frame.evaluate(() => window.doomBridge.pose);
  // Doom friction may keep position moving briefly; turning must cease at once.
  expect(stopped.angle).toEqual(released.angle);
});

test('cloud failures return to the playable original, and restart boots a fresh level', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: 'Start Eden', exact: true }).click();
  await expect(page.locator('#error')).toContainText('REACTOR_API_KEY');
  await expect(page.locator('#waiting')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Start Eden', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Restart level', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start Eden', exact: true })).toBeEnabled({ timeout: 40_000 });
  await expect(page.locator('#stage')).toHaveAttribute('data-view', 'raw');
});

test('theater mode has a touch-accessible way back to setup', async ({ page }) => {
  await page.goto('/?theater=1');
  const control = page.getByRole('button', { name: 'Show demo controls' });
  await expect(control).toBeVisible();
  await control.click();
  await expect(page.getByRole('button', { name: 'Setup', exact: true })).toBeVisible();
});
