import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../../auth/AuthContext";
import { Header } from "./Header";

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { tenant, user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { to: "/subscription", label: t("nav.mySubscription") },
    { to: "/create", label: t("nav.createVideo") },
    { to: "/content", label: t("nav.content") },
    { to: "/rag", label: t("nav.rag") },
    { to: "/", label: t("nav.dashboard"), end: true },
  ];

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-logo-chip">
            <img src="/brand/logo-eckko-transparent.png" alt={t("common.appName")} />
          </span>
        </div>
        <nav className="nav-links">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ marginTop: "auto" }}>
          {tenant && (
            <div className="text-muted" style={{ fontSize: 12, padding: "0 8px 8px" }}>
              {tenant.name} · {user?.email}
            </div>
          )}
          <button className="btn btn-ghost" style={{ width: "100%" }} onClick={handleLogout}>
            {t("common.logOut")}
          </button>
        </div>
      </aside>
      <div className="content-column">
        <Header />
        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
