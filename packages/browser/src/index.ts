import type { Collector, CollectorContext } from '@inhibitor/core';

const INTERVAL_BUCKETS = ['0-49', '50-199', '200-999', '1000+'] as const;
type IntervalBucket = (typeof INTERVAL_BUCKETS)[number];

function emptyHistogram(): Record<IntervalBucket, number> {
  return { '0-49': 0, '50-199': 0, '200-999': 0, '1000+': 0 };
}

function recordInterval(histogram: Record<IntervalBucket, number>, interval: number): void {
  if (!Number.isFinite(interval) || interval < 0) return;
  const bucket: IntervalBucket = interval < 50 ? '0-49' : interval < 200 ? '50-199' : interval < 1000 ? '200-999' : '1000+';
  histogram[bucket] = Math.min(Number.MAX_SAFE_INTEGER, histogram[bucket] + 1);
}

function increment(value: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, value + 1);
}

function browserFamily(): 'chromium' | 'firefox' | 'webkit' | 'unknown' {
  const ua = navigator.userAgent;
  if (/Firefox\//i.test(ua)) return 'firefox';
  if (/(Chrome|Chromium|Edg)\//i.test(ua)) return 'chromium';
  if (/AppleWebKit\//i.test(ua)) return 'webkit';
  return 'unknown';
}

function viewportBucket(width: number): string {
  if (width < 320) return '0-319';
  if (width < 480) return '320-479';
  if (width < 768) return '480-767';
  if (width < 1024) return '768-1023';
  if (width < 1440) return '1024-1439';
  return '1440+';
}

/** Coarse environment properties, read only when collection begins. */
export function createEnvironmentCollector(): Collector {
  let result: Record<string, unknown> = {};
  return {
    id: 'environment',
    start() {
      result = {
        browserFamily: browserFamily(),
        viewportBucket: viewportBucket(window.innerWidth),
        capabilities: {
          pointerEvents: 'PointerEvent' in window,
          passiveEvents: 'addEventListener' in window,
          visibility: 'visibilityState' in document,
        },
      };
    },
    stop() {},
    snapshot() { return { ...result }; },
  };
}

const EDITABLE_SELECTOR = 'input,textarea,select,[contenteditable]';

/** Fail closed when the browser cannot identify the entire event path. */
function isSafeTarget(event: Event): boolean {
  if (typeof event.composedPath !== 'function') return false;
  const path = event.composedPath();
  if (path.length === 0) return false;
  let foundElement = false;
  for (const target of path) {
    if (target instanceof Element) {
      foundElement = true;
      if (target.matches(EDITABLE_SELECTOR) || target.closest(EDITABLE_SELECTOR)) return false;
    }
  }
  return foundElement;
}

export interface BehaviorCollectorOptions {
  /** Event-level probability; sampled counts are not estimates of all interactions. */
  pointerSampleRate?: number;
  keyboardTiming?: boolean;
  /** For deterministic tests only; defaults to Math.random. */
  random?: () => number;
}

/** Fixed-size, content-free interaction aggregates. */
export function createBehaviorCollector(options: BehaviorCollectorOptions = {}): Collector {
  const sampleRate = options.pointerSampleRate ?? 0.1;
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    throw new RangeError('pointerSampleRate must be between 0 and 1');
  }
  const random = options.random ?? Math.random;
  const keyboardTiming = options.keyboardTiming ?? true;
  let pointerEventCount = 0;
  let keyboardEventCount = 0;
  let visibilityChangeCount = 0;
  let sampledEvents = 0;
  let pointerHistogram = emptyHistogram();
  let keyboardHistogram = emptyHistogram();
  let lastPointerTime: number | undefined;
  let lastKeyboardTime: number | undefined;
  let context: CollectorContext | undefined;

  const onPointer = (event: Event) => {
    try {
      if (!context || context.signal.aborted || !isSafeTarget(event)) return;
      if (random() >= sampleRate) return;
      const now = context.now();
      if (lastPointerTime !== undefined) recordInterval(pointerHistogram, now - lastPointerTime);
      lastPointerTime = now;
      pointerEventCount = increment(pointerEventCount);
      sampledEvents = increment(sampledEvents);
    } catch { /* Event handlers must never throw into the host application. */ }
  };
  const onKey = (event: Event) => {
    try {
      if (!context || context.signal.aborted || !isSafeTarget(event)) return;
      const now = context.now();
      if (keyboardTiming && lastKeyboardTime !== undefined) recordInterval(keyboardHistogram, now - lastKeyboardTime);
      lastKeyboardTime = now;
      keyboardEventCount = increment(keyboardEventCount);
    } catch { /* Event handlers must never throw into the host application. */ }
  };
  const onVisibility = () => {
    try {
      if (!context || context.signal.aborted) return;
      visibilityChangeCount = increment(visibilityChangeCount);
      lastPointerTime = undefined;
      lastKeyboardTime = undefined;
    } catch { /* Event handlers must never throw into the host application. */ }
  };

  return {
    id: 'behavior',
    start(ctx) {
      if (context) return;
      pointerEventCount = 0;
      keyboardEventCount = 0;
      visibilityChangeCount = 0;
      sampledEvents = 0;
      pointerHistogram = emptyHistogram();
      keyboardHistogram = emptyHistogram();
      lastPointerTime = undefined;
      lastKeyboardTime = undefined;
      context = ctx;
      document.addEventListener('pointerdown', onPointer, { passive: true });
      document.addEventListener('keydown', onKey, { passive: true });
      document.addEventListener('visibilitychange', onVisibility, { passive: true });
    },
    stop() {
      if (!context) return;
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      context = undefined;
    },
    snapshot() {
      return {
        pointerEventCount,
        pointerIntervalHistogramMs: { ...pointerHistogram },
        keyboardEventCount,
        keyboardIntervalHistogramMs: keyboardTiming ? { ...keyboardHistogram } : undefined,
        visibilityChangeCount,
        sampledEvents,
      };
    },
  };
}
