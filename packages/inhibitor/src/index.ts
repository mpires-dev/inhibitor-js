import { InhibitorError, parseSessionSnapshot, validateOptions } from '@inhibitor/core';
import type { Collector, CollectorContext, FlushResult, InhibitorOptions, LifecycleState, SessionSnapshot, Transport } from '@inhibitor/core';
import { createBehaviorCollector, createEnvironmentCollector } from '@inhibitor/browser';
import { BoundedQueue, HttpTransport } from '@inhibitor/transport';

export { InhibitorError } from '@inhibitor/core';
export type { Collector, CollectorContext, FlushResult, InhibitorOptions, LifecycleState, SessionSnapshot, Transport } from '@inhibitor/core';

/** Importing and constructing do not read browser state or start collection. */
export class Inhibitor {
  private state: LifecycleState = 'idle';
  private config?: ReturnType<typeof validateOptions>;
  private collectors: Collector[] = [];
  private controller?: AbortController;
  private queue?: BoundedQueue<SessionSnapshot>;
  private sender?: Transport;
  private timer?: ReturnType<typeof setInterval>;
  private pending: Promise<void> = Promise.resolve();
  private sending?: { sessionId: string; promise: Promise<FlushResult> };
  private id = '';
  private startedAt = '';
  private startTime = 0;
  private duration = 0;
  private unsupported: string[] = [];
  private emitted: Record<string, Record<string, number>> = {};

  constructor(private readonly options: InhibitorOptions = {}) {}
  getState(): LifecycleState { return this.state; }
  getQueueStats(): { depth: number; dropped: number } { return { depth: this.queue?.size ?? 0, dropped: this.queue?.dropped ?? 0 }; }

  private run(action: () => Promise<void>): Promise<void> {
    const result = this.pending.then(action, action);
    this.pending = result.catch(() => undefined);
    return result;
  }

  initialize(): Promise<void> { return this.run(async () => { this.setup(); }); }

  private setup(): void {
    if (this.state === 'disposed') throw new InhibitorError('DISPOSED', 'SDK has been disposed');
    if (this.state !== 'idle') return;
    this.config = validateOptions(this.options);
    const t = this.config.transport;
    if (t.enabled) this.sender = t.adapter ?? new HttpTransport(this.config.endpoint!, { timeoutMs: t.timeoutMs, maxRetries: t.maxRetries });
    this.queue = new BoundedQueue<SessionSnapshot>(t.maxQueueSize);
    this.state = 'initialized';
  }

  start(options: { consent: boolean }): Promise<void> {
    return this.run(async () => {
      if (this.state === 'disposed') throw new InhibitorError('DISPOSED', 'SDK has been disposed');
      if (options.consent !== true) throw new InhibitorError('CONSENT_REQUIRED', 'Explicit consent assertion is required');
      if (this.state === 'running') return;
      this.setup();
      if (typeof window === 'undefined' || typeof document === 'undefined' || typeof crypto === 'undefined' || typeof crypto.randomUUID !== 'function')
        throw new InhibitorError('UNSUPPORTED_ENVIRONMENT', 'A secure browser context is required');
      const config = this.config!;
      this.queue = new BoundedQueue<SessionSnapshot>(config.transport.maxQueueSize);
      this.id = crypto.randomUUID();
      this.startedAt = new Date().toISOString();
      this.startTime = performance.now();
      this.duration = 0;
      this.unsupported = [];
      this.emitted = {};
      this.controller = new AbortController();
      this.collectors = [
        ...(config.collect.environment ? [createEnvironmentCollector()] : []),
        ...(config.collect.behavior ? [createBehaviorCollector({ pointerSampleRate: config.sampling.pointer, keyboardTiming: config.sampling.keyboardTiming })] : []),
        ...config.plugins,
      ];
      for (const collector of this.collectors) {
        const controller = this.controller;
        const ctx: CollectorContext = {
          sessionId: this.id, now: () => performance.now(), signal: controller.signal,
          emit: signal => {
            if (controller.signal.aborted || collector.id === 'environment' || collector.id === 'behavior') return;
            if (!/^[a-z][a-zA-Z0-9]{0,31}$/.test(signal.type) || !Number.isSafeInteger(signal.value) || signal.value < 0) return;
            const metrics = this.emitted[collector.id] ?? {};
            this.emitted[collector.id] = metrics;
            if (!(signal.type in metrics) && Object.keys(metrics).length >= 16) return;
            metrics[signal.type] = Math.min(Number.MAX_SAFE_INTEGER, (metrics[signal.type] ?? 0) + signal.value);
          },
        };
        try { await collector.start(ctx); }
        catch { this.unsupported.push(collector.id); try { await collector.stop(); } catch { /* cleanup */ } }
      }
      this.state = 'running';
      if (config.transport.enabled && config.transport.flushIntervalMs > 0)
        this.timer = setInterval(() => { void this.flush().catch(() => undefined); }, config.transport.flushIntervalMs);
    });
  }

  stop(): Promise<void> {
    return this.run(async () => {
      if (this.state !== 'running') return;
      if (this.timer) clearInterval(this.timer);
      this.timer = undefined;
      this.duration = Math.max(0, performance.now() - this.startTime);
      this.controller?.abort();
      this.sending = undefined;
      for (const collector of this.collectors) { try { await collector.stop(); } catch { this.unsupported.push(collector.id); } }
      this.queue?.clear();
      this.state = 'stopped';
    });
  }

  async getSessionSignals(): Promise<SessionSnapshot> {
    await this.pending;
    if (this.state !== 'running' && this.state !== 'stopped') throw new InhibitorError('NO_SESSION', 'Start a session first');
    let environment: SessionSnapshot['environment'];
    let behavior: SessionSnapshot['behavior'];
    const plugins: Record<string, Record<string, number>> = {};
    let sampledEvents = 0;
    for (const collector of this.collectors) {
      if (this.unsupported.includes(collector.id)) continue;
      try {
        const value = collector.snapshot();
        if (collector.id === 'environment') environment = value as SessionSnapshot['environment'];
        if (collector.id === 'behavior') {
          sampledEvents = typeof value.sampledEvents === 'number' ? value.sampledEvents : 0;
          const { sampledEvents: _ignored, ...data } = value;
          behavior = data as SessionSnapshot['behavior'];
        }
        if (collector.id !== 'environment' && collector.id !== 'behavior') {
          const metrics = { ...this.emitted[collector.id] };
          for (const [key, item] of Object.entries(value)) {
            if (/^[a-z][a-zA-Z0-9]{0,31}$/.test(key) && Number.isSafeInteger(item) && typeof item === 'number' && item >= 0 && Object.keys(metrics).length < 16) metrics[key] = item;
          }
          plugins[collector.id] = metrics;
        }
      } catch { this.unsupported.push(collector.id); }
    }
    const durationMs = this.state === 'running' ? performance.now() - this.startTime : this.duration;
    return {
      schemaVersion: '1.0', sdk: { name: 'inhibitor-js', version: '0.1.0' },
      session: { id: this.id, startedAt: this.startedAt, durationMs: Math.round(Math.max(0, durationMs)) },
      ...(environment ? { environment } : {}), ...(behavior ? { behavior } : {}),
      ...(Object.keys(plugins).length ? { plugins } : {}),
      diagnostics: { droppedEvents: this.queue?.dropped ?? 0, sampledEvents, unsupportedCollectors: [...new Set(this.unsupported)] },
    };
  }

  async flush(): Promise<FlushResult> {
    await this.pending;
    if (this.state !== 'running') return { ok: false, sent: 0, pending: this.queue?.size ?? 0, error: { code: 'NOT_RUNNING', message: 'Collection is not running' } };
    if (!this.sender) return { ok: false, sent: 0, pending: 0, error: { code: 'TRANSPORT_DISABLED', message: 'Transport is disabled' } };
    if (this.sending?.sessionId === this.id) return this.sending.promise;
    const work = this.flushNow();
    this.sending = { sessionId: this.id, promise: work };
    try { return await work; } finally { if (this.sending?.promise === work) this.sending = undefined; }
  }

  private async flushNow(): Promise<FlushResult> {
    const queue = this.queue!;
    try {
      queue.push(parseSessionSnapshot(await this.getSessionSignals()));
      const batch = queue.peekBatch(this.config!.transport.maxBatchSize);
      const result = await this.sender!.send(batch, this.controller?.signal);
      if (result.ok) queue.dropBatch(batch.length);
      return { ...result, pending: queue.size };
    } catch {
      return { ok: false, sent: 0, pending: queue.size, error: { code: 'TRANSPORT_ERROR', message: 'Delivery adapter or snapshot validation failed' } };
    }
  }

  dispose(): Promise<void> {
    return this.run(async () => {
      if (this.state === 'disposed') return;
      if (this.timer) clearInterval(this.timer);
      this.timer = undefined;
      this.controller?.abort();
      this.sending = undefined;
      for (const collector of this.collectors) { try { await collector.stop(); } catch { /* cleanup */ } }
      this.collectors = [];
      this.queue?.clear();
      this.sender = undefined;
      this.id = '';
      this.state = 'disposed';
    });
  }
}
