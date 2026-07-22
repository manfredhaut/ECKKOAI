import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import { setLanguage, type Language } from "../../i18n";
import { useTheme, type ThemeMode } from "../../theme/ThemeContext";
import type { Notification } from "../../types";
import { Copilot } from "../copilot/Copilot";
import { useCopilot } from "../../copilot/CopilotContext";

const LANGUAGES: { value: Language; label: string; tooltipKey: string }[] = [
  { value: "pt-BR", label: "PT-BR", tooltipKey: "header.languagePtBR" },
  { value: "en", label: "EN", tooltipKey: "header.languageEn" },
];

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="4" />
      <path
        strokeLinecap="round"
        d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="13" rx="1.5" />
      <path strokeLinecap="round" d="M8 21h8M12 17v4" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path strokeLinecap="round" d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6 2h12M6 22h12M6 2c0 6 12 6 12 10s-12 4-12 10M18 2c0 6-12 6-12 10s12 4 12 10"
      />
    </svg>
  );
}

const THEME_ICONS: { value: ThemeMode; icon: ReactNode }[] = [
  { value: "light", icon: <SunIcon /> },
  { value: "dark", icon: <MoonIcon /> },
  { value: "system", icon: <MonitorIcon /> },
];

interface ProcessingJob {
  id: string;
  type: "video" | "document";
  label: string;
  status: string;
  created_at: string;
}

interface Summary {
  unreadCount: number;
  processingJobs: number;
}

export function Header() {
  const { t, i18n } = useTranslation();
  const { mode, setMode } = useTheme();
  const copilot = useCopilot();
  const [summary, setSummary] = useState<Summary>({ unreadCount: 0, processingJobs: 0 });
  const [openDropdown, setOpenDropdown] = useState<"notifications" | "jobs" | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function refreshSummary() {
      api.get<Summary>("/notifications/summary").then(setSummary).catch(() => {});
    }
    refreshSummary();
    const interval = setInterval(refreshSummary, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!openDropdown) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [openDropdown]);

  async function toggleNotifications() {
    if (openDropdown === "notifications") {
      setOpenDropdown(null);
      return;
    }
    setOpenDropdown("notifications");
    const list = await api.get<Notification[]>("/notifications");
    setNotifications(list);
    await api.post("/notifications/read-all");
    setSummary((s) => ({ ...s, unreadCount: 0 }));
  }

  async function toggleJobs() {
    if (openDropdown === "jobs") {
      setOpenDropdown(null);
      return;
    }
    setOpenDropdown("jobs");
    const list = await api.get<ProcessingJob[]>("/jobs/processing");
    setJobs(list);
  }

  return (
    <div className="header-bar" ref={containerRef}>
      <div className="header-toggle-group">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.value}
            className={`icon-pill${i18n.language === lang.value ? " selected" : ""}`}
            title={t(lang.tooltipKey)}
            onClick={() => setLanguage(lang.value)}
          >
            {lang.label}
          </button>
        ))}
      </div>

      <div className="header-toggle-group">
        {THEME_ICONS.map((theme) => (
          <button
            key={theme.value}
            className={`icon-btn${mode === theme.value ? " selected" : ""}`}
            title={t(`header.theme.${theme.value}`)}
            onClick={() => setMode(theme.value)}
          >
            {theme.icon}
          </button>
        ))}
      </div>

      <div className="header-icon-wrap">
        <button className="icon-btn" title={t("header.jobsTooltip")} onClick={toggleJobs}>
          <HourglassIcon />
          {summary.processingJobs > 0 && <span className="icon-badge">{summary.processingJobs}</span>}
        </button>
        {openDropdown === "jobs" && (
          <div className="dropdown-panel">
            <div className="dropdown-title">{t("header.jobs")}</div>
            {jobs.length === 0 ? (
              <p className="text-muted dropdown-empty">{t("header.jobsEmpty")}</p>
            ) : (
              jobs.map((job) => (
                <div key={job.id} className="dropdown-item">
                  <span>{job.label}</span>
                  <span className="text-muted" style={{ fontSize: 11 }}>
                    {t(`common.status.${job.status}`)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div className="header-icon-wrap">
        <button className="icon-btn" title={t("header.notificationsTooltip")} onClick={toggleNotifications}>
          <BellIcon />
          {summary.unreadCount > 0 && <span className="icon-badge">{summary.unreadCount}</span>}
        </button>
        {openDropdown === "notifications" && (
          <div className="dropdown-panel">
            <div className="dropdown-title">{t("header.notifications")}</div>
            {notifications.length === 0 ? (
              <p className="text-muted dropdown-empty">{t("header.notificationsEmpty")}</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className="dropdown-item">
                  <span>{n.message}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <Copilot value={copilot} />
    </div>
  );
}
