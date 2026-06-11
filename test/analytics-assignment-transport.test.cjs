const assert = require('node:assert/strict');
const test = require('node:test');

const handrail = require('../src/index.cjs');

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)])
  );
}

function responseFromSpec(spec) {
  const status = spec.status || 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return spec.body;
    },
    async text() {
      return typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body || {});
    }
  };
}

function createFakeFetch({ responses = [{ status: 200, body: assignmentResponse() }] } = {}) {
  const requests = [];
  const planned = [...responses];
  let index = 0;

  return {
    requests,
    fetch: async (url, init = {}) => {
      const response = planned[Math.min(index, planned.length - 1)];
      index += 1;
      const request = {
        url: String(url),
        method: init.method || 'GET',
        headers: normalizeHeaders(init.headers),
        body: init.body ? JSON.parse(String(init.body)) : {}
      };
      requests.push(request);
      if (response instanceof Error) {
        throw response;
      }
      return responseFromSpec(response);
    }
  };
}

function analyticsConfig(overrides = {}) {
  const base = handrail.loadConfigFromEnv({
    HANDRAIL_APM_ENABLED: 'false',
    HANDRAIL_PROJECT: 'handrail',
    HANDRAIL_ENV: 'production',
    HANDRAIL_SERVICE: 'website',
    HANDRAIL_RELEASE: '2026.06.06',
    HANDRAIL_ANALYTICS_ENABLED: 'true',
    HANDRAIL_ANALYTICS_ENDPOINT: 'https://handrail.example.test/api/analytics/ingest',
    HANDRAIL_ANALYTICS_KEY: 'analytics-write-key',
    HANDRAIL_ANALYTICS_SOURCE_ID: 'src_node_123'
  });

  return {
    ...base,
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

function assignmentResponse(overrides = {}) {
  return {
    accepted: true,
    assignment: {
      assignment_id: 'assignment_1',
      experiment_id: 'experiment_1',
      experiment_key: 'checkout-copy',
      variant_id: 'variant_control',
      variant_key: 'control',
      assignment_scope: overrides.assignment_scope || 'visitor',
      assignment_algorithm: 'weighted_hash_mod',
      assignment_algorithm_version: 'v1',
      assignment_bucket: 123456,
      assignment_unit_hash: 'assignment_unit_hash_1234567890',
      source_scope: {
        source_id: 'src_node_123',
        project_id: 'handrail',
        service_id: 'website',
        service_env_id: 'service_env_1',
        env: 'production',
        source_kind: 'server'
      },
      traffic: {
        in_experiment: true
      },
      override_metadata: {
        version: 1,
        matched: false,
        applied: false,
        status: 'no_match',
        target_type: 'default',
        precedence: 'deterministic_weighted_hash_mod',
        precedence_reason: 'no_active_unexpired_scoped_operator_override',
        target_variant: null,
        override: null,
        cohort: null,
        privacy: {
          subject_identifiers_returned: false,
          raw_payload_returned: false
        }
      },
      in_experiment: true,
      ...overrides.assignment
    },
    privacy: {
      exposure_recorded: false
    },
    ...overrides.envelope
  };
}

const FORBIDDEN_OVERRIDE_METADATA_KEYS = new Set([
  'assignment_unit',
  'assignment_unit_hash',
  'body',
  'cookie',
  'cookies',
  'header',
  'headers',
  'href',
  'ip',
  'ip_address',
  'payload',
  'query',
  'query_string',
  'raw',
  'raw_payload',
  'request',
  'response',
  'search',
  'session',
  'session_hash',
  'session_id',
  'subject',
  'subject_hash',
  'token',
  'url',
  'user_id',
  'visitor',
  'visitor_hash',
  'visitor_id'
]);

function normalizeMetadataKey(key) {
  return String(key || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function assertNoForbiddenOverrideMetadataKeys(value) {
  if (!value || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      assertNoForbiddenOverrideMetadataKeys(item);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = normalizeMetadataKey(key);
    assert.equal(
      FORBIDDEN_OVERRIDE_METADATA_KEYS.has(normalizedKey),
      false,
      `override_metadata leaked forbidden key ${key}`
    );
    assertNoForbiddenOverrideMetadataKeys(child);
  }
}

test('assignExperiment posts durable assignment with analytics transport and no exposure event', async () => {
  const posts = [];
  const client = handrail.createClient(analyticsConfig({
    enabled: true,
    endpoint: 'https://handrail.example.test/api/apm/events',
    token: 'apm-token-secret',
    analytics: {
      assignmentEndpoint: 'https://handrail.example.test/api/analytics/experiments/assign-custom',
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
        json: async () => assignmentResponse()
      };
    }
  }));

  const assignment = await client.assignExperiment('checkout-copy', {
    visitorHash: 'visitor_hash_assignment_1234567890',
    routeHash: 'route_hash_assignment_1234567890',
    pageGroup: 'checkout',
    campaignName: 'checkout-launch',
    countryCode: 'us',
    deviceType: 'desktop'
  });

  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'https://handrail.example.test/api/analytics/experiments/assign-custom');
  assert.equal(posts[0].method, 'POST');
  assert.equal(posts[0].headers['x-handrail-analytics-key'], 'analytics-write-key');
  assert.equal(posts[0].headers.authorization, 'Bearer analytics-write-key');
  assert.equal(posts[0].headers['x-handrail-apm-token'], undefined);
  assert.equal(JSON.stringify(posts[0].body).includes('apm-token-secret'), false);
  assert.equal(posts[0].body.key, 'analytics-write-key');
  assert.equal(posts[0].body.source_id, 'src_node_123');
  assert.equal(posts[0].body.analytics_source_id, 'src_node_123');
  assert.equal(posts[0].body.project_id, 'handrail');
  assert.equal(posts[0].body.service_id, 'website');
  assert.equal(posts[0].body.service_env_id, 'service_env_1');
  assert.equal(posts[0].body.env, 'production');
  assert.equal(posts[0].body.source_kind, 'server');
  assert.equal(posts[0].body.experiment_key, 'checkout-copy');
  assert.equal(posts[0].body.assignment_scope, 'visitor');
  assert.equal(posts[0].body.visitor_hash, 'visitor_hash_assignment_1234567890');
  assert.equal(posts[0].body.visitor_id, undefined);
  assert.equal(posts[0].body.route_hash, 'route_hash_assignment_1234567890');
  assert.equal(posts[0].body.page_group, 'checkout');

  assert.equal(assignment.assignmentId, 'assignment_1');
  assert.equal(assignment.experimentKey, 'checkout-copy');
  assert.equal(assignment.variantKey, 'control');
  assert.equal(assignment.assignmentBucket, 123456);
  assert.equal(assignment.overrideMetadata.precedence, 'deterministic_weighted_hash_mod');
  assert.equal(assignment.overrideMetadata.precedence_reason, 'no_active_unexpired_scoped_operator_override');
  assert.equal(assignment.overrideMetadata.status, 'no_match');
  assert.equal(assignment.overrideMetadata.target_type, 'default');
  assert.equal(assignment.overrideMetadata.privacy.subject_identifiers_returned, false);
  assert.equal(assignment.privacy.exposure_recorded, false);
  assert.equal(client.getStats().queued, 0);
  assert.equal(client.getStats().pending, 0);
  assert.equal(client.getAnalyticsStats().queued, 0);
  assert.equal(client.getAnalyticsStats().pending, 0);
  assert.equal(client._analyticsEvents.some((event) => event.event_kind === 'experiment_exposure'), false);
  assert.equal(await client.flush(), true);
  assert.equal(posts.length, 1);

  await client.shutdown();
});

test('deterministic no-match fallback override metadata is preserved only on explicit exposure', async () => {
  const assignmentPosts = [];
  const ingestPosts = [];
  const client = handrail.createClient(analyticsConfig({
    batchSize: 99,
    analytics: {
      assignmentEndpoint: 'https://handrail.example.test/api/analytics/experiments/assign',
      sourceKind: 'server',
      serviceEnv: 'service_env_1'
    },
    fetch: async (url, init = {}) => {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      if (String(url).includes('/experiments/assign')) {
        assignmentPosts.push({ url: String(url), body });
        return responseFromSpec({
          status: 200,
          body: assignmentResponse()
        });
      }
      ingestPosts.push({
        url: String(url),
        method: init.method,
        headers: normalizeHeaders(init.headers),
        body
      });
      return responseFromSpec({
        status: 202,
        body: { ok: true }
      });
    }
  }));

  const assignment = await client.assignExperiment('checkout-copy', {
    visitorHash: 'visitor_hash_assignment_1234567890'
  });

  assert.equal(assignmentPosts.length, 1);
  assert.equal(client._analyticsEvents.some((event) => event.event_kind === 'experiment_exposure'), false);
  assert.equal(client.getAnalyticsStats().pending, 0);

  client.trackExperimentExposure(assignment, {
    surface: 'checkout_hero'
  }, {
    observedAt: '2026-06-06T18:00:03.000Z',
    exposureId: 'fallback_exposure_1'
  });

  assert.equal(client.getAnalyticsStats().pending, 1);
  assert.equal(await client.flush(), true);
  assert.equal(ingestPosts.length, 1);

  const metadata = ingestPosts[0].body.event.experiment.override_metadata;
  assert.deepEqual(metadata, {
    version: 1,
    matched: false,
    applied: false,
    status: 'no_match',
    target_type: 'default',
    precedence: 'deterministic_weighted_hash_mod',
    precedence_reason: 'no_active_unexpired_scoped_operator_override',
    target_variant: null,
    override: null,
    cohort: null,
    privacy: {
      subject_identifiers_returned: false,
      raw_payload_returned: false
    }
  });
  assert.equal(ingestPosts[0].body.event.experiment.source_scope.source_id, 'src_node_123');
  assert.equal(ingestPosts[0].body.event.experiment.exposure_id, 'fallback_exposure_1');
  assertNoForbiddenOverrideMetadataKeys(metadata);

  await client.shutdown();
});

test('explicit experiment exposure sends sanitized assignment metadata through analytics transport', async () => {
  const assignmentPosts = [];
  const ingestPosts = [];
  const client = handrail.createClient(analyticsConfig({
    enabled: true,
    endpoint: 'https://handrail.example.test/api/apm/events',
    token: 'apm-token-secret',
    batchSize: 99,
    analytics: {
      assignmentEndpoint: 'https://handrail.example.test/api/analytics/experiments/assign',
      sourceKind: 'server',
      serviceEnv: 'service_env_1'
    },
    fetch: async (url, init = {}) => {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      if (String(url).includes('/experiments/assign')) {
        assignmentPosts.push({
          url: String(url),
          method: init.method,
          headers: normalizeHeaders(init.headers),
          body
        });
        return responseFromSpec({
          status: 200,
          body: assignmentResponse({
            assignment: {
              assignment_unit_hash: 'unit_hash_123',
              assignment_unit: {
                kind: 'visitor',
                hash: 'unit_hash_123',
                visitor_id: 'raw-visitor-id',
                session_id: 'raw-session-id',
                headers: {
                  cookie: 'secret'
                },
                safe_meta: 'kept'
              },
              traffic: {
                in_experiment: true,
                allocation: 0.5,
                split: 'public'
              },
              override_metadata: {
                version: 1,
                matched: true,
                applied: true,
                status: 'active',
                target_type: 'direct_subject',
                subject_hash_kind: 'visitor',
                precedence: 'operator_override',
                precedence_reason: 'active_unexpired_scoped_operator_override',
                target_variant: {
                  variant_id: 'variant_control',
                  variant_key: 'control',
                  assignment_unit_hash: 'unsafe-target-unit-hash'
                },
                override: {
                  id: 'override_direct_1',
                  override_key: 'visitor-pin-control',
                  status: 'active',
                  no_expiry: true,
                  expires_at: '2026-07-01T12:30:00.000Z',
                  created_at: '2026-06-06T17:00:00.000Z',
                  updated_at: '2026-06-06T17:30:00.000Z',
                  visitor_hash: 'visitor_hash_assignment_1234567890',
                  raw_payload: {
                    secret: true
                  }
                },
                source_scope: {
                  source_id: 'src_node_123',
                  project_id: 'handrail',
                  service_id: 'website',
                  service_env_id: 'service_env_1',
                  env: 'production',
                  source_kind: 'server',
                  url: 'https://example.test/source?token=secret'
                },
                no_expiry: true,
                expires_at: '2026-07-01T12:30:00.000Z',
                cohort_id: 'cohort_preview',
                cohort: null,
                reason: 'preview_link',
                audit_metadata_json: {
                  ticket: 'GOAL-123',
                  source: 'operator_console',
                  raw_payload: {
                    secret: true
                  },
                  headers: {
                    authorization: 'bearer secret'
                  }
                },
                privacy: {
                  subject_identifiers_returned: false,
                  raw_payload_returned: false
                },
                long_text: 'x'.repeat(300),
                nested: {
                  safe: 'kept',
                  ip_address: '192.168.0.1'
                },
                list: [
                  'kept',
                  'https://example.test/private?token=secret',
                  {
                    safe: 'nested-list',
                    raw_payload: {
                      secret: true
                    }
                  }
                ],
                visitor_id: 'raw-visitor',
                visitor_hash: 'visitor_hash_assignment_1234567890',
                subject_hash: 'subject_hash_assignment_1234567890',
                assignment_unit_hash: 'assignment_unit_hash_secret',
                sessionId: 'raw-session',
                session_hash: 'session_hash_assignment_1234567890',
                headers: {
                  cookie: 'secret'
                },
                cookie: 'a=b',
                url: 'https://example.test/checkout?token=secret',
                query_string: 'token=secret',
                payload: {
                  secret: true
                }
              }
            }
          })
        });
      }

      ingestPosts.push({
        url: String(url),
        method: init.method,
        headers: normalizeHeaders(init.headers),
        body
      });
      return responseFromSpec({
        status: 202,
        body: {
          ok: true
        }
      });
    }
  }));

  const assignment = await client.assignExperiment('checkout-copy', {
    visitorHash: 'visitor_hash_assignment_1234567890'
  });

  assert.equal(assignmentPosts.length, 1);
  assert.equal(assignment.assignmentId, 'assignment_1');
  assert.equal(assignment.assignmentAlgorithm, 'weighted_hash_mod');
  assert.equal(assignment.assignmentAlgorithmVersion, 'v1');
  assert.equal(assignment.assignmentBucket, 123456);
  assert.equal(client.getAnalyticsStats().pending, 0);
  assert.equal(client._analyticsEvents.some((event) => event.event_kind === 'experiment_exposure'), false);

  const directExposureId = client.trackExperimentExposure(assignment, {
    surface: 'checkout_hero',
    trigger: 'variant_ui_rendered',
    ui_effect: 'headline_copy',
    visitor_id: 'raw-visitor-custom',
    session_id: 'raw-session-custom',
    headers: 'authorization: bearer secret',
    cookie: 'a=b',
    url: 'https://example.test/checkout?token=secret',
    token: 'secret-token',
    payload: 'raw-payload',
    nested: {
      ignored: true
    }
  }, {
    observedAt: '2026-06-06T18:00:03.000Z',
    exposureId: 'exposure_1',
    path: '/checkout?token=secret'
  });

  assert.match(directExposureId, /^hrae_[a-f0-9]{32}$/);
  assert.equal(client.getStats().pending, 0);
  assert.equal(client.getAnalyticsStats().pending, 1);
  assert.equal(await client.flush(), true);
  assert.equal(ingestPosts.length, 1);

  const returnedAssignment = assignment.expose({
    surface: 'checkout_banner',
    trigger: 'variant_ui_applied'
  }, {
    observedAt: '2026-06-06T18:00:04.000Z',
    exposureId: 'exposure_2'
  });

  assert.equal(returnedAssignment, assignment);
  assert.equal(client.getAnalyticsStats().pending, 1);
  assert.equal(await client.flush(), true);
  assert.equal(ingestPosts.length, 2);

  for (const post of ingestPosts) {
    assert.equal(post.url, 'https://handrail.example.test/api/analytics/ingest');
    assert.equal(post.method, 'POST');
    assert.equal(post.headers['x-handrail-analytics-key'], 'analytics-write-key');
    assert.equal(post.headers.authorization, 'Bearer analytics-write-key');
    assert.equal(post.headers['x-handrail-apm-token'], undefined);
    assert.equal(post.body.key, 'analytics-write-key');
    assert.equal(post.body.event.event_kind, 'experiment_exposure');
    assert.equal(post.body.event_type, undefined);
    assert.equal(JSON.stringify(post.body).includes('apm-token-secret'), false);
  }

  const exposure = ingestPosts[0].body.event;
  assert.equal(exposure.experiment.experiment_id, 'experiment_1');
  assert.equal(exposure.experiment.experiment_key, 'checkout-copy');
  assert.equal(exposure.experiment.variant_id, 'variant_control');
  assert.equal(exposure.experiment.variant_key, 'control');
  assert.equal(exposure.experiment.assignment_id, 'assignment_1');
  assert.equal(exposure.experiment.exposure_id, 'exposure_1');
  assert.equal(exposure.experiment.assignment_algorithm, 'weighted_hash_mod');
  assert.equal(exposure.experiment.assignment_algorithm_version, 'v1');
  assert.equal(exposure.experiment.assignment_bucket, 123456);
  assert.equal(exposure.experiment.assignment_unit_hash, 'unit_hash_123');
  assert.equal(exposure.experiment.assignment_unit.kind, 'visitor');
  assert.equal(exposure.experiment.assignment_unit.hash, 'unit_hash_123');
  assert.equal(exposure.experiment.assignment_unit.safe_meta, 'kept');
  assert.equal(exposure.experiment.assignment_unit.visitor_id, undefined);
  assert.equal(exposure.experiment.assignment_unit.session_id, undefined);
  assert.equal(exposure.experiment.assignment_unit.headers, undefined);
  assert.deepEqual(exposure.experiment.source_scope, {
    source_id: 'src_node_123',
    project_id: 'handrail',
    service_id: 'website',
    service_env_id: 'service_env_1',
    env: 'production',
    source_kind: 'server'
  });
  assert.deepEqual(exposure.experiment.traffic, {
    in_experiment: true,
    allocation: 0.5,
    split: 'public'
  });
  assert.equal(exposure.experiment.in_experiment, true);
  assert.equal(exposure.experiment.override_metadata.version, 1);
  assert.equal(exposure.experiment.override_metadata.matched, true);
  assert.equal(exposure.experiment.override_metadata.applied, true);
  assert.equal(exposure.experiment.override_metadata.status, 'active');
  assert.equal(exposure.experiment.override_metadata.target_type, 'direct_subject');
  assert.equal(exposure.experiment.override_metadata.subject_hash_kind, 'visitor');
  assert.equal(exposure.experiment.override_metadata.precedence, 'operator_override');
  assert.equal(exposure.experiment.override_metadata.precedence_reason, 'active_unexpired_scoped_operator_override');
  assert.deepEqual(exposure.experiment.override_metadata.target_variant, {
    variant_id: 'variant_control',
    variant_key: 'control'
  });
  assert.equal(exposure.experiment.override_metadata.override.id, 'override_direct_1');
  assert.equal(exposure.experiment.override_metadata.override.override_key, 'visitor-pin-control');
  assert.equal(exposure.experiment.override_metadata.override.status, 'active');
  assert.equal(exposure.experiment.override_metadata.override.no_expiry, true);
  assert.equal(exposure.experiment.override_metadata.override.expires_at, undefined);
  assert.deepEqual(exposure.experiment.override_metadata.source_scope, {
    source_id: 'src_node_123',
    project_id: 'handrail',
    service_id: 'website',
    service_env_id: 'service_env_1',
    env: 'production',
    source_kind: 'server'
  });
  assert.equal(exposure.experiment.override_metadata.no_expiry, true);
  assert.equal(exposure.experiment.override_metadata.expires_at, undefined);
  assert.equal(exposure.experiment.override_metadata.cohort_id, 'cohort_preview');
  assert.equal(exposure.experiment.override_metadata.cohort, null);
  assert.equal(exposure.experiment.override_metadata.reason, 'preview_link');
  assert.equal(exposure.experiment.override_metadata.audit_metadata_json.ticket, 'GOAL-123');
  assert.equal(exposure.experiment.override_metadata.audit_metadata_json.source, 'operator_console');
  assert.equal(exposure.experiment.override_metadata.audit_metadata_json.raw_payload, undefined);
  assert.equal(exposure.experiment.override_metadata.audit_metadata_json.headers, undefined);
  assert.equal(exposure.experiment.override_metadata.privacy.subject_identifiers_returned, false);
  assert.equal(exposure.experiment.override_metadata.privacy.raw_payload_returned, false);
  assert.equal(exposure.experiment.override_metadata.long_text.length, 256);
  assert.equal(exposure.experiment.override_metadata.nested.safe, 'kept');
  assert.equal(exposure.experiment.override_metadata.nested.ip_address, undefined);
  assert.deepEqual(exposure.experiment.override_metadata.list, [
    'kept',
    {
      safe: 'nested-list'
    }
  ]);
  assert.equal(exposure.experiment.override_metadata.visitor_id, undefined);
  assert.equal(exposure.experiment.override_metadata.visitor_hash, undefined);
  assert.equal(exposure.experiment.override_metadata.subject_hash, undefined);
  assert.equal(exposure.experiment.override_metadata.assignment_unit_hash, undefined);
  assert.equal(exposure.experiment.override_metadata.sessionId, undefined);
  assert.equal(exposure.experiment.override_metadata.session_hash, undefined);
  assert.equal(exposure.experiment.override_metadata.headers, undefined);
  assert.equal(exposure.experiment.override_metadata.cookie, undefined);
  assert.equal(exposure.experiment.override_metadata.url, undefined);
  assert.equal(exposure.experiment.override_metadata.query_string, undefined);
  assert.equal(exposure.experiment.override_metadata.payload, undefined);
  assertNoForbiddenOverrideMetadataKeys(exposure.experiment.override_metadata);
  assert.equal(exposure.custom.properties.surface, 'checkout_hero');
  assert.equal(exposure.custom.properties.trigger, 'variant_ui_rendered');
  assert.equal(exposure.custom.properties.ui_effect, 'headline_copy');
  assert.equal(exposure.custom.properties.visitor_id, undefined);
  assert.equal(exposure.custom.properties.session_id, undefined);
  assert.equal(exposure.custom.properties.headers, undefined);
  assert.equal(exposure.custom.properties.cookie, undefined);
  assert.equal(exposure.custom.properties.url, undefined);
  assert.equal(exposure.custom.properties.token, undefined);
  assert.equal(exposure.custom.properties.payload, undefined);
  assert.equal(exposure.custom.properties.nested, undefined);
  assert.equal(JSON.stringify(exposure).includes('raw-visitor'), false);
  assert.equal(JSON.stringify(exposure).includes('raw-session'), false);
  assert.equal(JSON.stringify(exposure).includes('visitor_hash_assignment'), false);
  assert.equal(JSON.stringify(exposure).includes('session_hash_assignment'), false);
  assert.equal(JSON.stringify(exposure).includes('subject_hash_assignment'), false);
  assert.equal(JSON.stringify(exposure).includes('assignment_unit_hash_secret'), false);
  assert.equal(JSON.stringify(exposure).includes('token=secret'), false);
  assert.equal(JSON.stringify(exposure).includes('raw-payload'), false);

  const assignmentExposeEvent = ingestPosts[1].body.event;
  assert.equal(assignmentExposeEvent.experiment.experiment_key, 'checkout-copy');
  assert.equal(assignmentExposeEvent.experiment.variant_key, 'control');
  assert.equal(assignmentExposeEvent.experiment.assignment_id, 'assignment_1');
  assert.equal(assignmentExposeEvent.experiment.exposure_id, 'exposure_2');
  assert.equal(assignmentExposeEvent.custom.properties.surface, 'checkout_banner');
  assert.equal(assignmentExposeEvent.custom.properties.trigger, 'variant_ui_applied');
  assert.equal(client.getAnalyticsStats().pending, 0);

  await client.shutdown();
});

test('experiment returns deterministic local compatibility assignment without assignment or exposure side effects', async () => {
  const transportCalls = [];
  const client = handrail.createClient(analyticsConfig({
    batchSize: 99,
    analytics: {
      sourceKind: 'server',
      serviceEnv: 'service_env_1'
    },
    fetch: async (url, init = {}) => {
      transportCalls.push({
        url: String(url),
        method: init.method,
        body: init.body ? JSON.parse(String(init.body)) : {}
      });
      return responseFromSpec({
        status: 202,
        body: {
          ok: true
        }
      });
    }
  }));

  const variants = [
    {
      key: 'control',
      id: 'variant_control',
      value: 'Control checkout copy',
      weight: 1
    },
    {
      key: 'short',
      id: 'variant_short',
      value: 'Short checkout copy',
      weight: 2
    }
  ];
  const options = {
    visitorHash: 'visitor_hash_local_assignment_1234567890',
    projectId: 'handrail',
    sourceId: 'src_node_123'
  };

  const first = client.experiment('checkout-copy', variants, options);
  const second = client.experiment('checkout-copy', variants, options);

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.experimentKey, 'checkout-copy');
  assert.equal(second.experimentKey, 'checkout-copy');
  assert.equal(first.variantKey, second.variantKey);
  assert.equal(first.variantId, second.variantId);
  assert.equal(first.variant, second.variant);
  assert.equal(first.value, second.value);
  assert.equal(first.index, second.index);
  assert.equal(first.assignmentId, second.assignmentId);
  assert.match(first.assignmentId, /^assign_[a-f0-9]{8}$/);
  assert.equal(String(first), first.variantKey);
  assert.equal(first.valueOf(), first.value);

  assert.equal(transportCalls.length, 0);
  assert.equal(client.getStats().queued, 0);
  assert.equal(client.getStats().pending, 0);
  assert.equal(client.getAnalyticsStats().queued, 0);
  assert.equal(client.getAnalyticsStats().pending, 0);
  assert.equal(client._analyticsEvents.some((event) => event.event_kind === 'experiment_exposure'), false);
  assert.equal(await client.flush(), true);
  assert.equal(transportCalls.length, 0);

  assert.doesNotThrow(() => {
    assert.equal(client.experiment('', variants, options), null);
    assert.equal(client.experiment('checkout-copy', [], options), null);
    assert.equal(client.experiment('checkout-copy', [{ value: '' }], options), null);
    assert.equal(client.experiment('checkout-copy', null, options), null);
  });
  assert.equal(transportCalls.length, 0);
  assert.equal(client.getAnalyticsStats().pending, 0);

  await client.shutdown();
});

test('experiment exposure is explicit through local assignment helpers or trackExperimentExposure', async () => {
  const ingestPosts = [];
  const client = handrail.createClient(analyticsConfig({
    batchSize: 99,
    analytics: {
      sourceKind: 'server',
      serviceEnv: 'service_env_1',
      customPropertyAllowlist: [
        'surface',
        'trigger'
      ]
    },
    fetch: async (url, init = {}) => {
      assert.equal(String(url).includes('/experiments/assign'), false);
      ingestPosts.push({
        url: String(url),
        method: init.method,
        headers: normalizeHeaders(init.headers),
        body: init.body ? JSON.parse(String(init.body)) : {}
      });
      return responseFromSpec({
        status: 202,
        body: {
          ok: true
        }
      });
    }
  }));

  const assignment = client.experiment('checkout-copy', ['control', 'short'], {
    visitorHash: 'visitor_hash_local_exposure_1234567890',
    experimentId: 'experiment_local_1'
  });

  assert.ok(assignment);
  assert.equal(ingestPosts.length, 0);
  assert.equal(client.getAnalyticsStats().pending, 0);

  assert.equal(assignment.expose({
    surface: 'hero',
    trigger: 'render'
  }, {
    observedAt: '2026-06-06T18:00:01.000Z',
    exposureId: 'exposure_local_helper'
  }), assignment);

  const directExposureId = client.trackExperimentExposure(assignment, {
    surface: 'pricing',
    trigger: 'render'
  }, {
    observedAt: '2026-06-06T18:00:02.000Z',
    exposureId: 'exposure_local_direct'
  });

  assert.match(directExposureId, /^hrae_[a-f0-9]{32}$/);
  assert.equal(client.getStats().pending, 0);
  assert.equal(client.getAnalyticsStats().pending, 2);
  assert.equal(client._analyticsEvents.every((event) => event.event_kind === 'experiment_exposure'), true);
  assert.equal(ingestPosts.length, 0);
  assert.equal(await client.flush(), true);
  assert.equal(ingestPosts.length, 2);

  for (const post of ingestPosts) {
    assert.equal(post.url, 'https://handrail.example.test/api/analytics/ingest');
    assert.equal(post.method, 'POST');
    assert.equal(post.headers['x-handrail-analytics-key'], 'analytics-write-key');
    assert.equal(post.headers.authorization, 'Bearer analytics-write-key');
    assert.equal(post.headers['x-handrail-apm-token'], undefined);
    assert.equal(post.body.key, 'analytics-write-key');
    assert.equal(post.body.event.event_kind, 'experiment_exposure');
    assert.equal(post.body.event.event_type, undefined);
    assert.equal(post.body.event.experiment.experiment_id, 'experiment_local_1');
    assert.equal(post.body.event.experiment.experiment_key, 'checkout-copy');
    assert.equal(post.body.event.experiment.variant_key, assignment.variantKey);
    assert.equal(post.body.event.experiment.assignment_id, assignment.assignmentId);
  }

  assert.equal(ingestPosts[0].body.event.experiment.exposure_id, 'exposure_local_helper');
  assert.equal(ingestPosts[0].body.event.custom.properties.surface, 'hero');
  assert.equal(ingestPosts[0].body.event.custom.properties.trigger, 'render');
  assert.equal(ingestPosts[1].body.event.experiment.exposure_id, 'exposure_local_direct');
  assert.equal(ingestPosts[1].body.event.custom.properties.surface, 'pricing');

  await client.shutdown();
});

test('durable assignment metadata flows into assignment.conversion and trackConversion attribution', async () => {
  const assignmentPosts = [];
  const ingestPosts = [];
  const client = handrail.createClient(analyticsConfig({
    enabled: true,
    endpoint: 'https://handrail.example.test/api/apm/events',
    token: 'apm-token-secret',
    batchSize: 99,
    analytics: {
      assignmentEndpoint: 'https://handrail.example.test/api/analytics/experiments/assign',
      sourceKind: 'server',
      serviceEnv: 'service_env_1',
      customPropertyAllowlist: [
        'funnel_id',
        'funnel_step',
        'kpi_name',
        'kpi_weight'
      ]
    },
    fetch: async (url, init = {}) => {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      if (String(url).includes('/experiments/assign')) {
        assignmentPosts.push({
          url: String(url),
          method: init.method,
          headers: normalizeHeaders(init.headers),
          body
        });
        return responseFromSpec({
          status: 200,
          body: assignmentResponse({
            assignment: {
              assignment_unit_hash: 'unit_hash_123',
              assignment_unit: {
                kind: 'visitor',
                hash: 'unit_hash_123',
                visitor_id: 'raw-visitor-id'
              },
              traffic: {
                in_experiment: true,
                allocation: 0.5
              },
              override_metadata: {
                version: 1,
                matched: true,
                applied: true,
                status: 'active',
                target_type: 'cohort',
                subject_hash_kind: null,
                precedence: 'operator_override',
                precedence_reason: 'active_unexpired_scoped_operator_override',
                target_variant: {
                  variant_id: 'variant_control',
                  variant_key: 'control',
                  subject_hash: 'unsafe-subject-hash'
                },
                override: {
                  id: 'override_cohort_1',
                  override_key: 'cohort-preview-control',
                  status: 'active',
                  no_expiry: false,
                  expires_at: '2026-07-01T12:30:00-05:00',
                  created_at: '2026-06-06T17:00:00.000Z',
                  updated_at: '2026-06-06T17:30:00.000Z',
                  session_hash: 'session_hash_assignment_1234567890'
                },
                source_scope: {
                  source_id: 'src_node_123',
                  project_id: 'handrail',
                  service_id: 'website',
                  service_env_id: 'service_env_1',
                  env: 'production',
                  source_kind: 'server',
                  query_string: 'token=secret'
                },
                no_expiry: false,
                expires_at: '2026-07-01T12:30:00-05:00',
                cohort_id: 'cohort_preview',
                cohort: {
                  id: 'cohort_preview',
                  cohort_key: 'preview-users',
                  status: 'active',
                  visitor_hash: 'visitor_hash_assignment_1234567890'
                },
                reason: 'preview_link',
                audit_metadata_json: {
                  ticket: 'GOAL-456',
                  workflow: 'operator_console',
                  query_string: 'token=secret'
                },
                privacy: {
                  subject_identifiers_returned: false,
                  raw_payload_returned: false
                },
                nested: {
                  safe: 'kept',
                  ip_address: '192.168.0.1'
                },
                list: [
                  'kept',
                  'https://example.test/private?token=secret',
                  {
                    safe: 'nested-list',
                    raw_payload: {
                      secret: true
                    }
                  }
                ],
                visitor_id: 'raw-visitor',
                visitor_hash: 'visitor_hash_assignment_1234567890',
                sessionId: 'raw-session',
                session_hash: 'session_hash_assignment_1234567890',
                assignment_unit_hash: 'assignment_unit_hash_secret',
                headers: {
                  cookie: 'secret'
                },
                cookie: 'a=b',
                url: 'https://example.test/checkout?token=secret',
                query_string: 'token=secret',
                payload: {
                  secret: true
                }
              }
            }
          })
        });
      }
      ingestPosts.push({
        url: String(url),
        method: init.method,
        headers: normalizeHeaders(init.headers),
        body
      });
      return responseFromSpec({
        status: 202,
        body: {
          ok: true
        }
      });
    }
  }));

  const assignment = await client.assignExperiment('checkout-copy', {
    visitorHash: 'visitor_hash_assignment_1234567890'
  });

  assert.equal(assignmentPosts.length, 1);
  assert.equal(assignment.assignmentId, 'assignment_1');
  assert.equal(assignment.assignmentAlgorithm, 'weighted_hash_mod');
  assert.equal(assignment.assignmentAlgorithmVersion, 'v1');
  assert.equal(assignment.assignmentBucket, 123456);
  assert.equal(client.getAnalyticsStats().pending, 0);
  assert.equal(client._analyticsEvents.some((event) => event.event_kind === 'experiment_exposure'), false);

  const assignmentConversion = assignment.conversion('signup_completed', {
    funnel_id: 'signup',
    funnel_step: 'complete',
    kpi_name: 'paid_signup'
  }, {
    observedAt: '2026-06-06T18:00:04.000Z',
    conversionId: 'conversion_1',
    conversionType: 'funnel_step',
    value: 99,
    currency: 'usd'
  });
  const directConversionId = client.trackConversion('trial_started', {
    funnel_id: 'signup',
    funnel_step: 'trial',
    kpi_weight: 0.5
  }, {
    observedAt: '2026-06-06T18:00:05.000Z',
    conversionId: 'conversion_2',
    conversionType: 'kpi',
    value: '42.5',
    currency: 'eur',
    experiment: assignment
  });

  assert.equal(assignmentConversion, assignment);
  assert.match(directConversionId, /^hrae_[a-f0-9]{32}$/);
  assert.equal(client.getStats().pending, 0);
  assert.equal(client.getAnalyticsStats().pending, 2);
  assert.equal(await client.flush(), true);
  assert.equal(ingestPosts.length, 2);

  for (const post of ingestPosts) {
    assert.equal(post.url, 'https://handrail.example.test/api/analytics/ingest');
    assert.equal(post.method, 'POST');
    assert.equal(post.headers['x-handrail-analytics-key'], 'analytics-write-key');
    assert.equal(post.headers.authorization, 'Bearer analytics-write-key');
    assert.equal(post.headers['x-handrail-apm-token'], undefined);
    assert.equal(post.body.key, 'analytics-write-key');
    assert.equal(post.body.event.event_kind, 'conversion');
    assert.equal(post.body.event_type, undefined);
    assert.equal(JSON.stringify(post.body).includes('apm-token-secret'), false);
  }

  const conversion = ingestPosts[0].body.event;
  assert.equal(conversion.conversion.conversion_id, 'conversion_1');
  assert.equal(conversion.conversion.conversion_name, 'signup_completed');
  assert.equal(conversion.conversion.conversion_type, 'funnel_step');
  assert.equal(conversion.conversion.value, 99);
  assert.equal(conversion.conversion.currency, 'USD');
  assert.equal(conversion.custom.properties.funnel_id, 'signup');
  assert.equal(conversion.custom.properties.funnel_step, 'complete');
  assert.equal(conversion.custom.properties.kpi_name, 'paid_signup');
  assert.equal(conversion.experiment.experiment_id, 'experiment_1');
  assert.equal(conversion.experiment.experiment_key, 'checkout-copy');
  assert.equal(conversion.experiment.variant_id, 'variant_control');
  assert.equal(conversion.experiment.variant_key, 'control');
  assert.equal(conversion.experiment.assignment_id, 'assignment_1');
  assert.equal(conversion.experiment.assignment_algorithm, 'weighted_hash_mod');
  assert.equal(conversion.experiment.assignment_algorithm_version, 'v1');
  assert.equal(conversion.experiment.assignment_bucket, 123456);
  assert.equal(conversion.experiment.assignment_unit_hash, 'unit_hash_123');
  assert.equal(conversion.experiment.assignment_unit.kind, 'visitor');
  assert.equal(conversion.experiment.assignment_unit.hash, 'unit_hash_123');
  assert.equal(conversion.experiment.assignment_unit.visitor_id, undefined);
  assert.deepEqual(conversion.experiment.source_scope, {
    source_id: 'src_node_123',
    project_id: 'handrail',
    service_id: 'website',
    service_env_id: 'service_env_1',
    env: 'production',
    source_kind: 'server'
  });
  assert.deepEqual(conversion.experiment.traffic, {
    in_experiment: true,
    allocation: 0.5
  });
  assert.equal(conversion.experiment.in_experiment, true);
  assert.equal(conversion.experiment.override_metadata.version, 1);
  assert.equal(conversion.experiment.override_metadata.matched, true);
  assert.equal(conversion.experiment.override_metadata.applied, true);
  assert.equal(conversion.experiment.override_metadata.status, 'active');
  assert.equal(conversion.experiment.override_metadata.target_type, 'cohort');
  assert.equal(conversion.experiment.override_metadata.subject_hash_kind, null);
  assert.equal(conversion.experiment.override_metadata.precedence, 'operator_override');
  assert.equal(conversion.experiment.override_metadata.precedence_reason, 'active_unexpired_scoped_operator_override');
  assert.deepEqual(conversion.experiment.override_metadata.target_variant, {
    variant_id: 'variant_control',
    variant_key: 'control'
  });
  assert.equal(conversion.experiment.override_metadata.override.id, 'override_cohort_1');
  assert.equal(conversion.experiment.override_metadata.override.override_key, 'cohort-preview-control');
  assert.equal(conversion.experiment.override_metadata.override.status, 'active');
  assert.equal(conversion.experiment.override_metadata.override.no_expiry, false);
  assert.equal(conversion.experiment.override_metadata.override.expires_at, '2026-07-01T17:30:00.000Z');
  assert.deepEqual(conversion.experiment.override_metadata.source_scope, {
    source_id: 'src_node_123',
    project_id: 'handrail',
    service_id: 'website',
    service_env_id: 'service_env_1',
    env: 'production',
    source_kind: 'server'
  });
  assert.equal(conversion.experiment.override_metadata.no_expiry, false);
  assert.equal(conversion.experiment.override_metadata.expires_at, '2026-07-01T17:30:00.000Z');
  assert.equal(conversion.experiment.override_metadata.cohort_id, 'cohort_preview');
  assert.deepEqual(conversion.experiment.override_metadata.cohort, {
    id: 'cohort_preview',
    cohort_key: 'preview-users',
    status: 'active'
  });
  assert.equal(conversion.experiment.override_metadata.reason, 'preview_link');
  assert.equal(conversion.experiment.override_metadata.audit_metadata_json.ticket, 'GOAL-456');
  assert.equal(conversion.experiment.override_metadata.audit_metadata_json.workflow, 'operator_console');
  assert.equal(conversion.experiment.override_metadata.audit_metadata_json.query_string, undefined);
  assert.equal(conversion.experiment.override_metadata.privacy.subject_identifiers_returned, false);
  assert.equal(conversion.experiment.override_metadata.privacy.raw_payload_returned, false);
  assert.equal(conversion.experiment.override_metadata.nested.safe, 'kept');
  assert.equal(conversion.experiment.override_metadata.nested.ip_address, undefined);
  assert.deepEqual(conversion.experiment.override_metadata.list, [
    'kept',
    {
      safe: 'nested-list'
    }
  ]);
  assert.equal(conversion.experiment.override_metadata.visitor_id, undefined);
  assert.equal(conversion.experiment.override_metadata.visitor_hash, undefined);
  assert.equal(conversion.experiment.override_metadata.sessionId, undefined);
  assert.equal(conversion.experiment.override_metadata.session_hash, undefined);
  assert.equal(conversion.experiment.override_metadata.assignment_unit_hash, undefined);
  assert.equal(conversion.experiment.override_metadata.headers, undefined);
  assert.equal(conversion.experiment.override_metadata.cookie, undefined);
  assert.equal(conversion.experiment.override_metadata.url, undefined);
  assert.equal(conversion.experiment.override_metadata.query_string, undefined);
  assert.equal(conversion.experiment.override_metadata.payload, undefined);
  assertNoForbiddenOverrideMetadataKeys(conversion.experiment.override_metadata);
  assert.equal(JSON.stringify(conversion.experiment.override_metadata).includes('raw-visitor'), false);
  assert.equal(JSON.stringify(conversion.experiment.override_metadata).includes('raw-session'), false);
  assert.equal(JSON.stringify(conversion.experiment.override_metadata).includes('visitor_hash_assignment'), false);
  assert.equal(JSON.stringify(conversion.experiment.override_metadata).includes('session_hash_assignment'), false);
  assert.equal(JSON.stringify(conversion.experiment.override_metadata).includes('assignment_unit_hash_secret'), false);
  assert.equal(JSON.stringify(conversion.experiment.override_metadata).includes('token=secret'), false);

  const directConversion = ingestPosts[1].body.event;
  assert.equal(directConversion.conversion.conversion_id, 'conversion_2');
  assert.equal(directConversion.conversion.conversion_name, 'trial_started');
  assert.equal(directConversion.conversion.conversion_type, 'kpi');
  assert.equal(directConversion.conversion.value, 42.5);
  assert.equal(directConversion.conversion.currency, 'EUR');
  assert.equal(directConversion.custom.properties.kpi_weight, 0.5);
  assert.equal(directConversion.experiment.experiment_id, 'experiment_1');
  assert.equal(directConversion.experiment.experiment_key, 'checkout-copy');
  assert.equal(directConversion.experiment.variant_id, 'variant_control');
  assert.equal(directConversion.experiment.variant_key, 'control');
  assert.equal(directConversion.experiment.assignment_id, 'assignment_1');
  assert.equal(directConversion.experiment.assignment_algorithm, 'weighted_hash_mod');
  assert.equal(directConversion.experiment.assignment_algorithm_version, 'v1');
  assert.equal(directConversion.experiment.assignment_bucket, 123456);
  assert.equal(directConversion.experiment.traffic.in_experiment, true);
  assert.equal(directConversion.experiment.override_metadata.cohort_id, 'cohort_preview');
  assert.equal(JSON.stringify(directConversion.experiment.override_metadata).includes('raw-session'), false);
  assert.equal(client.getAnalyticsStats().pending, 0);

  await client.shutdown();
});

test('assignExperiment derives assignment endpoint and sends session-scoped hash identity only', async () => {
  const intake = createFakeFetch({
    responses: [{
      status: 200,
      body: assignmentResponse({
        assignment_scope: 'session',
        assignment: {
          assignment_scope: 'session',
          assignment_unit_hash: 'session_assignment_unit_hash'
        }
      })
    }]
  });
  const client = handrail.createClient(analyticsConfig({
    analytics: {
      sourceKind: 'server',
      serviceEnv: 'service_env_1'
    },
    fetch: intake.fetch
  }));

  assert.equal(
    client.getAnalyticsConfig().assignmentEndpoint,
    'https://handrail.example.test/api/analytics/experiments/assign'
  );

  const assignment = await client.assignExperiment('checkout-copy', {
    assignmentScope: 'session',
    visitorHash: 'visitor_hash_assignment_1234567890',
    sessionHash: 'session_hash_assignment_1234567890',
    visitorId: 'raw-visitor-id',
    sessionId: 'raw-session-id'
  });

  assert.equal(intake.requests.length, 1);
  assert.equal(intake.requests[0].url, 'https://handrail.example.test/api/analytics/experiments/assign');
  assert.equal(intake.requests[0].headers['x-handrail-analytics-key'], 'analytics-write-key');
  assert.equal(intake.requests[0].headers.authorization, 'Bearer analytics-write-key');
  assert.equal(intake.requests[0].headers['x-handrail-apm-token'], undefined);
  assert.equal(intake.requests[0].body.assignment_scope, 'session');
  assert.equal(intake.requests[0].body.visitor_hash, 'visitor_hash_assignment_1234567890');
  assert.equal(intake.requests[0].body.session_hash, 'session_hash_assignment_1234567890');
  assert.equal(intake.requests[0].body.visitor_id, undefined);
  assert.equal(intake.requests[0].body.session_id, undefined);
  assert.equal(JSON.stringify(intake.requests[0].body).includes('raw-visitor-id'), false);
  assert.equal(JSON.stringify(intake.requests[0].body).includes('raw-session-id'), false);
  assert.equal(assignment.assignmentScope, 'session');
  assert.equal(assignment.assignmentUnitHash, 'session_assignment_unit_hash');
  assert.equal(client.getAnalyticsStats().pending, 0);

  await client.shutdown();
});

test('assignExperiment stays quiet when assignment config or required identities are incomplete', async () => {
  let fetchCalls = 0;
  const incompleteConfigClient = handrail.createClient(analyticsConfig({
    analytics: {
      sourceKind: 'server',
      serviceEnv: ''
    },
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, status: 200 };
    }
  }));

  assert.equal(incompleteConfigClient.getAnalyticsConfig().enabled, true);
  assert.equal(incompleteConfigClient.getAnalyticsConfig().assignmentEnabled, false);
  assert.deepEqual(incompleteConfigClient.getAnalyticsConfig().assignmentMissingConfig, ['serviceEnv']);
  assert.equal(await incompleteConfigClient.assignExperiment('checkout-copy', {
    visitorHash: 'visitor_hash_assignment_1234567890'
  }), null);
  assert.equal(fetchCalls, 0);
  assert.equal(incompleteConfigClient.getAnalyticsStats().queued, 0);
  assert.equal(incompleteConfigClient.getAnalyticsStats().pending, 0);
  await incompleteConfigClient.shutdown();

  const incompleteIdentityClient = handrail.createClient(analyticsConfig({
    analytics: {
      sourceKind: 'server',
      serviceEnv: 'service_env_1'
    },
    fetch: async () => {
      fetchCalls += 1;
      return { ok: true, status: 200 };
    }
  }));

  assert.equal(await incompleteIdentityClient.assignExperiment('checkout-copy'), null);
  assert.equal(await incompleteIdentityClient.assignExperiment('checkout-copy', {
    assignmentScope: 'session',
    visitorHash: 'visitor_hash_assignment_1234567890'
  }), null);
  assert.equal(fetchCalls, 0);
  assert.equal(incompleteIdentityClient.getAnalyticsStats().queued, 0);
  assert.equal(incompleteIdentityClient.getAnalyticsStats().pending, 0);

  await incompleteIdentityClient.shutdown();
});

test('assignExperiment returns null without throwing when fetch is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = undefined;
  const client = handrail.createClient(analyticsConfig({
    analytics: {
      sourceKind: 'server',
      serviceEnv: 'service_env_1'
    }
  }));

  try {
    assert.equal(await client.assignExperiment('checkout-copy', {
      visitorHash: 'visitor_hash_assignment_1234567890'
    }), null);
    assert.equal(client.getAnalyticsStats().failedRequests, 1);
    assert.equal(client.getAnalyticsStats().lastFailureReason, 'fetch unavailable');
  } finally {
    globalThis.fetch = originalFetch;
    await client.shutdown();
  }
});

test('assignExperiment returns null on non-2xx, invalid response, and thrown fetch failures', async () => {
  const scenarios = [
    {
      name: 'non-2xx',
      responses: [{
        status: 403,
        body: {
          ok: false,
          error: {
            code: 'analytics_assignment_scope_mismatch'
          }
        }
      }],
      expectedReason: 'analytics_assignment_status_403'
    },
    {
      name: 'invalid response',
      responses: [{
        status: 200,
        body: {
          accepted: true
        }
      }],
      expectedReason: 'analytics_assignment_invalid_response'
    },
    {
      name: 'thrown fetch',
      responses: [new Error('assignment network failed')],
      expectedReason: 'assignment network failed'
    }
  ];

  for (const scenario of scenarios) {
    const intake = createFakeFetch({ responses: scenario.responses });
    const client = handrail.createClient(analyticsConfig({
      enabled: true,
      endpoint: 'https://handrail.example.test/api/apm/events',
      token: 'apm-token-secret',
      analytics: {
        sourceKind: 'server',
        serviceEnv: 'service_env_1'
      },
      fetch: intake.fetch
    }));

    assert.equal(await client.assignExperiment('checkout-copy', {
      visitorHash: 'visitor_hash_assignment_1234567890'
    }), null, scenario.name);
    assert.equal(intake.requests.length, 1, scenario.name);
    assert.equal(intake.requests[0].url, 'https://handrail.example.test/api/analytics/experiments/assign');
    assert.equal(intake.requests[0].headers['x-handrail-analytics-key'], 'analytics-write-key');
    assert.equal(intake.requests[0].headers['x-handrail-apm-token'], undefined);
    assert.equal(JSON.stringify(intake.requests[0].body).includes('apm-token-secret'), false);
    assert.equal(client.getStats().queued, 0, scenario.name);
    assert.equal(client.getAnalyticsStats().queued, 0, scenario.name);
    assert.equal(client.getAnalyticsStats().pending, 0, scenario.name);
    assert.equal(client.getAnalyticsStats().failedRequests, 1, scenario.name);
    assert.equal(client.getAnalyticsStats().lastFailureReason, scenario.expectedReason, scenario.name);

    await client.shutdown();
  }
});
