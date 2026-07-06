import { InhibitorError } from './error.js';
import type { Collector, InhibitorOptions, Transport } from './index.js';

export interface NormalizedOptions {
  readonly endpoint?: string;
  readonly collect: { readonly environment: boolean; readonly behavior: boolean; readonly automationIndicators: false };
  readonly sampling: { readonly pointer: number; readonly keyboardTiming: boolean };
  readonly privacy: { readonly requireExplicitStart: true; readonly excludeEditableTargets: true; readonly captureInputValues: false };
  readonly transport: {
    readonly enabled: boolean;
    readonly maxBatchSize: number;
    readonly maxQueueSize: number;
    readonly flushIntervalMs: number;
    readonly timeoutMs: number;
    readonly maxRetries: number;
    readonly adapter?: Transport;
  };
  readonly plugins: readonly Collector[];
}

function invalid(message: string): never {
  throw new InhibitorError('INVALID_CONFIG', message);
}

function record(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, keys: readonly string[], name: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(`${name}.${key} is not supported`);
}

function boolean(value: unknown, fallback: boolean, name: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') invalid(`${name} must be a boolean`);
  return value;
}

function boundedNumber(value: unknown, fallback: number, min: number, max: number, name: string, integer = true): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    invalid(`${name} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}`);
  }
  return value;
}

function assertTrueOrUndefined(value: unknown, name: string): void {
  if (value !== undefined && value !== true) invalid(`${name} cannot be disabled`);
}

function assertFalseOrUndefined(value: unknown, name: string): void {
  if (value !== undefined && value !== false) invalid(`${name} is unsupported`);
}

function endpoint(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > 2048) invalid('endpoint must be a URL string');
  let url: URL;
  try { url = new URL(value); } catch { return invalid('endpoint must be an absolute URL'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) invalid('endpoint must use HTTPS outside localhost');
  if (url.username || url.password || url.search || url.hash) invalid('endpoint cannot contain credentials, query or fragment');
  return url.href;
}

/** Validate every option before collection can begin. No browser API is read here. */
export function validateOptions(options: InhibitorOptions = {}): NormalizedOptions {
  const root = record(options, 'options');
  onlyKeys(root, ['endpoint', 'collect', 'sampling', 'privacy', 'transport', 'plugins'], 'options');
  const collect = record(root.collect ?? {}, 'collect');
  onlyKeys(collect, ['environment', 'behavior', 'automationIndicators'], 'collect');
  assertFalseOrUndefined(collect.automationIndicators, 'collect.automationIndicators');
  const sampling = record(root.sampling ?? {}, 'sampling');
  onlyKeys(sampling, ['pointer', 'keyboardTiming'], 'sampling');
  const privacy = record(root.privacy ?? {}, 'privacy');
  onlyKeys(privacy, ['requireExplicitStart', 'excludeEditableTargets', 'captureInputValues'], 'privacy');
  assertTrueOrUndefined(privacy.requireExplicitStart, 'privacy.requireExplicitStart');
  assertTrueOrUndefined(privacy.excludeEditableTargets, 'privacy.excludeEditableTargets');
  assertFalseOrUndefined(privacy.captureInputValues, 'privacy.captureInputValues');
  const transport = record(root.transport ?? {}, 'transport');
  onlyKeys(transport, ['enabled', 'maxBatchSize', 'maxQueueSize', 'flushIntervalMs', 'timeoutMs', 'maxRetries', 'adapter'], 'transport');
  const transportEnabled = boolean(transport.enabled, false, 'transport.enabled');
  const parsedEndpoint = endpoint(root.endpoint);
  if (transport.adapter !== undefined) {
    if (typeof transport.adapter !== 'object' || transport.adapter === null || typeof (transport.adapter as Transport).send !== 'function') invalid('transport.adapter must implement send()');
  }
  if (transportEnabled && !parsedEndpoint && !transport.adapter) invalid('transport requires endpoint or adapter');
  const plugins = root.plugins ?? [];
  if (!Array.isArray(plugins)) invalid('plugins must be an array');
  const ids = new Set<string>(['environment', 'behavior']);
  for (const plugin of plugins) {
    if (typeof plugin !== 'object' || plugin === null || typeof plugin.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(plugin.id) || typeof plugin.start !== 'function' || typeof plugin.stop !== 'function' || typeof plugin.snapshot !== 'function') invalid('each plugin needs an id, start(), stop(), snapshot()');
    if (ids.has(plugin.id)) invalid(`duplicate or reserved plugin id: ${plugin.id}`);
    ids.add(plugin.id);
  }
  return {
    endpoint: parsedEndpoint,
    collect: {
      environment: boolean(collect.environment, true, 'collect.environment'),
      behavior: boolean(collect.behavior, true, 'collect.behavior'),
      automationIndicators: false,
    },
    sampling: {
      pointer: boundedNumber(sampling.pointer, 0.1, 0, 1, 'sampling.pointer', false),
      keyboardTiming: boolean(sampling.keyboardTiming, true, 'sampling.keyboardTiming'),
    },
    privacy: { requireExplicitStart: true, excludeEditableTargets: true, captureInputValues: false },
    transport: {
      enabled: transportEnabled,
      maxBatchSize: boundedNumber(transport.maxBatchSize, 20, 1, 100, 'transport.maxBatchSize'),
      maxQueueSize: boundedNumber(transport.maxQueueSize, 100, 1, 100, 'transport.maxQueueSize'),
      flushIntervalMs: boundedNumber(transport.flushIntervalMs, 10_000, 100, 3_600_000, 'transport.flushIntervalMs'),
      timeoutMs: boundedNumber(transport.timeoutMs, 10_000, 100, 60_000, 'transport.timeoutMs'),
      maxRetries: boundedNumber(transport.maxRetries, 2, 0, 5, 'transport.maxRetries'),
      adapter: transport.adapter as Transport | undefined,
    },
    plugins: plugins as Collector[],
  };
}
