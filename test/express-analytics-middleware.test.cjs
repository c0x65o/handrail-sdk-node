const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const handrail = require('../src/index.cjs');

function completeConfig(overrides = {}) {
  return handrail.loadConfigFromEnv({
    HANDRAIL_APM_ENABLED: 'true',
    HANDRAIL_APM_ENDPOINT: 'https://handrail.example.test/api/apm/events',
    HANDRAIL_APM_TOKEN: 'token-test',
    HANDRAIL_PROJECT: 'handrail',
    HANDRAIL_ENV: 'dev',
    HANDRAIL_SERVICE: 'api',
    HANDRAIL_RELEASE: 'abc123',
    ...overrides
  });
}

function analyticsConfig(overrides = {}) {
  return handrail.loadConfigFromEnv({
    HANDRAIL_APM_ENABLED: 'false',
    HANDRAIL_PROJECT: 'handrail',
    HANDRAIL_ENV: 'production',
    HANDRAIL_SERVICE: 'website',
    HANDRAIL_RELEASE: '2026.06.06',
    HANDRAIL_ANALYTICS_ENABLED: 'true',
    HANDRAIL_ANALYTICS_ENDPOINT: 'https://handrail.example.test/api/analytics/ingest',
    HANDRAIL_ANALYTICS_KEY: 'analytics-write-key',
    HANDRAIL_ANALYTICS_SOURCE_ID: 'src_node_123',
    ...overrides
  });
}

function createMockResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.locals = {};
  return res;
}

test('Express analytics middleware captures route observations without Runtime Signals capture', async () => {
  const client = handrail.createClient(analyticsConfig());
  const middleware = handrail.expressAnalyticsMiddleware(client, {
    properties: {
      sdk_mode: 'server'
    }
  });
  const req = {
    method: 'GET',
    originalUrl: '/publishing/123456?utm_source=newsletter&email=drop@example.test&token=secret',
    path: '/publishing/123456',
    headers: {
      referer: 'https://referrer.example/articles/game-publishing?token=ref-secret',
      'x-handrail-visitor-id': 'visitor-1',
      'x-handrail-session-id': 'session-1'
    },
    handrailAnalytics: {
      eventName: 'server_route_observed',
      properties: {
        funnel_step: 'view',
        email: 'drop@example.test'
      },
      conversion: {
        conversionName: 'publishing_lead_view'
      }
    }
  };
  const res = createMockResponse();
  res.locals.handrailAnalytics = {
    pathGroup: 'publishing_funnel',
    properties: {
      response_variant: 'a'
    },
    experiment: {
      experimentKey: 'publishing-copy',
      variantKey: 'short-copy'
    }
  };
  let nextCalled = 0;

  middleware(req, res, () => {
    nextCalled += 1;
  });

  req.route = { path: '/publishing/:id' };
  res.statusCode = 200;
  res.emit('finish');

  assert.equal(nextCalled, 1);
  assert.equal(client._events.length, 0);
  assert.equal(client._analyticsEvents.length, 1);

  const event = client._analyticsEvents[0];
  assert.equal(event.event_kind, 'route_view');
  assert.equal(event.project, 'handrail');
  assert.equal(event.service, 'website');
  assert.equal(event.env, 'production');
  assert.equal(event.release.release, '2026.06.06');
  assert.equal(event.route.path, '/publishing/123456');
  assert.equal(event.route.normalized_path, '/publishing/:id');
  assert.equal(event.route.page_group, 'publishing_funnel');
  assert.equal(event.route.referrer_domain, 'referrer.example');
  assert.deepEqual(event.campaign, {
    utm_source: 'newsletter'
  });
  assert.equal(event.visitor.visitor_hash, 'visitor-1');
  assert.equal(event.session.session_hash, 'session-1');
  assert.equal(event.custom.event_name, 'server_route_observed');
  assert.equal(event.custom.properties.http_method, 'GET');
  assert.equal(event.custom.properties.http_status, 200);
  assert.equal(Number.isInteger(event.custom.properties.duration_ms), true);
  assert.equal(event.custom.properties.sdk_mode, 'server');
  assert.equal(event.custom.properties.funnel_step, 'view');
  assert.equal(event.custom.properties.response_variant, 'a');
  assert.equal(event.custom.properties.email, undefined);
  assert.equal(event.conversion.conversion_name, 'publishing_lead_view');
  assert.equal(event.experiment.experiment_key, 'publishing-copy');
  assert.equal(event.experiment.variant_key, 'short-copy');

  await client.shutdown();
});

test('Express analytics middleware coexists with Runtime Signals middleware and captures close once', async () => {
  const client = handrail.createClient(analyticsConfig({
    HANDRAIL_APM_ENABLED: 'true',
    HANDRAIL_APM_ENDPOINT: 'https://handrail.example.test/api/apm/events',
    HANDRAIL_APM_TOKEN: 'token-test'
  }));
  const runtimeMiddleware = handrail.expressMiddleware(client);
  const analyticsMiddleware = handrail.expressAnalyticsMiddleware(client);
  const req = {
    method: 'POST',
    url: '/orders/ord_123456789/checkout?utm_campaign=launch',
    headers: {}
  };
  const res = createMockResponse();

  runtimeMiddleware(req, res, () => {});
  analyticsMiddleware(req, res, () => {});

  req.route = { path: '/orders/:orderId/checkout' };
  res.statusCode = 503;
  res.emit('close');
  res.emit('finish');

  assert.equal(client._events.length, 1);
  assert.equal(client._analyticsEvents.length, 1);
  assert.equal(client._events[0].type, 'transaction');
  assert.equal(client._analyticsEvents[0].event_kind, 'route_view');
  assert.equal(client._analyticsEvents[0].route.normalized_path, '/orders/:orderId/checkout');
  assert.equal(client._analyticsEvents[0].route.page_group, '/orders');
  assert.equal(client._analyticsEvents[0].custom.properties.http_status, 503);

  await client.shutdown();
});

test('Express analytics middleware delegates without Product Signals config', async () => {
  const client = handrail.createClient(completeConfig());
  const middleware = handrail.expressAnalyticsMiddleware(client);
  const req = {
    method: 'GET',
    url: '/health',
    headers: {}
  };
  const res = createMockResponse();
  let nextCalled = 0;

  middleware(req, res, () => {
    nextCalled += 1;
  });
  res.emit('finish');

  assert.equal(nextCalled, 1);
  assert.equal(client._events.length, 0);
  assert.equal(client._analyticsEvents.length, 0);

  await client.shutdown();
});
