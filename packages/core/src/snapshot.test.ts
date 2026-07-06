import { describe, expect, it } from 'vitest';
import { InhibitorError, parseSessionSnapshot } from './index.js';

const valid = {
  schemaVersion: '1.0',
  sdk: { name: 'inhibitor-js', version: '0.1.0' },
  session: { id: 'ephemeral', startedAt: '2026-11-06T00:00:00.000Z', durationMs: 12 },
  environment: { browserFamily: 'chromium', viewportBucket: '320-479', capabilities: { pointerEvents: true } },
  behavior: { pointerEventCount: 2, pointerIntervalHistogramMs: { '0-16': 1 }, keyboardEventCount: 0, visibilityChangeCount: 0 },
  diagnostics: { droppedEvents: 0, sampledEvents: 2, unsupportedCollectors: [] },
};

describe('parseSessionSnapshot', () => {
  it('accepts a minimized versioned payload', () => {
    expect(parseSessionSnapshot(valid)).toBe(valid);
  });

  it.each([
    { ...valid, key: 'secret' },
    { ...valid, schemaVersion: '2.0' },
    { ...valid, session: { ...valid.session, durationMs: Number.NaN } },
    { ...valid, behavior: { ...valid.behavior, keyValue: 'secret' } },
    { ...valid, environment: { ...valid.environment, viewportWidth: 375 } },
    { ...valid, diagnostics: { ...valid.diagnostics, droppedEvents: -1 } },
  ])('rejects unknown or malformed payload fields %#', (snapshot) => {
    expect(() => parseSessionSnapshot(snapshot)).toThrowError(InhibitorError);
  });
});
