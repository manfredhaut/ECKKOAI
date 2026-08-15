import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AdminAuthProvider } from "./adminAuth/AdminAuthContext";
import { AdminCopilotProvider } from "./adminCopilot/AdminCopilotContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminProtectedRoute } from "./components/AdminProtectedRoute";
import { AppShell } from "./components/layout/AppShell";
import { CopilotProvider } from "./copilot/CopilotContext";
import { FeatureFlagProvider } from "./features/FeatureFlagContext";
import { DEV_GALLERY } from "./dev/devGallery";
import { StepGallery } from "./dev/StepGallery";
import { LandingPage } from "./pages/Landing/LandingPage";
import { LoginPage } from "./pages/Login/LoginPage";
import { SignupPage } from "./pages/Signup/SignupPage";
import { VerifyEmailPage } from "./pages/VerifyEmail/VerifyEmailPage";
import { AdminPanelPage } from "./pages/AdminPanel/AdminPanelPage";
import { DashboardPage } from "./pages/Dashboard/DashboardPage";
import { CreateVideoPage } from "./pages/CreateVideo/CreateVideoPage";
import { ContentPage } from "./pages/Content/ContentPage";
import { RagPage } from "./pages/Rag/RagPage";
import { SubscriptionPage } from "./pages/Subscription/SubscriptionPage";
import { SettingsPage } from "./pages/Settings/SettingsPage";

export function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

/**
 * Prioridade 3 (14/08/2026): o path vira `/:slug/*`, mas o slug no path é
 * APENAS EXIBIÇÃO — o tenant efetivo vem sempre da sessão (useAuth()/
 * `/auth/me`, que por sua vez espelha `req.session.tenantId` no backend).
 *
 * Se o `:slug` da URL não bater com o slug real do tenant logado (link
 * velho depois do primeiro save do perfil recalcular o slug; ou alguém
 * editando a URL à mão), redireciona para o slug correto — preservando o
 * resto do caminho e a query string, não só a raiz.
 */
function TenantSlugGate({ children }: { children: ReactNode }) {
  const { slug, "*": rest } = useParams<{ slug: string; "*": string }>();
  const location = useLocation();
  const { tenant } = useAuth();

  if (!tenant) return null;
  if (slug !== tenant.slug) {
    const suffix = rest ? `/${rest}` : "";
    return <Navigate to={`/${tenant.slug}${suffix}${location.search}${location.hash}`} replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  // Domínio único (14/08/2026, subdomínio por tenant cancelado): "/" não
  // pode mais decidir landing-vs-painel pelo HOSTNAME — decide pela SESSÃO.
  // Autenticado, "/" redireciona para "/:slug" (o painel de verdade vive
  // sob o slug agora, prioridade 3); sem sessão, "/" é a landing pública.
  const { user, tenant, loading } = useAuth();
  // Enquanto /auth/me ainda não respondeu, não decide nada — evita um flash
  // da landing antes da sessão hidratar.
  if (loading) return null;
  const showLanding = !user;

  return (
    <Routes>
      {showLanding && <Route path="/" element={<LandingPage />} />}
      {user && <Route path="/" element={<Navigate to={tenant ? `/${tenant.slug}` : "/login"} replace />} />}
      {/* Galeria de desenvolvimento. A rota só é REGISTRADA quando a flag
          está ligada — em produção ela não existe, então o catch-all
          devolve 404 em vez de uma tela vazia. Uma rota que responde 200
          com nada esconde que o caminho continua vivo. */}
      {DEV_GALLERY && <Route path="/dev/steps" element={<StepGallery />} />}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route
        path="/admin/*"
        element={
          <AdminAuthProvider>
            <Routes>
              {/* Same unified form as /login (see LoginPage.tsx) — no
                  distinct admin-branded screen anymore, so the URL alone
                  never reveals that a separate admin path exists. Kept as
                  its own route (not removed) only because
                  AdminProtectedRoute below still redirects here when an
                  admin session expires. */}
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/*"
                element={
                  <AdminProtectedRoute>
                    <AdminCopilotProvider>
                      <AdminPanelPage />
                    </AdminCopilotProvider>
                  </AdminProtectedRoute>
                }
              />
            </Routes>
          </AdminAuthProvider>
        }
      />
      {/* Estático sempre vence dinâmico na priorização do React Router,
          então /login, /signup e /admin/* acima NUNCA são engolidos por
          este catch-all — mesmo que um tenant tivesse esses slugs. É por
          isso que RESERVED_SLUGS (backend/src/services/slug.ts) impede um
          tenant de nascer com um deles: a rota deles funcionaria sempre;
          o tenant é que ficaria inalcançável para sempre. */}
      <Route
        path="/:slug/*"
        element={
          <ProtectedRoute>
            <TenantSlugGate>
              <FeatureFlagProvider>
              <CopilotProvider>
                <AppShell>
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/subscription" element={<SubscriptionPage />} />
                    <Route path="/create" element={<CreateVideoPage />} />
                    <Route path="/content" element={<ContentPage />} />
                    <Route path="/rag" element={<RagPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Routes>
                </AppShell>
              </CopilotProvider>
              </FeatureFlagProvider>
            </TenantSlugGate>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
