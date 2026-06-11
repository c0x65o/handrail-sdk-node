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

function createMockResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.locals = {};
  return res;
}

test('manual captureException records normalized stack, metadata tags, and redacted breadcrumbs', () => {
  const client = handrail.createClient(completeConfig());
  const cause = new Error('database password leaked');
  const error = new TypeError('request failed');
  error.cause = cause;

  client.addBreadcrumb({
    category: 'db',
    message: 'authorization token available',
    data: {
      authorization: 'Bearer secret',
      query: 'select 1'
    }
  });

  const eventId = client.captureException(error, {
    level: 'fatal',
    tenant: 'acme',
    password: 'hidden',
    tags: {
      tenant: 'acme',
      token: 'secret-token'
    }
  });

  assert.match(eventId, /^[a-f0-9-]+$/i);
  assert.equal(client._events.length, 1);

  const event = client._events[0];
  assert.equal(event.type, 'exception');
  assert.equal(event.level, 'fatal');
  assert.equal(event.metadata.project, 'handrail');
  assert.equal(event.tags['handrail.environment'], 'dev');
  assert.equal(event.tags['handrail.service'], 'api');
  assert.equal(event.tags['handrail.release'], 'abc123');
  assert.equal(event.tags.tenant, 'acme');
  assert.equal(event.tags.token, '[Redacted]');
  assert.equal(event.context.password, '[Redacted]');
  assert.equal(event.exception.name, 'TypeError');
  assert.equal(event.exception.message, 'request failed');
  assert.equal(typeof event.exception.stack, 'string');
  assert.equal(Array.isArray(event.exception.frames), true);
  assert.equal(event.exception.cause.message, '[Redacted]');
  assert.equal(event.breadcrumbs[0].message, '[Redacted]');
  assert.equal(event.breadcrumbs[0].data.authorization, '[Redacted]');
  assert.equal(event.breadcrumbs[0].data.query, 'select 1');
});

test('Express error handler captures request context and delegates the original error', () => {
  const client = handrail.createClient(completeConfig());
  const errorHandler = handrail.expressErrorHandler(client);
  const error = new Error('route failed');
  error.status = 503;
  const req = {
    id: 'req-789',
    method: 'PATCH',
    originalUrl: '/users/42?api_key=secret',
    path: '/users/42',
    baseUrl: '/api',
    route: { path: '/users/:id' },
    headers: {},
    handrailTags: {
      tenant: 'acme'
    }
  };
  const res = createMockResponse();
  let delegatedError = null;

  errorHandler(error, req, res, (nextError) => {
    delegatedError = nextError;
  });

  assert.equal(delegatedError, error);
  assert.equal(client._events.length, 1);

  const event = client._events[0];
  assert.equal(event.type, 'exception');
  assert.equal(event.request.id, 'req-789');
  assert.equal(event.request.method, 'PATCH');
  assert.equal(event.request.path, '/users/42');
  assert.equal(event.request.route, '/api/users/:id');
  assert.equal(event.request.statusCode, 503);
  assert.equal(event.context.response.statusCode, 503);
  assert.equal(event.context.mechanism, 'express');
  assert.equal(event.tags['http.method'], 'PATCH');
  assert.equal(event.tags['http.route'], '/api/users/:id');
  assert.equal(event.tags['http.status_code'], '503');
  assert.equal(event.tags['exception.mechanism'], 'express');
  assert.equal(event.tags['exception.handled'], 'true');
  assert.equal(event.tags.tenant, 'acme');
});

test('process-level unhandled capture is opt-in and removable', async () => {
  const client = handrail.createClient({
    ...completeConfig(),
    fetch: async () => ({ ok: true, status: 202 })
  });
  const fakeProcess = new EventEmitter();
  fakeProcess.supportsUncaughtExceptionMonitor = true;

  assert.equal(client.installProcessErrorHandlers(fakeProcess), true);
  assert.equal(client.installProcessErrorHandlers(fakeProcess), false);
  assert.equal(fakeProcess.listenerCount('unhandledRejection'), 1);
  assert.equal(fakeProcess.listenerCount('uncaughtExceptionMonitor'), 1);

  fakeProcess.emit('unhandledRejection', 'promise failed');
  fakeProcess.emit('uncaughtExceptionMonitor', new Error('uncaught failed'));

  assert.equal(client._events.length, 2);
  assert.equal(client._events[0].exception.name, 'NonError');
  assert.equal(client._events[0].exception.message, 'promise failed');
  assert.equal(client._events[0].tags['exception.mechanism'], 'unhandledRejection');
  assert.equal(client._events[0].tags['exception.handled'], 'false');
  assert.equal(client._events[1].exception.message, 'uncaught failed');
  assert.equal(client._events[1].tags['exception.mechanism'], 'uncaughtException');

  assert.equal(client.uninstallProcessErrorHandlers(), true);
  assert.equal(fakeProcess.listenerCount('unhandledRejection'), 0);
  assert.equal(fakeProcess.listenerCount('uncaughtExceptionMonitor'), 0);

  fakeProcess.emit('unhandledRejection', new Error('ignored after uninstall'));
  assert.equal(client._events.length, 2);

  await client.shutdown();
});
