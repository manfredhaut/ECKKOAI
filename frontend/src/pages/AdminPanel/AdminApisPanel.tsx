import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { AdminTenantDetail, AdminTenantSummary, Credential, CredentialProviderId } from "../../types";
import { Field } from "../../components/ui/Field";
import { StatusPill } from "../../components/ui/StatusPill";
import { VENDORS_BY_PROVIDER } from "../Settings/providerVendors";

const PROVIDERS: CredentialProviderId[] = ["avatar", "voice", "script"];

interface TestResult {
  ok: boolean;
  message: string | null;
}

// Mirror of the per-tenant credential editor in AdminPanelPage's tenant
// detail (kept intact on purpose — see CLAUDE.md), organized by
// integration instead of by tenant. Reads the same api_credentials-backed
// payload from GET /admin/tenants/:id; nothing here recomputes "connected"
// or contacts a vendor on mount.
function IntegrationCard({
  tenantId,
  provider,
  credential,
  onSaved,
}: {
  tenantId: string;
  provider: CredentialProviderId;
  credential: Credential | undefined;
  onSaved: (updated: Credential) => void;
}) {
  const { t, i18n } = useTranslation();
  const vendors = VENDORS_BY_PROVIDER[provider];
  const [vendor, setVendor] = useState(credential?.vendor ?? vendors[0].id);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (credential?.vendor) setVendor(credential.vendor);
    // A different tenant/credential is showing now — a previous tenant's
    // test result must not linger on screen.
    setTestResult(null);
    setApiKey("");
  }, [credential?.vendor, tenantId]);

  const activeVendor = vendors.find((v) => v.id === vendor) ?? vendors[0];

  async function handleSave() {
    if (!apiKey) return;
    setSaving(true);
    try {
      const updated = await api.put<Credential>(`/admin/tenants/${tenantId}/credentials/${provider}`, {
        apiKey,
        vendor,
      });
      onSaved(updated);
      setApiKey("");
      setTestResult(null);
    } finally {
      setSaving(false);
    }
  }

  // Only ever runs from this click — never on mount. A script-vendor test
  // is a real (tiny) billable call.
  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.post<TestResult>(
        `/admin/tenants/${tenantId}/credentials/${provider}/test`,
        {},
      );
      setTestResult(result);
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : null });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div className="card-title">{t(`adminPanel.provider.${provider}`)}</div>
        <StatusPill status={credential?.connected ? "connected" : "disconnected"} />
      </div>

      <p className="text-muted" style={{ fontSize: 12, marginTop: -4, marginBottom: 12 }}>
        {credential?.connected
          ? t("adminPanel.apis.lastUpdated", {
              date: new Date(credential.updated_at).toLocaleString(i18n.language),
            })
          : t("adminPanel.apis.neverConfigured")}
      </p>

      <Field label={t("settings.vendorLabel")}>
        <select value={vendor} disabled={vendors.length === 1} onChange={(e) => setVendor(e.target.value)}>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {t(v.labelKey)}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={
          credential?.masked_key
            ? `${t(activeVendor.keyLabelKey)} ${t("settings.apiKeyCurrentHint", { lastFour: credential.masked_key })}`
            : t(activeVendor.keyLabelKey)
        }
      >
        <input
          type="password"
          placeholder={t(activeVendor.keyPlaceholderKey)}
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
          disabled={testing || !credential?.connected}
          title={t("adminPanel.apis.testHint")}
        >
          {testing ? t("adminPanel.apis.testing") : t("adminPanel.apis.test")}
        </button>
      </div>

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

export function AdminApisPanel({ tenants }: { tenants: AdminTenantSummary[] }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminTenantDetail | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) => t.name.toLowerCase().includes(q) || t.slug.toLowerCase().includes(q));
  }, [tenants, query]);

  useEffect(() => {
    if (!selectedTenantId) {
      setDetail(null);
      return;
    }
    setDetail(null);
    api.get<AdminTenantDetail>(`/admin/tenants/${selectedTenantId}`).then(setDetail);
  }, [selectedTenantId]);

  function updateCredential(updated: Credential) {
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            credentials: prev.credentials.some((c) => c.provider === updated.provider)
              ? prev.credentials.map((c) => (c.provider === updated.provider ? updated : c))
              : [...prev.credentials, updated],
          }
        : prev,
    );
  }

  return (
    <div>
      <div className="section-heading">
        <h2>{t("adminPanel.apis.title")}</h2>
        <p className="text-muted" style={{ fontSize: 13 }}>
          {t("adminPanel.apis.subtitle")}
        </p>
      </div>

      <Field label={t("adminPanel.apis.searchLabel")}>
        <input
          type="search"
          placeholder={t("adminPanel.apis.searchPlaceholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>

      <Field label={t("adminPanel.apis.tenantLabel")}>
        <select value={selectedTenantId ?? ""} onChange={(e) => setSelectedTenantId(e.target.value || null)}>
          <option value="">{t("adminPanel.apis.selectTenant")}</option>
          {filtered.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name} ({tenant.slug}) —{" "}
              {tenant.connectedProviders.length > 0
                ? tenant.connectedProviders.map((p) => t(`adminPanel.provider.${p}`)).join(", ")
                : t("adminPanel.noneConnected")}
            </option>
          ))}
        </select>
      </Field>

      {!selectedTenantId ? (
        <p className="text-muted">{t("adminPanel.apis.pickTenantHint")}</p>
      ) : !detail ? (
        <p className="text-muted">{t("adminPanel.loading")}</p>
      ) : (
        <div className="grid grid-cols-3">
          {PROVIDERS.map((provider) => (
            <IntegrationCard
              key={provider}
              tenantId={detail.id}
              provider={provider}
              credential={detail.credentials.find((c) => c.provider === provider)}
              onSaved={updateCredential}
            />
          ))}
        </div>
      )}
    </div>
  );
}
