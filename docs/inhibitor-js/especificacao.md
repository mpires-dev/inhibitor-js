# inhibitor-js — Product & Technical Specification

**Status:** Draft v0.1 · **License:** MIT (proposed) · **Language:** TypeScript · **Target:** npm + GitHub · **Last updated:** 2026-11-06

> An open-source, privacy-conscious, performance-first browser telemetry SDK for session risk research, behavior analytics, and device integrity signals. It produces explainable signals; it does **not** claim to conclusively identify humans, devices, or fraud.

## 1. Vision and positioning

`inhibitor-js` is an embeddable, framework-agnostic browser SDK that collects **consented, minimal, non-content** session telemetry and produces normalized summaries for risk assessment. It should be easy to integrate, cheap to run on low-end devices, and observable under automated benchmarks.

**Primary audience:** fintech/platform engineers, security researchers, risk engineering teams and SDK maintainers. **Portfolio objective:** demonstrate browser internals, SDK architecture, performance engineering, security/privacy engineering, cross-browser reliability and npm release discipline.

### Goals

1. Stable, typed, documented public API with a small browser bundle.
2. Modular collectors for device environment, behavioral timing and automation *indicators*.
3. Deterministic lifecycle, explicit opt-in/opt-out and data minimization.
4. Safe buffering and optional telemetry delivery with controllable overhead.
5. Reproducible Chrome/Firefox/WebKit benchmarks and cross-browser tests.
6. Production-quality npm packaging, semantic versioning, changelog, supply-chain safeguards and demos.

### Non-goals (v1)

- De-anonymizing people or evading browser privacy protections.
- Capturing keystroke values, form contents, passwords, clipboard, raw pointer trajectories or precise location.
- A high-confidence persistent unique identifier across browser resets or contexts.
- An ML fraud model, decision engine, commercial anti-bot guarantee or universal fraud score.
- Circumventing anti-tracking protections, CAPTCHA or security controls.
- Collecting telemetry before an application's configured consent/authorization gate.

## 2. Scope and phased delivery

| Phase | Scope | Exit criteria |
|---|---|---|
| M0: Foundation | Monorepo, public API, build, lint, tests, docs, privacy model, CI | Importable package, zero collection before `start()` |
| M1: Core MVP | Environment collector, aggregate pointer/keyboard timing, bounded queue, snapshot, flush, dispose, playground | E2E in Chromium, Firefox, WebKit; privacy tests pass |
| M2: Production SDK | Config validation, retries, abort, lifecycle, sampling, transport adapter, performance budgets, npm prerelease | Measured budgets; npm `next` prerelease |
| M3: Research modules | Optional automation anomaly indicators, worker-based aggregation where useful, consent adapter, detailed benchmark reports | Evidence-backed false-positive limitations and browser compatibility matrix |
| M4: v1.0 | Hardened docs, reproducible fixtures, security review, release workflows and examples | Stable API, npm latest, versioned documentation |

**MVP boundary:** start with environment metadata plus aggregate event timings, not sophisticated fingerprinting or high-confidence bot classification. Add advanced signals only after utility and privacy review.

## 3. Repository and package architecture

```text
inhibitor-js/
├── apps/
│   └── playground/              # Vite + React: instrumentation and live metrics
├── packages/
│   ├── core/                    # Lifecycle, config, plugin contracts, state, snapshots
│   ├── browser/                 # Browser environment and interaction collectors
│   ├── transport/               # Optional HTTP transport, queue, retry, backoff
│   └── inhibitor/               # Public npm entrypoint: inhibitor-js
├── examples/
│   ├── vanilla/
│   └── react/
├── benchmarks/
│   ├── browser/                 # Playwright scenarios and instrumentation
│   └── reports/                 # Versioned machine-readable output
├── docs/                        # API, signal catalog, privacy, integration, recipes
├── .github/workflows/
├── pnpm-workspace.yaml
├── package.json
└── LICENSE
```

Use **pnpm workspaces** + **Turborepo (optional)**, TypeScript strict, **tsup or Rollup** for package builds, Vitest for unit tests, Playwright for cross-browser E2E. Keep collector logic dependency-light and avoid React imports in runtime packages.

**Public npm strategy:** publish the facade initially as `inhibitor-js` if available, otherwise a verified owned scope such as `@matheus-pires/inhibitor-js`; internal packages should remain private until a deliberate multi-package release decision. **Do not assume package name or npm scope availability.** Repository name `inhibitor-js` can be independent of published name.

### Boundaries

- `core` knows collector interfaces but has no direct DOM imports at module evaluation time.
- `browser` owns DOM/browser API feature detection, subscriptions and signal aggregation.
- `transport` accepts typed payloads and exposes delivery receipts; never reads DOM.
- `inhibitor` exposes the supported public API and composes default collectors.
- `playground` uses the same public API consumers use, not private imports.

## 4. Public API design

Prefer a **consent-gated explicit start** over collection inside constructor or import. `initialize()` performs configuration and capability checks; `start()` activates collectors only after the host application has obtained an appropriate legal basis/consent where required.

```ts
import { Inhibitor } from "inhibitor-js";

const sdk = new Inhibitor({
  endpoint: "https://risk.example.com/v1/events",
  collect: {
    environment: true,
    behavior: true,
    automationIndicators: false,
  },
  sampling: { pointer: 0.1, keyboardTiming: true },
  privacy: {
    requireExplicitStart: true,
    excludeEditableTargets: true,
    captureInputValues: false, // Permanently unsupported; config is documentary
  },
  transport: { enabled: false, maxBatchSize: 20, flushIntervalMs: 10_000 },
});

await sdk.initialize(); // zero telemetry collected
await sdk.start({ consent: true }); // explicit integration-level gate

const snapshot = await sdk.getSessionSignals();
// Application decides whether and where to send snapshot.
await sdk.flush();
await sdk.stop();
await sdk.dispose();
```

**Security note:** `consent: true` is an integration assertion, not proof of legal consent. Document consent withdrawal and host responsibilities. No secret API keys inside browser bundles; if auth is required, use a restricted public token or a customer-controlled relay.

### API contract

```ts
type LifecycleState = "idle" | "initialized" | "running" | "stopped" | "disposed";

interface InhibitorOptions {
  endpoint?: string;
  collect?: {
    environment?: boolean;
    behavior?: boolean;
    automationIndicators?: boolean;
  };
  sampling?: { pointer?: number; keyboardTiming?: boolean };
  privacy?: { requireExplicitStart?: true; excludeEditableTargets?: true };
  transport?: {
    enabled?: boolean;
    maxBatchSize?: number;
    flushIntervalMs?: number;
    timeoutMs?: number;
    maxRetries?: number;
  };
  plugins?: Collector[];
}

interface Inhibitor {
  initialize(): Promise<void>;
  start(options: { consent: boolean }): Promise<void>;
  stop(): Promise<void>;
  getSessionSignals(): Promise<SessionSnapshot>;
  flush(): Promise<FlushResult>;
  dispose(): Promise<void>;
  getState(): LifecycleState;
}

interface CollectorContext {
  sessionId: string; // random, ephemeral, session-scoped
  now(): number;
  emit(signal: AggregatedSignal): void;
  signal: AbortSignal;
}

interface Collector {
  readonly id: string;
  start(ctx: CollectorContext): void | Promise<void>;
  stop(): void | Promise<void>;
  snapshot(): Record<string, unknown>;
}
```

### Lifecycle invariants

- Import and `new Inhibitor()` are free of observable collection, listeners and network I/O.
- `initialize()` validates and detects supported capabilities but does not subscribe to interaction events.
- `start()` is idempotent when running and rejects after `dispose()`; a `consent: false` assertion must fail closed.
- `stop()` removes all listeners/timers and halts collection; restarting creates a new ephemeral session ID by default.
- `dispose()` is idempotent and permanently releases collectors, queues, timers and workers.
- Browser-unavailable/SSR environments must import safely; `start()` reports `UNSUPPORTED_ENVIRONMENT`.
- Internal collector failure never throws synchronously from a DOM event handler or crashes the host app.
- `flush()` settles with a typed result; failure is observable, never silently treated as successful delivery.

## 5. Signal catalog and privacy classification

All collectors must have a documented purpose, retention policy, data shape, feature detection and compatibility matrix.

| Signal | Data produced | MVP | Privacy treatment |
|---|---|---|---|
| Browser family / major version | Coarse normalized categories | Yes | Avoid full user-agent strings |
| Viewport size | Coarse bucket (e.g. 320–479 px) | Yes | No exact dimensions by default |
| Time zone | Coarse UTC offset | Optional | Avoid detailed locale fingerprint |
| Feature support | Limited booleans for relevant APIs | Yes | Do not combine into stable opaque identifier |
| Pointer interactions | Counts, coarse timing histogram, sample rate | Yes | No coordinates or paths exported |
| Keyboard interactions | Counts and coarse inter-event timing statistics | Yes | No key values, key codes or editable/password fields |
| Focus / visibility | Count and total duration buckets | Yes | No page content or external app identity |
| Touch gestures | Coarse event counts/aggregate durations | M3 | No touch positions or raw gesture replay |
| Automation indicators | Explicitly uncertain feature anomalies | M3 | No invasive probing; no binary bot verdict |
| Canvas/WebGL characteristics | Disabled by default | Future research | Separate opt-in and privacy/security review; no raw pixel hashes in MVP |

**Hard prohibitions:** do not access or transmit form values, names, emails, payment data, password/OTP contents, clipboard, geolocation, microphone, camera, DOM text, raw event traces, full URLs, persistent storage IDs or cross-site identifiers. Do not log these values in debug mode. Ignore events from `input`, `textarea`, `select`, `contenteditable` and their descendants; when uncertain, discard.

**Data minimization:** cap precision, aggregate locally, rotate identifiers per session, define conservative TTLs, restrict transport destination to configured origin(s), and keep collection off by default. Document LGPD/GDPR responsibilities; open source does not automatically make processing compliant.

## 6. Data model and payload schema

Schemas must be versioned, backwards-compatible within a major release and validated at boundaries.

```ts
interface SessionSnapshot {
  schemaVersion: "1.0";
  sdk: { name: "inhibitor-js"; version: string };
  session: {
    id: string;            // crypto.randomUUID, ephemeral
    startedAt: string;     // ISO timestamp
    durationMs: number;
  };
  environment?: {
    browserFamily?: "chromium" | "firefox" | "webkit" | "unknown";
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
  diagnostics: {
    droppedEvents: number;
    sampledEvents: number;
    unsupportedCollectors: string[];
  };
}
```

The payload must not include a global fraud score. Any optional anomaly scoring module later must declare a calibration dataset, uncertainty, false-positive limitations and explainable reasons.

## 7. Event processing and performance design

```text
Browser events
   ↓ feature checks and sensitive-target exclusion
Sampling / rate limits
   ↓
In-memory aggregates (fixed-size histograms and counters)
   ├── snapshot() → local consumer
   └── bounded queue → optional batch transport → configured endpoint
```

### Engineering requirements

- Register listeners only while running; use passive listeners where they do not affect interaction semantics.
- Avoid allocation per high-frequency event; never retain `Event` objects, node references or entire event paths.
- Fixed-size histograms and counters; memory complexity roughly O(number of enabled metric buckets), independent of session duration.
- Use monotonic `performance.now()` for intervals and carefully handle background-tab throttling.
- Pointer sampling must be documented as event-level probabilistic sampling; do not present sampled counts as exact without an estimator and uncertainty.
- Only consider Workers when benchmarks show meaningful gains relative to message-passing cost.
- Strict bounded queue: evict with a reported `droppedEvents` counter; never grow unbounded under offline conditions.
- Avoid synchronous storage, synchronous XHR and long main-thread tasks.

### Initial budgets (targets, not measured claims)

| Metric | Initial target | Measurement method |
|---|---:|---|
| Compressed facade bundle, core MVP | ≤ 15 KiB gzip | `size-limit` or equivalent after production build |
| Added main-thread time over 30 s scripted session | ≤ 10 ms total | Browser trace relative to baseline, median of repeated runs |
| SDK live retained memory | ≤ 1 MiB | Heap snapshot delta where exposed; repeatable proxy elsewhere |
| Long tasks attributable to SDK | 0 tasks ≥ 50 ms | PerformanceObserver / trace |
| Idle network requests (transport disabled) | 0 | Playwright network instrumentation |
| Maximum buffered items | 100 (configurable within bounded range) | Stress test while endpoint offline |
| Snapshot serialization | ≤ 5 ms median on test device | Browser benchmark |

Benchmark targets should be revised based on reproducible baseline data; report device hardware, OS, browser version, page fixture, sample count and distribution (median/p95), not only best-case averages.

## 8. Transport specification

Transport is opt-in. `endpoint` alone does not enable it.

- POST JSON batches with `schemaVersion`, `batchId` (ephemeral), `sentAt` and snapshots/aggregate events.
- Retry only safe transient failures (timeouts, 408, 429, 5xx) with bounded exponential backoff + jitter, honoring `Retry-After` where practical.
- No retry for ordinary 4xx validation/auth failures; provide typed error details without leaking payloads.
- Explicit timeout via `AbortController`; fail closed on invalid URL protocol; HTTPS required outside localhost test environments.
- No implicit persistent offline queue. `sendBeacon` on page exit may be a configurable best-effort option, subject to payload and browser constraints.
- Apply configurable CORS expectations and document server-side auth/rate-limits; do not store secrets in frontend code.
- Provide an injectable `Transport` interface so applications can use their own fetch/relay without bundling the default client.

## 9. Developer experience and packaging

**Desired imports:**

```ts
import { Inhibitor } from "inhibitor-js";
import type { SessionSnapshot, Collector } from "inhibitor-js";
```

- ESM first, `.d.ts` included, explicit package `exports`, `sideEffects: false` only after confirming modules are side-effect-free.
- Optionally support CJS if a real consumer need exists; otherwise document ESM-only and supported Node tooling.
- Target modern evergreen browsers; SSR-safe import; no Node polyfills in the browser.
- `engines`, `files`, `types`, `exports`, `repository`, `homepage`, `bugs`, `license` and `publishConfig` set correctly.
- TypeDoc API reference, integration tutorials, error reference, architecture diagrams and copy-paste examples.
- Clear browser and framework compatibility matrix; compatibility based on CI results rather than assumptions.
- README: 60-second install, explicit start/stop example, privacy notice, payload example, benchmark links and limitations.

## 10. Testing and quality strategy

| Layer | Required tests |
|---|---|
| Unit (Vitest) | Config validation, state transitions, sampling determinism with seeded RNG, histograms, retry/backoff, schema parsing |
| Contract | Collector plugin contract, snapshot JSON shape, typed public exports, backwards-compatible field evolution |
| Privacy | No key values, editable targets excluded, zero telemetry prior to start, no network when disabled, stop/dispose cleanup |
| E2E (Playwright) | Chromium, Firefox, WebKit; touch fixture where supported; background tab, navigation, denied APIs, offline, malformed endpoint |
| Performance | Idle, pointer stress, keyboard stress, prolonged session, 100 rapid mount/unmount cycles; compare no-SDK baseline |
| Packaging | Build tarball, `npm pack --dry-run`, install tarball in vanilla Vite and Next.js SSR fixture |
| Security | Dependency audit, static analysis, malicious endpoint test, no secret emission, payload redaction checks |

### Acceptance criteria for MVP

1. Fresh consumer app can install package and typecheck without internal imports.
2. Zero listeners/collection/network activity before `start()`; transport disabled produces zero network requests.
3. `stop()` and `dispose()` release all allocated resources, verified after repeated cycles.
4. No keystroke contents, editable-target data or coordinates in memory snapshots or sent payloads.
5. Same API works in all three Playwright engines, with capability-based degradation.
6. All documented budgets have repeatable measurements; failures block promotion to stable release unless explicitly rebaselined with evidence.
7. Published npm tarball contains no source maps with secrets, test fixtures, private files or oversized dependency tree.

## 11. Playground requirements

The playground should show **session state**, feature support, real-time aggregate counts/histograms, collector toggle state, queue depth, dropped events, serialized snapshot and performance measurements.

Include:

- Explicit **Start collection / Stop / Clear session** controls and visible consent explanation.
- Interactive sandbox surface for pointer and keyboard timing tests; no editable-input capture.
- Network simulator with latency, error rate and offline toggle (local mock endpoint only).
- Side-by-side SDK-enabled vs baseline benchmark modes.
- Privacy inspector showing precisely which keys can leave the browser.
- Downloadable JSON benchmark report; no real user data persisted by default.

## 12. CI/CD, npm publication and governance

### GitHub Actions pipelines

- **PR checks:** install with frozen lockfile → typecheck → lint → unit → build → package fixture → Playwright browser matrix → privacy tests → bundle-size check.
- **Nightly/weekly:** extended benchmark matrix, vulnerability monitoring, optional browser beta channels.
- **Release:** Changesets version PR → changelog → tagged release → npm publication via **trusted publishing/OIDC** where supported → GitHub release → docs deployment.
- Use least-privilege workflow permissions, protected main branch, required checks, pinned actions where practical and provenance attestations where supported.
- Initial prereleases use `next` dist-tag; promote to `latest` only after validations.

### npm release checklist

1. Confirm registry availability and ownership for `inhibitor-js` (or choose owned scope).
2. Reserve exact npm package name only through legitimate publish workflow; do not assume availability.
3. Verify `npm pack --dry-run` contents and install packed tarball in clean consumer fixtures.
4. Configure npm trusted publisher and package access; protect maintainer accounts with 2FA.
5. Publish `0.1.0-next.0`, smoke-test consumer imports and browser execution.
6. Publish stable version after compatibility/performance/privacy checks; provide provenance and signed/reproducible release metadata where practical.

### Repository policies

MIT license; `CONTRIBUTING.md`; `CODE_OF_CONDUCT.md`; `SECURITY.md` with coordinated reporting; changelog; semantic versioning; dependency policy; public roadmap; collector proposal template with privacy impact checklist. No telemetry from the library itself beyond what the host explicitly opts into.

## 13. Risks and trade-offs

| Risk | Mitigation |
|---|---|
| Browser restrictions and signal entropy change | Capability detection, avoid stable identity claims, browser matrix |
| Privacy concerns / regulatory obligations | Default-off, coarse aggregation, content exclusion, limited session retention, integration guidance |
| Performance regressions on low-end devices | Fixed memory, sampling, continuous benchmarks, disabled collectors by default where costly |
| False positives for automation heuristics | Indicators only, explainability, evaluation fixtures, no hard bot verdict |
| Third-party scripts and CSP | Document CSP/nonce requirements where applicable, no dynamic eval, stable distributable |
| SDK adoption/version fragmentation | SemVer, schema version, deprecation policy, integration tests |
| Offline queue memory growth | Hard queue caps and explicit dropped-event accounting |

## 14. Suggested first issues (ordered)

1. Scaffold pnpm workspace, strict TS configs, formatter/linter, package build.
2. Implement SSR-safe public facade and lifecycle state machine.
3. Define schema contracts, collector interface and error types.
4. Build environment collector using coarse buckets and feature checks.
5. Build pointer and keyboard timing aggregator with sensitive-target filtering.
6. Implement bounded in-memory queue and mockable transport interface.
7. Create playground with explicit collection controls and privacy inspector.
8. Write Vitest and three-engine Playwright privacy/lifecycle suites.
9. Establish fixed benchmark fixtures + JSON reports + CI bundle budget.
10. Package smoke tests and first `next` npm release.

## 15. Definition of done for v1.0

- [ ] Public API documented, semver-stable, SSR-safe and type-safe.
- [ ] Consent-gated lifecycle; zero collection on import/initialization.
- [ ] Cross-browser collectors implemented with privacy reviews.
- [ ] No sensitive input values or raw interaction traces collected/exported.
- [ ] Transport is optional, bounded, retry-safe and observable.
- [ ] Benchmarks published with reproducible methodology and hardware details.
- [ ] Browser matrix CI green; performance and privacy checks enforced.
- [ ] npm package published with correct metadata and provenance where available.
- [ ] Playground deployed, with live local demos and no default remote data collection.
- [ ] Security disclosures, contribution guide, license and changelog present.

## 16. Open technical decisions

1. Publish only `inhibitor-js` or expose modular `@inhibitor/*` packages after adoption?
2. ESM-only or dual ESM/CJS package? Decide from consumer fixture tests.
3. In-process aggregation or Worker for specific high-frequency metrics? Benchmark first.
4. Consent integration contract: manual gate only, or optional adapters for consent managers?
5. Define environment signal coarse-bucketing thresholds using privacy and utility evaluation.
6. Choose benchmark CI hardware and variance tolerance before setting hard regression gates.
7. Decide whether future automation plugins should live in a separate experimental package.

---

**Guiding principle:** publish a small, honest, high-quality SDK whose performance, privacy properties and limitations are empirically testable. Avoid marketing claims of uniquely identifying devices or reliably detecting fraud until validated with representative data.
