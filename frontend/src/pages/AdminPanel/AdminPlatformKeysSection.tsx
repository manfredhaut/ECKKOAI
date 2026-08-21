import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { PlatformCredentialValidation, PlatformCredentialView } from "../../types";
import { Field } from "../../components/ui/Field";
import { StatusPill } from "../../components/ui/StatusPill";

// Chaves da PLATAFORMA — as que a casa paga. Fica na mesma aba "APIs" que as
// integrações por tenant, e não numa aba nova, porque a pergunta que traz
// alguém até aqui é a mesma ("qual chave está valendo para o quê?"); separar
// em duas abas obrigaria a saber a resposta antes de procurar.
//
// CAMPO DE ESCRITA APENAS. Não existe rota que devolva o valor gravado, nem
// para admin autenticado, então não há o que preencher no input: ele começa e
// termina vazio. O que identifica a chave na tela são os 4 últimos caracteres
// gravados no momento da escrita.
function PlatformKeyRow({
  credential,
  onChanged,
}: {
  credential: PlatformCredentialView;
  onChanged: (updated: PlatformCredentialView) => void;
}) {
  const { t, i18n } = useTranslation();
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<PlatformCredentialValidation | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString(i18n.language) : null);

  async function handleSave() {
    if (!apiKey.trim()) return;
    setSaving(true);
    setError(null);
    setResult(null);
    try {
      const updated = await api.put<PlatformCredentialView>(
        `/admin/platform-credentials/${credential.id}`,
        { apiKey },
      );
      onChanged(updated);
      setApiKey("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminPanel.platformKeys.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  // Só a partir deste clique. Uma chamada, sempre de leitura — nunca geração.
  async function handleValidate() {
    setValidating(true);
    setError(null);
    setResult(null);
    try {
      const outcome = await api.post<PlatformCredentialValidation>(
        `/admin/platform-credentials/${credential.id}/validate`,
        {},
      );
      setResult(outcome);
      // Recarrega a linha para o carimbo "validada em <data>" vir do banco, e
      // não de um estado local que sumiria no próximo refresh.
      const rows = await api.get<PlatformCredentialView[]>("/admin/platform-credentials");
      const fresh = rows.find((r) => r.id === credential.id);
      if (fresh) onChanged(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("adminPanel.platformKeys.validateFailed"));
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
        <div className="card-title">{credential.label}</div>
        <StatusPill status={credential.configured ? "connected" : "disconnected"} />
      </div>

      <p className="text-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 4 }}>
        <code>{credential.envVar}</code>
        {credential.servedBy ? ` · ${credential.servedBy}` : ` · ${t("adminPanel.platformKeys.noConsumer")}`}
      </p>

      {credential.configured ? (
        <p className="text-muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>
          {t(`adminPanel.platformKeys.source.${credential.source}`)}
          {credential.lastFour && ` · ····${credential.lastFour}`}
          {credential.source === "panel" && credential.updatedAt && (
            <>
              {" · "}
              {t("adminPanel.platformKeys.savedBy", {
                who: credential.updatedByName ?? t("adminPanel.platformKeys.unknownAuthor"),
                date: fmt(credential.updatedAt),
              })}
            </>
          )}
        </p>
      ) : (
        <p className="text-muted" style={{ fontSize: 12, marginTop: 0, marginBottom: 12 }}>
          {t("adminPanel.platformKeys.notConfigured")}
        </p>
      )}

      {/* O .env vencendo o painel é uma condição de emergência: sem aviso, uma
          chave gravada aqui pareceria não ter efeito, e o diagnóstico seria caro. */}
      {credential.forcedEnv && (
        <p className="alert-error" style={{ fontSize: 12 }}>
          {t("adminPanel.platformKeys.forcedEnvWarning")}
        </p>
      )}

      <Field
        label={t("adminPanel.platformKeys.newKeyLabel")}
        help={t("adminPanel.platformKeys.writeOnlyHint")}
      >
        <input
          type="password"
          autoComplete="off"
          placeholder={t("adminPanel.platformKeys.newKeyPlaceholder")}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </Field>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !apiKey.trim()}>
          {saving ? t("settings.saving") : t("common.save")}
        </button>
        <button
          className="btn btn-outline"
          onClick={handleValidate}
          disabled={validating || !credential.configured || !credential.hasProbe}
          title={credential.hasProbe ? t("adminPanel.platformKeys.validateHint") : t("adminPanel.platformKeys.noProbe")}
        >
          {validating ? t("adminPanel.platformKeys.validating") : t("adminPanel.platformKeys.validate")}
        </button>
      </div>

      {/* O MOTIVO visível, e não só no `title` — mesmo contrato do
          equivalente por tenant (AdminApisPanel.tsx): um botão cinza sem
          explicação faz procurar defeito onde há decisão. */}
      {!credential.hasProbe && (
        <p className="text-muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          {t("adminPanel.platformKeys.noProbe")}
        </p>
      )}

      {/* Saldo indisponível aparece COM O MOTIVO, no mesmo contrato das feature
          flags: nunca some, nunca vira botão que dá erro. */}
      {!credential.readsBalance && credential.balanceUnavailable && (
        <p className="text-muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
          {t("adminPanel.platformKeys.balanceUnavailable", { reason: credential.balanceUnavailable })}
        </p>
      )}

      {credential.lastValidatedAt && (
        <p
          style={{
            fontSize: 12,
            marginTop: 12,
            marginBottom: 0,
            color: credential.lastValidationOk ? "inherit" : "var(--color-tertiary)",
          }}
        >
          {t(
            credential.lastValidationOk
              ? "adminPanel.platformKeys.lastValidationOk"
              : "adminPanel.platformKeys.lastValidationFailed",
            { date: fmt(credential.lastValidatedAt) },
          )}
          {credential.lastValidationDetail && ` — ${credential.lastValidationDetail}`}
        </p>
      )}

      {/* O saldo do HeyGen é o número que decide se dá para gerar. Destacado,
          e não escondido junto do resto do texto de validação. */}
      {result?.balance && (
        <p className="card-title" style={{ fontSize: 15, marginTop: 12, marginBottom: 0 }}>
          {t("adminPanel.platformKeys.balance", { balance: result.balance })}
        </p>
      )}

      {error && (
        <p className="alert-error" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
          {error}
        </p>
      )}
    </div>
  );
}

export function AdminPlatformKeysSection() {
  const { t } = useTranslation();
  const [credentials, setCredentials] = useState<PlatformCredentialView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PlatformCredentialView[]>("/admin/platform-credentials")
      .then(setCredentials)
      .catch((err) => setLoadError(err instanceof Error ? err.message : t("adminPanel.loadError")));
  }, [t]);

  function replaceRow(updated: PlatformCredentialView) {
    setCredentials((prev) => prev?.map((c) => (c.id === updated.id ? updated : c)) ?? prev);
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <div className="section-heading">
        <h2>{t("adminPanel.platformKeys.title")}</h2>
        <p className="text-muted" style={{ fontSize: 13 }}>
          {t("adminPanel.platformKeys.subtitle")}
        </p>
      </div>

      {loadError ? (
        <p className="alert-error">{loadError}</p>
      ) : !credentials ? (
        <p className="text-muted">{t("adminPanel.loading")}</p>
      ) : (
        <div className="grid grid-cols-3">
          {credentials.map((credential) => (
            <PlatformKeyRow key={credential.id} credential={credential} onChanged={replaceRow} />
          ))}
        </div>
      )}
    </div>
  );
}
