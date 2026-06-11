const assert = require('node:assert/strict');
const test = require('node:test');

const handrail = require('../src/index.cjs');
const { createFakeAnalyticsFetchIntake } = require('./support/fake-analytics-intake.cjs');

const ANALYTICS_ENDPOINT = 'https://handrail.example.test/api/analytics/ingest';
const ANALYTICS_WRITE_KEY = 'analytics-write-key-configured-source';
const ANALYTICS_SOURCE_ID = 'src_configured_acceptance';
const ANALYTICS_SOURCE_KIND = 'server';
const PROJECT = 'handrail';
const SERVICE = 'signals-sdk-node';
const SERVICE_ENV = 'service_env_acceptance';
const ENV = 'production';
const RELEASE = '2026.06.11';
const APM_TOKEN = 'runtime-apm-token-that-must-not-leak';

const RUNTIME_EVENT_TYPES = new Set([
  'request',
  'exception',
  'span',
  'transaction',
  'message',
  'breadcrumb',
  'web_vital'
]);

function configuredSourceConfig(overrides = {}) {
  const base = handrail.loadConfigFromEnv({
    HANDRAIL_APM_ENABLED: 'false',
    HANDRAIL_APM_ENDPOINT: 'https://runtime.example.test/api/apm/events',
    HANDRAIL_APM_TOKEN: APM_TOKEN,
    HANDRAIL_PROJECT: PROJECT,
    HANDRAIL_SERVICE: SERVICE,
    HANDRAIL_ENV: ENV,
    HANDRAIL_RELEASE: RELEASE,
    HANDRAIL_ANALYTICS_ENABLED: 'true',
    HANDRAIL_ANALYTICS_ENDPOINT: ANALYTICS_ENDPOINT,
    HANDRAIL_ANALYTICS_WRITE_KEY: ANALYTICS_WRITE_KEY,
    HANDRAIL_ANALYTICS_SOURCE_ID: ANALYTICS_SOURCE_ID,
    HANDRAIL_ANALYTICS_SOURCE_KIND: ANALYTICS_SOURCE_KIND,
    HANDRAIL_ANALYTICS_SERVICE_ENV_ID: SERVICE_ENV
  });

  return {
    ...base,
    batchSize: 99,
    flushIntervalMs: 60_000,
    retryBaseDelayMs: 1,
    retryMaxDelayMs: 1,
    ...overrides,
    analytics: {
      ...base.analytics,
      ...overrides.analytics
    }
  };
}

function assertNoRuntimeFieldsOrApmToken(value, path = '$') {
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      assert.equal(value.includes(APM_TOKEN), false, `${path} must not include the Runtime/APM token`);
      assert.equal(RUNTIME_EVENT_TYPES.has(value), false, `${path} must not include Runtime event type ${value}`);
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoRuntimeFieldsOrApmToken(item, `${path}[${index}]`));
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    const keyPath = `${path}.${key}`;
    assert.notEqual(key, 'event_type', `${keyPath} must not use Runtime Signals event_type`);
    assert.notEqual(key, 'eventType', `${keyPath} must not use Runtime Signals eventType`);
    assert.notEqual(key.toLowerCase(), 'x-handrail-apm-token', `${keyPath} must not use APM token headers`);
    assertNoRuntimeFieldsOrApmToken(item, keyPath);
  }
}

function assertConfiguredProductRequest(request, expectedEventKind) {
  assert.equal(request.kind, 'analytics');
  assert.equal(request.ok, true);
  assert.equal(request.status, 202);
  assert.equal(request.url, ANALYTICS_ENDPOINT);
  assert.equal(request.method, 'POST');
  assert.equal(request.headers.authorization, `Bearer ${ANALYTICS_WRITE_KEY}`);
  assert.equal(request.headers['x-handrail-analytics-key'], ANALYTICS_WRITE_KEY);
  assert.equal(request.headers['x-handrail-apm-token'], undefined);
  assert.equal(request.body.key, ANALYTICS_WRITE_KEY);
  assert.equal(request.body.event_type, undefined);

  const event = request.body.event;
  assert.equal(event.event_kind, expectedEventKind);
  assert.equal(event.event_type, undefined);
  assert.equal(event.project, PROJECT);
  assert.equal(event.service, SERVICE);
  assert.equal(event.env, ENV);
  assert.equal(event.release.release, RELEASE);
  assert.equal(event.source.analytics_source_id, ANALYTICS_SOURCE_ID);
  assert.equal(event.source.source_kind, ANALYTICS_SOURCE_KIND);
  assert.equal(event.source.project, PROJECT);
  assert.equal(event.source.service, SERVICE);
  assert.equal(event.source.service_env, SERVICE_ENV);
  assert.equal(event.source.env, ENV);

  assertNoRuntimeFieldsOrApmToken({
    headers: request.headers,
    body: request.body
  });
}

test('configured Product Signals source accepts page_view, experiment_exposure, and conversion', async () => {
  const intake = createFakeAnalyticsFetchIntake({
    responses: [202, 202, 202]
  });
  const client = handrail.createClient(configuredSourceConfig({
    fetch: intake.fetch
  }));

  const pageId = client.page('/pricing?utm_source=newsletter&token=secret', {
    observedAt: '2026-06-11T12:00:00.000Z',
    visitorId: 'visitor-configured-source',
    sessionId: 'session-configured-source',
    route: {
      pageGroup: 'pricing'
    }
  });
  const exposureId = client.trackExperimentExposure({
    experimentKey: 'checkout-copy',
    variantKey: 'variant-b',
    assignmentId: 'assignment-configured-1',
    assignmentUnitHash: 'assignment-unit-hash-1',
    assignmentUnit: {
      kind: 'visitor',
      hash: 'assignment-unit-hash-1'
    },
    traffic: {
      in_experiment: true,
      allocation: 0.5
    }
  }, {
    surface: 'pricing_hero',
    trigger: 'variant_rendered'
  }, {
    observedAt: '2026-06-11T12:00:01.000Z',
    exposureId: 'exposure-configured-1',
    path: '/pricing'
  });
  const conversionId = client.trackConversion('signup_completed', {
    plan: 'team'
  }, {
    observedAt: '2026-06-11T12:00:02.000Z',
    value: 199,
    currency: 'usd',
    path: '/checkout/complete'
  });

  assert.match(pageId, /^hrae_[a-f0-9]{32}$/);
  assert.match(exposureId, /^hrae_[a-f0-9]{32}$/);
  assert.match(conversionId, /^hrae_[a-f0-9]{32}$/);
  assert.equal(client.isEnabled(), false);
  assert.equal(client.getAnalyticsConfig().enabled, true);
  assert.equal(client.getAnalyticsConfig().endpoint, ANALYTICS_ENDPOINT);
  assert.equal(client.getAnalyticsConfig().key, ANALYTICS_WRITE_KEY);
  assert.equal(client.getAnalyticsConfig().sourceId, ANALYTICS_SOURCE_ID);
  assert.equal(client.getAnalyticsConfig().sourceKind, ANALYTICS_SOURCE_KIND);
  assert.equal(client.getAnalyticsStats().pending, 3);

  assert.equal(await client.flush(), true);

  const analyticsRequests = intake.analyticsRequests();
  assert.equal(intake.requests.length, 3);
  assert.equal(analyticsRequests.length, 3);
  assert.equal(intake.runtimeRequests().length, 0);
  assert.equal(intake.assignmentRequests().length, 0);
  assert.deepEqual(
    analyticsRequests.map((request) => request.body.event.event_kind),
    ['page_view', 'experiment_exposure', 'conversion']
  );

  assertConfiguredProductRequest(analyticsRequests[0], 'page_view');
  assertConfiguredProductRequest(analyticsRequests[1], 'experiment_exposure');
  assertConfiguredProductRequest(analyticsRequests[2], 'conversion');

  const pageView = analyticsRequests[0].body.event;
  assert.equal(pageView.event_id, pageId);
  assert.equal(pageView.dedupe_key, pageId);
  assert.equal(pageView.route.path, '/pricing');
  assert.equal(pageView.route.page_group, 'pricing');
  assert.deepEqual(pageView.campaign, {
    utm_source: 'newsletter'
  });

  const exposure = analyticsRequests[1].body.event;
  assert.equal(exposure.event_id, exposureId);
  assert.equal(exposure.dedupe_key, exposureId);
  assert.equal(exposure.route.path, '/pricing');
  assert.equal(exposure.experiment.experiment_key, 'checkout-copy');
  assert.equal(exposure.experiment.variant_key, 'variant-b');
  assert.equal(exposure.experiment.assignment_id, 'assignment-configured-1');
  assert.equal(exposure.experiment.exposure_id, 'exposure-configured-1');
  assert.equal(exposure.experiment.assignment_unit_hash, 'assignment-unit-hash-1');
  assert.equal(exposure.experiment.assignment_unit.kind, 'visitor');
  assert.equal(exposure.experiment.assignment_unit.hash, 'assignment-unit-hash-1');
  assert.equal(exposure.experiment.traffic.in_experiment, true);
  assert.equal(exposure.experiment.traffic.allocation, 0.5);
  assert.equal(exposure.custom.properties.surface, 'pricing_hero');
  assert.equal(exposure.custom.properties.trigger, 'variant_rendered');

  const conversion = analyticsRequests[2].body.event;
  assert.equal(conversion.event_id, conversionId);
  assert.equal(conversion.dedupe_key, conversionId);
  assert.equal(conversion.route.path, '/checkout/complete');
  assert.equal(conversion.conversion.conversion_name, 'signup_completed');
  assert.equal(conversion.conversion.value, 199);
  assert.equal(conversion.conversion.currency, 'USD');
  assert.equal(conversion.custom.properties.plan, 'team');

  const stats = client.getAnalyticsStats();
  assert.equal(stats.sent, 3);
  assert.equal(stats.pending, 0);
  assert.equal(stats.failedRequests, 0);
  assert.equal(stats.failedBatches, 0);

  await client.shutdown();
});
