const assert = require('node:assert/strict');
const test = require('node:test');

const handrail = require('../src/index.cjs');

const PRODUCT_SIGNAL_BODY_KEYS = new Set([
  'analyticsKey',
  'analytics_key',
  'analytics_source_id',
  'analyticsSourceId',
  'conversion',
  'event_kind',
  'eventKind',
  'experiment',
  'exposure',
  'key',
  'public_key',
  'publicKey',
  'variant',
  'write_key',
  'writeKey'
]);

function completeConfig(overrides = {}) {
  return {
    ...handrail.loadConfigFromEnv({
      HANDRAIL_APM_ENABLED: 'true',
      HANDRAIL_APM_ENDPOINT: 'https://handrail.example.test/api/apm/events',
      HANDRAIL_APM_TOKEN: 'token-test',
      HANDRAIL_PROJECT: 'handrail',
      HANDRAIL_ENV: 'dev',
      HANDRAIL_SERVICE: 'api',
      HANDRAIL_RELEASE: 'abc123'
    }),
    flushIntervalMs: 60_000,
    retryBaseDelayMs: 1,
    retryMaxDelayMs: 1,
    ...overrides
  };
}

function productSignalBodyKeyPaths(value, path = '$', found = []) {
  if (!value || typeof value !== 'object') {
    return found;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => productSignalBodyKeyPaths(item, `${path}[${index}]`, found));
    return found;
  }

  for (const [key, item] of Object.entries(value)) {
    const keyPath = `${path}.${key}`;
    if (PRODUCT_SIGNAL_BODY_KEYS.has(key)) {
      found.push(keyPath);
    }
    productSignalBodyKeyPaths(item, keyPath, found);
  }

  return found;
}

function assertRuntimeSignalsPost(call, expectedUrl) {
  assert.equal(call.url, expectedUrl);
  assert.equal(call.init.headers.authorization, 'Bearer token-test');
  assert.equal(call.init.headers['x-handrail-apm-token'], 'token-test');
  assert.equal(call.init.headers['x-handrail-analytics-key'], undefined);
  assert.match(call.init.headers['content-type'], /^application\/json/);
  assert.ok(['request', 'exception', 'span'].includes(call.body.event_type));
  assert.deepEqual(productSignalBodyKeyPaths(call.body), []);
}

test('flush drains Runtime Signals events with APM-only transport headers and stats', async () => {
  const calls = [];
  const client = handrail.createClient(completeConfig({
    batchSize: 2,
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return { ok: true, status: 202 };
    }
  }));

  client.captureEvent({
    type: 'transaction',
    transaction: {
      method: 'GET',
      route: '/users/:id',
      path: '/users/42',
      statusCode: 200,
      durationMs: 12
    }
  });
  client.captureException(new Error('handled'));

  assert.equal(client._events.length, 2);
  assert.equal(await client.flush(), true);
  assert.equal(client._events.length, 0);
  assert.equal(calls.length, 2);
  assertRuntimeSignalsPost(calls[0], 'https://handrail.example.test/api/apm/events');
  assertRuntimeSignalsPost(calls[1], 'https://handrail.example.test/api/apm/events');
  assert.equal(calls[0].body.event_type, 'request');
  assert.equal(calls[0].body.project, 'handrail');
  assert.equal(calls[0].body.service, 'api');
  assert.equal(calls[0].body.env, 'dev');
  assert.equal(calls[0].body.release, 'abc123');

  const stats = client.getStats();
  assert.equal(stats.queued, 2);
  assert.equal(stats.sent, 2);
  assert.equal(stats.dropped, 0);
  assert.equal(stats.retries, 0);
  assert.equal(stats.failedRequests, 0);
  assert.equal(stats.failedBatches, 0);
  assert.equal(stats.pending, 0);
  assert.equal(stats.inFlight, false);
  assert.equal(stats.lastFailureAt, null);
  assert.equal(stats.lastFailureReason, null);

  await client.shutdown();
});

test('queue size cap drops oldest Runtime Signals events instead of growing unbounded', async () => {
  const client = handrail.createClient(completeConfig({
    batchSize: 99,
    maxQueueSize: 2,
    fetch: async () => ({ ok: true, status: 202 })
  }));

  client.captureMessage('one');
  client.captureMessage('two');
  client.captureMessage('three');

  assert.equal(client._events.length, 2);
  assert.equal(client._events[0].message, 'two');
  assert.equal(client._events[1].message, 'three');
  assert.equal(client.getStats().dropped, 1);

  await client.shutdown();
});

test('transient Runtime Signals failures retry with bounded backoff', async () => {
  let attempts = 0;
  const client = handrail.createClient(completeConfig({
    maxRetries: 1,
    fetch: async () => {
      attempts += 1;
      return attempts === 1
        ? { ok: false, status: 503 }
        : { ok: true, status: 202 };
    }
  }));

  client.captureException(new Error('retry me'));

  assert.equal(await client.flush(), true);
  assert.equal(attempts, 2);
  assert.equal(client.getStats().retries, 1);
  assert.equal(client.getStats().failedRequests, 1);
  assert.equal(client.getStats().failedBatches, 0);
  assert.equal(client.getStats().sent, 1);
  assert.equal(client.getStats().pending, 0);

  await client.shutdown();
});

test('retryable Runtime Signals failures remain queued when flush timeout expires', async () => {
  const client = handrail.createClient(completeConfig({
    maxRetries: 0,
    fetch: async () => {
      throw new Error('intake unavailable');
    }
  }));

  client.captureException(new Error('offline'));

  assert.equal(await client.flush({ timeoutMs: 25 }), false);
  assert.equal(client.getStats().pending, 1);
  assert.equal(client.getStats().failedRequests, 1);
  assert.equal(client.getStats().failedBatches, 1);
  assert.equal(client.getStats().lastFailureReason, 'intake unavailable');
  assert.equal(await client.shutdown({ timeoutMs: 25 }), false);
});

test('shutdown uses configured shutdownTimeoutMs and keeps retryable events queued', async () => {
  const client = handrail.createClient(completeConfig({
    maxRetries: 0,
    requestTimeoutMs: 100,
    shutdownTimeoutMs: 20,
    fetch: async (_url, init = {}) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => reject(new Error('aborted')));
    })
  }));

  client.captureException(new Error('timeout'));

  const startedAt = Date.now();
  assert.equal(await client.shutdown(), false);
  const elapsedMs = Date.now() - startedAt;

  assert.equal(elapsedMs < 200, true);
  assert.equal(client.getStats().pending, 1);
  assert.equal(client.getStats().failedRequests, 1);
  assert.equal(client.getStats().failedBatches, 1);
  assert.equal(client.getStats().lastFailureReason, 'aborted');
});

test('gateway mode falls back to direct endpoint only for retryable gateway failures', async () => {
  const calls = [];
  const client = handrail.createClient(completeConfig({
    endpointMode: 'gateway',
    endpoint: 'https://telemetry.example.test/api/apm/events',
    directEndpoint: 'https://direct.example.test/api/apm/events',
    maxRetries: 0,
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return calls.length === 1
        ? { ok: false, status: 503 }
        : { ok: true, status: 202 };
    }
  }));

  client.captureMessage('gateway fallback');

  assert.equal(await client.flush(), true);
  assert.equal(calls.length, 2);
  assertRuntimeSignalsPost(calls[0], 'https://telemetry.example.test/api/apm/events');
  assertRuntimeSignalsPost(calls[1], 'https://direct.example.test/api/apm/events');
  assert.equal(calls[1].body.event_type, 'span');
  assert.equal(client.getStats().failedRequests, 1);
  assert.equal(client.getStats().sent, 1);
  assert.equal(client.getStats().pending, 0);

  await client.shutdown();
});

test('gateway mode does not fall back to direct endpoint for non-retryable failures', async () => {
  const calls = [];
  const client = handrail.createClient(completeConfig({
    endpointMode: 'gateway',
    endpoint: 'https://telemetry.example.test/api/apm/events',
    directEndpoint: 'https://direct.example.test/api/apm/events',
    maxRetries: 0,
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return { ok: false, status: 400 };
    }
  }));

  client.captureMessage('bad request');

  assert.equal(await client.flush(), true);
  assert.equal(calls.length, 1);
  assertRuntimeSignalsPost(calls[0], 'https://telemetry.example.test/api/apm/events');
  assert.equal(client.getStats().failedRequests, 1);
  assert.equal(client.getStats().dropped, 1);
  assert.equal(client.getStats().pending, 0);

  await client.shutdown();
});

test('direct mode posts only to configured Runtime Signals endpoint', async () => {
  const calls = [];
  const client = handrail.createClient(completeConfig({
    endpointMode: 'direct',
    endpoint: 'https://runtime.example.test/api/apm/events',
    directEndpoint: 'https://fallback.example.test/api/apm/events',
    maxRetries: 0,
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return { ok: true, status: 202 };
    }
  }));

  client.captureException(new Error('direct mode'));

  assert.equal(await client.flush(), true);
  assert.equal(calls.length, 1);
  assertRuntimeSignalsPost(calls[0], 'https://runtime.example.test/api/apm/events');
  assert.equal(client.getStats().sent, 1);

  await client.shutdown();
});

test('Runtime Signals and Product Signals transports remain separate when both are enabled', async () => {
  const calls = [];
  const client = handrail.createClient(completeConfig({
    endpointMode: 'direct',
    analyticsEnabled: true,
    analyticsEndpoint: 'https://handrail.example.test/api/analytics/ingest',
    analyticsWriteKey: 'analytics-write-key',
    analyticsSourceId: 'src_123',
    analytics: {
      enabled: true,
      endpoint: 'https://handrail.example.test/api/analytics/ingest',
      writeKey: 'analytics-write-key',
      sourceId: 'src_123'
    },
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return { ok: true, status: 202 };
    }
  }));

  client.captureMessage('runtime signal');
  const conversionId = client.trackConversion('signup_completed', {
    plan: 'team'
  }, {
    visitorId: 'visitor-1',
    sessionId: 'session-1'
  });

  assert.match(conversionId, /^hrae_[a-f0-9-]+$/i);
  assert.equal(await client.flush(), true);
  assert.equal(calls.length, 2);

  const runtimeCall = calls.find((call) => call.body.event_type);
  const analyticsCall = calls.find((call) => call.body.event);
  assertRuntimeSignalsPost(runtimeCall, 'https://handrail.example.test/api/apm/events');
  assert.equal(runtimeCall.init.headers['x-handrail-analytics-key'], undefined);
  assert.equal(analyticsCall.url, 'https://handrail.example.test/api/analytics/ingest');
  assert.equal(analyticsCall.init.headers.authorization, 'Bearer analytics-write-key');
  assert.equal(analyticsCall.init.headers['x-handrail-analytics-key'], 'analytics-write-key');
  assert.equal(analyticsCall.init.headers['x-handrail-apm-token'], undefined);
  assert.equal(analyticsCall.body.key, 'analytics-write-key');
  assert.equal(analyticsCall.body.event.event_kind, 'conversion');
  assert.equal(analyticsCall.body.event.source.analytics_source_id, 'src_123');
  assert.equal(client.getStats().sent, 1);
  assert.equal(client.getAnalyticsStats().sent, 1);

  await client.shutdown();
});
