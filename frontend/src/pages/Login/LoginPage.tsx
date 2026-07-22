import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { Field } from "../../components/ui/Field";
import { BASE_DOMAIN } from "../../publicConfig";
import { PublicCopilotWidget } from "../Landing/PublicCopilotWidget";

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.type === "admin") {
        navigate("/admin", { replace: true });
        return;
      }

      // Logging in from the root domain (or any host other than the
      // tenant's own subdomain) must land the user on their actual
      // dashboard, not silently succeed while the URL stays on the
      // anonymous-looking public landing page (root "/" renders
      // LandingPage — see App.tsx / isRootDomain()). A client-side
      // navigate() can't cross subdomains, so this needs a real browser
      // navigation — same pattern SignupPage already uses after signup.
      const expectedHost = `${result.tenantSlug}.${BASE_DOMAIN}`;
      if (window.location.hostname === expectedHost) {
        navigate("/", { replace: true });
      } else {
        const port = window.location.port ? `:${window.location.port}` : "";
        window.location.href = `${window.location.protocol}//${expectedHost}${port}/`;
      }
    } catch {
      setError(t("login.error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <form className="card" style={{ width: 360 }} onSubmit={handleSubmit}>
        <div className="brand" style={{ marginBottom: 20 }}>
          <span className="brand-logo-chip brand-logo-chip--form">
            <img src="/brand/logo-eckko-transparent.png" alt={t("common.appName")} />
          </span>
        </div>

        <Field label={t("login.emailLabel")} help={t("login.emailHelp")}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label={t("login.passwordLabel")} help={t("login.passwordHelp")}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>

        {error && (
          <p style={{ color: "var(--color-tertiary)", fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
          {submitting ? t("login.signingIn") : t("login.signIn")}
        </button>

        <p className="text-muted" style={{ fontSize: 13, marginTop: 16, textAlign: "center" }}>
          {t("login.noAccount")} <Link to="/signup">{t("login.signUp")}</Link>
        </p>
      </form>

      {/* Same stateless demo widget as the landing page (no session, no
          BYOK, platform key only) — reused as-is here since a visitor stuck
          on login/signup can't reach the in-app copilot yet. */}
      <PublicCopilotWidget />
    </div>
  );
}
