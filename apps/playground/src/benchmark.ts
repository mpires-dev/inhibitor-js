import { Inhibitor } from 'inhibitor-js';

declare global {
  interface Window { runInhibitorBenchmark: (enabled: boolean, iterations: number) => Promise<{ eventWorkMs: number; serializationMs: number; longTasks: number; snapshotBytes: number }> }
}

window.runInhibitorBenchmark = async (enabled, iterations) => {
  const sdk = enabled ? new Inhibitor({ sampling: { pointer: 1 } }) : undefined;
  if (sdk) await sdk.start({ consent: true });
  const longTasks: number[] = [];
  let observer: PerformanceObserver | undefined;
  if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
    observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
    observer.observe({ entryTypes: ['longtask'] });
  }
  const target = document.getElementById('target')!;
  const eventStart = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    target.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
    if (i % 4 === 0) target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true }));
  }
  const eventWorkMs = performance.now() - eventStart;
  let serializationMs = 0;
  let snapshotBytes = 0;
  if (sdk) {
    const snapshot = await sdk.getSessionSignals();
    const start = performance.now();
    const json = JSON.stringify(snapshot);
    serializationMs = performance.now() - start;
    snapshotBytes = json.length;
    await sdk.dispose();
  }
  observer?.disconnect();
  return { eventWorkMs, serializationMs, longTasks: longTasks.length, snapshotBytes };
};
