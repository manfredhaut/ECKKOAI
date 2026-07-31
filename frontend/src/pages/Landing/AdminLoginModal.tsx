import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { devAdminCredential } from "../../devCredentials";

interface AdminLoginResponse {
  id: string;
  email: string;
  name: string;
}

/**
 * Formulário de admin próprio, deliberadamente separado do login de cliente.
 *
 * Regra do projeto: admin e tenant nunca compartilham formulário, endpoint
 * nem tabela de identidade. Por isso este componente NÃO reaproveita o
 * LoginPage/AuthContext (que hoje serve os dois via POST /login) — ele posta
 * direto em POST /admin/login (routes/adminAuth.ts), que só consulta
 * `admin_users` e tem rate limiter próprio. Nenhuma rota nova foi criada.
 *
 * Depois do sucesso a navegação é real (`window.location.assign`), não
 * client-side: assim o AdminAuthProvider monta do zero e se hidrata pelo
 * GET /admin/me, em vez de depender de uma revalidação que ele não faz.
 */
export function AdminLoginModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  // Preenchido em desenvolvimento (ver devCredentials.ts); vazio em
  // qualquer outro caso, inclusive build de produção.
  const [email, setEmail] = useState(devAdminCredential?.email ?? "");
  const [password, setPassword] = useState(devAdminCredential?.password ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await api.post<AdminLoginResponse>("/admin/login", { email, password });
      window.location.assign("/admin");
    } catch {
      setError(t("landing.adminAccess.error"));
      setSubmitting(false);
    }
  }

  return (
    <div
      className="admin-modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
        <button type="button" className="admin-modal-close" onClick={onClose} aria-label={t("common.close")}>
          ×
        </button>
        <div className="admin-modal-kicker">{t("landing.adminAccess.kicker")}</div>
        <h2 id="admin-modal-title">{t("landing.adminAccess.title")}</h2>
        <p className="admin-modal-sub">{t("landing.adminAccess.warning")}</p>

        <form onSubmit={handleSubmit}>
          <label className="admin-modal-field">
            <span>{t("landing.adminAccess.emailLabel")}</span>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
              required
            />
          </label>
          <label className="admin-modal-field">
            <span>{t("landing.adminAccess.passwordLabel")}</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              required
            />
          </label>

          {devAdminCredential && <p className="dev-autofill-note">{t("common.devAutofill")}</p>}

          {error && <p className="admin-modal-error">{error}</p>}

          <button type="submit" className="btn btn-primary admin-modal-submit" disabled={submitting}>
            {submitting ? t("landing.adminAccess.submitting") : t("landing.adminAccess.submit")}
          </button>
        </form>

        <p className="admin-modal-note">{t("landing.adminAccess.note")}</p>
      </div>
    </div>
  );
}
