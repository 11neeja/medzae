'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { loginAPI, registerAPI, googleLoginAPI, getMeAPI, checkBackendHealth } from '@/lib/api';

interface User {
  _id: string;
  name: string;
  email: string;
  role?: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  backendConnected: boolean;
  dbConnected: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  signup: (name: string, email: string, password: string, rememberMe?: boolean) => Promise<void>;
  loginWithGoogle: (credential: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const REMEMBER_ME_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const TOKEN_KEY = 'token';
const TOKEN_EXPIRY_KEY = 'token_expires_at';
// Keep-alive cadence: free-tier hosts spin down after ~15 min idle, so an
// open tab pinging every 4 min keeps the API warm without being noisy.
const HEALTH_POLL_MS = 4 * 60 * 1000;

const getStoredToken = () => {
  if (typeof window === 'undefined') return null;

  const persistentToken = localStorage.getItem(TOKEN_KEY);
  if (persistentToken) {
    const expiresAt = Number(localStorage.getItem(TOKEN_EXPIRY_KEY) || 0);
    if (expiresAt && Date.now() > expiresAt) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TOKEN_EXPIRY_KEY);
      return null;
    }

    return persistentToken;
  }

  return sessionStorage.getItem(TOKEN_KEY);
};

// Synchronous hint that a session token exists locally — lets pages decide
// whether a "restoring your session" splash is warranted without waiting on
// the network.
export const hasStoredSession = () => Boolean(getStoredToken());

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [backendConnected, setBackendConnected] = useState(false);
  const [dbConnected, setDbConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const storeToken = (token: string, rememberMe: boolean) => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    if (rememberMe) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + REMEMBER_ME_DURATION_MS));
      return;
    }
    sessionStorage.setItem(TOKEN_KEY, token);
  };

  const clearStoredToken = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_EXPIRY_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  };

  // Check backend health
  const checkHealth = useCallback(async () => {
    try {
      const health = await checkBackendHealth();
      setBackendConnected(health.server === true);
      setDbConnected(health.database === 'connected');
      return health.status === 'ok';
    } catch {
      setBackendConnected(false);
      setDbConnected(false);
      return false;
    }
  }, []);

  // On mount: restore session from token. This must NEVER block first paint
  // on a network call — the API host can take a minute+ to cold-start, and
  // visitors without a session have nothing to wait for.
  useEffect(() => {
    const init = async () => {
      const token = getStoredToken();

      if (!token) {
        // Nothing to restore — unblock the UI immediately. Ping health in the
        // background so a sleeping backend starts waking while the visitor
        // reads the landing page or types their credentials.
        setLoading(false);
        checkHealth();
        return;
      }

      try {
        const userData = await getMeAPI();
        setUser(userData);
        setIsAuthenticated(true);
        setBackendConnected(true);
        setDbConnected(true);
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 401 || status === 403) {
          // Token invalid/expired
          clearStoredToken();
        }
        // On network errors keep the token — the backend may just be
        // unreachable; the next page load retries.
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    init();

    // Periodic background ping doubles as a keep-alive for the backend.
    const interval = setInterval(checkHealth, HEALTH_POLL_MS);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // No health-check preflight here: on a cold backend it doubles the wait,
  // and the auth request itself reports failure just as well.
  const friendlyNetworkMessage =
    'Could not reach the server — it may be waking up. Please try again in about 30 seconds.';

  const login = async (email: string, password: string, rememberMe = false) => {
    setError(null);
    try {
      const data = await loginAPI(email, password, rememberMe);
      storeToken(data.token, rememberMe);
      setUser({ _id: data._id, name: data.name, email: data.email });
      setIsAuthenticated(true);
      setBackendConnected(true);
      setDbConnected(true);
    } catch (err: any) {
      const message = err.response
        ? err.response.data?.message || 'Login failed'
        : friendlyNetworkMessage;
      setError(message);
      throw new Error(message);
    }
  };

  const signup = async (name: string, email: string, password: string, rememberMe = false) => {
    setError(null);
    try {
      const data = await registerAPI(name, email, password, rememberMe);
      storeToken(data.token, rememberMe);
      setUser({ _id: data._id, name: data.name, email: data.email });
      setIsAuthenticated(true);
      setBackendConnected(true);
      setDbConnected(true);
    } catch (err: any) {
      const message = err.response
        ? err.response.data?.message || 'Registration failed'
        : friendlyNetworkMessage;
      setError(message);
      throw new Error(message);
    }
  };

  // Exchange a Google ID token (from the GIS button) for a Medzae session.
  // The backend verifies the token and creates the account on first sign-in,
  // so this one call covers both "login with Google" and "sign up with Google".
  const loginWithGoogle = async (credential: string, rememberMe = false) => {
    setError(null);
    try {
      const data = await googleLoginAPI(credential, rememberMe);
      storeToken(data.token, rememberMe);
      setUser({ _id: data._id, name: data.name, email: data.email });
      setIsAuthenticated(true);
      setBackendConnected(true);
      setDbConnected(true);
    } catch (err: any) {
      const message = err.response
        ? err.response.data?.message || 'Google sign-in failed'
        : friendlyNetworkMessage;
      setError(message);
      throw new Error(message);
    }
  };

  const logout = () => {
    clearStoredToken();
    setIsAuthenticated(false);
    setUser(null);
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        user,
        backendConnected,
        dbConnected,
        loading,
        error,
        login,
        signup,
        loginWithGoogle,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
