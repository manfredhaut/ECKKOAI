import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import { Field } from "../../components/ui/Field";

type VerifyState = "loading" | "success" | "invalid" | "expired";

export function VerifyEmailPage() {
  const { t } = useTranslation();
  // Mesmo padrão já usado em SubscriptionPage.tsx (checkoutStatus) para ler
  // query string sem depender de useSearchParams — consistência, não
  // preferência nova.
  const token = new URLSearchParams(window.location.search).get("token");
  const [state, setState] = useState<VerifyState>("loading");
  const [resendEmail, setResendEmail] = useState("");
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);
  // MEDIDO no navegador (15/08/2026): sem este guard, o StrictMode do React
  // (dev) roda este efeito DUAS vezes — a primeira chamada consome o token
  // (single-use, por desenho) e ativa a conta; a segunda, com o MESMO
  // token já limpo, volta 400 e sobrescreve o estado de sucesso com
  // "inválido". A conta ficava ativa no banco enquanto a tela dizia o
  // contrário. `verifiedRef` sobrevive ao ciclo fake unmount→remount do
  // StrictMode (ao contrário de estado), então só a PRIMEIRA chamada sai.
  //
  // ⚠️ RISCO CONHECIDO, NÃO RESOLVIDO: o mesmo efeito (token de uso único
  // consumido antes do clique real) acontece se um scanner de segurança de
  // e-mail corporativo (Microsoft Defender, Proofpoint) pré-visitar o link
  // antes da pessoa clicar. Esta correção resolve a duplicação DENTRO desta
  // aba; não resolve uma segunda visita genuína e externa ao mesmo link.
  const verifiedRef = useRef(false);

  useEffect(() => {
    if (verifiedRef.current) return;
    verifiedRef.current = true;

    if (!token) {
      setState("invalid");
      return;
    }
    api
      .get<{ success: true }>(`/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setState("success"))
      .catch((err) => {
        const reason =
          err instanceof ApiError ? (err.body as { reason?: string } | undefined)?.reason : undefined;
        setState(reason === "expired" ? "expired" : "invalid");
      });
  }, [token]);

  async function handleResend(e: FormEvent) {
    e.preventDefault();
    if (!resendEmail.trim() || resending) return;
    setResending(true);
    try {
      await api.post("/resend-verification", { email: resendEmail });
      setResendSent(true);
    } finally {
      setResending(false);
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
      <div className="card" style={{ width: 360, textAlign: "center" }}>
        <div className="brand" style={{ marginBottom: 20, justifyContent: "center" }}>
          <span className="brand-logo-chip brand-logo-chip--form">
            <img src="/brand/logo-eckko-transparent.png" alt={t("common.appName")} />
          </span>
        </div>

        {state === "loading" && <p className="text-muted">{t("verifyEmail.loading")}</p>}

        {state === "success" && (
          <>
            <div className="card-title">{t("verifyEmail.successTitle")}</div>
            <p className="text-muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 16 }}>
              {t("verifyEmail.successBody")}
            </p>
            <Link to="/login" className="btn btn-primary">
              {t("verifyEmail.goToLogin")}
            </Link>
          </>
        )}

        {(state === "invalid" || state === "expired") && (
          <>
            <div className="card-title">
              {state === "expired" ? t("verifyEmail.expiredTitle") : t("verifyEmail.invalidTitle")}
            </div>
            <p className="text-muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 16 }}>
              {state === "expired" ? t("verifyEmail.expiredBody") : t("verifyEmail.invalidBody")}
            </p>

            {resendSent ? (
              <p className="text-muted" style={{ fontSize: 13 }}>{t("verifyEmail.resendSent")}</p>
            ) : (
              <form onSubmit={handleResend} style={{ textAlign: "left" }}>
                <Field label={t("verifyEmail.resendEmailLabel")}>
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    required
                  />
                </Field>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: "100%" }}
                  disabled={resending || !resendEmail.trim()}
                >
                  {resending ? t("verifyEmail.resending") : t("verifyEmail.resendAction")}
                </button>
              </form>
            )}

            <p className="text-muted" style={{ fontSize: 13, marginTop: 16 }}>
              <Link to="/login">{t("signup.pendingBackToLogin")}</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
