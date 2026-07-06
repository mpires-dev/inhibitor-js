import { InhibitorError } from './error.js';
import type { SessionSnapshot } from './index.js';

function invalid(path: string): never { throw new InhibitorError('INVALID_SNAPSHOT', `Invalid snapshot at ${path}`); }
function object(value: unknown, path: string, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(path);
  const result = value as Record<string, unknown>;
  for (const key of Object.keys(result)) if (!keys.includes(key)) invalid(`${path}.${key}`);
  return result;
}
function text(value: unknown, path: string, max = 128): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) invalid(path);
  return value;
}
function count(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) invalid(path);
  return value;
}
function histogram(value: unknown, path: string): void {
  if (value === undefined) return;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(path);
  const h = object(value, path, Object.keys(value as object));
  if (Object.keys(h).length > 16) invalid(path);
  for (const [bucket, n] of Object.entries(h)) {
    if (!/^[a-zA-Z0-9+<>=\-]{1,24}$/.test(bucket)) invalid(`${path}.${bucket}`);
    count(n, `${path}.${bucket}`);
  }
}

/** Reject unknown fields so accidental content cannot cross a transport boundary. */
export function parseSessionSnapshot(input: unknown): SessionSnapshot {
  const root = object(input, 'root', ['schemaVersion', 'sdk', 'session', 'environment', 'behavior', 'diagnostics']);
  if (root.schemaVersion !== '1.0') invalid('schemaVersion');
  const sdk = object(root.sdk, 'sdk', ['name', 'version']);
  if (sdk.name !== 'inhibitor-js') invalid('sdk.name');
  text(sdk.version, 'sdk.version', 32);
  const session = object(root.session, 'session', ['id', 'startedAt', 'durationMs']);
  text(session.id, 'session.id');
  const date = text(session.startedAt, 'session.startedAt', 32);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(date) || !Number.isFinite(Date.parse(date))) invalid('session.startedAt');
  count(session.durationMs, 'session.durationMs');
  if (root.environment !== undefined) {
    const environment = object(root.environment, 'environment', ['browserFamily', 'viewportBucket', 'capabilities']);
    if (environment.browserFamily !== undefined && !['chromium', 'firefox', 'webkit', 'unknown'].includes(environment.browserFamily as string)) invalid('environment.browserFamily');
    if (environment.viewportBucket !== undefined) text(environment.viewportBucket, 'environment.viewportBucket', 32);
    if (environment.capabilities !== undefined) {
      if (typeof environment.capabilities !== 'object' || environment.capabilities === null || Array.isArray(environment.capabilities)) invalid('environment.capabilities');
      const capabilities = object(environment.capabilities, 'environment.capabilities', Object.keys(environment.capabilities as object));
      if (Object.keys(capabilities).length > 16) invalid('environment.capabilities');
      for (const [name, value] of Object.entries(capabilities)) {
        if (!/^[a-zA-Z][a-zA-Z0-9]{0,31}$/.test(name) || typeof value !== 'boolean') invalid(`environment.capabilities.${name}`);
      }
    }
  }
  if (root.behavior !== undefined) {
    const behavior = object(root.behavior, 'behavior', ['pointerEventCount', 'pointerIntervalHistogramMs', 'keyboardEventCount', 'keyboardIntervalHistogramMs', 'visibilityChangeCount']);
    count(behavior.pointerEventCount, 'behavior.pointerEventCount');
    count(behavior.keyboardEventCount, 'behavior.keyboardEventCount');
    count(behavior.visibilityChangeCount, 'behavior.visibilityChangeCount');
    histogram(behavior.pointerIntervalHistogramMs, 'behavior.pointerIntervalHistogramMs');
    histogram(behavior.keyboardIntervalHistogramMs, 'behavior.keyboardIntervalHistogramMs');
  }
  const diagnostics = object(root.diagnostics, 'diagnostics', ['droppedEvents', 'sampledEvents', 'unsupportedCollectors']);
  count(diagnostics.droppedEvents, 'diagnostics.droppedEvents');
  count(diagnostics.sampledEvents, 'diagnostics.sampledEvents');
  if (!Array.isArray(diagnostics.unsupportedCollectors) || diagnostics.unsupportedCollectors.length > 32 || !diagnostics.unsupportedCollectors.every((id) => typeof id === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(id))) invalid('diagnostics.unsupportedCollectors');
  return input as SessionSnapshot;
}
