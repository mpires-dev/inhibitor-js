// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Inhibitor } from './index.js';

beforeEach(() => { vi.stubGlobal('crypto', { randomUUID: () => '00000000-0000-4000-8000-000000000001' }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

describe('public lifecycle and privacy', () => {
  it('does not subscribe or send before explicit start', async () => {
    const listen = vi.spyOn(document, 'addEventListener');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const sdk = new Inhibitor({ endpoint: 'https://example.test/events' });
    await sdk.initialize();
    expect(sdk.getState()).toBe('initialized');
    expect(listen).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    await expect(sdk.start({ consent: false })).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    expect(listen).not.toHaveBeenCalled();
    await sdk.dispose();
  });

  it('excludes editable key events and pointer coordinates and cleans up on stop', async () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    const sdk = new Inhibitor({ sampling: { pointer: 1 } });
    const input = document.createElement('input');
    const button = document.createElement('button');
    document.body.append(input, button);
    await sdk.start({ consent: true });
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'SECRET', bubbles: true, composed: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'X', bubbles: true, composed: true }));
    button.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    const data = await sdk.getSessionSignals();
    expect(data.behavior?.keyboardEventCount).toBe(1);
    expect(data.behavior?.pointerEventCount).toBe(1);
    expect(JSON.stringify(data)).not.toMatch(/SECRET|clientX|coordinates|"key"/);
    await sdk.stop();
    expect(remove.mock.calls.map(c => c[0])).toEqual(expect.arrayContaining(['pointerdown', 'keydown', 'visibilitychange']));
    button.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true }));
    expect((await sdk.getSessionSignals()).behavior?.keyboardEventCount).toBe(1);
    await sdk.dispose();
  });

  it('rotates session ID and remains disposed', async () => {
    let n = 0;
    vi.stubGlobal('crypto', { randomUUID: () => `session-${++n}` });
    const sdk = new Inhibitor({ collect: { behavior: false } });
    await sdk.start({ consent: true });
    const first = (await sdk.getSessionSignals()).session.id;
    await sdk.stop();
    await sdk.start({ consent: true });
    expect((await sdk.getSessionSignals()).session.id).not.toBe(first);
    await sdk.dispose();
    await sdk.dispose();
    await expect(sdk.start({ consent: true })).rejects.toMatchObject({ code: 'DISPOSED' });
  });

  it('observes failed delivery and preserves a bounded queue', async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, sent: 0, pending: 1, error: { code: 'NETWORK_ERROR', message: 'offline' } });
    const sdk = new Inhibitor({ transport: { enabled: true, adapter: { send }, maxQueueSize: 2 } });
    await sdk.start({ consent: true });
    await sdk.flush(); await sdk.flush();
    const result = await sdk.flush();
    expect(result.ok).toBe(false);
    expect(sdk.getQueueStats()).toEqual({ depth: 2, dropped: 1 });
    await sdk.stop();
    expect(sdk.getQueueStats().depth).toBe(0);
    await sdk.dispose();
  });

  it('settles with a typed error when an injected adapter rejects', async () => {
    const sdk = new Inhibitor({ transport: { enabled: true, adapter: { send: async () => { throw new Error('secret payload'); } } } });
    await sdk.start({ consent: true });
    await expect(sdk.flush()).resolves.toMatchObject({ ok: false, error: { code: 'TRANSPORT_ERROR' } });
    await sdk.dispose();
  });

  it('does not reuse an in-flight delivery across sessions', async () => {
    const releases: Array<(value: { ok: boolean; sent: number; pending: number }) => void> = [];
    const send = vi.fn(() => new Promise<{ ok: boolean; sent: number; pending: number }>(resolve => releases.push(resolve)));
    const sdk = new Inhibitor({ transport: { enabled: true, adapter: { send } } });
    await sdk.start({ consent: true });
    const oldFlush = sdk.flush();
    await new Promise(resolve => setTimeout(resolve, 0));
    await sdk.stop();
    await sdk.start({ consent: true });
    const newFlush = sdk.flush();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(send).toHaveBeenCalledTimes(2);
    releases[0]!({ ok: true, sent: 1, pending: 0 });
    releases[1]!({ ok: true, sent: 1, pending: 0 });
    await oldFlush; await newFlush;
    expect(sdk.getQueueStats().depth).toBe(0);
    await sdk.dispose();
  });

  it('exposes only bounded numeric plugin aggregates', async () => {
    const sdk = new Inhibitor({ plugins: [{ id: 'example', start(ctx) { ctx.emit({ type: 'clicks', value: 2 }); }, stop() {}, snapshot() { return { total: 3, secret: 'PRIVATE' }; } }] });
    await sdk.start({ consent: true });
    const data = await sdk.getSessionSignals();
    expect(data.plugins).toEqual({ example: { clicks: 2, total: 3 } });
    expect(JSON.stringify(data)).not.toContain('PRIVATE');
    await sdk.dispose();
  });

  it('releases listeners across 100 start/stop cycles', async () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const sdk = new Inhibitor();
    for (let i = 0; i < 100; i += 1) { await sdk.start({ consent: true }); await sdk.stop(); }
    for (const event of ['pointerdown', 'keydown', 'visibilitychange']) {
      expect(add.mock.calls.filter(call => call[0] === event)).toHaveLength(100);
      expect(remove.mock.calls.filter(call => call[0] === event)).toHaveLength(100);
    }
    await sdk.dispose();
  });
});
