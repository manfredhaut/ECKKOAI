import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/client";
import { useAdminAuth } from "../../adminAuth/AdminAuthContext";
import type {
  AdminTenantDetail,
  AdminTenantSummary,
  Credential,
  CredentialProviderId,
  StorageProviderId,
  TenantUsage,
} from "../../types";
import { PageHeader } from "../../components/ui/PageHeader";
import { Field } from "../../components/ui/Field";
import { StatusPill } from "../../components/ui/StatusPill";
import { VENDORS_BY_PROVIDER } from "../Settings/providerVendors";
import { AdminApisPanel } from "./AdminApisPanel";
import { AdminPlansPanel } from "./AdminPlansPanel";
import { Copilot } from "../../components/copilot/Copilot";
import { useAdminCopilot } from "../../adminCopilot/AdminCopilotContext";

const STORAGE_OPTIONS: StorageProviderId[] = ["drive", "platform_hosted"];
const PROVIDERS: CredentialProviderId[] = ["avatar", "voice", "script"];

// Usado na lista E no detalhe — os dois mostravam status como binário
// (active ?  connected : error), que pintava "pending" com o vermelho de
// suspenso. `status-awaiting_approval` é o selo que já existe para "espera
// clique humano" (vídeos aguardando aprovação da fal) — mesma semântica.
function tenantStatusPillClass(status: string): string {
  if (status === "active") return "connected";
  if (status === "pending") return "awaiting_approval";
  return "error";
}

function AdminCredentialEditor({
  tenantId,
  provider,
  credential,
  onChange,
}: {
  tenantId: string;
  provider: CredentialProviderId;
  credential: Credential | undefined;
  onChange: (updated: Credential) => void;
}) {
  const { t } = useTranslation();
  const vendors = VENDORS_BY_PROVIDER[provider];
  const [vendor, setVendor] = useState(credential?.vendor ?? vendors[0].id);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (credential?.vendor) setVendor(credential.vendor);
  }, [credential?.vendor]);

  const activeVendor = vendors.find((v) => v.id === vendor) ?? vendors[0];

  async function handleSave() {
    if (!apiKey) return;
    setSaving(true);
    try {
      const updated = await api.put<Credential>(`/admin/tenants/${tenantId}/credentials/${provider}`, {
        apiKey,
        vendor,
      });
      onChange(updated);
      setApiKey("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div className="card-title">{t(`adminPanel.provider.${provider}`)}</div>
        <StatusPill status={credential?.connected ? "connected" : "disconnected"} />
      </div>

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

      <button className="btn btn-primary" onClick={handleSave} disabled={saving || !apiKey}>
        {saving ? t("settings.saving") : t("common.save")}
      </button>
    </div>
  );
}

// Cost is always an ESTIMATE (see types.ts TenantUsage) — the banner is not
// cosmetic, it's the whole point of shipping this before rates are
// verified (see CLAUDE.md / billing plan, Fase 1 review).
/**
 * Consumo de crédito separado em REAL e SIMULADO.
 *
 * Duas tabelas, nunca uma soma. Misturar geração que custou dinheiro com
 * geração de fixture produziria um número que parece medida e não é — e é
 * exatamente o número que alguém usaria para decidir preço.
 */
function AdminTenantCreditUsagePanel({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [data, setData] = useState<TenantCreditUsage | null>(null);

  useEffect(() => {
    setData(null);
    api.get<TenantCreditUsage>(`/admin/tenants/${tenantId}/credit-usage`).then(setData);
  }, [tenantId]);

  if (!data) return null;
  if (data.real.length === 0 && data.simulated.length === 0) return null;

  const block = (title: string, rows: CreditUsageRow[]) => (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{title}</div>
      {rows.length === 0 ? (
        <p className="text-muted" style={{ fontSize: 13 }}>—</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
          {rows.map((r) => (
            <li key={r.creditType}>
              {r.creditType}: {r.consumed}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title">
        {t("simulated.ledgerReal")} / {t("simulated.ledgerSimulated")}
      </div>
      {block(t("simulated.ledgerReal"), data.real)}
      {block(t("simulated.ledgerSimulated"), data.simulated)}
      <p className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
        {t("simulated.ledgerWarning")}
      </p>
    </div>
  );
}

interface CreditUsageRow {
  creditType: string;
  consumed: number;
  entries: number;
}

interface TenantCreditUsage {
  real: CreditUsageRow[];
  simulated: CreditUsageRow[];
  providerMode: "fixture" | "live";
}

function AdminTenantUsagePanel({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<TenantUsage | null>(null);

  useEffect(() => {
    setUsage(null);
    api.get<TenantUsage>(`/admin/tenants/${tenantId}/usage`).then(setUsage);
  }, [tenantId]);

  if (!usage) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title">{t("adminPanel.usage.title")}</div>
      {usage.breakdown.length === 0 ? (
        <p className="text-muted">{t("adminPanel.usage.empty")}</p>
      ) : (
        <>
          <p className="text-muted" style={{ fontSize: 12 }}>
            {usage.costBasis}
          </p>
          <table>
            <thead>
              <tr>
                <th>{t("adminPanel.usage.colProvider")}</th>
                <th>{t("adminPanel.usage.colVendor")}</th>
                <th>{t("adminPanel.usage.colUnitType")}</th>
                <th>{t("adminPanel.usage.colUnits")}</th>
                <th>{t("adminPanel.usage.colAttempts")}</th>
                <th>{t("adminPanel.usage.colCost")}</th>
              </tr>
            </thead>
            <tbody>
              {usage.breakdown.map((row) => (
                <tr key={`${row.provider}-${row.vendor}-${row.unitType}`}>
                  <td>{t(`adminPanel.provider.${row.provider}`)}</td>
                  <td>{row.vendor}</td>
                  <td>{t(`adminPanel.unitType.${row.unitType}`)}</td>
                  <td>{row.totalUnits}</td>
                  <td>
                    {row.attempts}
                    {row.failures > 0 && (
                      <span className="text-muted"> ({t("adminPanel.usage.failures", { n: row.failures })})</span>
                    )}
                  </td>
                  {/* AUSÊNCIA por extenso, nunca 0,00: um zero aqui seria lido
                      como "de graça", e o que se quer dizer é "sem medição". */}
                  <td title={row.costUnknownReason ?? undefined}>
                    {row.costUsd != null
                      ? `US$ ${row.costUsd.toFixed(4)}`
                      : t("adminPanel.usage.noMeasurement")}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={5}>
                  <strong>{t("adminPanel.usage.total")}</strong>
                  {usage.linesWithoutCost > 0 && (
                    <span className="text-muted">
                      {" "}
                      {t("adminPanel.usage.excluded", { n: usage.linesWithoutCost })}
                    </span>
                  )}
                </td>
                <td>
                  <strong>US$ {usage.totalCostUsd.toFixed(4)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

function AdminTenantDetailPanel({
  tenantId,
  onBack,
}: {
  tenantId: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<AdminTenantDetail | null>(null);
  const [savingStorage, setSavingStorage] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  function refresh() {
    api.get<AdminTenantDetail>(`/admin/tenants/${tenantId}`).then(setDetail);
  }

  useEffect(() => {
    setDetail(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  function updateCredential(updated: Credential) {
    setDetail((prev) =>
      prev ? { ...prev, credentials: prev.credentials.map((c) => (c.provider === updated.provider ? updated : c)) } : prev,
    );
  }

  // Três estados, não dois. O toggle binário anterior ("suspended" ? active
  // : suspended) tratava "pending" como "não suspenso" e mandava SUSPENDER
  // um tenant aguardando aprovação — o botão de aprovar teria banido a
  // conta que deveria liberar. `next` some do domínio quando não há ação
  // válida (não existe hoje, mas documenta a intenção: só active/suspended
  // são setáveis por aqui, pending só nasce no signup).
  function nextTenantStatus(status: string): "active" | "suspended" | null {
    if (status === "pending") return "active";
    if (status === "suspended") return "active";
    return "suspended";
  }

  async function handleStatusToggle() {
    if (!detail || savingStatus) return;
    const next = nextTenantStatus(detail.status);
    if (!next) return;
    setSavingStatus(true);
    try {
      await api.put(`/admin/tenants/${tenantId}/status`, { status: next });
      setDetail((prev) => (prev ? { ...prev, status: next } : prev));
    } finally {
      setSavingStatus(false);
    }
  }

  async function handleStorageSelect(next: StorageProviderId) {
    if (!detail || next === detail.storageProvider || savingStorage) return;
    setSavingStorage(true);
    try {
      await api.put(`/admin/tenants/${tenantId}/storage-provider`, { provider: next });
      setDetail((prev) => (prev ? { ...prev, storageProvider: next } : prev));
    } finally {
      setSavingStorage(false);
    }
  }

  if (!detail) return <p className="text-muted">{t("adminPanel.loading")}</p>;

  const find = (provider: CredentialProviderId) => detail.credentials.find((c) => c.provider === provider);

  return (
    <div>
      <button className="btn btn-outline" onClick={onBack} style={{ marginBottom: 16 }}>
        {t("adminPanel.backToList")}
      </button>

      <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
        <div>
          <h2>{detail.name}</h2>
          <p className="text-muted" style={{ fontSize: 13 }}>
            {detail.slug} · {t(`adminPanel.plan.${detail.planId}`, detail.planId)}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className={`status-pill status-${tenantStatusPillClass(detail.status)}`}>
            {t(`adminPanel.tenantStatus.${detail.status}`)}
          </span>
          <button
            className="btn btn-outline"
            onClick={handleStatusToggle}
            disabled={savingStatus}
            title={detail.status === "pending" ? t("adminPanel.approveTooltip") : undefined}
          >
            {detail.status === "pending"
              ? t("adminPanel.approve")
              : detail.status === "suspended"
                ? t("adminPanel.reactivate")
                : t("adminPanel.suspend")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3">
        {PROVIDERS.map((provider) => (
          <AdminCredentialEditor
            key={provider}
            tenantId={tenantId}
            provider={provider}
            credential={find(provider)}
            onChange={updateCredential}
          />
        ))}
      </div>

      <div className="section-heading">
        <h2>{t("settings.storageProviderTitle")}</h2>
      </div>
      <div className="chip-group">
        {STORAGE_OPTIONS.map((option) => (
          <button
            key={option}
            className={`chip${detail.storageProvider === option ? " selected" : ""}`}
            onClick={() => handleStorageSelect(option)}
            disabled={savingStorage}
          >
            {t(`settings.storageProviderOptions.${option}`)}
          </button>
        ))}
      </div>

      <AdminTenantUsagePanel tenantId={tenantId} />
      <AdminTenantCreditUsagePanel tenantId={tenantId} />
    </div>
  );
}

type AdminView = "tenants" | "apis" | "plans" | "features";

// Same shape as AppShell's navItems (tenant app), except the admin panel
// swaps panels in place instead of routing — so these are buttons driving
// `view`, not NavLinks. Styling is the shared .nav-link/.active pair.
const NAV_ITEMS: { id: AdminView; labelKey: string }[] = [
  { id: "tenants", labelKey: "adminPanel.navTenants" },
  { id: "apis", labelKey: "adminPanel.navApis" },
  { id: "plans", labelKey: "adminPanel.navPlans" },
  { id: "features", labelKey: "adminPanel.navFeatures" },
];

export function AdminPanelPage() {
  const { t } = useTranslation();
  const { admin, logout } = useAdminAuth();
  const adminCopilot = useAdminCopilot();
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<AdminTenantSummary[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [view, setView] = useState<AdminView>("tenants");

  useEffect(() => {
    api.get<AdminTenantSummary[]>("/admin/tenants").then(setTenants);
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/admin/login", { replace: true });
  }

  return (
    <div className="app-shell app-shell--admin">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo-chip">
            <img src="/brand/logo-eckko-transparent.png" alt={t("common.appName")} />
          </span>
        </div>

        <nav className="nav-links">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-link${view === item.id ? " active" : ""}`}
              aria-current={view === item.id ? "page" : undefined}
              onClick={() => setView(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </nav>

        <div style={{ marginTop: "auto" }}>
          {admin && (
            <div className="text-muted" style={{ fontSize: 12, padding: "0 8px 8px" }}>
              {admin.name} · {admin.email}
            </div>
          )}
          <button className="btn btn-ghost" style={{ width: "100%" }} onClick={handleLogout}>
            {t("common.logOut")}
          </button>
        </div>
      </aside>

      <div className="content-column">
        <main className="main-content">
          <PageHeader
            title={t("adminPanel.title")}
            subtitle={t("adminPanel.subtitle", { name: admin?.name ?? "" })}
            action={<Copilot value={adminCopilot} />}
          />

          {view === "apis" ? (
        <AdminApisPanel tenants={tenants} />
      ) : view === "plans" ? (
        <AdminPlansPanel />
      ) : view === "features" ? (
        <AdminFeatureFlagsPanel />
      ) : selectedTenantId ? (
        <AdminTenantDetailPanel tenantId={selectedTenantId} onBack={() => setSelectedTenantId(null)} />
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("adminPanel.colTenant")}</th>
              <th>{t("adminPanel.colPlan")}</th>
              <th>{t("adminPanel.colStatus")}</th>
              <th>{t("adminPanel.colConnected")}</th>
              <th>{t("adminPanel.colCreated")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => (
              <tr key={tenant.id}>
                <td>
                  {tenant.name}
                  <div className="text-muted" style={{ fontSize: 11 }}>
                    {tenant.slug}
                  </div>
                </td>
                <td>{t(`adminPanel.plan.${tenant.planId}`, tenant.planId)}</td>
                <td>
                  <span className={`status-pill status-${tenantStatusPillClass(tenant.status)}`}>
                    {t(`adminPanel.tenantStatus.${tenant.status}`)}
                  </span>
                </td>
                <td>
                  {tenant.connectedProviders.length > 0
                    ? tenant.connectedProviders.map((p) => t(`adminPanel.provider.${p}`)).join(", ")
                    : t("adminPanel.noneConnected")}
                </td>
                <td>{new Date(tenant.createdAt).toLocaleDateString()}</td>
                <td>
                  <button className="btn btn-outline" onClick={() => setSelectedTenantId(tenant.id)}>
                    {t("adminPanel.manage")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
          )}
        </main>
      </div>
    </div>
  );
}

/**
 * Feature flags: ligar e desligar recurso sem publicar versão nova.
 *
 * O motivo NÃO é editável aqui de propósito. Ele é texto de produto que
 * viaja com o código (services/featureFlags.ts) e aparece na tela do
 * cliente; deixá-lo editável em runtime convidaria a um texto escrito às
 * pressas para justificar um recurso que acabou de ser desligado. Trocar o
 * motivo é uma mudança de produto, e passa por commit.
 */
function AdminFeatureFlagsPanel() {
  const { t } = useTranslation();
  const [flags, setFlags] = useState<AdminFeatureFlag[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ flags: AdminFeatureFlag[] }>("/admin/feature-flags");
      setFlags(res.flags);
    } catch {
      setError(t("adminPanel.loadError"));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(key: string, enabled: boolean) {
    setSaving(key);
    setError(null);
    try {
      await api.put(`/admin/feature-flags/${key}`, { enabled });
      await load();
    } catch {
      setError(t("adminPanel.saveError"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{t("featureFlags.adminTitle")}</h2>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
        {t("featureFlags.adminDesc")}
      </p>

      {error && <p className="alert-error">{error}</p>}

      {flags === null ? (
        <p className="text-muted">{t("adminPanel.loading")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("featureFlags.colFeature")}</th>
              <th>{t("featureFlags.colState")}</th>
              <th>{t("featureFlags.colReason")}</th>
            </tr>
          </thead>
          <tbody>
            {flags.map((flag) => (
              <tr key={flag.key}>
                <td>{flag.label}</td>
                <td>
                  <button
                    type="button"
                    className={flag.enabled ? "btn btn-primary" : "btn btn-outline"}
                    disabled={saving === flag.key}
                    onClick={() => void toggle(flag.key, !flag.enabled)}
                  >
                    {flag.enabled ? t("featureFlags.on") : t("featureFlags.off")}
                  </button>
                </td>
                <td className="text-muted">{flag.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

interface AdminFeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
  reason: string;
}
