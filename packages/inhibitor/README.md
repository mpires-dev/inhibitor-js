# inhibitor-js

Consent-gated, framework-agnostic browser session signals. `inhibitor-js` reports coarse, explainable aggregates for research and risk engineering. It does not identify a person or device and does not produce a fraud verdict.

## Install and use

```sh
pnpm add inhibitor-js
```

```ts
import { Inhibitor } from 'inhibitor-js';

const sdk = new Inhibitor({
  collect: { environment: true, behavior: true },
  sampling: { pointer: 0.1, keyboardTiming: true },
  transport: { enabled: false },
});

await sdk.initialize(); // validates options; no telemetry collection
// Call only after your application has established an appropriate legal basis.
await sdk.start({ consent: true });
const snapshot = await sdk.getSessionSignals();
console.log(snapshot);
await sdk.stop(); // removes listeners and clears queued data
await sdk.dispose();
```

`start({ consent: true })` is an assertion by the host application, not proof of consent. No listeners or network calls occur during import, construction or initialization. Transport is off by default. `flush()` returns `{ ok: false, error: { code: 'TRANSPORT_DISABLED' } }` when disabled.

## Optional delivery

```ts
const sdk = new Inhibitor({
  endpoint: 'https://your-relay.example/v1/signals',
  transport: { enabled: true, maxBatchSize: 20, maxQueueSize: 100 },
});
await sdk.start({ consent: true });
const result = await sdk.flush();
if (!result.ok) console.error(result.error?.code);
```

Only HTTPS endpoints are accepted outside localhost. Use a customer-controlled relay and never place secret keys in browser code. A custom `Transport` can be supplied as `transport.adapter`.

## Local development

```sh
pnpm install
pnpm build
pnpm test
pnpm dev
```

The playground runs locally and does not enable delivery. See [API](docs/api.md), [privacy model](docs/privacy.md), [signal catalog](docs/signals.md), and [benchmark method](docs/benchmarks.md).

## Limits

Pointer counts are sampled at the configured event-level rate and are **not** exact totals. Timing histograms are coarse. The SDK avoids form contents, key values, pointer coordinates, URLs, persistent storage and high-entropy fingerprinting. The host remains responsible for notice, legal basis, data retention and server-side controls under applicable law. Browser support and performance must be measured on the target fleet before production decisions.

License: MIT.
