import { Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AdminAuthProvider } from "./adminAuth/AdminAuthContext";
import { AdminCopilotProvider } from "./adminCopilot/AdminCopilotContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminProtectedRoute } from "./components/AdminProtectedRoute";
import { AppShell } from "./components/layout/AppShell";
import { CopilotProvider } from "./copilot/CopilotContext";
import { FeatureFlagProvider } from "./features/FeatureFlagContext";
import { isRootDomain } from "./publicConfig";
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
  // The public marketing site (this route) only exists on the root domain.
  // On a tenant subdomain, "/" keeps meaning the Dashboard (see the nested
  // Routes below) — the static "/" match always wins over the "/*" catch-all,
  // so this doesn't touch the tenant app's routing at all.
  const showLanding = isRootDomain();

  return (
    <AuthProvider>
      <Routes>
        {showLanding && <Route path="/" element={<LandingPage />} />}
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
    </AuthProvider>
  );
}
