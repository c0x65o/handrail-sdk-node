const assert = require('node:assert/strict');
const test = require('node:test');

const handrail = require('../src/index.cjs');
const packageJson = require('../package.json');

function completeConfig(overrides = {}) {
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

function eventForKind(eventKind) {
  const event = {
    type: eventKind,
    observedAt: '2026-06-06T15:00:00.000Z',
    path: '/publishing/123456?utm_source=indie-news&token=secret',
    visitorId: 'visitor-1',
    sessionId: 'session-1'
  };

  if (eventKind === 'custom_event') {
    event.eventName = 'publishing_form_started';
  }
  if (eventKind === 'conversion') {
    event.eventName = 'signup_completed';
    event.conversion = {
      conversionName: 'signup_completed'
    };
  }
  if (eventKind === 'experiment_exposure') {
    event.experiment = {
      experimentKey: 'checkout-copy',
      variantKey: 'short-copy'
    };
  }
  if (eventKind === 'screen_view') {
    event.route = {
      screenName: 'PublishingScreen',
      screenClass: 'PublishingActivity'
    };
  }
  if (eventKind === 'session_start') {
    event.session = {
      sessionId: 'session-1',
      startedAt: '2026-06-06T14:59:00.000Z',
      sequenceIndex: 1
    };
  }
  if (eventKind === 'session_end') {
    event.session = {
      sessionId: 'session-1',
      endedAt: '2026-06-06T15:30:00.000Z',
      durationMs: 1_800_000,
      sequenceIndex: 2
    };
  }

  return event;
}

function assertNoRuntimeSignalFields(payload) {
  for (const key of [
    'type',
    'event_type',
    'method',
    'status_code',
    'duration_ms',
    'transaction',
    'exception',
    'message',
    'span',
    'breadcrumbs',
    'contexts',
    'tags',
    'apm_token'
  ]) {
    assert.equal(payload[key], undefined);
  }
}

test('analytics builder preserves the full Product Signals event-kind set', () => {
  const config = completeConfig();
  const expectedKinds = [
    'page_view',
    'route_view',
    'screen_view',
    'session_start',
    'session_end',
    'custom_event',
    'conversion',
    'experiment_exposure'
  ];

  for (const eventKind of expectedKinds) {
    const payload = handrail.buildAnalyticsPayload(eventForKind(eventKind), config);

    assert.equal(payload.event_kind, eventKind);
    assert.equal(payload.schema_version, 1);
    assert.match(payload.event_id, /^hrae_[a-f0-9]{32}$/);
    assert.equal(payload.dedupe_key, payload.event_id);
    assert.equal(payload.source.analytics_source_id, 'src_node_123');
    assert.equal(payload.source.sdk_name, '@handrail/sdk-node');
    assert.equal(payload.source.sdk_version, packageJson.version);
    assertNoRuntimeSignalFields(payload);
  }
});

test('analytics builder preserves nested payload blocks and sanitizes Product Signals fields', () => {
  const config = completeConfig();
  const input = {
    type: 'page',
    observedAt: '2026-06-06T15:00:00.000Z',
    receivedAt: '2026-06-06T15:00:01.000Z',
    url: 'https://www.hitcents.test/publishing/123456?utm_source=indie-news&utm_campaign=launch&email=alice@example.com&token=secret#submit',
    route: {
      pageGroup: 'publishing_funnel',
      routeName: 'Publishing Detail',
      screenName: 'PublishingScreen',
      screenClass: 'PublishingActivity',
      referrerUrl: 'https://referrer.example/articles/game-publishing?token=ref-secret#comments'
    },
    visitorId: 'visitor-1',
    session: {
      sessionId: 'session-1',
      sequenceIndex: 3,
      startedAt: '2026-06-06T14:45:00.000Z',
      durationMs: 900_000
    },
    client: {
      browserFamily: 'Chrome',
      osFamily: 'macOS',
      deviceFamily: 'Mac',
      deviceType: 'desktop',
      viewportWidth: 1440,
      viewportHeight: 900,
      screenWidth: 2880,
      screenHeight: 1800,
      locale: 'en-US',
      timeZone: 'America/Chicago'
    },
    geo: {
      countryCode: 'US',
      regionCode: 'KY',
      regionName: 'Kentucky',
      continentCode: 'NA',
      ipAddress: '192.0.2.10'
    },
    release: {
      deploymentId: 'deploy-1',
      commitSha: 'abcdef123456',
      appVersion: '1.2.3'
    },
    conversion: {
      conversionName: 'publishing_lead_view',
      conversionType: 'lead',
      value: '25',
      currency: 'usd'
    },
    experiment: {
      experimentKey: 'checkout-copy',
      variantKey: 'short-copy',
      assignmentId: 'assign-1',
      exposureId: 'exposure-1',
      assignmentUnit: {
        kind: 'visitor_hash',
        rawVisitorId: 'should-drop'
      },
      traffic: {
        allocation: 0.5
      }
    },
    properties: {
      funnel_step: 'view',
      selected_engine: 'unity',
      email: 'alice@example.com'
    },
    privacy: {
      visitorHashSaltVersion: 'salt-v2',
      queryStringStripped: false,
      fragmentStripped: false,
      routeNormalized: false,
      referrerDomainOnly: false,
      fullIpPersisted: true,
      rawUserAgentPersisted: true,
      rawPayloadPersisted: true
    },
    method: 'GET',
    statusCode: 200,
    durationMs: 34.8
  };

  const first = handrail.buildAnalyticsPayload(input, config);
  const second = handrail.buildAnalyticsPayload(input, config);

  assert.equal(first.schema_version, 1);
  assert.equal(first.event_kind, 'page_view');
  assert.equal(first.observed_at, '2026-06-06T15:00:00.000Z');
  assert.equal(first.received_at, '2026-06-06T15:00:01.000Z');
  assert.equal(first.event_id, second.event_id);
  assert.equal(first.dedupe_key, first.event_id);
  assert.equal(first.project, 'handrail');
  assert.equal(first.service, 'website');
  assert.equal(first.env, 'production');

  assert.deepEqual(first.source, {
    source_kind: 'server',
    analytics_source_id: 'src_node_123',
    sdk_name: '@handrail/sdk-node',
    sdk_version: packageJson.version,
    transport: 'node',
    platform: 'node',
    project: 'handrail',
    service: 'website',
    env: 'production'
  });
  assert.deepEqual(first.visitor, {
    visitor_hash: 'visitor-1',
    salt_version: 'salt-v2'
  });
  assert.deepEqual(first.session, {
    session_hash: 'session-1',
    sequence_index: 3,
    started_at: '2026-06-06T14:45:00.000Z',
    duration_ms: 900000
  });
  assert.equal(first.route.path, '/publishing/123456');
  assert.equal(first.route.normalized_path, '/publishing/:id');
  assert.equal(first.route.page_group, 'publishing_funnel');
  assert.equal(first.route.route_name, 'Publishing Detail');
  assert.equal(first.route.screen_name, 'PublishingScreen');
  assert.equal(first.route.screen_class, 'PublishingActivity');
  assert.match(first.route.route_hash, /^[a-f0-9]{64}$/);
  assert.equal(first.route.referrer_domain, 'referrer.example');
  assert.deepEqual(first.campaign, {
    utm_source: 'indie-news',
    utm_campaign: 'launch'
  });
  assert.deepEqual(first.client, {
    browser_family: 'Chrome',
    os_family: 'macOS',
    device_family: 'Mac',
    device_type: 'desktop',
    viewport_width: 1440,
    viewport_height: 900,
    screen_width: 2880,
    screen_height: 1800,
    locale: 'en-US',
    time_zone: 'America/Chicago'
  });
  assert.deepEqual(first.geo, {
    country_code: 'US',
    region_code: 'KY',
    region_name: 'Kentucky',
    continent_code: 'NA'
  });
  assert.deepEqual(first.release, {
    release: '2026.06.06',
    deployment_id: 'deploy-1',
    commit_sha: 'abcdef123456',
    app_version: '1.2.3'
  });
  assert.deepEqual(first.conversion, {
    conversion_name: 'publishing_lead_view',
    conversion_type: 'lead',
    value: 25,
    currency: 'USD'
  });
  assert.equal(first.experiment.experiment_key, 'checkout-copy');
  assert.equal(first.experiment.variant_key, 'short-copy');
  assert.equal(first.experiment.assignment_id, 'assign-1');
  assert.equal(first.experiment.exposure_id, 'exposure-1');
  assert.deepEqual(first.experiment.assignment_unit, {
    kind: 'visitor_hash'
  });
  assert.deepEqual(first.experiment.traffic, {
    allocation: 0.5
  });
  assert.equal(first.custom.event_name, undefined);
  assert.deepEqual(first.custom.properties, {
    http_method: 'GET',
    http_status: 200,
    duration_ms: 34,
    funnel_step: 'view',
    selected_engine: 'unity'
  });
  assert.deepEqual(first.privacy, {
    query_string_stripped: false,
    fragment_stripped: false,
    route_normalized: false,
    referrer_domain_only: false,
    full_ip_persisted: false,
    raw_user_agent_persisted: false,
    raw_payload_persisted: false,
    silent_client_failures: true,
    visitor_hash_salt_version: 'salt-v2'
  });
  assertNoRuntimeSignalFields(first);
});

test('analytics builder accepts explicit dedupe keys and validates conversion and exposure metadata', () => {
  const config = completeConfig();

  const explicit = handrail.buildAnalyticsPayload({
    type: 'custom_event',
    observedAt: '2026-06-06T15:00:00.000Z',
    eventId: 'event-explicit',
    dedupeKey: 'dedupe-explicit',
    eventName: 'module_opened'
  }, config);

  assert.equal(explicit.event_id, 'event-explicit');
  assert.equal(explicit.dedupe_key, 'dedupe-explicit');
  assert.equal(handrail.buildAnalyticsPayload({
    type: 'custom_event',
    observedAt: '2026-06-06T15:00:00.000Z'
  }, config), null);
  assert.equal(handrail.buildAnalyticsPayload({
    type: 'conversion',
    observedAt: '2026-06-06T15:00:00.000Z'
  }, config), null);
  assert.equal(handrail.buildAnalyticsPayload({
    type: 'experiment_exposure',
    observedAt: '2026-06-06T15:00:00.000Z',
    experiment: {
      experimentKey: 'checkout-copy'
    }
  }, config), null);
});

test('captureAnalyticsEvent enqueues all Product Signals kinds without Runtime Signals fields', async () => {
  const client = handrail.createClient({
    ...completeConfig(),
    batchSize: 99
  });
  const expectedKinds = [
    'page_view',
    'route_view',
    'screen_view',
    'session_start',
    'session_end',
    'custom_event',
    'conversion',
    'experiment_exposure'
  ];

  for (const eventKind of expectedKinds) {
    const eventId = client.captureAnalyticsEvent(eventForKind(eventKind));

    assert.match(eventId, /^hrae_[a-f0-9]{32}$/);
  }

  assert.deepEqual(client._analyticsEvents.map((event) => event.event_kind), expectedKinds);
  assert.equal(client._events.length, 0);
  for (const payload of client._analyticsEvents) {
    assert.equal(payload.schema_version, 1);
    assertNoRuntimeSignalFields(payload);
  }

  await client.shutdown();
});
