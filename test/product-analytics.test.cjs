const assert = require('node:assert/strict');
const test = require('node:test');

const handrail = require('../src/index.cjs');
const { createFakeAnalyticsFetchIntake } = require('./support/fake-analytics-intake.cjs');

const PRODUCT_EVENT_KINDS = new Set([
  'page_view',
  'route_view',
  'screen_view',
  'session_start',
  'session_end',
  'custom_event',
  'conversion',
  'experiment_exposure'
]);
const RUNTIME_EVENT_TYPES = new Set([
  'request',
  'exception',
  'span',
  'transaction',
  'message',
  'breadcrumb',
  'web_vital'
]);

function analyticsConfig(overrides = {}) {
  return {
    ...handrail.loadConfigFromEnv({
      HANDRAIL_APM_ENABLED: 'false',
      HANDRAIL_PROJECT: 'handrail',
      HANDRAIL_ENV: 'production',
      HANDRAIL_SERVICE: 'website',
      HANDRAIL_RELEASE: '2026.06.06',
      HANDRAIL_ANALYTICS_ENABLED: 'true',
      HANDRAIL_ANALYTICS_ENDPOINT: 'https://handrail.example.test/api/analytics/ingest',
      HANDRAIL_ANALYTICS_KEY: 'analytics-write-key',
      HANDRAIL_ANALYTICS_SOURCE_ID: 'src_node_123'
    }),
    flushIntervalMs: 60_000,
    retryBaseDelayMs: 1,
    retryMaxDelayMs: 1,
    ...overrides
  };
}

function assertNoRuntimeIntakeEventTypes(value, path = '$') {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRuntimeIntakeEventTypes(item, `${path}[${index}]`));
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    const keyPath = `${path}.${key}`;
    assert.notEqual(key, 'event_type', `${keyPath} must not use Runtime Signals event_type`);
    assert.notEqual(key, 'eventType', `${keyPath} must not use Runtime Signals eventType`);
    if (typeof item === 'string') {
      assert.equal(
        RUNTIME_EVENT_TYPES.has(item),
        false,
        `${keyPath} must not contain Runtime Signals event type ${item}`
      );
    }
    assertNoRuntimeIntakeEventTypes(item, keyPath);
  }
}

function assertProductAnalyticsTransportRequest(request, expected = {}) {
  const {
    endpoint = 'https://handrail.example.test/api/analytics/ingest',
    analyticsKey = 'analytics-write-key',
    apmToken = 'runtime-token-that-must-not-leak'
  } = expected;

  assert.equal(request.url, endpoint);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, `Bearer ${analyticsKey}`);
  assert.equal(request.headers['x-handrail-analytics-key'], analyticsKey);
  assert.equal(request.headers['x-handrail-apm-token'], undefined);
  assert.equal(request.body.key, analyticsKey);
  assert.equal(request.body.event_type, undefined);
  assert.ok(PRODUCT_EVENT_KINDS.has(request.body.event.event_kind));
  assertNoRuntimeIntakeEventTypes(request.body);

  const serializedTransport = JSON.stringify({
    headers: request.headers,
    body: request.body
  });
  assert.equal(serializedTransport.includes(apmToken), false);
}

test('track, trackConversion, and page enqueue analytics events while Runtime Signals are disabled', async () => {
  const intake = createFakeAnalyticsFetchIntake();
  const client = handrail.createClient(analyticsConfig({
    batchSize: 99,
    fetch: intake.fetch
  }));

  const trackId = client.track('publishing_form_started', {
    selected_engine: 'unity',
    email: 'drop@example.test'
  }, {
    observedAt: '2026-06-06T18:00:00.000Z',
    visitorId: 'visitor-1',
    sessionId: 'session-1',
    path: '/publishing?token=drop'
  });
  const conversionId = client.trackConversion('publishing_form_submitted', {
    funnel_step: 'submit'
  }, {
    observedAt: '2026-06-06T18:00:01.000Z',
    value: '25',
    currency: 'usd'
  });
  const pageId = client.page('/publishing?utm_source=newsletter&token=drop', {
    observedAt: '2026-06-06T18:00:02.000Z',
    route: {
      pageGroup: 'publishing_funnel'
    }
  });

  assert.equal(client.isEnabled(), false);
  assert.equal(client.getAnalyticsConfig().enabled, true);
  assert.equal(client.getAnalyticsConfig().endpoint, 'https://handrail.example.test/api/analytics/ingest');
  assert.equal(client.getAnalyticsConfig().key, 'analytics-write-key');
  assert.match(trackId, /^hrae_[a-f0-9]{32}$/);
  assert.match(conversionId, /^hrae_[a-f0-9]{32}$/);
  assert.match(pageId, /^hrae_[a-f0-9]{32}$/);
  assert.equal(client.getStats().pending, 0);
  assert.equal(client.getAnalyticsStats().queued, 3);
  assert.equal(client.getAnalyticsStats().pending, 3);

  assert.equal(await client.flush(), true);
  assert.equal(intake.requests.length, 3);
  assert.equal(intake.requests[0].url, 'https://handrail.example.test/api/analytics/ingest');
  assert.equal(intake.requests[0].method, 'POST');
  assert.equal(intake.requests[0].headers['x-handrail-analytics-key'], 'analytics-write-key');
  assert.equal(intake.requests[0].headers.authorization, 'Bearer analytics-write-key');
  assert.equal(intake.requests[0].headers['x-handrail-apm-token'], undefined);
  assert.equal(intake.requests[0].body.key, 'analytics-write-key');
  assert.equal(intake.requests[0].body.event.event_kind, 'custom_event');
  assert.equal(intake.requests[0].body.event.event_id, trackId);
  assert.equal(intake.requests[0].body.event.dedupe_key, trackId);
  assert.equal(intake.requests[0].body.event.custom.event_name, 'publishing_form_started');
  assert.equal(intake.requests[0].body.event.custom.properties.selected_engine, 'unity');
  assert.equal(intake.requests[0].body.event.custom.properties.email, undefined);
  assert.equal(intake.requests[0].body.event.route.path, '/publishing');
  assert.equal(intake.requests[0].body.event.source.analytics_source_id, 'src_node_123');
  assert.equal(intake.requests[0].body.event.source.transport, 'node');
  assert.equal(intake.requests[0].body.event.project, 'handrail');
  assert.equal(intake.requests[0].body.event.service, 'website');
  assert.equal(intake.requests[0].body.event.env, 'production');
  assert.equal(intake.requests[0].body.event.release.release, '2026.06.06');
  assert.equal(intake.requests[0].body.event_type, undefined);
  assert.equal(intake.requests[0].body.method, undefined);

  assert.equal(intake.requests[1].body.event.event_kind, 'conversion');
  assert.equal(intake.requests[1].body.event.event_id, conversionId);
  assert.equal(intake.requests[1].body.event.dedupe_key, conversionId);
  assert.equal(intake.requests[1].body.event.conversion.conversion_name, 'publishing_form_submitted');
  assert.equal(intake.requests[1].body.event.conversion.value, 25);
  assert.equal(intake.requests[1].body.event.conversion.currency, 'USD');

  assert.equal(intake.requests[2].body.event.event_kind, 'page_view');
  assert.equal(intake.requests[2].body.event.event_id, pageId);
  assert.equal(intake.requests[2].body.event.dedupe_key, pageId);
  assert.equal(intake.requests[2].body.event.route.path, '/publishing');
  assert.equal(intake.requests[2].body.event.route.page_group, 'publishing_funnel');
  assert.deepEqual(intake.requests[2].body.event.campaign, {
    utm_source: 'newsletter'
  });

  assert.equal(client.getAnalyticsStats().sent, 3);
  assert.equal(client.getAnalyticsStats().pending, 0);

  await client.shutdown();
});

test('Product Signals transport uses analytics keys and does not leak Runtime/APM tokens when both transports are enabled', async () => {
  const intake = createFakeAnalyticsFetchIntake();
  const client = handrail.createClient(analyticsConfig({
    enabled: true,
    endpoint: 'https://runtime.example.test/api/apm/events',
    token: 'runtime-token-that-must-not-leak',
    batchSize: 99,
    fetch: intake.fetch
  }));

  client.track('signup_started', { plan: 'team' }, {
    observedAt: '2026-06-06T18:01:00.000Z',
    visitorId: 'visitor-transport-1',
    sessionId: 'session-transport-1'
  });
  client.trackConversion('signup_completed', { plan: 'team' }, {
    observedAt: '2026-06-06T18:01:01.000Z',
    value: 199,
    currency: 'usd'
  });
  client.page('/pricing?token=runtime-token-that-must-not-leak', {
    observedAt: '2026-06-06T18:01:02.000Z'
  });

  assert.equal(client.isEnabled(), true);
  assert.equal(client.getConfig().endpoint, 'https://runtime.example.test/api/apm/events');
  assert.equal(client.getConfig().token, 'runtime-token-that-must-not-leak');
  assert.equal(client.getStats().pending, 0);
  assert.equal(client.getAnalyticsStats().pending, 3);

  assert.equal(await client.flush(), true);
  assert.equal(intake.requests.length, 3);
  for (const request of intake.requests) {
    assertProductAnalyticsTransportRequest(request);
  }

  assert.deepEqual(
    intake.requests.map((request) => request.body.event.event_kind),
    ['custom_event', 'conversion', 'page_view']
  );
  assert.equal(client.getStats().sent, 0);
  assert.equal(client.getAnalyticsStats().sent, 3);
  assert.equal(client.getAnalyticsStats().pending, 0);

  await client.shutdown();
});

test('Product Signals outbound payloads use Product event_kind values, not Runtime intake event_type values', async () => {
  const intake = createFakeAnalyticsFetchIntake();
  const client = handrail.createClient(analyticsConfig({
    enabled: true,
    endpoint: 'https://runtime.example.test/api/apm/events',
    token: 'runtime-token-that-must-not-leak',
    batchSize: 99,
    fetch: intake.fetch
  }));

  const routeViewId = client.captureAnalyticsEvent({
    event_type: 'request',
    path: '/products/123',
    observedAt: '2026-06-06T18:02:00.000Z'
  });
  const rejectedRuntimeTypeIds = ['exception', 'span', 'transaction', 'message', 'breadcrumb', 'web_vital'].map((eventType) => (
    client.captureAnalyticsEvent({
      event_type: eventType,
      observedAt: '2026-06-06T18:02:01.000Z'
    })
  ));

  assert.match(routeViewId, /^hrae_[a-f0-9]{32}$/);
  assert.deepEqual(rejectedRuntimeTypeIds, [null, null, null, null, null, null]);
  assert.equal(client.getAnalyticsStats().pending, 1);
  assert.equal(await client.flush(), true);
  assert.equal(intake.requests.length, 1);
  assertProductAnalyticsTransportRequest(intake.requests[0]);
  assert.equal(intake.requests[0].body.event.event_kind, 'route_view');
  assert.equal(intake.requests[0].body.event.event_type, undefined);
  assert.equal(intake.requests[0].body.event.route.path, '/products/123');
  assert.equal(client.getAnalyticsStats().sent, 1);

  await client.shutdown();
});

test('module-level analytics helpers delegate to the current client', async () => {
  const intake = createFakeAnalyticsFetchIntake();
  const client = handrail.init(analyticsConfig({
    batchSize: 99,
    fetch: intake.fetch
  }));

  const eventId = handrail.track('module_track', { component: 'cta' }, {
    observedAt: '2026-06-06T18:00:05.000Z'
  });

  assert.match(eventId, /^hrae_[a-f0-9]{32}$/);
  assert.equal(handrail.getAnalyticsConfig().sourceId, 'src_node_123');
  assert.equal(handrail.getAnalyticsStats().pending, 1);
  assert.equal(await handrail.flush(), true);
  assert.equal(intake.requests.length, 1);
  assert.equal(intake.requests[0].body.event.custom.event_name, 'module_track');
  assert.equal(intake.requests[0].body.event.event_id, eventId);
  assert.equal(handrail.getAnalyticsStats().sent, 1);
  assert.equal(handrail.getAnalyticsStats().pending, 0);

  await client.shutdown();
});

test('analytics helpers return quietly when analytics config is disabled or incomplete', async () => {
  let fetchCalls = 0;
  const client = handrail.createClient({
    enabled: false,
    project: 'handrail',
    environment: 'production',
    service: 'website',
    flushIntervalMs: 60_000,
    analytics: {
      enabled: true,
      endpoint: '',
      key: '',
      sourceId: ''
    },
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, status: 202 };
    }
  });

  assert.equal(client.getAnalyticsConfig().enabled, false);
  assert.equal(client.track('ignored'), null);
  assert.equal(client.trackConversion('ignored'), null);
  assert.equal(client.page('/ignored'), null);
  assert.equal(await client.flush(), true);
  assert.equal(fetchCalls, 0);
  assert.equal(client.getAnalyticsStats().queued, 0);
  assert.equal(client.getAnalyticsStats().pending, 0);

  await client.shutdown();
});
