# @handrail/sdk-node

Handrail Signals Node SDK package target for Product Signals and Runtime Signals.

`@handrail/sdk-node` is the canonical Node package for Handrail Signals. It
ships dual ESM and CommonJS entrypoints, TypeScript declarations, disabled-safe
helpers, Express middleware, Runtime Signals capture, Product Signals capture,
durable experiment assignment, explicit experiment exposure, conversion
attribution, separate transports, queue/retry controls, and shutdown flushing.

## Install

The package requires Node.js 18 or newer. Express support is optional; install
`express` in the application only when using the Express middleware helpers.

Current stable distribution source for app manifests:

```sh
npm install "git+https://github.com/c0x65o/handrail-sdk-node.git#02b022105438ae35fe8995578daf60949d474826"
```

or pin the exact source in an application manifest:

```json
{
  "dependencies": {
    "@handrail/sdk-node": "git+https://github.com/c0x65o/handrail-sdk-node.git#02b022105438ae35fe8995578daf60949d474826"
  }
}
```

Stable source contract:

| Field | Value |
| --- | --- |
| Source type | Exact git commit |
| Package | `@handrail/sdk-node` |
| Package version at source | `0.1.24` |
| Source | `git+https://github.com/c0x65o/handrail-sdk-node.git#02b022105438ae35fe8995578daf60949d474826` |

The package is not currently published to the public npm registry, and this
repository has no version tag for `0.1.24`. Until a later release item publishes
a semver package, versioned tarball, or git tag, consuming applications should
pin the exact git source above.

For local validation from another workspace, install the package path:

```sh
npm install ../handrail-sdk-node
```

This SDK repository intentionally does not commit a package-manager lockfile.
Consuming applications own their resolved dependency graph and lockfile policy.

## ESM

Use named imports for the APIs you need:

```js
import {
  init,
  expressMiddleware,
  expressAnalyticsMiddleware,
  expressErrorHandler,
  captureException,
  track,
  page,
  assignExperiment,
  trackExperimentExposure,
  trackConversion,
  flush,
  shutdown
} from '@handrail/sdk-node';

const signals = init({
  enabled: true,
  endpoint: process.env.HANDRAIL_RUNTIME_ENDPOINT,
  token: process.env.HANDRAIL_RUNTIME_TOKEN,
  project: process.env.HANDRAIL_PROJECT,
  environment: process.env.HANDRAIL_ENV,
  service: process.env.HANDRAIL_SERVICE,
  release: process.env.HANDRAIL_RELEASE,
  analytics: {
    enabled: true,
    endpoint: process.env.HANDRAIL_ANALYTICS_ENDPOINT,
    assignmentEndpoint: process.env.HANDRAIL_ANALYTICS_ASSIGNMENT_ENDPOINT,
    writeKey: process.env.HANDRAIL_ANALYTICS_WRITE_KEY,
    sourceId: process.env.HANDRAIL_ANALYTICS_SOURCE_ID,
    sourceKind: 'server',
    serviceEnv: process.env.HANDRAIL_ANALYTICS_SERVICE_ENV_ID
  }
});

app.use(expressMiddleware(signals));
app.use(expressAnalyticsMiddleware(signals));

app.get('/checkout', async (_req, res) => {
  page('/checkout', { visitorHash: 'visitor_hash_123', sessionHash: 'session_hash_123' });
  track('checkout_viewed', { surface: 'server' });
  res.json({ ok: true });
});

app.use(expressErrorHandler(signals));

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});
```

Default import exposes the same public API object:

```js
import handrail from '@handrail/sdk-node';

const signals = handrail.init();
handrail.captureException(new Error('example'));
await handrail.flush();
await signals.shutdown();
```

## CommonJS

CommonJS consumers can require the package namespace:

```js
const handrail = require('@handrail/sdk-node');

const signals = handrail.init({
  project: 'handrail',
  environment: 'production',
  service: 'api'
});

app.use(handrail.expressMiddleware(signals));
app.use(handrail.expressAnalyticsMiddleware(signals));
app.use(handrail.expressErrorHandler(signals));

handrail.track('signup_started', { plan: 'pro' });
handrail.flush().catch(() => {});
```

Destructured requires are also supported:

```js
const {
  init,
  captureException,
  assignExperiment,
  trackExperimentExposure,
  trackConversion,
  shutdown
} = require('@handrail/sdk-node');

const signals = init();

async function run() {
  try {
    await doWork();
  } catch (error) {
    captureException(error, { tags: { job: 'worker' } });
    throw error;
  }

  const assignment = await assignExperiment('checkout-copy', {
    visitorHash: 'visitor_hash_123',
    sessionHash: 'session_hash_123',
    routeHash: 'route_hash_checkout',
    pageGroup: 'checkout'
  });

  if (assignment?.variantKey === 'short-copy') {
    renderShortCheckoutCopy();
    trackExperimentExposure(assignment, { surface: 'hero' });
  }

  trackConversion('signup_completed', {}, { experiment: assignment });
  await shutdown();
}

run().catch((error) => {
  captureException(error);
  return shutdown().finally(() => {
    process.exitCode = 1;
  });
});
```

## QuickBooks Integration Client

Consumer apps should select a QuickBooks service environment and provide an API
key issued by the QuickBooks service. They should not configure the service URL
directly for Handrail dev, staging, or production.

```js
import { createQuickBooksClient } from '@handrail/sdk-node';

const quickBooks = createQuickBooksClient({
  serviceEnvironment: process.env.HANDRAIL_QBO_SERVICE_ENV || 'staging',
  providerMode: process.env.HANDRAIL_QBO_PROVIDER_MODE || 'sandbox',
  apiKey: process.env.HANDRAIL_QBO_API_KEY
});

await quickBooks
  .tenant(tenantIdFromAppConfigOrDatabase)
  .sync
  .start({ entities: ['items', 'profit_and_loss'] });
```

Canonical service URLs are built into the SDK:

| Service environment | URL |
| --- | --- |
| `staging` | `https://quickbooks.hitcents.staging.handrail-daas.com` |
| `production` | `https://quickbooks.handrail-daas.com` |

Supported consumer env keys:

| Key | Purpose |
| --- | --- |
| `HANDRAIL_QBO_SERVICE_ENV` | `staging` or `production` QuickBooks service selection. |
| `HANDRAIL_QBO_PROVIDER_MODE` | `sandbox` or `production` Intuit provider mode. |
| `HANDRAIL_QBO_API_KEY` | Tenant/app-scoped API key issued by the QuickBooks service. Store as a secret. |

`HANDRAIL_QBO_BASE_URL` remains supported only as an explicit local SDK/service
development override, for example when running the QuickBooks service on
`127.0.0.1`. It is not part of the normal consumer app contract.

## Project Operation Endpoints

Project-owned operation endpoints can verify Handrail invocation signatures
before parsing or executing a request, then return typed response envelopes.

```js
import {
  verifyOperationInvocationSignature,
  buildOperationSuccessEnvelope,
  buildOperationErrorEnvelope
} from '@handrail/sdk-node';

app.post('/operations/billing/refund', express.raw({ type: 'application/json' }), async (req, res) => {
  const verification = await verifyOperationInvocationSignature({
    method: req.method,
    pathAndQuery: req.originalUrl,
    headers: req.headers,
    rawBody: req.body,
    lookupSigningKey: async (keyId) => {
      return await loadOperationSigningCredential(keyId);
    },
    expected: {
      projectId: process.env.HANDRAIL_PROJECT_ID,
      environment: 'production',
      toolName: 'billing.refund_invoice',
      toolVersion: '1'
    }
  });

  if (!verification.ok) {
    return res.status(401).json(buildOperationErrorEnvelope({
      error: {
        code: verification.error.code,
        category: verification.error.category,
        message: verification.error.message,
        retryable: verification.error.retryable
      },
      context: verification.context
    }));
  }

  const body = JSON.parse(req.body.toString('utf8'));
  const result = await refundInvoice(body.input, verification.context);

  return res.status(200).json(buildOperationSuccessEnvelope({
    result,
    context: verification.context
  }));
});
```

## Public API

The exported API is available from ESM named imports, the ESM default import,
and CommonJS `require('@handrail/sdk-node')`.

- `init(options)` creates and installs the current Signals client.
- `createClient(options)` creates an isolated Signals client without replacing
  the current client.
- `createSignalsClient(options)` is a Signals-facing alias for `createClient()`.
- `getCurrentClient()` returns the current client, creating a default disabled
  client when needed.
- `loadConfigFromEnv(env, overrides)` resolves Runtime and Product Signals
  configuration without creating a client.
- `getConfig()` returns the current client's resolved Runtime configuration,
  including the nested Product Signals configuration.
- `getAnalyticsConfig()` returns the current client's resolved Product Signals
  configuration.
- `getStats()` returns Runtime Signals queue, retry, send, drop, failure, and
  in-flight counters.
- `getAnalyticsStats()` returns Product Signals queue, retry, send, drop,
  failure, and in-flight counters.
- `HandrailSignalsClient` is the Signals-facing client class export.
- `HandrailApmClient` remains exported as the legacy class name for source
  compatibility.
- `SDK_NAME` and `SDK_VERSION` are read from package metadata.
- `expressMiddleware(clientOrOptions)` returns Runtime Signals request
  middleware for Express.
- `expressErrorHandler(clientOrOptions)` returns Runtime Signals error
  middleware for Express.
- `expressAnalyticsMiddleware(clientOrOptions, options)` returns opt-in Product
  Signals route/request observation middleware for Express.
- `captureEvent(event)` captures a manual Runtime Signals event.
- `captureException(error, context)` captures a Runtime Signals exception.
- `captureMessage(message, context)` captures a Runtime Signals message.
- `captureSpan(span, context)` captures a Runtime Signals span.
- `addBreadcrumb(breadcrumb)` appends a bounded breadcrumb for later Runtime
  capture.
- `installProcessErrorHandlers(clientOrOptions, processLike)` installs opt-in
  `unhandledRejection` and `uncaughtExceptionMonitor` Runtime capture handlers.
- `uninstallProcessErrorHandlers(clientOrOptions)` removes handlers installed
  by this SDK.
- `buildAnalyticsPayload(event, clientOrOptions)` builds a Product Signals
  payload without sending it.
- `verifyOperationInvocationSignature(options)` verifies Handrail project
  operation invocation headers, exact raw-body SHA-256, HMAC signature, replay
  window, signing key state, and expected scope.
- `buildOperationSuccessEnvelope({ result, context })` builds the project
  operation success envelope with audit correlation echo.
- `buildOperationErrorEnvelope({ error, context })` builds the project
  operation error envelope with allowed categories and bounded safe details.
- `page(pathOrOptions, options)` captures a Product Signals page or route view.
- `track(eventName, properties, options)` captures a Product Signals custom
  event.
- `trackConversion(conversionName, properties, options)` captures a Product
  Signals conversion event, optionally with experiment attribution.
- `assignExperiment(experimentKeyOrOptions, options)` requests durable
  platform-backed assignment through the Product Signals assignment endpoint.
- `trackExperimentExposure(assignmentOrExperimentKey, variantOrProperties,
  propertiesOrOptions, options)` explicitly captures a Product Signals
  experiment exposure event.
- `experiment(experimentKey, variants, options)` performs compatibility-only
  local deterministic assignment.
- `flush(options)` attempts to flush Runtime and Product queues.
- `shutdown(options)` flushes both queues, clears timers, uninstalls process
  error handlers, and closes the current client.

All capture helpers are disabled-safe. When a surface is disabled, sampled out,
or missing required configuration, helpers stay quiet and return `null`, `void`,
or `false` according to their API instead of throwing into application code.

## Runtime Signals Usage

Runtime Signals cover server request telemetry, latency/status rollups,
exceptions, messages, spans, breadcrumbs, and process-level error capture when
explicitly installed. Configure Runtime with either options or environment
variables. The Signals-facing `HANDRAIL_RUNTIME_*` names are additive aliases;
the legacy `HANDRAIL_APM_*` names remain supported and win when both are set.

Minimum Runtime configuration is enabled flag, endpoint, token, project,
environment, and service:

```js
import { init, expressMiddleware, expressErrorHandler, captureSpan } from '@handrail/sdk-node';

const signals = init({
  enabled: true,
  endpoint: 'https://app.handrail.dev/api/apm/events',
  token: process.env.HANDRAIL_RUNTIME_TOKEN,
  project: 'handrail',
  environment: 'production',
  service: 'api',
  captureUnhandled: true
});

app.use(expressMiddleware(signals));

app.get('/work', async (_req, res) => {
  captureSpan({ op: 'job', description: 'prepare work' });
  res.json({ ok: true });
});

app.use(expressErrorHandler(signals));
```

Runtime transport uses the Runtime/APM endpoint and token only. It never uses
Product Signals analytics keys, analytics source identifiers, event kinds,
experiment metadata, or conversion payloads.

## Product Signals Usage

Product Signals cover page views, route views, screen views, sessions, custom
events, conversions, explicit experiment exposure, and server-side Express route
observation. Configure Product Signals with `analytics` options or
`HANDRAIL_ANALYTICS_*` environment variables. Product Signals can be enabled and
used even when Runtime Signals are disabled or missing Runtime endpoint/token
configuration.

```js
import {
  init,
  expressAnalyticsMiddleware,
  page,
  track,
  trackConversion,
  getAnalyticsConfig
} from '@handrail/sdk-node';

const signals = init({
  analytics: {
    enabled: true,
    endpoint: 'https://app.handrail.dev/api/analytics/ingest',
    writeKey: process.env.HANDRAIL_ANALYTICS_WRITE_KEY,
    sourceId: process.env.HANDRAIL_ANALYTICS_SOURCE_ID,
    sourceKind: 'server',
    project: 'handrail',
    env: 'production',
    service: 'website',
    serviceEnv: process.env.HANDRAIL_ANALYTICS_SERVICE_ENV_ID,
    release: process.env.HANDRAIL_RELEASE
  }
});

app.use(expressAnalyticsMiddleware(signals, {
  pathGroup: (_req, _res, context) => context.route || context.path || '/',
  properties: { surface: 'server' }
}));

page('/pricing', { visitorHash: 'visitor_hash_123', sessionHash: 'session_hash_123' });
track('pricing_cta_clicked', { placement: 'hero' });
trackConversion('signup_completed', { plan: 'team' });

const analyticsConfig = getAnalyticsConfig();
```

Product transport posts only to the analytics ingest endpoint with the analytics
write/public/generic key. It never sends Runtime/APM tokens or Runtime event
types.

## Transport Separation

Runtime Signals and Product Signals are intentionally separate transports.

- Runtime Signals use Runtime/APM endpoint configuration, Runtime/APM tokens,
  Runtime event types, and the Runtime queue.
- Product Signals use analytics endpoint configuration, analytics write/public
  keys, analytics source scope, Product event kinds, and the Product queue.
- Durable experiment assignment posts to the analytics assignment endpoint with
  the analytics key and exact analytics source scope.
- Runtime gateway fallback applies only to Runtime Signals. Product Signals do
  not use Runtime direct endpoints or Runtime fallback behavior.
- Analytics keys must never be used as Runtime tokens, and Runtime/APM tokens
  must never be used as analytics keys.

## Shutdown and Flush Lifecycle

Call `flush()` when an application wants to drain currently queued work but keep
the client open. Call `shutdown()` during process termination, worker teardown,
or test cleanup. `shutdown()` flushes Runtime and Product queues with the
configured shutdown timeout, clears timers, uninstalls SDK process error
handlers, closes the current client, and returns whether both queues drained.

```js
import { flush, shutdown } from '@handrail/sdk-node';

await flush({ timeoutMs: 1000 });

process.on('SIGTERM', async () => {
  await shutdown({ timeoutMs: 3000 });
  process.exit(0);
});
```

## Package Identity and Compatibility Alias Policy

`@handrail/sdk-node` is the canonical package identity for this Signals Node SDK
port. The package metadata in this repository should continue to use
`@handrail/sdk-node` as the package name.

The historical APM package naming ADR kept a different canonical install and
import path for the retired legacy repository, and said that any future rename
must preserve a compatibility package or documented alias for a supported
migration window.

This port makes the scoped decision for the new Signals SDK repository:
`@handrail/sdk-node` is the only supported package identity for new Product
Signals and Runtime Signals installs. This repository does not create, publish,
or document a retired APM import path as an active alias package for
`@handrail/sdk-node`.

Retired APM dependency paths are not supported for active Signals installs.
Their exact historical names remain only in compatibility evidence and migration
notes. Any compatibility alias package or npm deprecation notice belongs to a
later package-release item.

## Known Consumers and Migration Boundary

Known consumer migrations for this owner goal are tracked separately from this
SDK repository source-record item:

- VLBO Website Scout
- Hitcents Website

Those consumers should install `@handrail/sdk-node` from the stable source
recorded in the Install section when their migration items run. This SDK source
record does not itself edit consumer app dependencies, imports, generated
install snippets, publishing configuration, or deployment state.

This SDK-port goal is limited to the Node SDK package surface.
Browser SDK work, browser `onerror` capture, and browser Runtime Signals are out
of scope for this goal. Future deeper A/B testing depth beyond the current
server assignment/exposure/conversion contract is also a separate goal.

## Experiments

Generated apps should use `assignExperiment()` for durable platform-backed A/B
test assignment. `assignExperiment()` posts to the Product Analytics assignment
endpoint using the analytics key transport, returns the platform assignment
metadata, and does not record exposure from assignment alone.

The `experiment()` helper remains exported for compatibility with legacy local
assignment patterns. It performs deterministic variant selection inside the SDK
from the experiment key, scope, identity, and variants supplied by the caller. It
does not call the assignment API, does not fetch platform experiment rules, does
not create a durable assignment record, and is not durable across later platform
rule changes.

Assignment is not exposure. Calling `experiment()` or `assignExperiment()` must
not enqueue or send an `experiment_exposure` event by itself. Record exposure only
at the point where the selected variant is shown or affects user-visible
behavior, using `trackExperimentExposure(assignment, properties, options)` or
`assignment.expose(properties, options)`.

This release's A/B surface is deliberately bounded to server Product Signals:
durable assignment through `assignExperiment()`, compatibility-only local
assignment through `experiment()`, explicit experiment exposure, and conversion
attribution through `trackConversion()` or assignment conversion helpers. Deeper
A/B features such as experiment management UI/API, remote or server decisioning,
shared cross-SDK deterministic assignment, statistical winner/lift calculations,
guardrail metrics, and automatic delayed conversion attribution remain future
work unless separately scoped.

## Runtime Signals Environment Aliases

Runtime Signals keeps the legacy `HANDRAIL_APM_*` environment variables for
existing deployments. The `HANDRAIL_RUNTIME_*` names below are additive aliases
for Signals terminology; they are not replacements. When a legacy APM key and a
Runtime alias are both present, the legacy APM key continues to win.

Product Signals transport remains separate and uses `HANDRAIL_ANALYTICS_*`
configuration. Analytics keys are not used as Runtime Signals endpoint or token
configuration.

| Runtime Signals option | Existing key | Additive Signals alias |
| --- | --- | --- |
| Enabled | `HANDRAIL_APM_ENABLED` | `HANDRAIL_RUNTIME_ENABLED` |
| Endpoint | `HANDRAIL_APM_ENDPOINT` | `HANDRAIL_RUNTIME_ENDPOINT` |
| Token | `HANDRAIL_APM_TOKEN` | `HANDRAIL_RUNTIME_TOKEN` |
| Endpoint mode | `HANDRAIL_APM_ENDPOINT_MODE` | `HANDRAIL_RUNTIME_ENDPOINT_MODE` |
| Direct endpoint | `HANDRAIL_APM_DIRECT_ENDPOINT` | `HANDRAIL_RUNTIME_DIRECT_ENDPOINT` |
| Direct fallback endpoint | `HANDRAIL_APM_DIRECT_FALLBACK_ENDPOINT` | `HANDRAIL_RUNTIME_DIRECT_FALLBACK_ENDPOINT` |
| Project | `HANDRAIL_PROJECT` | `HANDRAIL_RUNTIME_PROJECT` |
| Environment | `HANDRAIL_ENV` | `HANDRAIL_RUNTIME_ENV` |
| Service | `HANDRAIL_SERVICE` | `HANDRAIL_RUNTIME_SERVICE` |
| Release | `HANDRAIL_RELEASE` | `HANDRAIL_RUNTIME_RELEASE` |
| Sample rate | `HANDRAIL_APM_SAMPLE_RATE` | `HANDRAIL_RUNTIME_SAMPLE_RATE` |
| Request sample rate | `HANDRAIL_APM_REQUEST_SAMPLE_RATE` | `HANDRAIL_RUNTIME_REQUEST_SAMPLE_RATE` |
| Transaction sample rate | `HANDRAIL_APM_TRANSACTION_SAMPLE_RATE` | `HANDRAIL_RUNTIME_TRANSACTION_SAMPLE_RATE` |
| Exception sample rate | `HANDRAIL_APM_EXCEPTION_SAMPLE_RATE` | `HANDRAIL_RUNTIME_EXCEPTION_SAMPLE_RATE` |
| Message sample rate | `HANDRAIL_APM_MESSAGE_SAMPLE_RATE` | `HANDRAIL_RUNTIME_MESSAGE_SAMPLE_RATE` |
| Span sample rate | `HANDRAIL_APM_SPAN_SAMPLE_RATE` | `HANDRAIL_RUNTIME_SPAN_SAMPLE_RATE` |
| Allowed event types | `HANDRAIL_APM_ALLOWED_EVENT_TYPES` | `HANDRAIL_RUNTIME_ALLOWED_EVENT_TYPES` |
| Scrubber config | `HANDRAIL_APM_SCRUBBER_CONFIG` | `HANDRAIL_RUNTIME_SCRUBBER_CONFIG` |
| Max breadcrumbs | `HANDRAIL_APM_MAX_BREADCRUMBS` | `HANDRAIL_RUNTIME_MAX_BREADCRUMBS` |
| Batch size | `HANDRAIL_APM_BATCH_SIZE` | `HANDRAIL_RUNTIME_BATCH_SIZE` |
| Max queue size | `HANDRAIL_APM_MAX_QUEUE_SIZE` | `HANDRAIL_RUNTIME_MAX_QUEUE_SIZE` |
| Flush interval | `HANDRAIL_APM_FLUSH_INTERVAL_MS` | `HANDRAIL_RUNTIME_FLUSH_INTERVAL_MS` |
| Request timeout | `HANDRAIL_APM_REQUEST_TIMEOUT_MS` | `HANDRAIL_RUNTIME_REQUEST_TIMEOUT_MS` |
| Fetch timeout | `HANDRAIL_APM_FETCH_TIMEOUT_MS` | `HANDRAIL_RUNTIME_FETCH_TIMEOUT_MS` |
| Max retries | `HANDRAIL_APM_MAX_RETRIES` | `HANDRAIL_RUNTIME_MAX_RETRIES` |
| Retry base delay | `HANDRAIL_APM_RETRY_BASE_DELAY_MS` | `HANDRAIL_RUNTIME_RETRY_BASE_DELAY_MS` |
| Retry max delay | `HANDRAIL_APM_RETRY_MAX_DELAY_MS` | `HANDRAIL_RUNTIME_RETRY_MAX_DELAY_MS` |
| Shutdown timeout | `HANDRAIL_APM_SHUTDOWN_TIMEOUT_MS` | `HANDRAIL_RUNTIME_SHUTDOWN_TIMEOUT_MS` |
| Capture unhandled errors | `HANDRAIL_APM_CAPTURE_UNHANDLED` | `HANDRAIL_RUNTIME_CAPTURE_UNHANDLED` |
| Capture unhandled errors alias | `HANDRAIL_APM_CAPTURE_UNHANDLED_ERRORS` | `HANDRAIL_RUNTIME_CAPTURE_UNHANDLED_ERRORS` |

Runtime Signals is enabled only when `HANDRAIL_APM_ENABLED` or
`HANDRAIL_RUNTIME_ENABLED` parses to true and the required Runtime config is
present. Required Runtime config is endpoint, token, project, environment, and
service. Runtime disabled reasons are:

- `disabled`: the enabled flag is false, absent, or does not parse as enabled.
- `missing_token`: Runtime was requested but no token was configured.
- `missing_endpoint`: Runtime was requested but no endpoint was configured.
- `incomplete_config`: Runtime was requested but project, environment, or
  service metadata is missing.

Runtime defaults are `batchSize: 10`, `maxQueueSize: 1000`,
`flushIntervalMs: 5000`, `requestTimeoutMs: 2000`, `maxRetries: 2`,
`retryBaseDelayMs: 250`, `retryMaxDelayMs: 5000`,
`shutdownTimeoutMs: 3000`, `endpointMode: "gateway"`, and direct endpoint
`/api/apm/events`.

## Product Signals Environment

Product Signals configuration is resolved separately from Runtime Signals
configuration. Product Signals uses `HANDRAIL_ANALYTICS_*` keys and does not use
Runtime endpoint or token settings. Runtime Signals does not use analytics keys.

Explicit options override environment values. Analytics project, environment,
service, and release can fall back to the resolved Runtime metadata when
analytics-specific values are absent.

| Product Signals option | Environment key |
| --- | --- |
| Enabled | `HANDRAIL_ANALYTICS_ENABLED` |
| Ingest endpoint | `HANDRAIL_ANALYTICS_ENDPOINT` |
| Assignment endpoint | `HANDRAIL_ANALYTICS_ASSIGNMENT_ENDPOINT` |
| Assignment endpoint alias | `HANDRAIL_ANALYTICS_EXPERIMENT_ASSIGNMENT_ENDPOINT` |
| Public key | `HANDRAIL_ANALYTICS_PUBLIC_KEY` |
| Write key | `HANDRAIL_ANALYTICS_WRITE_KEY` |
| Generic analytics key | `HANDRAIL_ANALYTICS_KEY` |
| Project | `HANDRAIL_ANALYTICS_PROJECT` |
| Environment | `HANDRAIL_ANALYTICS_ENV` |
| Source id | `HANDRAIL_ANALYTICS_SOURCE_ID` |
| Source kind | `HANDRAIL_ANALYTICS_SOURCE_KIND` |
| Service | `HANDRAIL_ANALYTICS_SERVICE` |
| Service environment id | `HANDRAIL_ANALYTICS_SERVICE_ENV_ID` |
| Service environment alias | `HANDRAIL_ANALYTICS_SERVICE_ENV` |
| Deploy target alias | `HANDRAIL_ANALYTICS_DEPLOY_TARGET_ID` |
| Release | `HANDRAIL_ANALYTICS_RELEASE` |
| Sample rate | `HANDRAIL_ANALYTICS_SAMPLE_RATE` |
| Allowed event types | `HANDRAIL_ANALYTICS_ALLOWED_EVENT_TYPES` |
| Custom property allowlist | `HANDRAIL_ANALYTICS_CUSTOM_PROPERTY_ALLOWLIST` |

`HANDRAIL_ANALYTICS_ENABLED` must parse to true for Product Signals intake or
experiment assignment to run. Accepted enabled values are `true`, `1`, `yes`,
`y`, `on`, and `enabled`. False, absent, empty, or unrecognized values keep the
analytics surface disabled.

Product Signals event intake requires endpoint, key, source id, project, and
environment. The SDK chooses the analytics key from write key, then public key,
then generic key. Product intake disabled reasons are:

- `disabled`: the analytics enabled flag is false, absent, or does not parse as
  enabled.
- `missing_key`: Product Signals was requested but no analytics key was
  configured.
- `missing_endpoint`: Product Signals was requested but no ingest endpoint was
  configured.
- `missing_source_id`: Product Signals was requested but no source id was
  configured.
- `incomplete_config`: Product Signals was requested but project or environment
  metadata is missing.

Experiment assignment has a stricter config check because durable assignment is
source scoped. Assignment requires assignment endpoint, key, source id, project,
service, service environment id, and environment. If the assignment endpoint is
not configured directly, the SDK derives `/api/analytics/experiments/assign`
from an analytics endpoint ending in `/api/analytics/ingest` or
`/api/analytics`. Assignment disabled reasons are:

- `disabled`: the analytics enabled flag is false, absent, or does not parse as
  enabled.
- `missing_key`: assignment was requested but no analytics key was configured.
- `missing_assignment_endpoint`: assignment was requested but no assignment
  endpoint could be configured or derived.
- `missing_source_id`: assignment was requested but no source id was configured.
- `incomplete_config`: assignment was requested but project, service, service
  environment id, or environment metadata is missing.

When Product Signals or assignment config is disabled or incomplete, helpers
such as `track()`, `page()`, `trackConversion()`, `trackExperimentExposure()`,
and `assignExperiment()` stay quiet and return `null` instead of throwing into
application code.

## Queue and Retry Behavior

Runtime Signals and Product Signals have separate in-memory queues, separate
flush timers, separate in-flight flush promises, and separate stats counters.
They share the same queue and retry defaults from the resolved client options:
batch size `10`, max queue size `1000`, flush interval `5000` ms, request
timeout `2000` ms, max retries `2`, retry base delay `250` ms, retry max delay
`5000` ms, and shutdown timeout `3000` ms.

Runtime events enqueue only on the Runtime queue. Product events enqueue only on
the Product queue. A queue flush starts immediately when the queue reaches the
batch size; otherwise the SDK schedules a timer for the flush interval. Flush
timers are unref'd when Node supports it so they do not keep the process alive.

If either queue reaches `maxQueueSize`, the oldest queued events for that
transport are dropped before the new event is appended. Runtime drops increment
Runtime stats. Product drops increment Product stats. Requeued retryable events
are also capped to the queue size; overflow is counted as dropped.

`getStats()` reports Runtime `queued`, `sent`, `dropped`, `retries`,
`failedRequests`, `failedBatches`, `lastFailureAt`, `lastFailureReason`,
`pending`, and `inFlight`. `getAnalyticsStats()` reports the same fields for
Product Signals. `flush()` attempts both queues and resolves to whether both
were drained. `shutdown()` flushes both queues with the shutdown timeout,
uninstalls process error handlers, clears timers, closes the client, and returns
the flush result.

Transport is disabled-safe and quiet. Scheduled Runtime and Product flushes catch
transport errors, record counters, and do not surface failures to application
request handling, rendering, navigation, conversion paths, or process lifecycle.

Retryable failures are HTTP `408`, HTTP `429`, HTTP `5xx`, missing status,
network failures, unavailable `fetch`, and request timeouts. Permanent
non-retryable intake failures are counted and dropped so invalid events do not
block later flushes. Retry delay is bounded exponential backoff starting at
`retryBaseDelayMs` and capped by `retryMaxDelayMs`, and every flush is bounded by
the flush or shutdown deadline.

In gateway Runtime mode, Runtime events first post to `endpoint`; retryable
gateway transport failures fall back to `directEndpoint` for that event when a
different direct endpoint is configured and the deadline has time remaining.
The default direct endpoint is `/api/apm/events`. Product Signals transport does
not use Runtime gateway fallback; it posts to the analytics ingest endpoint with
the analytics key. Assignment requests post to the analytics assignment endpoint
with the analytics key and stay quiet on failure.

## Package Lockfile Policy

This SDK package intentionally does not commit an npm lockfile. Do not add
`package-lock.json`, `npm-shrinkwrap.json`, `yarn.lock`, or `pnpm-lock.yaml` to
this repository for package-only SDK work. The published package contents are
controlled by `package.json` and its `files` allowlist, currently `src` and
`README.md`.

Consuming applications own their application dependency graph and should commit
their own package-manager lockfile when their app policy requires one.
