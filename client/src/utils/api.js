// Central API wrapper — all calls go through Vite's proxy to the backend
const BASE = '/api';

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

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
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path, body) => request('DELETE', path, body),
};
