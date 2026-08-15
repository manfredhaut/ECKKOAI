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

// Sempre pendente hoje (migration 055: todo tenant novo nasce 'pending'),
// mas o campo fica explícito em vez de a ausência de sessão ser o único
// sinal — SignupPage não tem como distinguir "pendente" de "algo mais que
// falhou silenciosamente" sem ele.
interface SignupResult {
  pendingApproval: true;
  user: AuthUser;
  tenant: { id: string; name: string; slug: string };
}

// tenantSlug: prioridade 3 (14/08/2026) — path virou /:slug/*, e é para lá
// que o login precisa navegar depois do sucesso (ver LoginPage.tsx).
type LoginResult = { type: "admin" } | { type: "tenant"; tenantSlug: string };

interface AuthContextValue {
  user: AuthUser | null;
  tenant: AuthTenant | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  signup: (email: string, password: string) => Promise<SignupResult>;
  logout: () => Promise<void>;
  // Exposto para o primeiro save do perfil (Minha Assinatura, prioridade 3):
  // o slug pode mudar ali (recálculo único a partir do nome), e SEM isto o
  // tenant.slug deste contexto — a fonte que TenantSlugGate usa para decidir
  // se a URL bate com a sessão — ficava desatualizado até o próximo reload
  // inteiro da página. A URL na barra do navegador continuaria mostrando o
  // slug VELHO, mesmo com o backend já tendo travado o novo.
  refreshSession: () => Promise<void>;
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

  // NÃO hidrata user/tenant: o backend não abre sessão para tenant pendente
  // (migration 055) — setar o estado local aqui mentiria que a pessoa está
  // autenticada quando GET /auth/me devolveria 401 no próximo reload. O
  // caller (SignupPage) mostra a tela de espera usando a resposta direto,
  // sem passar pelo contexto.
  async function signup(email: string, password: string): Promise<SignupResult> {
    return api.post<SignupResult>("/auth/signup", { email, password });
  }

  async function logout() {
    await api.post("/auth/logout");
    setUser(null);
    setTenant(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, tenant, loading, login, signup, logout, refreshSession: refreshMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
