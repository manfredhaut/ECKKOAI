import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Plan } from "../../types";
import { BASE_DOMAIN, WHATSAPP_NUMBER } from "../../publicConfig";
import { PublicCopilotWidget } from "./PublicCopilotWidget";
import { AdminLoginModal } from "./AdminLoginModal";

// Slug do tenant de demonstração. O login de cliente na landing NÃO posta do
// domínio raiz de propósito: lá o lookup por e-mail em POST /login é feito sem
// escopo de tenant, então um mesmo e-mail em mais de um tenant resolveria de
// forma ambígua. Mandar o visitante para o subdomínio faz o
// resolveTenantFromHost escopar a busca — sem tocar em login.ts.
const DEMO_TENANT_SLUG = "dev-c77a5b";

function demoTenantLoginUrl(): string {
  const { protocol, port } = window.location;
  return `${protocol}//${DEMO_TENANT_SLUG}.${BASE_DOMAIN}${port ? `:${port}` : ""}/login`;
}

interface Step {
  title: string;
  desc: string;
}

interface Feature {
  title: string;
  desc: string;
  badge?: string;
}

interface FaqItem {
  q: string;
  a: string;
}

export function LandingPage() {
  const { t } = useTranslation();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [adminModalOpen, setAdminModalOpen] = useState(false);

  useEffect(() => {
    api.get<Plan[]>("/public/plans").then(setPlans);
  }, []);

  const steps = t("landing.howItWorks.steps", { returnObjects: true }) as Step[];
  const features = t("landing.features.items", { returnObjects: true }) as Feature[];
  const faqItems = t("landing.faq.items", { returnObjects: true }) as FaqItem[];

  const whatsappHref = WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(t("landing.footer.whatsappMessage"))}`
    : null;

  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="brand">
          <span className="brand-logo-chip brand-logo-chip--nav">
            <img src="/brand/logo-eckko-transparent.png" alt={t("common.appName")} />
          </span>
        </div>
        <nav className="landing-nav-links">
          <a href="#how-it-works">{t("landing.nav.howItWorks")}</a>
          <a href="#features">{t("landing.nav.features")}</a>
          <a href="#pricing">{t("landing.nav.pricing")}</a>
          <a href="#faq">{t("landing.nav.faq")}</a>
        </nav>
        <div style={{ display: "flex", gap: 8 }}>
          {/* Navegação real (não <Link>): cruza para o subdomínio do tenant. */}
          <a href={demoTenantLoginUrl()} className="btn btn-outline">
            {t("landing.nav.login")}
          </a>
          <Link to="/signup" className="btn btn-primary">
            {t("landing.nav.cta")}
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <h1>{t("landing.hero.headline")}</h1>
        <p>{t("landing.hero.subtitle")}</p>
        <div className="landing-hero-actions">
          <Link to="/signup" className="btn btn-primary landing-hero-cta">
            {t("landing.hero.cta")}
          </Link>
          <a href={demoTenantLoginUrl()} className="btn btn-outline landing-hero-cta">
            {t("landing.nav.login")}
          </a>
        </div>
        <span className="landing-demo-chip">{t("landing.hero.demoChip", { slug: DEMO_TENANT_SLUG })}</span>
      </section>

      <section className="landing-section landing-section-narrow">
        <h2>{t("landing.problemSolution.title")}</h2>
        <p className="text-muted">{t("landing.problemSolution.body")}</p>
      </section>

      <section id="how-it-works" className="landing-section">
        <div className="section-heading">
          <h2>{t("landing.howItWorks.title")}</h2>
        </div>
        <div className="grid grid-cols-4">
          {steps.map((step, i) => (
            <div key={step.title} className="card">
              <div className="landing-step-number">{i + 1}</div>
              <div className="card-title" style={{ textTransform: "none", fontSize: 15, color: "var(--color-text)" }}>
                {step.title}
              </div>
              <p className="text-muted" style={{ fontSize: 13 }}>
                {step.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="landing-section">
        <div className="section-heading">
          <h2>{t("landing.features.title")}</h2>
        </div>
        <div className="grid grid-cols-3">
          {features.map((feature) => (
            <div key={feature.title} className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                <div className="card-title" style={{ textTransform: "none", fontSize: 15, color: "var(--color-text)" }}>
                  {feature.title}
                </div>
                {feature.badge && <span className="badge-soft">{feature.badge}</span>}
              </div>
              <p className="text-muted" style={{ fontSize: 13 }}>
                {feature.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" className="landing-section">
        <div className="section-heading">
          <h2>{t("landing.pricing.title")}</h2>
        </div>
        <p className="text-muted" style={{ marginBottom: 16 }}>
          {t("landing.pricing.subtitle")}
        </p>
        {!plans ? (
          <p className="text-muted">{t("landing.pricing.loading")}</p>
        ) : (
          <div className="grid grid-cols-3">
            {plans.map((plan) => (
              <div key={plan.id} className="card">
                <div className="card-title">{plan.name}</div>
                <div className="stat-value">
                  {plan.priceCents === 0
                    ? t("landing.pricing.free")
                    : `R$ ${(plan.priceCents / 100).toFixed(2)}${t("landing.pricing.perMonth")}`}
                </div>
                <ul style={{ margin: "12px 0", paddingLeft: 18, fontSize: 13 }}>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <p className="text-muted" style={{ fontSize: 12, marginBottom: 16 }}>
                  {plan.id === "free" ? t("landing.pricing.storageDrive") : t("landing.pricing.storageHosted")}
                </p>
                <Link to="/signup" className="btn btn-primary" style={{ width: "100%" }}>
                  {t("landing.pricing.cta")}
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="faq" className="landing-section landing-section-narrow">
        <div className="section-heading">
          <h2>{t("landing.faq.title")}</h2>
        </div>
        <div className="landing-faq-list">
          {faqItems.map((item) => (
            <div key={item.q} className="card">
              <div className="card-title" style={{ textTransform: "none", fontSize: 15, color: "var(--color-text)" }}>
                {item.q}
              </div>
              <p className="text-muted" style={{ fontSize: 13 }}>
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section landing-section-narrow landing-final-cta">
        <h2>{t("landing.finalCta.title")}</h2>
        <p className="text-muted">{t("landing.finalCta.subtitle")}</p>
        <Link to="/signup" className="btn btn-primary landing-hero-cta">
          {t("landing.finalCta.cta")}
        </Link>
      </section>

      <footer className="landing-footer">
        <div className="brand">
          <span className="brand-logo-chip brand-logo-chip--footer">
            <img src="/brand/logo-eckko-transparent.png" alt={t("common.appName")} />
          </span>
        </div>
        {whatsappHref && (
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="landing-whatsapp-link">
            {t("landing.footer.contactWhatsapp")}
          </a>
        )}
        <span className="text-muted" style={{ fontSize: 12 }}>
          © {new Date().getFullYear()} {t("common.appName")}. {t("landing.footer.rights")}
        </span>
        {/* Discreto de propósito: é a porta da equipe interna, não do cliente. */}
        <button type="button" className="landing-admin-link" onClick={() => setAdminModalOpen(true)}>
          {t("landing.adminAccess.link")}
        </button>
      </footer>

      {adminModalOpen && <AdminLoginModal onClose={() => setAdminModalOpen(false)} />}

      <PublicCopilotWidget />
    </div>
  );
}
