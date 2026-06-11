const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');

const handrail = require('../src/index.cjs');

function loadCanonicalFixture() {
  const candidates = [
    resolve(__dirname, '../../handrail/scripts/fixtures/sdk-analytics-contract-fixtures.json'),
    resolve(__dirname, '../handrail/scripts/fixtures/sdk-analytics-contract-fixtures.json')
  ];
  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8'));
    } catch (error) {
      if (error && error.code !== 'ENOENT') throw error;
    }
  }
  throw new Error('Unable to locate canonical SDK analytics fixture corpus.');
}

function completeConfig() {
  return handrail.loadConfigFromEnv({
    HANDRAIL_APM_ENABLED: 'false',
    HANDRAIL_PROJECT: 'handrail',
    HANDRAIL_ENV: 'production',
    HANDRAIL_SERVICE: 'website',
    HANDRAIL_RELEASE: '2026.06.06',
    HANDRAIL_ANALYTICS_ENABLED: 'true',
    HANDRAIL_ANALYTICS_ENDPOINT: 'https://handrail.example.test/api/analytics/ingest',
    HANDRAIL_ANALYTICS_KEY: 'analytics-key',
    HANDRAIL_ANALYTICS_SOURCE_ID: 'src_node_contract',
    HANDRAIL_ANALYTICS_PROJECT: 'handrail',
    HANDRAIL_ANALYTICS_ENV: 'production',
    HANDRAIL_ANALYTICS_SERVICE: 'website',
    HANDRAIL_ANALYTICS_RELEASE: '2026.06.06'
  });
}

function durableAssignmentConfig(fixture, overrides = {}) {
  const durable = fixture.shared_context.node_durable_assignment;
  return {
    ...handrail.loadConfigFromEnv({
      HANDRAIL_APM_ENABLED: 'true',
      HANDRAIL_APM_ENDPOINT: durable.apm_endpoint,
      HANDRAIL_APM_TOKEN: durable.apm_token,
      HANDRAIL_PROJECT: durable.source_scope.project_id,
      HANDRAIL_ENV: durable.source_scope.env,
      HANDRAIL_SERVICE: durable.source_scope.service_id,
      HANDRAIL_RELEASE: '2026.06.06',
      HANDRAIL_ANALYTICS_ENABLED: 'true',
      HANDRAIL_ANALYTICS_ENDPOINT: durable.analytics_endpoint,
      HANDRAIL_ANALYTICS_ASSIGNMENT_ENDPOINT: durable.assignment_endpoint,
      HANDRAIL_ANALYTICS_KEY: durable.analytics_key,
      HANDRAIL_ANALYTICS_SOURCE_ID: durable.source_scope.source_id,
      HANDRAIL_ANALYTICS_SOURCE_KIND: durable.source_scope.source_kind,
      HANDRAIL_ANALYTICS_PROJECT: durable.source_scope.project_id,
      HANDRAIL_ANALYTICS_ENV: durable.source_scope.env,
      HANDRAIL_ANALYTICS_SERVICE: durable.source_scope.service_id,
      HANDRAIL_ANALYTICS_SERVICE_ENV_ID: durable.source_scope.service_env_id,
      HANDRAIL_ANALYTICS_RELEASE: '2026.06.06'
    }),
    batchSize: 99,
    flushIntervalMs: 60_000,
    retryBaseDelayMs: 1,
    retryMaxDelayMs: 1,
    ...overrides
  };
}

function assertSubset(actual, expected, path = 'value') {
  for (const [key, expectedValue] of Object.entries(expected || {})) {
    const actualValue = actual && actual[key];
    const nextPath = `${path}.${key}`;
    if (expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue)) {
      assertSubset(actualValue, expectedValue, nextPath);
    } else {
      assert.deepEqual(actualValue, expectedValue, nextPath);
    }
  }
}

function fixtureCase(fixture, id) {
  const entry = fixture.cases.find((candidate) => candidate.id === id);
  assert.ok(entry, `missing ${id}`);
  return entry;
}

function assertDoesNotIncludeRawPrivacyValues(value, fixture, caseId) {
  const serialized = JSON.stringify(value);
  for (const rawValue of fixture.shared_context.privacy_absent_values) {
    assert.equal(serialized.includes(rawValue), false, `${caseId} leaked ${rawValue}`);
  }
}

test('Node analytics builder consumes the canonical SDK analytics fixture corpus', () => {
  const fixture = loadCanonicalFixture();
  const config = completeConfig();
  const nodeCases = fixture.cases.filter((entry) => entry.sdk === 'node' && entry.node_builder_input);

  assert.ok(nodeCases.length >= 5);

  for (const entry of nodeCases) {
    const payload = handrail.buildAnalyticsPayload(entry.node_builder_input, config);

    assert.ok(payload, `${entry.id} did not build a payload`);
    assertSubset(payload, entry.expected_server_contract, entry.id);
    assertSubset(payload, entry.expected_node_contract, `${entry.id} node contract`);
    assert.equal(payload.event_id, entry.node_builder_input.eventId);
    assert.equal(payload.dedupe_key, payload.event_id);
    assert.equal(payload.privacy.silent_client_failures, true);
    assertDoesNotIncludeRawPrivacyValues(payload, fixture, entry.id);
  }
});

test('Node SDK consumes canonical durable assignment fixture cases', async () => {
  const fixture = loadCanonicalFixture();
  const assignmentCase = fixtureCase(fixture, 'node_durable_assignment_request');
  const noExposureCase = fixtureCase(fixture, 'node_assignment_only_no_exposure');
  const exposureCase = fixtureCase(fixture, 'node_durable_assignment_explicit_exposure');
  const conversionCase = fixtureCase(fixture, 'node_durable_assignment_attributed_conversion');
  const overrideCase = fixtureCase(fixture, 'node_override_metadata_sanitization');
  const durable = fixture.shared_context.node_durable_assignment;
  const assignmentPosts = [];
  const ingestPosts = [];

  const client = handrail.createClient(durableAssignmentConfig(fixture, {
    fetch: async (url, init = {}) => {
      const request = {
        url: String(url),
        method: init.method,
        headers: init.headers || {},
        body: JSON.parse(init.body)
      };
      if (String(url).includes('/experiments/assign')) {
        assignmentPosts.push(request);
        return {
          ok: true,
          status: 200,
          json: async () => assignmentCase.assignment_response
        };
      }
      ingestPosts.push(request);
      return {
        ok: true,
        status: 202,
        json: async () => ({ ok: true })
      };
    }
  }));

  const assignment = await client.assignExperiment(
    assignmentCase.node_assignment_input.experimentKey,
    assignmentCase.node_assignment_input.options
  );

  assert.equal(assignmentPosts.length, 1);
  const assignmentPost = assignmentPosts[0];
  assert.equal(assignmentPost.url, assignmentCase.expected_transport.url);
  assert.equal(assignmentPost.method, assignmentCase.expected_transport.method);
  for (const [header, value] of Object.entries(assignmentCase.expected_transport.headers)) {
    assert.equal(assignmentPost.headers[header], value, `assignment header ${header}`);
  }
  for (const header of assignmentCase.expected_transport.absent_headers) {
    assert.equal(assignmentPost.headers[header], undefined, `assignment should not include ${header}`);
  }
  assertSubset(assignmentPost.body, assignmentCase.expected_assignment_request, 'assignment request');
  assert.equal(assignmentPost.body.visitor_id, undefined);
  assert.equal(assignmentPost.body.session_id, undefined);
  assert.equal(JSON.stringify(assignmentPost.body).includes(durable.apm_token), false);
  assertDoesNotIncludeRawPrivacyValues(assignmentPost.body, fixture, assignmentCase.id);

  assertSubset(assignment, assignmentCase.expected_assignment, 'assignment response');
  assert.equal(assignment.privacy.exposure_recorded, false);
  assert.equal(client.getAnalyticsStats().pending, noExposureCase.expected_analytics_queue_delta);
  assert.equal(client.getAnalyticsStats().queued, noExposureCase.expected_analytics_queue_delta);
  assert.equal(client._analyticsQueue.some((event) => event.event_kind === noExposureCase.expected_no_event_kind), false);
  assert.equal(await client.flush(), true);
  assert.equal(ingestPosts.length, 0);

  const exposureId = client.trackExperimentExposure(
    assignment,
    exposureCase.node_helper_input.properties,
    exposureCase.node_helper_input.options
  );
  assignment.conversion(
    conversionCase.node_helper_input.eventName,
    conversionCase.node_helper_input.properties,
    conversionCase.node_helper_input.options
  );

  assert.equal(exposureId, exposureCase.node_helper_input.options.eventId);
  assert.equal(client.getAnalyticsStats().pending, 2);
  assert.equal(await client.flush(), true);
  assert.equal(ingestPosts.length, 2);

  for (const request of ingestPosts) {
    assert.equal(request.url, durable.analytics_endpoint);
    assert.equal(request.method, 'POST');
    assert.equal(request.headers['x-handrail-analytics-key'], durable.analytics_key);
    assert.equal(request.headers.authorization, `Bearer ${durable.analytics_key}`);
    assert.equal(request.headers['x-handrail-apm-token'], undefined);
    assert.equal(request.body.key, durable.analytics_key);
    assert.equal(request.body.event_type, undefined);
    assert.equal(request.body.event.event_type, undefined);
    assert.equal(JSON.stringify(request.body).includes(durable.apm_token), false);
  }

  const exposure = ingestPosts[0].body.event;
  assertSubset(exposure, exposureCase.expected_node_contract, exposureCase.id);
  assert.equal(exposure.experiment.exposure_id, exposureCase.node_helper_input.options.exposureId);
  assert.deepEqual(exposure.experiment.override_metadata, overrideCase.expected_sanitized_override_metadata);
  assertDoesNotIncludeRawPrivacyValues(exposure, fixture, exposureCase.id);

  const conversion = ingestPosts[1].body.event;
  assertSubset(conversion, conversionCase.expected_node_contract, conversionCase.id);
  assert.equal(conversion.conversion.conversion_id, conversionCase.node_helper_input.options.conversionId);
  assert.equal(conversion.conversion.conversion_name, conversionCase.node_helper_input.eventName);
  assert.equal(conversion.experiment.assignment_id, assignment.assignmentId);
  assertDoesNotIncludeRawPrivacyValues(conversion, fixture, conversionCase.id);

  for (const key of overrideCase.expected_absent_keys) {
    assert.equal(JSON.stringify(exposure.experiment.override_metadata).includes(`"${key}"`), false);
  }
  for (const value of overrideCase.expected_absent_values) {
    assert.equal(JSON.stringify(exposure.experiment.override_metadata).includes(value), false);
    assert.equal(JSON.stringify(conversion.experiment.override_metadata).includes(value), false);
  }

  await client.shutdown();
});
