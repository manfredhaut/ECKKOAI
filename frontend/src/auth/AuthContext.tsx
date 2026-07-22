import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../api/client";

interface AuthUser {
  id: string;
  email: string;
}

interface AuthTenant {
  id: string;
  name: string;
  slug: string;
}

interface SignupResult {
  user: AuthUser;
  tenant: { id: string; name: string; slug: string; host: string };
}

type LoginResult = { type: "admin" } | { type: "tenant"; tenantSlug: string };

interface AuthContextValue {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  signup: (email: string, password: string) => Promise<SignupResult>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<AuthTenant | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api.get<{ user: AuthUser; tenant: AuthTenant }>("/auth/me");
      setUser(me.user);
      setTenant(me.tenant);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        setTenant(null);
      } else {
        throw err;
      }
    }
  }, []);

  useEffect(() => {
    refreshMe().finally(() => setLoading(false));
  }, [refreshMe]);

  // Single unified endpoint (see backend/src/routes/login.ts) — tries
  // admin_users first (only off a tenant subdomain), then falls back to
  // users. The response tells us which one matched so the caller (LoginPage)
  // knows whether to send the browser to /admin or /. For "tenant", we
  // hydrate straight from the response instead of a redundant /auth/me
  // round-trip; for "admin" we deliberately leave user/tenant untouched —
  // this context never represents an admin identity, AdminAuthContext does
  // that, and it self-hydrates via its own /admin/me once /admin mounts.
  async function login(email: string, password: string): Promise<LoginResult> {
    const result = await api.post<
      | { type: "admin"; admin: { id: string; email: string; name: string } }
      | { type: "tenant"; user: AuthUser; tenant: AuthTenant }
    >("/login", { email, password });

    if (result.type === "tenant") {
      setUser(result.user);
      setTenant(result.tenant);
      return { type: "tenant", tenantSlug: result.tenant.slug };
    }
    return { type: "admin" };
  }

  // Doesn't call refreshMe(): the caller redirects the browser to the new
  // tenant's subdomain right after this resolves, which triggers a fresh
  // load (and its own refreshMe()) there.
  async function signup(email: string, password: string): Promise<SignupResult> {
    return api.post<SignupResult>("/auth/signup", { email, password });
  }

  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
    setTenant(null);
  }

  return (
    <AuthContext.Provider value={{ user, tenant, loading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
