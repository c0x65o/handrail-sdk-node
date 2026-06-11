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

test('manual captureException records normalized details, metadata, tags, context, and redacted breadcrumbs', () => {
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
  assert.equal(event.metadata.environment, 'dev');
  assert.equal(event.metadata.service, 'api');
  assert.equal(event.metadata.release, 'abc123');
  assert.equal(event.tags['handrail.project'], 'handrail');
  assert.equal(event.tags['handrail.environment'], 'dev');
  assert.equal(event.tags['handrail.service'], 'api');
  assert.equal(event.tags['handrail.release'], 'abc123');
  assert.equal(event.tags.tenant, 'acme');
  assert.equal(event.tags.token, '[Redacted]');
  assert.equal(event.context.tenant, 'acme');
  assert.equal(event.context.password, '[Redacted]');
  assert.equal(event.exception.name, 'TypeError');
  assert.equal(event.exception.message, 'request failed');
  assert.equal(typeof event.exception.stack, 'string');
  assert.equal(Array.isArray(event.exception.frames), true);
  assert.equal(event.exception.cause.name, 'Error');
  assert.equal(event.exception.cause.message, '[Redacted]');
  assert.equal(event.breadcrumbs.length, 1);
  assert.equal(event.breadcrumbs[0].category, 'db');
  assert.equal(event.breadcrumbs[0].message, '[Redacted]');
  assert.equal(event.breadcrumbs[0].data.authorization, '[Redacted]');
  assert.equal(event.breadcrumbs[0].data.query, 'select 1');
});

test('addBreadcrumb stores bounded sanitized breadcrumbs used by captureMessage', () => {
  const client = handrail.createClient(completeConfig({
    maxBreadcrumbs: 2
  }));

  client.addBreadcrumb({
    category: 'old',
    message: 'first breadcrumb',
    data: {
      safe: 'older'
    }
  });
  client.addBreadcrumb({
    category: 'auth',
    message: 'authorization token available',
    data: {
      password: 'secret',
      safe: 'kept'
    }
  });
  client.addBreadcrumb({
    category: 'ui',
    message: 'ready',
    data: {
      token: 'secret',
      count: 2
    }
  });

  assert.deepEqual(
    client.getBreadcrumbs().map((breadcrumb) => breadcrumb.category),
    ['auth', 'ui']
  );

  const eventId = client.captureMessage('user-visible status', {
    level: 'warning',
    safe: 'ok',
    password: 'hidden'
  });

  assert.match(eventId, /^[a-f0-9-]+$/i);
  assert.equal(client._events.length, 1);

  const event = client._events[0];
  assert.equal(event.type, 'message');
  assert.equal(event.level, 'warning');
  assert.equal(event.message, 'user-visible status');
  assert.equal(event.context.safe, 'ok');
  assert.equal(event.context.password, '[Redacted]');
  assert.equal(event.breadcrumbs.length, 2);
  assert.equal(event.breadcrumbs[0].category, 'auth');
  assert.equal(event.breadcrumbs[0].message, '[Redacted]');
  assert.equal(event.breadcrumbs[0].data.password, '[Redacted]');
  assert.equal(event.breadcrumbs[0].data.safe, 'kept');
  assert.equal(event.breadcrumbs[1].category, 'ui');
  assert.equal(event.breadcrumbs[1].message, 'ready');
  assert.equal(event.breadcrumbs[1].data.token, '[Redacted]');
  assert.equal(event.breadcrumbs[1].data.count, 2);
});

test('message, breadcrumb, and tag hooks cannot bypass built-in sensitive-key redaction', () => {
  const client = handrail.createClient(completeConfig({
    scrubberConfig: {
      messages: ['internal-code'],
      tags: ['custom_secret']
    },
    scrubMessage: (message, context) => {
      if (context.field === 'breadcrumb.message') {
        return 'internal-code';
      }
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
    data: {
      safe: 'ok'
    }
  });
  client.captureMessage('public message', {
    tags: {
      safe: 'ok'
    }
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

test('captureEvent and captureSpan respect Runtime Signals allowlists, samplers, and span sanitization', async () => {
  const calls = [];
  const client = handrail.createClient(completeConfig({
    allowedEventTypes: ['transaction', 'span'],
    requestSampler: (event) => event.transaction && event.transaction.statusCode >= 500,
    spanSampler: (event) => event.span && event.span.op === 'db',
    fetch: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return { ok: true, status: 202 };
    }
  }));

  assert.equal(client.captureEvent({
    type: 'message',
    message: 'not allowed'
  }), null);
  assert.equal(client.captureEvent({
    type: 'transaction',
    transaction: {
      statusCode: 200
    }
  }), null);
  assert.match(client.captureEvent({
    type: 'transaction',
    transaction: {
      method: 'GET',
      path: '/health',
      statusCode: 503,
      durationMs: 12
    }
  }), /^[a-f0-9-]+$/i);
  assert.equal(client.captureSpan({
    op: 'cache',
    token: 'secret'
  }), null);
  assert.match(client.captureSpan({
    op: 'db',
    description: 'select users',
    token: 'secret'
  }, {
    context: {
      password: 'hidden',
      safe: 'ok'
    },
    tags: {
      tenant: 'acme'
    }
  }), /^[a-f0-9-]+$/i);

  assert.equal(client._events.length, 2);
  assert.equal(client._events[0].type, 'transaction');
  assert.equal(client._events[1].type, 'span');
  assert.equal(client._events[1].span.op, 'db');
  assert.equal(client._events[1].span.description, 'select users');
  assert.equal(client._events[1].span.token, '[Redacted]');
  assert.equal(client._events[1].context.password, '[Redacted]');
  assert.equal(client._events[1].context.safe, 'ok');
  assert.equal(client._events[1].tags.tenant, 'acme');

  assert.equal(await client.flush(), true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].event_type, 'request');
  assert.equal(calls[1].event_type, 'span');
  assert.equal(calls[1].event_metadata_json.span.op, 'db');
  assert.equal(calls[1].event_metadata_json.span.token, '[Redacted]');
  assert.equal(calls[1].event_metadata_json.context.password, '[Redacted]');
});

test('span sample rate is parsed from env and drops span events', () => {
  const config = handrail.loadConfigFromEnv({
    HANDRAIL_APM_ENABLED: 'true',
    HANDRAIL_APM_ENDPOINT: 'https://handrail.example.test/api/apm/events',
    HANDRAIL_APM_TOKEN: 'token-test',
    HANDRAIL_PROJECT: 'handrail',
    HANDRAIL_ENV: 'dev',
    HANDRAIL_SERVICE: 'api',
    HANDRAIL_APM_SPAN_SAMPLE_RATE: '0'
  });
  const client = handrail.createClient(config);

  assert.equal(config.spanSampleRate, 0);
  assert.equal(client.captureSpan({ op: 'db' }), null);
  assert.equal(client._events.length, 0);
});

test('Runtime capture APIs and process handler install are disabled-safe', () => {
  const client = handrail.createClient({
    ...completeConfig(),
    enabled: false
  });
  const fakeProcess = new EventEmitter();

  assert.equal(client.isEnabled(), false);
  assert.equal(client.captureEvent({ type: 'message', message: 'ignored' }), null);
  assert.equal(client.captureException(new Error('ignored')), null);
  assert.equal(client.captureMessage('ignored'), null);
  assert.equal(client.captureSpan({ op: 'db' }), null);
  assert.equal(client.installProcessErrorHandlers(fakeProcess), false);
  assert.equal(fakeProcess.listenerCount('unhandledRejection'), 0);
  assert.equal(client._events.length, 0);

  assert.doesNotThrow(() => client.addBreadcrumb({
    message: 'kept for later context',
    data: {
      token: 'secret'
    }
  }));
  assert.equal(client._events.length, 0);
});

test('process-level unhandled capture is opt-in, idempotent, and removable for monitor-capable processes', async () => {
  const client = handrail.createClient(completeConfig({
    fetch: async () => ({ ok: true, status: 202 })
  }));
  const fakeProcess = new EventEmitter();
  fakeProcess.supportsUncaughtExceptionMonitor = true;
  let preexistingRejections = 0;
  let preexistingMonitorExceptions = 0;
  const preexistingRejectionHandler = () => {
    preexistingRejections += 1;
  };
  const preexistingExceptionHandler = () => {
    preexistingMonitorExceptions += 1;
  };
  fakeProcess.on('unhandledRejection', preexistingRejectionHandler);
  fakeProcess.on('uncaughtExceptionMonitor', preexistingExceptionHandler);

  assert.equal(client.installProcessErrorHandlers(fakeProcess), true);
  assert.equal(client.installProcessErrorHandlers(fakeProcess), false);
  assert.equal(fakeProcess.listenerCount('unhandledRejection'), 2);
  assert.equal(fakeProcess.listenerCount('uncaughtExceptionMonitor'), 2);
  assert.equal(fakeProcess.listenerCount('uncaughtException'), 0);

  fakeProcess.emit('unhandledRejection', 'promise failed');
  fakeProcess.emit('uncaughtExceptionMonitor', new Error('uncaught failed'));

  assert.equal(preexistingRejections, 1);
  assert.equal(preexistingMonitorExceptions, 1);
  assert.equal(client._events.length, 2);
  assert.equal(client._events[0].exception.name, 'NonError');
  assert.equal(client._events[0].exception.message, 'promise failed');
  assert.equal(client._events[0].tags['exception.mechanism'], 'unhandledRejection');
  assert.equal(client._events[0].tags['exception.handled'], 'false');
  assert.equal(client._events[1].exception.message, 'uncaught failed');
  assert.equal(client._events[1].tags['exception.mechanism'], 'uncaughtException');
  assert.equal(client._events[1].tags['exception.handled'], 'false');

  assert.equal(client.uninstallProcessErrorHandlers(), true);
  assert.equal(client.uninstallProcessErrorHandlers(), false);
  assert.equal(fakeProcess.listenerCount('unhandledRejection'), 1);
  assert.equal(fakeProcess.listenerCount('uncaughtExceptionMonitor'), 1);

  fakeProcess.emit('unhandledRejection', new Error('ignored after uninstall'));
  fakeProcess.emit('uncaughtExceptionMonitor', new Error('ignored after uninstall'));

  assert.equal(preexistingRejections, 2);
  assert.equal(preexistingMonitorExceptions, 2);
  assert.equal(client._events.length, 2);

  fakeProcess.removeListener('unhandledRejection', preexistingRejectionHandler);
  fakeProcess.removeListener('uncaughtExceptionMonitor', preexistingExceptionHandler);
  await client.shutdown();
});

test('process-level capture falls back to uncaughtException when monitor is unavailable', async () => {
  const client = handrail.createClient(completeConfig({
    fetch: async () => ({ ok: true, status: 202 })
  }));
  const fakeProcess = new EventEmitter();
  fakeProcess.supportsUncaughtExceptionMonitor = false;

  assert.equal(client.installProcessErrorHandlers(fakeProcess), true);
  assert.equal(fakeProcess.listenerCount('unhandledRejection'), 1);
  assert.equal(fakeProcess.listenerCount('uncaughtException'), 1);
  assert.equal(fakeProcess.listenerCount('uncaughtExceptionMonitor'), 0);

  fakeProcess.emit('uncaughtException', new Error('fallback uncaught failed'));

  assert.equal(client._events.length, 1);
  assert.equal(client._events[0].exception.message, 'fallback uncaught failed');
  assert.equal(client._events[0].tags['exception.mechanism'], 'uncaughtException');
  assert.equal(client._events[0].tags['exception.handled'], 'false');

  assert.equal(client.uninstallProcessErrorHandlers(), true);
  assert.equal(fakeProcess.listenerCount('unhandledRejection'), 0);
  assert.equal(fakeProcess.listenerCount('uncaughtException'), 0);

  fakeProcess.emit('uncaughtException', new Error('ignored after uninstall'));
  assert.equal(client._events.length, 1);

  await client.shutdown();
});
