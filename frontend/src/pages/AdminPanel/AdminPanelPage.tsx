import { useEffect, useState } from "react";
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
import { AdminCostRatesPanel } from "./AdminCostRatesPanel";
import { AdminPlansPanel } from "./AdminPlansPanel";
import { Copilot } from "../../components/copilot/Copilot";
import { useAdminCopilot } from "../../adminCopilot/AdminCopilotContext";

const STORAGE_OPTIONS: StorageProviderId[] = ["drive", "platform_hosted"];
const PROVIDERS: CredentialProviderId[] = ["avatar", "voice", "script"];

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
          <p className={usage.allRatesVerified ? "text-muted" : "text-muted"} style={{ fontSize: 13 }}>
            {usage.allRatesVerified ? t("adminPanel.usage.verifiedBanner") : t("adminPanel.usage.estimatedBanner")}
          </p>
          <table>
            <thead>
              <tr>
                <th>{t("adminPanel.usage.colProvider")}</th>
                <th>{t("adminPanel.usage.colVendor")}</th>
                <th>{t("adminPanel.usage.colUnitType")}</th>
                <th>{t("adminPanel.usage.colUnits")}</th>
                <th>{t("adminPanel.usage.colCost")}</th>
                <th>{t("adminPanel.usage.colVerified")}</th>
              </tr>
            </thead>
            <tbody>
              {usage.breakdown.map((row) => (
                <tr key={`${row.provider}-${row.vendor}-${row.unitType}`}>
                  <td>{t(`adminPanel.provider.${row.provider}`)}</td>
                  <td>{row.vendor}</td>
                  <td>{t(`adminPanel.unitType.${row.unitType}`)}</td>
                  <td>{row.totalUnits}</td>
                  <td>{(row.totalEstimatedCostCents / 100).toFixed(2)}</td>
                  <td>
                    <span className={`status-pill status-${row.verified ? "connected" : "disconnected"}`}>
                      {row.verified ? t("common.yes") : t("common.no")}
                    </span>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={4}>
                  <strong>{t("adminPanel.usage.total")}</strong>
                </td>
                <td colSpan={2}>
                  <strong>{(usage.totalEstimatedCostCents / 100).toFixed(2)}</strong>
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

  async function handleStatusToggle() {
    if (!detail || savingStatus) return;
    const next = detail.status === "suspended" ? "active" : "suspended";
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
          <span className={`status-pill status-${detail.status === "active" ? "connected" : "error"}`}>
            {t(`adminPanel.tenantStatus.${detail.status}`)}
          </span>
          <button className="btn btn-outline" onClick={handleStatusToggle} disabled={savingStatus}>
            {detail.status === "suspended" ? t("adminPanel.reactivate") : t("adminPanel.suspend")}
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
    </div>
  );
}

type AdminView = "tenants" | "apis" | "costRates" | "plans";

// Same shape as AppShell's navItems (tenant app), except the admin panel
// swaps panels in place instead of routing — so these are buttons driving
// `view`, not NavLinks. Styling is the shared .nav-link/.active pair.
const NAV_ITEMS: { id: AdminView; labelKey: string }[] = [
  { id: "tenants", labelKey: "adminPanel.navTenants" },
  { id: "apis", labelKey: "adminPanel.navApis" },
  { id: "costRates", labelKey: "adminPanel.navCostRates" },
  { id: "plans", labelKey: "adminPanel.navPlans" },
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
      ) : view === "costRates" ? (
        <AdminCostRatesPanel />
      ) : view === "plans" ? (
        <AdminPlansPanel />
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
                  <span className={`status-pill status-${tenant.status === "active" ? "connected" : "error"}`}>
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
