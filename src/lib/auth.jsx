import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = still checking

  useEffect(() => {
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  const value = {
    user,
    setUser,
    async signOut() {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      setUser(null);
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
