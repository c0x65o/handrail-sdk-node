const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const handrail = require('../src/index.cjs');

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
    ...overrides
  };
}

function createMockResponse() {
  const res = new EventEmitter();
  res.statusCode = 200;
  res.locals = {};
  return res;
}

test('request hooks scrub URL, query params, headers, and tags before built-in redaction', () => {
  const client = handrail.createClient(completeConfig({
    scrubberConfig: {
      headers: ['x-custom-secret'],
      queryParams: ['customer'],
      tags: ['tenant_secret']
    },
    scrubHeaders: (headers) => ({
      ...headers,
      authorization: 'Bearer should-not-leak',
      'x-custom-secret': 'hidden',
      'x-public': 'kept'
    }),
    scrubUrl: (url) => String(url).replace('/users/42', '/users/:id'),
    scrubQueryParams: (params) => ({
      ...params,
      customer: 'hidden',
      visible: 'shown'
    }),
    scrubTags: (tags) => ({
      ...tags,
      tenant: 'acme',
      tenant_secret: 'hidden'
    })
  }));
  const middleware = handrail.expressMiddleware(client);
  const req = {
    method: 'GET',
    originalUrl: '/users/42?token=secret&customer=123',
    path: '/users/42',
    headers: {
      authorization: 'Bearer secret',
      'x-custom-secret': 'secret',
      'x-public': 'ok'
    },
    handrailTags: {
      tenant_secret: 'secret'
    }
  };
  const res = createMockResponse();

  middleware(req, res, () => {});
  res.statusCode = 200;
  res.emit('finish');

  assert.equal(client._events.length, 1);
  const event = client._events[0];
  assert.equal(event.request.path, '/users/:id');
  assert.equal(event.request.url, '/users/:id?token=%5BRedacted%5D&customer=%5BRedacted%5D');
  assert.equal(event.request.queryParams.token, '[Redacted]');
  assert.equal(event.request.queryParams.customer, '[Redacted]');
  assert.equal(event.request.queryParams.visible, 'shown');
  assert.equal(event.request.headers.authorization, '[Redacted]');
  assert.equal(event.request.headers['x-custom-secret'], '[Redacted]');
  assert.equal(event.request.headers['x-public'], 'kept');
  assert.equal(event.tags.tenant, 'acme');
  assert.equal(event.tags.tenant_secret, '[Redacted]');
});

test('message, breadcrumb, and tag hooks cannot bypass built-in sensitive-key redaction', () => {
  const client = handrail.createClient(completeConfig({
    scrubberConfig: {
      messages: ['internal-code'],
      tags: ['custom_secret']
    },
    scrubMessage: (message, context) => {
      if (context.field === 'breadcrumb.message') return 'internal-code';
      return String(message).replace('public', 'internal-code');
    },
    scrubBreadcrumb: (breadcrumb) => ({
      ...breadcrumb,
      data: {
        ...breadcrumb.data,
        password: 'not allowed'
      }
    }),
    scrubTags: (tags) => ({
      ...tags,
      custom_secret: 'not allowed',
      authorization: 'not allowed'
    })
  }));

  client.addBreadcrumb({
    message: 'public breadcrumb',
    data: { safe: 'ok' }
  });
  client.captureMessage('public message', {
    tags: { safe: 'ok' }
  });

  assert.equal(client._events.length, 1);
  const event = client._events[0];
  assert.equal(event.message, '[Redacted]');
  assert.equal(event.breadcrumbs[0].message, '[Redacted]');
  assert.equal(event.breadcrumbs[0].data.password, '[Redacted]');
  assert.equal(event.tags.custom_secret, '[Redacted]');
  assert.equal(event.tags.authorization, '[Redacted]');
  assert.equal(event.tags.safe, undefined);
});

test('sampler hooks and env sample rates control Runtime Signals capture', () => {
  const client = handrail.createClient(completeConfig({
    sampleRate: 1,
    requestSampler: (event) => event.transaction && event.transaction.statusCode >= 500,
    exceptionSampler: () => false,
    spanSampler: (event) => event.span && event.span.op === 'db'
  }));

  assert.equal(client.captureEvent({
    type: 'transaction',
    transaction: { statusCode: 200 }
  }), null);
  assert.match(client.captureEvent({
    type: 'transaction',
    transaction: { statusCode: 503 }
  }), /^[a-f0-9-]+$/i);
  assert.equal(client.captureException(new Error('drop me')), null);
  assert.equal(client.captureSpan({ op: 'cache' }), null);
  assert.match(client.captureSpan({ op: 'db' }), /^[a-f0-9-]+$/i);
  assert.equal(client._events.length, 2);
  assert.equal(client._events[1].type, 'span');

  const sampledOut = handrail.createClient(handrail.loadConfigFromEnv({
    HANDRAIL_APM_ENABLED: 'true',
    HANDRAIL_APM_ENDPOINT: 'https://handrail.example.test/api/apm/events',
    HANDRAIL_APM_TOKEN: 'token-test',
    HANDRAIL_PROJECT: 'handrail',
    HANDRAIL_ENV: 'dev',
    HANDRAIL_SERVICE: 'api',
    HANDRAIL_APM_SPAN_SAMPLE_RATE: '0'
  }));
  assert.equal(sampledOut.captureSpan({ op: 'db' }), null);
});

test('span payload includes sanitized span metadata', async () => {
  const calls = [];
  const client = handrail.createClient(completeConfig({
    fetch: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return { ok: true, status: 202 };
    }
  }));

  client.captureSpan({
    op: 'db',
    description: 'select users',
    token: 'secret'
  });

  assert.equal(await client.flush(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].event_type, 'span');
  assert.equal(calls[0].event_metadata_json.span.op, 'db');
  assert.equal(calls[0].event_metadata_json.span.token, '[Redacted]');

  await client.shutdown();
});
