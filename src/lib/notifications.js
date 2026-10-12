import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';

// Shared across the bell and the Notifications page via a module-level
// subscriber list, so marking read in one place updates the other.
const subs = new Set();
let cache = { notifications: [], unread: 0 };

async function refresh() {
  try {
    cache = await api('/notifications');
    subs.forEach((fn) => fn(cache));
  } catch { /* signed out or offline: keep last state */ }
}

export function useNotifications(pollMs = 45000) {
  const [state, setState] = useState(cache);
  useEffect(() => {
    subs.add(setState);
    refresh();
    const id = setInterval(refresh, pollMs);
    return () => { subs.delete(setState); clearInterval(id); };
  }, [pollMs]);

  const markRead = useCallback(async (ids) => {
    if (!ids.length) return;
    cache = {
      notifications: cache.notifications.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
      unread: Math.max(0, cache.unread - cache.notifications.filter((n) => ids.includes(n.id) && !n.read).length),
    };
    subs.forEach((fn) => fn(cache));
    await api('/notifications/read', { method: 'POST', body: { ids } }).catch(() => {});
  }, []);

  return { ...state, reload: refresh, markRead };
}

export const refreshNotifications = refresh;
