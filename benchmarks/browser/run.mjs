import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus, freemem, platform, release, totalmem } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, firefox, webkit } from '@playwright/test';

const root = resolve(import.meta.dirname, '../..');
const engineName = process.env.BENCH_BROWSER ?? 'chromium';
const engine = { chromium, firefox, webkit }[engineName];
if (!engine) throw new Error('BENCH_BROWSER must be chromium, firefox or webkit');
const runs = Number(process.env.BENCH_RUNS ?? 7);
const iterations = Number(process.env.BENCH_EVENTS ?? 10_000);
if (!Number.isInteger(runs) || runs < 3 || !Number.isInteger(iterations) || iterations < 1) throw new Error('Invalid benchmark settings');
const server = spawn('pnpm', ['--filter', 'playground', 'exec', 'vite', '--host', '127.0.0.1', '--port', '4174', '--strictPort'], { cwd: root, stdio: 'ignore' });
const results = [];
function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)], p95: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] };
}
try {
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    try { const response = await fetch('http://127.0.0.1:4174/benchmark.html'); if (response.ok) { ready = true; break; } } catch { /* wait */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!ready) throw new Error('Benchmark fixture did not start');
  const browser = await engine.launch(engineName === 'chromium' && !process.env.CI ? { channel: 'chrome' } : {});
  try {
    for (let i = 0; i < runs; i += 1) {
      const page = await browser.newPage();
      await page.goto('http://127.0.0.1:4174/benchmark.html');
      await page.waitForFunction(() => typeof window.runInhibitorBenchmark === 'function');
      const baseline = await page.evaluate(count => window.runInhibitorBenchmark(false, count), iterations);
      const enabled = await page.evaluate(count => window.runInhibitorBenchmark(true, count), iterations);
      results.push({ baseline, enabled, addedEventWorkMs: enabled.eventWorkMs - baseline.eventWorkMs });
      await page.close();
    }
    const report = {
      schemaVersion: '1.0', generatedAt: new Date().toISOString(), sdkVersion: '0.1.0',
      hardware: { cpu: cpus()[0]?.model, logicalCores: cpus().length, totalMemoryBytes: totalmem(), freeMemoryBytesAtEnd: freemem(), os: platform(), osRelease: release() },
      browser: { engine: engineName, version: browser.version() }, fixture: 'apps/playground/benchmark.html', runs, iterations,
      addedEventWorkMs: stats(results.map(item => item.addedEventWorkMs)),
      serializationMs: stats(results.map(item => item.enabled.serializationMs)),
      results,
      limitations: 'Synthetic events on this host; not a 30-second low-end device trace or retained heap measurement.',
    };
    mkdirSync(join(root, 'benchmarks/reports'), { recursive: true });
    const path = join(root, 'benchmarks/reports', `${new Date().toISOString().slice(0, 10)}-${engineName}.json`);
    writeFileSync(path, JSON.stringify(report, null, 2));
    console.log(path, JSON.stringify({ addedEventWorkMs: report.addedEventWorkMs, serializationMs: report.serializationMs }));
  } finally { await browser.close(); }
} finally { server.kill('SIGTERM'); }
