const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const handrail = require('../src/index.cjs');
const { createFakeSignalsFetchIntake } = require('./support/fake-analytics-intake.cjs');

function createMockResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.locals = {};
  return res;
}

function assertRuntimePost(request) {
  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'https://handrail.example.test/api/apm/events');
  assert.equal(request.path, '/api/apm/events');
  assert.equal(request.headers.authorization, 'Bearer smoke-apm-token');
  assert.equal(request.headers['x-handrail-apm-token'], 'smoke-apm-token');
  assert.equal(request.headers['x-handrail-analytics-key'], undefined);
  assert.equal(request.body.key, undefined);
  assert.equal(request.body.event_kind, undefined);
  assert.ok(['request', 'exception'].includes(request.body.event_type));
}

function assertAnalyticsPost(request) {
  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'https://handrail.example.test/api/analytics/ingest');
  assert.equal(request.path, '/api/analytics/ingest');
  assert.equal(request.headers.authorization, 'Bearer smoke-analytics-key');
  assert.equal(request.headers['x-handrail-analytics-key'], 'smoke-analytics-key');
  assert.equal(request.headers['x-handrail-apm-token'], undefined);
  assert.equal(request.body.key, 'smoke-analytics-key');
  assert.equal(request.body.event.event_type, undefined);
  assert.ok(['route_view', 'custom_event', 'page_view'].includes(request.body.event.event_kind));
}

test('fake intake smoke captures Runtime and Product Signals through injected fetch', async () => {
  const intake = createFakeSignalsFetchIntake();
  const client = handrail.createClient({
    enabled: true,
    endpoint: 'https://handrail.example.test/api/apm/events',
    token: 'smoke-apm-token',
    project: 'handrail',
    environment: 'dev',
    service: 'api',
    release: 'smoke-release',
    batchSize: 10,
    flushIntervalMs: 60_000,
    requestTimeoutMs: 1000,
    shutdownTimeoutMs: 1000,
    maxRetries: 0,
    fetch: intake.fetch,
    analytics: {
      enabled: true,
      endpoint: 'https://handrail.example.test/api/analytics/ingest',
      writeKey: 'smoke-analytics-key',
      sourceId: 'src_smoke'
    }
  });

  const runtimeMiddleware = handrail.expressMiddleware(client);
  const runtimeReq = {
    id: 'smoke-request-id',
    method: 'GET',
    originalUrl: '/users/42?token=secret&visible=yes',
    path: '/users/42',
    baseUrl: '/api',
    route: { path: '/users/:id' },
    headers: {
      authorization: 'Bearer secret',
      'x-public': 'kept'
    },
    handrailTags: {
      tenant: 'acme',
      token: 'secret-tag'
    }
  };
  const runtimeRes = createMockResponse();

  runtimeMiddleware(runtimeReq, runtimeRes, () => {});
  runtimeRes.statusCode = 204;
  runtimeRes.emit('finish');

  client.addBreadcrumb({
    category: 'request',
    message: 'handled smoke request',
    data: {
      token: 'secret-breadcrumb',
      visible: 'kept'
    }
  });
  client.captureException(new Error('smoke failure'), {
    request: {
      method: 'GET',
      path: '/users/42'
    },
    tags: {
      tenant: 'acme'
    }
  });

  const analyticsMiddleware = handrail.expressAnalyticsMiddleware(client, {
    pathGroup: (_req, _res, context) => context.route || context.path || '/',
    properties: {
      sdk_mode: 'server'
    }
  });
  const analyticsReq = {
    method: 'GET',
    originalUrl: '/publishing/123456?utm_source=newsletter&email=drop@example.test&token=secret',
    path: '/publishing/123456',
    headers: {
      referer: 'https://referrer.example/articles?token=drop',
      'x-handrail-visitor-id': 'visitor-smoke',
      'x-handrail-session-id': 'session-smoke'
    },
    route: { path: '/publishing/:id' },
    handrailAnalytics: {
      eventName: 'server_route_observed',
      properties: {
        email: 'drop@example.test',
        funnel_step: 'view'
      }
    }
  };
  const analyticsRes = createMockResponse();

  analyticsMiddleware(analyticsReq, analyticsRes, () => {});
  analyticsRes.statusCode = 200;
  analyticsRes.emit('finish');

  const trackId = client.track('publishing_form_started', {
    selected_engine: 'unity',
    phone: '555-0101'
  }, {
    observedAt: '2026-06-06T20:00:00.000Z',
    path: '/publishing?utm_campaign=launch&token=drop'
  });
  const pageId = client.page('/publishing/thank-you?utm_source=newsletter&email=drop@example.test', {
    observedAt: '2026-06-06T20:00:01.000Z',
    route: {
      pageGroup: 'publishing_funnel'
    }
  });

  assert.match(trackId, /^hrae_[a-f0-9-]+$/);
  assert.match(pageId, /^hrae_[a-f0-9-]+$/);
  assert.equal(client.getStats().pending, 2);
  assert.equal(client.getAnalyticsStats().pending, 3);

  assert.equal(await client.flush(), true);
  await client.shutdown();

  const runtimeRequests = intake.runtimeRequests();
  const analyticsRequests = intake.analyticsRequests();

  assert.equal(intake.requests.length, 5);
  assert.equal(runtimeRequests.length, 2);
  assert.equal(analyticsRequests.length, 3);
  runtimeRequests.forEach(assertRuntimePost);
  analyticsRequests.forEach(assertAnalyticsPost);

  const requestEvent = runtimeRequests.find((request) => request.body.event_type === 'request').body;
  assert.equal(requestEvent.project, 'handrail');
  assert.equal(requestEvent.env, 'dev');
  assert.equal(requestEvent.service, 'api');
  assert.equal(requestEvent.release, 'smoke-release');
  assert.equal(requestEvent.method, 'GET');
  assert.equal(requestEvent.route, '/api/users/:id');
  assert.equal(requestEvent.path_sample, '/users/42');
  assert.equal(requestEvent.status_code, 204);
  assert.equal(requestEvent.tags['handrail.request_id'], 'smoke-request-id');
  assert.equal(requestEvent.tags.token, '[Redacted]');
  assert.equal(requestEvent.request_metadata_json.request.headers.authorization, '[Redacted]');
  assert.equal(requestEvent.request_metadata_json.request.headers['x-public'], 'kept');
  assert.equal(requestEvent.request_metadata_json.request.queryParams.token, '[Redacted]');
  assert.equal(requestEvent.request_metadata_json.request.queryParams.visible, 'yes');

  const exceptionEvent = runtimeRequests.find((request) => request.body.event_type === 'exception').body;
  assert.equal(exceptionEvent.exception_type, 'Error');
  assert.equal(exceptionEvent.normalized_message, 'smoke failure');
  assert.equal(exceptionEvent.tags.tenant, 'acme');
  assert.equal(exceptionEvent.exception_metadata_json.request.path, '/users/42');
  assert.equal(exceptionEvent.breadcrumbs[0].data.token, '[Redacted]');
  assert.equal(exceptionEvent.breadcrumbs[0].data.visible, 'kept');

  const routeEvent = analyticsRequests.find((request) => request.body.event.event_kind === 'route_view').body.event;
  assert.equal(routeEvent.route.path, '/publishing/123456');
  assert.equal(routeEvent.route.normalized_path, '/publishing/:id');
  assert.equal(routeEvent.route.page_group, '/publishing/:id');
  assert.equal(routeEvent.route.referrer_domain, 'referrer.example');
  assert.deepEqual(routeEvent.campaign, {
    utm_source: 'newsletter'
  });
  assert.equal(routeEvent.visitor.visitor_hash, 'visitor-smoke');
  assert.equal(routeEvent.session.session_hash, 'session-smoke');
  assert.equal(routeEvent.custom.event_name, 'server_route_observed');
  assert.equal(routeEvent.custom.properties.http_method, 'GET');
  assert.equal(routeEvent.custom.properties.http_status, 200);
  assert.equal(routeEvent.custom.properties.sdk_mode, 'server');
  assert.equal(routeEvent.custom.properties.funnel_step, 'view');
  assert.equal(routeEvent.custom.properties.email, undefined);

  const trackEvent = analyticsRequests.find((request) => (
    request.body.event.custom.event_name === 'publishing_form_started'
  )).body.event;
  assert.equal(trackEvent.event_kind, 'custom_event');
  assert.equal(trackEvent.event_id, trackId);
  assert.equal(trackEvent.route.path, '/publishing');
  assert.equal(trackEvent.custom.properties.selected_engine, 'unity');
  assert.equal(trackEvent.custom.properties.phone, undefined);
  assert.deepEqual(trackEvent.campaign, {
    utm_campaign: 'launch'
  });

  const pageEvent = analyticsRequests.find((request) => request.body.event.event_id === pageId).body.event;
  assert.equal(pageEvent.event_kind, 'page_view');
  assert.equal(pageEvent.route.path, '/publishing/thank-you');
  assert.equal(pageEvent.route.page_group, 'publishing_funnel');
  assert.deepEqual(pageEvent.campaign, {
    utm_source: 'newsletter'
  });
});
