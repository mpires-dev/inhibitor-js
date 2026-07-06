# Benchmark method

Targets from the product specification: compressed facade ≤15 KiB, SDK-added main-thread work ≤10 ms across 30 seconds, retained memory ≤1 MiB, zero SDK long tasks ≥50 ms, zero idle requests with transport off, queue ≤100 and snapshot serialization ≤5 ms median. These are **targets**, not measured claims.

Run the browser benchmark fixture with Playwright in Chromium, Firefox and WebKit. Record OS, CPU, memory, browser version, script version, page fixture, number of runs, median and p95. Compare an SDK-enabled run with a baseline run that dispatches the same scripted events. Repeat on a low-end device before promoting any result to a CI gate. The playground can download a local snapshot timing report; it is a diagnostic, not a full trace benchmark.

Run `pnpm bench` after `pnpm build`. `BENCH_BROWSER=firefox|webkit`, `BENCH_RUNS` and `BENCH_EVENTS` select the engine and workload. A JSON report is written under `benchmarks/reports/`.

The [2026-11-06 Chromium report](../benchmarks/reports/2026-11-06-chromium.json) records 7 paired runs of 10,000 synthetic pointer events (plus 2,500 keyboard events) on an Apple M1. Median added event work was 17 ms, p95 18.4 ms. The browser reported snapshot serialization near 0 ms at its exposed timer precision. These are synthetic event-loop measurements, not the specified 30-second low-end device trace or a retained-heap measurement; no production performance claim follows from them.

The same fixture produced [Firefox](../benchmarks/reports/2026-11-06-firefox.json) median/p95 added work of 36/57 ms and [WebKit](../benchmarks/reports/2026-11-06-webkit.json) 30/33 ms. Cross-engine differences need repeated runs on dedicated CI hardware before setting a hard regression gate.
