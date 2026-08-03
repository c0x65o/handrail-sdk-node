import {
  HandrailAssistantChangeBridgeClient,
  HandrailAssistantChangeBridgeError,
  createAssistantChangeBridgeClient,
  loadAssistantChangeBridgeConfigFromEnv,
  type HandrailAssistantChangeBridgeCancelInput,
  type HandrailAssistantChangeBridgeClarifyInput,
  type HandrailAssistantChangeBridgeDiscovery,
  type HandrailAssistantChangeBridgeLookupInput,
  type HandrailAssistantChangeBridgeRequest,
  type HandrailAssistantChangeBridgeSubmitInput,
  type HandrailAssistantChangeBridgeSubmitResponse,
} from '@handrail/sdk-node';

const principal = {
  issuer: 'https://assistant.example.test',
  subject: 'principal-001',
} as const;

const submitInput: HandrailAssistantChangeBridgeSubmitInput = {
  ...principal,
  idempotency_key: 'conversation-1:turn-1',
  external_conversation_id: 'conversation-1',
  requested_mode: 'feature',
  requested_delivery_ceiling: 'intake_only',
  title: 'A bounded feature',
};
const lookupInput: HandrailAssistantChangeBridgeLookupInput = { ...principal, request_id: 'request-1' };
const clarifyInput: HandrailAssistantChangeBridgeClarifyInput = { ...lookupInput, response: 'Clarifying detail' };
const cancelInput: HandrailAssistantChangeBridgeCancelInput = { ...lookupInput, reason: 'Withdrawn' };

const client: HandrailAssistantChangeBridgeClient = createAssistantChangeBridgeClient({
  enabled: true,
  apiUrl: 'https://handrail.example.test/api/assistant-change-bridge/v1',
  version: 'v1',
  projectId: 'project-1',
  capabilityId: 'capability-1',
  token: 'server-only-token',
});

const discovery: Promise<HandrailAssistantChangeBridgeDiscovery | null> = client.discover(principal);
const submission: Promise<HandrailAssistantChangeBridgeSubmitResponse | null> = client.submit(submitInput);
const lookup: Promise<HandrailAssistantChangeBridgeRequest | null> = client.lookup(lookupInput);
const clarification: Promise<HandrailAssistantChangeBridgeRequest | null> = client.clarify(clarifyInput);
const cancellation: Promise<HandrailAssistantChangeBridgeRequest | null> = client.cancel(cancelInput);
const config = loadAssistantChangeBridgeConfigFromEnv({});
const bridgeError: HandrailAssistantChangeBridgeError = new HandrailAssistantChangeBridgeError('test');

void [discovery, submission, lookup, clarification, cancellation, config.hasToken, bridgeError.retryable];
