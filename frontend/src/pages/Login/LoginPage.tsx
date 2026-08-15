import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../api/client";
import { Field } from "../../components/ui/Field";
import { devTenantCredential } from "../../devCredentials";
import { PublicCopilotWidget } from "../Landing/PublicCopilotWidget";

export function LoginPage() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  // Em desenvolvimento os campos já chegam preenchidos (ver devCredentials.ts).
  // Fora disso `devTenantCredential` é null e o estado inicial é vazio,
  // exatamente como antes.
  const [email, setEmail] = useState(devTenantCredential?.email ?? "");
  const [password, setPassword] = useState(devTenantCredential?.password ?? "");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.type === "admin") {
        // Navegação REAL, não client-side. Este formulário autentica pelo
        // AuthContext (do tenant), que não tem como avisar o
        // AdminAuthContext — são contextos separados de propósito. Um
        // navigate() aqui mantinha o AdminAuthProvider montado com
        // admin=null, então o AdminProtectedRoute rejeitava e devolvia para
        // /admin/login: o login parecia falhar, e cada volta queimava uma
        // tentativa do rate limiter, fazendo o sintoma parecer "senha
        // errada". Recarregar remonta o provider, que se hidrata pelo
        // GET /admin/me. Mesmo padrão do AdminLoginModal.
        window.location.assign("/admin");
        return;
      }

      // Prioridade 3 (14/08/2026): o painel vive em /:slug — navegação
      // client-side simples, sem subdomínio para cruzar. O AuthContext já
      // hidratou user/tenant a partir da resposta de login() acima.
      navigate(`/${result.tenantSlug}`, { replace: true });
    } catch (err) {
      // Tenant pendente de aprovação (migration 055): a senha estava
      // certa, então "e-mail ou senha inválidos" seria uma mentira — a
      // pessoa precisa saber que a conta existe e está esperando o painel
      // admin, não tentar de novo achando que errou a senha.
      const body = err instanceof ApiError ? (err.body as { error?: string } | undefined) : undefined;
      setError(body?.error === "tenant_pending" ? t("login.pendingApproval") : t("login.error"));
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

        {devTenantCredential && <p className="dev-autofill-note">{t("common.devAutofill")}</p>}

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
