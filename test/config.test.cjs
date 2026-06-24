const assert = require('node:assert/strict');
const test = require('node:test');

const handrail = require('../src/index.cjs');

function completeEnv(overrides = {}) {
  return {
    HANDRAIL_APM_ENABLED: 'true',
    HANDRAIL_APM_ENDPOINT: 'https://handrail.example.test/api/apm/events',
    HANDRAIL_APM_TOKEN: 'token-test',
    HANDRAIL_PROJECT: 'handrail',
    HANDRAIL_ENV: 'dev',
    HANDRAIL_SERVICE: 'api',
    HANDRAIL_RELEASE: 'abc123',
    ...overrides
  };
}

test('loads complete Runtime Signals configuration from legacy APM env', () => {
  const config = handrail.loadConfigFromEnv(completeEnv({
    HANDRAIL_APM_ENDPOINT_MODE: 'telemetry-gateway',
    HANDRAIL_APM_DIRECT_ENDPOINT: 'https://direct.example.test/api/apm/events',
    HANDRAIL_APM_SAMPLE_RATE: '0.75',
    HANDRAIL_APM_REQUEST_SAMPLE_RATE: '0.5',
    HANDRAIL_APM_EXCEPTION_SAMPLE_RATE: '1',
    HANDRAIL_APM_MESSAGE_SAMPLE_RATE: '0',
    HANDRAIL_APM_SPAN_SAMPLE_RATE: '0.25',
    HANDRAIL_APM_ALLOWED_EVENT_TYPES: 'transaction, exception',
    HANDRAIL_APM_SCRUBBER_CONFIG: '{"headers":["authorization"],"queryParams":["token"]}',
    HANDRAIL_APM_MAX_BREADCRUMBS: '5',
    HANDRAIL_APM_BATCH_SIZE: '3',
    HANDRAIL_APM_MAX_QUEUE_SIZE: '50',
    HANDRAIL_APM_FLUSH_INTERVAL_MS: '100',
    HANDRAIL_APM_REQUEST_TIMEOUT_MS: '200',
    HANDRAIL_APM_MAX_RETRIES: '4',
    HANDRAIL_APM_RETRY_BASE_DELAY_MS: '10',
    HANDRAIL_APM_RETRY_MAX_DELAY_MS: '250',
    HANDRAIL_APM_SHUTDOWN_TIMEOUT_MS: '500',
    HANDRAIL_APM_CAPTURE_UNHANDLED: 'true'
  }));

  assert.equal(config.enabled, true);
  assert.equal(config.disabledReason, null);
  assert.deepEqual(config.missingConfig, []);
  assert.equal(config.endpoint, 'https://handrail.example.test/api/apm/events');
  assert.equal(config.endpointMode, 'gateway');
  assert.equal(config.endpoint_mode, 'gateway');
  assert.equal(config.directEndpoint, 'https://direct.example.test/api/apm/events');
  assert.equal(config.direct_endpoint, 'https://direct.example.test/api/apm/events');
  assert.equal(config.token, 'token-test');
  assert.equal(config.project, 'handrail');
  assert.equal(config.environment, 'dev');
  assert.equal(config.service, 'api');
  assert.equal(config.release, 'abc123');
  assert.equal(config.sampleRate, 0.75);
  assert.equal(config.requestSampleRate, 0.5);
  assert.equal(config.exceptionSampleRate, 1);
  assert.equal(config.messageSampleRate, 0);
  assert.equal(config.spanSampleRate, 0.25);
  assert.deepEqual(config.allowedEventTypes, ['transaction', 'exception']);
  assert.deepEqual(config.scrubberConfig, {
    headers: ['authorization'],
    queryParams: ['token']
  });
  assert.equal(config.maxBreadcrumbs, 5);
  assert.equal(config.batchSize, 3);
  assert.equal(config.maxQueueSize, 50);
  assert.equal(config.flushIntervalMs, 100);
  assert.equal(config.requestTimeoutMs, 200);
  assert.equal(config.maxRetries, 4);
  assert.equal(config.retryBaseDelayMs, 10);
  assert.equal(config.retryMaxDelayMs, 250);
  assert.equal(config.shutdownTimeoutMs, 500);
  assert.equal(config.captureUnhandled, true);
});

test('Runtime Signals aliases are additive and APM env keeps precedence', () => {
  const aliasOnly = handrail.loadConfigFromEnv({
    HANDRAIL_RUNTIME_ENABLED: 'true',
    HANDRAIL_RUNTIME_ENDPOINT: 'https://runtime.example.test/api/apm/events',
    HANDRAIL_RUNTIME_TOKEN: 'runtime-token',
    HANDRAIL_RUNTIME_PROJECT: 'runtime-project',
    HANDRAIL_RUNTIME_ENV: 'staging',
    HANDRAIL_RUNTIME_SERVICE: 'runtime-api'
  });

  assert.equal(aliasOnly.enabled, true);
  assert.equal(aliasOnly.endpoint, 'https://runtime.example.test/api/apm/events');
  assert.equal(aliasOnly.token, 'runtime-token');
  assert.equal(aliasOnly.project, 'runtime-project');
  assert.equal(aliasOnly.environment, 'staging');
  assert.equal(aliasOnly.service, 'runtime-api');

  const legacyWins = handrail.loadConfigFromEnv(completeEnv({
    HANDRAIL_RUNTIME_ENABLED: 'false',
    HANDRAIL_RUNTIME_ENDPOINT: 'https://runtime.example.test/api/apm/events',
    HANDRAIL_RUNTIME_TOKEN: 'runtime-token'
  }));
  assert.equal(legacyWins.enabled, true);
  assert.equal(legacyWins.endpoint, 'https://handrail.example.test/api/apm/events');
  assert.equal(legacyWins.token, 'token-test');
});

test('incomplete Runtime Signals config stays quiet and never attempts transport', async () => {
  let fetchCalls = 0;
  const config = handrail.loadConfigFromEnv(completeEnv({
    HANDRAIL_APM_ENDPOINT: '',
    HANDRAIL_APM_TOKEN: '',
    HANDRAIL_PROJECT: '',
    HANDRAIL_ENV: '',
    HANDRAIL_SERVICE: ''
  }));
  const client = handrail.createClient({
    ...config,
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, status: 202 };
    }
  });

  assert.equal(config.enabled, false);
  assert.equal(config.disabledReason, 'missing_token');
  assert.deepEqual(config.missingConfig, [
    'endpoint',
    'token',
    'project',
    'environment',
    'service'
  ]);
  assert.equal(client.isEnabled(), false);
  assert.equal(client.captureEvent({ type: 'transaction' }), null);
  assert.equal(client.captureException(new Error('ignored')), null);
  assert.equal(client.captureMessage('ignored'), null);
  assert.equal(client.captureSpan({ op: 'db' }), null);
  assert.equal(await client.flush(), true);
  assert.equal(await client.shutdown(), true);
  assert.equal(fetchCalls, 0);
  assert.equal(client.getStats().pending, 0);
});

test('loads Product Signals configuration independently from Runtime Signals tokens', () => {
  const config = handrail.loadConfigFromEnv(completeEnv({
    HANDRAIL_ANALYTICS_ENABLED: 'true',
    HANDRAIL_ANALYTICS_ENDPOINT: 'https://handrail.example.test/api/analytics/ingest',
    HANDRAIL_ANALYTICS_PUBLIC_KEY: 'pk_test_123',
    HANDRAIL_ANALYTICS_WRITE_KEY: 'wk_test_123',
    HANDRAIL_ANALYTICS_SOURCE_ID: 'src_123',
    HANDRAIL_ANALYTICS_SAMPLE_RATE: '0.5',
    HANDRAIL_ANALYTICS_ALLOWED_EVENT_TYPES: 'page, track, conversion'
  }));

  assert.equal(config.enabled, true);
  assert.equal(config.analytics.enabled, true);
  assert.equal(config.analytics.disabledReason, null);
  assert.equal(config.analytics.endpoint, 'https://handrail.example.test/api/analytics/ingest');
  assert.equal(config.analytics.publicKey, 'pk_test_123');
  assert.equal(config.analytics.writeKey, 'wk_test_123');
  assert.equal(config.analytics.key, 'wk_test_123');
  assert.equal(config.analytics.sourceId, 'src_123');
  assert.equal(config.analytics.sampleRate, 0.5);
  assert.deepEqual(config.analytics.allowedEventTypes, ['page', 'track', 'conversion']);
  assert.equal(config.analyticsKey, 'wk_test_123');
  assert.equal(config.token, 'token-test');
});

test('Product Signals can be enabled while Runtime Signals are disabled or incomplete', () => {
  const config = handrail.loadConfigFromEnv({
    HANDRAIL_APM_ENABLED: 'true',
    HANDRAIL_ANALYTICS_ENABLED: 'true',
    HANDRAIL_ANALYTICS_ENDPOINT: 'https://handrail.example.test/api/analytics/ingest',
    HANDRAIL_ANALYTICS_KEY: 'analytics-key',
    HANDRAIL_ANALYTICS_SOURCE_ID: 'src_123',
    HANDRAIL_PROJECT: 'handrail',
    HANDRAIL_ENV: 'production',
    HANDRAIL_SERVICE: 'web',
    HANDRAIL_RELEASE: 'rel-1'
  });

  assert.equal(config.enabled, false);
  assert.equal(config.disabledReason, 'missing_token');
  assert.equal(config.analytics.enabled, true);
  assert.equal(config.analytics.key, 'analytics-key');
  assert.equal(config.analytics.project, 'handrail');
  assert.equal(config.analytics.environment, 'production');
  assert.equal(config.analytics.service, 'web');
});

test('analytics options override env and support nested or top-level aliases', () => {
  const config = handrail.loadConfigFromEnv(completeEnv({
    HANDRAIL_ANALYTICS_ENABLED: 'false',
    HANDRAIL_ANALYTICS_ENDPOINT: 'https://old.example.test/api/analytics/ingest',
    HANDRAIL_ANALYTICS_KEY: 'old-key',
    HANDRAIL_ANALYTICS_SOURCE_ID: 'old-source',
    HANDRAIL_ANALYTICS_SAMPLE_RATE: '0.1'
  }), {
    analytics: {
      enabled: true,
      endpoint: 'https://handrail.example.test/api/analytics/ingest',
      writeKey: 'nested-write-key',
      sourceId: 'nested-source',
      allowedEventTypes: ['page']
    },
    analyticsPublicKey: 'top-public-key',
    analyticsSampleRate: 1,
    analyticsEnv: 'staging'
  });

  assert.equal(config.analytics.enabled, true);
  assert.equal(config.analytics.endpoint, 'https://handrail.example.test/api/analytics/ingest');
  assert.equal(config.analytics.publicKey, 'top-public-key');
  assert.equal(config.analytics.writeKey, 'nested-write-key');
  assert.equal(config.analytics.sourceId, 'nested-source');
  assert.equal(config.analytics.environment, 'staging');
  assert.deepEqual(config.analytics.allowedEventTypes, ['page']);
});

test('current-client helpers expose resolved analytics config without enabling Runtime Signals', () => {
  const client = handrail.init({
    enabled: false,
    project: 'handrail',
    environment: 'dev',
    service: 'api',
    release: 'abc123',
    analytics: {
      enabled: true,
      endpoint: 'https://handrail.example.test/api/analytics/ingest',
      writeKey: 'write-key',
      sourceId: 'src_123',
      sampleRate: 0.25
    }
  });

  assert.equal(client.isEnabled(), false);
  assert.equal(handrail.getConfig().enabled, false);
  assert.equal(handrail.getAnalyticsConfig().enabled, true);
  assert.equal(handrail.getAnalyticsConfig().key, 'write-key');
  assert.equal(handrail.getAnalyticsConfig().sampleRate, 0.25);
});

test('QuickBooks config resolves canonical service URLs by environment', () => {
  const staging = handrail.loadQuickBooksConfigFromEnv({
    HANDRAIL_QBO_SERVICE_ENV: 'staging',
    HANDRAIL_QBO_PROVIDER_MODE: 'sandbox',
    HANDRAIL_QBO_API_KEY: 'qbo-key',
    HANDRAIL_QBO_TENANT_ID: 'qbo-hitcents-api-staging'
  });

  assert.equal(staging.serviceEnvironment, 'staging');
  assert.equal(staging.serviceUrl, 'https://quickbooks.handrail.staging.handrail-daas.com');
  assert.equal(staging.providerMode, 'sandbox');
  assert.equal(staging.apiKey, 'qbo-key');
  assert.equal(staging.tenantId, 'qbo-hitcents-api-staging');
  assert.equal(staging.localOverride, false);

  const production = handrail.loadQuickBooksConfigFromEnv({
    HANDRAIL_QBO_SERVICE_ENV: 'production',
    HANDRAIL_QBO_PROVIDER_MODE: 'production',
    HANDRAIL_QBO_API_KEY: 'qbo-key'
  });

  assert.equal(production.serviceEnvironment, 'production');
  assert.equal(production.serviceUrl, 'https://quickbooks.handrail-daas.com');
  assert.equal(production.providerMode, 'production');
});

test('QuickBooks base URL is an explicit local override only', () => {
  const config = handrail.loadQuickBooksConfigFromEnv({
    HANDRAIL_QBO_SERVICE_ENV: 'staging',
    HANDRAIL_QBO_API_KEY: 'qbo-key',
    HANDRAIL_QBO_BASE_URL: 'http://127.0.0.1:6062'
  });

  assert.equal(config.serviceEnvironment, 'staging');
  assert.equal(config.serviceUrl, 'http://127.0.0.1:6062');
  assert.equal(config.localOverride, true);
});

test('QuickBooks tenant client can use capability-provisioned tenant env', async () => {
  const calls = [];
  const client = handrail.createQuickBooksClient({
    serviceEnvironment: 'staging',
    apiKey: 'qbo-key',
    tenantId: 'qbo-hitcents-api-staging',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ ok: true })
      };
    }
  });

  const config = client.getConfig();
  assert.equal(config.tenantId, 'qbo-hitcents-api-staging');
  assert.equal(config.hasTenantId, true);

  const result = await client.tenant().status();

  assert.deepEqual(result, { ok: true });
  assert.equal(calls[0].url, 'https://quickbooks.handrail.staging.handrail-daas.com/api/tenants/qbo-hitcents-api-staging/status');
});

test('QuickBooks tenant client sends tenant-scoped requests with API key auth', async () => {
  const calls = [];
  const client = handrail.createQuickBooksClient({
    serviceEnvironment: 'staging',
    apiKey: 'qbo-key',
    fetch: async (url, init) => {
      calls.push({ url, init });
      return {
        ok: true,
        status: 202,
        text: async () => JSON.stringify({ id: 'job-1' })
      };
    }
  });

  const result = await client.tenant('tenant-hitcents').sync.start({ entities: ['items'] });

  assert.deepEqual(result, { id: 'job-1' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://quickbooks.handrail.staging.handrail-daas.com/api/tenants/tenant-hitcents/sync/jobs');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.authorization, 'Bearer qbo-key');
  assert.equal(calls[0].init.headers['x-handrail-qbo-provider-mode'], 'sandbox');
  assert.equal(calls[0].init.headers['content-type'], 'application/json');
  assert.equal(calls[0].init.body, JSON.stringify({ entities: ['items'] }));
});
