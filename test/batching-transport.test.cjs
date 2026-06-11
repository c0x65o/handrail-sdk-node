const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
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
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => productSignalBodyKeyPaths(item, `${path}[${index}]`, found));
    return found;
  }
  for (const [key, item] of Object.entries(value)) {
    const keyPath = `${path}.${key}`;
    if (PRODUCT_SIGNAL_BODY_KEYS.has(key)) found.push(keyPath);
    productSignalBodyKeyPaths(item, keyPath, found);
  }
  return found;
}

function assertRuntimePost(call, expectedUrl) {
  assert.equal(call.url, expectedUrl);
  assert.equal(call.init.headers.authorization, 'Bearer token-test');
  assert.equal(call.init.headers['x-handrail-apm-token'], 'token-test');
  assert.equal(call.init.headers['x-handrail-analytics-key'], undefined);
  assert.match(call.init.headers['content-type'], /^application\/json/);
  assert.ok(['request', 'exception', 'span'].includes(call.body.event_type));
  assert.deepEqual(productSignalBodyKeyPaths(call.body), []);
}

test('flush drains queued Runtime Signals request events with APM-only headers', async () => {
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
    },
    request: {
      id: 'req-42',
      method: 'GET',
      route: '/users/:id',
      path: '/users/42'
    },
    tags: {
      'handrail.request_id': 'req-42'
    }
  });
  client.captureException(new Error('handled'));

  assert.equal(client._events.length, 2);
  assert.equal(await client.flush(), true);
  assert.equal(calls.length, 2);
  assertRuntimePost(calls[0], 'https://handrail.example.test/api/apm/events');
  assertRuntimePost(calls[1], 'https://handrail.example.test/api/apm/events');
  assert.equal(calls[0].body.event_type, 'request');
  assert.equal(calls[0].body.method, 'GET');
  assert.equal(calls[0].body.route, '/users/:id');
  assert.equal(calls[0].body.path_sample, '/users/42');
  assert.equal(calls[0].body.status_code, 200);
  assert.equal(calls[0].body.project, 'handrail');
  assert.equal(calls[0].body.service, 'api');
  assert.equal(calls[0].body.env, 'dev');
  assert.equal(calls[0].body.release, 'abc123');
  assert.equal(client.getStats().queued, 2);
  assert.equal(client.getStats().sent, 2);
  assert.equal(client.getStats().pending, 0);

  await client.shutdown();
});

test('Runtime Signals gateway fixture corpus stays gateway-compatible and APM-only', async () => {
  const corpus = JSON.parse(readFileSync(
    resolve(__dirname, 'fixtures/apm-gateway-contract-fixtures.json'),
    'utf8'
  ));
  const calls = [];
  const client = handrail.createClient(completeConfig({
    endpointMode: 'gateway',
    endpoint: 'https://telemetry.example.test/api/apm/events',
    analytics: {
      enabled: true,
      endpoint: 'https://handrail.example.test/api/analytics/ingest',
      writeKey: 'analytics-write-key',
      sourceId: 'src_123'
    },
    batchSize: 99,
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return { ok: true, status: 202 };
    }
  }));

  for (const fixture of corpus.cases) {
    assert.equal(client.captureEvent(fixture.event), fixture.event.eventId);
  }

  assert.equal(await client.flush(), true);
  assert.equal(calls.length, corpus.cases.length);
  for (let index = 0; index < corpus.cases.length; index += 1) {
    const fixture = corpus.cases[index];
    const call = calls[index];
    assertRuntimePost(call, 'https://telemetry.example.test/api/apm/events');
    assert.equal(call.body.sdk_event_id, fixture.event.eventId);
    assert.equal(call.body.observed_at, fixture.event.timestamp);
    for (const [key, value] of Object.entries(fixture.expected)) {
      if (value === null) {
        assert.equal(call.body[key], undefined);
      } else {
        assert.equal(call.body[key], value);
      }
    }
  }
  assert.deepEqual(calls.map((call) => call.body.event_type), ['request', 'exception', 'span']);
  assert.equal(client.getAnalyticsStats().pending, 0);

  await client.shutdown();
});

test('Runtime Signals queue caps, retries, and gateway fallback remain bounded', async () => {
  const queueCapped = handrail.createClient(completeConfig({
    maxQueueSize: 2,
    fetch: async () => ({ ok: true, status: 202 })
  }));
  queueCapped.captureMessage('one');
  queueCapped.captureMessage('two');
  queueCapped.captureMessage('three');
  assert.deepEqual(queueCapped._events.map((event) => event.message), ['two', 'three']);
  assert.equal(queueCapped.getStats().dropped, 1);
  await queueCapped.shutdown();

  let attempts = 0;
  const retrying = handrail.createClient(completeConfig({
    maxRetries: 1,
    fetch: async () => {
      attempts += 1;
      return attempts === 1 ? { ok: false, status: 503 } : { ok: true, status: 202 };
    }
  }));
  retrying.captureException(new Error('retry me'));
  assert.equal(await retrying.flush(), true);
  assert.equal(attempts, 2);
  assert.equal(retrying.getStats().retries, 1);
  assert.equal(retrying.getStats().sent, 1);
  await retrying.shutdown();

  const calls = [];
  const fallback = handrail.createClient(completeConfig({
    endpointMode: 'gateway',
    endpoint: 'https://telemetry.example.test/api/apm/events',
    directEndpoint: 'https://direct.example.test/api/apm/events',
    maxRetries: 0,
    fetch: async (url, init) => {
      calls.push({ url, init, body: JSON.parse(init.body) });
      return calls.length === 1 ? { ok: false, status: 503 } : { ok: true, status: 202 };
    }
  }));
  fallback.captureMessage('gateway fallback');
  assert.equal(await fallback.flush(), true);
  assert.equal(calls.length, 2);
  assertRuntimePost(calls[0], 'https://telemetry.example.test/api/apm/events');
  assertRuntimePost(calls[1], 'https://direct.example.test/api/apm/events');
  assert.equal(fallback.getStats().failedRequests, 1);
  assert.equal(fallback.getStats().sent, 1);
  await fallback.shutdown();
});
