import { Route, Routes } from "react-router-dom";
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

function AppRoutes() {
  // Domínio único (14/08/2026, subdomínio por tenant cancelado): "/" não
  // pode mais decidir landing-vs-painel pelo HOSTNAME (a função antiga
  // virou sempre verdadeira em produção, já que não há mais subdomínio
  // nenhum) — decide pela SESSÃO. Sem isto, eckkoai.com/ mostrava a landing
  // mesmo logado, porque a rota estática "/" sempre vence o catch-all "/*"
  // do painel protegido, não importa a ordem de declaração.
  const { user, loading } = useAuth();
  // Enquanto /auth/me ainda não respondeu, não decide nada — evita um flash
  // da landing antes da sessão hidratar.
  if (loading) return null;
  const showLanding = !user;

  return (
    <Routes>
      {showLanding && <Route path="/" element={<LandingPage />} />}
      {/* Galeria de desenvolvimento. A rota só é REGISTRADA quando a flag
          está ligada — em produção ela não existe, então o catch-all
          devolve 404 em vez de uma tela vazia. Uma rota que responde 200
          com nada esconde que o caminho continua vivo. */}
      {DEV_GALLERY && <Route path="/dev/steps" element={<StepGallery />} />}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
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
      <Route
        path="/*"
        element={
          <ProtectedRoute>
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
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
