import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, ApiError } from "../api/client";

interface AdminUser {
  id: string;
  email: string;
  name: string;
}

interface AdminAuthContextValue {
  admin: AdminUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

// Completely separate from AuthContext (tenant login) — a different session
// field (`adminUserId`, not `userId`/`tenantId`), a different identity table
// (`admin_users`, not `users`). See backend/src/middleware/requireAdmin.ts.
const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async () => {
    try {
      const me = await api.get<AdminUser>("/admin/me");
      setAdmin(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setAdmin(null);
      } else {
        throw err;
      }
    }
  }, []);

  useEffect(() => {
    refreshMe().finally(() => setLoading(false));
  }, [refreshMe]);

  async function login(email: string, password: string) {
    await api.post("/admin/login", { email, password });
    await refreshMe();
  }

  async function logout() {
    await api.post("/admin/logout");
    setAdmin(null);
  }

  return (
    <AdminAuthContext.Provider value={{ admin, loading, login, logout }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
