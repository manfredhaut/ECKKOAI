import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

export type EntryTab = "signup" | "login";

/**
 * Painel único de entrada do cliente, com duas abas: criar conta e entrar.
 *
 * Antes havia dois botões soltos no header e no hero, e a diferença entre
 * "Começar grátis" e "Já tenho conta" só existia no texto — quem já era
 * cliente clicava no verde grande e caía no cadastro. Juntando os dois no
 * mesmo painel, a escolha fica explícita e reversível sem sair da página.
 *
 * As duas ações navegam para rotas do MESMO domínio (/signup, /login) —
 * domínio único (14/08/2026), sem subdomínio de tenant para cruzar. Antes
 * disto, "entrar" fazia navegação real para o subdomínio do tenant, um host
 * que não tem DNS: NXDOMAIN garantido em produção.
 *
 * Esta é a porta do CLIENTE. O acesso administrativo tem formulário,
 * endpoint e tabela de identidade próprios (AdminLoginModal) e continua
 * discreto no rodapé, de propósito.
 */
export function EntryPanel({ initialTab, onClose }: { initialTab: EntryTab; onClose: () => void }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<EntryTab>(initialTab);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="admin-modal-scrim"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="entry-panel" role="dialog" aria-modal="true" aria-labelledby="entry-panel-title">
        <button type="button" className="admin-modal-close" onClick={onClose} aria-label={t("common.close")}>
          ×
        </button>

        <div className="entry-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "signup"}
            className={`entry-tab${tab === "signup" ? " entry-tab--active" : ""}`}
            onClick={() => setTab("signup")}
          >
            {t("landing.entry.signupTab")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "login"}
            className={`entry-tab${tab === "login" ? " entry-tab--active" : ""}`}
            onClick={() => setTab("login")}
          >
            {t("landing.entry.loginTab")}
          </button>
        </div>

        {tab === "signup" ? (
          <div className="entry-pane">
            <h2 id="entry-panel-title">{t("landing.entry.signupTitle")}</h2>
            <p className="text-muted">{t("landing.entry.signupBody")}</p>
            <Link to="/signup" className="btn btn-primary entry-action">
              {t("landing.entry.signupAction")}
            </Link>
          </div>
        ) : (
          <div className="entry-pane">
            <h2 id="entry-panel-title">{t("landing.entry.loginTitle")}</h2>
            <p className="text-muted">{t("landing.entry.loginBody")}</p>
            <Link to="/login" className="btn btn-primary entry-action">
              {t("landing.entry.loginAction")}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
