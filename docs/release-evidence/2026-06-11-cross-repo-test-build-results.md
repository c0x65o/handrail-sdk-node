# Cross-repo Signals Node SDK test/build results

Owner Goal: `f51f72ae-b279-4b65-8f23-2754c33ab82f`
Owner Task item: `3c19565d-64b8-42b5-8134-4c34b0a13477`
Work request: `5145a789-ec1a-4651-b5bb-acbf865c5637`
Captured: 2026-06-11

These commands were run against the current dirty cross-repo workspace. Existing unrelated dirty changes were preserved. No secrets were retained in this note; command output that included seeded local demo credentials or masked test secrets is summarized only by non-secret status lines.

## handrail-sdk-node SDK

Working directory: `/opt/handrail/repos/hitcents/handrail/handrail-sdk-node`

Command:

```sh
NODE_COMPILE_CACHE=/opt/handrail/repos/hitcents/handrail/.node-compile-cache/sdk npm test
```

Status: PASS

Key output:

```text
> @handrail/sdk-node@0.1.21 test
> npm run check && node --test test/*.test.cjs
> @handrail/sdk-node@0.1.21 check
> node --check src/index.cjs && node --check src/index.mjs
# Subtest: fake intake smoke captures Runtime and Product Signals through injected fetch
ok 49 - fake intake smoke captures Runtime and Product Signals through injected fetch
# Subtest: Product Signals transport uses analytics keys and does not leak Runtime/APM tokens when both transports are enabled
ok 51 - Product Signals transport uses analytics keys and does not leak Runtime/APM tokens when both transports are enabled
# tests 86
# pass 86
# fail 0
# duration_ms 1792.153307
```

## Handrail app

Working directory: `/opt/handrail/repos/hitcents/handrail/handrail`

Command:

```sh
NODE_COMPILE_CACHE=/opt/handrail/repos/hitcents/handrail/.node-compile-cache/handrail npm run lint
```

Status: PASS with warnings

Key output:

```text
> handrail@1.2.1757 lint
> eslint eslint.config.js vite.config.js scripts src
...
92 problems (0 errors, 92 warnings)
```

Command:

```sh
NODE_COMPILE_CACHE=/opt/handrail/repos/hitcents/handrail/.node-compile-cache/handrail npm run test:one -- scripts/test-signals-node-sdk-install-state.mjs scripts/test-project-capability-observability-apm.mjs scripts/test-observability-apm-runbook-kb.mjs scripts/test-project-analytics-tab.mjs scripts/test-analytics-read-router.mjs scripts/test-apm-rollup-schema.mjs scripts/test-observability-ui-contracts.mjs
```

Status: PASS

Key output:

```text
> handrail@1.2.1757 test:one
> npm run test:prepare && node --env-file-if-exists=.env --test scripts/test-signals-node-sdk-install-state.mjs scripts/test-project-capability-observability-apm.mjs scripts/test-observability-apm-runbook-kb.mjs scripts/test-project-analytics-tab.mjs scripts/test-analytics-read-router.mjs scripts/test-apm-rollup-schema.mjs scripts/test-observability-ui-contracts.mjs
Preparing test database: postgresql://handrail:redacted@127.0.0.1:5432/handrail_test_handrail
Test database ready.
# tests 160
# pass 160
# fail 0
# duration_ms 2335.910707
```

Command:

```sh
NODE_COMPILE_CACHE=/opt/handrail/repos/hitcents/handrail/.node-compile-cache/handrail npm run build
```

Status: PASS with Vite chunk warning

Key output:

```text
> handrail@1.2.1757 build
> vite build
vite v6.4.2 building for production...
509 modules transformed.
(!) Some chunks are larger than 500 kB after minification.
built in 12.67s
```

## VLBO Website Scout

Working directory: `/opt/handrail/repos/hitcents/handrail/vlbo-website-scout`

Command:

```sh
NODE_COMPILE_CACHE=/opt/handrail/repos/hitcents/handrail/.node-compile-cache/vlbo npm run lint
```

Status: FAIL

Key output:

```text
> vlbo-website-scout@0.1.317 lint
> eslint --cache --cache-location .eslintcache eslint.config.js vite.config.ts scripts src templates/website/report-card-v1

/opt/handrail/repos/hitcents/handrail/vlbo-website-scout/src/smoke/freshDev5552ScoutCampaign.ts
  573:10  error  'visibleWebsiteLabel' is defined but never used  @typescript-eslint/no-unused-vars
  586:9   error  'market' is assigned a value but never used      @typescript-eslint/no-unused-vars

2 problems (2 errors, 0 warnings)
```

Follow-up: fix the unused variables in `src/smoke/freshDev5552ScoutCampaign.ts`. This lint failure is outside the focused Signals SDK validation path and was not changed in this evidence-only item.

Command:

```sh
NODE_COMPILE_CACHE=/opt/handrail/repos/hitcents/handrail/.node-compile-cache/vlbo npm run typecheck
```

Status: PASS

Key output:

```text
> vlbo-website-scout@0.1.317 typecheck
> tsc --noEmit --incremental --tsBuildInfoFile .typecheck.tsbuildinfo
```

Command:

```sh
NODE_COMPILE_CACHE=/opt/handrail/repos/hitcents/handrail/.node-compile-cache/vlbo npx vitest run --reporter=dot src/config/handrailApm.test.ts src/server/handrailApm.test.ts src/worker/http.test.ts src/worker/leaseLoop.test.ts src/worker/runner.test.ts src/shared/workerRuntime.test.ts
```

Status: PASS

Key output:

```text
RUN  v4.1.6 /opt/handrail/repos/hitcents/handrail/vlbo-website-scout
...
stdout | src/server/handrailApm.test.ts > Handrail APM HTTP instrumentation > emits sanitized Scout request events to the configured fake intake
stdout | src/worker/http.test.ts > worker health > emits sanitized exception events from worker request failures
Test Files  6 passed (6)
Tests  99 passed (99)
Duration  79.68s
```

Command:

```sh
NODE_COMPILE_CACHE=/opt/handrail/repos/hitcents/handrail/.node-compile-cache/vlbo npm run build
```

Status: PASS with Vite chunk warning

Key output:

```text
> vlbo-website-scout@0.1.317 build
> npm run build:report-card-template && tsc -p tsconfig.build.json && vite build
Synced generated customer site to public/site using fallback content.
templates/website/report-card-v1: built in 1.71s
main build: 72 modules transformed.
(!) Some chunks are larger than 500 kB after minification.
main build: built in 2.94s
```

## Hitcents Website

Working directory: `/opt/handrail/repos/hitcents/handrail/hitcents-website-v2`

Command:

```sh
NODE_COMPILE_CACHE=/opt/handrail/repos/hitcents/handrail/.node-compile-cache/hitcents npm run check
```

Status: PASS

Key output:

```text
> rest-express@3.0.13 check
> tsc
```

Command:

```sh
NODE_COMPILE_CACHE=/opt/handrail/repos/hitcents/handrail/.node-compile-cache/hitcents npm run build
```

Status: PASS with Browserslist and Vite chunk warnings

Key output:

```text
> rest-express@3.0.13 build
> vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
Browserslist: browsers data (caniuse-lite) is 20 months old.
2681 modules transformed.
(!) Some chunks are larger than 500 kB after minification.
built in 9.87s
dist/index.js  59.6kb
Done in 25ms
```

Focused fake-intake/Product Signals smoke: not run because `package.json` exposes only `build`, `check`, `db:push`, `db:push:drizzle`, `dev`, `docker:smoke`, and `start`; a file search found `scripts/docker-smoke.sh` and `server/notifications.test.ts`, but no existing focused fake-intake, Product Signals, or Handrail Signals smoke script.

## Result summary

- SDK: PASS.
- Handrail app: PASS for lint, focused tests, and build; lint has warnings only.
- VLBO Website Scout: FAIL for lint due to two unused variables in an existing smoke file; PASS for typecheck, focused Runtime Signals/handrailApm tests, and build.
- Hitcents Website: PASS for typecheck and build; no focused Signals smoke script is present to run.
