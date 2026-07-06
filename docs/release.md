# Release checklist

1. Create the public GitHub repository and set the actual `repository`, `homepage`, and `bugs` package metadata. Verify npm name ownership; use an owned scope if `inhibitor-js` is unavailable.
2. Run `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, `pnpm test`, `pnpm check:size`, `pnpm test:package`, `pnpm test:e2e` and benchmarks on all engines and a low-end device.
3. Review privacy and security findings, configure required GitHub checks and private vulnerability reporting, and create a changelog entry for the release.
4. Configure npm trusted publishing and maintainer 2FA. Publish a `next` prerelease with provenance, install it in clean Vite and Next.js consumer fixtures, then consider a stable dist-tag only after the release criteria pass.

No registry or GitHub publication has been performed by this repository setup.
