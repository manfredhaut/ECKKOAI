import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Credential } from "../../types";
import { Field } from "../../components/ui/Field";
import { StatusPill } from "../../components/ui/StatusPill";
import { VENDORS_BY_PROVIDER } from "../Settings/providerVendors";

interface TestResult {
  ok: boolean;
  message: string | null;
}

const AVATAR_VENDORS = VENDORS_BY_PROVIDER.avatar;

/**
 * UMA LINHA por vendor de avatar já configurado — troca a chave DAQUELE
 * vendor e o testa, sem afetar os outros. Multi-vendor (migration 060): um
 * tenant pode ter heygen E fal ao mesmo tempo, cada linha sua própria
 * credencial.
 */
function AvatarVendorRow({
  tenantId,
  credential,
  onSaved,
}: {
  tenantId: string;
  credential: Credential;
  onSaved: (updated: Credential) => void;
}) {
  const { t, i18n } = useTranslation();
  const vendorDef = AVATAR_VENDORS.find((v) => v.id === credential.vendor);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  async function handleSave() {
    if (!apiKey) return;
    setSaving(true);
    try {
      const updated = await api.put<Credential>(`/admin/tenants/${tenantId}/credentials/avatar`, {
        apiKey,
        vendor: credential.vendor,
      });
      onSaved(updated);
      setApiKey("");
      setTestResult(null);
    } finally {
      setSaving(false);
    }
  }

  // `?vendor=` distingue QUAL linha testar — sem ele, com duas linhas de
  // avatar, a rota pegaria uma arbitrária (`rows[0]`, sem ORDER BY).
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post<TestResult>(
        `/admin/tenants/${tenantId}/credentials/avatar/test?vendor=${encodeURIComponent(credential.vendor)}`,
        {},
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : null });
    } finally {
      setTesting(false);
    }
  }

  // Vendor gravado que o catálogo atual do frontend não reconhece — não
  // deveria acontecer (o backend valida contra o mesmo catálogo), mas
  // renderizar em branco é mais seguro que quebrar a tela inteira por uma
  // linha.
  if (!vendorDef) return null;

  return (
    <div
      style={{
        borderTop: "1px solid var(--color-border, #e5e5e5)",
        paddingTop: 12,
        marginTop: 12,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <strong style={{ fontSize: 13 }}>{t(vendorDef.labelKey)}</strong>
        <StatusPill status={credential.connected ? "connected" : "disconnected"} />
      </div>
      <p className="text-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 8 }}>
        {credential.connected
          ? t("adminPanel.apis.lastUpdated", {
              date: new Date(credential.updated_at).toLocaleString(i18n.language),
            })
          : t("adminPanel.apis.neverConfigured")}
      </p>

      <Field
        label={
          credential.masked_key
            ? `${t(vendorDef.keyLabelKey)} ${t("settings.apiKeyCurrentHint", { lastFour: credential.masked_key })}`
            : t(vendorDef.keyLabelKey)
        }
      >
        <input
          type="password"
          placeholder={t(vendorDef.keyPlaceholderKey)}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </Field>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !apiKey}>
          {saving ? t("settings.saving") : t("common.save")}
        </button>
        <button
          className="btn btn-outline"
          onClick={handleTest}
          disabled={testing || !credential.connected || !vendorDef.hasConnectionProbe}
          title={vendorDef.hasConnectionProbe ? t("adminPanel.apis.testHint") : t("adminPanel.apis.testUnavailable")}
        >
          {testing ? t("adminPanel.apis.testing") : t("adminPanel.apis.test")}
        </button>
      </div>
      {!vendorDef.hasConnectionProbe && (
        <p className="text-muted" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
          {t("adminPanel.apis.testUnavailable")}
        </p>
      )}

      {testResult && (
        <p
          style={{
            fontSize: 13,
            marginTop: 12,
            marginBottom: 0,
            color: testResult.ok ? "var(--color-primary-strong, inherit)" : "var(--color-tertiary)",
          }}
        >
          {testResult.ok
            ? t("adminPanel.apis.testOk")
            : t("adminPanel.apis.testFailed", { message: testResult.message ?? "" })}
        </p>
      )}
    </div>
  );
}

/**
 * O cartão "Avatar" inteiro, MULTI-VENDOR (migration 060) — único dos três
 * (Avatar/Voz/Roteiro) que pode ter mais de uma credencial para o mesmo
 * tenant. Uma linha por vendor já configurado (`AvatarVendorRow`), mais um
 * bloco para adicionar um vendor que ainda não tem chave.
 *
 * Compartilhado entre `AdminApisPanel.tsx` (por integração) e
 * `AdminPanelPage.tsx` (detalhe do tenant) — os dois consomem o mesmo
 * `GET /admin/tenants/:id` e escrevem na mesma rota, então duplicar esta
 * lógica em dois lugares divergiria na primeira mudança futura. `voice` e
 * `script` continuam como estavam nos dois arquivos: este componente é só
 * o card de avatar.
 */
export function AvatarCredentialsCard({
  tenantId,
  credentials,
  onSaved,
}: {
  tenantId: string;
  credentials: Credential[];
  onSaved: (updated: Credential) => void;
}) {
  const { t } = useTranslation();
  const configurados = credentials.filter((c) => c.provider === "avatar");
  const vendoresConfigurados = new Set(configurados.map((c) => c.vendor));
  const disponiveisParaAdicionar = AVATAR_VENDORS.filter((v) => !vendoresConfigurados.has(v.id));

  const [novoVendor, setNovoVendor] = useState(disponiveisParaAdicionar[0]?.id ?? "");
  const [novaChave, setNovaChave] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const vendorParaAdicionar = disponiveisParaAdicionar.find((v) => v.id === novoVendor);

  async function handleAdd() {
    if (!novaChave || !novoVendor) return;
    setAdicionando(true);
    try {
      const updated = await api.put<Credential>(`/admin/tenants/${tenantId}/credentials/avatar`, {
        apiKey: novaChave,
        vendor: novoVendor,
      });
      onSaved(updated);
      setNovaChave("");
    } finally {
      setAdicionando(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">{t("adminPanel.provider.avatar")}</div>

      {configurados.length === 0 && (
        <p className="text-muted" style={{ fontSize: 12 }}>
          {t("adminPanel.apis.neverConfigured")}
        </p>
      )}

      {configurados.map((c) => (
        <AvatarVendorRow key={c.vendor} tenantId={tenantId} credential={c} onSaved={onSaved} />
      ))}

      {disponiveisParaAdicionar.length > 0 && (
        <div
          style={{
            borderTop: configurados.length > 0 ? "1px solid var(--color-border, #e5e5e5)" : undefined,
            paddingTop: configurados.length > 0 ? 12 : 0,
            marginTop: configurados.length > 0 ? 12 : 0,
          }}
        >
          <p className="text-muted" style={{ fontSize: 12, marginBottom: 8 }}>
            {t("adminPanel.apis.addAvatarVendor")}
          </p>
          <Field label={t("settings.vendorLabel")}>
            <select value={novoVendor} onChange={(e) => setNovoVendor(e.target.value)}>
              {disponiveisParaAdicionar.map((v) => (
                <option key={v.id} value={v.id}>
                  {t(v.labelKey)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={vendorParaAdicionar ? t(vendorParaAdicionar.keyLabelKey) : t("settings.vendorLabel")}>
            <input
              type="password"
              placeholder={vendorParaAdicionar ? t(vendorParaAdicionar.keyPlaceholderKey) : ""}
              value={novaChave}
              onChange={(e) => setNovaChave(e.target.value)}
            />
          </Field>
          <button className="btn btn-primary" onClick={handleAdd} disabled={adicionando || !novaChave}>
            {adicionando ? t("settings.saving") : t("adminPanel.apis.addVendorButton")}
          </button>
        </div>
      )}
    </div>
  );
}
