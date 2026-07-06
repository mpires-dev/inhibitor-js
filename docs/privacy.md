# Privacy model

Collection is off until `start({ consent: true })`. The host application decides when that assertion is valid and must provide notice, withdrawal, retention rules and a lawful basis where required by LGPD, GDPR or other law. `stop()` halts collection and clears the pending queue. Data lives in memory only; a page reload ends the session. Session IDs are random and rotate on restart.

Built-in collectors do not inspect key values, key codes, form values, DOM text, pointer coordinates, clipboard, location, camera, microphone, full URLs or persistent storage. Keyboard events from input, textarea, select and contenteditable descendants are discarded. The environment collector uses coarse categories. Transport requires explicit enablement, a configured HTTPS destination (localhost HTTP is accepted for testing), and omits credentials.

Threat boundaries: browser scripts on the same page can call the public API and read snapshots; protect the host page from XSS. A custom plugin or transport adapter can collect or send other information if written to do so; review those extensions before use. Do not put secret API keys in browser bundles. Use a relay with authentication, rate limits and server-side retention controls.

The SDK does not claim legal compliance by itself, distinguish bots conclusively, or produce persistent identity. The default pointer sampling is probabilistic, so counts should not be interpreted as exact event totals.
