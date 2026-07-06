# Signal catalog

All built-in signals are retained only for the active in-memory session, then discarded on stop/dispose or page unload. Delivery occurs only if the host enables transport.

| Signal | Purpose | Shape | Compatibility and fallback |
|---|---|---|---|
| Browser family | Coarse environment context | `chromium`, `firefox`, `webkit`, `unknown` | Unknown when detection is uncertain |
| Viewport bucket | Coarse layout context | Fixed width range string | Omitted when unavailable |
| Capabilities | Explain feature support | Small boolean map | False when unsupported |
| Pointer interactions | Activity volume and timing | Sampled count and fixed histogram | Omitted where PointerEvent unavailable |
| Keyboard interactions | Non-editable interaction timing | Count and fixed histogram | No key content; timing can be disabled |
| Visibility changes | Backgrounding context | Count | Omitted where Page Visibility API unavailable |

Browser support is capability-based. The Playwright suite is the source of verified engine results; do not infer support from user-agent alone. The SDK deliberately omits touch traces, canvas/WebGL hashes and automation verdicts.

Interaction events are counted only when the event path points to a small allowlist of native targets (`button`, `a`, `label`, `li`, `img`, `svg`, `canvas`). This conservative rule prevents a closed Shadow DOM host from concealing an editable field from the collector. Events on arbitrary containers are discarded, so counts represent eligible interactions only.

The playground lifecycle and privacy flow passed Playwright tests on Chromium 158, Firefox 159 and WebKit 27.2 on macOS. This verifies the tested paths; it does not certify every event API or operating system combination.
