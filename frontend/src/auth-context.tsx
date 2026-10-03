import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { auth, User } from "./auth-storage";
import { api } from "./api";

type Ctx = {
  user: User | null;
  loading: boolean;
  login: (u: string, p: string) => Promise<void>;
  loginWithGoogle: (session_id: string) => Promise<void>;
  loginWithApple: (d: { identity_token: string; email?: string | null; name?: string | null }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({
  user: null, loading: true,
  login: async () => {}, loginWithGoogle: async () => {}, loginWithApple: async () => {},
  logout: async () => {}, refresh: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const token = await auth.getToken();
      if (!token) { setUser(null); return; }
      const me = await api.me();
      setUser(me);
      await auth.setUser(me);
    } catch {
      setUser(null);
      await auth.clearToken();
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    await auth.setToken(res.access_token);
    await auth.setUser(res.user);
    setUser(res.user);
  }, []);

  const loginWithGoogle = useCallback(async (session_id: string) => {
    const res = await api.googleSession(session_id);
    await auth.setToken(res.access_token);
    await auth.setUser(res.user);
    setUser(res.user);
  }, []);

  const loginWithApple = useCallback(async (d: { identity_token: string; email?: string | null; name?: string | null }) => {
    const res = await api.appleLogin(d);
    await auth.setToken(res.access_token);
    await auth.setUser(res.user);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await auth.clearToken();
    await auth.clearUser();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, loginWithApple, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);

export const canEdit = (role: string | undefined, module: "kpr" | "unit" | "legal" | "settings") => {
  if (role === "admin_utama") return true;
  if (module === "settings") return false;
  if (module === "kpr") return role === "admin_kpr" || role === "marketing";
  if (module === "unit") return role === "admin_bangunan";
  if (module === "legal") return role === "admin_legal";
  return false;
};

/** Marketing freelance hanya boleh mengubah berkas atas nama marketingnya sendiri. */
export const canEditKprItem = (user: User | null, item: { marketing?: string }) => {
  if (!canEdit(user?.role, "kpr")) return false;
  if (user?.role === "marketing") return !!user.marketing_name && item.marketing === user.marketing_name;
  return true;
};

export const ROLE_LABELS: Record<string, string> = {
  admin_utama: "Admin Utama",
  admin_kpr: "Admin KPR",
  admin_legal: "Admin Legal",
  admin_bangunan: "Admin Bangunan",
  marketing: "Marketing",
};

export const roleLabel = (role?: string) => (role && ROLE_LABELS[role]) || "Admin";
