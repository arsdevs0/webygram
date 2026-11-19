import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
const modulePath = process.env.PLAYWRIGHT_MODULE || process.argv[2];
if (!modulePath) throw Error('Pass the installed playwright/index.mjs path.');
const { chromium } = await import(pathToFileURL(modulePath).href);
process.env.VITE_DIRECT_TELEGRAM = 'false';
const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
const failures = [], checks = [];
try {
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, permissions: ['microphone'] });
  let seenRequests = 0, failReceipt = false, slowPhoto = false;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
  await context.route('**/fixture-photo.png', async route => { if (slowPhoto) await new Promise(resolve => setTimeout(resolve, 1800)); await route.fulfill({ contentType: 'image/png', body: png }); });
  await context.route('**/api/**', async route => {
    if (route.request().url().endsWith('/mark-seen')) { seenRequests++; await route.fulfill({ status: failReceipt ? 400 : 200, json: failReceipt ? { error: 'offline' } : { ok: true, contentsSeen: true, historyRead: true, readAt: Date.now() } }); }
    else await route.fulfill({ json: {} });
  });
  const page = await context.newPage();
  page.on('pageerror', error => failures.push(error.message));
  await page.goto(origin + '/tests/ui/voiceReceipt.html');
  const fits = async () => page.evaluate(() => { const node = document.querySelector('.tg-recording'); if (!node) return false; const box = node.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && node.scrollWidth <= node.clientWidth + 1 && box.bottom <= innerHeight; });
  const mic = () => page.getByRole('button', { name: /Record Voice/ });
  await mic().click(); await page.getByRole('group', { name: 'Voice recording' }).waitFor();
  assert.equal(await fits(), true);
  await page.screenshot({ path: '.local/recording-320-light.png' });
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.evaluate(() => window.voiceSends.length), 0);
  checks.push('320px recording bar and cancel');

  for (const [width, height] of [[320, 300], [360, 740], [390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => document.documentElement.classList.add('dark'));
    await mic().click(); await page.getByRole('group', { name: 'Voice recording' }).waitFor();
    assert.equal(await fits(), true);
    await page.evaluate(() => { const time = document.querySelector('.tg-recording-time'); time.textContent = '120:59'; const detail = document.querySelector('.tg-recording-detail span'); detail.textContent = 'A very long custom voice preset name for narrow mobile screens'; });
    assert.equal(await fits(), true);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  }
  checks.push('both themes, long timer/preset and keyboard-height viewport');
  await page.setViewportSize({ width: 320, height: 640 });
  const press = async () => { const box = await mic().boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.waitForTimeout(350); return box; };
  let box = await press(); await page.getByRole('group', { name: 'Voice recording' }).waitFor();
  await page.mouse.move(box.x - 90, box.y + 20); await page.mouse.up();
  await mic().waitFor(); assert.equal(await page.evaluate(() => window.voiceSends.length), 0);
  checks.push('hold and slide to cancel');
  box = await press(); await page.mouse.move(box.x + 20, box.y - 90); await page.mouse.up();
  assert.equal(await page.locator('.tg-recording').getAttribute('data-locked'), 'true');
  await page.waitForTimeout(350); await page.getByRole('button', { name: 'Send Voice Message', exact: true }).click();
  await page.getByRole('button', { name: 'Retry voice' }).waitFor();
  assert.equal(await page.evaluate(() => window.voiceSends.length), 1);
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  checks.push('slide up locks; explicit send retains failed recording');
  await page.evaluate(() => window.delayCapture = 1000);
  box = await press(); await page.mouse.move(box.x - 90, box.y + 20); await page.mouse.up();
  await page.waitForTimeout(1200); assert.equal(await page.locator('.tg-recording').count(), 0); assert.equal(await page.evaluate(() => window.voiceSends.length), 1);
  checks.push('cancel while microphone is still starting');

  slowPhoto = true;
  await page.evaluate(() => window.setCase('viewer'));
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.mediaState().expiresAt), undefined);
  assert.ok(!(await page.locator('.tg-media-toolbar').innerText()).includes('remaining'));
  await page.waitForTimeout(1300); slowPhoto = false;
  failReceipt = true; await page.getByRole('button', { name: 'Mark seen', exact: true }).click();
  await page.getByText('Could not notify the sender.', { exact: false }).waitFor();
  assert.equal(await page.evaluate(() => window.mediaState().viewed), undefined);
  failReceipt = false; await page.getByRole('button', { name: 'Mark seen', exact: true }).click();
  await page.getByRole('button', { name: 'Opened ✓', exact: true }).waitFor();
  const started = await page.evaluate(() => window.mediaState().expiresAt);
  assert.ok(started > Date.now());
  await page.evaluate(() => window.receiveOpen(Date.now() + 2000));
  assert.equal(await page.evaluate(() => window.mediaState().expiresAt), started);
  checks.push('slow load, failed receipt, real successful receipt, duplicate deadline');
  await page.evaluate(() => window.setCase('voice'));
  await mic().waitFor();
  await page.evaluate(() => window.setCase('viewer', true, 30));
  await page.getByText('Waiting for recipient', { exact: true }).waitFor();
  await page.evaluate(() => window.receiveOpen(Date.now()));
  await page.getByText('30s remaining', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Mark seen', exact: true }).count(), 0);
  checks.push('sender timer starts on received Telegram content update');
  await page.screenshot({ path: '.local/timed-media-320-dark.png' });

  await page.evaluate(() => window.setCase('compose'));
  await page.locator('input[type=file]').setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'View once', exact: true }).click();
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await page.getByRole('button', { name: 'Retry send', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.timedSend.expireSeconds), 0x7fffffff);
  assert.equal(await page.locator('.tg-attachment-preview img').count(), 1);
  checks.push('view once uses Telegram sentinel; failed timed send retains media');
  assert.deepEqual(failures, []);
  fs.mkdirSync('.local', { recursive: true });
  fs.writeFileSync('.local/recording-receipts-results.json', JSON.stringify({ passed: true, checks, seenRequests }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, seenRequests }));
} catch (error) { console.error(error); console.error(failures); process.exitCode = 1; }
finally { await browser.close(); await server.close(); }
