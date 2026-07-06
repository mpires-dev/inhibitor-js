import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/benchmark.html');
  await page.waitForFunction(() => typeof window.InhibitorFixture === 'function');
});

test('invalid endpoint fails closed before any request', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') requests.push(request.url()); });
  const result = await page.evaluate(async () => {
    const sdk = new window.InhibitorFixture({ endpoint: 'http://evil.example/events', transport: { enabled: true } });
    try { await sdk.initialize(); return 'accepted'; }
    catch (error) { return (error as { code?: string }).code; }
  });
  expect(result).toBe('INVALID_CONFIG');
  expect(requests).toEqual([]);
});

test('HTTP failure is observable and queued, then stop clears it', async ({ page }) => {
  await page.route('http://127.0.0.1:4173/api', route => route.fulfill({ status: 503, body: 'unavailable' }));
  const result = await page.evaluate(async () => {
    const sdk = new window.InhibitorFixture({ endpoint: 'http://127.0.0.1:4173/api', transport: { enabled: true, maxRetries: 0 } });
    await sdk.initialize();
    await sdk.start({ consent: true });
    const flush = await sdk.flush();
    const pending = sdk.getQueueStats().depth;
    await sdk.stop();
    const afterStop = sdk.getQueueStats().depth;
    await sdk.dispose();
    return { flush, pending, afterStop };
  });
  expect(result.flush).toMatchObject({ ok: false, error: { code: 'HTTP_ERROR', status: 503 } });
  expect(result.pending).toBe(1);
  expect(result.afterStop).toBe(0);
});

test('closed shadow input is excluded and visibility remains aggregate', async ({ page }) => {
  const snapshot = await page.evaluate(async () => {
    const sdk = new window.InhibitorFixture({ sampling: { pointer: 1 } });
    await sdk.start({ consent: true });
    const host = document.createElement('div');
    const shadow = host.attachShadow({ mode: 'closed' });
    const input = document.createElement('input');
    shadow.append(input);
    document.body.append(host);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'PRIVATE', bubbles: true, composed: true }));
    input.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    document.dispatchEvent(new Event('visibilitychange'));
    const data = await sdk.getSessionSignals();
    await sdk.dispose();
    return data;
  });
  expect(snapshot.behavior).toMatchObject({ pointerEventCount: 0, keyboardEventCount: 0, visibilityChangeCount: 1 });
  expect(JSON.stringify(snapshot)).not.toContain('PRIVATE');
});
