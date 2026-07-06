import { describe, expect, it } from 'vitest';
import { InhibitorError, validateOptions } from './index.js';

describe('validateOptions', () => {
  it('defaults to local collection with disabled delivery', () => {
    const options = validateOptions();
    expect(options.collect).toEqual({ environment: true, behavior: true, automationIndicators: false });
    expect(options.transport.enabled).toBe(false);
    expect(options.transport.maxQueueSize).toBe(100);
    expect(options.privacy).toEqual({ requireExplicitStart: true, excludeEditableTargets: true, captureInputValues: false });
  });

  it.each([
    { privacy: { captureInputValues: true } },
    { privacy: { requireExplicitStart: false } },
    { privacy: { excludeEditableTargets: false } },
    { collect: { automationIndicators: true } },
    { sampling: { pointer: -0.1 } },
    { sampling: { pointer: Number.NaN } },
    { transport: { enabled: true } },
    { transport: { maxQueueSize: 101 } },
    { endpoint: 'http://example.com/events' },
    { endpoint: 'https://user:pass@example.com/events' },
    { endpoint: 'https://example.com/events?secret=1' },
    { unknown: true },
  ])('fails closed on invalid or privacy-weakening configuration %#', (options) => {
    expect(() => validateOptions(options as never)).toThrowError(InhibitorError);
  });

  it('accepts a local mock endpoint with explicit delivery', () => {
    expect(validateOptions({ endpoint: 'http://localhost:3000/collect', transport: { enabled: true } }).endpoint)
      .toBe('http://localhost:3000/collect');
  });

  it('rejects duplicate and reserved plugin ids', () => {
    const plugin = { id: 'environment', start() {}, stop() {}, snapshot() { return {}; } };
    expect(() => validateOptions({ plugins: [plugin] })).toThrowError(/reserved/);
    const another = { ...plugin, id: 'custom' };
    expect(() => validateOptions({ plugins: [another, another] })).toThrowError(/duplicate/);
  });
});
