const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const packageJson = require('../package.json');

const LEGACY_PUBLIC_EXPORTS = [
  'HandrailApmClient',
  'SDK_NAME',
  'SDK_VERSION',
  'addBreadcrumb',
  'assignExperiment',
  'buildAnalyticsPayload',
  'captureEvent',
  'captureException',
  'captureMessage',
  'captureSpan',
  'createClient',
  'experiment',
  'expressAnalyticsMiddleware',
  'expressErrorHandler',
  'expressMiddleware',
  'flush',
  'getAnalyticsConfig',
  'getAnalyticsStats',
  'getConfig',
  'getCurrentClient',
  'getStats',
  'init',
  'installProcessErrorHandlers',
  'loadConfigFromEnv',
  'page',
  'shutdown',
  'track',
  'trackConversion',
  'trackExperimentExposure',
  'uninstallProcessErrorHandlers'
];

const SIGNALS_ALIASES = {
  HandrailSignalsClient: 'HandrailApmClient',
  createSignalsClient: 'createClient'
};

const OPERATION_PUBLIC_EXPORTS = [
  'buildOperationErrorEnvelope',
  'buildOperationSuccessEnvelope',
  'verifyOperationInvocationSignature'
];

test('package self-reference resolves the canonical @handrail/sdk-node entrypoints', async () => {
  const cjs = require('@handrail/sdk-node');
  const esm = await import('@handrail/sdk-node');

  assert.equal(packageJson.name, '@handrail/sdk-node');
  assert.equal(cjs.SDK_NAME, packageJson.name);
  assert.equal(cjs.SDK_VERSION, packageJson.version);
  assert.equal(esm.SDK_NAME, packageJson.name);
  assert.equal(esm.SDK_VERSION, packageJson.version);
  assert.equal(esm.default.SDK_NAME, packageJson.name);
  assert.equal(esm.default.SDK_VERSION, packageJson.version);
  assert.equal(require.resolve('@handrail/sdk-node'), path.join(__dirname, '..', 'src', 'index.cjs'));
});

test('CommonJS, ESM named, and ESM default exports preserve legacy names', async () => {
  const cjs = require('@handrail/sdk-node');
  const esm = await import('@handrail/sdk-node');

  for (const exportName of LEGACY_PUBLIC_EXPORTS) {
    assert.ok(exportName in cjs, `missing CommonJS export ${exportName}`);
    assert.ok(exportName in esm, `missing ESM named export ${exportName}`);
    assert.ok(exportName in esm.default, `missing ESM default export ${exportName}`);
    assert.equal(
      typeof esm[exportName],
      typeof cjs[exportName],
      `ESM named export ${exportName} changed type`
    );
    assert.equal(
      typeof esm.default[exportName],
      typeof cjs[exportName],
      `ESM default export ${exportName} changed type`
    );
  }

  assert.equal(esm.HandrailApmClient, cjs.HandrailApmClient);
  assert.equal(esm.default.HandrailApmClient, cjs.HandrailApmClient);
  assert.equal(esm.default.createClient, cjs.createClient);
  assert.equal(esm.default.assignExperiment, cjs.assignExperiment);
  assert.equal(esm.default.trackExperimentExposure, cjs.trackExperimentExposure);
});

test('Signals-facing aliases are additive and identity-compatible across entrypoints', async () => {
  const cjs = require('@handrail/sdk-node');
  const esm = await import('@handrail/sdk-node');

  for (const [aliasName, targetName] of Object.entries(SIGNALS_ALIASES)) {
    assert.ok(aliasName in cjs, `missing CommonJS alias ${aliasName}`);
    assert.ok(aliasName in esm, `missing ESM named alias ${aliasName}`);
    assert.ok(aliasName in esm.default, `missing ESM default alias ${aliasName}`);
    assert.equal(cjs[aliasName], cjs[targetName], `CommonJS ${aliasName} is not ${targetName}`);
    assert.equal(esm[aliasName], cjs[targetName], `ESM named ${aliasName} is not ${targetName}`);
    assert.equal(esm.default[aliasName], cjs[targetName], `ESM default ${aliasName} is not ${targetName}`);
  }
});

test('operation invocation helpers are exported across entrypoints', async () => {
  const cjs = require('@handrail/sdk-node');
  const esm = await import('@handrail/sdk-node');

  for (const exportName of OPERATION_PUBLIC_EXPORTS) {
    assert.equal(typeof cjs[exportName], 'function', `missing CommonJS operation helper ${exportName}`);
    assert.equal(typeof esm[exportName], 'function', `missing ESM named operation helper ${exportName}`);
    assert.equal(typeof esm.default[exportName], 'function', `missing ESM default operation helper ${exportName}`);
    assert.equal(esm[exportName], cjs[exportName], `ESM named ${exportName} is not CommonJS export`);
    assert.equal(esm.default[exportName], cjs[exportName], `ESM default ${exportName} is not CommonJS export`);
  }
});

test('TypeScript declarations cover legacy names and Signals aliases', () => {
  const declarations = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'index.d.ts'),
    'utf8'
  );

  for (const exportName of LEGACY_PUBLIC_EXPORTS) {
    assert.match(declarations, new RegExp(`\\b${exportName}\\b`), `missing declaration for ${exportName}`);
  }

  assert.match(declarations, /export declare const HandrailSignalsClient: typeof HandrailApmClient;/);
  assert.match(declarations, /export declare const createSignalsClient: typeof createClient;/);
  assert.match(declarations, /HandrailSignalsClient: typeof HandrailSignalsClient;/);
  assert.match(declarations, /createSignalsClient: typeof createSignalsClient;/);
  assert.match(declarations, /export declare const SDK_NAME: '@handrail\/sdk-node';/);
  assert.match(declarations, /declare const sdk: \{/);

  for (const exportName of OPERATION_PUBLIC_EXPORTS) {
    assert.match(declarations, new RegExp(`\\b${exportName}\\b`), `missing declaration for ${exportName}`);
    assert.match(declarations, new RegExp(`${exportName}: typeof ${exportName};`), `missing sdk declaration for ${exportName}`);
  }
});
