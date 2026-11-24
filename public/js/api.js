import {
  getAccessToken,
  getRefreshToken,
  isAccessTokenExpiringSoon,
  recordFirstFailedRequestError,
  refreshAccessToken,
  setRefreshRetryStatus
} from './session.js';

const PUBLIC_AUTH_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/registration-meta',
  '/api/auth/setup-status',
  '/api/auth/setup-admin',
  '/api/auth/send-otp',
  '/api/auth/verify-otp',
  '/api/demo-accounts'
]);

export const api = {
  async request(path, opts = {}) {
    const method = (opts.method || 'GET').toUpperCase();
    const isForm = opts.body instanceof FormData;
    const basePath = String(path).split('?')[0];
    const isPublicAuth = PUBLIC_AUTH_PATHS.has(basePath);

    if (!isPublicAuth && !opts._retried && isAccessTokenExpiringSoon() && getRefreshToken()) {
      await refreshAccessToken();
    }

    const token = getAccessToken();
    const headers = {
      'X-Requested-With': 'MediCore-HMS',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      ...(opts.headers || {})
    };

    let res;
    try {
      res = await fetch(path, {
        method,
        credentials: 'include',
        headers,
        body: opts.body ? (isForm ? opts.body : JSON.stringify(opts.body)) : undefined
      });
    } catch (netErr) {
      const msg = netErr?.message || 'Network request failed';
      if (!isPublicAuth && !opts.suppressErrorLog) {
        recordFirstFailedRequestError({
          method,
          path,
          status: 0,
          message: msg,
          retriedWithRefresh: Boolean(opts._retried)
        });
      }
      throw new Error(msg);
    }

    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const serverMsg = data.error || `Request failed (${res.status})`;

      if (res.status === 401 && !isPublicAuth && !opts._retried) {
        const refreshResult = await refreshAccessToken();
        if (refreshResult.ok) {
          return this.request(path, {
            ...opts,
            _retried: true,
            _initialError: { status: res.status, message: serverMsg }
          });
        }
        if (!opts.suppressErrorLog) {
          recordFirstFailedRequestError({
            method,
            path,
            status: res.status,
            message: serverMsg,
            retriedWithRefresh: true,
            refreshError: refreshResult.error
          });
        }
        const err = new Error(serverMsg);
        err.status = res.status;
        err.details = data.details || [];
        err.retriedWithRefresh = true;
        throw err;
      }

      if (!isPublicAuth && !opts.suppressErrorLog) {
        const firstMsg = opts._initialError?.message || serverMsg;
        const firstStatus = opts._initialError?.status || res.status;
        recordFirstFailedRequestError({
          method,
          path,
          status: firstStatus,
          message: firstMsg,
          retriedWithRefresh: Boolean(opts._retried),
          retryMessage: opts._retried ? serverMsg : null
        });
      } else if (!opts._retried) {
        setRefreshRetryStatus(false, false);
      }

      const err = new Error(serverMsg);
      err.status = res.status;
      err.details = data.details || [];
      err.retriedWithRefresh = Boolean(opts._retried);
      throw err;
    }

    return data;
  },

  get(path, opts = {}) { return this.request(path, opts); },
  post(path, body, opts = {}) { return this.request(path, { ...opts, method: 'POST', body }); },
  put(path, body, opts = {}) { return this.request(path, { ...opts, method: 'PUT', body }); },
  patch(path, body, opts = {}) { return this.request(path, { ...opts, method: 'PATCH', body }); },
  del(path, opts = {}) { return this.request(path, { ...opts, method: 'DELETE' }); }
};
