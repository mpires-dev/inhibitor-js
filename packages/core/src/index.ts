export type LifecycleState = 'idle' | 'initialized' | 'running' | 'stopped' | 'disposed';

export interface AggregatedSignal { readonly type: string; readonly value: number }
export interface CollectorContext {
  readonly sessionId: string;
  now(): number;
  emit(signal: AggregatedSignal): void;
  readonly signal: AbortSignal;
}
export interface Collector {
  readonly id: string;
  start(ctx: CollectorContext): void | Promise<void>;
  stop(): void | Promise<void>;
  snapshot(): Record<string, unknown>;
}
export interface SessionSnapshot {
  schemaVersion: '1.0';
  sdk: { name: 'inhibitor-js'; version: string };
  session: { id: string; startedAt: string; durationMs: number };
  environment?: {
    browserFamily?: 'chromium' | 'firefox' | 'webkit' | 'unknown';
    viewportBucket?: string;
    capabilities?: Record<string, boolean>;
  };
  behavior?: {
    pointerEventCount: number;
    pointerIntervalHistogramMs?: Record<string, number>;
    keyboardEventCount: number;
    keyboardIntervalHistogramMs?: Record<string, number>;
    visibilityChangeCount: number;
  };
  plugins?: Record<string, Record<string, number>>;
  diagnostics: { droppedEvents: number; sampledEvents: number; unsupportedCollectors: string[] };
}
export interface FlushResult {
  ok: boolean;
  sent: number;
  pending: number;
  error?: { code: string; status?: number; message: string };
}
export interface Transport {
  send(batch: readonly SessionSnapshot[], signal?: AbortSignal): Promise<FlushResult>;
}
export interface InhibitorOptions {
  endpoint?: string;
  collect?: { environment?: boolean; behavior?: boolean; automationIndicators?: false };
  sampling?: { pointer?: number; keyboardTiming?: boolean };
  privacy?: { requireExplicitStart?: true; excludeEditableTargets?: true; captureInputValues?: false };
  transport?: { enabled?: boolean; maxBatchSize?: number; maxQueueSize?: number; flushIntervalMs?: number; timeoutMs?: number; maxRetries?: number; adapter?: Transport };
  plugins?: Collector[];
}
export { InhibitorError } from './error.js';

export { validateOptions } from './options.js';
export type { NormalizedOptions } from './options.js';
export { parseSessionSnapshot } from './snapshot.js';
