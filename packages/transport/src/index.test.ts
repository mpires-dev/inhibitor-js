import { describe, expect, it, vi } from 'vitest';
import type { SessionSnapshot } from '@inhibitor/core';
import { BoundedQueue, HttpTransport } from './index';

const snapshot: SessionSnapshot = {
  schemaVersion: '1.0', sdk: { name: 'inhibitor-js', version: '0.1.0' },
  session: { id: 'ephemeral', startedAt: '2026-01-01T00:00:00.000Z', durationMs: 5 },
  diagnostics: { droppedEvents: 0, sampledEvents: 0, unsupportedCollectors: [] },
};

describe('BoundedQueue', () => {
  it('evicts oldest and tracks overflow only', () => {
    const queue = new BoundedQueue<number>(2);
    queue.push(1); queue.push(2); queue.push(3);
    expect(queue.peekBatch()).toEqual([2, 3]);
    expect(queue.dropped).toBe(1);
    queue.dropBatch(1);
    expect(queue.peekBatch()).toEqual([3]);
    expect(queue.dropped).toBe(1);
    queue.clear();
    expect(queue.size).toBe(0);
    expect(queue.dropped).toBe(0);
  });
  it('rejects unbounded or malformed limits', () => {
    expect(() => new BoundedQueue(0)).toThrow();
    expect(() => new BoundedQueue(1001)).toThrow();
    expect(() => new BoundedQueue(1.1)).toThrow();
  });
});

describe('HttpTransport', () => {
  it('rejects dangerous destinations before sending', () => {
    for (const endpoint of ['javascript:alert(1)', 'http://example.com/a', 'https://user:password@example.com', 'https://example.com/#fragment', 'not a URL']) {
      expect(() => new HttpTransport(endpoint)).toThrow();
    }
    expect(() => new HttpTransport('http://localhost:3000/events')).not.toThrow();
  });

  it('posts a versioned envelope with no ambient credentials', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const transport = new HttpTransport('https://example.com/events', { fetch: fetcher as typeof fetch });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await transport.send([snapshot])).toEqual({ ok: true, sent: 1, pending: 0 });
    const [url, request] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://example.com/events');
    expect(request.credentials).toBe('omit');
    expect(request.redirect).toBe('error');
    expect(request.method).toBe('POST');
    const body = JSON.parse(request.body as string);
    expect(body).toMatchObject({ schemaVersion: '1.0', snapshots: [snapshot] });
    expect(body.batchId).toEqual(expect.any(String));
    expect(body.sentAt).toEqual(expect.any(String));
  });

  it('does not retry 4xx and does retry a transient 5xx', async () => {
    const bad = vi.fn(async () => new Response(null, { status: 400 }));
    const result = await new HttpTransport('https://example.com', { fetch: bad as typeof fetch, maxRetries: 2 }).send([snapshot]);
    expect(result).toMatchObject({ ok: false, sent: 0, pending: 1, error: { code: 'HTTP_ERROR', status: 400 } });
    expect(bad).toHaveBeenCalledTimes(1);

    const transient = vi.fn().mockResolvedValueOnce(new Response(null, { status: 503, headers: { 'retry-after': '0' } })).mockResolvedValueOnce(new Response(null, { status: 200 }));
    const ok = await new HttpTransport('https://example.com', { fetch: transient as typeof fetch, maxRetries: 1 }).send([snapshot]);
    expect(ok.ok).toBe(true);
    expect(transient).toHaveBeenCalledTimes(2);
    expect((transient.mock.calls[0] as unknown as [string, RequestInit])[1].body).toBe((transient.mock.calls[1] as unknown as [string, RequestInit])[1].body);
  });

  it('returns a typed network failure without echoing payload data', async () => {
    const fetcher = vi.fn(async () => { throw new Error('private payload failed'); });
    const result = await new HttpTransport('https://example.com', { fetch: fetcher as typeof fetch, maxRetries: 0 }).send([snapshot]);
    expect(result).toMatchObject({ ok: false, pending: 1, error: { code: 'NETWORK_ERROR' } });
    expect(JSON.stringify(result)).not.toContain('private payload');
  });

  it('honors caller abort before a request', async () => {
    const fetcher = vi.fn();
    const controller = new AbortController(); controller.abort();
    const result = await new HttpTransport('https://example.com', { fetch: fetcher as typeof fetch }).send([snapshot], controller.signal);
    expect(result.error?.code).toBe('ABORTED');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
