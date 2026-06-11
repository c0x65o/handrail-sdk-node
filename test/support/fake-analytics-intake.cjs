function normalizeHeaders(headers = {}) {
  if (headers && typeof headers.entries === 'function') {
    return Object.fromEntries(Array.from(headers.entries()).map(([key, value]) => [key.toLowerCase(), value]));
  }

  return Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), String(value)])
  );
}

function parseBody(rawBody) {
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch (_error) {
    return rawBody;
  }
}

function createResponsePlan(responses = [202]) {
  const planned = Array.isArray(responses) && responses.length > 0 ? [...responses] : [202];
  let index = 0;
  return () => {
    const response = planned[Math.min(index, planned.length - 1)];
    index += 1;
    if (response instanceof Error) throw response;
    if (typeof response === 'number') {
      return { status: response, body: { accepted: response >= 200 && response < 300 } };
    }
    return {
      status: response.status || 202,
      body: response.body === undefined ? { accepted: true } : response.body,
      headers: response.headers || {}
    };
  };
}

function responseFromSpec(spec) {
  const status = spec.status || 202;
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const headers = normalizeHeaders(spec.headers);
        return headers[String(name).toLowerCase()] || null;
      }
    },
    async json() {
      return spec.body;
    },
    async text() {
      return typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body || {});
    }
  };
}

function requestPath(url) {
  try {
    return new URL(String(url), 'https://handrail.example.test').pathname.replace(/\/+$/, '') || '/';
  } catch (_error) {
    return String(url || '').split('?')[0].replace(/\/+$/, '') || '/';
  }
}

function requestKind(url) {
  const path = requestPath(url);
  if (path === '/api/apm/events') {
    return 'runtime';
  }
  if (path === '/api/analytics/ingest' || path === '/api/analytics') {
    return 'analytics';
  }
  if (path === '/api/analytics/assignments' || path === '/api/analytics/experiments/assign') {
    return 'assignment';
  }
  return 'unknown';
}

function createFakeSignalsFetchIntake({ responses = [202] } = {}) {
  const requests = [];
  const nextResponse = createResponsePlan(responses);

  const intake = {
    requests,
    fetch: async (url, init = {}) => {
      let spec;
      let error = null;
      try {
        spec = nextResponse();
      } catch (caught) {
        error = caught;
      }

      const rawBody = init.body == null ? '' : String(init.body);
      const request = {
        attempt: requests.length + 1,
        method: init.method || 'GET',
        url: String(url),
        path: requestPath(url),
        kind: requestKind(url),
        headers: normalizeHeaders(init.headers),
        rawBody,
        body: parseBody(rawBody),
        status: spec ? spec.status : null,
        ok: spec ? spec.status >= 200 && spec.status < 300 : false,
        error
      };
      requests.push(request);

      if (error) throw error;
      return responseFromSpec(spec);
    },
    reset() {
      requests.length = 0;
    },
    runtimeRequests() {
      return requests.filter((request) => request.kind === 'runtime');
    },
    analyticsRequests() {
      return requests.filter((request) => request.kind === 'analytics');
    },
    assignmentRequests() {
      return requests.filter((request) => request.kind === 'assignment');
    }
  };

  return intake;
}

function createFakeAnalyticsFetchIntake(options) {
  return createFakeSignalsFetchIntake(options);
}

module.exports = {
  createFakeAnalyticsFetchIntake,
  createFakeSignalsFetchIntake
};
