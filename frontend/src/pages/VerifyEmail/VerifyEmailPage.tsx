import { useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import { Field } from "../../components/ui/Field";

type VerifyState = "awaiting" | "verifying" | "success" | "invalid" | "expired";

export function VerifyEmailPage() {
  const { t } = useTranslation();
  // Mesmo padrão já usado em SubscriptionPage.tsx (checkoutStatus) para ler
  // query string sem depender de useSearchParams — consistência, não
  // preferência nova.
  const token = new URLSearchParams(window.location.search).get("token");
  // Sem token não há o que confirmar por clique nenhum — vai direto para
  // "inválido", igual ao comportamento de sempre. Calculado no initializer
  // (não em efeito): não depende de rede, só da própria URL.
  const [state, setState] = useState<VerifyState>(token ? "awaiting" : "invalid");
  const [resendEmail, setResendEmail] = useState("");
  const [resendSent, setResendSent] = useState(false);
  const [resending, setResending] = useState(false);
  // A verificação NÃO dispara mais sozinha ao montar a página — dispara só
  // no clique de "Confirmar e-mail" (handleConfirm). Motivo: o token é de
  // uso único, e um scanner de segurança de e-mail corporativo (Microsoft
  // Defender, Proofpoint) que pré-visita o link antes da pessoa clicar
  // consumia o token sozinho — a pessoa chegava à página e via "link
  // inválido" para uma conta que, na prática, nunca tinha sido confirmada
  // por ela. Exigir um clique humano fecha essa classe de acionamento
  // automático (o scanner normalmente não interage com botões).
  //
  // `verifiedRef` continua a mesma proteção de antes, só que agora contra
  // clique duplo em vez de contra a dupla execução do useEffect em
  // StrictMode: sem ela, dois cliques rápidos disparariam duas chamadas
  // com o mesmo token, e a segunda voltaria 400 sobre um token já
  // consumido pela primeira.
  const verifiedRef = useRef(false);

  function handleConfirm() {
    if (verifiedRef.current || !token) return;
    verifiedRef.current = true;
    setState("verifying");

    api
      .get<{ success: true }>(`/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => setState("success"))
      .catch((err) => {
        const reason =
          err instanceof ApiError ? (err.body as { reason?: string } | undefined)?.reason : undefined;
        setState(reason === "expired" ? "expired" : "invalid");
      });
  }

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

        {state === "awaiting" && (
          <>
            <div className="card-title">{t("verifyEmail.awaitingTitle")}</div>
            <p className="text-muted" style={{ fontSize: 13, marginTop: 8, marginBottom: 16 }}>
              {t("verifyEmail.awaitingBody")}
            </p>
            <button type="button" className="btn btn-primary" style={{ width: "100%" }} onClick={handleConfirm}>
              {t("verifyEmail.confirmAction")}
            </button>
          </>
        )}

        {state === "verifying" && <p className="text-muted">{t("verifyEmail.loading")}</p>}

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
