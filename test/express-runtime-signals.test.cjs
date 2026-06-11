const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const handrail = require('../src/index.cjs');

const PRODUCT_SIGNAL_KEYS = new Set([
  'event_kind',
  'analytics',
  'analytics_key',
  'analytics_source_id',
  'source_id',
  'experiment',
  'experiment_key',
  'variant_key',
  'assignment_id',
  'exposure_id'
]);

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

function createMockResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.locals = {};
  return res;
}

function assertNoProductSignalFields(value, path = 'event') {
  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoProductSignalFields(item, `${path}[${index}]`));
    return;
  }

  for (const [key, item] of Object.entries(value)) {
    assert.equal(PRODUCT_SIGNAL_KEYS.has(key), false, `${path}.${key} must not be a Product Signals field`);
    assertNoProductSignalFields(item, `${path}.${key}`);
  }
}

test('Express Runtime middleware captures completed request telemetry and sanitized context', () => {
  const client = handrail.createClient(completeConfig());
  const middleware = handrail.expressMiddleware(client);
  const req = {
    id: 'req-123',
    method: 'GET',
    originalUrl: '/users/42?token=secret&filter=active#section',
    path: '/users/42',
    baseUrl: '/api',
    route: { path: '/users/:id' },
    headers: {
      'x-request-id': 'header-request-id',
      authorization: 'Bearer secret'
    },
    handrailTags: {
      tenant: 'acme',
      'api token': 'sensitive-value'
    }
  };
  const res = createMockResponse();
  res.locals.handrailTags = {
    region: 'us-east'
  };
  let nextCalled = 0;

  client.addBreadcrumb({
    category: 'request',
    message: 'authorization token available',
    data: {
      authorization: 'Bearer secret',
      route_hint: '/users/:id'
    }
  });

  middleware(req, res, () => {
    nextCalled += 1;
  });

  res.statusCode = 201;
  res.emit('finish');

  assert.equal(nextCalled, 1);
  assert.equal(client._events.length, 1);
  assert.equal(client._analyticsEvents.length, 0);

  const event = client._events[0];
  assert.equal(event.type, 'transaction');
  assert.equal(event.metadata.project, 'handrail');
  assert.equal(event.metadata.environment, 'dev');
  assert.equal(event.metadata.service, 'api');
  assert.equal(event.metadata.release, 'abc123');
  assert.deepEqual(event.transaction, {
    method: 'GET',
    route: '/api/users/:id',
    path: '/users/42',
    statusCode: 201,
    durationMs: event.transaction.durationMs
  });
  assert.equal(Number.isInteger(event.transaction.durationMs), true);
  assert.equal(event.transaction.durationMs >= 0, true);
  assert.equal(event.request.id, 'req-123');
  assert.equal(event.request.method, 'GET');
  assert.equal(event.request.route, '/api/users/:id');
  assert.equal(event.request.path, '/users/42');
  assert.equal(event.request.url, '/users/42?token=%5BRedacted%5D&filter=active');
  assert.deepEqual(event.request.queryParams, {
    token: '[Redacted]',
    filter: 'active'
  });
  assert.equal(event.request.headers.authorization, '[Redacted]');
  assert.equal(event.request.headers['x-request-id'], 'header-request-id');
  assert.equal(event.request.statusCode, 201);
  assert.equal(event.tags['http.method'], 'GET');
  assert.equal(event.tags['http.route'], '/api/users/:id');
  assert.equal(event.tags['http.status_code'], '201');
  assert.equal(event.tags['handrail.request_id'], 'req-123');
  assert.equal(event.tags.tenant, 'acme');
  assert.equal(event.tags.api_token, '[Redacted]');
  assert.equal(event.tags.region, 'us-east');
  assert.equal(event.breadcrumbs.length, 1);
  assert.equal(event.breadcrumbs[0].message, '[Redacted]');
  assert.equal(event.breadcrumbs[0].data.authorization, '[Redacted]');
  assert.equal(event.breadcrumbs[0].data.route_hint, '/users/:id');
  assertNoProductSignalFields(event);
});

test('Express Runtime middleware captures finish or close only once and strips fallback path queries', () => {
  const client = handrail.createClient(completeConfig());
  const middleware = handrail.expressMiddleware(client);
  const req = {
    method: 'POST',
    url: '/submit?password=hidden&step=confirm',
    headers: {
      'x-correlation-id': 'corr-456'
    }
  };
  const res = createMockResponse();

  middleware(req, res, () => {});

  res.statusCode = 503;
  res.emit('close');
  res.emit('finish');

  assert.equal(client._events.length, 1);
  assert.equal(client._analyticsEvents.length, 0);

  const event = client._events[0];
  assert.equal(event.type, 'transaction');
  assert.equal(event.transaction.method, 'POST');
  assert.equal(event.transaction.path, '/submit');
  assert.equal(event.transaction.route, undefined);
  assert.equal(event.transaction.statusCode, 503);
  assert.equal(Number.isInteger(event.transaction.durationMs), true);
  assert.equal(event.transaction.durationMs >= 0, true);
  assert.equal(event.request.id, 'corr-456');
  assert.equal(event.request.path, '/submit');
  assert.equal(event.request.url, '/submit?password=%5BRedacted%5D&step=confirm');
  assert.deepEqual(event.request.queryParams, {
    password: '[Redacted]',
    step: 'confirm'
  });
  assert.equal(event.tags['http.status_code'], '503');
  assertNoProductSignalFields(event);
});

test('disabled Express Runtime middleware only delegates without enqueueing events', () => {
  const client = handrail.createClient({
    ...completeConfig(),
    enabled: false
  });
  const middleware = handrail.expressMiddleware(client);
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
  res.emit('close');

  assert.equal(nextCalled, 1);
  assert.equal(client._events.length, 0);
  assert.equal(client._analyticsEvents.length, 0);
});

test('Express Runtime error handler captures safe exception request context and delegates the original error', () => {
  const client = handrail.createClient(completeConfig());
  const errorHandler = handrail.expressErrorHandler(client);
  const error = new Error('route failed');
  error.status = 503;
  error.cause = new Error('database password leaked');
  const req = {
    id: 'req-789',
    method: 'PATCH',
    originalUrl: '/users/42?api_key=secret&sort=desc',
    path: '/users/42',
    baseUrl: '/api',
    route: { path: '/users/:id' },
    query: {
      api_key: 'secret',
      sort: 'desc'
    },
    headers: {
      authorization: 'Bearer secret'
    },
    handrailTags: {
      tenant: 'acme'
    }
  };
  const res = createMockResponse();
  res.statusCode = 200;
  let delegatedError = null;

  errorHandler(error, req, res, (nextError) => {
    delegatedError = nextError;
  });

  assert.equal(delegatedError, error);
  assert.equal(client._events.length, 1);
  assert.equal(client._analyticsEvents.length, 0);

  const event = client._events[0];
  assert.equal(event.type, 'exception');
  assert.equal(event.exception.name, 'Error');
  assert.equal(event.exception.message, 'route failed');
  assert.equal(event.exception.cause.message, '[Redacted]');
  assert.equal(event.request.id, 'req-789');
  assert.equal(event.request.method, 'PATCH');
  assert.equal(event.request.route, '/api/users/:id');
  assert.equal(event.request.path, '/users/42');
  assert.equal(event.request.url, '/users/42?api_key=%5BRedacted%5D&sort=desc');
  assert.deepEqual(event.request.queryParams, {
    api_key: '[Redacted]',
    sort: 'desc'
  });
  assert.equal(event.request.headers.authorization, '[Redacted]');
  assert.equal(event.request.statusCode, 503);
  assert.equal(event.context.response.statusCode, 503);
  assert.equal(event.context.handled, true);
  assert.equal(event.context.mechanism, 'express');
  assert.equal(event.tags['http.method'], 'PATCH');
  assert.equal(event.tags['http.route'], '/api/users/:id');
  assert.equal(event.tags['http.status_code'], '503');
  assert.equal(event.tags['exception.mechanism'], 'express');
  assert.equal(event.tags['exception.handled'], 'true');
  assert.equal(event.tags.tenant, 'acme');
  assertNoProductSignalFields(event);
});
