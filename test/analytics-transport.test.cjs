const assert = require('node:assert/strict');
const test = require('node:test');

const handrail = require('../src/index.cjs');
const { createFakeAnalyticsFetchIntake } = require('./support/fake-analytics-intake.cjs');

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

test('track, trackConversion, and page enqueue Product Signals while Runtime Signals are disabled', async () => {
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
    route: { pageGroup: 'publishing_funnel' }
  });

  assert.equal(client.isEnabled(), false);
  assert.match(trackId, /^hrae_[a-f0-9]{32}$/);
  assert.match(conversionId, /^hrae_[a-f0-9]{32}$/);
  assert.match(pageId, /^hrae_[a-f0-9]{32}$/);
  assert.equal(client.getStats().pending, 0);
  assert.equal(client.getAnalyticsStats().pending, 3);

  assert.equal(await client.flush(), true);
  assert.equal(intake.requests.length, 3);
  for (const request of intake.requests) {
    assert.equal(request.url, 'https://handrail.example.test/api/analytics/ingest');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers['x-handrail-analytics-key'], 'analytics-write-key');
    assert.equal(request.headers.authorization, 'Bearer analytics-write-key');
    assert.equal(request.headers['x-handrail-apm-token'], undefined);
    assert.equal(request.body.key, 'analytics-write-key');
    assert.equal(request.body.event_type, undefined);
    assert.equal(request.body.event.event_type, undefined);
  }

  const track = intake.requests[0].body.event;
  assert.equal(track.event_kind, 'custom_event');
  assert.equal(track.event_id, trackId);
  assert.equal(track.custom.event_name, 'publishing_form_started');
  assert.equal(track.custom.properties.selected_engine, 'unity');
  assert.equal(track.custom.properties.email, undefined);
  assert.equal(track.route.path, '/publishing');
  assert.equal(track.source.analytics_source_id, 'src_node_123');
  assert.equal(track.source.sdk_name, '@handrail/sdk-node');

  const conversion = intake.requests[1].body.event;
  assert.equal(conversion.event_kind, 'conversion');
  assert.equal(conversion.conversion.conversion_name, 'publishing_form_submitted');
  assert.equal(conversion.conversion.value, 25);
  assert.equal(conversion.conversion.currency, 'USD');

  const page = intake.requests[2].body.event;
  assert.equal(page.event_kind, 'page_view');
  assert.equal(page.event_id, pageId);
  assert.equal(page.route.path, '/publishing');
  assert.equal(page.route.page_group, 'publishing_funnel');
  assert.deepEqual(page.campaign, { utm_source: 'newsletter' });

  await client.shutdown();
});

test('assignExperiment posts durable assignment with analytics transport and no exposure event', async () => {
  const posts = [];
  const client = handrail.createClient(analyticsConfig({
    enabled: true,
    endpoint: 'https://handrail.example.test/api/apm/events',
    token: 'apm-token-secret',
    analytics: {
      ...analyticsConfig().analytics,
      assignmentEndpoint: 'https://handrail.example.test/api/analytics/experiments/assign',
      sourceKind: 'server',
      serviceEnv: 'service_env_1'
    },
    fetch: async (url, init = {}) => {
      posts.push({
        url,
        method: init.method,
        headers: init.headers,
        body: JSON.parse(init.body)
      });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          accepted: true,
          assignment: {
            assignment_id: 'assignment_1',
            experiment_id: 'experiment_1',
            experiment_key: 'checkout-copy',
            variant_id: 'variant_control',
            variant_key: 'control',
            assignment_bucket: 123456,
            assignment_unit_hash: 'assignment_unit_hash_1234567890',
            traffic: { in_experiment: true },
            override_metadata: { version: 1, matched: false, applied: false },
            in_experiment: true
          },
          privacy: { exposure_recorded: false }
        })
      };
    }
  }));

  const assignment = await client.assignExperiment('checkout-copy', {
    visitorHash: 'visitor_hash_assignment_1234567890',
    routeHash: 'route_hash_assignment_1234567890',
    pageGroup: 'checkout'
  });

  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'https://handrail.example.test/api/analytics/experiments/assign');
  assert.equal(posts[0].method, 'POST');
  assert.equal(posts[0].headers['x-handrail-analytics-key'], 'analytics-write-key');
  assert.equal(posts[0].headers.authorization, 'Bearer analytics-write-key');
  assert.equal(posts[0].headers['x-handrail-apm-token'], undefined);
  assert.equal(JSON.stringify(posts[0].body).includes('apm-token-secret'), false);
  assert.equal(posts[0].body.key, 'analytics-write-key');
  assert.equal(posts[0].body.source_id, 'src_node_123');
  assert.equal(posts[0].body.project_id, 'handrail');
  assert.equal(posts[0].body.service_env_id, 'service_env_1');
  assert.equal(posts[0].body.experiment_key, 'checkout-copy');
  assert.equal(posts[0].body.visitor_hash, 'visitor_hash_assignment_1234567890');
  assert.equal(posts[0].body.visitor_id, undefined);
  assert.equal(assignment.assignmentId, 'assignment_1');
  assert.equal(assignment.variantKey, 'control');
  assert.equal(assignment.privacy.exposure_recorded, false);
  assert.equal(client.getAnalyticsStats().queued, 0);
  assert.equal(client._analyticsEvents.some((event) => event.event_kind === 'experiment_exposure'), false);
  assert.equal(await client.flush(), true);
  assert.equal(posts.length, 1);

  await client.shutdown();
});

test('durable assignment metadata flows into explicit exposure and conversion helpers', async () => {
  const assignmentPosts = [];
  const ingestPosts = [];
  const client = handrail.createClient(analyticsConfig({
    batchSize: 99,
    analytics: {
      ...analyticsConfig().analytics,
      assignmentEndpoint: 'https://handrail.example.test/api/analytics/experiments/assign',
      serviceEnv: 'service_env_1'
    },
    fetch: async (url, init = {}) => {
      const body = JSON.parse(init.body);
      if (String(url).includes('/experiments/assign')) {
        assignmentPosts.push({ url, headers: init.headers, body });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            accepted: true,
            assignment: {
              assignment_id: 'assignment_1',
              experiment_id: 'experiment_1',
              experiment_key: 'checkout-copy',
              variant_id: 'variant_control',
              variant_key: 'control',
              assignment_algorithm: 'weighted_hash_mod',
              assignment_algorithm_version: 'v1',
              assignment_bucket: 123456,
              assignment_unit_hash: 'unit_hash_123',
              assignment_unit: {
                kind: 'visitor',
                hash: 'unit_hash_123',
                visitor_id: 'raw-visitor-id'
              },
              traffic: { in_experiment: true, allocation: 0.5 },
              override_metadata: {
                version: 1,
                matched: true,
                applied: true,
                cohort_id: 'cohort_preview',
                visitor_id: 'raw-visitor',
                headers: { cookie: 'secret' },
                url: 'https://example.test/checkout?token=secret'
              },
              in_experiment: true
            },
            privacy: { exposure_recorded: false }
          })
        };
      }
      ingestPosts.push({ url, headers: init.headers, body });
      return { ok: true, status: 202, json: async () => ({ ok: true }) };
    }
  }));

  const assignment = await client.assignExperiment('checkout-copy', {
    visitorHash: 'visitor_hash_assignment_1234567890'
  });
  const exposureId = client.trackExperimentExposure(assignment, {
    surface: 'checkout_hero'
  }, {
    observedAt: '2026-06-06T18:00:03.000Z',
    exposureId: 'exposure_1',
    path: '/checkout?token=secret'
  });
  assignment.conversion('signup_completed', {
    funnel_id: 'signup'
  }, {
    observedAt: '2026-06-06T18:00:04.000Z',
    conversionId: 'conversion_1',
    conversionType: 'funnel_step',
    value: 99,
    currency: 'usd'
  });

  assert.match(exposureId, /^hrae_[a-f0-9]{32}$/);
  assert.equal(client.getAnalyticsStats().pending, 2);
  assert.equal(await client.flush(), true);
  assert.equal(assignmentPosts.length, 1);
  assert.equal(ingestPosts.length, 2);

  const exposure = ingestPosts[0].body.event;
  assert.equal(exposure.event_kind, 'experiment_exposure');
  assert.equal(exposure.experiment.experiment_id, 'experiment_1');
  assert.equal(exposure.experiment.variant_key, 'control');
  assert.equal(exposure.experiment.assignment_id, 'assignment_1');
  assert.equal(exposure.experiment.exposure_id, 'exposure_1');
  assert.equal(exposure.experiment.assignment_unit.hash, 'unit_hash_123');
  assert.equal(exposure.experiment.assignment_unit.visitor_id, undefined);
  assert.equal(exposure.experiment.override_metadata.cohort_id, 'cohort_preview');
  assert.equal(exposure.experiment.override_metadata.visitor_id, undefined);
  assert.equal(exposure.experiment.override_metadata.headers, undefined);
  assert.equal(exposure.experiment.override_metadata.url, undefined);
  assert.equal(JSON.stringify(exposure.experiment.override_metadata).includes('raw-visitor'), false);
  assert.equal(JSON.stringify(exposure.experiment.override_metadata).includes('token=secret'), false);

  const conversion = ingestPosts[1].body.event;
  assert.equal(conversion.event_kind, 'conversion');
  assert.equal(conversion.conversion.conversion_id, 'conversion_1');
  assert.equal(conversion.conversion.conversion_name, 'signup_completed');
  assert.equal(conversion.conversion.value, 99);
  assert.equal(conversion.conversion.currency, 'USD');
  assert.equal(conversion.experiment.assignment_id, 'assignment_1');

  await client.shutdown();
});

test('analytics helpers stay quiet when disabled, cap queues, and keep retryable events queued', async () => {
  let fetchCalls = 0;
  const disabled = handrail.createClient({
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
  assert.equal(disabled.track('ignored'), null);
  assert.equal(disabled.trackConversion('ignored'), null);
  assert.equal(disabled.page('/ignored'), null);
  assert.equal(await disabled.flush(), true);
  assert.equal(fetchCalls, 0);

  const intake = createFakeAnalyticsFetchIntake();
  const capped = handrail.createClient(analyticsConfig({
    maxQueueSize: 2,
    fetch: intake.fetch
  }));
  capped.track('one');
  capped.track('two');
  capped.track('three');
  assert.equal(capped.getAnalyticsStats().dropped, 1);
  assert.equal(await capped.flush(), true);
  assert.deepEqual(intake.requests.map((request) => request.body.event.custom.event_name), ['two', 'three']);
  await capped.shutdown();

  const offlineIntake = createFakeAnalyticsFetchIntake({ responses: [503] });
  const offline = handrail.createClient(analyticsConfig({
    maxRetries: 0,
    fetch: offlineIntake.fetch
  }));
  const eventId = offline.track('offline_event');
  assert.equal(await offline.flush({ timeoutMs: 50 }), false);
  assert.equal(offlineIntake.requests[0].body.event.event_id, eventId);
  assert.equal(offline.getAnalyticsStats().pending, 1);
  assert.equal(offline.getAnalyticsStats().failedBatches, 1);
  assert.equal(offline.getAnalyticsStats().failedRequests, 1);
  await offline.shutdown({ timeoutMs: 50 });
});
