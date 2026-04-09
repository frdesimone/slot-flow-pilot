import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { apiJson, setToken, clearToken, getToken, API_BASE } from "@/lib/apiClient";

export interface AuthUser {
  id: string;
  username: string | null;
  email: string | null;
  is_admin: boolean;
  is_active: boolean;
  has_logo: boolean;
  created_at: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  logoUrl: string | null;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [logoVersion, setLogoVersion] = useState(0); // Bust cache tras subir logo

  const refreshUser = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      const me = await apiJson<AuthUser>("/api/v1/auth/me");
      setUser(me);
      setLogoVersion(v => v + 1);
    } catch {
      clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await refreshUser();
      setLoading(false);
    })();
  }, [refreshUser]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiJson<{ access_token: string; user: AuthUser }>(
      "/api/v1/auth/login",
      "POST",
      { username, password },
      { skipAuth: true },
    );
    setToken(data.access_token);
    setUser(data.user);
    setLogoVersion(v => v + 1);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    window.location.href = "/login";
  }, []);

  const logoUrl = user?.has_logo
    ? `${API_BASE}/api/v1/auth/logo/${user.id}?v=${logoVersion}`
    : null;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, logoUrl }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
