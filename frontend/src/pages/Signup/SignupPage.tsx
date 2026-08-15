import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../api/client";
import { Field } from "../../components/ui/Field";
import { PublicCopilotWidget } from "../Landing/PublicCopilotWidget";

export function SignupPage() {
  const { t } = useTranslation();
  const { signup } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Todo tenant novo nasce pendente de aprovação (migration 055) — o
  // backend não abre sessão nenhuma no signup, então não há para onde
  // navegar. `true` significa "mostre a tela de espera em vez do
  // formulário"; não é o mesmo que `error`, que continua editável.
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup(email, password);
      setPending(true);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? t("signup.emailInUse") : t("signup.error"));
      setSubmitting(false);
    }
  }

  if (pending) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="card" style={{ width: 360, textAlign: "center" }}>
          <div className="brand" style={{ marginBottom: 20, justifyContent: "center" }}>
            <span className="brand-logo-chip brand-logo-chip--form">
              <img src="/brand/logo-eckko-transparent.png" alt={t("common.appName")} />
            </span>
          </div>
          <div className="card-title">{t("signup.pendingTitle")}</div>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 8 }}>
            {t("signup.pendingBody")}
          </p>
          <p className="text-muted" style={{ fontSize: 13, marginTop: 16 }}>
            <Link to="/login">{t("signup.pendingBackToLogin")}</Link>
          </p>
        </div>
      </div>
    );
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

        <Field label={t("signup.emailLabel")}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </Field>
        <Field label={t("signup.passwordLabel")} help={t("signup.passwordHelp")}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </Field>

        {error && (
          <p style={{ color: "var(--color-tertiary)", fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}

        <button type="submit" className="btn btn-primary" style={{ width: "100%" }} disabled={submitting}>
          {submitting ? t("signup.signingUp") : t("signup.signUp")}
        </button>

        <p className="text-muted" style={{ fontSize: 13, marginTop: 16, textAlign: "center" }}>
          {t("signup.hasAccount")} <Link to="/login">{t("signup.signIn")}</Link>
        </p>
      </form>

      {/* Same stateless demo widget as the landing page (no session, no
          BYOK, platform key only) — reused as-is here since a visitor stuck
          on login/signup can't reach the in-app copilot yet. */}
      <PublicCopilotWidget />
    </div>
  );
}
