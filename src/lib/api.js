import { useCallback, useEffect, useRef, useState } from 'react';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.field = data.field;
    throw err;
  }
  return data;
}

// Fetch-on-mount with reload. Ignores responses that arrive after the inputs
// changed, so a slow request never overwrites a newer one.
export function useApi(path) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const seq = useRef(0);

  const load = useCallback(async () => {
    if (!path) return;
    const id = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await api(path);
      if (id === seq.current) setState({ data, error: null, loading: false });
    } catch (error) {
      if (id === seq.current) setState({ data: null, error, loading: false });
    }
  }, [path]);

  useEffect(() => { load(); }, [load]);
  const setData = (fn) => setState((s) => ({ ...s, data: typeof fn === 'function' ? fn(s.data) : fn }));
  return { ...state, reload: load, setData };
}

const HOUR = 3600e3;

export function timeAgo(iso) {
  const ms = Date.now() - Date.parse(iso);
  const m = Math.round(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(ms / HOUR);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function fmtHours(h) {
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h === 1) return '1 hour';
  if (h < 48) return `${h} hours`;
  return `${Math.round(h / 24)} days`;
}

export const STATUS_LABEL = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };
