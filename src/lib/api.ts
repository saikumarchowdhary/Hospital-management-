let inMemoryAccessToken: string | null = null;

export function setAccessToken(token: string | null) {
  inMemoryAccessToken = token;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export class ApiError extends Error {
  status: number;
  details: any;
  constructor(status: number, message: string, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function apiRequest<T = any>(
  path: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const { method = 'GET', body, headers = {} } = options;
  const reqHeaders: Record<string, string> = {
    'X-Requested-With': 'MediCore-HMS',
    ...headers,
  };
  if (inMemoryAccessToken) {
    reqHeaders['Authorization'] = `Bearer ${inMemoryAccessToken}`;
  }
  let fetchBody: BodyInit | undefined;
  if (body instanceof FormData) {
    fetchBody = body;
  } else if (body !== undefined && body !== null) {
    reqHeaders['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const res = await fetch(path, {
    method,
    headers: reqHeaders,
    body: fetchBody,
    credentials: 'include',
  });

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = (data && typeof data === 'object' && (data.error || data.message)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export function buildWsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${proto}//${window.location.host}/ws`;
  return inMemoryAccessToken ? `${base}?token=${encodeURIComponent(inMemoryAccessToken)}` : base;
}
