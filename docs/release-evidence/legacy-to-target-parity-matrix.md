# Node SDK Legacy-to-Target Parity Matrix

This matrix tracks the port from the legacy `handrail-apm-node-sdk` package to
the canonical `handrail-sdk-node` package for owner task item
`a01d66b7-d996-49a3-acad-aa8d4f310aa7`.

Legacy baseline:

- Runtime entrypoints: `handrail-apm-node-sdk/src/index.cjs`,
  `handrail-apm-node-sdk/src/index.mjs`
- Type declarations: `handrail-apm-node-sdk/src/index.d.ts`
- Package metadata: `handrail-apm-node-sdk/package.json`
- Package naming policy: `handrail-apm-node-sdk/docs/adr/0001-node-sdk-package-naming.md`
- Test baseline: `handrail-apm-node-sdk/test/**`

Target evidence is relative to `handrail-sdk-node/`. `Present` means the target
path exists in the workspace and maps to the legacy surface. `Pending` means the
port still needs the named target file or proof from a later owner-goal checklist
item.

Out of scope for this matrix and goal: Hitcents Website migration, Demo app
migration, browser SDK work, browser Runtime Signals/error capture, publishing,
deployment, `@handrail/apm-node` alias package publishing, generated install
snippet changes, consumer dependency/import migration, and Handrail
configuration mutation.

The legacy naming ADR kept `@handrail/apm-node` as the canonical package for the
legacy repo and required a future rename to preserve a compatibility package or
documented alias for a supported migration window. This Signals SDK port narrows
that future-rename requirement: `@handrail/sdk-node` is the canonical target
package here, but this owner goal does not create or publish an
`@handrail/apm-node` compatibility alias. Alias mechanics and consumer migration
belong to a later owner goal.

## Package Metadata

| Legacy behavior | Target evidence | Status / closing checklist area |
| --- | --- | --- |
| Package identity `@handrail/apm-node` is renamed to canonical Signals identity | `package.json` name is `@handrail/sdk-node` | Present; created by `9cb0c35a-fc8c-4418-92a2-691c86a9d47a`. |
| Compatibility alias policy for `@handrail/apm-node` | `README.md` package identity policy documents that this repo does not create or publish an `@handrail/apm-node` alias package for `@handrail/sdk-node` in this goal | Present; alias package, npm deprecation, generated install snippets, and consumer dependency/import migration are deferred to a later consumer/package migration goal. |
| Version continuity from `0.1.17` | `package.json` version is `0.1.17` | Present; final package verification remains `b1d79e30-6b62-4df0-a828-8645655a43c7`. |
| Dual CommonJS, ESM, and TypeScript entrypoints | `package.json` `main`, `module`, `types`, and `exports["."]` point to `src/index.cjs`, `src/index.mjs`, and `src/index.d.ts`; `test/entrypoints.test.cjs` covers package self-reference, CommonJS, ESM named, ESM default, declarations, and additive Signals aliases | Present; focused alias entrypoint coverage added by `6ab23e08-6ea7-4870-8b89-c2771601a666`. |
| `sideEffects: false` | `package.json` | Present; package contents proof pending `b1d79e30-6b62-4df0-a828-8645655a43c7`. |
| Node runtime `>=18` | `package.json` `engines.node` | Present; package readiness proof pending `944e795d-0a6e-4729-9cdc-8649c7ceecb3`. |
| Files allowlist includes `src` and `README.md` | `package.json` `files` | Present; pack dry-run proof pending `b1d79e30-6b62-4df0-a828-8645655a43c7`. |
| `check` and `test` scripts | `package.json` `scripts` | Present; target tests pending `df1d79e30-6b62-4df0-a828-8649c7ceecb3` and syntax checks pending `944e795d-0a6e-4729-9cdc-8649c7ceecb3`. |
| Signals-facing keywords replace APM-only framing while preserving analytics/Express discovery | `package.json` `keywords` | Present; README/package guidance pending `cd26d4cb-04c2-4e9e-b030-b433115a96ac`. |
| Optional Express peer dependency | `package.json` `peerDependencies.express` and `peerDependenciesMeta.express.optional` | Present; Express behavior tests pending `4a758bba-8c39-4d2b-9966-5f2718170bcb`. |

## Entrypoint And Type Evidence

| Legacy surface | Target evidence | Status / closing checklist area |
| --- | --- | --- |
| CommonJS `require()` public SDK object | `src/index.cjs` exports the SDK object with legacy names plus additive `HandrailSignalsClient` and `createSignalsClient` aliases | Present; covered by `test/entrypoints.test.cjs`. |
| ESM named exports | `src/index.mjs` re-exports named members from `src/index.cjs` including additive Signals aliases | Present; covered by `test/entrypoints.test.cjs`. |
| ESM default import | `src/index.mjs` default export is the CommonJS SDK object including additive Signals aliases | Present; covered by `test/entrypoints.test.cjs`. |
| TypeScript declarations for the public class, constants, functions, and default SDK object | `src/index.d.ts` declares legacy names plus additive `HandrailSignalsClient` and `createSignalsClient` aliases | Present; covered by `test/entrypoints.test.cjs`. |
| Package SDK metadata resolves to target package | `src/index.cjs` reads package metadata; `src/index.d.ts` declares `SDK_NAME: '@handrail/sdk-node'`; `test/entrypoints.test.cjs` asserts self-reference metadata for CJS, ESM named, and ESM default | Present; covered by `test/entrypoints.test.cjs`. |

## Public Runtime API Matrix

| Area | Legacy public API | Target evidence | Status / closing checklist area |
| --- | --- | --- | --- |
| Entrypoint/type | `HandrailApmClient` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; public API preservation pending `b73333a7-311a-4773-b8bf-8ac8ddbb38ee`. |
| Entrypoint/type | `HandrailSignalsClient` | Additive alias of `HandrailApmClient` in `src/index.cjs`, `src/index.mjs`, `src/index.d.ts`, and `test/entrypoints.test.cjs` | Present; Signals-facing alias added by `6ab23e08-6ea7-4870-8b89-c2771601a666`. |
| Entrypoint/type | `SDK_NAME` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts`, `package.json` | Present; target metadata tests pending `6d4e4a2b-4f1f-4b9a-a44d-57f484945568`. |
| Entrypoint/type | `SDK_VERSION` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts`, `package.json` | Present; target metadata tests pending `6d4e4a2b-4f1f-4b9a-a44d-57f484945568`. |
| Runtime Signals | `addBreadcrumb` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; runtime capture behavior pending `81312aca-d058-4142-a53a-7216057a9048`. |
| Experiment assignment/exposure | `assignExperiment` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; durable assignment proof pending `b5eac69d-2c11-4061-ac04-53c7e3172620`. |
| Product Signals | `buildAnalyticsPayload` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; payload-shape tests pending `5fcc9bfc-658d-4593-81e3-50495d1e1f0b` and fixture corpus pending `4387cc53-c38e-4158-a4b5-c8eb416c4f7a`. |
| Runtime Signals | `captureEvent` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; runtime capture behavior pending `81312aca-d058-4142-a53a-7216057a9048`. |
| Runtime Signals | `captureException` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; exception capture behavior pending `81312aca-d058-4142-a53a-7216057a9048`. |
| Runtime Signals | `captureMessage` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; runtime capture behavior pending `81312aca-d058-4142-a53a-7216057a9048`. |
| Runtime Signals | `captureSpan` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; span behavior pending `81312aca-d058-4142-a53a-7216057a9048`. |
| Entrypoint/type | `createClient` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; public API preservation pending `b73333a7-311a-4773-b8bf-8ac8ddbb38ee`. |
| Entrypoint/type | `createSignalsClient` | Additive alias of `createClient` in `src/index.cjs`, `src/index.mjs`, `src/index.d.ts`, and `test/entrypoints.test.cjs` | Present; Signals-facing alias added by `6ab23e08-6ea7-4870-8b89-c2771601a666`. |
| Experiment assignment/exposure | `experiment` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; compatibility-only local assignment documentation/proof pending `fe8bea09-567f-459f-a56d-9c472961b98c`. |
| Product Signals | `expressAnalyticsMiddleware` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; Product Signals Express behavior pending `b73eee93-6783-4c17-93ca-ad863718c0af`. |
| Runtime Signals | `expressErrorHandler` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts`, `test/express-runtime-signals.test.cjs` | Present; Express error handler parity covered by `2586d81c-1eb8-4d2e-b275-806a480691aa` evidence. |
| Runtime Signals | `expressMiddleware` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts`, `test/express-runtime-signals.test.cjs` | Present; Express request telemetry parity covered by `2586d81c-1eb8-4d2e-b275-806a480691aa` evidence. |
| Entrypoint/type | `flush` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; queue/transport shutdown proof pending `e569b700-3428-4976-a589-6fbed2a8bbc7`. |
| Product Signals | `getAnalyticsConfig` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; analytics config proof pending `6fc1f404-e97a-4de7-ab61-551dc0576c43`. |
| Product Signals | `getAnalyticsStats` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; analytics transport/stats proof pending `486e3b45-2a97-40d0-95f4-9246f3fd3cbd`. |
| Runtime Signals | `getConfig` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; runtime env compatibility proof pending `a63c3186-100d-4e1b-a588-3b391ff9e200`. |
| Runtime Signals | `getStats` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; queue/stats proof pending `e569b700-3428-4976-a589-6fbed2a8bbc7`. |
| Entrypoint/type | `getCurrentClient` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; public API preservation pending `b73333a7-311a-4773-b8bf-8ac8ddbb38ee`. |
| Entrypoint/type | `init` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; public API preservation pending `b73333a7-311a-4773-b8bf-8ac8ddbb38ee`. |
| Runtime Signals | `installProcessErrorHandlers` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; process error handler proof pending `81312aca-d058-4142-a53a-7216057a9048`. |
| Runtime Signals/Product Signals config | `loadConfigFromEnv` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; env compatibility proof pending `a63c3186-100d-4e1b-a588-3b391ff9e200` and `6fc1f404-e97a-4de7-ab61-551dc0576c43`. |
| Product Signals | `page` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; page/route behavior pending `b73eee93-6783-4c17-93ca-ad863718c0af`. |
| Entrypoint/type | `shutdown` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; shutdown timeout proof pending `e569b700-3428-4976-a589-6fbed2a8bbc7`. |
| Product Signals | `track` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; custom event behavior pending `b73eee93-6783-4c17-93ca-ad863718c0af`. |
| Product Signals / experiment conversion | `trackConversion` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; conversion attribution proof pending `26d550a0-f3fb-41ce-92da-a0cb35076991` and acceptance tests pending `aff1fd81-6a24-4e43-992a-18bf2fae33d3`. |
| Experiment assignment/exposure | `trackExperimentExposure` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; explicit exposure proof pending `d00407d8-e4c8-4140-b291-f2e49aed0096` and acceptance tests pending `aff1fd81-6a24-4e43-992a-18bf2fae33d3`. |
| Runtime Signals | `uninstallProcessErrorHandlers` | `src/index.cjs`, `src/index.mjs`, `src/index.d.ts` | Present; process error handler proof pending `81312aca-d058-4142-a53a-7216057a9048`. |

## TypeScript Declaration Matrix

| Declaration category | Legacy declarations | Target evidence | Status / closing checklist area |
| --- | --- | --- | --- |
| Public class and SDK object | `HandrailApmClient`, additive `HandrailSignalsClient`, default `sdk` object | `src/index.d.ts` | Present; declaration assertions covered by `test/entrypoints.test.cjs`. |
| Constants and functions | `SDK_NAME`, `SDK_VERSION`, `createClient`, additive `createSignalsClient`, `init`, `getCurrentClient`, `installProcessErrorHandlers`, `uninstallProcessErrorHandlers`, `loadConfigFromEnv`, `expressMiddleware`, `expressAnalyticsMiddleware`, `expressErrorHandler`, `captureEvent`, `captureException`, `captureMessage`, `captureSpan`, `addBreadcrumb`, `track`, `trackConversion`, `trackExperimentExposure`, `experiment`, `assignExperiment`, `page`, `buildAnalyticsPayload`, `getConfig`, `getAnalyticsConfig`, `getAnalyticsStats`, `getStats`, `flush`, `shutdown` | `src/index.d.ts` | Present; declaration assertions covered by `test/entrypoints.test.cjs`. |
| Runtime Signals option/payload/stats types | `HandrailApmEventType`, `HandrailApmLevel`, `HandrailApmEndpointMode`, `HandrailScrubberHook`, `HandrailSamplerHook`, `HandrailApmOptions`, `HandrailApmResolvedOptions`, `HandrailBreadcrumb`, `HandrailNormalizedException`, `HandrailApmEvent`, `HandrailApmClientLike`, `HandrailFetch`, `HandrailApmStats`, `HandrailProcessLike`, `HandrailFlushOptions`, `HandrailShutdownOptions` | `src/index.d.ts` | Present; Runtime Signals behavior proof pending `81312aca-d058-4142-a53a-7216057a9048`, `e569b700-3428-4976-a589-6fbed2a8bbc7`, and `a63c3186-100d-4e1b-a588-3b391ff9e200`. |
| Product Signals option/payload/stats types | `HandrailAnalyticsEventType`, `HandrailAnalyticsRouteNormalizer`, `HandrailAnalyticsOptions`, `HandrailAnalyticsResolvedOptions`, `HandrailAnalyticsPayload`, `HandrailAnalyticsInput`, `HandrailExpressAnalyticsMiddlewareOptions`, `HandrailAnalyticsStats` | `src/index.d.ts` | Present; Product Signals proof pending `6fc1f404-e97a-4de7-ab61-551dc0576c43`, `b73eee93-6783-4c17-93ca-ad863718c0af`, and `5fcc9bfc-658d-4593-81e3-50495d1e1f0b`. |
| Experiment assignment/exposure types | `HandrailExperimentAnalyticsMetadata`, `HandrailExperimentVariant`, `HandrailExperimentVariants`, `HandrailExperimentOptions`, `HandrailExperimentAssignment`, `HandrailAssignExperimentOptions`, `HandrailDurableExperimentAssignment` | `src/index.d.ts` | Present; assignment/exposure proof pending `b5eac69d-2c11-4061-ac04-53c7e3172620`, `0f9a0d05-013b-47ed-bba3-417e0090a87d`, `d00407d8-e4c8-4140-b291-f2e49aed0096`, `26d550a0-f3fb-41ce-92da-a0cb35076991`, `fe8bea09-567f-459f-a56d-9c472961b98c`, and `ea63a825-2ced-428e-80c2-5219e931f5f0`. |
| Express types | `ExpressNextFunction`, `ExpressRequestHandler`, `ExpressErrorRequestHandler` | `src/index.d.ts` | Present; Express middleware tests pending `4a758bba-8c39-4d2b-9966-5f2718170bcb` and `2586d81c-1eb8-4d2e-b275-806a480691aa`. |

## Legacy Test, Support, And Fixture Matrix

| Legacy file | Behavior baseline | Target evidence | Status / closing checklist area |
| --- | --- | --- | --- |
| `test/analytics-fixture-corpus.test.cjs` | Product Signals contract fixture compatibility | Pending target `test/analytics-fixture-corpus.test.cjs` | Port tests pending `4a758bba-8c39-4d2b-9966-5f2718170bcb`; shared fixture update pending `4387cc53-c38e-4158-a4b5-c8eb416c4f7a`. |
| `test/analytics-payload-builder.test.cjs` | Product Signals payload builder, event kinds, privacy blocks, source/release metadata | Pending target `test/analytics-payload-builder.test.cjs` | Port tests pending `4a758bba-8c39-4d2b-9966-5f2718170bcb`; payload shape pending `5fcc9bfc-658d-4593-81e3-50495d1e1f0b`. |
| `test/analytics-transport.test.cjs` | Product Signals transport, analytics keys, assignment transport, no APM token leakage | Pending target `test/analytics-transport.test.cjs` | Port tests pending `4a758bba-8c39-4d2b-9966-5f2718170bcb`; transport separation pending `486e3b45-2a97-40d0-95f4-9246f3fd3cbd`. |
| `test/batching-transport.test.cjs` | Runtime Signals batching, retry/backoff, queue limits, gateway/direct endpoint handling | Pending target `test/batching-transport.test.cjs` | Port tests pending `4a758bba-8c39-4d2b-9966-5f2718170bcb`; queue/transport proof pending `e569b700-3428-4976-a589-6fbed2a8bbc7`. |
| `test/config.test.cjs` | Runtime and Product Signals config resolution, env compatibility, disabled-safe behavior | Pending target `test/config.test.cjs` | Port tests pending `4a758bba-8c39-4d2b-9966-5f2718170bcb`; runtime env aliases pending `a63c3186-100d-4e1b-a588-3b391ff9e200`; analytics env pending `6fc1f404-e97a-4de7-ab61-551dc0576c43`. |
| `test/entrypoints.test.cjs` | CommonJS, ESM named, ESM default, TypeScript declarations, SDK metadata, additive Signals alias identity | `test/entrypoints.test.cjs` | Present; focused alias entrypoint coverage added by `6ab23e08-6ea7-4870-8b89-c2771601a666`. |
| `test/exception-capture.test.cjs` | Exception normalization, message/span capture, breadcrumbs, process handlers | Pending target `test/exception-capture.test.cjs` | Port tests pending `4a758bba-8c39-4d2b-9966-5f2718170bcb`; runtime capture proof pending `81312aca-d058-4142-a53a-7216057a9048`. |
| `test/express-middleware.test.cjs` | Express Runtime Signals request/error middleware and Product Signals analytics middleware | Runtime Signals covered by target `test/express-runtime-signals.test.cjs`; full legacy file port still pending | Port tests pending `4a758bba-8c39-4d2b-9966-5f2718170bcb`; Product Signals middleware proof pending `b73eee93-6783-4c17-93ca-ad863718c0af`. |
| `test/fake-intake-smoke.test.cjs` | End-to-end fake intake smoke for Runtime and Product Signals transport | Pending target `test/fake-intake-smoke.test.cjs` | Port tests pending `4a758bba-8c39-4d2b-9966-5f2718170bcb`; listener-safe guidance pending `2b35631b-b435-4ac7-b581-e6284b8d3326`. |
| `test/redaction-sampling-hooks.test.cjs` | Runtime redaction and sampling hooks | Pending target `test/redaction-sampling-hooks.test.cjs` | Port tests pending `4a758bba-8c39-4d2b-9966-5f2718170bcb`; runtime capture/queue proof pending `81312aca-d058-4142-a53a-7216057a9048` and `e569b700-3428-4976-a589-6fbed2a8bbc7`. |
| `test/support/fake-analytics-intake.cjs` | Fake analytics intake support helper | Pending target `test/support/fake-analytics-intake.cjs` | Support helper port pending `4a758bba-8c39-4d2b-9966-5f2718170bcb`; listener-free alternative documentation pending `2b35631b-b435-4ac7-b581-e6284b8d3326`. |
| `test/fixtures/apm-gateway-contract-fixtures.json` | Gateway contract fixture corpus for Runtime Signals and Product Signals compatibility | Pending target `test/fixtures/apm-gateway-contract-fixtures.json` | Fixture port pending `4a758bba-8c39-4d2b-9966-5f2718170bcb`; shared contract fixture update pending `4387cc53-c38e-4158-a4b5-c8eb416c4f7a`. |

## Remaining Release Evidence

| Evidence area | Target evidence | Status / closing checklist area |
| --- | --- | --- |
| Runtime Signals transport must not carry Product Signals event kinds, analytics keys, experiment metadata, or analytics source identifiers | Pending focused tests/docs | `701be95b-20fd-416c-9367-c5968b4df9b3`. |
| Product Signals must use analytics keys and never send APM tokens or Runtime Signals event types | Pending focused tests/docs | `486e3b45-2a97-40d0-95f4-9246f3fd3cbd`. |
| Product Signals continue when Runtime Signals are disabled or APM token/endpoint config is missing | Pending focused tests/docs | `1b0d83d5-1e1e-4ea5-b866-6cc2fc68224b`. |
| Assignment is not exposure | Pending focused tests/docs | `0f9a0d05-013b-47ed-bba3-417e0090a87d`. |
| Override metadata privacy and auditability | Pending focused tests/docs | `ea63a825-2ced-428e-80c2-5219e931f5f0`. |
| Signals README and package guidance | Pending README replacement/docs | `cd26d4cb-04c2-4e9e-b030-b433115a96ac`, `60fe663a-b79a-4377-923b-86781c85c1f4`, `42147708-2b1c-400f-95eb-cbdc570b42cd`, and `2089d82c-fde8-4676-957e-baa8fc436ad4`. |
| Final owner-facing acceptance report | Pending final release evidence | `18753301-d528-4846-be5b-13023d24d3be`. |
