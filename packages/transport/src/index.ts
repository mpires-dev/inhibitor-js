import type { FlushResult, SessionSnapshot, Transport } from '@inhibitor/core';

/** Memory-only FIFO; overflow evicts the oldest item. */
export class BoundedQueue<T> {
  private readonly items: T[] = [];
  private overflowCount = 0;
  constructor(readonly maxSize = 100) {
    if (!Number.isInteger(maxSize) || maxSize < 1 || maxSize > 1000) throw new RangeError('maxSize must be an integer between 1 and 1000');
  }
  get size(): number { return this.items.length; }
  get dropped(): number { return this.overflowCount; }
  push(item: T): void {
    if (this.items.length === this.maxSize) { this.items.shift(); this.overflowCount += 1; }
    this.items.push(item);
  }
  peekBatch(maxItems = this.maxSize): readonly T[] {
    if (!Number.isInteger(maxItems) || maxItems < 1) throw new RangeError('maxItems must be positive');
    return this.items.slice(0, maxItems);
  }
  dropBatch(count: number): void {
    if (!Number.isInteger(count) || count < 0) throw new RangeError('count must be nonnegative');
    this.items.splice(0, count);
  }
  clear(): void { this.items.length = 0; this.overflowCount = 0; }
}

export interface HttpTransportOptions {
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: typeof fetch;
  random?: () => number;
}

function validateEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new TypeError('Invalid transport endpoint URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.hash) {
    throw new TypeError('Transport endpoint requires HTTPS (HTTP is allowed only on localhost) and no credentials or fragment');
  }
  return url.href;
}

function retryDelay(attempt: number, retryAfter: string | null, random: () => number): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 30_000);
  }
  return Math.min(300 * 2 ** attempt, 10_000) * (0.5 + Math.max(0, Math.min(1, random())) / 2);
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new Error('ABORTED');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(new Error('ABORTED')); };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Optional JSON transport. It performs no I/O until send() is called. */
export class HttpTransport implements Transport {
  readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetcher: typeof fetch;
  private readonly random: () => number;

  constructor(endpoint: string, options: HttpTransportOptions = {}) {
    this.endpoint = validateEndpoint(endpoint);
    this.timeoutMs = options.timeoutMs ?? 5000;
    this.maxRetries = options.maxRetries ?? 2;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1 || this.timeoutMs > 120_000) throw new RangeError('timeoutMs must be between 1 and 120000');
    if (!Number.isInteger(this.maxRetries) || this.maxRetries < 0 || this.maxRetries > 10) throw new RangeError('maxRetries must be between 0 and 10');
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.random = options.random ?? Math.random;
    if (typeof this.fetcher !== 'function') throw new TypeError('fetch is unavailable');
  }

  async send(batch: readonly SessionSnapshot[], signal?: AbortSignal): Promise<FlushResult> {
    if (batch.length === 0) return { ok: true, sent: 0, pending: 0 };
    if (signal?.aborted) return this.failure(batch.length, 'ABORTED', 'Request aborted');
    const body = JSON.stringify({ schemaVersion: '1.0', batchId: globalThis.crypto.randomUUID(), sentAt: new Date().toISOString(), snapshots: batch });
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
      const onAbort = () => controller.abort();
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        const response = await this.fetcher(this.endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: controller.signal, credentials: 'omit', cache: 'no-store', redirect: 'error' });
        if (response.ok) return { ok: true, sent: batch.length, pending: 0 };
        const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
        if (retryable && attempt < this.maxRetries && !signal?.aborted) {
          await delay(retryDelay(attempt, response.headers.get('retry-after'), this.random), signal);
          continue;
        }
        return this.failure(batch.length, 'HTTP_ERROR', `HTTP ${response.status}`, response.status);
      } catch {
        if (signal?.aborted) return this.failure(batch.length, 'ABORTED', 'Request aborted');
        if (attempt < this.maxRetries) {
          try { await delay(retryDelay(attempt, null, this.random), signal); }
          catch { return this.failure(batch.length, 'ABORTED', 'Request aborted'); }
          continue;
        }
        return this.failure(batch.length, timedOut ? 'TIMEOUT' : 'NETWORK_ERROR', timedOut ? 'Request timed out' : 'Network request failed');
      } finally { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); }
    }
    return this.failure(batch.length, 'NETWORK_ERROR', 'Network request failed');
  }

  private failure(pending: number, code: string, message: string, status?: number): FlushResult {
    return { ok: false, sent: 0, pending, error: { code, message, ...(status === undefined ? {} : { status }) } };
  }
}
