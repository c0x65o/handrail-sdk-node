const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');

const handrail = require('../src/index.cjs');

const SECRET = 'hop_test_secret_123';
const NOW = '2026-06-11T14:45:00.000Z';

function baseRequest(overrides = {}) {
  const rawBody = Buffer.from(JSON.stringify({
    version: 1,
    input: { invoice_id: 'inv_123' },
    context: {
      project_id: 'project-uuid',
      environment: 'production',
      tool_name: 'billing.refund_invoice',
      tool_version: '1',
      invocation_id: 'invocation-uuid',
      request_id: 'request-uuid',
      audit_id: 'audit-uuid',
      dry_run: false
    }
  }));
  const bodySha256 = crypto.createHash('sha256').update(rawBody).digest('hex');
  const headers = {
    'X-Handrail-Project-Id': 'project-uuid',
    'X-Handrail-Environment': 'production',
    'X-Handrail-Tool-Name': 'billing.refund_invoice',
    'X-Handrail-Tool-Version': '1',
    'X-Handrail-Invocation-Id': 'invocation-uuid',
    'X-Handrail-Request-Id': 'request-uuid',
    'X-Handrail-Audit-Id': 'audit-uuid',
    'X-Handrail-Timestamp': NOW,
    'X-Handrail-Body-SHA256': bodySha256,
    'X-Handrail-Signature-Key-Id': 'hop_live_key_123',
    'X-Handrail-Timeout-Ms': '30000',
    'X-Handrail-Dry-Run': 'false',
    'Idempotency-Key': 'hop:project-uuid:production:billing.refund_invoice:invocation-uuid',
    ...(overrides.headers || {})
  };

  const request = {
    method: overrides.method || 'post',
    pathAndQuery: overrides.pathAndQuery || '/operations/billing/refund?attempt=1',
    rawBody: overrides.rawBody || rawBody,
    headers
  };
  request.headers['X-Handrail-Signature'] = signRequest({
    ...request,
    headers,
    secret: overrides.secret || SECRET
  });
  if (overrides.afterSignHeaders) {
    Object.assign(request.headers, overrides.afterSignHeaders);
  }
  if (overrides.afterSignRawBody) {
    request.rawBody = overrides.afterSignRawBody;
  }
  return request;
}

function signRequest({ method, pathAndQuery, headers, secret }) {
  const get = (name) => headers[name] || headers[name.toLowerCase()];
  const canonical = [
    'HANDRAIL-OPERATION-V1',
    method.toUpperCase(),
    pathAndQuery,
    get('X-Handrail-Timestamp'),
    get('X-Handrail-Project-Id'),
    get('X-Handrail-Environment'),
    get('X-Handrail-Tool-Name'),
    get('X-Handrail-Tool-Version'),
    get('X-Handrail-Invocation-Id'),
    get('X-Handrail-Request-Id'),
    get('X-Handrail-Audit-Id'),
    get('X-Handrail-Dry-Run'),
    get('Idempotency-Key') || '',
    get('X-Handrail-Body-SHA256')
  ].join('\n');
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('base64url');
  return `v1,hmac-sha256,${signature}`;
}

async function verify(request, overrides = {}) {
  return handrail.verifyOperationInvocationSignature({
    ...request,
    now: NOW,
    signingSecret: SECRET,
    expected: {
      projectId: 'project-uuid',
      environment: 'production',
      toolName: 'billing.refund_invoice',
      toolVersion: '1'
    },
    ...overrides
  });
}

test('verifies a valid operation invocation signature and returns safe context', async () => {
  const request = baseRequest();
  const result = await verify(request);

  assert.equal(result.ok, true);
  assert.equal(result.context.method, 'POST');
  assert.equal(result.context.pathAndQuery, '/operations/billing/refund?attempt=1');
  assert.equal(result.context.projectId, 'project-uuid');
  assert.equal(result.context.environment, 'production');
  assert.equal(result.context.toolName, 'billing.refund_invoice');
  assert.equal(result.context.toolVersion, '1');
  assert.equal(result.context.invocationId, 'invocation-uuid');
  assert.equal(result.context.requestId, 'request-uuid');
  assert.equal(result.context.auditId, 'audit-uuid');
  assert.equal(result.context.signatureKeyId, 'hop_live_key_123');
  assert.equal(result.context.dryRun, false);
  assert.equal(result.context.idempotencyKey, 'hop:project-uuid:production:billing.refund_invoice:invocation-uuid');
  assert.match(result.context.bodySha256, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(result).includes(SECRET), false);
  assert.equal(JSON.stringify(result).includes('HANDRAIL-OPERATION-V1'), false);
});

test('looks up signing keys case-insensitively and accepts scoped credentials', async () => {
  const request = baseRequest();
  const headers = {};
  for (const [key, value] of Object.entries(request.headers)) {
    headers[key.toLowerCase()] = value;
  }
  request.headers = headers;

  const result = await handrail.verifyOperationInvocationSignature({
    ...request,
    now: NOW,
    lookupSigningKey: async (keyId, context) => {
      assert.equal(keyId, 'hop_live_key_123');
      assert.equal(context.toolName, 'billing.refund_invoice');
      return {
        signingSecret: SECRET,
        enabled: true,
        expiresAt: '2026-06-11T15:45:00.000Z',
        scope: {
          projectId: 'project-uuid',
          environment: 'production',
          toolName: 'billing.refund_invoice',
          toolVersion: '1'
        }
      };
    }
  });

  assert.equal(result.ok, true);
});

test('rejects invalid signatures without exposing signature material', async () => {
  const request = baseRequest({
    afterSignHeaders: {
      'X-Handrail-Signature': 'v1,hmac-sha256,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    }
  });
  const result = await verify(request);

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'operation_signature_invalid');
  assert.equal(result.error.category, 'auth');
  assert.equal(result.error.reason, 'signature_mismatch');
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(SECRET), false);
  assert.equal(serialized.includes('HANDRAIL-OPERATION-V1'), false);
  assert.equal(serialized.includes(request.headers['X-Handrail-Signature']), false);
});

test('rejects missing required Handrail headers', async () => {
  const request = baseRequest();
  delete request.headers['X-Handrail-Audit-Id'];
  const result = await verify(request);

  assert.equal(result.ok, false);
  assert.equal(result.error.reason, 'missing_required_header');
  assert.deepEqual(result.error.details, { header: 'x-handrail-audit-id' });
});

test('rejects body hash mismatches over exact raw bytes', async () => {
  const request = baseRequest({
    afterSignRawBody: Buffer.from('{"version":1,"input":{"invoice_id":"inv_999"}}')
  });
  const result = await verify(request);

  assert.equal(result.ok, false);
  assert.equal(result.error.reason, 'body_hash_mismatch');
});

test('rejects stale and future timestamps outside the replay window', async () => {
  const stale = baseRequest({
    headers: {
      'X-Handrail-Timestamp': '2026-06-11T14:35:00.000Z'
    }
  });
  const future = baseRequest({
    headers: {
      'X-Handrail-Timestamp': '2026-06-11T14:55:01.000Z'
    }
  });

  assert.equal((await verify(stale)).error.reason, 'timestamp_stale');
  assert.equal((await verify(future)).error.reason, 'timestamp_in_future');
});

test('rejects unknown, disabled, and expired signing keys from lookup callbacks', async () => {
  const request = baseRequest();

  const unknown = await handrail.verifyOperationInvocationSignature({
    ...request,
    now: NOW,
    lookupSigningKey: () => null
  });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.reason, 'credential_unknown');

  const disabled = await handrail.verifyOperationInvocationSignature({
    ...request,
    now: NOW,
    lookupSigningKey: () => ({ signingSecret: SECRET, enabled: false })
  });
  assert.equal(disabled.ok, false);
  assert.equal(disabled.error.reason, 'credential_disabled');

  const expired = await handrail.verifyOperationInvocationSignature({
    ...request,
    now: NOW,
    lookupSigningKey: () => ({ signingSecret: SECRET, expiresAt: '2026-06-11T14:44:59.000Z' })
  });
  assert.equal(expired.ok, false);
  assert.equal(expired.error.reason, 'credential_expired');
});

test('rejects endpoint expected scope and credential scope mismatches', async () => {
  const request = baseRequest();

  const expectedScopeMismatch = await verify(request, {
    expected: {
      projectId: 'project-uuid',
      environment: 'staging',
      toolName: 'billing.refund_invoice'
    }
  });
  assert.equal(expectedScopeMismatch.ok, false);
  assert.equal(expectedScopeMismatch.error.code, 'operation_scope_forbidden');
  assert.equal(expectedScopeMismatch.error.reason, 'scope_mismatch');
  assert.deepEqual(expectedScopeMismatch.error.details, { mismatches: ['environment'] });

  const credentialScopeMismatch = await handrail.verifyOperationInvocationSignature({
    ...request,
    now: NOW,
    lookupSigningKey: () => ({
      signingSecret: SECRET,
      projectId: 'project-uuid',
      environment: 'production',
      toolName: 'billing.void_invoice'
    })
  });
  assert.equal(credentialScopeMismatch.ok, false);
  assert.equal(credentialScopeMismatch.error.code, 'operation_scope_forbidden');
  assert.equal(credentialScopeMismatch.error.reason, 'credential_scope_mismatch');
});

test('allows missing idempotency key by signing an empty canonical line', async () => {
  const request = baseRequest();
  delete request.headers['Idempotency-Key'];
  request.headers['X-Handrail-Signature'] = signRequest({
    ...request,
    headers: request.headers,
    secret: SECRET
  });

  const result = await verify(request);

  assert.equal(result.ok, true);
  assert.equal(result.context.idempotencyKey, null);
});

test('builds success and error envelopes with audit echo and bounded safe details', () => {
  const context = {
    invocationId: 'invocation-uuid',
    auditId: 'audit-uuid',
    requestId: 'request-uuid',
    idempotencyKey: 'hop:project-uuid:production:billing.refund_invoice:invocation-uuid',
    dryRun: true
  };

  const success = handrail.buildOperationSuccessEnvelope({
    result: {
      version: 1,
      status: 'completed',
      summary: 'Refund queued'
    },
    context
  });
  assert.deepEqual(success, {
    ok: true,
    result: {
      version: 1,
      status: 'completed',
      summary: 'Refund queued'
    },
    audit: {
      invocation_id: 'invocation-uuid',
      audit_id: 'audit-uuid',
      request_id: 'request-uuid',
      idempotency_key: 'hop:project-uuid:production:billing.refund_invoice:invocation-uuid',
      dry_run: true
    }
  });

  const error = handrail.buildOperationErrorEnvelope({
    error: {
      code: 'idempotency_conflict',
      category: 'conflict',
      message: 'The idempotency key was already used for a different request.',
      retryable: false,
      details: {
        safe_reason: 'request_hash_mismatch',
        token: 'secret-token',
        nested: {
          signature: 'raw-signature'
        }
      }
    },
    context
  });
  assert.equal(error.ok, false);
  assert.equal(error.error.code, 'idempotency_conflict');
  assert.equal(error.error.category, 'conflict');
  assert.equal(error.error.retryable, false);
  assert.deepEqual(error.error.details, {
    safe_reason: 'request_hash_mismatch',
    token: '[REDACTED]',
    nested: {
      signature: '[REDACTED]'
    }
  });
  assert.equal(error.audit.dry_run, true);

  assert.throws(() => handrail.buildOperationErrorEnvelope({
    code: 'BadCode',
    category: 'validation',
    message: 'bad',
    retryable: false,
    context
  }), /lower snake case/);
  assert.throws(() => handrail.buildOperationErrorEnvelope({
    code: 'operation_failed',
    category: 'not_allowed',
    message: 'bad',
    retryable: false,
    context
  }), /category/);
  assert.throws(() => handrail.buildOperationErrorEnvelope({
    code: 'operation_failed',
    category: 'application',
    message: 'bad',
    context
  }), /retryable/);
});
