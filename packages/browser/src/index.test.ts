// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBehaviorCollector, createEnvironmentCollector } from './index';

describe('browser collectors', () => {
  let abort: AbortController;
  let now: number;
  beforeEach(() => {
    document.body.innerHTML = '<button id="safe">Go</button><input id="secret" value="password"><div contenteditable="true"><span id="inside">edit</span></div>';
    abort = new AbortController();
    now = 0;
  });
  afterEach(() => { document.body.innerHTML = ''; });

  const context = () => ({ sessionId: 'test', now: () => now, emit: () => {}, signal: abort.signal });

  it('does not collect before start, rejects editable targets and exports no content', () => {
    const collector = createBehaviorCollector({ pointerSampleRate: 1, random: () => 0 });
    const button = document.querySelector('#safe')!;
    const input = document.querySelector('#secret')!;
    const inner = document.querySelector('#inside')!;
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true, composed: true }));
    expect(collector.snapshot().keyboardEventCount).toBe(0);
    collector.start(context());
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'password', bubbles: true, composed: true }));
    inner.dispatchEvent(new KeyboardEvent('keydown', { key: 'secret', bubbles: true, composed: true }));
    input.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', bubbles: true, composed: true }));
    now = 75;
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'B', bubbles: true, composed: true }));
    button.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    now = 125;
    button.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(collector.snapshot()).toMatchObject({
      keyboardEventCount: 2,
      pointerEventCount: 2,
      sampledEvents: 2,
      keyboardIntervalHistogramMs: { '50-199': 1 },
      pointerIntervalHistogramMs: { '50-199': 1 },
    });
    expect(JSON.stringify(collector.snapshot())).not.toMatch(/password|secret|keyCode|clientX|value/);
    collector.stop();
  });

  it('removes listeners on stop and resets on restart', () => {
    const collector = createBehaviorCollector({ pointerSampleRate: 1, random: () => 0 });
    const button = document.querySelector('#safe')!;
    collector.start(context());
    button.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    collector.stop();
    button.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(collector.snapshot().pointerEventCount).toBe(1);
    collector.start(context());
    expect(collector.snapshot().pointerEventCount).toBe(0);
    collector.stop();
  });

  it('samples pointer events deterministically', () => {
    let n = 0;
    const collector = createBehaviorCollector({ pointerSampleRate: 0.5, random: () => [0.1, 0.9, 0.2][n++] ?? 1 });
    const button = document.querySelector('#safe')!;
    collector.start(context());
    for (let i = 0; i < 3; i++) button.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(collector.snapshot().pointerEventCount).toBe(2);
    collector.stop();
  });

  it('discards inputs hidden inside closed shadow roots', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'closed' });
    const input = document.createElement('input');
    shadow.appendChild(input);
    const collector = createBehaviorCollector({ pointerSampleRate: 1, random: () => 0 });
    collector.start(context());
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'secret', bubbles: true, composed: true }));
    input.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(collector.snapshot()).toMatchObject({ keyboardEventCount: 0, pointerEventCount: 0 });
    document.querySelector('#safe')!.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    expect(collector.snapshot().pointerEventCount).toBe(1);
    collector.stop();
  });

  it('collects only coarse environment fields after start', () => {
    const collector = createEnvironmentCollector();
    expect(collector.snapshot()).toEqual({});
    collector.start(context());
    expect(collector.snapshot()).toEqual({
      browserFamily: expect.any(String),
      viewportBucket: expect.any(String),
      capabilities: { pointerEvents: expect.any(Boolean), passiveEvents: true, visibility: true },
    });
  });
});
