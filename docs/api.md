# API reference

`new Inhibitor(options?)` creates an idle SDK without collecting data. `initialize()` validates configuration and moves to `initialized`. `start({ consent: true })` starts a new ephemeral session and is idempotent while running. `stop()` removes listeners, aborts active delivery, clears the queue and moves to `stopped`. A subsequent `start` creates a new session ID. `dispose()` permanently releases resources and is idempotent.

`getSessionSignals(): Promise<SessionSnapshot>` returns schema `1.0` aggregates while running or after stop. `flush(): Promise<FlushResult>` sends a snapshot only while running and only when transport is enabled. `getState()` returns `idle | initialized | running | stopped | disposed`. `getQueueStats()` returns in-memory depth and dropped count.

## Options

| Option | Default | Meaning |
|---|---:|---|
| `collect.environment` | `true` | Coarse browser, viewport and capability flags |
| `collect.behavior` | `true` | Aggregate pointer, keyboard and visibility events |
| `collect.automationIndicators` | `false` | Unavailable in this release |
| `sampling.pointer` | `0.1` | Probability per eligible pointer event, 0–1 |
| `sampling.keyboardTiming` | `true` | Include coarse inter-event timing |
| `transport.enabled` | `false` | Enable explicit or periodic delivery |
| `transport.maxBatchSize` | `20` | Maximum snapshots per request |
| `transport.maxQueueSize` | `100` | Maximum buffered snapshots |
| `transport.flushIntervalMs` | `10000` | Periodic flush interval |
| `transport.timeoutMs` | `10000` | Request timeout |
| `transport.maxRetries` | `2` | Retries for transient failures |

`privacy.requireExplicitStart`, `privacy.excludeEditableTargets` and `privacy.captureInputValues` cannot be weakened; only `true`, `true`, and `false` respectively are accepted. `plugins` are collectors with `id`, `start(ctx)`, `stop()` and `snapshot()`. Their aggregate metrics appear under `SessionSnapshot.plugins[id]` after numeric and key validation; strings and objects are discarded. Plugin authors must still review their own data shape because numeric fields can encode sensitive information.

## Errors

Configuration errors throw `InhibitorError` with `code: INVALID_CONFIG`. `start` can reject with `CONSENT_REQUIRED`, `UNSUPPORTED_ENVIRONMENT` or `DISPOSED`. `getSessionSignals` rejects with `NO_SESSION` before start or after dispose. `flush` settles with typed failure codes such as `TRANSPORT_DISABLED`, `NOT_RUNNING`, `HTTP_ERROR`, `TIMEOUT`, `NETWORK_ERROR`, or `ABORTED`.

## Payload

```json
{
  "schemaVersion": "1.0",
  "sdk": { "name": "inhibitor-js", "version": "0.1.0" },
  "session": { "id": "ephemeral-uuid", "startedAt": "2026-11-06T00:00:00.000Z", "durationMs": 1200 },
  "environment": { "browserFamily": "chromium", "viewportBucket": "768-1023", "capabilities": { "pointerEvents": true } },
  "behavior": { "pointerEventCount": 2, "keyboardEventCount": 0, "visibilityChangeCount": 0 },
  "diagnostics": { "droppedEvents": 0, "sampledEvents": 2, "unsupportedCollectors": [] }
}
```
