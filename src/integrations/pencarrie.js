const env = require('../config/env');

const LIVE_GATEWAY_URL = 'https://pencarrie.com/gateway';
const SANDBOX_GATEWAY_URL = 'https://sandbox.pencarrie.com/gateway';
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

class PenCarrieApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'PenCarrieApiError';
    Object.assign(this, details);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code || null,
      status: this.status || null,
      contentType: this.contentType || null,
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

function looksLikeHtml(value) {
  return /<!doctype\s+html|<html[\s>]/i.test(String(value || ''));
}

function xmlRootElement(value) {
  const withoutDeclaration = String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/^\s*<\?xml[^>]*\?>/i, '')
    .trimStart();
  const match = withoutDeclaration.match(/^<([A-Za-z_][\w:.-]*)\b/);
  return match ? match[1].split(':').pop().toLowerCase() : null;
}

function defaultGatewayUrl(config) {
  if (config.PENCARRIE_GATEWAY_URL) return config.PENCARRIE_GATEWAY_URL;
  return config.PENCARRIE_ENV === 'sandbox' ? SANDBOX_GATEWAY_URL : LIVE_GATEWAY_URL;
}

function validateGatewayUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new PenCarrieApiError('PenCarrie gateway URL is invalid.', {
      code: 'invalid_configuration',
    });
  }

  const allowedHosts = new Set(['pencarrie.com', 'sandbox.pencarrie.com']);
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname) || url.pathname !== '/gateway') {
    throw new PenCarrieApiError('PenCarrie gateway URL must be an official HTTPS /gateway endpoint.', {
      code: 'invalid_configuration',
    });
  }
  return url.toString();
}

function createPenCarrieClient(options = {}) {
  const config = options.config || env;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const wait = options.sleepImpl || sleep;
  const timeoutMs = positiveInt(config.PENCARRIE_HTTP_TIMEOUT_MS, 20000, 120000);
  const attempts = positiveInt(config.PENCARRIE_RETRY_ATTEMPTS, 3, 5);

  if (typeof fetchImpl !== 'function') {
    throw new PenCarrieApiError('This Node runtime does not provide fetch.', {
      code: 'runtime_configuration',
    });
  }

  async function callGateway(functionName, parameters = {}) {
    const customerCode = String(config.PENCARRIE_CUSTOMER_CODE || '').trim();
    if (!customerCode) {
      throw new PenCarrieApiError('PENCARRIE_CUSTOMER_CODE is not configured.', {
        code: 'missing_credentials',
      });
    }
    if (!/^[a-z][a-z0-9_]*$/.test(String(functionName || ''))) {
      throw new PenCarrieApiError('PenCarrie function name is invalid.', {
        code: 'invalid_request',
      });
    }

    const gatewayUrl = validateGatewayUrl(defaultGatewayUrl(config));
    const form = new URLSearchParams({ function: functionName, code: customerCode });
    for (const [key, value] of Object.entries(parameters)) {
      if (value !== undefined && value !== null) form.set(key, String(value));
    }

    let lastNetworkError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(gatewayUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/xml,text/xml;q=0.9,text/csv;q=0.8,*/*;q=0.1',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'UltimateHub/1.0',
          },
          body: form.toString(),
          redirect: 'follow',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        lastNetworkError = error;
        if (attempt < attempts) {
          await wait(250 * (2 ** (attempt - 1)));
          continue;
        }
        throw new PenCarrieApiError(`PenCarrie request failed: ${error.message}`, {
          code: error.name === 'TimeoutError' ? 'timeout' : 'network_error',
          cause: error,
        });
      }

      const body = await response.text();
      const contentType = response.headers.get('content-type') || '';

      if (RETRYABLE_STATUSES.has(response.status) && attempt < attempts) {
        await wait(250 * (2 ** (attempt - 1)));
        continue;
      }

      const rootElement = xmlRootElement(body);
      if (!response.ok) {
        const isIpRejection = response.status === 401 || response.status === 403;
        throw new PenCarrieApiError(
          isIpRejection
            ? 'PenCarrie rejected the customer-code/source-IP combination.'
            : `PenCarrie returned HTTP ${response.status}.`,
          {
            code: isIpRejection ? 'ip_not_authorized' : 'http_error',
            status: response.status,
            contentType,
            responseSnippet: bodySnippet(body),
          }
        );
      }

      if (looksLikeHtml(body)) {
        throw new PenCarrieApiError('PenCarrie returned HTML instead of an API response.', {
          code: 'unexpected_response',
          status: response.status,
          contentType,
          responseSnippet: bodySnippet(body),
        });
      }

      if (rootElement === 'error') {
        throw new PenCarrieApiError('PenCarrie returned an API error.', {
          code: 'api_error',
          status: response.status,
          contentType,
          responseSnippet: bodySnippet(body),
        });
      }

      return {
        status: response.status,
        contentType,
        rootElement,
        body,
      };
    }

    throw new PenCarrieApiError(`PenCarrie request failed: ${lastNetworkError?.message || 'unknown error'}`, {
      code: 'network_error',
      cause: lastNetworkError,
    });
  }

  async function getStock(styleCode) {
    const identifier = String(styleCode || '').trim();
    if (!identifier || identifier.length > 30) {
      throw new PenCarrieApiError('A valid PenCarrie style code is required.', {
        code: 'invalid_request',
      });
    }
    const response = await callGateway('pcgetstock', { 'args[0]': identifier });
    if (response.rootElement !== 'stock') {
      throw new PenCarrieApiError('PenCarrie stock request returned an unexpected response.', {
        code: 'unexpected_response',
        status: response.status,
        contentType: response.contentType,
        responseSnippet: bodySnippet(response.body),
      });
    }
    return response;
  }

  return {
    callGateway,
    getStock,
  };
}

module.exports = {
  LIVE_GATEWAY_URL,
  SANDBOX_GATEWAY_URL,
  PenCarrieApiError,
  createPenCarrieClient,
  xmlRootElement,
};
