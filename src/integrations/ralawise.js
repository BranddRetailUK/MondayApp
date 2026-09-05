const env = require('../config/env');

const DEFAULT_BASE_URL = 'https://api.ralawise.com';
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

class RalawiseApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'RalawiseApiError';
    Object.assign(this, details);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code || null,
      status: this.status || null,
      responseSnippet: this.responseSnippet || null,
    };
  }
}

function positiveInt(value, fallback, maximum = 10) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number < 1) return fallback;
  return Math.min(number, maximum);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function bodySnippet(value, length = 500) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function validateBaseUrl(value) {
  let url;
  try {
    url = new URL(value || DEFAULT_BASE_URL);
  } catch {
    throw new RalawiseApiError('Ralawise API base URL is invalid.', {
      code: 'invalid_configuration',
    });
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  if (
    url.protocol !== 'https:'
    || url.hostname !== 'api.ralawise.com'
    || !['', '/test'].includes(pathname)
    || url.search
    || url.hash
  ) {
    throw new RalawiseApiError('Ralawise API base URL must be the official live or test endpoint.', {
      code: 'invalid_configuration',
    });
  }
  return `${url.origin}${pathname}`;
}

function createRalawiseClient(options = {}) {
  const config = options.config || env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const wait = options.sleepImpl || sleep;
  const now = options.nowImpl || Date.now;
  const baseUrl = validateBaseUrl(config.RALAWISE_API_BASE_URL || DEFAULT_BASE_URL);
  const timeoutMs = positiveInt(config.RALAWISE_HTTP_TIMEOUT_MS, 20000, 120000);
  const attempts = positiveInt(config.RALAWISE_RETRY_ATTEMPTS, 2, 5);

  if (typeof fetchImpl !== 'function') {
    throw new RalawiseApiError('This Node runtime does not provide fetch.', {
      code: 'runtime_configuration',
    });
  }

  let tokenState = null;
  let loginPromise = null;

  async function requestJson(path, requestOptions = {}) {
    let lastNetworkError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(`${baseUrl}${path}`, {
          method: requestOptions.method || 'GET',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(requestOptions.token ? { Authorization: `Bearer ${requestOptions.token}` } : {}),
          },
          body: requestOptions.body === undefined ? undefined : JSON.stringify(requestOptions.body),
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        lastNetworkError = error;
        if (attempt < attempts) {
          await wait(250 * (2 ** (attempt - 1)));
          continue;
        }
        throw new RalawiseApiError(`Ralawise request failed: ${error.message}`, {
          code: error.name === 'TimeoutError' ? 'timeout' : 'network_error',
          cause: error,
        });
      }

      const text = await response.text();
      if (RETRYABLE_STATUSES.has(response.status) && attempt < attempts) {
        await wait(250 * (2 ** (attempt - 1)));
        continue;
      }

      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          if (response.ok) {
            throw new RalawiseApiError('Ralawise returned invalid JSON.', {
              code: 'unexpected_response',
              status: response.status,
              responseSnippet: bodySnippet(text),
            });
          }
        }
      }

      if (!response.ok) {
        const isLoginFailure = path.endsWith('/login') && response.status === 400;
        throw new RalawiseApiError(
          isLoginFailure
            ? 'Ralawise rejected the login or the user is not enabled for API access.'
            : `Ralawise returned HTTP ${response.status}.`,
          {
            code: isLoginFailure ? 'authentication_failed' : 'http_error',
            status: response.status,
            responseSnippet: bodySnippet(text),
            response: data,
          }
        );
      }

      return { status: response.status, data };
    }

    throw new RalawiseApiError(`Ralawise request failed: ${lastNetworkError?.message || 'unknown error'}`, {
      code: 'network_error',
      cause: lastNetworkError,
    });
  }

  function validCachedToken() {
    return tokenState && tokenState.expiresAt - 30000 > now();
  }

  async function login({ force = false } = {}) {
    if (!force && validCachedToken()) {
      return { ...tokenState, cached: true };
    }
    if (!force && loginPromise) return loginPromise;

    const user = String(config.RALAWISE_USER || '').trim();
    const password = String(config.RALAWISE_PASSWORD || '');
    if (!user || !password) {
      throw new RalawiseApiError('RALAWISE_USER and RALAWISE_PASSWORD are required.', {
        code: 'missing_credentials',
      });
    }

    loginPromise = (async () => {
      const response = await requestJson('/v1/login', {
        method: 'POST',
        body: { user, password },
      });
      const accessToken = response.data?.access_token;
      const expiresIn = positiveInt(response.data?.expires_in, 1200, 86400);
      if (!accessToken) {
        throw new RalawiseApiError('Ralawise login response did not include an access token.', {
          code: 'unexpected_response',
          status: response.status,
        });
      }
      tokenState = {
        accessToken,
        tokenType: response.data?.token_type || 'bearer',
        expiresIn,
        expiresAt: now() + (expiresIn * 1000),
        status: response.status,
        cached: false,
      };
      return { ...tokenState };
    })();

    try {
      return await loginPromise;
    } finally {
      loginPromise = null;
    }
  }

  async function getInventory(identifier) {
    const sku = String(identifier || '').trim();
    if (!/^[A-Za-z0-9_-]{1,20}$/.test(sku)) {
      throw new RalawiseApiError('A valid Ralawise inventory identifier is required.', {
        code: 'invalid_request',
      });
    }

    let authentication = await login();
    try {
      return await requestJson(`/v1/inventory/${encodeURIComponent(sku)}`, {
        token: authentication.accessToken,
      });
    } catch (error) {
      if (!(error instanceof RalawiseApiError) || error.status !== 401) throw error;
      authentication = await login({ force: true });
      return requestJson(`/v1/inventory/${encodeURIComponent(sku)}`, {
        token: authentication.accessToken,
      });
    }
  }

  return {
    login,
    getInventory,
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  RalawiseApiError,
  createRalawiseClient,
};
