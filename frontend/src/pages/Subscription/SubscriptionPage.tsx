import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Subscription } from "../../types";
import { BASE_DOMAIN } from "../../publicConfig";
import { useAuth } from "../../auth/AuthContext";
import { PageHeader } from "../../components/ui/PageHeader";
import { Field } from "../../components/ui/Field";

export function SubscriptionPage() {
  const { t } = useTranslation();
  const { refreshSession } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [savingCard, setSavingCard] = useState(false);
  const [editingCard, setEditingCard] = useState(false);

  function refresh() {
    api.get<Subscription>("/subscription").then((s) => {
      setSubscription(s);
      setCompanyName(s.companyName);
      setWhatsapp(s.whatsapp ?? "");
      setAddress(s.address ?? "");
      setCity(s.city ?? "");
      setState(s.state ?? "");
    });
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleSaveProfile() {
    if (!companyName.trim() || !whatsapp.trim()) return;
    setSavingProfile(true);
    try {
      await api.put("/subscription/profile", {
        companyName,
        whatsapp,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
      });
      refresh();
      // O primeiro save pode ter recalculado o slug (travado agora). Sem
      // isto, o AuthContext continuaria com o slug VELHO — TenantSlugGate
      // não veria motivo para corrigir a URL, e a barra do navegador
      // ficaria mostrando um endereço que o backend já abandonou.
      await refreshSession();
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePlan(planId: string) {
    setChangingPlan(planId);
    try {
      const result = await api.post<{ checkoutUrl: string | null }>("/subscription/checkout", { planId });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
        return;
      }
      refresh();
    } finally {
      setChangingPlan(null);
    }
  }

  async function handleSaveCard() {
    if (!cardNumber.trim()) return;
    setSavingCard(true);
    try {
      await api.put("/subscription/payment-method", { cardNumber });
      setCardNumber("");
      setEditingCard(false);
      refresh();
    } finally {
      setSavingCard(false);
    }
  }

  if (!subscription) return null;

  const checkoutStatus = new URLSearchParams(window.location.search).get("checkout");

  const usagePercent = Math.min(
    100,
    (subscription.usage.videosThisMonth / subscription.usage.limit) * 100,
  );

  return (
    <>
      <PageHeader title={t("subscription.title")} subtitle={t("subscription.subtitle")} />

      {checkoutStatus === "success" && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--color-primary)" }}>
          {t("subscription.checkoutSuccess")}
        </div>
      )}
      {checkoutStatus === "cancelled" && (
        <div className="card" style={{ marginBottom: 16 }}>
          {t("subscription.checkoutCancelled")}
        </div>
      )}

      {!subscription.profileComplete && (
        <div className="card" style={{ marginBottom: 16, borderColor: "var(--color-primary)" }}>
          <div className="card-title">{t("subscription.completeProfileTitle")}</div>
          <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
            {t("subscription.completeProfileDesc")}
          </p>
          <div style={{ maxWidth: 360 }}>
            <Field label={t("subscription.companyNameLabel")}>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
            </Field>
            <Field label={t("subscription.whatsappLabel")}>
              <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
            </Field>
            <Field label={t("subscription.addressLabel")}>
              <input value={address} onChange={(e) => setAddress(e.target.value)} />
            </Field>
            <Field label={t("subscription.cityLabel")}>
              <input value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field label={t("subscription.stateLabel")}>
              <input value={state} onChange={(e) => setState(e.target.value)} />
            </Field>
            {/* O slug ainda não existe até o primeiro save — mostrar a URL
                antes disso seria inventar um endereço que pode não ser o
                final (recalculado a partir do nome só no clique). */}
            <p className="text-muted" style={{ fontSize: 12, marginBottom: 12 }}>
              {t("subscription.urlWillBeShown")}
            </p>
            <button
              className="btn btn-primary"
              onClick={handleSaveProfile}
              disabled={savingProfile || !companyName.trim() || !whatsapp.trim()}
            >
              {savingProfile ? t("subscription.saving") : t("common.save")}
            </button>
          </div>
        </div>
      )}

      {/* Confirmação do endereço recebido — visível sempre que o perfil já
          está completo (não só no instante do save), porque é útil toda
          vez que a pessoa reabre esta tela para conferir o link. */}
      {subscription.profileComplete && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-title">{t("subscription.yourUrlTitle")}</div>
          <p style={{ fontSize: 14, marginTop: 4 }}>
            <strong>
              {BASE_DOMAIN}/{subscription.slug}
            </strong>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2" style={{ marginBottom: 16 }}>
        <div className="card">
          <div className="card-title">{t("subscription.currentPlanTitle")}</div>
          <div className="stat-value">{subscription.plan.name}</div>
          <div className="stat-sub" style={{ marginBottom: 12 }}>
            {t("subscription.usageLabel", {
              used: subscription.usage.videosThisMonth,
              limit: subscription.usage.limit,
            })}
          </div>
          <div style={{ height: 8, background: "var(--color-border)", borderRadius: 999 }}>
            <div
              style={{
                width: `${usagePercent}%`,
                height: "100%",
                background: "var(--color-primary)",
                borderRadius: 999,
              }}
            />
          </div>
        </div>

        <div className="card">
          <div className="card-title">{t("subscription.paymentMethodTitle")}</div>
          {subscription.paymentMethodMasked && !editingCard ? (
            <p style={{ marginBottom: 12 }}>{subscription.paymentMethodMasked}</p>
          ) : (
            <p className="text-muted" style={{ fontSize: 13, marginBottom: 12 }}>
              {t("subscription.noPaymentMethod")}
            </p>
          )}
          {editingCard ? (
            <div style={{ display: "flex", gap: 8 }}>
              <input
                placeholder={t("subscription.cardNumberPlaceholder")}
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
              />
              <button
                className="btn btn-primary"
                onClick={handleSaveCard}
                disabled={savingCard || !cardNumber.trim()}
              >
                {savingCard ? t("subscription.saving") : t("common.save")}
              </button>
            </div>
          ) : (
            <button className="btn btn-outline" onClick={() => setEditingCard(true)}>
              {t("subscription.updateCard")}
            </button>
          )}
        </div>
      </div>

      <div className="section-heading">
        <h2>{t("subscription.plansTitle")}</h2>
      </div>
      <div className="grid grid-cols-3" style={{ marginBottom: 16 }}>
        {subscription.availablePlans.map((plan) => {
          const isCurrent = plan.id === subscription.plan.id;
          return (
            <div
              key={plan.id}
              className="card"
              style={{ borderColor: isCurrent ? "var(--color-primary)" : undefined }}
            >
              <div className="card-title">{plan.name}</div>
              <div className="stat-value">
                {plan.priceCents === 0 ? t("subscription.free") : `$${(plan.priceCents / 100).toFixed(2)}`}
              </div>
              <ul style={{ margin: "12px 0", paddingLeft: 18, fontSize: 13 }}>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <button
                className={`btn ${isCurrent ? "btn-outline" : "btn-primary"}`}
                disabled={isCurrent || changingPlan === plan.id}
                onClick={() => handleChangePlan(plan.id)}
              >
                {isCurrent
                  ? t("subscription.currentPlanBadge")
                  : changingPlan === plan.id
                    ? t("subscription.saving")
                    : t("subscription.selectPlan")}
              </button>
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="card-title">{t("subscription.invoicesTitle")}</div>
        <div className="empty-state">{t("subscription.invoicesEmpty")}</div>
      </div>
    </>
  );
}
