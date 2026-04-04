// Central API wrapper — all calls go through Vite's proxy to the backend
const BASE = '/api';
const APP_REQUEST_HEADER = 'X-Finance-App-Request';

async function request(method, path, body, options = {}) {
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  const opts = {
    method,
    headers,
  };

  if (method !== 'GET') {
    opts.headers[APP_REQUEST_HEADER] = '1';
  }

  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(`${BASE}${path}`, opts);

  // Safely read the body — handle empty or non-JSON responses
  let data;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const text = await res.text();
    if (text.trim()) {
      data = JSON.parse(text);
    } else {
      data = {};
    }
  } else {
    // Non-JSON response (e.g. empty body, HTML error page)
    const text = await res.text();
    data = { error: text || `HTTP ${res.status} — empty response from server` };
  }

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

export const api = {
  get: (path, options) => request('GET', path, undefined, options),
  post: (path, body, options) => request('POST', path, body, options),
  put: (path, body, options) => request('PUT', path, body, options),
  delete: (path, body, options) => request('DELETE', path, body, options),
};
