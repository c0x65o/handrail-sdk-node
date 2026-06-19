export type HandrailApmEventType = 'transaction' | 'request' | 'exception' | 'message' | 'span';
export type HandrailAnalyticsEventType = 'page' | 'request' | 'track' | 'conversion' | 'experiment' | string;
export type HandrailApmLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal' | string;
export type HandrailApmEndpointMode = 'gateway' | 'direct';
export type HandrailQuickBooksServiceEnvironment = 'staging' | 'production';
export type HandrailQuickBooksProviderMode = 'sandbox' | 'production';
export type HandrailScrubberHook<T = unknown> = (
  value: T,
  context: { field?: string; eventType?: HandrailApmEventType; defaultSampleRate?: number }
) => T | null | false | undefined;
export type HandrailSamplerHook = (
  event: HandrailApmEvent,
  context: { eventType: HandrailApmEventType; defaultSampleRate: number }
) => boolean | undefined;
export type HandrailAnalyticsRouteNormalizer = (
  path: string,
  context: { eventKind?: string; path?: string; rawEvent?: HandrailAnalyticsInput }
) => string | null | undefined;

export interface HandrailApmOptions {
  enabled?: boolean;
  endpoint?: string;
  endpointMode?: HandrailApmEndpointMode | string;
  endpoint_mode?: HandrailApmEndpointMode | string;
  directEndpoint?: string;
  direct_endpoint?: string;
  directFallbackEndpoint?: string;
  direct_fallback_endpoint?: string;
  token?: string;
  project?: string;
  env?: string;
  environment?: string;
  service?: string;
  release?: string;
  analytics?: HandrailAnalyticsOptions;
  analyticsEnabled?: boolean;
  analyticsEndpoint?: string;
  analyticsAssignmentEndpoint?: string;
  analyticsExperimentAssignmentEndpoint?: string;
  analyticsPublicKey?: string;
  analyticsWriteKey?: string;
  analyticsKey?: string;
  analyticsProject?: string;
  analyticsEnv?: string;
  analyticsEnvironment?: string;
  analyticsSourceId?: string;
  analyticsSourceKind?: 'web' | 'server' | 'mobile' | string;
  analyticsService?: string;
  analyticsServiceEnv?: string;
  analyticsServiceEnvId?: string;
  analyticsDeployTargetId?: string;
  analyticsRelease?: string;
  analyticsSampleRate?: number;
  analyticsAllowedEventTypes?: HandrailAnalyticsEventType[] | string;
  analyticsRouteNormalizer?: HandrailAnalyticsRouteNormalizer;
  analyticsCustomPropertyAllowlist?: string[] | string;
  analyticsMaxBodyBytes?: number;
  sampleRate?: number;
  requestSampleRate?: number;
  transactionSampleRate?: number;
  exceptionSampleRate?: number;
  messageSampleRate?: number;
  spanSampleRate?: number;
  allowedEventTypes?: HandrailApmEventType[] | string;
  scrubberConfig?: Record<string, unknown> | string;
  scrubbers?: {
    headers?: HandrailScrubberHook<Record<string, unknown>>;
    url?: HandrailScrubberHook<string>;
    queryParams?: HandrailScrubberHook<Record<string, unknown>>;
    message?: HandrailScrubberHook<string>;
    breadcrumb?: HandrailScrubberHook<HandrailBreadcrumb>;
    tags?: HandrailScrubberHook<Record<string, unknown>>;
  };
  scrubHeaders?: HandrailScrubberHook<Record<string, unknown>>;
  scrubUrl?: HandrailScrubberHook<string>;
  scrubQueryParams?: HandrailScrubberHook<Record<string, unknown>>;
  scrubMessage?: HandrailScrubberHook<string>;
  scrubBreadcrumb?: HandrailScrubberHook<HandrailBreadcrumb>;
  scrubTags?: HandrailScrubberHook<Record<string, unknown>>;
  requestSampler?: HandrailSamplerHook;
  transactionSampler?: HandrailSamplerHook;
  exceptionSampler?: HandrailSamplerHook;
  spanSampler?: HandrailSamplerHook;
  maxBreadcrumbs?: number;
  captureUnhandled?: boolean | string;
  captureUnhandledErrors?: boolean | string;
  batchSize?: number;
  maxQueueSize?: number;
  flushIntervalMs?: number;
  requestTimeoutMs?: number;
  fetchTimeoutMs?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  shutdownTimeoutMs?: number;
  fetch?: HandrailFetch;
}

export interface HandrailQuickBooksOptions {
  serviceEnvironment?: HandrailQuickBooksServiceEnvironment | 'stage' | 'prod' | string;
  service_environment?: HandrailQuickBooksOptions['serviceEnvironment'];
  providerMode?: HandrailQuickBooksProviderMode | string;
  provider_mode?: HandrailQuickBooksOptions['providerMode'];
  tenantId?: string;
  tenant_id?: string;
  apiKey?: string;
  api_key?: string;
  baseUrl?: string;
  base_url?: string;
  requestTimeoutMs?: number;
  request_timeout_ms?: number;
  fetchTimeoutMs?: number;
  timeoutMs?: number;
  fetch?: HandrailFetch;
}

export interface HandrailQuickBooksResolvedOptions {
  serviceEnvironment: HandrailQuickBooksServiceEnvironment;
  service_env: HandrailQuickBooksServiceEnvironment;
  serviceUrl: string;
  service_url: string;
  providerMode: HandrailQuickBooksProviderMode;
  provider_mode: HandrailQuickBooksProviderMode;
  tenantId?: string;
  tenant_id?: string;
  apiKey?: string;
  api_key?: string;
  requestTimeoutMs: number;
  request_timeout_ms: number;
  fetch?: HandrailFetch;
  localOverride: boolean;
  local_override: boolean;
}

export interface HandrailQuickBooksTenantClient {
  readonly tenantId: string;
  request(path: string, init?: HandrailQuickBooksRequestInit): Promise<unknown>;
  status(init?: HandrailQuickBooksRequestInit): Promise<unknown>;
  items(init?: HandrailQuickBooksRequestInit): Promise<unknown>;
  profitAndLoss(init?: HandrailQuickBooksRequestInit): Promise<unknown>;
  sync: {
    start(payload?: Record<string, unknown>, init?: HandrailQuickBooksRequestInit): Promise<unknown>;
    get(jobId: string, init?: HandrailQuickBooksRequestInit): Promise<unknown>;
  };
}

export interface HandrailQuickBooksClient {
  readonly options: HandrailQuickBooksResolvedOptions;
  tenant(tenantId?: string): HandrailQuickBooksTenantClient;
  request(path: string, init?: HandrailQuickBooksRequestInit): Promise<unknown>;
  getConfig(): Pick<
    HandrailQuickBooksResolvedOptions,
    'serviceEnvironment' | 'serviceUrl' | 'providerMode' | 'tenantId' | 'localOverride'
  > & { hasApiKey: boolean; hasTenantId: boolean };
}

export interface HandrailQuickBooksRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: unknown;
  [key: string]: unknown;
}

export interface HandrailAnalyticsOptions {
  enabled?: boolean;
  endpoint?: string;
  assignmentEndpoint?: string;
  assignment_endpoint?: string;
  publicKey?: string;
  writeKey?: string;
  key?: string;
  project?: string;
  env?: string;
  environment?: string;
  sourceId?: string;
  sourceKind?: 'web' | 'server' | 'mobile' | string;
  source_kind?: 'web' | 'server' | 'mobile' | string;
  service?: string;
  serviceEnv?: string;
  service_env?: string;
  serviceEnvId?: string;
  service_env_id?: string;
  deployTargetId?: string;
  deploy_target_id?: string;
  release?: string;
  sampleRate?: number;
  allowedEventTypes?: HandrailAnalyticsEventType[] | string;
  routeNormalizer?: HandrailAnalyticsRouteNormalizer;
  customPropertyAllowlist?: string[] | string;
  maxBodyBytes?: number;
}

export interface HandrailAnalyticsResolvedOptions {
  enabled: boolean;
  disabledReason:
    | 'disabled'
    | 'missing_key'
    | 'missing_endpoint'
    | 'missing_source_id'
    | 'incomplete_config'
    | null;
  missingConfig: string[];
  requestedEnabled?: boolean;
  endpoint?: string;
  assignmentEndpoint?: string;
  assignmentEnabled?: boolean;
  assignmentDisabledReason?:
    | 'disabled'
    | 'missing_key'
    | 'missing_assignment_endpoint'
    | 'missing_source_id'
    | 'incomplete_config'
    | null;
  assignmentMissingConfig?: string[];
  publicKey?: string;
  writeKey?: string;
  key?: string;
  project?: string;
  environment?: string;
  env?: string;
  sourceId?: string;
  sourceKind?: string;
  service?: string;
  serviceEnv?: string;
  release?: string;
  sampleRate: number;
  allowedEventTypes?: string[];
  routeNormalizer?: HandrailAnalyticsRouteNormalizer;
  customPropertyAllowlist?: string[];
  maxBodyBytes: number;
}

export interface HandrailApmResolvedOptions {
  enabled: boolean;
  disabledReason: 'disabled' | 'missing_token' | 'missing_endpoint' | 'incomplete_config' | null;
  missingConfig: string[];
  endpoint?: string;
  endpointMode: HandrailApmEndpointMode;
  endpoint_mode: HandrailApmEndpointMode;
  directEndpoint: string;
  direct_endpoint: string;
  token?: string;
  project?: string;
  environment?: string;
  service?: string;
  release?: string;
  analytics: HandrailAnalyticsResolvedOptions;
  analyticsEnabled: boolean;
  analyticsDisabledReason: HandrailAnalyticsResolvedOptions['disabledReason'];
  analyticsEndpoint?: string;
  analyticsAssignmentEndpoint?: string;
  analyticsPublicKey?: string;
  analyticsWriteKey?: string;
  analyticsKey?: string;
  analyticsEnv?: string;
  analyticsSourceId?: string;
  analyticsSourceKind?: string;
  analyticsServiceEnv?: string;
  analyticsSampleRate: number;
  analyticsAllowedEventTypes?: string[];
  analyticsMaxBodyBytes: number;
  sampleRate: number;
  requestSampleRate?: number;
  exceptionSampleRate?: number;
  messageSampleRate?: number;
  spanSampleRate?: number;
  allowedEventTypes?: string[];
  scrubberConfig: Record<string, unknown>;
  scrubHeaders?: HandrailScrubberHook<Record<string, unknown>>;
  scrubUrl?: HandrailScrubberHook<string>;
  scrubQueryParams?: HandrailScrubberHook<Record<string, unknown>>;
  scrubMessage?: HandrailScrubberHook<string>;
  scrubBreadcrumb?: HandrailScrubberHook<HandrailBreadcrumb>;
  scrubTags?: HandrailScrubberHook<Record<string, unknown>>;
  requestSampler?: HandrailSamplerHook;
  exceptionSampler?: HandrailSamplerHook;
  spanSampler?: HandrailSamplerHook;
  maxBreadcrumbs: number;
  captureUnhandled: boolean;
  batchSize: number;
  maxQueueSize: number;
  flushIntervalMs: number;
  requestTimeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  shutdownTimeoutMs: number;
  fetch?: HandrailFetch;
}

export interface HandrailBreadcrumb {
  timestamp?: string;
  category?: string;
  level?: HandrailApmLevel;
  message?: string;
  data?: Record<string, unknown>;
}

export interface HandrailNormalizedException {
  name: string;
  message: string;
  stack?: string;
  frames?: Array<{ raw: string }>;
  cause?: HandrailNormalizedException;
}

export interface HandrailApmEvent {
  eventId?: string;
  timestamp?: string;
  type?: HandrailApmEventType;
  level?: HandrailApmLevel;
  message?: string;
  exception?: HandrailNormalizedException;
  transaction?: {
    method?: string;
    route?: string;
    path?: string;
    statusCode?: number;
    durationMs?: number;
  };
  span?: Record<string, unknown>;
  request?: Record<string, unknown>;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  tags?: Record<string, string>;
  breadcrumbs?: HandrailBreadcrumb[];
  [key: string]: unknown;
}

export interface HandrailAnalyticsPayload {
  schema_version: 1;
  event_kind:
    | 'page_view'
    | 'route_view'
    | 'screen_view'
    | 'session_start'
    | 'session_end'
    | 'custom_event'
    | 'conversion'
    | 'experiment_exposure';
  observed_at: string;
  received_at?: string;
  event_id: string;
  dedupe_key: string;
  project?: string;
  service?: string;
  env?: string;
  source: Record<string, unknown>;
  visitor: Record<string, unknown>;
  session: Record<string, unknown>;
  route: Record<string, unknown>;
  campaign: Record<string, unknown>;
  client: Record<string, unknown>;
  geo: Record<string, unknown>;
  release: Record<string, unknown>;
  conversion: Record<string, unknown>;
  experiment: HandrailExperimentAnalyticsMetadata;
  custom: {
    event_name?: string;
    properties?: Record<string, string | number | boolean | null>;
  };
  privacy: Record<string, unknown>;
}

export interface HandrailExperimentAnalyticsMetadata extends Record<string, unknown> {
  experimentKey?: string;
  experiment_key?: string;
  experimentId?: string;
  experiment_id?: string;
  variantKey?: string;
  variant_key?: string;
  variantId?: string;
  variant_id?: string;
  variant?: unknown;
  assignmentId?: string;
  assignment_id?: string;
  exposureId?: string;
  exposure_id?: string;
  assignmentScope?: string;
  assignment_scope?: string;
  assignmentAlgorithm?: string;
  assignment_algorithm?: string;
  assignmentAlgorithmVersion?: string;
  assignment_algorithm_version?: string;
  assignmentBucket?: number;
  assignment_bucket?: number;
  assignmentUnitHash?: string;
  assignment_unit_hash?: string;
  assignmentUnit?: Record<string, unknown>;
  assignment_unit?: Record<string, unknown>;
  traffic?: Record<string, unknown>;
  overrideMetadata?: Record<string, unknown>;
  override_metadata?: Record<string, unknown>;
  inExperiment?: boolean;
  in_experiment?: boolean;
  assignedAt?: string | Date;
  assigned_at?: string | Date;
  receivedAt?: string | Date;
  received_at?: string | Date;
}

export interface HandrailAnalyticsInput {
  type?: HandrailAnalyticsEventType;
  eventKind?: string;
  event_kind?: string;
  eventType?: string;
  event_type?: string;
  eventId?: string;
  event_id?: string;
  dedupeKey?: string;
  dedupe_key?: string;
  observedAt?: string;
  observed_at?: string;
  timestamp?: string;
  name?: string;
  eventName?: string;
  event_name?: string;
  path?: string;
  url?: string;
  href?: string;
  method?: string;
  statusCode?: number;
  status_code?: number;
  durationMs?: number;
  duration_ms?: number;
  visitorId?: string;
  visitor_id?: string;
  visitorHash?: string;
  visitor_hash?: string;
  sessionId?: string;
  session_id?: string;
  sessionHash?: string;
  session_hash?: string;
  route?: Record<string, unknown>;
  source?: Record<string, unknown>;
  visitor?: Record<string, unknown>;
  session?: Record<string, unknown>;
  campaign?: Record<string, unknown>;
  client?: Record<string, unknown>;
  geo?: Record<string, unknown>;
  coarseGeo?: Record<string, unknown>;
  coarse_geo?: Record<string, unknown>;
  release?: Record<string, unknown>;
  conversion?: Record<string, unknown>;
  experiment?: HandrailExperimentAnalyticsMetadata;
  custom?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  props?: Record<string, unknown>;
  privacy?: Record<string, unknown>;
  [key: string]: unknown;
}

export type HandrailExperimentVariant =
  | string
  | number
  | {
      key?: string;
      name?: string;
      id?: string;
      value?: unknown;
      weight?: number;
      variantKey?: string;
      variant_key?: string;
      variantId?: string;
      variant_id?: string;
      [key: string]: unknown;
    };

export type HandrailExperimentVariants =
  | HandrailExperimentVariant[]
  | Record<string, HandrailExperimentVariant | number | string | boolean | null>;

export interface HandrailExperimentOptions extends HandrailAnalyticsInput {
  identity?: string;
  identityId?: string;
  identity_id?: string;
  identityKind?: string;
  identity_kind?: string;
  unit?: string;
  stickiness?: string;
  visitorId?: string;
  visitor_id?: string;
  visitorHash?: string;
  visitor_hash?: string;
  sessionId?: string;
  session_id?: string;
  sessionHash?: string;
  session_hash?: string;
  projectId?: string;
  project_id?: string;
  projectKey?: string;
  project_key?: string;
  sourceId?: string;
  source_id?: string;
  experimentId?: string;
  experiment_id?: string;
  variantId?: string;
  variant_id?: string;
  assignmentId?: string;
  assignment_id?: string;
}

/**
 * Compatibility-only local deterministic assignment.
 *
 * Use assignExperiment() for durable platform-backed A/B tests in generated
 * apps. experiment() does not call the assignment API and does not record
 * exposure unless the returned assignment is passed to trackExperimentExposure()
 * or assignment.expose() explicitly. Local experiment() assignments are not
 * durable across platform rule changes.
 */
export interface HandrailExperimentAssignment {
  experimentKey: string;
  experimentId?: string;
  variantKey: string;
  variantId?: string;
  variant: unknown;
  value: unknown;
  index: number;
  assignmentId: string;
  expose(properties?: Record<string, unknown>, options?: HandrailAnalyticsInput): HandrailExperimentAssignment;
  exposure(properties?: Record<string, unknown>, options?: HandrailAnalyticsInput): HandrailExperimentAssignment;
  conversion(
    eventName: string,
    properties?: Record<string, unknown>,
    options?: HandrailAnalyticsInput
  ): HandrailExperimentAssignment;
  toString(): string;
  valueOf(): unknown;
}

export interface HandrailAssignExperimentOptions extends HandrailAnalyticsInput {
  key?: string;
  experimentKey?: string;
  experiment_key?: string;
  experimentId?: string;
  experiment_id?: string;
  sourceId?: string;
  source_id?: string;
  analyticsSourceId?: string;
  analytics_source_id?: string;
  projectId?: string;
  project_id?: string;
  serviceId?: string;
  service_id?: string;
  serviceEnvId?: string;
  service_env_id?: string;
  deployTargetId?: string;
  deploy_target_id?: string;
  sourceKind?: 'web' | 'server' | 'mobile' | string;
  source_kind?: 'web' | 'server' | 'mobile' | string;
  assignmentScope?: 'visitor' | 'session' | string;
  assignment_scope?: 'visitor' | 'session' | string;
  visitorHash?: string;
  visitor_hash?: string;
  visitorId?: string;
  visitor_id?: string;
  visitorSaltVersion?: string;
  visitor_salt_version?: string;
  sessionHash?: string;
  session_hash?: string;
  sessionId?: string;
  session_id?: string;
  assignmentAlgorithm?: string;
  assignment_algorithm?: string;
  assignmentAlgorithmVersion?: string;
  assignment_algorithm_version?: string;
  routeHash?: string;
  route_hash?: string;
  pageGroup?: string;
  page_group?: string;
  campaignSource?: string;
  campaign_source?: string;
  campaignMedium?: string;
  campaign_medium?: string;
  campaignName?: string;
  campaign_name?: string;
  countryCode?: string;
  country_code?: string;
  deviceType?: string;
  device_type?: string;
  contextHash?: string;
  context_hash?: string;
  assignedAt?: string | Date;
  assigned_at?: string | Date;
  receivedAt?: string | Date;
  received_at?: string | Date;
}

/**
 * Durable platform assignment returned by assignExperiment().
 *
 * Assignment uses the Product Analytics assignment endpoint and analytics key,
 * requires exact source/project/service/service_env/env/source_kind scope, and
 * does not count exposure. Call trackExperimentExposure(), assignment.expose(),
 * or assignment.exposure() only after the assigned variant affects rendered or
 * applied behavior.
 */
export interface HandrailDurableExperimentAssignment {
  accepted: boolean;
  endpoint?: string;
  assignment: Record<string, unknown>;
  privacy: Record<string, unknown>;
  response: Record<string, unknown>;
  assignmentId?: string;
  assignment_id?: string;
  experimentId?: string;
  experiment_id?: string;
  experimentKey?: string;
  experiment_key?: string;
  variantId?: string;
  variant_id?: string;
  variantKey?: string;
  variant_key?: string;
  variant?: unknown;
  value?: unknown;
  assignmentScope?: string;
  assignment_scope?: string;
  assignmentAlgorithm?: string;
  assignment_algorithm?: string;
  assignmentAlgorithmVersion?: string;
  assignment_algorithm_version?: string;
  assignmentBucket?: number;
  assignment_bucket?: number;
  assignmentUnitHash?: string;
  assignment_unit_hash?: string;
  assignmentUnit?: Record<string, unknown>;
  assignment_unit?: Record<string, unknown>;
  sourceScope?: Record<string, unknown>;
  source_scope?: Record<string, unknown>;
  traffic?: Record<string, unknown>;
  overrideMetadata?: Record<string, unknown>;
  override_metadata?: Record<string, unknown>;
  inExperiment?: boolean;
  in_experiment?: boolean;
  inserted?: boolean;
  duplicate?: boolean;
  assignedAt?: string;
  assigned_at?: string;
  receivedAt?: string;
  received_at?: string;
  context?: Record<string, unknown>;
  expose(properties?: Record<string, unknown>, options?: HandrailAnalyticsInput): HandrailDurableExperimentAssignment;
  exposure(properties?: Record<string, unknown>, options?: HandrailAnalyticsInput): HandrailDurableExperimentAssignment;
  conversion(
    eventName: string,
    properties?: Record<string, unknown>,
    options?: HandrailAnalyticsInput
  ): HandrailDurableExperimentAssignment;
  toString(): string;
  valueOf(): unknown;
}

export interface HandrailExpressAnalyticsMiddlewareOptions extends HandrailAnalyticsInput {
  pathGroup?:
    | string
    | ((
        req: any,
        res: any,
        context: {
          method?: string;
          path?: string;
          route?: string;
          statusCode?: number;
          durationMs?: number;
        }
      ) => string | null | undefined);
  route?: Record<string, unknown>;
  properties?: Record<string, unknown>;
  props?: Record<string, unknown>;
}

export interface HandrailApmClientLike {
  isEnabled(): boolean;
  isAnalyticsEnabled?(): boolean;
  captureEvent(event?: HandrailApmEvent): string | null;
  captureException(error: unknown, context?: Record<string, unknown>): string | null;
  captureMessage(message: string, context?: Record<string, unknown>): string | null;
  captureSpan(span: Record<string, unknown>, context?: Record<string, unknown>): string | null;
  addBreadcrumb(breadcrumb?: HandrailBreadcrumb): void;
  getBreadcrumbs(): HandrailBreadcrumb[];
  getStats(): HandrailApmStats;
  getConfig(): HandrailApmResolvedOptions;
  getAnalyticsConfig(): HandrailAnalyticsResolvedOptions;
  getAnalyticsStats?(): HandrailAnalyticsStats;
  buildAnalyticsPayload(event?: HandrailAnalyticsInput): HandrailAnalyticsPayload | null;
  track?(
    eventName: string,
    properties?: Record<string, unknown>,
    options?: HandrailAnalyticsInput
  ): string | null;
  trackConversion?(
    conversionName: string,
    properties?: Record<string, unknown>,
    options?: HandrailAnalyticsInput
  ): string | null;
  trackExperimentExposure?(
    assignment: HandrailExperimentAssignment | HandrailDurableExperimentAssignment | string,
    variantOrProperties?: string | Record<string, unknown>,
    propertiesOrOptions?: Record<string, unknown> | HandrailAnalyticsInput,
    options?: HandrailAnalyticsInput
  ): string | null;
  experiment?(
    experimentKey: string,
    variants: HandrailExperimentVariants,
    options?: HandrailExperimentOptions
  ): HandrailExperimentAssignment | null;
  assignExperiment?(
    experimentKeyOrOptions: string | HandrailAssignExperimentOptions,
    options?: HandrailAssignExperimentOptions
  ): Promise<HandrailDurableExperimentAssignment | null>;
  page?(pathOrOptions?: string | HandrailAnalyticsInput, options?: HandrailAnalyticsInput): string | null;
  flush(options?: HandrailFlushOptions): Promise<boolean>;
  shutdown(options?: HandrailShutdownOptions): Promise<boolean>;
  installProcessErrorHandlers(processLike?: HandrailProcessLike): boolean;
  uninstallProcessErrorHandlers(): boolean;
}

export type HandrailFetch = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: unknown;
  }
) => Promise<{
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

export interface HandrailApmStats {
  queued: number;
  sent: number;
  dropped: number;
  retries: number;
  failedRequests: number;
  failedBatches: number;
  lastFailureAt: string | null;
  lastFailureReason: string | null;
  pending: number;
  inFlight: boolean;
}

export interface HandrailAnalyticsStats extends HandrailApmStats {}

export interface HandrailProcessLike {
  on(eventName: string | symbol, listener: (...args: any[]) => void): unknown;
  removeListener?(eventName: string | symbol, listener: (...args: any[]) => void): unknown;
  supportsUncaughtExceptionMonitor?: boolean;
}

export interface HandrailFlushOptions {
  timeoutMs?: number;
}

export interface HandrailShutdownOptions extends HandrailFlushOptions {}

export type ExpressNextFunction = (error?: unknown) => void;
export type ExpressRequestHandler = (req: any, res: any, next: ExpressNextFunction) => void;
export type ExpressErrorRequestHandler = (
  error: unknown,
  req: any,
  res: any,
  next: ExpressNextFunction
) => void;

export type HandrailOperationErrorCategory =
  | 'auth'
  | 'validation'
  | 'approval'
  | 'conflict'
  | 'rate_limit'
  | 'timeout'
  | 'dependency'
  | 'application'
  | 'unknown';

export interface HandrailOperationInvocationContext {
  method: string;
  pathAndQuery: string;
  timestamp: string;
  timestampMs: number;
  projectId: string;
  environment: string;
  toolName: string;
  toolVersion: string;
  invocationId: string;
  requestId: string;
  auditId: string;
  signatureKeyId: string;
  timeoutMs: number;
  dryRun: boolean;
  idempotencyKey: string | null;
  bodySha256: string;
  approvalId: string | null;
  actor: { type: string | null; id: string | null; display: string | null } | null;
  traceId: string | null;
  correlationId: string | null;
  workRequestId: string | null;
  ownerGoalId: string | null;
}

export interface HandrailOperationSigningCredential {
  secret?: string | Uint8Array;
  signingSecret?: string | Uint8Array;
  key?: string | Uint8Array;
  status?: 'unknown' | 'disabled' | 'expired' | string;
  state?: 'unknown' | 'disabled' | 'expired' | string;
  enabled?: boolean;
  disabled?: boolean;
  expired?: boolean;
  expiresAt?: string | Date;
  expires_at?: string | Date;
  expiry?: string | Date;
  projectId?: string | string[];
  project_id?: string | string[];
  project?: string | string[];
  environment?: string | string[];
  env?: string | string[];
  toolName?: string | string[];
  tool_name?: string | string[];
  toolVersion?: string | string[];
  tool_version?: string | string[];
  scope?: Record<string, unknown>;
  scopes?: Record<string, unknown>;
}

export interface HandrailOperationExpectedScope {
  projectId?: string | string[];
  project_id?: string | string[];
  expectedProjectId?: string | string[];
  environment?: string | string[];
  env?: string | string[];
  expectedEnvironment?: string | string[];
  toolName?: string | string[];
  tool_name?: string | string[];
  expectedToolName?: string | string[];
  toolVersion?: string | string[];
  tool_version?: string | string[];
  expectedToolVersion?: string | string[];
}

export type HandrailOperationKeyLookup = (
  keyId: string,
  context: Pick<
    HandrailOperationInvocationContext,
    'projectId' | 'environment' | 'toolName' | 'toolVersion' | 'signatureKeyId'
  >
) =>
  | string
  | Uint8Array
  | HandrailOperationSigningCredential
  | null
  | false
  | Promise<string | Uint8Array | HandrailOperationSigningCredential | null | false>;

export interface HandrailOperationVerifyOptions extends HandrailOperationExpectedScope {
  method: string;
  pathAndQuery?: string;
  path?: string;
  url?: string;
  originalUrl?: string;
  headers: Record<string, string | string[] | number | undefined | null>;
  rawBody?: string | Uint8Array | null;
  signingSecret?: string | Uint8Array;
  secret?: string | Uint8Array;
  credential?: HandrailOperationSigningCredential;
  lookupSigningKey?: HandrailOperationKeyLookup;
  keyLookup?: HandrailOperationKeyLookup;
  getSigningKey?: HandrailOperationKeyLookup;
  expected?: HandrailOperationExpectedScope;
  scope?: HandrailOperationExpectedScope;
  replayWindowSeconds?: number;
  toleranceSeconds?: number;
  now?: Date | number | string | (() => Date | number | string);
  clock?: Date | number | string | (() => Date | number | string);
}

export interface HandrailOperationVerificationError {
  code: 'operation_signature_invalid' | 'operation_scope_forbidden' | string;
  category: 'auth';
  message: string;
  retryable: false;
  reason: string;
  details?: Record<string, unknown>;
}

export type HandrailOperationVerificationResult =
  | { ok: true; context: HandrailOperationInvocationContext }
  | { ok: false; error: HandrailOperationVerificationError; context?: Partial<HandrailOperationInvocationContext> };

export interface HandrailOperationAuditInput {
  invocation_id?: string;
  invocationId?: string;
  audit_id?: string;
  auditId?: string;
  request_id?: string;
  requestId?: string;
  idempotency_key?: string | null;
  idempotencyKey?: string | null;
  dry_run?: boolean;
  dryRun?: boolean;
  endpoint_audit_id?: string;
  endpointAuditId?: string;
}

export interface HandrailOperationAuditEcho {
  invocation_id: string | null;
  audit_id: string | null;
  request_id: string | null;
  idempotency_key: string | null;
  dry_run: boolean;
  endpoint_audit_id?: string;
}

export interface HandrailOperationSuccessEnvelope<T extends Record<string, unknown> = Record<string, unknown>> {
  ok: true;
  result: T;
  audit: HandrailOperationAuditEcho;
}

export interface HandrailOperationErrorEnvelope {
  ok: false;
  error: {
    code: string;
    category: HandrailOperationErrorCategory;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown> | unknown[];
  };
  audit: HandrailOperationAuditEcho;
}

export interface HandrailOperationEnvelopeInput extends HandrailOperationAuditInput {
  context?: Partial<HandrailOperationInvocationContext>;
  verifiedContext?: Partial<HandrailOperationInvocationContext>;
  verification?: { context?: Partial<HandrailOperationInvocationContext> };
  audit?: HandrailOperationAuditInput;
}

export interface HandrailOperationSuccessEnvelopeInput<T extends Record<string, unknown> = Record<string, unknown>>
  extends HandrailOperationEnvelopeInput {
  result: T;
}

export interface HandrailOperationErrorEnvelopeInput extends HandrailOperationEnvelopeInput {
  error?: {
    code?: string;
    category?: HandrailOperationErrorCategory | string;
    message?: string;
    retryable?: boolean;
    details?: unknown;
  };
  code?: string;
  category?: HandrailOperationErrorCategory | string;
  message?: string;
  retryable?: boolean;
  details?: unknown;
}

export declare class HandrailApmClient implements HandrailApmClientLike {
  readonly options: HandrailApmResolvedOptions;
  readonly enabled: boolean;
  readonly disabledReason: string | null;

  constructor(options?: HandrailApmOptions);
  isEnabled(): boolean;
  isAnalyticsEnabled(): boolean;
  captureEvent(event?: HandrailApmEvent): string | null;
  captureException(error: unknown, context?: Record<string, unknown>): string | null;
  captureMessage(message: string, context?: Record<string, unknown>): string | null;
  captureSpan(span: Record<string, unknown>, context?: Record<string, unknown>): string | null;
  addBreadcrumb(breadcrumb?: HandrailBreadcrumb): void;
  getBreadcrumbs(): HandrailBreadcrumb[];
  getStats(): HandrailApmStats;
  getConfig(): HandrailApmResolvedOptions;
  getAnalyticsConfig(): HandrailAnalyticsResolvedOptions;
  getAnalyticsStats(): HandrailAnalyticsStats;
  buildAnalyticsPayload(event?: HandrailAnalyticsInput): HandrailAnalyticsPayload | null;
  track(
    eventName: string,
    properties?: Record<string, unknown>,
    options?: HandrailAnalyticsInput
  ): string | null;
  trackConversion(
    conversionName: string,
    properties?: Record<string, unknown>,
    options?: HandrailAnalyticsInput
  ): string | null;
  trackExperimentExposure(
    assignment: HandrailExperimentAssignment | HandrailDurableExperimentAssignment | string,
    variantOrProperties?: string | Record<string, unknown>,
    propertiesOrOptions?: Record<string, unknown> | HandrailAnalyticsInput,
    options?: HandrailAnalyticsInput
  ): string | null;
  experiment(
    experimentKey: string,
    variants: HandrailExperimentVariants,
    options?: HandrailExperimentOptions
  ): HandrailExperimentAssignment | null;
  assignExperiment(
    experimentKeyOrOptions: string | HandrailAssignExperimentOptions,
    options?: HandrailAssignExperimentOptions
  ): Promise<HandrailDurableExperimentAssignment | null>;
  page(pathOrOptions?: string | HandrailAnalyticsInput, options?: HandrailAnalyticsInput): string | null;
  flush(options?: HandrailFlushOptions): Promise<boolean>;
  shutdown(options?: HandrailShutdownOptions): Promise<boolean>;
  installProcessErrorHandlers(processLike?: HandrailProcessLike): boolean;
  uninstallProcessErrorHandlers(): boolean;
}

export declare const HandrailSignalsClient: typeof HandrailApmClient;
export declare const SDK_NAME: '@handrail/sdk-node';
export declare const SDK_VERSION: string;

export declare function createClient(options?: HandrailApmOptions): HandrailApmClient;
export declare const createSignalsClient: typeof createClient;
export declare function createQuickBooksClient(options?: HandrailQuickBooksOptions): HandrailQuickBooksClient;
export declare function init(options?: HandrailApmOptions): HandrailApmClient;
export declare function getCurrentClient(): HandrailApmClient;
export declare function installProcessErrorHandlers(
  clientOrOptions?: HandrailApmClientLike | HandrailApmOptions,
  processLike?: HandrailProcessLike
): boolean;
export declare function uninstallProcessErrorHandlers(
  clientOrOptions?: HandrailApmClientLike | HandrailApmOptions
): boolean;
export declare function loadConfigFromEnv(
  env?: Record<string, string | undefined>,
  overrides?: HandrailApmOptions
): HandrailApmResolvedOptions;
export declare function loadQuickBooksConfigFromEnv(
  env?: Record<string, string | undefined>,
  overrides?: HandrailQuickBooksOptions
): HandrailQuickBooksResolvedOptions;
export declare function expressMiddleware(
  clientOrOptions?: HandrailApmClientLike | HandrailApmOptions
): ExpressRequestHandler;
export declare function expressAnalyticsMiddleware(
  clientOrOptions?: HandrailApmClientLike | HandrailApmOptions,
  options?: HandrailExpressAnalyticsMiddlewareOptions
): ExpressRequestHandler;
export declare function expressErrorHandler(
  clientOrOptions?: HandrailApmClientLike | HandrailApmOptions
): ExpressErrorRequestHandler;
export declare function captureEvent(event?: HandrailApmEvent): string | null;
export declare function captureException(error: unknown, context?: Record<string, unknown>): string | null;
export declare function captureMessage(message: string, context?: Record<string, unknown>): string | null;
export declare function captureSpan(
  span: Record<string, unknown>,
  context?: Record<string, unknown>
): string | null;
export declare function addBreadcrumb(breadcrumb?: HandrailBreadcrumb): void;
export declare function track(
  eventName: string,
  properties?: Record<string, unknown>,
  options?: HandrailAnalyticsInput
): string | null;
export declare function trackConversion(
  conversionName: string,
  properties?: Record<string, unknown>,
  options?: HandrailAnalyticsInput
): string | null;
export declare function trackExperimentExposure(
  assignment: HandrailExperimentAssignment | HandrailDurableExperimentAssignment | string,
  variantOrProperties?: string | Record<string, unknown>,
  propertiesOrOptions?: Record<string, unknown> | HandrailAnalyticsInput,
  options?: HandrailAnalyticsInput
): string | null;
/**
 * Compatibility-only local deterministic assignment.
 *
 * This helper does not call the assignment API and does not record exposure
 * from assignment-only use. Prefer assignExperiment() for generated-app durable
 * A/B tests because local experiment() assignments do not fetch platform rules
 * and are not durable across platform rule changes.
 */
export declare function experiment(
  experimentKey: string,
  variants: HandrailExperimentVariants,
  options?: HandrailExperimentOptions
): HandrailExperimentAssignment | null;
/**
 * Request durable platform assignment for generated-app A/B tests.
 *
 * This posts to the Product Analytics assignment endpoint with analytics-key
 * transport and returns no exposure event from assignment alone.
 */
export declare function assignExperiment(
  experimentKeyOrOptions: string | HandrailAssignExperimentOptions,
  options?: HandrailAssignExperimentOptions
): Promise<HandrailDurableExperimentAssignment | null>;
export declare function page(
  pathOrOptions?: string | HandrailAnalyticsInput,
  options?: HandrailAnalyticsInput
): string | null;
export declare function buildAnalyticsPayload(
  event?: HandrailAnalyticsInput,
  clientOrOptions?: HandrailApmClientLike | HandrailApmOptions | HandrailApmResolvedOptions | HandrailAnalyticsResolvedOptions
): HandrailAnalyticsPayload | null;
export declare function verifyOperationInvocationSignature(
  options: HandrailOperationVerifyOptions
): Promise<HandrailOperationVerificationResult>;
export declare function buildOperationSuccessEnvelope<T extends Record<string, unknown> = Record<string, unknown>>(
  input: HandrailOperationSuccessEnvelopeInput<T>
): HandrailOperationSuccessEnvelope<T>;
export declare function buildOperationErrorEnvelope(
  input: HandrailOperationErrorEnvelopeInput
): HandrailOperationErrorEnvelope;
export declare function getConfig(): HandrailApmResolvedOptions;
export declare function getAnalyticsConfig(): HandrailAnalyticsResolvedOptions;
export declare function getAnalyticsStats(): HandrailAnalyticsStats;
export declare function getStats(): HandrailApmStats;
export declare function flush(options?: HandrailFlushOptions): Promise<boolean>;
export declare function shutdown(options?: HandrailShutdownOptions): Promise<boolean>;

declare const sdk: {
  HandrailApmClient: typeof HandrailApmClient;
  HandrailSignalsClient: typeof HandrailSignalsClient;
  SDK_NAME: typeof SDK_NAME;
  SDK_VERSION: typeof SDK_VERSION;
  addBreadcrumb: typeof addBreadcrumb;
  assignExperiment: typeof assignExperiment;
  buildAnalyticsPayload: typeof buildAnalyticsPayload;
  buildOperationErrorEnvelope: typeof buildOperationErrorEnvelope;
  buildOperationSuccessEnvelope: typeof buildOperationSuccessEnvelope;
  captureEvent: typeof captureEvent;
  captureException: typeof captureException;
  captureMessage: typeof captureMessage;
  captureSpan: typeof captureSpan;
  createClient: typeof createClient;
  createQuickBooksClient: typeof createQuickBooksClient;
  createSignalsClient: typeof createSignalsClient;
  experiment: typeof experiment;
  expressAnalyticsMiddleware: typeof expressAnalyticsMiddleware;
  expressErrorHandler: typeof expressErrorHandler;
  expressMiddleware: typeof expressMiddleware;
  flush: typeof flush;
  getAnalyticsConfig: typeof getAnalyticsConfig;
  getAnalyticsStats: typeof getAnalyticsStats;
  getConfig: typeof getConfig;
  getStats: typeof getStats;
  getCurrentClient: typeof getCurrentClient;
  init: typeof init;
  installProcessErrorHandlers: typeof installProcessErrorHandlers;
  loadConfigFromEnv: typeof loadConfigFromEnv;
  loadQuickBooksConfigFromEnv: typeof loadQuickBooksConfigFromEnv;
  page: typeof page;
  shutdown: typeof shutdown;
  track: typeof track;
  trackConversion: typeof trackConversion;
  trackExperimentExposure: typeof trackExperimentExposure;
  uninstallProcessErrorHandlers: typeof uninstallProcessErrorHandlers;
  verifyOperationInvocationSignature: typeof verifyOperationInvocationSignature;
};

export default sdk;
