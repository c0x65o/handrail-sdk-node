const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const sdk = require('../src/index.cjs');

const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures', 'assistant-change-bridge-v1-contract.json'),
  'utf8'
));

function operation(name) {
  return fixture.operations.find((entry) => entry.name === name);
}

function fixtureResponse(entry) {
  if (!entry.response_from) return entry.response;
  const [operationName, ...segments] = entry.response_from.split('.');
  let value = operation(operationName).response;
  for (const segment of segments) value = value[segment];
  return value;
}

function jsonResponse(payload, status = 200, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] || null },
    text: async () => payload === null ? '' : JSON.stringify(payload)
  };
}

function enabledOptions(fetch) {
  return {
    enabled: true,
    apiUrl: 'https://handrail.example.test/api/assistant-change-bridge/v1/',
    version: 'v1',
    projectId: 'project-001',
    capabilityId: 'capability-001',
    token: 'server-only-bridge-secret',
    retryBaseDelayMs: 0,
    retryMaxDelayMs: 0,
    fetch
  };
}

test('deterministic fixtures keep REST, MCP, CommonJS, and v1 response contracts in parity', async () => {
  const calls = [];
  const client = sdk.createAssistantChangeBridgeClient(enabledOptions(async (url, init) => {
    const entry = fixture.operations[calls.length];
    calls.push({ url, init, entry });
    return jsonResponse(fixtureResponse(entry), entry.name === 'submit' ? 201 : 200);
  }));

  const results = [];
  results.push(await client.discover(operation('discover').mcp.input));
  results.push(await client.submit(operation('submit').mcp.input));
  results.push(await client.lookup(operation('lookup').mcp.input));
  results.push(await client.clarify(operation('clarify').mcp.input));
  results.push(await client.cancel(operation('cancel').mcp.input));

  assert.deepEqual(results, fixture.operations.map(fixtureResponse));
  assert.equal(client.getConfig().apiUrl, 'https://handrail.example.test/api/assistant-change-bridge/v1');
  assert.equal(client.getConfig().hasToken, true);
  assert.equal('token' in client.getConfig(), false);
  assert.doesNotMatch(JSON.stringify(client), /server-only-bridge-secret/);
  assert.deepEqual(Object.getOwnPropertySymbols(client), []);

  for (const { url, init, entry } of calls) {
    assert.equal(url, `${client.getConfig().apiUrl}/${entry.rest.path}`);
    assert.equal(init.method, entry.rest.method);
    assert.equal(init.headers.authorization, 'Bearer server-only-bridge-secret');
    assert.equal(init.headers['x-handrail-principal-issuer'], entry.mcp.input.issuer);
    assert.equal(init.headers['x-handrail-principal-subject'], entry.mcp.input.subject);

    const body = init.body ? JSON.parse(init.body) : {};
    const restContractInput = {
      ...body,
      issuer: init.headers['x-handrail-principal-issuer'],
      subject: init.headers['x-handrail-principal-subject']
    };
    if (entry.mcp.input.request_id) restContractInput.request_id = entry.mcp.input.request_id;
    assert.deepEqual(restContractInput, entry.mcp.input, `${entry.name} REST and MCP inputs diverged`);
  }
});

test('ESM named/default and CommonJS bridge exports have identity parity', async () => {
  const esm = await import('@handrail/sdk-node');
  assert.equal(esm.HandrailAssistantChangeBridgeClient, sdk.HandrailAssistantChangeBridgeClient);
  assert.equal(esm.HandrailAssistantChangeBridgeError, sdk.HandrailAssistantChangeBridgeError);
  assert.equal(esm.createAssistantChangeBridgeClient, sdk.createAssistantChangeBridgeClient);
  assert.equal(esm.loadAssistantChangeBridgeConfigFromEnv, sdk.loadAssistantChangeBridgeConfigFromEnv);
  assert.equal(esm.default.createAssistantChangeBridgeClient, sdk.createAssistantChangeBridgeClient);
});

test('idempotent submission retries with the same key and payload', async () => {
  const calls = [];
  const expected = operation('submit');
  const client = sdk.createAssistantChangeBridgeClient({
    ...enabledOptions(async (url, init) => {
      calls.push({ url, init });
      return calls.length === 1
        ? jsonResponse({ error: 'temporarily unavailable' }, 503)
        : jsonResponse({ ...expected.response, replayed: true });
    }),
    maxRetries: 1
  });

  const result = await client.submit(expected.mcp.input);
  assert.equal(result.replayed, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers['idempotency-key'], expected.mcp.input.idempotency_key);
  assert.equal(calls[1].init.headers['idempotency-key'], expected.mcp.input.idempotency_key);
  assert.equal(calls[0].init.body, calls[1].init.body);
});

test('clarification is not retried and error details redact server secrets', async () => {
  let calls = 0;
  const client = sdk.createAssistantChangeBridgeClient({
    ...enabledOptions(async () => {
      calls += 1;
      return jsonResponse({
        error: 'temporarily unavailable',
        code: 'dependency_unavailable',
        token: 'response-secret',
        nested: { api_key: 'also-secret', safe: 'visible' }
      }, 503);
    }),
    maxRetries: 3
  });

  await assert.rejects(
    client.clarify(operation('clarify').mcp.input),
    (error) => {
      assert.equal(error.code, 'dependency_unavailable');
      assert.equal(error.retryable, true);
      assert.equal(error.response.token, '[REDACTED]');
      assert.equal(error.response.nested.api_key, '[REDACTED]');
      assert.equal(error.response.nested.safe, 'visible');
      assert.doesNotMatch(JSON.stringify(error), /response-secret|also-secret|server-only-bridge-secret/);
      return true;
    }
  );
  assert.equal(calls, 1);
});

test('absent or incomplete configuration is disabled-safe and makes no requests', async () => {
  let calls = 0;
  const client = sdk.createAssistantChangeBridgeClient({ fetch: async () => { calls += 1; } });

  assert.equal(client.isEnabled(), false);
  assert.equal(client.getConfig().disabledReason, 'disabled');
  assert.deepEqual(client.getConfig().missingConfig, ['apiUrl', 'version', 'projectId', 'capabilityId', 'token']);
  assert.equal(await client.discover(), null);
  assert.equal(await client.submit(), null);
  assert.equal(await client.lookup(), null);
  assert.equal(await client.clarify(), null);
  assert.equal(await client.cancel(), null);
  assert.equal(calls, 0);

  const loaded = sdk.loadAssistantChangeBridgeConfigFromEnv({
    HANDRAIL_ASSISTANT_BRIDGE_ENABLED: 'true',
    HANDRAIL_ASSISTANT_BRIDGE_API_URL: 'https://handrail.example.test/api/assistant-change-bridge/v1',
    HANDRAIL_ASSISTANT_BRIDGE_VERSION: 'v1',
    HANDRAIL_ASSISTANT_BRIDGE_PROJECT_ID: 'project-001',
    HANDRAIL_ASSISTANT_BRIDGE_CAPABILITY_ID: 'capability-001',
    HANDRAIL_ASSISTANT_BRIDGE_TOKEN: 'must-not-leak'
  });
  assert.equal(loaded.enabled, true);
  assert.equal(loaded.hasToken, true);
  assert.equal('token' in loaded, false);
  assert.doesNotMatch(JSON.stringify(loaded), /must-not-leak/);
});

test('enabled clients require stable principal, conversation, idempotency, and intake-only metadata before fetch', async () => {
  let calls = 0;
  const client = sdk.createAssistantChangeBridgeClient(enabledOptions(async () => { calls += 1; }));

  await assert.rejects(client.discover({ issuer: 'issuer-only' }), /principal_subject is required/);
  await assert.rejects(client.submit({
    ...fixture.principal,
    idempotency_key: 'stable-key',
    requested_mode: 'feature',
    requested_delivery_ceiling: 'intake_only',
    title: 'Missing conversation'
  }), /external_conversation_id is required/);
  await assert.rejects(client.submit({
    ...operation('submit').mcp.input,
    requested_delivery_ceiling: 'production'
  }), /intake_only delivery only/);
  assert.equal(calls, 0);
});

test('contract guard rejects untruthful terminal flags', async () => {
  const untruthful = { ...operation('clarify').response, status: 'pending', terminal: true };
  const client = sdk.createAssistantChangeBridgeClient(enabledOptions(async () => jsonResponse(untruthful)));
  await assert.rejects(
    client.lookup(operation('lookup').mcp.input),
    (error) => error.code === 'assistant_bridge_contract_mismatch'
  );
});
