import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, tokenStore } from "./api";

interface AuthState {
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setAuthenticated] = useState(() => tokenStore.get() !== null);

  const logout = useCallback(() => {
    tokenStore.clear();
    setAuthenticated(false);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { access_token } = await api.login(username, password);
    tokenStore.set(access_token);
    setAuthenticated(true);
  }, []);

  // The API client fires this when a token expires mid-session.
  useEffect(() => {
    window.addEventListener("docksight:logout", logout);
    return () => window.removeEventListener("docksight:logout", logout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
