# Release checklist

1. The public GitHub repository is [mpires-dev/inhibitor-js](https://github.com/mpires-dev/inhibitor-js), and package `repository`, `homepage`, and `bugs` metadata are set. Before publishing to npm, verify name ownership; use an owned scope if `inhibitor-js` is unavailable.
2. Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm check:size`, `pnpm test:package`, `pnpm test:e2e` and benchmarks on all engines and a low-end device.
3. Review privacy and security findings, configure required GitHub checks and private vulnerability reporting, and create a changelog entry for the release.
4. Configure npm trusted publishing and maintainer 2FA. Publish a `next` prerelease with provenance, install it in clean Vite and Next.js consumer fixtures, then consider a stable dist-tag only after the release criteria pass.

The source is public on GitHub. No npm registry publication has been performed.
