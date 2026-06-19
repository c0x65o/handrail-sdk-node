'use strict';

const crypto = require('node:crypto');
const packageJson = require('../package.json');

const SDK_NAME = packageJson.name;
const SDK_VERSION = packageJson.version;
const DEFAULT_MAX_BREADCRUMBS = 25;
const DEFAULT_SAMPLE_RATE = 1;
const DEFAULT_ANALYTICS_SAMPLE_RATE = 1;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_QUEUE_SIZE = 1000;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = 2000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const DEFAULT_RETRY_MAX_DELAY_MS = 5000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 3000;
const DEFAULT_QUICKBOOKS_REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_APM_ENDPOINT_MODE = 'gateway';
const DEFAULT_APM_DIRECT_ENDPOINT = '/api/apm/events';
const DEFAULT_ANALYTICS_ASSIGNMENT_ENDPOINT = '/api/analytics/experiments/assign';
const QUICKBOOKS_SERVICE_URLS = Object.freeze({
  staging: 'https://quickbooks.hitcents.staging.handrail-daas.com',
  production: 'https://quickbooks.handrail-daas.com'
});
const DEFAULT_MAX_TAGS = 25;
const DEFAULT_MAX_HEADERS = 40;
const DEFAULT_MAX_QUERY_PARAMS = 40;
const DEFAULT_ANALYTICS_SOURCE_KIND = 'server';
const DEFAULT_ANALYTICS_VISITOR_SALT_VERSION = 'client_supplied_v1';
const ANALYTICS_INTAKE_KEY_HEADER = 'x-handrail-analytics-key';
const ANALYTICS_SCHEMA_VERSION = 1;
const ANALYTICS_MAX_TRANSPORT_BODY_BYTES = 60 * 1024;
const ANALYTICS_MAX_ID_LENGTH = 128;
const ANALYTICS_MAX_SOURCE_FIELD_LENGTH = 128;
const ANALYTICS_MAX_HOST_LENGTH = 253;
const ANALYTICS_MAX_PATH_LENGTH = 512;
const ANALYTICS_MAX_GROUP_LENGTH = 160;
const ANALYTICS_MAX_CAMPAIGN_FIELD_LENGTH = 160;
const ANALYTICS_MAX_FAMILY_FIELD_LENGTH = 80;
const ANALYTICS_MAX_GEO_FIELD_LENGTH = 96;
const ANALYTICS_MAX_RELEASE_FIELD_LENGTH = 160;
const ANALYTICS_MAX_EVENT_NAME_LENGTH = 128;
const ANALYTICS_MAX_CUSTOM_PROPERTIES = 32;
const ANALYTICS_MAX_CUSTOM_PROPERTY_KEY_LENGTH = 64;
const ANALYTICS_MAX_CUSTOM_PROPERTY_STRING_LENGTH = 512;
const ANALYTICS_MAX_EXPERIMENT_FIELD_LENGTH = 160;
const ANALYTICS_MAX_EXPERIMENT_METADATA_KEYS = 16;
const ANALYTICS_MAX_EXPERIMENT_METADATA_DEPTH = 3;
const ANALYTICS_MAX_EXPERIMENT_METADATA_ARRAY_ITEMS = 8;
const ANALYTICS_MAX_EXPERIMENT_METADATA_STRING_LENGTH = 256;
const MAX_TAG_KEY_LENGTH = 80;
const MAX_TAG_VALUE_LENGTH = 200;
const MAX_PATH_LENGTH = 500;
const MAX_URL_LENGTH = 1000;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_STACK_LENGTH = 12000;
const MAX_STACK_FRAMES = 50;
const MAX_CONTEXT_DEPTH = 4;
const MAX_CONTEXT_KEYS = 50;
const MAX_CONTEXT_ARRAY_ITEMS = 20;
const OPERATION_REPLAY_WINDOW_SECONDS = 300;
const OPERATION_MAX_DETAILS_DEPTH = 4;
const OPERATION_MAX_DETAILS_KEYS = 50;
const OPERATION_MAX_DETAILS_ARRAY_ITEMS = 20;
const OPERATION_MAX_DETAILS_STRING_LENGTH = 1000;
const REDACTED = '[Redacted]';
const OPERATION_REDACTED = '[REDACTED]';
const TRUNCATED = '[Truncated]';
const SENSITIVE_KEY_PATTERN = /(?:authorization|cookie|password|passwd|secret|token|signature|hmac|api[-_]?key|access[-_]?key|session|credential|private[-_]?key)/i;
const OPERATION_ERROR_CATEGORIES = new Set([
  'auth',
  'validation',
  'approval',
  'conflict',
  'rate_limit',
  'timeout',
  'dependency',
  'application',
  'unknown'
]);
const OPERATION_REQUIRED_HEADERS = [
  'x-handrail-project-id',
  'x-handrail-environment',
  'x-handrail-tool-name',
  'x-handrail-tool-version',
  'x-handrail-invocation-id',
  'x-handrail-request-id',
  'x-handrail-audit-id',
  'x-handrail-timestamp',
  'x-handrail-body-sha256',
  'x-handrail-signature-key-id',
  'x-handrail-signature',
  'x-handrail-timeout-ms',
  'x-handrail-dry-run'
];
const RUNTIME_PRODUCT_SIGNAL_FIELD_KEYS = new Set([
  'eventkind',
  'analytics',
  'analyticskey',
  'analyticssourceid',
  'sourceid',
  'experiment',
  'experimentkey',
  'variantkey',
  'assignmentid',
  'exposureid',
  'writekey',
  'publickey'
]);
const ANALYTICS_EVENT_KINDS = new Set([
  'page_view',
  'route_view',
  'screen_view',
  'session_start',
  'session_end',
  'custom_event',
  'conversion',
  'experiment_exposure'
]);
const APM_CAPTURE_EVENT_TYPES = new Set(['transaction', 'request', 'exception', 'message', 'span']);
const ANALYTICS_DEVICE_TYPES = new Set(['desktop', 'mobile', 'tablet', 'tv', 'bot', 'unknown']);
const ANALYTICS_CAMPAIGN_FIELDS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'gclid',
  'fbclid',
  'msclkid'
];
const ANALYTICS_BLOCKED_PII_KEYS = [
  'address',
  'anonymous_id',
  'authorization',
  'body',
  'cookie',
  'cookies',
  'credit_card',
  'email',
  'first_name',
  'full_name',
  'full_url',
  'header',
  'headers',
  'href',
  'ip',
  'ip_address',
  'last_name',
  'name',
  'password',
  'payload',
  'phone',
  'query',
  'query_string',
  'raw_body',
  'raw_payload',
  'secret',
  'session',
  'session_id',
  'ssn',
  'token',
  'url',
  'user_id',
  'visitor',
  'visitor_id'
];

let currentClient = null;

class HandrailApmClient {
  constructor(options = {}) {
    this.options = normalizeOptions(options);
    this.enabled = this.options.enabled;
    this.disabledReason = this.options.disabledReason;
    this._breadcrumbs = [];
    this._queue = [];
    this._events = this._queue;
    this._analyticsQueue = [];
    this._analyticsEvents = this._analyticsQueue;
    this._closed = false;
    this._processHandlers = null;
    this._flushTimer = null;
    this._analyticsFlushTimer = null;
    this._inFlightFlush = null;
    this._inFlightAnalyticsFlush = null;
    this._retryDelayMs = this.options.retryBaseDelayMs;
    this._analyticsRetryDelayMs = this.options.retryBaseDelayMs;
    this._stats = {
      queued: 0,
      sent: 0,
      dropped: 0,
      retries: 0,
      failedRequests: 0,
      failedBatches: 0,
      lastFailureAt: null,
      lastFailureReason: null
    };
    this._analyticsStats = {
      queued: 0,
      sent: 0,
      dropped: 0,
      retries: 0,
      failedRequests: 0,
      failedBatches: 0,
      lastFailureAt: null,
      lastFailureReason: null
    };

    if (this.enabled && this.options.captureUnhandled) {
      this.installProcessErrorHandlers();
    }
  }

  isEnabled() {
    return this.enabled && !this._closed;
  }

  isAnalyticsEnabled() {
    return Boolean(this.options.analytics && this.options.analytics.enabled) && !this._closed;
  }

  captureEvent(event = {}) {
    if (!this.isEnabled()) {
      return null;
    }

    const rawEvent = event && typeof event === 'object' ? event : {};

    if (!isAllowedEventType(this.options, rawEvent.type)) {
      return null;
    }

    if (!shouldSample(this.options, rawEvent.type, rawEvent)) {
      return null;
    }

    const eventId = rawEvent.eventId || generateEventId();
    const safeEvent = sanitizeEvent(rawEvent, this.options);
    const payload = {
      ...safeEvent,
      eventId,
      timestamp: safeEvent.timestamp || new Date().toISOString(),
      sdk: {
        name: SDK_NAME,
        version: SDK_VERSION
      },
      metadata: mergeMetadata(this.options, safeEvent.metadata),
      tags: sanitizeTags(applyScrubberHook(this.options.scrubTags, {
        ...metadataTags(this.options),
        ...safeEvent.tags
      }, {
        field: 'tags',
        eventType: safeEvent.type
      }), this.options)
    };

    this.enqueueEvent(payload);
    return eventId;
  }

  captureException(error, context = {}) {
    const rawContext = context && typeof context === 'object' ? context : {};
    const eventContext = splitExceptionContext(rawContext);

    return this.captureEvent({
      type: 'exception',
      level: rawContext.level || 'error',
      exception: normalizeError(error, this.options),
      context: eventContext.context,
      request: eventContext.request,
      tags: {
        ...eventContext.tags,
        ...exceptionTags(rawContext)
      },
      breadcrumbs: this.getBreadcrumbs()
    });
  }

  captureMessage(message, context = {}) {
    const rawContext = context && typeof context === 'object' ? context : {};

    return this.captureEvent({
      type: 'message',
      level: rawContext.level || 'info',
      message: String(message),
      context: rawContext,
      breadcrumbs: this.getBreadcrumbs()
    });
  }

  captureSpan(span, context = {}) {
    const rawContext = context && typeof context === 'object' ? context : {};

    return this.captureEvent({
      type: 'span',
      span,
      context: rawContext.context || rawContext,
      tags: rawContext.tags,
      breadcrumbs: this.getBreadcrumbs()
    });
  }

  addBreadcrumb(breadcrumb = {}) {
    if (this._closed) {
      return;
    }

    const sanitized = sanitizeBreadcrumb(breadcrumb, this.options);
    if (!sanitized) {
      return;
    }

    const entry = {
      timestamp: sanitized.timestamp || new Date().toISOString(),
      category: sanitized.category || 'default',
      level: sanitized.level || 'info',
      message: sanitized.message,
      data: sanitized.data
    };

    this._breadcrumbs.push(entry);
    const overflow = this._breadcrumbs.length - this.options.maxBreadcrumbs;
    if (overflow > 0) {
      this._breadcrumbs.splice(0, overflow);
    }
  }

  getBreadcrumbs() {
    return this._breadcrumbs.map((breadcrumb) => ({ ...breadcrumb }));
  }

  getStats() {
    return {
      ...this._stats,
      pending: this._queue.length,
      inFlight: Boolean(this._inFlightFlush)
    };
  }

  getAnalyticsStats() {
    return {
      ...this._analyticsStats,
      pending: this._analyticsQueue.length,
      inFlight: Boolean(this._inFlightAnalyticsFlush)
    };
  }

  getConfig() {
    return cloneResolvedOptions(this.options);
  }

  getAnalyticsConfig() {
    return cloneAnalyticsOptions(this.options.analytics);
  }

  buildAnalyticsPayload(event = {}) {
    return buildAnalyticsPayload(event, this.options);
  }

  track(eventName, properties = {}, options = {}) {
    const rawOptions = safePlainObjectCopy(options);
    return this.captureAnalyticsEvent({
      ...rawOptions,
      type: 'track',
      eventName,
      properties: {
        ...safePlainObjectCopy(properties),
        ...safePlainObjectCopy(rawOptions.properties),
        ...safePlainObjectCopy(rawOptions.props)
      }
    });
  }

  trackConversion(conversionName, properties = {}, options = {}) {
    const rawOptions = safePlainObjectCopy(options);
    const optionExperiment = firstPlainObject(rawOptions.experiment);
    return this.captureAnalyticsEvent({
      ...rawOptions,
      type: 'conversion',
      eventName: rawOptions.eventName || conversionName,
      experiment: experimentAssignmentMetadata(optionExperiment, rawOptions),
      conversion: {
        ...safePlainObjectCopy(rawOptions.conversion),
        conversionName,
        conversionType: rawOptions.conversionType,
        conversionId: rawOptions.conversionId,
        value: rawOptions.value,
        currency: rawOptions.currency
      },
      properties: {
        ...safePlainObjectCopy(properties),
        ...safePlainObjectCopy(rawOptions.properties),
        ...safePlainObjectCopy(rawOptions.props)
      }
    });
  }

  trackExperimentExposure(assignmentOrExperimentKey, variantOrProperties = {}, propertiesOrOptions = {}, maybeOptions = {}) {
    const assignment = firstPlainObject(assignmentOrExperimentKey);
    const hasAssignment = assignmentOrExperimentKey && typeof assignmentOrExperimentKey === 'object' && !Array.isArray(assignmentOrExperimentKey);
    const experimentKey = hasAssignment
      ? cleanExperimentField(assignment.experimentKey || assignment.experiment_key || assignment.key)
      : cleanExperimentField(assignmentOrExperimentKey);
    const variantKey = hasAssignment
      ? cleanExperimentField(assignment.variantKey || assignment.variant_key || assignment.variant || assignment.value)
      : cleanExperimentField(variantOrProperties);
    const properties = hasAssignment ? variantOrProperties : propertiesOrOptions;
    const rawOptions = safePlainObjectCopy(hasAssignment ? propertiesOrOptions : maybeOptions);
    const optionExperiment = firstPlainObject(rawOptions.experiment);
    const experiment = {
      ...experimentAssignmentMetadata(optionExperiment, rawOptions),
      ...experimentAssignmentMetadata(assignment, rawOptions),
      experimentKey,
      experimentId: rawOptions.experimentId || rawOptions.experiment_id || optionExperiment.experimentId || optionExperiment.experiment_id || assignment.experimentId || assignment.experiment_id,
      variantKey,
      variantId: rawOptions.variantId || rawOptions.variant_id || optionExperiment.variantId || optionExperiment.variant_id || assignment.variantId || assignment.variant_id,
      assignmentId: rawOptions.assignmentId || rawOptions.assignment_id || optionExperiment.assignmentId || optionExperiment.assignment_id || assignment.assignmentId || assignment.assignment_id,
      exposureId: rawOptions.exposureId || rawOptions.exposure_id || optionExperiment.exposureId || optionExperiment.exposure_id || generateAnalyticsLocalId('hrax')
    };

    return this.captureAnalyticsEvent({
      ...rawOptions,
      type: 'experiment',
      eventName: rawOptions.eventName || rawOptions.event_name || 'experiment_exposure',
      experiment,
      properties: {
        ...safePlainObjectCopy(properties),
        ...safePlainObjectCopy(rawOptions.properties),
        ...safePlainObjectCopy(rawOptions.props)
      }
    });
  }

  experiment(experimentKey, variants, options = {}) {
    try {
      const rawOptions = safePlainObjectCopy(options);
      const selected = selectExperimentVariant(experimentKey, variants, rawOptions, this.options);
      if (!selected) {
        return null;
      }

      const optionExperiment = firstPlainObject(rawOptions.experiment);
      const assignmentSeed = `${selected.seed}|assignment`;
      const result = {
        experimentKey: selected.experimentKey,
        experimentId: cleanExperimentId(rawOptions.experimentId || rawOptions.experiment_id || optionExperiment.experimentId || optionExperiment.experiment_id),
        variantKey: selected.variant.key,
        variantId: cleanExperimentId(rawOptions.variantId || rawOptions.variant_id || selected.variant.id),
        variant: selected.variant.value,
        value: selected.variant.value,
        index: selected.variant.index,
        assignmentId: cleanExperimentId(rawOptions.assignmentId || rawOptions.assignment_id) || `assign_${experimentHashHex(assignmentSeed)}`,
        expose: (properties, exposureOptions) => {
          this.trackExperimentExposure(result, properties, exposureOptions);
          return result;
        },
        exposure: (properties, exposureOptions) => {
          this.trackExperimentExposure(result, properties, exposureOptions);
          return result;
        },
        conversion: (eventName, properties, conversionOptions) => {
          const conversionOptionsWithExperiment = {
            ...safePlainObjectCopy(conversionOptions),
            experiment: experimentAssignmentMetadata(result, conversionOptions)
          };
          this.trackConversion(eventName, properties, conversionOptionsWithExperiment);
          return result;
        },
        toString: () => result.variantKey,
        valueOf: () => result.value
      };

      return result;
    } catch (_error) {
      return null;
    }
  }

  async assignExperiment(experimentKeyOrOptions, options = {}) {
    const request = buildAnalyticsAssignmentRequest(experimentKeyOrOptions, options, this.options);
    if (!request) {
      return null;
    }

    const analytics = this.options.analytics || {};
    const fetchImpl = this.options.fetch || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      this.recordAnalyticsFailure(new Error('fetch unavailable'));
      return null;
    }

    const timeoutMs = integerOrDefault(this.options.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      const response = await fetchImpl(analytics.assignmentEndpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${analytics.key}`,
          'content-type': 'application/json',
          [ANALYTICS_INTAKE_KEY_HEADER]: analytics.key
        },
        body: JSON.stringify(request),
        signal: controller ? controller.signal : undefined
      });

      const status = Number(response && response.status);
      if (!response || !response.ok) {
        this.recordAnalyticsFailure(new Error(`analytics_assignment_status_${status || 'unknown'}`));
        return null;
      }

      const envelope = await readJsonResponse(response);
      const normalized = normalizeAnalyticsAssignmentResponse(envelope, this);
      if (!normalized) {
        this.recordAnalyticsFailure(new Error('analytics_assignment_invalid_response'));
        return null;
      }
      return normalized;
    } catch (error) {
      this.recordAnalyticsFailure(error);
      return null;
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  page(pathOrOptions, options = {}) {
    const rawOptions = safePlainObjectCopy(options);
    const pageOptions = typeof pathOrOptions === 'string'
      ? { ...rawOptions, path: pathOrOptions }
      : safePlainObjectCopy(pathOrOptions);
    return this.captureAnalyticsEvent({
      ...pageOptions,
      type: pageOptions.type || 'page'
    });
  }

  captureAnalyticsEvent(event = {}) {
    if (!this.isAnalyticsEnabled()) {
      return null;
    }

    const rawEvent = event && typeof event === 'object' ? event : {};
    if (!shouldSampleAnalytics(this.options.analytics, rawEvent)) {
      return null;
    }

    let payload = null;
    try {
      payload = buildProductAnalyticsPayload(rawEvent, this.options);
    } catch (_error) {
      return null;
    }
    if (!payload) {
      return null;
    }

    this.enqueueAnalyticsEvent(payload);
    return payload.event_id;
  }

  enqueueEvent(event) {
    if (this._queue.length >= this.options.maxQueueSize) {
      this._queue.shift();
      this._stats.dropped += 1;
    }

    this._queue.push(event);
    this._stats.queued += 1;

    if (this._queue.length >= this.options.batchSize) {
      this.scheduleFlush(0);
      return;
    }

    this.scheduleFlush(this.options.flushIntervalMs);
  }

  enqueueAnalyticsEvent(event) {
    if (this._analyticsQueue.length >= this.options.maxQueueSize) {
      this._analyticsQueue.shift();
      this._analyticsStats.dropped += 1;
    }

    this._analyticsQueue.push(event);
    this._analyticsStats.queued += 1;

    if (this._analyticsQueue.length >= this.options.batchSize) {
      this.scheduleAnalyticsFlush(0);
      return;
    }

    this.scheduleAnalyticsFlush(this.options.flushIntervalMs);
  }

  scheduleFlush(delayMs) {
    if (!this.isEnabled() || this._closed || this._queue.length === 0) {
      return;
    }

    const delay = Math.max(0, Math.floor(delayMs));
    if (this._flushTimer) {
      if (delay > 0) {
        return;
      }
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }

    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this.flush().catch(() => {
        // Transport failures are recorded in counters and must not surface to app code.
      });
    }, delay);

    if (typeof this._flushTimer.unref === 'function') {
      this._flushTimer.unref();
    }
  }

  scheduleAnalyticsFlush(delayMs) {
    if (!this.isAnalyticsEnabled() || this._analyticsQueue.length === 0) {
      return;
    }

    const delay = Math.max(0, Math.floor(delayMs));
    if (this._analyticsFlushTimer) {
      if (delay > 0) {
        return;
      }
      clearTimeout(this._analyticsFlushTimer);
      this._analyticsFlushTimer = null;
    }

    this._analyticsFlushTimer = setTimeout(() => {
      this._analyticsFlushTimer = null;
      this.flushAnalytics().catch(() => {
        // Analytics transport failures are recorded in counters and stay quiet.
      });
    }, delay);

    if (typeof this._analyticsFlushTimer.unref === 'function') {
      this._analyticsFlushTimer.unref();
    }
  }

  flush(options = {}) {
    const apmFlush = this.flushApm(options);
    const analyticsFlush = this.flushAnalytics(options);

    return Promise.all([apmFlush, analyticsFlush])
      .then(([apmFlushed, analyticsFlushed]) => apmFlushed && analyticsFlushed)
      .catch((error) => {
        this.recordFailure(error);
        return false;
      });
  }

  flushApm(options = {}) {
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }

    if (!this.isEnabled() || this._queue.length === 0) {
      return Promise.resolve(this._queue.length === 0);
    }

    if (this._inFlightFlush) {
      return this._inFlightFlush;
    }

    const timeoutMs = integerOrDefault(options.timeoutMs, this.options.shutdownTimeoutMs);
    const deadline = Date.now() + timeoutMs;

    this._inFlightFlush = this.drainQueue(deadline)
      .catch((error) => {
        this.recordFailure(error);
        return false;
      })
      .finally(() => {
        this._inFlightFlush = null;
        if (this.isEnabled() && this._queue.length > 0) {
          this.scheduleFlush(this._retryDelayMs);
        }
      });

    return this._inFlightFlush;
  }

  flushAnalytics(options = {}) {
    if (this._analyticsFlushTimer) {
      clearTimeout(this._analyticsFlushTimer);
      this._analyticsFlushTimer = null;
    }

    if (!this.isAnalyticsEnabled() || this._analyticsQueue.length === 0) {
      return Promise.resolve(this._analyticsQueue.length === 0);
    }

    if (this._inFlightAnalyticsFlush) {
      return this._inFlightAnalyticsFlush;
    }

    const timeoutMs = integerOrDefault(options.timeoutMs, this.options.shutdownTimeoutMs);
    const deadline = Date.now() + timeoutMs;

    this._inFlightAnalyticsFlush = this.drainAnalyticsQueue(deadline)
      .catch((error) => {
        this.recordAnalyticsFailure(error);
        return false;
      })
      .finally(() => {
        this._inFlightAnalyticsFlush = null;
        if (this.isAnalyticsEnabled() && this._analyticsQueue.length > 0) {
          this.scheduleAnalyticsFlush(this._analyticsRetryDelayMs);
        }
      });

    return this._inFlightAnalyticsFlush;
  }

  async shutdown(options = {}) {
    const flushed = await this.flush(options);
    this.uninstallProcessErrorHandlers();
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    if (this._analyticsFlushTimer) {
      clearTimeout(this._analyticsFlushTimer);
      this._analyticsFlushTimer = null;
    }
    this._closed = true;
    return flushed;
  }

  async drainQueue(deadline) {
    let flushed = true;

    while (this._queue.length > 0 && Date.now() < deadline) {
      const batch = this._queue.splice(0, this.options.batchSize);
      const result = await this.sendBatchWithRetries(batch, deadline);

      if (result.retryableEvents.length > 0) {
        this.requeueEvents(result.retryableEvents);
        this._stats.failedBatches += 1;
        this._retryDelayMs = nextBackoffDelay(this._retryDelayMs, this.options);
        flushed = false;
        break;
      }

      this._retryDelayMs = this.options.retryBaseDelayMs;
    }

    return flushed && this._queue.length === 0;
  }

  async drainAnalyticsQueue(deadline) {
    let flushed = true;

    while (this._analyticsQueue.length > 0 && Date.now() < deadline) {
      const batch = this._analyticsQueue.splice(0, this.options.batchSize);
      const result = await this.sendAnalyticsBatchWithRetries(batch, deadline);

      if (result.retryableEvents.length > 0) {
        this.requeueAnalyticsEvents(result.retryableEvents);
        this._analyticsStats.failedBatches += 1;
        this._analyticsRetryDelayMs = nextBackoffDelay(this._analyticsRetryDelayMs, this.options);
        flushed = false;
        break;
      }

      this._analyticsRetryDelayMs = this.options.retryBaseDelayMs;
    }

    return flushed && this._analyticsQueue.length === 0;
  }

  async sendBatchWithRetries(batch, deadline) {
    let pending = batch;
    const maxAttempts = this.options.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts && pending.length > 0; attempt += 1) {
      const retryableEvents = [];

      for (const event of pending) {
        if (Date.now() >= deadline) {
          retryableEvents.push(event);
          continue;
        }

        const result = await this.sendEvent(event, deadline);
        if (result.ok) {
          this._stats.sent += 1;
        } else if (result.retryable) {
          retryableEvents.push(event);
        } else {
          this._stats.dropped += 1;
        }
      }

      if (retryableEvents.length === 0) {
        return { retryableEvents: [] };
      }

      if (attempt >= maxAttempts - 1 || Date.now() >= deadline) {
        return { retryableEvents };
      }

      this._stats.retries += 1;
      await sleep(Math.min(backoffDelayForAttempt(attempt, this.options), timeUntil(deadline)));
      pending = retryableEvents;
    }

    return { retryableEvents: pending };
  }

  async sendAnalyticsBatchWithRetries(batch, deadline) {
    let pending = batch;
    const maxAttempts = this.options.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts && pending.length > 0; attempt += 1) {
      const retryableEvents = [];

      for (const event of pending) {
        if (Date.now() >= deadline) {
          retryableEvents.push(event);
          continue;
        }

        const result = await this.sendAnalyticsEvent(event, deadline);
        if (result.ok) {
          this._analyticsStats.sent += 1;
        } else if (result.retryable) {
          retryableEvents.push(event);
        } else {
          this._analyticsStats.dropped += 1;
        }
      }

      if (retryableEvents.length === 0) {
        return { retryableEvents: [] };
      }

      if (attempt >= maxAttempts - 1 || Date.now() >= deadline) {
        return { retryableEvents };
      }

      this._analyticsStats.retries += 1;
      await sleep(Math.min(backoffDelayForAttempt(attempt, this.options), timeUntil(deadline)));
      pending = retryableEvents;
    }

    return { retryableEvents: pending };
  }

  async sendEvent(event, deadline) {
    const fetchImpl = this.options.fetch || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      this.recordFailure(new Error('fetch unavailable'));
      return { ok: false, retryable: true };
    }

    const body = JSON.stringify(toIntakePayload(event, this.options));
    const primaryResult = await this.postApmEvent(fetchImpl, this.options.endpoint, body, deadline);
    if (primaryResult.ok || !primaryResult.retryable) {
      return primaryResult;
    }

    if (
      this.options.endpointMode === 'gateway'
      && this.options.directEndpoint
      && this.options.directEndpoint !== this.options.endpoint
      && timeUntil(deadline) > 0
    ) {
      return this.postApmEvent(fetchImpl, this.options.directEndpoint, body, deadline);
    }

    return primaryResult;
  }

  async postApmEvent(fetchImpl, endpoint, body, deadline) {
    const timeoutMs = Math.min(this.options.requestTimeoutMs, timeUntil(deadline));
    if (timeoutMs <= 0) {
      return { ok: false, retryable: true };
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.token}`,
          'content-type': 'application/json',
          'x-handrail-apm-token': this.options.token
        },
        body,
        signal: controller ? controller.signal : undefined
      });

      const status = Number(response && response.status);
      if (response && response.ok) {
        return { ok: true, retryable: false };
      }

      const retryable = status === 408 || status === 429 || status >= 500 || !status;
      this.recordFailure(new Error(`intake_status_${status || 'unknown'}`));
      return { ok: false, retryable };
    } catch (error) {
      this.recordFailure(error);
      return { ok: false, retryable: true };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  async sendAnalyticsEvent(event, deadline) {
    const analytics = this.options.analytics || {};
    const fetchImpl = this.options.fetch || globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      this.recordAnalyticsFailure(new Error('fetch unavailable'));
      return { ok: false, retryable: true };
    }

    const timeoutMs = Math.min(this.options.requestTimeoutMs, timeUntil(deadline));
    if (timeoutMs <= 0) {
      return { ok: false, retryable: true };
    }

    const body = serializeAnalyticsIntakePayload(event, analytics);
    if (!body) {
      this.recordAnalyticsFailure(new Error('analytics_payload_too_large'));
      return { ok: false, retryable: false };
    }

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeout = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

    try {
      const response = await fetchImpl(analytics.endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${analytics.key}`,
          'content-type': 'application/json',
          [ANALYTICS_INTAKE_KEY_HEADER]: analytics.key
        },
        body,
        signal: controller ? controller.signal : undefined
      });

      const status = Number(response && response.status);
      if (response && response.ok) {
        return { ok: true, retryable: false };
      }

      const retryable = status === 408 || status === 429 || status >= 500 || !status;
      this.recordAnalyticsFailure(new Error(`analytics_intake_status_${status || 'unknown'}`));
      return { ok: false, retryable };
    } catch (error) {
      this.recordAnalyticsFailure(error);
      return { ok: false, retryable: true };
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  requeueEvents(events) {
    if (!events.length) {
      return;
    }

    const available = Math.max(0, this.options.maxQueueSize - this._queue.length);
    const kept = events.slice(-available);
    const dropped = events.length - kept.length;
    if (dropped > 0) {
      this._stats.dropped += dropped;
    }
    this._queue.unshift(...kept);
  }

  requeueAnalyticsEvents(events) {
    if (!events.length) {
      return;
    }

    const available = Math.max(0, this.options.maxQueueSize - this._analyticsQueue.length);
    const kept = events.slice(-available);
    const dropped = events.length - kept.length;
    if (dropped > 0) {
      this._analyticsStats.dropped += dropped;
    }
    this._analyticsQueue.unshift(...kept);
  }

  recordFailure(error) {
    this._stats.failedRequests += 1;
    this._stats.lastFailureAt = new Date().toISOString();
    this._stats.lastFailureReason = sanitizeMessage(error && error.message) || 'intake_unavailable';
  }

  recordAnalyticsFailure(error) {
    this._analyticsStats.failedRequests += 1;
    this._analyticsStats.lastFailureAt = new Date().toISOString();
    this._analyticsStats.lastFailureReason = sanitizeMessage(error && error.message) || 'analytics_intake_unavailable';
  }

  installProcessErrorHandlers(processLike = globalThis.process) {
    if (this._processHandlers || !this.isEnabled() || !processLike || typeof processLike.on !== 'function') {
      return false;
    }

    const rejectionHandler = (reason) => {
      this.captureException(reason, {
        handled: false,
        mechanism: 'unhandledRejection'
      });
    };

    const exceptionHandler = (error) => {
      this.captureException(error, {
        handled: false,
        mechanism: 'uncaughtException'
      });
    };

    const exceptionEvent = processLike.supportsUncaughtExceptionMonitor === false
      ? 'uncaughtException'
      : 'uncaughtExceptionMonitor';

    processLike.on('unhandledRejection', rejectionHandler);
    processLike.on(exceptionEvent, exceptionHandler);
    this._processHandlers = {
      processLike,
      rejectionHandler,
      exceptionHandler,
      exceptionEvent
    };

    return true;
  }

  uninstallProcessErrorHandlers() {
    if (!this._processHandlers) {
      return false;
    }

    const { processLike, rejectionHandler, exceptionHandler, exceptionEvent } = this._processHandlers;
    if (typeof processLike.removeListener === 'function') {
      processLike.removeListener('unhandledRejection', rejectionHandler);
      processLike.removeListener(exceptionEvent, exceptionHandler);
    }
    this._processHandlers = null;
    return true;
  }
}

function createClient(options = {}) {
  return new HandrailApmClient(options);
}

function createQuickBooksClient(options = {}) {
  return new HandrailQuickBooksClient(options);
}

class HandrailQuickBooksClient {
  constructor(options = {}) {
    this.options = normalizeQuickBooksOptions(options, process.env);
  }

  tenant(tenantId) {
    const id = normalizeQuickBooksTenantId(firstDefined(tenantId, this.options.tenantId));
    return new HandrailQuickBooksTenantClient(this, id);
  }

  async request(path, init = {}) {
    return quickBooksJsonRequest(this.options, path, init);
  }

  getConfig() {
    return {
      serviceEnvironment: this.options.serviceEnvironment,
      serviceUrl: this.options.serviceUrl,
      providerMode: this.options.providerMode,
      tenantId: this.options.tenantId,
      hasApiKey: Boolean(this.options.apiKey),
      hasTenantId: Boolean(this.options.tenantId),
      localOverride: this.options.localOverride
    };
  }
}

class HandrailQuickBooksTenantClient {
  constructor(client, tenantId) {
    this.client = client;
    this.tenantId = tenantId;
    this.sync = {
      start: (payload = {}, init = {}) => this.request('/sync/jobs', {
        method: 'POST',
        body: payload,
        ...init
      }),
      get: (jobId, init = {}) => {
        const id = encodeURIComponent(normalizeQuickBooksTenantId(jobId, 'jobId'));
        return this.request(`/sync/jobs/${id}`, init);
      }
    };
  }

  async request(path, init = {}) {
    const tenantPath = `/api/tenants/${encodeURIComponent(this.tenantId)}${quickBooksPath(path)}`;
    return quickBooksJsonRequest(this.client.options, tenantPath, init);
  }

  status(init = {}) {
    return this.request('/status', init);
  }

  items(init = {}) {
    return this.request('/items', init);
  }

  profitAndLoss(init = {}) {
    return this.request('/reports/profit-and-loss', init);
  }
}

function init(options = {}) {
  currentClient = createClient(options);
  return currentClient;
}

function getCurrentClient() {
  if (!currentClient) {
    currentClient = createClient({ enabled: false });
  }
  return currentClient;
}

function expressMiddleware(clientOrOptions) {
  const client = resolveClient(clientOrOptions);

  return function handrailApmRequestMiddleware(req, res, next) {
    if (!client.isEnabled()) {
      next();
      return;
    }

    const start = now();
    let captured = false;

    const captureTransaction = () => {
      if (captured) {
        return;
      }
      captured = true;

      try {
        const context = requestContext(req, client.options);
        const transaction = {
          method: context.method,
          route: context.route,
          path: context.path,
          statusCode: normalizeStatusCode(res.statusCode),
          durationMs: Math.max(0, Math.round(now() - start))
        };

        client.captureEvent({
          type: 'transaction',
          transaction,
          request: {
            ...context,
            statusCode: transaction.statusCode
          },
          tags: requestTags(req, res, context, transaction, client.options),
          breadcrumbs: client.getBreadcrumbs()
        });
      } catch (_error) {
        // APM capture must never change application response behavior.
      }
    };

    res.once('finish', captureTransaction);
    res.once('close', captureTransaction);
    next();
  };
}

function expressErrorHandler(clientOrOptions) {
  const client = resolveClient(clientOrOptions);

  return function handrailApmErrorHandler(error, req, res, next) {
    if (client.isEnabled()) {
      try {
        const context = requestContext(req, client.options);
        const responseStatusCode = normalizeStatusCode(res.statusCode);
        const errorStatusCode = normalizeStatusCode(error && (error.statusCode || error.status));
        const statusCode = responseStatusCode && responseStatusCode >= 400
          ? responseStatusCode
          : errorStatusCode || responseStatusCode;

        client.captureException(error, {
          request: {
            ...context,
            statusCode
          },
          response: {
            statusCode
          },
          tags: requestTags(req, res, context, { statusCode }, client.options),
          handled: true,
          mechanism: 'express'
        });
      } catch (_captureError) {
        // APM capture must never change Express error propagation.
      }
    }

    next(error);
  };
}

function expressAnalyticsMiddleware(clientOrOptions, middlewareOptions = {}) {
  const client = resolveClient(clientOrOptions);
  const options = firstPlainObject(middlewareOptions);

  return function handrailAnalyticsRequestMiddleware(req, res, next) {
    if (typeof client.isAnalyticsEnabled !== 'function' || !client.isAnalyticsEnabled()) {
      next();
      return;
    }

    const start = now();
    let captured = false;

    const captureObservation = () => {
      if (captured) {
        return;
      }
      captured = true;

      try {
        const context = requestContext(req, client.options);
        const statusCode = normalizeStatusCode(res.statusCode);
        const durationMs = Math.max(0, Math.round(now() - start));
        const observation = analyticsObservationContext(req, res, options, {
          method: context.method,
          path: context.path,
          route: context.route,
          statusCode,
          durationMs
        });

        client.page({
          ...observation,
          type: observation.type || 'request',
          method: context.method,
          path: analyticsRequestUrlCandidate(req) || context.path,
          statusCode,
          durationMs,
          route: {
            route: context.route || context.path,
            routePath: context.route || context.path,
            referrerUrl: requestReferrer(req),
            pageGroup: observation.pathGroup,
            ...firstPlainObject(observation.route)
          }
        });
      } catch (_error) {
        // Analytics observation must never change application response behavior.
      }
    };

    res.once('finish', captureObservation);
    res.once('close', captureObservation);
    next();
  };
}

function captureEvent(event) {
  return getCurrentClient().captureEvent(event);
}

function captureException(error, context) {
  return getCurrentClient().captureException(error, context);
}

function captureMessage(message, context) {
  return getCurrentClient().captureMessage(message, context);
}

function captureSpan(span, context) {
  return getCurrentClient().captureSpan(span, context);
}

function addBreadcrumb(breadcrumb) {
  return getCurrentClient().addBreadcrumb(breadcrumb);
}

function track(eventName, properties, options) {
  return getCurrentClient().track(eventName, properties, options);
}

function trackConversion(conversionName, properties, options) {
  return getCurrentClient().trackConversion(conversionName, properties, options);
}

function trackExperimentExposure(assignmentOrExperimentKey, variantOrProperties, propertiesOrOptions, maybeOptions) {
  return getCurrentClient().trackExperimentExposure(
    assignmentOrExperimentKey,
    variantOrProperties,
    propertiesOrOptions,
    maybeOptions
  );
}

function experiment(experimentKey, variants, options) {
  return getCurrentClient().experiment(experimentKey, variants, options);
}

function assignExperiment(experimentKeyOrOptions, options) {
  return getCurrentClient().assignExperiment(experimentKeyOrOptions, options);
}

function page(pathOrOptions, options) {
  return getCurrentClient().page(pathOrOptions, options);
}

function flush(options) {
  return getCurrentClient().flush(options);
}

function shutdown(options) {
  return getCurrentClient().shutdown(options);
}

function getStats() {
  return getCurrentClient().getStats();
}

function getConfig() {
  return getCurrentClient().getConfig();
}

function getAnalyticsConfig() {
  return getCurrentClient().getAnalyticsConfig();
}

function getAnalyticsStats() {
  return getCurrentClient().getAnalyticsStats();
}

function buildAnalyticsPayload(event, clientOrOptions) {
  const options = clientOrOptions && clientOrOptions.options
    ? clientOrOptions.options
    : clientOrOptions;
  try {
    return buildProductAnalyticsPayload(event, options || getCurrentClient().options);
  } catch (_error) {
    return null;
  }
}

function installProcessErrorHandlers(clientOrOptions, processLike) {
  return resolveClient(clientOrOptions).installProcessErrorHandlers(processLike);
}

function uninstallProcessErrorHandlers(clientOrOptions) {
  return resolveClient(clientOrOptions).uninstallProcessErrorHandlers();
}

function loadConfigFromEnv(env = process.env, overrides = {}) {
  return normalizeOptions(overrides, env);
}

function loadQuickBooksConfigFromEnv(env = process.env, overrides = {}) {
  return normalizeQuickBooksOptions(overrides, env);
}

function normalizeQuickBooksOptions(options = {}, env = process.env) {
  const serviceEnvironment = normalizeQuickBooksServiceEnvironment(
    firstDefined(options.serviceEnvironment, options.service_environment, env.HANDRAIL_QBO_SERVICE_ENV),
    firstDefined(options.providerMode, options.provider_mode, env.HANDRAIL_QBO_PROVIDER_MODE)
  );
  const providerMode = normalizeQuickBooksProviderMode(
    firstDefined(options.providerMode, options.provider_mode, env.HANDRAIL_QBO_PROVIDER_MODE),
    serviceEnvironment
  );
  const localOverride = stringOrUndefined(firstDefined(options.baseUrl, options.base_url, env.HANDRAIL_QBO_BASE_URL));
  const serviceUrl = normalizeQuickBooksServiceUrl(localOverride || QUICKBOOKS_SERVICE_URLS[serviceEnvironment]);
  const apiKey = stringOrUndefined(firstDefined(options.apiKey, options.api_key, env.HANDRAIL_QBO_API_KEY, env.HANDRAIL_QBO_SERVICE_TOKEN));
  const tenantId = stringOrUndefined(firstDefined(options.tenantId, options.tenant_id, env.HANDRAIL_QBO_TENANT_ID));
  const requestTimeoutMs = integerOrDefault(
    firstDefined(options.requestTimeoutMs, options.fetchTimeoutMs, options.timeoutMs),
    DEFAULT_QUICKBOOKS_REQUEST_TIMEOUT_MS
  );

  return {
    serviceEnvironment,
    service_env: serviceEnvironment,
    serviceUrl,
    service_url: serviceUrl,
    providerMode,
    provider_mode: providerMode,
    apiKey,
    api_key: apiKey,
    tenantId,
    tenant_id: tenantId,
    requestTimeoutMs,
    request_timeout_ms: requestTimeoutMs,
    fetch: typeof options.fetch === 'function' ? options.fetch : undefined,
    localOverride: Boolean(localOverride),
    local_override: Boolean(localOverride)
  };
}

function normalizeQuickBooksServiceEnvironment(value, providerMode) {
  const raw = stringOrUndefined(value);
  if (raw) {
    const normalized = raw.toLowerCase();
    if (normalized === 'stage') return 'staging';
    if (normalized === 'prod') return 'production';
    if (normalized === 'staging' || normalized === 'production') return normalized;
    throw new Error("QuickBooks serviceEnvironment must be 'staging' or 'production'.");
  }
  const mode = stringOrUndefined(providerMode);
  if (mode && mode.toLowerCase() === 'production') return 'production';
  return 'staging';
}

function normalizeQuickBooksProviderMode(value, serviceEnvironment) {
  const raw = stringOrUndefined(value);
  if (!raw) return serviceEnvironment === 'production' ? 'production' : 'sandbox';
  const normalized = raw.toLowerCase();
  if (normalized === 'sandbox' || normalized === 'production') return normalized;
  throw new Error("QuickBooks providerMode must be 'sandbox' or 'production'.");
}

function normalizeQuickBooksServiceUrl(value) {
  const serviceUrl = stringOrUndefined(value);
  if (!serviceUrl) throw new Error('QuickBooks service URL could not be resolved.');
  let parsed;
  try {
    parsed = new URL(serviceUrl);
  } catch (_error) {
    throw new Error('QuickBooks service URL must be an absolute http(s) URL.');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('QuickBooks service URL must use http or https.');
  }
  return parsed.toString().replace(/\/+$/, '');
}

function normalizeQuickBooksTenantId(value, label = 'tenantId') {
  const id = stringOrUndefined(value);
  if (!id) throw new Error(`QuickBooks ${label} is required.`);
  return id;
}

function quickBooksPath(path) {
  const raw = String(path || '');
  if (!raw || raw === '/') return '';
  return raw.startsWith('/') ? raw : `/${raw}`;
}

async function quickBooksJsonRequest(options, path, init = {}) {
  if (!options.apiKey) throw new Error('QuickBooks apiKey is required.');
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('fetch unavailable');

  const url = new URL(quickBooksPath(path), `${options.serviceUrl}/`);
  const headers = {
    accept: 'application/json',
    authorization: `Bearer ${options.apiKey}`,
    'x-handrail-qbo-provider-mode': options.providerMode,
    ...firstPlainObject(init.headers)
  };
  let body = init.body;
  if (body !== undefined && body !== null && typeof body !== 'string' && !(body instanceof Uint8Array) && !(typeof Buffer !== 'undefined' && Buffer.isBuffer(body))) {
    body = JSON.stringify(body);
    if (!headers['content-type'] && !headers['Content-Type']) {
      headers['content-type'] = 'application/json';
    }
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), options.requestTimeoutMs) : null;
  try {
    const response = await fetchImpl(url.toString(), {
      ...init,
      headers,
      body,
      signal: init.signal || (controller && controller.signal)
    });
    const text = typeof response.text === 'function' ? await response.text() : '';
    const payload = text ? parseJsonOrText(text) : null;
    if (!response.ok) {
      const error = new Error(`QuickBooks service request failed with ${response.status || 'unknown status'}.`);
      error.status = response.status;
      error.response = payload;
      throw error;
    }
    return payload;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function parseJsonOrText(text) {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

function normalizeOptions(options = {}, env = process.env) {
  const envOptions = readEnvOptions(env);
  const merged = mergeDefined(envOptions, {
    enabled: options.enabled,
    endpoint: options.endpoint,
    endpointMode: firstDefined(options.endpointMode, options.endpoint_mode),
    directEndpoint: firstDefined(
      options.directEndpoint,
      options.direct_endpoint,
      options.directFallbackEndpoint,
      options.direct_fallback_endpoint
    ),
    token: options.token,
    project: options.project,
    environment: options.environment || options.env,
    service: options.service,
    release: options.release,
    sampleRate: options.sampleRate,
    requestSampleRate: options.requestSampleRate ?? options.transactionSampleRate,
    exceptionSampleRate: options.exceptionSampleRate,
    messageSampleRate: options.messageSampleRate,
    spanSampleRate: options.spanSampleRate,
    allowedEventTypes: options.allowedEventTypes,
    scrubberConfig: options.scrubberConfig,
    scrubHeaders: options.scrubHeaders ?? (options.scrubbers && options.scrubbers.headers),
    scrubUrl: options.scrubUrl ?? (options.scrubbers && options.scrubbers.url),
    scrubQueryParams: options.scrubQueryParams ?? (options.scrubbers && options.scrubbers.queryParams),
    scrubMessage: options.scrubMessage ?? (options.scrubbers && options.scrubbers.message),
    scrubBreadcrumb: options.scrubBreadcrumb ?? (options.scrubbers && options.scrubbers.breadcrumb),
    scrubTags: options.scrubTags ?? (options.scrubbers && options.scrubbers.tags),
    requestSampler: options.requestSampler ?? options.transactionSampler,
    exceptionSampler: options.exceptionSampler,
    spanSampler: options.spanSampler,
    maxBreadcrumbs: options.maxBreadcrumbs,
    captureUnhandled: options.captureUnhandled ?? options.captureUnhandledErrors,
    batchSize: options.batchSize,
    maxQueueSize: options.maxQueueSize,
    flushIntervalMs: options.flushIntervalMs,
    requestTimeoutMs: options.requestTimeoutMs ?? options.fetchTimeoutMs,
    maxRetries: options.maxRetries,
    retryBaseDelayMs: options.retryBaseDelayMs,
    retryMaxDelayMs: options.retryMaxDelayMs,
    shutdownTimeoutMs: options.shutdownTimeoutMs,
    fetch: options.fetch
  });

  const endpoint = stringOrUndefined(merged.endpoint);
  const token = stringOrUndefined(merged.token);
  const project = stringOrUndefined(merged.project);
  const environment = stringOrUndefined(merged.environment);
  const service = stringOrUndefined(merged.service);
  const endpointMode = normalizeApmEndpointMode(
    merged.endpointMode,
    defaultApmEndpointModeForEndpoint(endpoint)
  );
  const directEndpoint = stringOrUndefined(merged.directEndpoint) || deriveApmDirectEndpoint(endpoint);
  const requestedEnabled = merged.enabled === true;
  const missing = [];

  if (!endpoint) {
    missing.push('endpoint');
  }
  if (!token) {
    missing.push('token');
  }
  if (!project) {
    missing.push('project');
  }
  if (!environment) {
    missing.push('environment');
  }
  if (!service) {
    missing.push('service');
  }

  const enabled = requestedEnabled && missing.length === 0;

  let disabledReason = null;
  if (!requestedEnabled) {
    disabledReason = 'disabled';
  } else if (!token) {
    disabledReason = 'missing_token';
  } else if (!endpoint) {
    disabledReason = 'missing_endpoint';
  } else if (missing.length > 0) {
    disabledReason = 'incomplete_config';
  }

  const resolved = {
    enabled,
    disabledReason,
    missingConfig: missing,
    endpoint,
    endpointMode,
    endpoint_mode: endpointMode,
    directEndpoint,
    direct_endpoint: directEndpoint,
    token,
    project,
    environment,
    service,
    release: stringOrUndefined(merged.release),
    sampleRate: sampleRateOrDefault(merged.sampleRate, DEFAULT_SAMPLE_RATE),
    requestSampleRate: sampleRateOrDefault(merged.requestSampleRate, undefined),
    exceptionSampleRate: sampleRateOrDefault(merged.exceptionSampleRate, undefined),
    messageSampleRate: sampleRateOrDefault(merged.messageSampleRate, undefined),
    spanSampleRate: sampleRateOrDefault(merged.spanSampleRate, undefined),
    allowedEventTypes: normalizeAllowedEventTypes(merged.allowedEventTypes),
    scrubberConfig: normalizeScrubberConfig(merged.scrubberConfig),
    scrubHeaders: functionOrUndefined(merged.scrubHeaders),
    scrubUrl: functionOrUndefined(merged.scrubUrl),
    scrubQueryParams: functionOrUndefined(merged.scrubQueryParams),
    scrubMessage: functionOrUndefined(merged.scrubMessage),
    scrubBreadcrumb: functionOrUndefined(merged.scrubBreadcrumb),
    scrubTags: functionOrUndefined(merged.scrubTags),
    requestSampler: functionOrUndefined(merged.requestSampler),
    exceptionSampler: functionOrUndefined(merged.exceptionSampler),
    spanSampler: functionOrUndefined(merged.spanSampler),
    maxBreadcrumbs: integerOrDefault(merged.maxBreadcrumbs, DEFAULT_MAX_BREADCRUMBS),
    captureUnhandled: parseEnabled(merged.captureUnhandled),
    batchSize: integerOrDefault(merged.batchSize, DEFAULT_BATCH_SIZE),
    maxQueueSize: integerOrDefault(merged.maxQueueSize, DEFAULT_MAX_QUEUE_SIZE),
    flushIntervalMs: integerOrDefault(merged.flushIntervalMs, DEFAULT_FLUSH_INTERVAL_MS),
    requestTimeoutMs: integerOrDefault(merged.requestTimeoutMs, DEFAULT_REQUEST_TIMEOUT_MS),
    maxRetries: nonNegativeIntegerOrDefault(merged.maxRetries, DEFAULT_MAX_RETRIES),
    retryBaseDelayMs: integerOrDefault(merged.retryBaseDelayMs, DEFAULT_RETRY_BASE_DELAY_MS),
    retryMaxDelayMs: integerOrDefault(merged.retryMaxDelayMs, DEFAULT_RETRY_MAX_DELAY_MS),
    shutdownTimeoutMs: integerOrDefault(merged.shutdownTimeoutMs, DEFAULT_SHUTDOWN_TIMEOUT_MS),
    fetch: typeof merged.fetch === 'function' ? merged.fetch : undefined
  };

  resolved.analytics = normalizeAnalyticsOptions(
    envOptions.analytics,
    analyticsOptionOverrides(options),
    {
      project: resolved.project,
      environment: resolved.environment,
      service: resolved.service,
      release: resolved.release
    }
  );
  attachAnalyticsAliases(resolved, resolved.analytics);

  return resolved;
}

function readEnvOptions(env) {
  return mergeDefined({}, {
    enabled: parseEnabled(
      runtimeEnvAlias(env, ['HANDRAIL_APM_ENABLED'], ['HANDRAIL_RUNTIME_ENABLED'])
    ),
    endpoint: runtimeEnvAlias(env, ['HANDRAIL_APM_ENDPOINT'], ['HANDRAIL_RUNTIME_ENDPOINT']),
    endpointMode: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_ENDPOINT_MODE'],
      ['HANDRAIL_RUNTIME_ENDPOINT_MODE']
    ),
    directEndpoint: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_DIRECT_ENDPOINT', 'HANDRAIL_APM_DIRECT_FALLBACK_ENDPOINT'],
      ['HANDRAIL_RUNTIME_DIRECT_ENDPOINT', 'HANDRAIL_RUNTIME_DIRECT_FALLBACK_ENDPOINT']
    ),
    token: runtimeEnvAlias(env, ['HANDRAIL_APM_TOKEN'], ['HANDRAIL_RUNTIME_TOKEN']),
    project: runtimeEnvAlias(env, ['HANDRAIL_PROJECT'], ['HANDRAIL_RUNTIME_PROJECT']),
    environment: runtimeEnvAlias(env, ['HANDRAIL_ENV'], ['HANDRAIL_RUNTIME_ENV']),
    service: runtimeEnvAlias(env, ['HANDRAIL_SERVICE'], ['HANDRAIL_RUNTIME_SERVICE']),
    release: runtimeEnvAlias(env, ['HANDRAIL_RELEASE'], ['HANDRAIL_RUNTIME_RELEASE']),
    sampleRate: runtimeEnvAlias(env, ['HANDRAIL_APM_SAMPLE_RATE'], ['HANDRAIL_RUNTIME_SAMPLE_RATE']),
    requestSampleRate: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_REQUEST_SAMPLE_RATE', 'HANDRAIL_APM_TRANSACTION_SAMPLE_RATE'],
      ['HANDRAIL_RUNTIME_REQUEST_SAMPLE_RATE', 'HANDRAIL_RUNTIME_TRANSACTION_SAMPLE_RATE']
    ),
    exceptionSampleRate: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_EXCEPTION_SAMPLE_RATE'],
      ['HANDRAIL_RUNTIME_EXCEPTION_SAMPLE_RATE']
    ),
    messageSampleRate: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_MESSAGE_SAMPLE_RATE'],
      ['HANDRAIL_RUNTIME_MESSAGE_SAMPLE_RATE']
    ),
    spanSampleRate: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_SPAN_SAMPLE_RATE'],
      ['HANDRAIL_RUNTIME_SPAN_SAMPLE_RATE']
    ),
    allowedEventTypes: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_ALLOWED_EVENT_TYPES'],
      ['HANDRAIL_RUNTIME_ALLOWED_EVENT_TYPES']
    ),
    scrubberConfig: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_SCRUBBER_CONFIG'],
      ['HANDRAIL_RUNTIME_SCRUBBER_CONFIG']
    ),
    maxBreadcrumbs: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_MAX_BREADCRUMBS'],
      ['HANDRAIL_RUNTIME_MAX_BREADCRUMBS']
    ),
    batchSize: runtimeEnvAlias(env, ['HANDRAIL_APM_BATCH_SIZE'], ['HANDRAIL_RUNTIME_BATCH_SIZE']),
    maxQueueSize: runtimeEnvAlias(env, ['HANDRAIL_APM_MAX_QUEUE_SIZE'], ['HANDRAIL_RUNTIME_MAX_QUEUE_SIZE']),
    flushIntervalMs: runtimeEnvAlias(env, ['HANDRAIL_APM_FLUSH_INTERVAL_MS'], ['HANDRAIL_RUNTIME_FLUSH_INTERVAL_MS']),
    requestTimeoutMs: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_REQUEST_TIMEOUT_MS', 'HANDRAIL_APM_FETCH_TIMEOUT_MS'],
      ['HANDRAIL_RUNTIME_REQUEST_TIMEOUT_MS', 'HANDRAIL_RUNTIME_FETCH_TIMEOUT_MS']
    ),
    maxRetries: runtimeEnvAlias(env, ['HANDRAIL_APM_MAX_RETRIES'], ['HANDRAIL_RUNTIME_MAX_RETRIES']),
    retryBaseDelayMs: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_RETRY_BASE_DELAY_MS'],
      ['HANDRAIL_RUNTIME_RETRY_BASE_DELAY_MS']
    ),
    retryMaxDelayMs: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_RETRY_MAX_DELAY_MS'],
      ['HANDRAIL_RUNTIME_RETRY_MAX_DELAY_MS']
    ),
    shutdownTimeoutMs: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_SHUTDOWN_TIMEOUT_MS'],
      ['HANDRAIL_RUNTIME_SHUTDOWN_TIMEOUT_MS']
    ),
    captureUnhandled: runtimeEnvAlias(
      env,
      ['HANDRAIL_APM_CAPTURE_UNHANDLED', 'HANDRAIL_APM_CAPTURE_UNHANDLED_ERRORS'],
      ['HANDRAIL_RUNTIME_CAPTURE_UNHANDLED', 'HANDRAIL_RUNTIME_CAPTURE_UNHANDLED_ERRORS']
    ),
    analytics: readAnalyticsEnvOptions(env)
  });
}

function runtimeEnvAlias(env, legacyKeys, runtimeKeys) {
  const legacyValues = legacyKeys.map((key) => env[key]);
  const hasLegacyKey = legacyKeys.some((key) => Object.prototype.hasOwnProperty.call(env, key));
  if (hasLegacyKey) {
    return firstDefined(...legacyValues);
  }
  return firstDefined(...runtimeKeys.map((key) => env[key]));
}

function readAnalyticsEnvOptions(env) {
  return mergeDefined({}, {
    enabled: parseEnabled(env.HANDRAIL_ANALYTICS_ENABLED),
    endpoint: env.HANDRAIL_ANALYTICS_ENDPOINT,
    assignmentEndpoint: firstDefined(
      env.HANDRAIL_ANALYTICS_ASSIGNMENT_ENDPOINT,
      env.HANDRAIL_ANALYTICS_EXPERIMENT_ASSIGNMENT_ENDPOINT
    ),
    publicKey: env.HANDRAIL_ANALYTICS_PUBLIC_KEY,
    writeKey: env.HANDRAIL_ANALYTICS_WRITE_KEY,
    key: env.HANDRAIL_ANALYTICS_KEY,
    project: env.HANDRAIL_ANALYTICS_PROJECT,
    environment: env.HANDRAIL_ANALYTICS_ENV,
    sourceId: env.HANDRAIL_ANALYTICS_SOURCE_ID,
    sourceKind: env.HANDRAIL_ANALYTICS_SOURCE_KIND,
    service: env.HANDRAIL_ANALYTICS_SERVICE,
    serviceEnv: firstDefined(
      env.HANDRAIL_ANALYTICS_SERVICE_ENV_ID,
      env.HANDRAIL_ANALYTICS_SERVICE_ENV,
      env.HANDRAIL_ANALYTICS_DEPLOY_TARGET_ID
    ),
    release: env.HANDRAIL_ANALYTICS_RELEASE,
    sampleRate: env.HANDRAIL_ANALYTICS_SAMPLE_RATE,
    allowedEventTypes: env.HANDRAIL_ANALYTICS_ALLOWED_EVENT_TYPES,
    customPropertyAllowlist: env.HANDRAIL_ANALYTICS_CUSTOM_PROPERTY_ALLOWLIST
  });
}

function analyticsOptionOverrides(options = {}) {
  const nested = options.analytics && typeof options.analytics === 'object' && !Array.isArray(options.analytics)
    ? options.analytics
    : {};

  return mergeDefined(nested, {
    enabled: options.analyticsEnabled,
    endpoint: options.analyticsEndpoint,
    assignmentEndpoint: firstDefined(
      nested.assignmentEndpoint,
      nested.assignment_endpoint,
      options.analyticsAssignmentEndpoint,
      options.analyticsExperimentAssignmentEndpoint
    ),
    publicKey: firstDefined(options.analyticsPublicKey, options.analyticsKey),
    writeKey: options.analyticsWriteKey,
    key: options.analyticsKey,
    project: options.analyticsProject,
    environment: options.analyticsEnvironment || options.analyticsEnv,
    sourceId: options.analyticsSourceId,
    sourceKind: firstDefined(nested.sourceKind, nested.source_kind, options.analyticsSourceKind),
    service: options.analyticsService,
    serviceEnv: firstDefined(
      nested.serviceEnv,
      nested.service_env,
      nested.serviceEnvId,
      nested.service_env_id,
      nested.deployTargetId,
      nested.deploy_target_id,
      options.analyticsServiceEnv,
      options.analyticsServiceEnvId,
      options.analyticsDeployTargetId
    ),
    release: options.analyticsRelease,
    sampleRate: options.analyticsSampleRate,
    allowedEventTypes: options.analyticsAllowedEventTypes,
    routeNormalizer: options.analyticsRouteNormalizer,
    customPropertyAllowlist: options.analyticsCustomPropertyAllowlist,
    maxBodyBytes: firstDefined(nested.maxBodyBytes, nested.max_body_bytes, options.analyticsMaxBodyBytes)
  });
}

function normalizeAnalyticsOptions(envOptions = {}, overrides = {}, metadata = {}) {
  const merged = mergeDefined(envOptions || {}, overrides || {});
  const endpoint = stringOrUndefined(merged.endpoint);
  const assignmentEndpoint = stringOrUndefined(merged.assignmentEndpoint || merged.assignment_endpoint)
    || deriveAnalyticsAssignmentEndpoint(endpoint);
  const genericKey = stringOrUndefined(merged.key);
  const publicKey = stringOrUndefined(firstDefined(merged.publicKey, genericKey));
  const writeKey = stringOrUndefined(firstDefined(merged.writeKey, genericKey));
  const key = stringOrUndefined(firstDefined(writeKey, publicKey, genericKey));
  const sourceId = stringOrUndefined(merged.sourceId);
  const sourceKind = cleanAnalyticsSourceKind(merged.sourceKind || merged.source_kind) || DEFAULT_ANALYTICS_SOURCE_KIND;
  const project = stringOrUndefined(merged.project) || stringOrUndefined(metadata.project);
  const environment = stringOrUndefined(merged.environment || merged.env) || stringOrUndefined(metadata.environment);
  const service = stringOrUndefined(merged.service) || stringOrUndefined(metadata.service);
  const serviceEnv = stringOrUndefined(firstDefined(
    merged.serviceEnv,
    merged.service_env,
    merged.serviceEnvId,
    merged.service_env_id,
    merged.deployTargetId,
    merged.deploy_target_id
  ));
  const release = stringOrUndefined(merged.release) || stringOrUndefined(metadata.release);
  const requestedEnabled = merged.enabled === true;
  const missing = [];
  const assignmentMissing = [];

  if (!endpoint) {
    missing.push('endpoint');
  }
  if (!key) {
    missing.push('key');
  }
  if (!sourceId) {
    missing.push('sourceId');
  }
  if (!project) {
    missing.push('project');
  }
  if (!environment) {
    missing.push('environment');
  }

  if (!assignmentEndpoint) {
    assignmentMissing.push('assignmentEndpoint');
  }
  if (!key) {
    assignmentMissing.push('key');
  }
  if (!sourceId) {
    assignmentMissing.push('sourceId');
  }
  if (!project) {
    assignmentMissing.push('project');
  }
  if (!service) {
    assignmentMissing.push('service');
  }
  if (!serviceEnv) {
    assignmentMissing.push('serviceEnv');
  }
  if (!environment) {
    assignmentMissing.push('environment');
  }

  const enabled = requestedEnabled && missing.length === 0;
  const assignmentEnabled = requestedEnabled && assignmentMissing.length === 0;

  let disabledReason = null;
  if (!requestedEnabled) {
    disabledReason = 'disabled';
  } else if (!key) {
    disabledReason = 'missing_key';
  } else if (!endpoint) {
    disabledReason = 'missing_endpoint';
  } else if (!sourceId) {
    disabledReason = 'missing_source_id';
  } else if (missing.length > 0) {
    disabledReason = 'incomplete_config';
  }

  let assignmentDisabledReason = null;
  if (!requestedEnabled) {
    assignmentDisabledReason = 'disabled';
  } else if (!key) {
    assignmentDisabledReason = 'missing_key';
  } else if (!assignmentEndpoint) {
    assignmentDisabledReason = 'missing_assignment_endpoint';
  } else if (!sourceId) {
    assignmentDisabledReason = 'missing_source_id';
  } else if (assignmentMissing.length > 0) {
    assignmentDisabledReason = 'incomplete_config';
  }

  return {
    enabled,
    disabledReason,
    missingConfig: missing,
    requestedEnabled,
    endpoint,
    assignmentEndpoint,
    assignmentEnabled,
    assignmentDisabledReason,
    assignmentMissingConfig: assignmentMissing,
    publicKey,
    writeKey,
    key,
    project,
    environment,
    env: environment,
    sourceId,
    sourceKind,
    service,
    serviceEnv,
    release,
    sampleRate: sampleRateOrDefault(merged.sampleRate, DEFAULT_ANALYTICS_SAMPLE_RATE),
    allowedEventTypes: normalizeAllowedEventTypes(merged.allowedEventTypes),
    routeNormalizer: functionOrUndefined(merged.routeNormalizer),
    customPropertyAllowlist: normalizeAllowedEventTypes(merged.customPropertyAllowlist),
    maxBodyBytes: integerOrDefault(merged.maxBodyBytes ?? merged.max_body_bytes, ANALYTICS_MAX_TRANSPORT_BODY_BYTES)
  };
}

function attachAnalyticsAliases(target, analytics) {
  target.analyticsEnabled = analytics.enabled;
  target.analyticsDisabledReason = analytics.disabledReason;
  target.analyticsEndpoint = analytics.endpoint;
  target.analyticsAssignmentEndpoint = analytics.assignmentEndpoint;
  target.analyticsPublicKey = analytics.publicKey;
  target.analyticsWriteKey = analytics.writeKey;
  target.analyticsKey = analytics.key;
  target.analyticsEnv = analytics.environment;
  target.analyticsSourceId = analytics.sourceId;
  target.analyticsSourceKind = analytics.sourceKind;
  target.analyticsServiceEnv = analytics.serviceEnv;
  target.analyticsSampleRate = analytics.sampleRate;
  target.analyticsAllowedEventTypes = analytics.allowedEventTypes;
  target.analyticsMaxBodyBytes = analytics.maxBodyBytes;
}

function resolveClient(clientOrOptions) {
  if (!clientOrOptions) {
    return getCurrentClient();
  }

  if (typeof clientOrOptions.captureEvent === 'function') {
    return clientOrOptions;
  }

  return createClient(clientOrOptions);
}

function mergeMetadata(options, metadata = {}) {
  const eventMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};

  return {
    project: options.project,
    environment: options.environment,
    service: options.service,
    release: options.release,
    ...eventMetadata
  };
}

function metadataTags(options) {
  return {
    'handrail.project': options.project,
    'handrail.environment': options.environment,
    'handrail.service': options.service,
    'handrail.release': options.release
  };
}

function isAllowedEventType(options, type) {
  const rawType = type ? String(type) : 'exception';
  const intakeType = intakeEventType(rawType);
  if (!intakeType || !APM_CAPTURE_EVENT_TYPES.has(rawType)) {
    return false;
  }

  if (!options.allowedEventTypes || options.allowedEventTypes.length === 0) {
    return true;
  }
  return options.allowedEventTypes.some((allowedType) => {
    const rawAllowedType = String(allowedType);
    return rawAllowedType === rawType || intakeEventType(rawAllowedType) === intakeType;
  });
}

function shouldSample(options, type, event) {
  const hookResult = sampleHookForEventType(options, type, event);
  if (typeof hookResult === 'boolean') {
    return hookResult;
  }

  const sampleRate = sampleRateForEventType(options, type);
  if (sampleRate <= 0) {
    return false;
  }
  if (sampleRate >= 1) {
    return true;
  }
  return Math.random() < sampleRate;
}

function shouldSampleAnalytics(analytics = {}, event) {
  const sampleRate = sampleRateOrDefault(analytics.sampleRate, DEFAULT_ANALYTICS_SAMPLE_RATE);
  if (sampleRate <= 0) {
    return false;
  }
  if (sampleRate >= 1) {
    return true;
  }
  const eventId = event && (event.event_id || event.eventId || event.id);
  if (eventId) {
    const bucket = Number.parseInt(stableAnalyticsHash(eventId).slice(0, 8), 16) / 0xffffffff;
    return bucket < sampleRate;
  }
  return Math.random() < sampleRate;
}

function normalizeVariantWeight(value) {
  const weight = Number(value);
  return Number.isFinite(weight) && weight > 0 ? weight : 1;
}

function cleanExperimentField(value) {
  return cleanAnalyticsString(value, ANALYTICS_MAX_EXPERIMENT_FIELD_LENGTH);
}

function cleanExperimentId(value) {
  return cleanAnalyticsString(value, ANALYTICS_MAX_ID_LENGTH);
}

function normalizeExperimentVariant(input, index) {
  const raw = firstPlainObject(input);
  const isObjectVariant = input && typeof input === 'object' && !Array.isArray(input);
  const key = isObjectVariant
    ? cleanExperimentField(raw.variant_key || raw.variantKey || raw.key || raw.name || raw.id || raw.value)
    : cleanExperimentField(input);
  if (!key) {
    return null;
  }
  return {
    key,
    id: isObjectVariant ? cleanExperimentId(raw.variant_id || raw.variantId || raw.id) : undefined,
    value: isObjectVariant && raw.value !== undefined ? raw.value : input,
    index,
    weight: isObjectVariant ? normalizeVariantWeight(raw.weight) : 1
  };
}

function normalizeExperimentVariants(variants) {
  const output = [];
  if (Array.isArray(variants)) {
    variants.forEach((variant, index) => {
      const normalized = normalizeExperimentVariant(variant, index);
      if (normalized) {
        output.push(normalized);
      }
    });
    return output;
  }

  const map = firstPlainObject(variants);
  for (const [key, value] of safePlainObjectEntries(map)) {
    const input = value && typeof value === 'object' && !Array.isArray(value)
      ? { key, ...safePlainObjectCopy(value) }
      : { key, value, weight: typeof value === 'number' ? value : 1 };
    const normalized = normalizeExperimentVariant(input, output.length);
    if (normalized) {
      output.push(normalized);
    }
  }
  return output;
}

function buildAnalyticsAssignmentRequest(experimentKeyOrOptions, options = {}, resolved = {}) {
  const rawOptions = experimentKeyOrOptions && typeof experimentKeyOrOptions === 'object' && !Array.isArray(experimentKeyOrOptions)
    ? safePlainObjectCopy(experimentKeyOrOptions)
    : {
        ...safePlainObjectCopy(options),
        experimentKey: experimentKeyOrOptions
      };
  const analytics = firstPlainObject(resolved.analytics);
  if (!analytics.assignmentEnabled || !analytics.assignmentEndpoint || !analytics.key) {
    return null;
  }

  const source = firstPlainObject(rawOptions.source);
  const experiment = firstPlainObject(rawOptions.experiment);
  const experimentKey = cleanExperimentField(
    rawOptions.experiment_key
    || rawOptions.experimentKey
    || rawOptions.key
    || experiment.experiment_key
    || experiment.experimentKey
    || experiment.key
  );
  const experimentId = cleanExperimentId(rawOptions.experiment_id || rawOptions.experimentId || experiment.experiment_id || experiment.experimentId);
  if (!experimentKey && !experimentId) {
    return null;
  }

  const sourceId = cleanExperimentId(
    rawOptions.source_id
    || rawOptions.sourceId
    || rawOptions.analytics_source_id
    || rawOptions.analyticsSourceId
    || source.source_id
    || source.sourceId
    || source.analytics_source_id
    || source.analyticsSourceId
    || analytics.sourceId
  );
  const projectId = cleanExperimentId(
    rawOptions.project_id
    || rawOptions.projectId
    || source.project_id
    || source.projectId
    || analytics.project
    || resolved.project
  );
  const serviceId = cleanExperimentId(
    rawOptions.service_id
    || rawOptions.serviceId
    || source.service_id
    || source.serviceId
    || analytics.service
    || resolved.service
  );
  const serviceEnvId = cleanExperimentId(
    rawOptions.service_env_id
    || rawOptions.serviceEnvId
    || rawOptions.deploy_target_id
    || rawOptions.deployTargetId
    || source.service_env_id
    || source.serviceEnvId
    || source.deploy_target_id
    || source.deployTargetId
    || analytics.serviceEnv
  );
  const env = cleanAnalyticsString(rawOptions.env || rawOptions.environment || source.env || source.environment || analytics.environment || analytics.env || resolved.environment, ANALYTICS_MAX_SOURCE_FIELD_LENGTH);
  const sourceKind = cleanAnalyticsSourceKind(rawOptions.source_kind || rawOptions.sourceKind || source.source_kind || source.sourceKind || analytics.sourceKind) || DEFAULT_ANALYTICS_SOURCE_KIND;
  if (!sourceId || !projectId || !serviceId || !serviceEnvId || !env || !sourceKind) {
    return null;
  }

  const assignmentScope = cleanAnalyticsString(rawOptions.assignment_scope || rawOptions.assignmentScope, 32) || 'visitor';
  const visitorHash = analyticsAssignmentSubjectHash(rawOptions, 'visitor', {
    projectId,
    sourceId,
    experimentKey,
    experimentId
  });
  const sessionHash = analyticsAssignmentSubjectHash(rawOptions, 'session', {
    projectId,
    sourceId,
    experimentKey,
    experimentId
  });
  if (!visitorHash || (assignmentScope === 'session' && !sessionHash)) {
    return null;
  }

  const routeInput = firstPlainObject(rawOptions.route);
  const routeCandidate = firstDefined(
    routeInput.path,
    routeInput.url,
    routeInput.href,
    rawOptions.path,
    rawOptions.url,
    rawOptions.href,
    rawOptions.originalUrl,
    rawOptions.original_url
  );
  const sanitizedPath = sanitizeAnalyticsPath(routeCandidate);
  const routeKey = cleanAnalyticsString(
    rawOptions.route_hash
    || rawOptions.routeHash
    || routeInput.route_hash
    || routeInput.routeHash,
    ANALYTICS_MAX_ID_LENGTH
  ) || (sanitizedPath ? stableAnalyticsHash(sanitizedPath) : undefined);
  const campaign = firstPlainObject(rawOptions.campaign);
  const client = firstPlainObject(rawOptions.client);
  const geo = firstPlainObject(rawOptions.geo || rawOptions.coarseGeo || rawOptions.coarse_geo);

  return compactObject({
    key: analytics.key,
    source_id: sourceId,
    analytics_source_id: sourceId,
    project_id: projectId,
    service_id: serviceId,
    service_env_id: serviceEnvId,
    env,
    source_kind: sourceKind,
    experiment_id: experimentId,
    experiment_key: experimentKey,
    assignment_scope: assignmentScope === 'session' ? 'session' : 'visitor',
    visitor_hash: visitorHash,
    visitor_salt_version: cleanAnalyticsString(
      rawOptions.visitor_salt_version
      || rawOptions.visitorSaltVersion
      || firstPlainObject(rawOptions.privacy).visitor_hash_salt_version
      || firstPlainObject(rawOptions.privacy).visitorHashSaltVersion,
      ANALYTICS_MAX_ID_LENGTH
    ) || DEFAULT_ANALYTICS_VISITOR_SALT_VERSION,
    session_hash: sessionHash,
    assignment_algorithm: cleanAnalyticsString(rawOptions.assignment_algorithm || rawOptions.assignmentAlgorithm, 64),
    assignment_algorithm_version: cleanAnalyticsString(rawOptions.assignment_algorithm_version || rawOptions.assignmentAlgorithmVersion, 64),
    received_at: cleanIsoTimestamp(rawOptions.received_at || rawOptions.receivedAt || rawOptions.observed_at || rawOptions.observedAt || rawOptions.timestamp),
    assigned_at: cleanIsoTimestamp(rawOptions.assigned_at || rawOptions.assignedAt),
    route_hash: routeKey,
    page_group: cleanAnalyticsString(
      rawOptions.page_group
      || rawOptions.pageGroup
      || routeInput.page_group
      || routeInput.pageGroup
      || defaultAnalyticsPathGroup(sanitizedPath),
      ANALYTICS_MAX_GROUP_LENGTH
    ),
    campaign_source: cleanAnalyticsString(rawOptions.campaign_source || rawOptions.campaignSource || campaign.utm_source || campaign.source, ANALYTICS_MAX_CAMPAIGN_FIELD_LENGTH),
    campaign_medium: cleanAnalyticsString(rawOptions.campaign_medium || rawOptions.campaignMedium || campaign.utm_medium || campaign.medium, ANALYTICS_MAX_CAMPAIGN_FIELD_LENGTH),
    campaign_name: cleanAnalyticsString(rawOptions.campaign_name || rawOptions.campaignName || campaign.utm_campaign || campaign.name, ANALYTICS_MAX_CAMPAIGN_FIELD_LENGTH),
    country_code: cleanAnalyticsString(rawOptions.country_code || rawOptions.countryCode || geo.country_code || geo.countryCode, 2),
    device_type: cleanAnalyticsString(rawOptions.device_type || rawOptions.deviceType || client.device_type || client.deviceType, ANALYTICS_MAX_FAMILY_FIELD_LENGTH),
    context_hash: cleanAnalyticsString(rawOptions.context_hash || rawOptions.contextHash, ANALYTICS_MAX_ID_LENGTH)
  });
}

function analyticsAssignmentSubjectHash(options, kind, scope) {
  const raw = firstPlainObject(options);
  const nested = firstPlainObject(raw[kind]);
  const hash = cleanAnalyticsString(
    kind === 'visitor'
      ? raw.visitor_hash || raw.visitorHash || nested.visitor_hash || nested.visitorHash
      : raw.session_hash || raw.sessionHash || nested.session_hash || nested.sessionHash,
    ANALYTICS_MAX_ID_LENGTH
  );
  if (hash) {
    return hash;
  }

  const rawId = cleanAnalyticsString(
    kind === 'visitor'
      ? raw.visitor_id || raw.visitorId || nested.visitor_id || nested.visitorId
      : raw.session_id || raw.sessionId || nested.session_id || nested.sessionId,
    ANALYTICS_MAX_ID_LENGTH
  );
  if (!rawId) {
    return undefined;
  }

  return stableAnalyticsHash(JSON.stringify({
    kind,
    id: rawId,
    project_id: scope.projectId,
    source_id: scope.sourceId,
    experiment_key: scope.experimentKey,
    experiment_id: scope.experimentId,
    salt_version: DEFAULT_ANALYTICS_VISITOR_SALT_VERSION
  }));
}

function experimentHashString32(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function experimentHashHex(value) {
  return experimentHashString32(value).toString(16).padStart(8, '0');
}

function experimentScope(options = {}, resolved = {}) {
  const opts = firstPlainObject(options);
  const source = firstPlainObject(opts.source);
  const analytics = firstPlainObject(resolved.analytics);
  return {
    project: cleanExperimentId(
      opts.project_id
      || opts.projectId
      || opts.project_key
      || opts.projectKey
      || source.project_id
      || source.projectId
      || analytics.project
      || resolved.project
      || analytics.key
      || 'project'
    ),
    source: cleanExperimentId(
      opts.source_id
      || opts.sourceId
      || source.analytics_source_id
      || source.analyticsSourceId
      || source.source_id
      || source.sourceId
      || analytics.sourceId
      || 'source'
    )
  };
}

function experimentIdentity(options = {}) {
  const opts = firstPlainObject(options);
  const unit = cleanAnalyticsString(opts.unit || opts.stickiness || opts.identity_kind || opts.identityKind, 32);
  const explicit = cleanExperimentId(
    opts.identity
    || opts.identity_id
    || opts.identityId
    || opts.visitor_hash
    || opts.visitorHash
    || opts.visitor_id
    || opts.visitorId
    || opts.session_hash
    || opts.sessionHash
    || opts.session_id
    || opts.sessionId
  );
  return {
    kind: unit ? unit.toLowerCase() : (opts.sessionId || opts.session_id || opts.sessionHash || opts.session_hash ? 'session' : 'visitor'),
    id: explicit || 'anonymous'
  };
}

function selectExperimentVariant(experimentKey, variants, options = {}, resolved = {}) {
  const key = cleanExperimentField(experimentKey);
  const normalizedVariants = normalizeExperimentVariants(variants);
  if (!key || normalizedVariants.length === 0) {
    return null;
  }

  const scope = experimentScope(options, resolved);
  const identity = experimentIdentity(options);
  const variantSignature = normalizedVariants.map((variant) => `${variant.key}:${variant.weight}`).join(',');
  const seed = [
    scope.project,
    scope.source,
    key,
    identity.kind,
    identity.id,
    variantSignature
  ].join('|');
  const bucket = experimentHashString32(seed) / 4294967296;
  const totalWeight = normalizedVariants.reduce((sum, variant) => sum + variant.weight, 0);
  const target = bucket * totalWeight;
  let cumulative = 0;

  for (const variant of normalizedVariants) {
    cumulative += variant.weight;
    if (target < cumulative) {
      return { experimentKey: key, variant, seed };
    }
  }
  return {
    experimentKey: key,
    variant: normalizedVariants[normalizedVariants.length - 1],
    seed
  };
}

function experimentAssignmentMetadata(assignment, options = {}) {
  const rawAssignment = firstPlainObject(assignment);
  const rawOptions = safePlainObjectCopy(options);
  const optionExperiment = firstPlainObject(rawOptions.experiment);
  const assignmentUnit = firstPlainObject(rawAssignment.assignment_unit || rawAssignment.assignmentUnit);
  const sourceScope = firstPlainObject(rawAssignment.source_scope || rawAssignment.sourceScope);
  const traffic = firstPlainObject(rawAssignment.traffic);
  return compactObject({
    ...optionExperiment,
    experiment_key: rawAssignment.experiment_key || rawAssignment.experimentKey || rawAssignment.key,
    experiment_id: rawAssignment.experiment_id || rawAssignment.experimentId,
    variant_key: rawAssignment.variant_key || rawAssignment.variantKey || rawAssignment.variant || rawAssignment.value,
    variant_id: rawAssignment.variant_id || rawAssignment.variantId,
    assignment_id: rawAssignment.assignment_id || rawAssignment.assignmentId,
    assignment_scope: rawAssignment.assignment_scope || rawAssignment.assignmentScope,
    assignment_algorithm: rawAssignment.assignment_algorithm || rawAssignment.assignmentAlgorithm,
    assignment_algorithm_version: rawAssignment.assignment_algorithm_version || rawAssignment.assignmentAlgorithmVersion,
    assignment_bucket: rawAssignment.assignment_bucket ?? rawAssignment.assignmentBucket,
    assignment_unit_hash: rawAssignment.assignment_unit_hash || rawAssignment.assignmentUnitHash,
    assignment_unit: sanitizedAnalyticsMetadataOrUndefined(assignmentUnit, {
      blockOverrideUnsafe: true
    }),
    source_scope: sanitizedAnalyticsMetadataOrUndefined(sourceScope, {
      blockOverrideUnsafe: true
    }),
    traffic: sanitizedAnalyticsMetadataOrUndefined(traffic, {
      blockOverrideUnsafe: true
    }),
    override_metadata: sanitizedAnalyticsOverrideMetadataOrUndefined(rawAssignment.override_metadata || rawAssignment.overrideMetadata),
    in_experiment: optionalBooleanValue(rawAssignment.in_experiment ?? rawAssignment.inExperiment),
    assigned_at: rawAssignment.assigned_at || rawAssignment.assignedAt,
    received_at: rawAssignment.received_at || rawAssignment.receivedAt
  });
}

function sampleHookForEventType(options, type, event) {
  const sampler = samplerForEventType(options, type);
  if (!sampler) {
    return undefined;
  }

  try {
    return sampler(event, {
      eventType: type || 'exception',
      defaultSampleRate: sampleRateForEventType(options, type)
    });
  } catch (_error) {
    return undefined;
  }
}

function samplerForEventType(options, type) {
  if (type === 'transaction' || type === 'request') {
    return options.requestSampler;
  }
  if (type === 'exception') {
    return options.exceptionSampler;
  }
  if (type === 'span') {
    return options.spanSampler;
  }
  return undefined;
}

function sampleRateForEventType(options, type) {
  if (type === 'transaction' || type === 'request') {
    return options.requestSampleRate ?? options.sampleRate;
  }
  if (type === 'exception') {
    return options.exceptionSampleRate ?? options.sampleRate;
  }
  if (type === 'message') {
    return options.messageSampleRate ?? options.sampleRate;
  }
  if (type === 'span') {
    return options.spanSampleRate ?? options.sampleRate;
  }
  return options.sampleRate;
}

function requestContext(req, options = {}) {
  const requestId = getRequestId(req);
  const route = getRoute(req, options);
  const path = getRequestPath(req, options);
  const url = getRequestUrl(req, options);
  const queryParams = getRequestQueryParams(req, options);
  const headers = getRequestHeaders(req, options);

  return {
    id: requestId,
    method: sanitizeTagValue(req && req.method, options),
    route,
    path,
    url,
    queryParams,
    headers
  };
}

function getRoute(req, options = {}) {
  const routePath = req.route && req.route.path;
  if (!routePath) {
    return undefined;
  }

  const baseUrl = req.baseUrl || '';
  return scrubAndSanitizeUrl(`${baseUrl}${formatRoutePath(routePath)}`, options, {
    field: 'route'
  });
}

function formatRoutePath(routePath) {
  if (Array.isArray(routePath)) {
    return routePath.map((item) => String(item)).join(',');
  }
  return String(routePath);
}

function getRequestPath(req, options = {}) {
  if (!req) {
    return undefined;
  }

  if (typeof req.path === 'string' && req.path) {
    return scrubAndSanitizeUrl(req.path, options, {
      field: 'path'
    });
  }

  const candidate = req.originalUrl || req.url;
  if (typeof candidate !== 'string' || !candidate) {
    return undefined;
  }

  const pathOnly = candidate.split('?')[0].split('#')[0];
  return scrubAndSanitizeUrl(pathOnly || '/', options, {
    field: 'path'
  });
}

function getRequestId(req) {
  return sanitizeTagValue(
    req && req.id,
    getHeader(req, 'x-request-id'),
    getHeader(req, 'x-correlation-id'),
    getHeader(req, 'traceparent')
  );
}

function getHeader(req, name) {
  if (!req || !req.headers) {
    return undefined;
  }

  const value = req.headers[name] || req.headers[name.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function getRequestUrl(req, options = {}) {
  if (!req) {
    return undefined;
  }

  const candidate = req.originalUrl || req.url;
  if (typeof candidate !== 'string' || !candidate) {
    return undefined;
  }

  return scrubAndSanitizeUrl(candidate, options, {
    field: 'url'
  });
}

function getRequestQueryParams(req, options = {}) {
  if (!req) {
    return undefined;
  }

  const query = firstPlainObject(req.query);
  if (Object.keys(query).length > 0) {
    return scrubAndSanitizeQueryParams(query, options, {
      field: 'queryParams'
    });
  }

  const candidate = req.originalUrl || req.url;
  if (typeof candidate !== 'string' || !candidate.includes('?')) {
    return undefined;
  }

  const params = {};
  const queryString = candidate.split('?')[1].split('#')[0];
  for (const [key, value] of new URLSearchParams(queryString).entries()) {
    if (params[key] === undefined) {
      params[key] = value;
    } else if (Array.isArray(params[key])) {
      params[key].push(value);
    } else {
      params[key] = [params[key], value];
    }
  }

  return scrubAndSanitizeQueryParams(params, options, {
    field: 'queryParams'
  });
}

function getRequestHeaders(req, options = {}) {
  if (!req || !req.headers || typeof req.headers !== 'object') {
    return undefined;
  }

  return scrubAndSanitizeHeaders(req.headers, options, {
    field: 'headers'
  });
}

function requestTags(req, res, context, transaction, options = {}) {
  const standardTags = {
    'http.method': context.method,
    'http.route': context.route,
    'http.status_code': transaction.statusCode,
    'handrail.request_id': context.id
  };

  return sanitizeTags(applyScrubberHook(options.scrubTags, {
    ...standardTags,
    ...extractRequestTags(req),
    ...extractResponseTags(res),
    ...standardTags
  }, {
    field: 'tags',
    eventType: 'transaction'
  }), options);
}

function analyticsObservationContext(req, res, options = {}, request = {}) {
  const requestContextValue = firstPlainObject(req && req.handrailAnalytics, req && req.analytics);
  const responseContextValue = firstPlainObject(
    res && res.locals && res.locals.handrailAnalytics,
    res && res.locals && res.locals.analytics
  );
  const merged = {
    ...options,
    ...requestContextValue,
    ...responseContextValue
  };
  const context = {
    method: request.method,
    path: request.path,
    route: request.route,
    statusCode: request.statusCode,
    durationMs: request.durationMs
  };

  return compactObject({
    type: cleanAnalyticsString(merged.type, 64),
    eventName: cleanAnalyticsString(merged.eventName || merged.event_name || merged.name, ANALYTICS_MAX_EVENT_NAME_LENGTH),
    visitorId: cleanAnalyticsString(
      firstDefined(merged.visitorId, merged.visitor_id, getHeader(req, 'x-handrail-visitor-id')),
      ANALYTICS_MAX_ID_LENGTH
    ),
    sessionId: cleanAnalyticsString(
      firstDefined(merged.sessionId, merged.session_id, getHeader(req, 'x-handrail-session-id')),
      ANALYTICS_MAX_ID_LENGTH
    ),
    pathGroup: resolveAnalyticsObservationValue(
      firstDefined(merged.pathGroup, merged.path_group, merged.pageGroup, merged.page_group),
      req,
      res,
      context
    ) || defaultAnalyticsPathGroup(request.route || request.path),
    source: merged.source,
    visitor: merged.visitor,
    session: merged.session,
    campaign: merged.campaign,
    client: merged.client,
    geo: merged.geo,
    release: merged.release,
    conversion: merged.conversion,
    experiment: merged.experiment,
    custom: merged.custom,
    properties: {
      ...firstPlainObject(options.properties, options.props),
      ...firstPlainObject(requestContextValue.properties, requestContextValue.props),
      ...firstPlainObject(responseContextValue.properties, responseContextValue.props)
    },
    privacy: merged.privacy,
    route: {
      ...firstPlainObject(options.route),
      ...firstPlainObject(requestContextValue.route),
      ...firstPlainObject(responseContextValue.route)
    }
  });
}

function resolveAnalyticsObservationValue(value, req, res, context) {
  if (typeof value !== 'function') {
    return cleanAnalyticsString(value, ANALYTICS_MAX_GROUP_LENGTH);
  }

  try {
    return cleanAnalyticsString(value(req, res, context), ANALYTICS_MAX_GROUP_LENGTH);
  } catch (_error) {
    return undefined;
  }
}

function defaultAnalyticsPathGroup(value) {
  const path = sanitizeAnalyticsPath(value);
  if (!path || path === '/') {
    return '/';
  }
  const firstSegment = path.split('/').filter(Boolean)[0];
  return firstSegment ? `/${firstSegment}` : '/';
}

function analyticsRequestUrlCandidate(req) {
  if (!req) {
    return undefined;
  }
  return cleanAnalyticsString(req.originalUrl || req.url || req.path, ANALYTICS_MAX_PATH_LENGTH * 2);
}

function requestReferrer(req) {
  return getHeader(req, 'referer') || getHeader(req, 'referrer');
}

function buildProductAnalyticsPayload(input = {}, options = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const resolved = resolveAnalyticsBuildOptions(options);
  const analytics = resolved.analytics || {};
  const eventKind = normalizeAnalyticsEventKind(raw.event_kind || raw.eventKind || raw.event_type || raw.eventType || raw.type || raw.kind);

  if (!eventKind || !isAllowedAnalyticsEventType(analytics, eventKind, raw)) {
    return null;
  }

  const observedAt = cleanIsoTimestamp(raw.observed_at || raw.observedAt || raw.timestamp) || new Date().toISOString();
  const routeInput = firstPlainObject(raw.route);
  const routeCandidate = firstDefined(
    routeInput.path,
    routeInput.url,
    routeInput.href,
    raw.path,
    raw.url,
    raw.href,
    raw.originalUrl,
    raw.original_url
  );
  const path = sanitizeAnalyticsPath(routeCandidate);
  const normalizedPath = normalizeAnalyticsRoutePath(
    firstDefined(routeInput.normalized_path, routeInput.normalizedPath, routeInput.route, routeInput.routePath, path),
    resolved,
    {
      eventKind,
      path,
      rawEvent: raw
    }
  );
  const referrerDomain = analyticsReferrerDomain(firstDefined(
    routeInput.referrer_domain,
    routeInput.referrerDomain,
    routeInput.referrer,
    routeInput.referrer_url,
    routeInput.referrerUrl,
    raw.referrer_domain,
    raw.referrerDomain,
    raw.referrer,
    raw.referrer_url,
    raw.referrerUrl
  ));
  const custom = sanitizeAnalyticsCustom(raw, eventKind, analytics);
  const conversion = sanitizeAnalyticsConversion(raw);
  const experiment = sanitizeAnalyticsExperiment(raw);

  if (eventKind === 'custom_event' && !custom.event_name) {
    return null;
  }
  if (eventKind === 'conversion' && !conversion.conversion_id && !conversion.conversion_name) {
    return null;
  }
  if (eventKind === 'experiment_exposure' && (!experiment.experiment_key || !experiment.variant_key)) {
    return null;
  }

  const routeKey = normalizedPath
    || cleanAnalyticsString(routeInput.page_group || routeInput.pageGroup, ANALYTICS_MAX_GROUP_LENGTH)
    || cleanAnalyticsString(routeInput.screen_name || routeInput.screenName, ANALYTICS_MAX_GROUP_LENGTH)
    || custom.event_name
    || cleanAnalyticsString(raw.event_id || raw.eventId || raw.id, ANALYTICS_MAX_ID_LENGTH);
  const deterministicEventId = deterministicAnalyticsEventId({
    eventKind,
    observedAt,
    sourceId: analytics.sourceId,
    visitor: raw.visitor || raw.visitorId || raw.visitor_id || raw.visitorHash || raw.visitor_hash,
    session: raw.session || raw.sessionId || raw.session_id || raw.sessionHash || raw.session_hash,
    routeKey,
    custom,
    conversion,
    experiment
  });
  const eventId = cleanAnalyticsString(raw.event_id || raw.eventId || raw.id, ANALYTICS_MAX_ID_LENGTH) || deterministicEventId;
  const release = sanitizeAnalyticsRelease(raw.release, resolved, analytics);

  return {
    schema_version: ANALYTICS_SCHEMA_VERSION,
    event_kind: eventKind,
    observed_at: observedAt,
    received_at: cleanIsoTimestamp(raw.received_at || raw.receivedAt),
    event_id: eventId,
    dedupe_key: cleanAnalyticsString(raw.dedupe_key || raw.dedupeKey, ANALYTICS_MAX_ID_LENGTH) || eventId,
    project: cleanAnalyticsString(analytics.project || resolved.project, ANALYTICS_MAX_SOURCE_FIELD_LENGTH),
    service: cleanAnalyticsString(analytics.service || resolved.service, ANALYTICS_MAX_SOURCE_FIELD_LENGTH),
    env: cleanAnalyticsString(analytics.environment || analytics.env || resolved.environment, ANALYTICS_MAX_SOURCE_FIELD_LENGTH),
    source: sanitizeAnalyticsSource(raw.source, resolved, analytics),
    visitor: sanitizeAnalyticsVisitor(raw.visitor || raw, raw.privacy),
    session: sanitizeAnalyticsSession(raw.session || raw),
    route: compactObject({
      path,
      normalized_path: normalizedPath,
      page_group: cleanAnalyticsString(routeInput.page_group || routeInput.pageGroup || raw.pageGroup || raw.pathGroup, ANALYTICS_MAX_GROUP_LENGTH),
      route_hash: routeKey ? stableAnalyticsHash(routeKey) : undefined,
      route_name: cleanAnalyticsString(routeInput.route_name || routeInput.routeName || raw.routeName, ANALYTICS_MAX_GROUP_LENGTH),
      screen_name: cleanAnalyticsString(routeInput.screen_name || routeInput.screenName || raw.screenName, ANALYTICS_MAX_GROUP_LENGTH),
      screen_class: cleanAnalyticsString(routeInput.screen_class || routeInput.screenClass || raw.screenClass, ANALYTICS_MAX_GROUP_LENGTH),
      referrer_domain: referrerDomain
    }),
    campaign: sanitizeAnalyticsCampaign(routeCandidate, raw.campaign),
    client: sanitizeAnalyticsClient(raw.client),
    geo: sanitizeAnalyticsGeo(raw.geo || raw.coarseGeo || raw.coarse_geo),
    release,
    conversion,
    experiment,
    custom,
    privacy: sanitizeAnalyticsPrivacy(raw.privacy)
  };
}

function resolveAnalyticsBuildOptions(options = {}) {
  if (options && options.analytics && typeof options.analytics === 'object') {
    return options;
  }

  const maybeAnalyticsOnly = options && typeof options === 'object' && (
    options.sourceId !== undefined
    || options.endpoint !== undefined
    || options.key !== undefined
    || options.publicKey !== undefined
    || options.writeKey !== undefined
  );
  if (maybeAnalyticsOnly) {
    return {
      project: stringOrUndefined(options.project),
      environment: stringOrUndefined(options.environment || options.env),
      service: stringOrUndefined(options.service),
      release: stringOrUndefined(options.release),
      analytics: normalizeAnalyticsOptions({}, options, options)
    };
  }

  return normalizeOptions(options || {});
}

function normalizeAnalyticsEventKind(value) {
  const normalized = cleanAnalyticsString(value, 64);
  const kind = normalized && normalized.toLowerCase().replace(/[\s-]+/g, '_');
  if (!kind) {
    return 'custom_event';
  }
  if (kind === 'page' || kind === 'pageview' || kind === 'page_view') {
    return 'page_view';
  }
  if (kind === 'route' || kind === 'routeview' || kind === 'route_view' || kind === 'request' || kind === 'server_request') {
    return 'route_view';
  }
  if (kind === 'track' || kind === 'custom' || kind === 'custom_event') {
    return 'custom_event';
  }
  if (kind === 'experiment' || kind === 'exposure' || kind === 'experiment_exposure') {
    return 'experiment_exposure';
  }
  if (kind === 'conversion' || kind === 'convert') {
    return 'conversion';
  }
  return ANALYTICS_EVENT_KINDS.has(kind) ? kind : null;
}

function isAllowedAnalyticsEventType(analytics, eventKind, raw) {
  const allowed = analytics && Array.isArray(analytics.allowedEventTypes) ? analytics.allowedEventTypes : null;
  if (!allowed || allowed.length === 0) {
    return true;
  }

  const aliases = new Set([
    eventKind,
    raw && raw.type,
    raw && raw.event_type,
    raw && raw.eventType
  ].filter(Boolean).map((item) => String(item).trim()));
  if (eventKind === 'page_view') {
    aliases.add('page');
  }
  if (eventKind === 'route_view') {
    aliases.add('route');
    aliases.add('request');
  }
  if (eventKind === 'custom_event') {
    aliases.add('track');
    aliases.add('custom');
  }
  if (eventKind === 'experiment_exposure') {
    aliases.add('experiment');
    aliases.add('exposure');
  }

  return allowed.some((item) => aliases.has(String(item).trim()));
}

function sanitizeAnalyticsSource(source, resolved, analytics) {
  const rawSource = firstPlainObject(source);
  const publicHost = cleanAnalyticsHost(rawSource.public_host || rawSource.publicHost || rawSource.site_host || rawSource.siteHost || analytics.publicHost);
  return compactObject({
    source_kind: cleanAnalyticsSourceKind(rawSource.source_kind || rawSource.sourceKind || analytics.sourceKind) || DEFAULT_ANALYTICS_SOURCE_KIND,
    analytics_source_id: cleanAnalyticsString(rawSource.analytics_source_id || rawSource.analyticsSourceId || analytics.sourceId, ANALYTICS_MAX_ID_LENGTH),
    sdk_name: cleanAnalyticsString(rawSource.sdk_name || rawSource.sdkName || SDK_NAME, ANALYTICS_MAX_SOURCE_FIELD_LENGTH),
    sdk_version: cleanAnalyticsString(rawSource.sdk_version || rawSource.sdkVersion || SDK_VERSION, ANALYTICS_MAX_SOURCE_FIELD_LENGTH),
    transport: cleanAnalyticsString(rawSource.transport || 'node', ANALYTICS_MAX_SOURCE_FIELD_LENGTH),
    platform: cleanAnalyticsString(rawSource.platform || 'node', ANALYTICS_MAX_SOURCE_FIELD_LENGTH),
    site_host: cleanAnalyticsHost(rawSource.site_host || rawSource.siteHost) || publicHost,
    public_host: publicHost,
    project: cleanAnalyticsString(analytics.project || resolved.project, ANALYTICS_MAX_SOURCE_FIELD_LENGTH),
    service: cleanAnalyticsString(analytics.service || resolved.service, ANALYTICS_MAX_SOURCE_FIELD_LENGTH),
    service_env: cleanAnalyticsString(analytics.serviceEnv || analytics.service_env, ANALYTICS_MAX_SOURCE_FIELD_LENGTH),
    env: cleanAnalyticsString(analytics.environment || analytics.env || resolved.environment, ANALYTICS_MAX_SOURCE_FIELD_LENGTH)
  });
}

function cleanAnalyticsSourceKind(value) {
  const sourceKind = cleanAnalyticsString(value, 32);
  if (!sourceKind) {
    return undefined;
  }
  const normalized = sourceKind.toLowerCase();
  return ['web', 'server', 'mobile'].includes(normalized) ? normalized : undefined;
}

function sanitizeAnalyticsVisitor(visitor, privacy) {
  const raw = firstPlainObject(visitor);
  const rawPrivacy = firstPlainObject(privacy);
  const visitorHash = cleanAnalyticsString(
    raw.visitor_hash || raw.visitorHash || raw.visitor_id || raw.visitorId,
    ANALYTICS_MAX_ID_LENGTH
  );
  const saltVersion = cleanAnalyticsString(
    raw.salt_version || raw.saltVersion || rawPrivacy.visitor_hash_salt_version || rawPrivacy.visitorHashSaltVersion,
    ANALYTICS_MAX_ID_LENGTH
  ) || (visitorHash ? DEFAULT_ANALYTICS_VISITOR_SALT_VERSION : undefined);

  return compactObject({
    visitor_hash: visitorHash,
    salt_version: saltVersion
  });
}

function sanitizeAnalyticsSession(session) {
  const raw = firstPlainObject(session);
  return compactObject({
    session_hash: cleanAnalyticsString(raw.session_hash || raw.sessionHash || raw.session_id || raw.sessionId, ANALYTICS_MAX_ID_LENGTH),
    sequence_index: nonNegativeIntegerValue(raw.sequence_index ?? raw.sequenceIndex),
    started_at: cleanIsoTimestamp(raw.started_at || raw.startedAt),
    ended_at: cleanIsoTimestamp(raw.ended_at || raw.endedAt),
    duration_ms: nonNegativeIntegerValue(raw.duration_ms ?? raw.durationMs)
  });
}

function sanitizeAnalyticsCampaign(routeCandidate, campaign) {
  const output = {};
  const searchParams = analyticsSearchParams(routeCandidate);
  for (const field of ANALYTICS_CAMPAIGN_FIELDS) {
    const value = firstDefined(firstPlainObject(campaign)[field], searchParams.get(field));
    const clean = cleanAnalyticsString(value, ANALYTICS_MAX_CAMPAIGN_FIELD_LENGTH);
    if (clean) {
      output[field] = clean;
    }
  }
  return output;
}

function sanitizeAnalyticsClient(client) {
  const raw = firstPlainObject(client);
  const deviceType = cleanAnalyticsString(raw.device_type || raw.deviceType, ANALYTICS_MAX_FAMILY_FIELD_LENGTH);
  return compactObject({
    browser_family: cleanAnalyticsString(raw.browser_family || raw.browserFamily, ANALYTICS_MAX_FAMILY_FIELD_LENGTH),
    os_family: cleanAnalyticsString(raw.os_family || raw.osFamily, ANALYTICS_MAX_FAMILY_FIELD_LENGTH),
    device_family: cleanAnalyticsString(raw.device_family || raw.deviceFamily, ANALYTICS_MAX_FAMILY_FIELD_LENGTH),
    device_type: ANALYTICS_DEVICE_TYPES.has(deviceType) ? deviceType : undefined,
    viewport_width: nonNegativeIntegerValue(raw.viewport_width ?? raw.viewportWidth),
    viewport_height: nonNegativeIntegerValue(raw.viewport_height ?? raw.viewportHeight),
    screen_width: nonNegativeIntegerValue(raw.screen_width ?? raw.screenWidth),
    screen_height: nonNegativeIntegerValue(raw.screen_height ?? raw.screenHeight),
    locale: cleanAnalyticsString(raw.locale, ANALYTICS_MAX_FAMILY_FIELD_LENGTH),
    time_zone: cleanAnalyticsString(raw.time_zone || raw.timeZone, ANALYTICS_MAX_FAMILY_FIELD_LENGTH)
  });
}

function sanitizeAnalyticsGeo(geo) {
  const raw = firstPlainObject(geo);
  return compactObject({
    country_code: cleanAnalyticsString(raw.country_code || raw.countryCode, ANALYTICS_MAX_GEO_FIELD_LENGTH),
    region_code: cleanAnalyticsString(raw.region_code || raw.regionCode, ANALYTICS_MAX_GEO_FIELD_LENGTH),
    region_name: cleanAnalyticsString(raw.region_name || raw.regionName, ANALYTICS_MAX_GEO_FIELD_LENGTH),
    continent_code: cleanAnalyticsString(raw.continent_code || raw.continentCode, ANALYTICS_MAX_GEO_FIELD_LENGTH)
  });
}

function sanitizeAnalyticsRelease(release, resolved, analytics) {
  const raw = firstPlainObject(release);
  return compactObject({
    release: cleanAnalyticsString(raw.release || raw.release_name || raw.releaseName || analytics.release || resolved.release, ANALYTICS_MAX_RELEASE_FIELD_LENGTH),
    deployment_id: cleanAnalyticsString(raw.deployment_id || raw.deploymentId, ANALYTICS_MAX_RELEASE_FIELD_LENGTH),
    deploy_id: cleanAnalyticsString(raw.deploy_id || raw.deployId, ANALYTICS_MAX_RELEASE_FIELD_LENGTH),
    commit_sha: cleanAnalyticsString(raw.commit_sha || raw.commitSha, ANALYTICS_MAX_RELEASE_FIELD_LENGTH),
    commit_ref: cleanAnalyticsString(raw.commit_ref || raw.commitRef, ANALYTICS_MAX_RELEASE_FIELD_LENGTH),
    build_id: cleanAnalyticsString(raw.build_id || raw.buildId, ANALYTICS_MAX_RELEASE_FIELD_LENGTH),
    app_version: cleanAnalyticsString(raw.app_version || raw.appVersion, ANALYTICS_MAX_RELEASE_FIELD_LENGTH),
    app_build: cleanAnalyticsString(raw.app_build || raw.appBuild, ANALYTICS_MAX_RELEASE_FIELD_LENGTH)
  });
}

function sanitizeAnalyticsConversion(raw) {
  const conversion = firstPlainObject(raw.conversion);
  const currency = cleanAnalyticsString(conversion.currency || raw.currency, 3);
  return compactObject({
    conversion_id: cleanAnalyticsString(conversion.conversion_id || conversion.conversionId || raw.conversion_id || raw.conversionId, ANALYTICS_MAX_ID_LENGTH),
    conversion_name: cleanAnalyticsString(conversion.conversion_name || conversion.conversionName || raw.conversion_name || raw.conversionName, ANALYTICS_MAX_EVENT_NAME_LENGTH),
    conversion_type: cleanAnalyticsString(conversion.conversion_type || conversion.conversionType || raw.conversion_type || raw.conversionType, ANALYTICS_MAX_EVENT_NAME_LENGTH),
    value: finiteNumberValue(conversion.value ?? raw.value),
    currency: currency ? currency.toUpperCase() : undefined
  });
}

function sanitizeAnalyticsExperiment(raw) {
  const experiment = firstPlainObject(raw.experiment);
  const assignmentUnit = firstPlainObject(experiment.assignment_unit || experiment.assignmentUnit || raw.assignment_unit || raw.assignmentUnit);
  const sourceScope = firstPlainObject(experiment.source_scope || experiment.sourceScope || raw.source_scope || raw.sourceScope);
  const traffic = firstPlainObject(experiment.traffic || raw.traffic);
  return compactObject({
    experiment_key: cleanAnalyticsString(experiment.experiment_key || experiment.experimentKey || experiment.key || raw.experiment_key || raw.experimentKey, ANALYTICS_MAX_EXPERIMENT_FIELD_LENGTH),
    experiment_id: cleanAnalyticsString(experiment.experiment_id || experiment.experimentId || raw.experiment_id || raw.experimentId, ANALYTICS_MAX_ID_LENGTH),
    variant_key: cleanAnalyticsString(experiment.variant_key || experiment.variantKey || experiment.variant || raw.variant_key || raw.variantKey || raw.variant, ANALYTICS_MAX_EXPERIMENT_FIELD_LENGTH),
    variant_id: cleanAnalyticsString(experiment.variant_id || experiment.variantId || raw.variant_id || raw.variantId, ANALYTICS_MAX_ID_LENGTH),
    assignment_id: cleanAnalyticsString(experiment.assignment_id || experiment.assignmentId || raw.assignment_id || raw.assignmentId, ANALYTICS_MAX_ID_LENGTH),
    exposure_id: cleanAnalyticsString(experiment.exposure_id || experiment.exposureId || raw.exposure_id || raw.exposureId, ANALYTICS_MAX_ID_LENGTH),
    assignment_scope: cleanAnalyticsString(experiment.assignment_scope || experiment.assignmentScope || raw.assignment_scope || raw.assignmentScope, 32),
    assignment_algorithm: cleanAnalyticsString(experiment.assignment_algorithm || experiment.assignmentAlgorithm || raw.assignment_algorithm || raw.assignmentAlgorithm, 64),
    assignment_algorithm_version: cleanAnalyticsString(experiment.assignment_algorithm_version || experiment.assignmentAlgorithmVersion || raw.assignment_algorithm_version || raw.assignmentAlgorithmVersion, 64),
    assignment_bucket: finiteNumberValue(experiment.assignment_bucket ?? experiment.assignmentBucket ?? raw.assignment_bucket ?? raw.assignmentBucket),
    assignment_unit_hash: cleanAnalyticsString(experiment.assignment_unit_hash || experiment.assignmentUnitHash || raw.assignment_unit_hash || raw.assignmentUnitHash, ANALYTICS_MAX_ID_LENGTH),
    assignment_unit: sanitizedAnalyticsMetadataOrUndefined(assignmentUnit, {
      blockOverrideUnsafe: true
    }),
    source_scope: sanitizedAnalyticsMetadataOrUndefined(sourceScope, {
      blockOverrideUnsafe: true
    }),
    traffic: sanitizedAnalyticsMetadataOrUndefined(traffic, {
      blockOverrideUnsafe: true
    }),
    override_metadata: sanitizedAnalyticsOverrideMetadataOrUndefined(experiment.override_metadata || experiment.overrideMetadata || raw.override_metadata || raw.overrideMetadata),
    in_experiment: optionalBooleanValue(experiment.in_experiment ?? experiment.inExperiment ?? raw.in_experiment ?? raw.inExperiment),
    assigned_at: cleanIsoTimestamp(experiment.assigned_at || experiment.assignedAt || raw.assigned_at || raw.assignedAt),
    received_at: cleanIsoTimestamp(experiment.received_at || experiment.receivedAt || raw.received_at || raw.receivedAt)
  });
}

function sanitizedAnalyticsOverrideMetadataOrUndefined(value) {
  const sanitized = sanitizedAnalyticsMetadataOrUndefined(value, {
    blockOverrideUnsafe: true,
    maxKeys: 32
  });
  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== 'object') {
    return undefined;
  }
  return normalizeAnalyticsOverrideMetadataExpiry(sanitized);
}

function normalizeAnalyticsOverrideMetadataExpiry(metadata) {
  const output = { ...metadata };
  normalizeAnalyticsOverrideExpiryPair(output);
  if (output.override && typeof output.override === 'object' && !Array.isArray(output.override)) {
    output.override = { ...output.override };
    normalizeAnalyticsOverrideExpiryPair(output.override);
  }
  return output;
}

function normalizeAnalyticsOverrideExpiryPair(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return;
  }
  if (typeof value.no_expiry !== 'boolean') {
    delete value.no_expiry;
  }
  if (value.no_expiry === true) {
    delete value.expires_at;
    return;
  }
  if (value.expires_at !== undefined) {
    const expiresAt = cleanIsoTimestamp(value.expires_at);
    if (expiresAt) {
      value.expires_at = expiresAt;
    } else {
      delete value.expires_at;
    }
  }
}

function sanitizedAnalyticsMetadataOrUndefined(value, options = {}) {
  const sanitized = sanitizeAnalyticsBoundedMetadata(value, options, 0);
  if (Array.isArray(sanitized)) {
    return sanitized.length > 0 ? sanitized : undefined;
  }
  if (sanitized && typeof sanitized === 'object') {
    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  }
  return sanitized;
}

function sanitizeAnalyticsBoundedMetadata(value, options = {}, depth = 0) {
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (analyticsUnsafeMetadataString(value)) {
      return undefined;
    }
    return cleanAnalyticsString(value, ANALYTICS_MAX_EXPERIMENT_METADATA_STRING_LENGTH);
  }
  if (Array.isArray(value)) {
    if (depth >= ANALYTICS_MAX_EXPERIMENT_METADATA_DEPTH) {
      return undefined;
    }
    const items = [];
    for (const item of value.slice(0, ANALYTICS_MAX_EXPERIMENT_METADATA_ARRAY_ITEMS)) {
      const sanitized = sanitizeAnalyticsBoundedMetadata(item, options, depth + 1);
      if (sanitized !== undefined) {
        items.push(sanitized);
      }
    }
    return items.length > 0 ? items : undefined;
  }
  const entries = safePlainObjectEntries(value);
  if (entries.length === 0 || depth >= ANALYTICS_MAX_EXPERIMENT_METADATA_DEPTH) {
    return undefined;
  }
  const output = {};
  const maxKeys = Number.isFinite(Number(options.maxKeys))
    ? Math.max(1, Math.min(64, Math.trunc(Number(options.maxKeys))))
    : ANALYTICS_MAX_EXPERIMENT_METADATA_KEYS;
  for (const [rawKey, rawValue] of entries.slice(0, maxKeys)) {
    const key = cleanAnalyticsString(rawKey, ANALYTICS_MAX_CUSTOM_PROPERTY_KEY_LENGTH);
    if (!key || (options.blockOverrideUnsafe && analyticsBlockedOverrideMetadataKey(key))) {
      continue;
    }
    const sanitized = sanitizeAnalyticsBoundedMetadata(rawValue, options, depth + 1);
    if (sanitized !== undefined) {
      output[key] = sanitized;
    }
  }
  return Object.keys(output).length > 0 ? output : undefined;
}

function analyticsBlockedOverrideMetadataKey(key) {
  const normalized = normalizeAnalyticsKeyName(key);
  if (!normalized) {
    return true;
  }
  if ([
    'raw_headers_returned',
    'raw_ip_returned',
    'raw_payload_returned',
    'raw_user_agent_returned',
    'subject_hash_kind',
    'subject_identifiers_returned',
    'visitor_or_session_hashes_returned'
  ].includes(normalized)) {
    return false;
  }
  if ([
    'assignment_unit',
    'assignment_unit_hash',
    'session_hash',
    'subject_hash',
    'visitor_hash'
  ].includes(normalized)) {
    return true;
  }
  if (analyticsBlockedPiiKey(normalized, new Set())) {
    return true;
  }
  return [
    'body',
    'cookie',
    'cookies',
    'header',
    'headers',
    'href',
    'identifier',
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
    'session_id',
    'subject',
    'url',
    'user_id',
    'visitor',
    'visitor_id'
  ].some((blocked) => (
    normalized === blocked
      || normalized.startsWith(`${blocked}_`)
      || normalized.endsWith(`_${blocked}`)
      || normalized.includes(`_${blocked}_`)
  ));
}

function analyticsUnsafeMetadataString(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^www\./i.test(text)) {
    return true;
  }
  if (/[?&][^=\s]+=[^&\s]+/.test(text)) {
    return true;
  }
  if (/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text)) {
    return true;
  }
  if (/^[0-9a-f:]+$/i.test(text) && (text.match(/:/g) || []).length >= 2) {
    return true;
  }
  return false;
}

function optionalBooleanValue(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  return Boolean(value);
}

function sanitizeAnalyticsCustom(raw, eventKind, analytics) {
  const custom = firstPlainObject(raw.custom);
  const properties = {
    ...requestObservationProperties(raw),
    ...firstPlainObject(raw.properties),
    ...firstPlainObject(raw.props),
    ...firstPlainObject(custom.properties)
  };
  const eventName = cleanAnalyticsString(
    custom.event_name
      || custom.eventName
      || raw.event_name
      || raw.eventName
      || raw.name
      || (eventKind === 'conversion' ? raw.conversion_name || raw.conversionName : undefined)
      || (eventKind === 'experiment_exposure' ? 'experiment_exposure' : undefined),
    ANALYTICS_MAX_EVENT_NAME_LENGTH
  );

  return compactObject({
    event_name: eventName,
    properties: sanitizeAnalyticsCustomProperties(properties, analytics.customPropertyAllowlist)
  });
}

function requestObservationProperties(raw) {
  const props = {};
  const method = cleanAnalyticsString(raw.method, 16);
  const statusCode = normalizeStatusCode(raw.statusCode || raw.status_code);
  const durationMs = nonNegativeIntegerValue(raw.durationMs ?? raw.duration_ms);
  if (method) {
    props.http_method = method;
  }
  if (statusCode) {
    props.http_status = statusCode;
  }
  if (durationMs !== undefined) {
    props.duration_ms = durationMs;
  }
  return props;
}

function sanitizeAnalyticsCustomProperties(properties, allowlist) {
  const output = {};
  const entries = safePlainObjectEntries(properties);
  const allowlistSet = new Set((allowlist || []).map(normalizeAnalyticsKeyName).filter(Boolean));
  for (const [rawKey, value] of entries.slice(0, ANALYTICS_MAX_CUSTOM_PROPERTIES)) {
    const key = cleanAnalyticsString(rawKey, ANALYTICS_MAX_CUSTOM_PROPERTY_KEY_LENGTH);
    if (!key || analyticsBlockedPiiKey(key, allowlistSet)) {
      continue;
    }
    if (value === null || typeof value === 'number' || typeof value === 'boolean') {
      output[key] = value;
    } else if (typeof value === 'string') {
      output[key] = cleanAnalyticsString(value, ANALYTICS_MAX_CUSTOM_PROPERTY_STRING_LENGTH);
    }
  }
  return output;
}

function sanitizeAnalyticsPrivacy(privacy) {
  const raw = firstPlainObject(privacy);
  return {
    query_string_stripped: raw.query_string_stripped ?? raw.queryStringStripped ?? true,
    fragment_stripped: raw.fragment_stripped ?? raw.fragmentStripped ?? true,
    route_normalized: raw.route_normalized ?? raw.routeNormalized ?? true,
    referrer_domain_only: raw.referrer_domain_only ?? raw.referrerDomainOnly ?? true,
    full_ip_persisted: false,
    raw_user_agent_persisted: false,
    raw_payload_persisted: false,
    silent_client_failures: true,
    visitor_hash_salt_version: cleanAnalyticsString(raw.visitor_hash_salt_version || raw.visitorHashSaltVersion, ANALYTICS_MAX_ID_LENGTH)
  };
}

function sanitizeAnalyticsPath(value) {
  const text = cleanAnalyticsString(value, ANALYTICS_MAX_PATH_LENGTH * 2);
  if (!text) {
    return undefined;
  }

  const parsed = safeAnalyticsUrl(text);
  const path = parsed
    ? parsed.pathname || '/'
    : text.split(/[?#]/, 1)[0] || '/';
  const withSlash = path.startsWith('/') ? path : `/${path}`;
  return cleanAnalyticsString(withSlash, ANALYTICS_MAX_PATH_LENGTH);
}

function normalizeAnalyticsRoutePath(value, options, context) {
  const path = sanitizeAnalyticsPath(value);
  if (!path) {
    return undefined;
  }

  const normalizer = options && options.analytics && options.analytics.routeNormalizer;
  if (typeof normalizer === 'function') {
    try {
      const normalized = sanitizeAnalyticsPath(normalizer(path, context));
      if (normalized) {
        return normalized;
      }
    } catch (_error) {
      // Analytics normalization hooks are user code; payload building stays quiet.
    }
  }

  const normalized = path
    .split('/')
    .map((segment) => normalizeAnalyticsRouteSegment(segment))
    .filter((segment) => segment !== null)
    .join('/') || '/';
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeAnalyticsRouteSegment(segment) {
  const decoded = decodePathSegment(segment).trim();
  if (!decoded) {
    return null;
  }
  if (decoded.startsWith(':')) {
    return decoded.replace(/[^a-zA-Z0-9_:.-]/g, '');
  }
  if (/^\d+$/.test(decoded)) {
    return ':id';
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decoded)) {
    return ':id';
  }
  if (/^[0-9a-f]{12,}$/i.test(decoded)) {
    return ':id';
  }
  if (/^[a-z0-9_-]*\d[a-z0-9_-]{7,}$/i.test(decoded)) {
    return ':id';
  }
  if (/^[^/@\s]+@[^/@\s]+\.[^/@\s]+$/.test(decoded)) {
    return ':value';
  }
  return decoded.replace(/\s+/g, '-');
}

function analyticsSearchParams(value) {
  const parsed = safeAnalyticsUrl(value);
  return parsed ? parsed.searchParams : new URLSearchParams();
}

function safeAnalyticsUrl(value, base = 'https://handrail.invalid') {
  const text = cleanAnalyticsString(value, ANALYTICS_MAX_PATH_LENGTH * 2);
  if (!text) {
    return null;
  }
  try {
    return new URL(text, base);
  } catch (_error) {
    return null;
  }
}

function analyticsReferrerDomain(value) {
  const text = cleanAnalyticsString(value, ANALYTICS_MAX_PATH_LENGTH * 2);
  if (!text) {
    return undefined;
  }
  const parsed = safeAnalyticsUrl(text.includes('://') ? text : `https://${text}`);
  return cleanAnalyticsHost(parsed && parsed.hostname);
}

function cleanAnalyticsHost(value) {
  const text = cleanAnalyticsString(value, ANALYTICS_MAX_HOST_LENGTH * 2);
  if (!text) {
    return undefined;
  }
  const parsed = safeAnalyticsUrl(text.includes('://') ? text : `https://${text}`);
  const host = parsed && parsed.host ? parsed.host : text.replace(/^https?:\/\//i, '').split(/[/?#]/, 1)[0];
  return cleanAnalyticsString(host.toLowerCase(), ANALYTICS_MAX_HOST_LENGTH);
}

function deterministicAnalyticsEventId(parts) {
  return `hrae_${stableAnalyticsHash(JSON.stringify(parts)).slice(0, 32)}`;
}

function stableAnalyticsHash(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function cleanIsoTimestamp(value) {
  const text = cleanAnalyticsString(value, 64);
  if (!text) {
    return undefined;
  }
  const time = Date.parse(text);
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
}

function cleanAnalyticsString(value, maxLength) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const text = String(value).trim();
  if (!text) {
    return undefined;
  }
  return maxLength ? text.slice(0, maxLength) : text;
}

function analyticsBlockedPiiKey(key, allowlistSet) {
  const normalized = normalizeAnalyticsKeyName(key);
  if (!normalized || allowlistSet.has(normalized)) {
    return !normalized;
  }
  return ANALYTICS_BLOCKED_PII_KEYS.some((blocked) => (
    normalized === blocked
      || normalized.startsWith(`${blocked}_`)
      || normalized.endsWith(`_${blocked}`)
      || normalized.includes(`_${blocked}_`)
      || (blocked === 'name' && normalized.endsWith('name'))
  ));
}

function normalizeAnalyticsKeyName(value) {
  return String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function decodePathSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch (_error) {
    return segment;
  }
}

function finiteNumberValue(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function nonNegativeIntegerValue(value) {
  const number = finiteNumberValue(value);
  if (number === undefined) {
    return undefined;
  }
  return Math.max(0, Math.trunc(number));
}

function extractRequestTags(req) {
  if (!req) {
    return {};
  }

  return firstPlainObject(req.handrailTags, req.apmTags, req.tags);
}

function extractResponseTags(res) {
  if (!res || !res.locals) {
    return {};
  }

  return firstPlainObject(res.locals.handrailTags, res.locals.apmTags);
}

function firstPlainObject(...values) {
  return values.find((value) => value && typeof value === 'object' && !Array.isArray(value)) || {};
}

function safePlainObjectEntries(value) {
  const source = firstPlainObject(value);
  const entries = [];
  let keys = [];
  try {
    keys = Reflect.ownKeys(source);
  } catch (_error) {
    return entries;
  }

  for (const key of keys) {
    if (typeof key !== 'string') {
      continue;
    }
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(source, key);
    } catch (_error) {
      continue;
    }
    if (!descriptor || descriptor.enumerable !== true || typeof descriptor.get === 'function') {
      continue;
    }
    entries.push([key, descriptor.value]);
  }
  return entries;
}

function safePlainObjectCopy(value) {
  return Object.fromEntries(safePlainObjectEntries(value));
}

function sanitizeTags(tags, options = {}) {
  const clean = {};

  for (const [rawKey, rawValue] of Object.entries(tags || {})) {
    if (Object.keys(clean).length >= DEFAULT_MAX_TAGS) {
      break;
    }

    const key = sanitizeTagKey(rawKey);
    if (!key || clean[key] !== undefined || isRuntimeProductSignalFieldKey(rawKey) || isRuntimeProductSignalFieldKey(key)) {
      continue;
    }

    const value = isSensitiveKey(rawKey, options, 'tags') ? REDACTED : sanitizeTagValue(rawValue);
    if (value === undefined) {
      continue;
    }

    clean[key] = value;
  }

  return clean;
}

function sanitizeEvent(event = {}, options = {}) {
  const safeEvent = { ...event };
  for (const key of Object.keys(safeEvent)) {
    if (isRuntimeProductSignalFieldKey(key)) {
      delete safeEvent[key];
    }
  }

  if (safeEvent.message !== undefined) {
    safeEvent.message = sanitizeMessage(applyScrubberHook(options.scrubMessage, safeEvent.message, {
      field: 'message',
      eventType: safeEvent.type
    }), options);
  }
  if (safeEvent.exception !== undefined) {
    safeEvent.exception = sanitizeException(safeEvent.exception, options);
  }
  if (safeEvent.transaction !== undefined) {
    safeEvent.transaction = sanitizeTransaction(safeEvent.transaction, options);
  }
  if (safeEvent.span !== undefined) {
    safeEvent.span = sanitizeContext(safeEvent.span, options);
  }
  if (safeEvent.context !== undefined) {
    safeEvent.context = sanitizeContext(safeEvent.context, options);
  }
  if (safeEvent.request !== undefined) {
    safeEvent.request = sanitizeRequest(safeEvent.request, options);
  }
  if (safeEvent.metadata !== undefined) {
    safeEvent.metadata = sanitizeContext(safeEvent.metadata, options);
  }
  if (safeEvent.tags !== undefined) {
    safeEvent.tags = sanitizeTags(applyScrubberHook(options.scrubTags, safeEvent.tags, {
      field: 'tags',
      eventType: safeEvent.type
    }), options);
  }
  if (safeEvent.breadcrumbs !== undefined) {
    safeEvent.breadcrumbs = sanitizeBreadcrumbs(safeEvent.breadcrumbs, options);
  }

  return safeEvent;
}

function sanitizeBreadcrumbs(breadcrumbs, options = {}) {
  if (!Array.isArray(breadcrumbs)) {
    return [];
  }

  return breadcrumbs
    .slice(-DEFAULT_MAX_BREADCRUMBS)
    .map((breadcrumb) => sanitizeBreadcrumb(breadcrumb, options))
    .filter(Boolean);
}

function sanitizeBreadcrumb(breadcrumb, options = {}) {
  const hooked = applyScrubberHook(options.scrubBreadcrumb, breadcrumb, {
    field: 'breadcrumb'
  });
  if (hooked === null || hooked === false) {
    return null;
  }

  return {
    timestamp: sanitizeTagValue(hooked && hooked.timestamp),
    category: sanitizeTagValue(hooked && hooked.category) || 'default',
    level: sanitizeTagValue(hooked && hooked.level) || 'info',
    message: sanitizeMessage(applyScrubberHook(options.scrubMessage, hooked && hooked.message, {
      field: 'breadcrumb.message'
    }), options),
    data: sanitizeContext(hooked && hooked.data, options)
  };
}

function sanitizeTransaction(transaction, options = {}) {
  if (!transaction || typeof transaction !== 'object' || Array.isArray(transaction)) {
    return undefined;
  }

  return compactObject({
    method: sanitizeTagValue(transaction.method),
    route: scrubAndSanitizeUrl(transaction.route, options, { field: 'transaction.route' }),
    path: scrubAndSanitizeUrl(transaction.path, options, { field: 'transaction.path' }),
    statusCode: normalizeStatusCode(transaction.statusCode),
    durationMs: Number.isFinite(transaction.durationMs) ? Math.max(0, Math.round(transaction.durationMs)) : undefined
  });
}

function sanitizeRequest(request, options = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    return sanitizeContext(request, options);
  }

  const { headers, queryParams, query, url, originalUrl, path, route, ...rest } = request;
  return compactObject({
    ...sanitizeContext(rest, options),
    route: scrubAndSanitizeUrl(route, options, { field: 'request.route' }),
    path: scrubAndSanitizeUrl(path, options, { field: 'request.path' }),
    url: scrubAndSanitizeUrl(url || originalUrl, options, { field: 'request.url' }),
    queryParams: scrubAndSanitizeQueryParams(queryParams || query, options, { field: 'request.queryParams' }),
    headers: scrubAndSanitizeHeaders(headers, options, { field: 'request.headers' })
  });
}

function sanitizeException(exception, options = {}) {
  if (!exception || typeof exception !== 'object') {
    return normalizeError(exception, options);
  }

  return compactObject({
    name: sanitizeExceptionName(exception.name),
    message: sanitizeMessage(applyScrubberHook(options.scrubMessage, exception.message, {
      field: 'exception.message'
    }), options),
    stack: normalizeStack(exception.stack, options),
    frames: normalizeIntakeFrames(exception.frames, options),
    cause: exception.cause ? sanitizeException(exception.cause, options) : undefined
  });
}

function sanitizeContext(value, options = {}, depth = 0, seen = new WeakSet()) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return sanitizeMessage(value, options);
  }
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value !== 'object') {
    return undefined;
  }
  if (value instanceof Error) {
    return normalizeError(value, options);
  }
  if (depth >= MAX_CONTEXT_DEPTH) {
    return TRUNCATED;
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_CONTEXT_ARRAY_ITEMS).map((item) => sanitizeContext(item, options, depth + 1, seen));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  const clean = {};
  for (const [key, item] of Object.entries(value).slice(0, MAX_CONTEXT_KEYS)) {
    const cleanKey = sanitizeTagKey(key);
    if (!cleanKey || isRuntimeProductSignalFieldKey(key) || isRuntimeProductSignalFieldKey(cleanKey)) {
      continue;
    }

    clean[cleanKey] = isSensitiveKey(key, options)
      ? REDACTED
      : sanitizeContext(item, options, depth + 1, seen);
  }

  return clean;
}

function sanitizeMessage(value, options = {}) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const message = String(value).trim();
  if (!message) {
    return undefined;
  }
  if (SENSITIVE_KEY_PATTERN.test(message) || matchesConfiguredMessagePattern(message, options)) {
    return REDACTED;
  }

  return message.slice(0, MAX_MESSAGE_LENGTH);
}

function sanitizeTagKey(key) {
  if (typeof key !== 'string') {
    return undefined;
  }

  const normalized = key.trim().replace(/[^\w./:-]+/g, '_').slice(0, MAX_TAG_KEY_LENGTH);
  return normalized || undefined;
}

function normalizeRuntimeProductSignalFieldKey(key) {
  if (key === undefined || key === null) {
    return '';
  }
  return String(key).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function isRuntimeProductSignalFieldKey(key) {
  const normalized = normalizeRuntimeProductSignalFieldKey(key);
  return RUNTIME_PRODUCT_SIGNAL_FIELD_KEYS.has(normalized)
    || normalized.endsWith('analyticskey')
    || normalized.endsWith('analyticssourceid');
}

function sanitizeTagValue(...values) {
  const value = values.find((item) => item !== undefined && item !== null && item !== '');
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (SENSITIVE_KEY_PATTERN.test(trimmed)) {
    return REDACTED;
  }

  return trimmed.slice(0, MAX_TAG_VALUE_LENGTH);
}

function sanitizePath(path) {
  if (typeof path !== 'string') {
    return undefined;
  }

  const cleanPath = path.split('?')[0].split('#')[0].trim();
  if (!cleanPath) {
    return undefined;
  }

  return cleanPath.slice(0, MAX_PATH_LENGTH);
}

function scrubAndSanitizeUrl(value, options = {}, context = {}) {
  const hooked = applyScrubberHook(options.scrubUrl, value, context);
  return sanitizeUrl(hooked, options);
}

function sanitizeUrl(url, options = {}) {
  if (typeof url !== 'string') {
    return undefined;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return undefined;
  }

  const [withoutHash] = trimmed.split('#');
  const [rawPath, rawQuery] = withoutHash.split('?');
  const safePath = sanitizePath(rawPath || '/');
  if (!safePath) {
    return undefined;
  }

  if (!rawQuery) {
    return safePath.slice(0, MAX_URL_LENGTH);
  }

  const safeQuery = sanitizeQueryParams(Object.fromEntries(new URLSearchParams(rawQuery).entries()), options);
  const queryString = new URLSearchParams(safeQuery).toString();
  return (queryString ? `${safePath}?${queryString}` : safePath).slice(0, MAX_URL_LENGTH);
}

function scrubAndSanitizeHeaders(headers, options = {}, context = {}) {
  const hooked = applyScrubberHook(options.scrubHeaders, headers, context);
  return sanitizeHeaders(hooked, options);
}

function sanitizeHeaders(headers, options = {}) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return undefined;
  }

  const clean = {};
  for (const [rawKey, rawValue] of Object.entries(headers).slice(0, DEFAULT_MAX_HEADERS)) {
    const key = sanitizeTagKey(String(rawKey).toLowerCase());
    if (!key || isRuntimeProductSignalFieldKey(rawKey) || isRuntimeProductSignalFieldKey(key)) {
      continue;
    }

    const value = isSensitiveKey(rawKey, options, 'headers')
      ? REDACTED
      : sanitizeHeaderValue(rawValue);
    if (value !== undefined) {
      clean[key] = value;
    }
  }

  return Object.keys(clean).length > 0 ? clean : undefined;
}

function sanitizeHeaderValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeTagValue(item)).filter(Boolean).join(', ');
  }
  return sanitizeTagValue(value);
}

function scrubAndSanitizeQueryParams(queryParams, options = {}, context = {}) {
  const hooked = applyScrubberHook(options.scrubQueryParams, queryParams, context);
  return sanitizeQueryParams(hooked, options);
}

function sanitizeQueryParams(queryParams, options = {}) {
  if (!queryParams || typeof queryParams !== 'object' || Array.isArray(queryParams)) {
    return undefined;
  }

  const clean = {};
  for (const [rawKey, rawValue] of Object.entries(queryParams).slice(0, DEFAULT_MAX_QUERY_PARAMS)) {
    const key = sanitizeTagKey(String(rawKey));
    if (!key || isRuntimeProductSignalFieldKey(rawKey) || isRuntimeProductSignalFieldKey(key)) {
      continue;
    }

    const value = isSensitiveKey(rawKey, options, 'queryParams')
      ? REDACTED
      : sanitizeQueryParamValue(rawValue);
    if (value !== undefined) {
      clean[key] = value;
    }
  }

  return Object.keys(clean).length > 0 ? clean : undefined;
}

function sanitizeQueryParamValue(value) {
  if (Array.isArray(value)) {
    return value.slice(0, MAX_CONTEXT_ARRAY_ITEMS).map((item) => sanitizeTagValue(item)).filter(Boolean);
  }
  return sanitizeTagValue(value);
}

function normalizeStatusCode(statusCode) {
  if (Number.isInteger(statusCode) && statusCode >= 100 && statusCode <= 999) {
    return statusCode;
  }
  return undefined;
}

function splitExceptionContext(context = {}) {
  if (!context || typeof context !== 'object' || Array.isArray(context)) {
    return {
      context: sanitizeContext(context),
      request: undefined,
      tags: {}
    };
  }

  const { tags, request, ...rest } = context;
  return {
    context: sanitizeContext(rest),
    request,
    tags: sanitizeTags(tags)
  };
}

function exceptionTags(context = {}) {
  const tags = {};
  if (context && context.mechanism !== undefined) {
    tags['exception.mechanism'] = context.mechanism;
  }
  if (context && context.handled !== undefined) {
    tags['exception.handled'] = Boolean(context.handled);
  }
  return sanitizeTags(tags);
}

function serializeAnalyticsIntakePayload(event, analytics = {}) {
  try {
    const body = JSON.stringify({
      key: analytics.key,
      event
    });
    const maxBodyBytes = integerOrDefault(
      analytics.maxBodyBytes ?? analytics.max_body_bytes,
      ANALYTICS_MAX_TRANSPORT_BODY_BYTES
    );
    return Buffer.byteLength(body, 'utf8') <= maxBodyBytes
      ? body
      : null;
  } catch (_error) {
    return null;
  }
}

async function readJsonResponse(response) {
  if (response && typeof response.json === 'function') {
    return response.json();
  }
  if (response && typeof response.text === 'function') {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }
  return null;
}

function normalizeAnalyticsAssignmentResponse(envelope, client) {
  const response = envelope && typeof envelope === 'object' && !Array.isArray(envelope) ? envelope : {};
  const assignment = firstPlainObject(response.assignment);
  const experimentKey = cleanExperimentField(assignment.experiment_key || assignment.experimentKey);
  const variantKey = cleanExperimentField(assignment.variant_key || assignment.variantKey);
  const assignmentId = cleanExperimentId(assignment.assignment_id || assignment.assignmentId);
  if (!experimentKey && !assignment.experiment_id && !assignment.experimentId) {
    return null;
  }

  const normalized = {
    accepted: response.accepted === undefined ? true : Boolean(response.accepted),
    endpoint: cleanAnalyticsString(response.endpoint, ANALYTICS_MAX_PATH_LENGTH),
    assignment: response.assignment || assignment,
    privacy: firstPlainObject(response.privacy),
    response,
    assignmentId,
    assignment_id: assignmentId,
    experimentId: cleanExperimentId(assignment.experiment_id || assignment.experimentId),
    experiment_id: cleanExperimentId(assignment.experiment_id || assignment.experimentId),
    experimentKey,
    experiment_key: experimentKey,
    variantId: cleanExperimentId(assignment.variant_id || assignment.variantId),
    variant_id: cleanExperimentId(assignment.variant_id || assignment.variantId),
    variantKey,
    variant_key: variantKey,
    variant: variantKey,
    value: variantKey,
    assignmentScope: cleanAnalyticsString(assignment.assignment_scope || assignment.assignmentScope, 32),
    assignment_scope: cleanAnalyticsString(assignment.assignment_scope || assignment.assignmentScope, 32),
    assignmentAlgorithm: cleanAnalyticsString(assignment.assignment_algorithm || assignment.assignmentAlgorithm, 64),
    assignment_algorithm: cleanAnalyticsString(assignment.assignment_algorithm || assignment.assignmentAlgorithm, 64),
    assignmentAlgorithmVersion: cleanAnalyticsString(assignment.assignment_algorithm_version || assignment.assignmentAlgorithmVersion, 64),
    assignment_algorithm_version: cleanAnalyticsString(assignment.assignment_algorithm_version || assignment.assignmentAlgorithmVersion, 64),
    assignmentBucket: Number.isFinite(Number(assignment.assignment_bucket ?? assignment.assignmentBucket))
      ? Number(assignment.assignment_bucket ?? assignment.assignmentBucket)
      : undefined,
    assignment_bucket: Number.isFinite(Number(assignment.assignment_bucket ?? assignment.assignmentBucket))
      ? Number(assignment.assignment_bucket ?? assignment.assignmentBucket)
      : undefined,
    assignmentUnitHash: cleanExperimentId(assignment.assignment_unit_hash || assignment.assignmentUnitHash),
    assignment_unit_hash: cleanExperimentId(assignment.assignment_unit_hash || assignment.assignmentUnitHash),
    assignmentUnit: firstPlainObject(assignment.assignment_unit || assignment.assignmentUnit),
    assignment_unit: firstPlainObject(assignment.assignment_unit || assignment.assignmentUnit),
    sourceScope: firstPlainObject(assignment.source_scope || assignment.sourceScope),
    source_scope: firstPlainObject(assignment.source_scope || assignment.sourceScope),
    traffic: firstPlainObject(assignment.traffic),
    overrideMetadata: firstPlainObject(assignment.override_metadata || assignment.overrideMetadata),
    override_metadata: firstPlainObject(assignment.override_metadata || assignment.overrideMetadata),
    inExperiment: assignment.in_experiment === undefined && assignment.inExperiment === undefined
      ? undefined
      : Boolean(assignment.in_experiment ?? assignment.inExperiment),
    in_experiment: assignment.in_experiment === undefined && assignment.inExperiment === undefined
      ? undefined
      : Boolean(assignment.in_experiment ?? assignment.inExperiment),
    inserted: assignment.inserted === undefined ? undefined : Boolean(assignment.inserted),
    duplicate: assignment.duplicate === undefined ? undefined : Boolean(assignment.duplicate),
    assignedAt: cleanIsoTimestamp(assignment.assigned_at || assignment.assignedAt),
    assigned_at: cleanIsoTimestamp(assignment.assigned_at || assignment.assignedAt),
    receivedAt: cleanIsoTimestamp(assignment.received_at || assignment.receivedAt),
    received_at: cleanIsoTimestamp(assignment.received_at || assignment.receivedAt),
    context: firstPlainObject(assignment.context)
  };

  normalized.expose = (properties, exposureOptions) => {
    if (client && typeof client.trackExperimentExposure === 'function') {
      client.trackExperimentExposure(normalized, properties, exposureOptions);
    }
    return normalized;
  };
  normalized.exposure = normalized.expose;
  normalized.conversion = (eventName, properties, conversionOptions) => {
    if (client && typeof client.trackConversion === 'function') {
      const conversionOptionsWithExperiment = {
        ...safePlainObjectCopy(conversionOptions),
        experiment: experimentAssignmentMetadata(normalized, conversionOptions)
      };
      client.trackConversion(eventName, properties, conversionOptionsWithExperiment);
    }
    return normalized;
  };
  normalized.toString = function toString() {
    return this.variantKey || '';
  };
  normalized.valueOf = function valueOf() {
    return this.value;
  };

  return normalized;
}

function toIntakePayload(event, options) {
  const eventType = intakeEventType(event.type);
  const metadata = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  const release = event.release || metadata.release || options.release || 'unknown';
  const common = {
    event_type: eventType,
    sdk_event_id: event.eventId,
    observed_at: event.timestamp,
    sdk_name: SDK_NAME,
    sdk_version: SDK_VERSION,
    runtime_name: 'node',
    runtime_version: process.version,
    project: metadata.project || options.project,
    service: metadata.service || options.service,
    env: metadata.environment || metadata.env || options.environment,
    release,
    tags: event.tags || {}
  };

  if (eventType === 'request') {
    const transaction = event.transaction || {};
    const request = event.request || {};
    return {
      ...common,
      method: transaction.method || request.method,
      route: transaction.route || request.route || transaction.path || request.path || '/',
      path_sample: transaction.path || request.path,
      status_code: transaction.statusCode || request.statusCode,
      duration_ms: transaction.durationMs,
      request_metadata_json: compactObject({
        request,
        transaction,
        metadata: event.metadata,
        context: event.context
      }),
      breadcrumbs: event.breadcrumbs
    };
  }

  if (eventType === 'exception') {
    const exception = event.exception || {};
    return {
      ...common,
      exception_type: exception.name || 'Error',
      normalized_message: exception.message || event.message || 'Unhandled exception',
      stack_signature: exception.stack,
      stack_frame_sample_json: normalizeIntakeFrames(exception.frames, options),
      exception_metadata_json: compactObject({
        exception,
        request: event.request,
        context: event.context,
        metadata: event.metadata
      }),
      breadcrumbs: event.breadcrumbs
    };
  }

  return {
    ...common,
    message: event.message,
    event_metadata_json: compactObject({
      span: event.span,
      context: event.context,
      metadata: event.metadata
    }),
    breadcrumbs: event.breadcrumbs
  };
}

function intakeEventType(type) {
  if (type === 'transaction' || type === 'request') {
    return 'request';
  }
  if (type === 'message' || type === 'span') {
    return 'span';
  }
  if (type === 'exception' || !type) {
    return 'exception';
  }
  return undefined;
}

function normalizeIntakeFrames(frames, options = {}) {
  if (!Array.isArray(frames)) {
    return [];
  }

  return frames
    .slice(0, MAX_STACK_FRAMES)
    .map((frame) => {
      if (!frame || typeof frame !== 'object') {
        return {};
      }
      return compactObject({
        raw: sanitizeMessage(frame.raw, options),
        file: sanitizeMessage(frame.file || frame.filename || frame.path, options),
        function: sanitizeMessage(frame.function || frame.functionName || frame.method, options),
        module: sanitizeMessage(frame.module, options),
        runtime: 'node',
        line: Number.isInteger(frame.line) ? frame.line : undefined,
        column: Number.isInteger(frame.column) ? frame.column : undefined
      });
    });
}

function compactObject(value) {
  const out = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (item !== undefined && item !== null) {
      out[key] = item;
    }
  }
  return out;
}

function normalizeError(error, options = {}, seen = new WeakSet()) {
  if (error && typeof error === 'object') {
    if (seen.has(error)) {
      return {
        name: 'CircularError',
        message: '[Circular]'
      };
    }
    seen.add(error);

    const normalized = {
      name: sanitizeExceptionName(error.name || (error.constructor && error.constructor.name) || 'Error'),
      message: sanitizeMessage(applyScrubberHook(options.scrubMessage, error.message, {
        field: 'exception.message'
      }), options) || String(error)
    };

    const stack = normalizeStack(error.stack, options);
    if (stack) {
      normalized.stack = stack;
      normalized.frames = parseStackFrames(stack);
    }

    if (error.cause) {
      normalized.cause = normalizeError(error.cause, options, seen);
    }

    return normalized;
  }

  return {
    name: 'NonError',
    message: sanitizeMessage(applyScrubberHook(options.scrubMessage, error, {
      field: 'exception.message'
    }), options) || String(error)
  };
}

function sanitizeExceptionName(name) {
  const cleanName = sanitizeTagValue(name);
  return cleanName || 'Error';
}

function normalizeStack(stack, options = {}) {
  if (typeof stack !== 'string' || !stack.trim()) {
    return undefined;
  }

  return stack
    .split('\n')
    .slice(0, MAX_STACK_FRAMES)
    .map((line) => sanitizeMessage(line, options) || '')
    .join('\n')
    .slice(0, MAX_STACK_LENGTH);
}

function parseStackFrames(stack) {
  if (typeof stack !== 'string') {
    return [];
  }

  return stack
    .split('\n')
    .slice(1, MAX_STACK_FRAMES + 1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((raw) => ({ raw }));
}

function generateEventId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString('hex');
}

function generateAnalyticsLocalId(prefix) {
  return `${prefix}_${generateEventId()}`;
}

function now() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function stringOrUndefined(value) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeApmEndpointMode(value, fallback = DEFAULT_APM_ENDPOINT_MODE) {
  const fallbackMode = stringOrUndefined(fallback) || DEFAULT_APM_ENDPOINT_MODE;
  const raw = stringOrUndefined(value) || fallbackMode;
  const normalized = raw.toLowerCase().replace(/[\s_-]+/g, '-');

  if (normalized === 'direct' || normalized === 'control-plane' || normalized === 'controlplane' || normalized === 'legacy-direct') {
    return 'direct';
  }

  if (normalized === 'gateway' || normalized === 'telemetry' || normalized === 'telemetry-gateway') {
    return 'gateway';
  }

  throw new Error('APM endpoint_mode must be gateway or direct.');
}

function defaultApmEndpointModeForEndpoint(endpoint) {
  return isApmDirectEndpointPath(endpoint) ? 'direct' : DEFAULT_APM_ENDPOINT_MODE;
}

function deriveApmDirectEndpoint(endpoint) {
  const configured = stringOrUndefined(endpoint);
  if (!configured) {
    return DEFAULT_APM_DIRECT_ENDPOINT;
  }

  if (configured === DEFAULT_APM_DIRECT_ENDPOINT) {
    return configured;
  }

  try {
    const parsed = new URL(configured, 'https://handrail.invalid');
    if (isApmDirectEndpointPath(parsed.pathname)) {
      return DEFAULT_APM_DIRECT_ENDPOINT;
    }
  } catch (_error) {
    return DEFAULT_APM_DIRECT_ENDPOINT;
  }

  return DEFAULT_APM_DIRECT_ENDPOINT;
}

function deriveAnalyticsAssignmentEndpoint(endpoint) {
  const configured = stringOrUndefined(endpoint);
  if (!configured) {
    return undefined;
  }

  const isAbsolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(configured);
  try {
    const parsed = new URL(configured, 'https://handrail.invalid');
    const path = parsed.pathname.replace(/\/+$/, '');
    if (path === DEFAULT_ANALYTICS_ASSIGNMENT_ENDPOINT) {
      return configured;
    }
    if (path === '/api/analytics/ingest' || path === '/api/analytics') {
      parsed.pathname = DEFAULT_ANALYTICS_ASSIGNMENT_ENDPOINT;
      parsed.search = '';
      parsed.hash = '';
      return isAbsolute
        ? parsed.toString()
        : parsed.pathname;
    }
  } catch (_error) {
    const trimmed = configured.replace(/\/+$/, '');
    if (trimmed === '/api/analytics/ingest' || trimmed === '/api/analytics') {
      return DEFAULT_ANALYTICS_ASSIGNMENT_ENDPOINT;
    }
  }

  return undefined;
}

function isApmDirectEndpointPath(endpoint) {
  const configured = stringOrUndefined(endpoint);
  if (!configured) {
    return false;
  }

  try {
    const parsed = new URL(configured, 'https://handrail.invalid');
    return parsed.pathname.replace(/\/+$/, '') === DEFAULT_APM_DIRECT_ENDPOINT;
  } catch (_error) {
    return configured.replace(/\/+$/, '') === DEFAULT_APM_DIRECT_ENDPOINT;
  }
}

function sampleRateOrDefault(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return fallback;
  }
  return parsed;
}

function integerOrDefault(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
}

function nonNegativeIntegerOrDefault(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

function timeUntil(deadline) {
  return Math.max(0, deadline - Date.now());
}

function sleep(delayMs) {
  if (delayMs <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function backoffDelayForAttempt(attempt, options) {
  const delay = options.retryBaseDelayMs * (2 ** attempt);
  return Math.min(delay, options.retryMaxDelayMs);
}

function nextBackoffDelay(currentDelay, options) {
  const nextDelay = Math.max(options.retryBaseDelayMs, currentDelay * 2);
  return Math.min(nextDelay, options.retryMaxDelayMs);
}

function parseEnabled(value) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'enabled'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off', 'disabled'].includes(normalized)) {
    return false;
  }
  return false;
}

function normalizeAllowedEventTypes(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch (_error) {
      return undefined;
    }
  }

  return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeScrubberConfig(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string' || !value.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (_error) {
    return {};
  }

  return {};
}

function applyScrubberHook(hook, value, context = {}) {
  if (typeof hook !== 'function') {
    return value;
  }

  try {
    const result = hook(value, context);
    return result === undefined ? value : result;
  } catch (_error) {
    return value;
  }
}

function isSensitiveKey(key, options = {}, kind) {
  const normalized = normalizeSensitiveKey(key);
  if (!normalized) {
    return false;
  }

  if (SENSITIVE_KEY_PATTERN.test(normalized)) {
    return true;
  }

  const config = options.scrubberConfig || {};
  return scrubberKeyList(config.sensitiveKeys).has(normalized)
    || scrubberKeyList(config[kind]).has(normalized);
}

function normalizeSensitiveKey(key) {
  if (key === undefined || key === null) {
    return '';
  }
  return String(key).trim().toLowerCase();
}

function scrubberKeyList(value) {
  if (!Array.isArray(value)) {
    return new Set();
  }
  return new Set(value.map(normalizeSensitiveKey).filter(Boolean));
}

function matchesConfiguredMessagePattern(message, options = {}) {
  const config = options.scrubberConfig || {};
  const patterns = Array.isArray(config.messages) ? config.messages : config.messagePatterns;
  if (!Array.isArray(patterns)) {
    return false;
  }

  return patterns.some((pattern) => {
    if (typeof pattern !== 'string' || !pattern.trim()) {
      return false;
    }
    return message.toLowerCase().includes(pattern.trim().toLowerCase());
  });
}

function mergeDefined(base, overrides) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined && value !== null) {
      merged[key] = value;
    }
  }
  return merged;
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

function functionOrUndefined(value) {
  return typeof value === 'function' ? value : undefined;
}

function cloneResolvedOptions(options) {
  const analytics = cloneAnalyticsOptions(options.analytics);
  const cloned = {
    ...options,
    missingConfig: [...(options.missingConfig || [])],
    allowedEventTypes: options.allowedEventTypes ? [...options.allowedEventTypes] : undefined,
    scrubberConfig: {
      ...(options.scrubberConfig || {})
    },
    analytics
  };
  attachAnalyticsAliases(cloned, analytics);
  return cloned;
}

function cloneAnalyticsOptions(analytics) {
  return {
    ...(analytics || {}),
    missingConfig: [...((analytics && analytics.missingConfig) || [])],
    assignmentMissingConfig: [...((analytics && analytics.assignmentMissingConfig) || [])],
    allowedEventTypes: analytics && analytics.allowedEventTypes
      ? [...analytics.allowedEventTypes]
      : undefined,
    customPropertyAllowlist: analytics && analytics.customPropertyAllowlist
      ? [...analytics.customPropertyAllowlist]
      : undefined
  };
}

async function verifyOperationInvocationSignature(options = {}) {
  const headers = normalizeOperationHeaders(options.headers);
  const missingHeader = OPERATION_REQUIRED_HEADERS.find((header) => !headers[header]);
  if (missingHeader) {
    return operationVerificationError('missing_required_header', {
      message: 'A required Handrail operation signing header is missing.',
      details: { header: missingHeader }
    });
  }

  const method = String(options.method || '').trim().toUpperCase();
  if (!method) {
    return operationVerificationError('missing_method', {
      message: 'The HTTP method is required.'
    });
  }

  const pathAndQuery = normalizeOperationPathAndQuery(options);
  if (!pathAndQuery) {
    return operationVerificationError('missing_path_and_query', {
      message: 'The request path and query string are required.'
    });
  }

  const dryRun = headers['x-handrail-dry-run'];
  if (dryRun !== 'true' && dryRun !== 'false') {
    return operationVerificationError('invalid_dry_run_header', {
      message: 'The Handrail dry-run header must be true or false.'
    });
  }

  const body = normalizeOperationRawBody(options.rawBody);
  const bodySha256 = crypto.createHash('sha256').update(body).digest('hex');
  if (!constantTimeStringEquals(bodySha256, headers['x-handrail-body-sha256'])) {
    return operationVerificationError('body_hash_mismatch', {
      message: 'The Handrail operation request body hash does not match.'
    });
  }

  const timestampMs = Date.parse(headers['x-handrail-timestamp']);
  if (!Number.isFinite(timestampMs)) {
    return operationVerificationError('invalid_timestamp', {
      message: 'The Handrail operation timestamp is invalid.'
    });
  }

  const nowMs = getOperationNowMs(options);
  const replayWindowSeconds = Number.isFinite(Number(options.replayWindowSeconds))
    ? Number(options.replayWindowSeconds)
    : (Number.isFinite(Number(options.toleranceSeconds)) ? Number(options.toleranceSeconds) : OPERATION_REPLAY_WINDOW_SECONDS);
  const timestampSkewSeconds = Math.abs(nowMs - timestampMs) / 1000;
  if (timestampSkewSeconds > replayWindowSeconds) {
    return operationVerificationError(timestampMs < nowMs ? 'timestamp_stale' : 'timestamp_in_future', {
      message: 'The Handrail operation timestamp is outside the allowed replay window.'
    });
  }

  const signature = parseOperationSignature(headers['x-handrail-signature']);
  if (!signature) {
    return operationVerificationError('signature_malformed', {
      message: 'The Handrail operation signature is malformed.'
    });
  }

  const context = buildOperationVerificationContext({
    method,
    pathAndQuery,
    headers,
    bodySha256,
    timestampMs
  });

  const expectedScopeResult = validateExpectedOperationScope(context, options.expected || options.scope || options);
  if (!expectedScopeResult.ok) {
    return operationVerificationError('scope_mismatch', {
      code: 'operation_scope_forbidden',
      message: 'The Handrail operation request is outside the expected endpoint scope.',
      details: expectedScopeResult.details
    }, context);
  }

  const credentialResult = await resolveOperationSigningCredential(headers['x-handrail-signature-key-id'], context, options);
  if (!credentialResult.ok) {
    return operationVerificationError(credentialResult.reason, {
      code: credentialResult.code || 'operation_signature_invalid',
      message: credentialResult.message || 'The Handrail operation credential could not be used.',
      details: credentialResult.details
    }, context);
  }

  const credentialScopeResult = validateCredentialOperationScope(context, credentialResult.credential);
  if (!credentialScopeResult.ok) {
    return operationVerificationError('credential_scope_mismatch', {
      code: 'operation_scope_forbidden',
      message: 'The Handrail operation credential is outside the request scope.',
      details: credentialScopeResult.details
    }, context);
  }

  const canonicalString = buildOperationCanonicalString(context);
  const expectedSignature = crypto
    .createHmac('sha256', credentialResult.secret)
    .update(canonicalString)
    .digest('base64url');

  if (!constantTimeStringEquals(expectedSignature, signature.value)) {
    return operationVerificationError('signature_mismatch', {
      message: 'The Handrail operation signature is invalid.'
    }, context);
  }

  return {
    ok: true,
    context
  };
}

function buildOperationSuccessEnvelope(input = {}) {
  const result = input.result === undefined ? {} : input.result;
  if (!isPlainObject(result)) {
    throw new TypeError('Operation success result must be a JSON object.');
  }

  return {
    ok: true,
    result,
    audit: buildOperationAuditEcho(input)
  };
}

function buildOperationErrorEnvelope(input = {}) {
  const error = input.error && typeof input.error === 'object' ? input.error : input;
  const code = sanitizeOperationErrorCode(error.code);
  const category = sanitizeOperationErrorCategory(error.category);
  const message = sanitizeOperationErrorMessage(error.message);

  if (!code) {
    throw new TypeError('Operation error code must be lower snake case.');
  }
  if (!category) {
    throw new TypeError(`Operation error category must be one of ${Array.from(OPERATION_ERROR_CATEGORIES).join(', ')}.`);
  }
  if (!message) {
    throw new TypeError('Operation error message is required.');
  }
  if (typeof error.retryable !== 'boolean') {
    throw new TypeError('Operation error retryable must be a boolean.');
  }

  const envelopeError = {
    code,
    category,
    message,
    retryable: error.retryable
  };

  const details = sanitizeOperationDetails(error.details);
  if (details !== undefined) {
    envelopeError.details = details;
  }

  return {
    ok: false,
    error: envelopeError,
    audit: buildOperationAuditEcho(input)
  };
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizeOperationHeaders(headers) {
  const normalized = {};
  if (!headers || typeof headers !== 'object') {
    return normalized;
  }

  for (const [rawName, rawValue] of Object.entries(headers)) {
    const name = String(rawName).trim().toLowerCase();
    if (!name) {
      continue;
    }
    const value = Array.isArray(rawValue) ? rawValue.join(', ') : rawValue;
    normalized[name] = trimAsciiWhitespace(value);
  }
  return normalized;
}

function normalizeOperationRawBody(rawBody) {
  if (rawBody === undefined || rawBody === null) {
    return Buffer.alloc(0);
  }
  if (Buffer.isBuffer(rawBody)) {
    return rawBody;
  }
  if (rawBody instanceof Uint8Array) {
    return Buffer.from(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength);
  }
  if (typeof rawBody === 'string') {
    return Buffer.from(rawBody, 'utf8');
  }
  throw new TypeError('Operation rawBody must be a Buffer, Uint8Array, string, or empty.');
}

function normalizeOperationPathAndQuery(options) {
  const pathAndQuery = firstDefined(
    options.pathAndQuery,
    options.path,
    options.url,
    options.originalUrl
  );
  if (pathAndQuery === undefined || pathAndQuery === null) {
    return '';
  }
  const value = String(pathAndQuery);
  if (!value || !value.startsWith('/')) {
    return '';
  }
  return value;
}

function getOperationNowMs(options) {
  const clock = firstDefined(options.now, options.clock);
  const rawNow = typeof clock === 'function' ? clock() : clock;
  if (rawNow instanceof Date) {
    return rawNow.getTime();
  }
  if (typeof rawNow === 'number' && Number.isFinite(rawNow)) {
    return rawNow;
  }
  if (typeof rawNow === 'string' && rawNow) {
    const parsed = Date.parse(rawNow);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return Date.now();
}

function buildOperationVerificationContext({ method, pathAndQuery, headers, bodySha256, timestampMs }) {
  return {
    method,
    pathAndQuery,
    timestamp: headers['x-handrail-timestamp'],
    timestampMs,
    projectId: headers['x-handrail-project-id'],
    environment: headers['x-handrail-environment'],
    toolName: headers['x-handrail-tool-name'],
    toolVersion: headers['x-handrail-tool-version'],
    invocationId: headers['x-handrail-invocation-id'],
    requestId: headers['x-handrail-request-id'],
    auditId: headers['x-handrail-audit-id'],
    signatureKeyId: headers['x-handrail-signature-key-id'],
    timeoutMs: Number(headers['x-handrail-timeout-ms']),
    dryRun: headers['x-handrail-dry-run'] === 'true',
    idempotencyKey: headers['idempotency-key'] || null,
    bodySha256,
    approvalId: headers['x-handrail-approval-id'] || null,
    actor: buildOperationActor(headers),
    traceId: headers['x-handrail-trace-id'] || null,
    correlationId: headers['x-handrail-correlation-id'] || null,
    workRequestId: headers['x-handrail-work-request-id'] || null,
    ownerGoalId: headers['x-handrail-owner-goal-id'] || null
  };
}

function buildOperationActor(headers) {
  const type = headers['x-handrail-actor-type'] || null;
  const id = headers['x-handrail-actor-id'] || null;
  const display = headers['x-handrail-actor-display'] || null;
  if (!type && !id && !display) {
    return null;
  }
  return { type, id, display };
}

function buildOperationCanonicalString(context) {
  return [
    'HANDRAIL-OPERATION-V1',
    context.method,
    context.pathAndQuery,
    context.timestamp,
    context.projectId,
    context.environment,
    context.toolName,
    context.toolVersion,
    context.invocationId,
    context.requestId,
    context.auditId,
    context.dryRun ? 'true' : 'false',
    context.idempotencyKey || '',
    context.bodySha256
  ].join('\n');
}

function parseOperationSignature(signatureHeader) {
  const parts = String(signatureHeader || '').split(',');
  if (parts.length !== 3 || parts[0] !== 'v1' || parts[1] !== 'hmac-sha256') {
    return null;
  }
  const value = parts[2];
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }
  return { value };
}

async function resolveOperationSigningCredential(keyId, context, options) {
  if (options.signingSecret || options.secret) {
    return {
      ok: true,
      secret: options.signingSecret || options.secret,
      credential: options.credential || null
    };
  }

  const lookup = options.lookupSigningKey || options.keyLookup || options.getSigningKey;
  if (typeof lookup !== 'function') {
    return {
      ok: false,
      reason: 'signing_secret_missing',
      message: 'No Handrail operation signing secret or key lookup callback was provided.'
    };
  }

  const credential = await lookup(keyId, {
    projectId: context.projectId,
    environment: context.environment,
    toolName: context.toolName,
    toolVersion: context.toolVersion,
    signatureKeyId: keyId
  });
  if (!credential) {
    return {
      ok: false,
      reason: 'credential_unknown',
      message: 'The Handrail operation signing key is unknown.',
      details: { key_id: keyId }
    };
  }
  if (typeof credential === 'string' || Buffer.isBuffer(credential) || credential instanceof Uint8Array) {
    return { ok: true, secret: credential, credential: null };
  }

  const status = String(credential.status || credential.state || '').trim().toLowerCase();
  if (status === 'unknown') {
    return {
      ok: false,
      reason: 'credential_unknown',
      message: 'The Handrail operation signing key is unknown.',
      details: { key_id: keyId }
    };
  }
  if (status === 'disabled' || credential.disabled === true || credential.enabled === false) {
    return {
      ok: false,
      reason: 'credential_disabled',
      message: 'The Handrail operation signing key is disabled.',
      details: { key_id: keyId }
    };
  }
  if (status === 'expired' || credential.expired === true || operationCredentialExpired(credential, getOperationNowMs(options))) {
    return {
      ok: false,
      reason: 'credential_expired',
      message: 'The Handrail operation signing key is expired.',
      details: { key_id: keyId }
    };
  }

  const secret = credential.signingSecret || credential.secret || credential.key;
  if (!secret) {
    return {
      ok: false,
      reason: 'credential_secret_missing',
      message: 'The Handrail operation signing credential does not include a usable secret.'
    };
  }

  return { ok: true, secret, credential };
}

function operationCredentialExpired(credential, nowMs) {
  const expiresAt = credential.expiresAt || credential.expires_at || credential.expiry || credential.expiredAt || credential.expired_at;
  if (!expiresAt) {
    return false;
  }
  const expiresAtMs = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(String(expiresAt));
  return Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs;
}

function validateExpectedOperationScope(context, expected) {
  return validateOperationScope(context, normalizeExpectedOperationScope(expected));
}

function validateCredentialOperationScope(context, credential) {
  if (!credential || typeof credential !== 'object') {
    return { ok: true };
  }
  const scope = {
    ...(credential.scope && typeof credential.scope === 'object' ? credential.scope : {}),
    ...(credential.scopes && typeof credential.scopes === 'object' && !Array.isArray(credential.scopes) ? credential.scopes : {}),
    projectId: firstDefined(credential.projectId, credential.project_id, credential.project, credential.scope && (credential.scope.projectId || credential.scope.project_id)),
    environment: firstDefined(credential.environment, credential.env, credential.scope && (credential.scope.environment || credential.scope.env)),
    toolName: firstDefined(credential.toolName, credential.tool_name, credential.scope && (credential.scope.toolName || credential.scope.tool_name)),
    toolVersion: firstDefined(credential.toolVersion, credential.tool_version, credential.scope && (credential.scope.toolVersion || credential.scope.tool_version))
  };
  return validateOperationScope(context, scope);
}

function normalizeExpectedOperationScope(expected) {
  if (!expected || typeof expected !== 'object') {
    return {};
  }
  return {
    projectId: firstDefined(expected.projectId, expected.project_id, expected.expectedProjectId),
    environment: firstDefined(expected.environment, expected.env, expected.expectedEnvironment),
    toolName: firstDefined(expected.toolName, expected.tool_name, expected.expectedToolName),
    toolVersion: firstDefined(expected.toolVersion, expected.tool_version, expected.expectedToolVersion)
  };
}

function validateOperationScope(context, scope) {
  const mismatches = [];
  if (!operationScopeValueMatches(scope.projectId, context.projectId)) {
    mismatches.push('project_id');
  }
  if (!operationScopeValueMatches(scope.environment, context.environment)) {
    mismatches.push('environment');
  }
  if (!operationScopeValueMatches(scope.toolName, context.toolName)) {
    mismatches.push('tool_name');
  }
  if (scope.toolVersion !== undefined && scope.toolVersion !== null && scope.toolVersion !== ''
    && !operationScopeValueMatches(scope.toolVersion, context.toolVersion)) {
    mismatches.push('tool_version');
  }
  return mismatches.length > 0
    ? { ok: false, details: { mismatches } }
    : { ok: true };
}

function operationScopeValueMatches(expected, actual) {
  if (expected === undefined || expected === null || expected === '') {
    return true;
  }
  if (Array.isArray(expected)) {
    return expected.map(String).includes(String(actual));
  }
  return String(expected) === String(actual);
}

function operationVerificationError(reason, overrides = {}, context) {
  return {
    ok: false,
    error: {
      code: overrides.code || 'operation_signature_invalid',
      category: overrides.category || 'auth',
      message: overrides.message || 'The Handrail operation signature is invalid.',
      retryable: false,
      reason,
      ...(overrides.details ? { details: sanitizeOperationDetails(overrides.details) } : {})
    },
    ...(context ? { context: operationSafeContext(context) } : {})
  };
}

function operationSafeContext(context) {
  return {
    method: context.method,
    pathAndQuery: context.pathAndQuery,
    projectId: context.projectId,
    environment: context.environment,
    toolName: context.toolName,
    toolVersion: context.toolVersion,
    invocationId: context.invocationId,
    requestId: context.requestId,
    auditId: context.auditId,
    signatureKeyId: context.signatureKeyId,
    dryRun: context.dryRun,
    idempotencyKey: context.idempotencyKey,
    bodySha256: context.bodySha256
  };
}

function buildOperationAuditEcho(input = {}) {
  const context = operationContextFromInput(input);
  const audit = input.audit && typeof input.audit === 'object' ? input.audit : {};
  const echo = {
    invocation_id: firstDefined(audit.invocation_id, audit.invocationId, input.invocation_id, input.invocationId, context.invocationId, context.invocation_id) || null,
    audit_id: firstDefined(audit.audit_id, audit.auditId, input.audit_id, input.auditId, context.auditId, context.audit_id) || null,
    request_id: firstDefined(audit.request_id, audit.requestId, input.request_id, input.requestId, context.requestId, context.request_id) || null,
    idempotency_key: firstDefined(audit.idempotency_key, audit.idempotencyKey, input.idempotency_key, input.idempotencyKey, context.idempotencyKey, context.idempotency_key) || null,
    dry_run: Boolean(firstDefined(audit.dry_run, audit.dryRun, input.dry_run, input.dryRun, context.dryRun, context.dry_run, false))
  };

  const endpointAuditId = firstDefined(audit.endpoint_audit_id, audit.endpointAuditId, input.endpoint_audit_id, input.endpointAuditId);
  if (endpointAuditId) {
    echo.endpoint_audit_id = String(endpointAuditId);
  }
  return echo;
}

function operationContextFromInput(input = {}) {
  if (input.context && typeof input.context === 'object') {
    return input.context;
  }
  if (input.verifiedContext && typeof input.verifiedContext === 'object') {
    return input.verifiedContext;
  }
  if (input.verification && input.verification.context && typeof input.verification.context === 'object') {
    return input.verification.context;
  }
  return {};
}

function sanitizeOperationErrorCode(code) {
  const value = String(code || '').trim();
  return /^[a-z][a-z0-9_]{0,127}$/.test(value) ? value : '';
}

function sanitizeOperationErrorCategory(category) {
  const value = String(category || '').trim();
  return OPERATION_ERROR_CATEGORIES.has(value) ? value : '';
}

function sanitizeOperationErrorMessage(message) {
  const value = sanitizeMessage(message);
  if (!value) {
    return '';
  }
  return value.slice(0, OPERATION_MAX_DETAILS_STRING_LENGTH);
}

function sanitizeOperationDetails(value, depth = 0, seen = new WeakSet()) {
  if (value === undefined || value === null) {
    return value === null ? null : undefined;
  }
  if (typeof value === 'string') {
    return value.slice(0, OPERATION_MAX_DETAILS_STRING_LENGTH);
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return Number.isFinite(value) || typeof value !== 'number' ? value : undefined;
  }
  if (Array.isArray(value)) {
    if (depth >= OPERATION_MAX_DETAILS_DEPTH) {
      return TRUNCATED;
    }
    return value
      .slice(0, OPERATION_MAX_DETAILS_ARRAY_ITEMS)
      .map((item) => sanitizeOperationDetails(item, depth + 1, seen))
      .filter((item) => item !== undefined);
  }
  if (typeof value !== 'object') {
    return undefined;
  }
  if (seen.has(value)) {
    return TRUNCATED;
  }
  seen.add(value);
  if (depth >= OPERATION_MAX_DETAILS_DEPTH) {
    return TRUNCATED;
  }

  const output = {};
  for (const [rawKey, rawValue] of Object.entries(value).slice(0, OPERATION_MAX_DETAILS_KEYS)) {
    const key = sanitizeTagKey(rawKey);
    if (!key) {
      continue;
    }
    output[key] = isSensitiveKey(key) ? OPERATION_REDACTED : sanitizeOperationDetails(rawValue, depth + 1, seen);
    if (output[key] === undefined) {
      delete output[key];
    }
  }
  return output;
}

function trimAsciiWhitespace(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).replace(/^[\t\n\f\r ]+|[\t\n\f\r ]+$/g, '');
}

function constantTimeStringEquals(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
  HandrailApmClient,
  HandrailSignalsClient: HandrailApmClient,
  SDK_NAME,
  SDK_VERSION,
  addBreadcrumb,
  assignExperiment,
  buildAnalyticsPayload,
  buildOperationErrorEnvelope,
  buildOperationSuccessEnvelope,
  captureEvent,
  captureException,
  captureMessage,
  captureSpan,
  createClient,
  createQuickBooksClient,
  createSignalsClient: createClient,
  experiment,
  expressAnalyticsMiddleware,
  expressErrorHandler,
  expressMiddleware,
  flush,
  getAnalyticsConfig,
  getAnalyticsStats,
  getConfig,
  getStats,
  getCurrentClient,
  init,
  installProcessErrorHandlers,
  loadConfigFromEnv,
  loadQuickBooksConfigFromEnv,
  page,
  shutdown,
  track,
  trackConversion,
  trackExperimentExposure,
  uninstallProcessErrorHandlers,
  verifyOperationInvocationSignature
};
