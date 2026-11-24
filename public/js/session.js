const SESSION_KEY = 'medicore_session';
const LEGACY_JWT_KEY = 'medicore_jwt';

const listeners = new Set();
const sessionWaiters = new Set();
let memorySession = loadStoredSession();
let inFlightRefresh = null;
let firstFailedRequestError = null;
let lastRefreshRetryInfo = { attempted: false, succeeded: false };

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadStoredSession() {
  if (typeof window === 'undefined') return null;
  const fromSession = safeParse(sessionStorage.getItem(SESSION_KEY));
  const fromLocal = safeParse(localStorage.getItem(SESSION_KEY));
  const stored = fromSession || fromLocal;
  if (stored && stored.accessToken) return stored;
  const legacy = sessionStorage.getItem(LEGACY_JWT_KEY) || localStorage.getItem(LEGACY_JWT_KEY);
  return legacy ? { accessToken: legacy, refreshToken: null, expiresAt: null, user: null } : null;
}

function persistSession(session) {
  if (typeof window === 'undefined') return;
  if (!session || !session.accessToken) {
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(LEGACY_JWT_KEY);
    localStorage.removeItem(LEGACY_JWT_KEY);
    return;
  }
  const serialized = JSON.stringify(session);
  sessionStorage.setItem(SESSION_KEY, serialized);
  localStorage.setItem(SESSION_KEY, serialized);
  sessionStorage.setItem(LEGACY_JWT_KEY, session.accessToken);
  localStorage.setItem(LEGACY_JWT_KEY, session.accessToken);
}

function parseJwtExpMs(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload && payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function getSession() {
  if (!memorySession) memorySession = loadStoredSession();
  return memorySession;
}

export function getAccessToken() {
  const s = getSession();
  return s?.accessToken || null;
}

export function getRefreshToken() {
  const s = getSession();
  return s?.refreshToken || null;
}

export function isAccessTokenExpiringSoon(bufferMs = 30000) {
  const s = getSession();
  if (!s?.accessToken) return false;
  const exp = s.expiresAt || parseJwtExpMs(s.accessToken);
  if (!exp) return false;
  return Date.now() >= exp - bufferMs;
}

export function onAuthStateChange(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyAuthState(event, session) {
  if (session?.accessToken && session?.user) {
    for (const resolve of sessionWaiters) resolve(session);
    sessionWaiters.clear();
  }
  for (const fn of listeners) {
    try {
      fn(event, session);
    } catch {
      // keep notifying remaining listeners
    }
  }
}

export function setAuthSession(payload, event = 'SIGNED_IN') {
  const prev = getSession();
  const accessToken = payload?.accessToken || payload?.token || prev?.accessToken || null;
  const refreshToken = payload?.refreshToken || prev?.refreshToken || null;
  const expiresAt = payload?.expiresAt || parseJwtExpMs(accessToken) || prev?.expiresAt || null;
  const user = payload?.user || prev?.user || null;

  memorySession = accessToken ? { accessToken, refreshToken, expiresAt, user } : null;
  persistSession(memorySession);
  notifyAuthState(event, memorySession);
  return memorySession;
}

export function clearAuthSession(emit = true) {
  memorySession = null;
  persistSession(null);
  lastRefreshRetryInfo = { attempted: false, succeeded: false };
  if (emit) notifyAuthState('SIGNED_OUT', null);
}

export function waitForSession(timeoutMs = 5000) {
  const existing = getSession();
  if (existing?.accessToken && existing?.user) {
    return Promise.resolve(existing);
  }
  return new Promise((resolve, reject) => {
    let timer = null;
    const done = (sess) => {
      if (timer) clearTimeout(timer);
      sessionWaiters.delete(done);
      resolve(sess);
    };
    sessionWaiters.add(done);
    timer = setTimeout(() => {
      sessionWaiters.delete(done);
      const current = getSession();
      if (current?.accessToken && current?.user) resolve(current);
      else reject(new Error('Authentication session not established in time.'));
    }, timeoutMs);
  });
}

export function recordFirstFailedRequestError(entry) {
  if (!firstFailedRequestError) {
    firstFailedRequestError = {
      timestamp: new Date().toISOString(),
      ...entry
    };
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('medicore:request-error', { detail: firstFailedRequestError }));
    }
  }
  return firstFailedRequestError;
}

export function getFirstFailedRequestError() {
  return firstFailedRequestError;
}

export function clearFirstFailedRequestError() {
  firstFailedRequestError = null;
  lastRefreshRetryInfo = { attempted: false, succeeded: false };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('medicore:request-error', { detail: null }));
  }
}

export function setRefreshRetryStatus(attempted, succeeded) {
  lastRefreshRetryInfo = { attempted, succeeded };
}

export function getRefreshRetryStatus() {
  return lastRefreshRetryInfo;
}

export async function refreshAccessToken() {
  if (inFlightRefresh) return inFlightRefresh;
  inFlightRefresh = (async () => {
    const refreshToken = getRefreshToken();
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'MediCore-HMS'
        },
        body: JSON.stringify(refreshToken ? { refreshToken } : {})
      });
      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = {}; }
      if (!res.ok || !(data.accessToken || data.token)) {
        setRefreshRetryStatus(true, false);
        return { ok: false, error: data.error || `Token refresh failed (${res.status})`, status: res.status };
      }
      setAuthSession(data, 'TOKEN_REFRESHED');
      setRefreshRetryStatus(true, true);
      return { ok: true, accessToken: data.accessToken || data.token, user: data.user };
    } catch (err) {
      setRefreshRetryStatus(true, false);
      return { ok: false, error: err?.message || 'Token refresh network error', status: 0 };
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}
