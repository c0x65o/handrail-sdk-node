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

function withProcessEnv(overrides, fn) {
  const previous = {};
  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };

  for (const key of Object.keys(overrides)) {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }

  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

test('Runtime Signals env config resolves queue, retry, shutdown, and endpoint mode settings', () => {
  const config = handrail.loadConfigFromEnv(completeEnv({
    HANDRAIL_APM_ENDPOINT_MODE: 'legacy_direct',
    HANDRAIL_APM_DIRECT_ENDPOINT: 'https://direct.example.test/api/apm/events',
    HANDRAIL_APM_BATCH_SIZE: '3',
    HANDRAIL_APM_MAX_QUEUE_SIZE: '50',
    HANDRAIL_APM_FLUSH_INTERVAL_MS: '100',
    HANDRAIL_APM_REQUEST_TIMEOUT_MS: '200',
    HANDRAIL_APM_MAX_RETRIES: '4',
    HANDRAIL_APM_RETRY_BASE_DELAY_MS: '10',
    HANDRAIL_APM_RETRY_MAX_DELAY_MS: '250',
    HANDRAIL_APM_SHUTDOWN_TIMEOUT_MS: '500'
  }));

  assert.equal(config.enabled, true);
  assert.equal(config.disabledReason, null);
  assert.deepEqual(config.missingConfig, []);
  assert.equal(config.endpointMode, 'direct');
  assert.equal(config.endpoint_mode, 'direct');
  assert.equal(config.directEndpoint, 'https://direct.example.test/api/apm/events');
  assert.equal(config.direct_endpoint, 'https://direct.example.test/api/apm/events');
  assert.equal(config.batchSize, 3);
  assert.equal(config.maxQueueSize, 50);
  assert.equal(config.flushIntervalMs, 100);
  assert.equal(config.requestTimeoutMs, 200);
  assert.equal(config.maxRetries, 4);
  assert.equal(config.retryBaseDelayMs, 10);
  assert.equal(config.retryMaxDelayMs, 250);
  assert.equal(config.shutdownTimeoutMs, 500);
});

test('Runtime Signals env config resolves HANDRAIL_RUNTIME aliases when APM keys are absent', () => {
  const config = handrail.loadConfigFromEnv({
    HANDRAIL_RUNTIME_ENABLED: 'true',
    HANDRAIL_RUNTIME_ENDPOINT: 'https://runtime.example.test/api/apm/events',
    HANDRAIL_RUNTIME_TOKEN: 'runtime-token',
    HANDRAIL_RUNTIME_ENDPOINT_MODE: 'telemetry-gateway',
    HANDRAIL_RUNTIME_DIRECT_ENDPOINT: 'https://runtime-direct.example.test/api/apm/events',
    HANDRAIL_RUNTIME_PROJECT: 'runtime-project',
    HANDRAIL_RUNTIME_ENV: 'staging',
    HANDRAIL_RUNTIME_SERVICE: 'runtime-api',
    HANDRAIL_RUNTIME_RELEASE: 'runtime-release',
    HANDRAIL_RUNTIME_SAMPLE_RATE: '0.5',
    HANDRAIL_RUNTIME_REQUEST_SAMPLE_RATE: '0.25',
    HANDRAIL_RUNTIME_EXCEPTION_SAMPLE_RATE: '0.75',
    HANDRAIL_RUNTIME_MESSAGE_SAMPLE_RATE: '0.8',
    HANDRAIL_RUNTIME_SPAN_SAMPLE_RATE: '0.9',
    HANDRAIL_RUNTIME_ALLOWED_EVENT_TYPES: 'transaction,exception,span',
    HANDRAIL_RUNTIME_SCRUBBER_CONFIG: '{"sensitiveKeys":["secret"]}',
    HANDRAIL_RUNTIME_MAX_BREADCRUMBS: '7',
    HANDRAIL_RUNTIME_BATCH_SIZE: '4',
    HANDRAIL_RUNTIME_MAX_QUEUE_SIZE: '40',
    HANDRAIL_RUNTIME_FLUSH_INTERVAL_MS: '150',
    HANDRAIL_RUNTIME_FETCH_TIMEOUT_MS: '275',
    HANDRAIL_RUNTIME_MAX_RETRIES: '5',
    HANDRAIL_RUNTIME_RETRY_BASE_DELAY_MS: '15',
    HANDRAIL_RUNTIME_RETRY_MAX_DELAY_MS: '300',
    HANDRAIL_RUNTIME_SHUTDOWN_TIMEOUT_MS: '650',
    HANDRAIL_RUNTIME_CAPTURE_UNHANDLED_ERRORS: 'true'
  });

  assert.equal(config.enabled, true);
  assert.equal(config.endpoint, 'https://runtime.example.test/api/apm/events');
  assert.equal(config.token, 'runtime-token');
  assert.equal(config.endpointMode, 'gateway');
  assert.equal(config.directEndpoint, 'https://runtime-direct.example.test/api/apm/events');
  assert.equal(config.project, 'runtime-project');
  assert.equal(config.environment, 'staging');
  assert.equal(config.service, 'runtime-api');
  assert.equal(config.release, 'runtime-release');
  assert.equal(config.sampleRate, 0.5);
  assert.equal(config.requestSampleRate, 0.25);
  assert.equal(config.exceptionSampleRate, 0.75);
  assert.equal(config.messageSampleRate, 0.8);
  assert.equal(config.spanSampleRate, 0.9);
  assert.deepEqual(config.allowedEventTypes, ['transaction', 'exception', 'span']);
  assert.deepEqual(config.scrubberConfig, { sensitiveKeys: ['secret'] });
  assert.equal(config.maxBreadcrumbs, 7);
  assert.equal(config.batchSize, 4);
  assert.equal(config.maxQueueSize, 40);
  assert.equal(config.flushIntervalMs, 150);
  assert.equal(config.requestTimeoutMs, 275);
  assert.equal(config.maxRetries, 5);
  assert.equal(config.retryBaseDelayMs, 15);
  assert.equal(config.retryMaxDelayMs, 300);
  assert.equal(config.shutdownTimeoutMs, 650);
  assert.equal(config.captureUnhandled, true);
});

test('createClient reads Runtime Signals aliases from process.env', () => withProcessEnv({
  HANDRAIL_APM_ENABLED: undefined,
  HANDRAIL_APM_ENDPOINT: undefined,
  HANDRAIL_APM_TOKEN: undefined,
  HANDRAIL_PROJECT: undefined,
  HANDRAIL_ENV: undefined,
  HANDRAIL_SERVICE: undefined,
  HANDRAIL_RUNTIME_ENABLED: 'true',
  HANDRAIL_RUNTIME_ENDPOINT: 'https://runtime.example.test/api/apm/events',
  HANDRAIL_RUNTIME_TOKEN: 'runtime-token',
  HANDRAIL_RUNTIME_PROJECT: 'runtime-project',
  HANDRAIL_RUNTIME_ENV: 'dev',
  HANDRAIL_RUNTIME_SERVICE: 'runtime-api'
}, async () => {
  const client = handrail.createClient();
  const config = client.getConfig();

  assert.equal(client.isEnabled(), true);
  assert.equal(config.endpoint, 'https://runtime.example.test/api/apm/events');
  assert.equal(config.token, 'runtime-token');
  assert.equal(config.project, 'runtime-project');
  assert.equal(config.environment, 'dev');
  assert.equal(config.service, 'runtime-api');
  assert.equal(await client.shutdown(), true);
}));

test('Runtime Signals APM env keys take precedence over HANDRAIL_RUNTIME aliases', () => {
  const config = handrail.loadConfigFromEnv(completeEnv({
    HANDRAIL_APM_ENDPOINT_MODE: 'legacy_direct',
    HANDRAIL_APM_DIRECT_FALLBACK_ENDPOINT: 'https://legacy-direct.example.test/api/apm/events',
    HANDRAIL_APM_BATCH_SIZE: '6',
    HANDRAIL_APM_REQUEST_TIMEOUT_MS: '450',
    HANDRAIL_APM_CAPTURE_UNHANDLED: 'false',
    HANDRAIL_RUNTIME_ENABLED: 'false',
    HANDRAIL_RUNTIME_ENDPOINT: 'https://runtime.example.test/api/apm/events',
    HANDRAIL_RUNTIME_TOKEN: 'runtime-token',
    HANDRAIL_RUNTIME_ENDPOINT_MODE: 'telemetry-gateway',
    HANDRAIL_RUNTIME_DIRECT_ENDPOINT: 'https://runtime-direct.example.test/api/apm/events',
    HANDRAIL_RUNTIME_PROJECT: 'runtime-project',
    HANDRAIL_RUNTIME_ENV: 'production',
    HANDRAIL_RUNTIME_SERVICE: 'runtime-api',
    HANDRAIL_RUNTIME_RELEASE: 'runtime-release',
    HANDRAIL_RUNTIME_BATCH_SIZE: '99',
    HANDRAIL_RUNTIME_REQUEST_TIMEOUT_MS: '999',
    HANDRAIL_RUNTIME_CAPTURE_UNHANDLED: 'true'
  }));

  assert.equal(config.enabled, true);
  assert.equal(config.endpoint, 'https://handrail.example.test/api/apm/events');
  assert.equal(config.token, 'token-test');
  assert.equal(config.endpointMode, 'direct');
  assert.equal(config.directEndpoint, 'https://legacy-direct.example.test/api/apm/events');
  assert.equal(config.project, 'handrail');
  assert.equal(config.environment, 'dev');
  assert.equal(config.service, 'api');
  assert.equal(config.release, 'abc123');
  assert.equal(config.batchSize, 6);
  assert.equal(config.requestTimeoutMs, 450);
  assert.equal(config.captureUnhandled, false);
});

test('Runtime Signals endpoint mode supports env and option aliases', () => {
  const gatewayConfig = handrail.loadConfigFromEnv(completeEnv({
    HANDRAIL_APM_ENDPOINT_MODE: 'telemetry-gateway'
  }));
  assert.equal(gatewayConfig.endpointMode, 'gateway');

  const directConfig = handrail.loadConfigFromEnv(completeEnv({
    HANDRAIL_APM_ENDPOINT_MODE: 'legacy_direct'
  }));
  assert.equal(directConfig.endpointMode, 'direct');

  const optionAliasConfig = handrail.loadConfigFromEnv(completeEnv(), {
    endpoint_mode: 'control-plane',
    direct_endpoint: 'https://app.example.test/api/apm/events'
  });
  assert.equal(optionAliasConfig.endpointMode, 'direct');
  assert.equal(optionAliasConfig.directEndpoint, 'https://app.example.test/api/apm/events');

  assert.throws(
    () => handrail.loadConfigFromEnv(completeEnv({ HANDRAIL_APM_ENDPOINT_MODE: 'sidecar' })),
    /APM endpoint_mode must be gateway or direct/
  );
});

test('disabled or incomplete Runtime Signals config stays quiet and exposes empty stats', async () => {
  let fetchCalls = 0;
  const config = handrail.loadConfigFromEnv(completeEnv({
    HANDRAIL_APM_ENABLED: 'true',
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
  assert.equal(client.disabledReason, 'disabled');
  assert.equal(client.captureEvent({ type: 'transaction' }), null);
  assert.equal(client.captureException(new Error('ignored')), null);
  assert.equal(client.captureMessage('ignored'), null);
  assert.equal(client.captureSpan({ op: 'db' }), null);
  assert.equal(await client.flush(), true);
  assert.equal(await client.shutdown(), true);
  assert.equal(fetchCalls, 0);
  assert.deepEqual(client.getStats(), {
    queued: 0,
    sent: 0,
    dropped: 0,
    retries: 0,
    failedRequests: 0,
    failedBatches: 0,
    lastFailureAt: null,
    lastFailureReason: null,
    pending: 0,
    inFlight: false
  });
});

test('incomplete Runtime Signals alias config stays disabled-safe', () => {
  const config = handrail.loadConfigFromEnv({
    HANDRAIL_RUNTIME_ENABLED: 'true',
    HANDRAIL_RUNTIME_ENDPOINT: '',
    HANDRAIL_RUNTIME_TOKEN: '',
    HANDRAIL_RUNTIME_PROJECT: 'handrail',
    HANDRAIL_RUNTIME_ENV: 'dev',
    HANDRAIL_RUNTIME_SERVICE: 'api'
  });

  assert.equal(config.enabled, false);
  assert.equal(config.disabledReason, 'missing_token');
  assert.deepEqual(config.missingConfig, ['endpoint', 'token']);
});

test('Product Signals config can be enabled while Runtime Signals config is incomplete', () => {
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
  assert.equal(config.token, undefined);
  assert.equal(config.analytics.enabled, true);
  assert.equal(config.analytics.disabledReason, null);
  assert.equal(config.analytics.key, 'analytics-key');
  assert.equal(config.analytics.sourceId, 'src_123');
  assert.equal(config.analytics.environment, 'production');
  assert.equal(config.analytics.service, 'web');
  assert.equal(config.analytics.release, 'rel-1');
});

test('Product Signals env keys do not configure Runtime Signals token or endpoint', () => {
  const config = handrail.loadConfigFromEnv({
    HANDRAIL_RUNTIME_ENABLED: 'true',
    HANDRAIL_ANALYTICS_ENDPOINT: 'https://handrail.example.test/api/analytics/ingest',
    HANDRAIL_ANALYTICS_KEY: 'analytics-key',
    HANDRAIL_ANALYTICS_SOURCE_ID: 'src_123',
    HANDRAIL_PROJECT: 'handrail',
    HANDRAIL_ENV: 'dev',
    HANDRAIL_SERVICE: 'web'
  });

  assert.equal(config.enabled, false);
  assert.equal(config.disabledReason, 'missing_token');
  assert.equal(config.endpoint, undefined);
  assert.equal(config.token, undefined);
  assert.deepEqual(config.missingConfig, ['endpoint', 'token']);
});
