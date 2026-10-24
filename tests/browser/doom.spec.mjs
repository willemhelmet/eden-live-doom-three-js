import { test, expect } from '@playwright/test';

async function boot(page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Start Eden', exact: true })).toBeEnabled({ timeout: 40_000 });
  return page.frames().find((frame) => frame.url().includes('/doom/'));
}

test('Doom boots without a key with a nonblank source', async ({ page }) => {
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
  await expect(page.locator('#key-message')).toContainText('Add your Reactor API key');
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
  await expect(page.getByLabel('Your Reactor API key')).toBeVisible();
});


test('BYOK requests go directly to Reactor and failures never echo keys', async ({ page }) => {
  const key = 'browser-test-key-not-a-real-credential';
  let tokenRequest;
  let brokerRequests = 0;
  page.on('request', request => { if (request.url().includes('/api/token')) brokerRequests++; });
  await page.route('https://api.reactor.inc/tokens', async route => {
    tokenRequest = route.request();
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: key }) });
  });
  await boot(page);
  await page.getByLabel('Your Reactor API key').fill(key);
  await page.getByRole('button', { name: 'Start Eden', exact: true }).click();
  await expect(page.locator('#key-message')).toContainText('That API key was not accepted');
  await expect(page.locator('#key-message')).not.toContainText(key);
  await expect(page.locator('#waiting')).toBeHidden();
  await expect(page.getByLabel('Your Reactor API key')).toBeEditable();
  await expect(page.getByLabel('Your Reactor API key')).toBeFocused();
  expect(tokenRequest.headers()['reactor-api-key']).toBe(key);
  expect(tokenRequest.postDataJSON().authorization_details[0].constraints.max_sessions).toBe(1);
  expect(brokerRequests).toBe(0);
  const storage = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }));
  expect(JSON.stringify(storage)).not.toContain(key);
  await page.reload();
  await expect(page.getByLabel('Your Reactor API key')).toHaveValue('');
});

test('remix config excludes credentials and clear key resets reveal state', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await boot(page);
  const key = 'copy-config-test-key';
  await page.getByLabel('Your Reactor API key').fill(key);
  await page.getByRole('button', { name: 'Show API key' }).click();
  await expect(page.getByLabel('Your Reactor API key')).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Copy config' }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).not.toContain(key);
  expect(JSON.parse(copied)).toMatchObject({ model: 'reactor/eden-live', source: 'client', inputFps: 24 });
  await page.getByRole('button', { name: 'Clear key' }).click();
  await expect(page.getByLabel('Your Reactor API key')).toHaveValue('');
  await expect(page.getByLabel('Your Reactor API key')).toHaveAttribute('type', 'password');
});


test('Use key validates without starting a model session and clearing restores the key alert', async ({ page }) => {
  let tokenRequests = 0;
  let modelRequests = 0;
  page.on('request', request => {
    if (request.url().startsWith('https://api.reactor.inc/') && !request.url().endsWith('/tokens')) modelRequests++;
  });
  await page.route('https://api.reactor.inc/tokens', async route => {
    tokenRequests++;
    await route.fulfill({ status: tokenRequests === 1 ? 200 : 401, contentType: 'application/json', body: tokenRequests === 1 ? JSON.stringify({ jwt: 'fake-validation-token' }) : '{}' });
  });
  await boot(page);
  await expect(page.locator('#key-alert')).toBeVisible();
  await page.getByLabel('Your Reactor API key').fill('validation-test-key');
  await page.getByRole('button', { name: 'Use key', exact: true }).click();
  await expect(page.locator('#key-alert')).toBeHidden();
  await expect(page.locator('#key-summary')).toBeVisible();
  await expect(page.locator('#waiting')).toBeHidden();
  expect(modelRequests).toBe(0);
  await page.getByRole('button', { name: 'Clear key' }).click();
  await expect(page.locator('#key-alert')).toBeVisible();
  await expect(page.getByLabel('Your Reactor API key')).toHaveValue('');
  await page.getByLabel('Your Reactor API key').fill('rejected-test-key');
  await page.getByRole('button', { name: 'Use key', exact: true }).click();
  await expect(page.locator('#key-message')).toContainText('That API key was not accepted');
  await expect(page.locator('#key-alert')).toBeVisible();
  expect(modelRequests).toBe(0);
});
