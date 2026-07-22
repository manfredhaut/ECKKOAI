import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Avatar, Video } from "../../types";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";

export function DashboardPage() {
  const { t } = useTranslation();
  const [videos, setVideos] = useState<Video[]>([]);
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get<Video[]>("/videos"), api.get<Avatar[]>("/avatars")])
      .then(([v, a]) => {
        setVideos(v);
        setAvatars(a);
      })
      .finally(() => setLoading(false));
  }, []);

  const thisMonth = new Date();
  const videosThisMonth = videos.filter((v) => {
    const created = new Date(v.created_at);
    return (
      created.getMonth() === thisMonth.getMonth() && created.getFullYear() === thisMonth.getFullYear()
    );
  }).length;

  const queue = videos.filter((v) => v.status === "queued" || v.status === "processing");

  return (
    <>
      <PageHeader
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        action={
          <Link to="/create" className="btn btn-primary">
            {t("dashboard.createVideo")}
          </Link>
        }
      />

      <div className="grid grid-cols-4" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-title">{t("dashboard.creditsRemaining")}</div>
          <div className="stat-value">— </div>
          <div className="stat-sub">{t("dashboard.creditsNotConnected")}</div>
        </div>
        <div className="card">
          <div className="card-title">{t("dashboard.videosThisMonth")}</div>
          <div className="stat-value">{loading ? "…" : videosThisMonth}</div>
          <div className="stat-sub">{t("dashboard.videosThisMonthSub")}</div>
        </div>
        <div className="card">
          <div className="card-title">{t("dashboard.estimatedCost")}</div>
          <div className="stat-value">—</div>
          <div className="stat-sub">{t("dashboard.estimatedCostSub")}</div>
        </div>
        <div className="card">
          <div className="card-title">{t("dashboard.savedAvatars")}</div>
          <div className="stat-value">{loading ? "…" : avatars.length}</div>
          <div className="stat-sub">{t("dashboard.savedAvatarsSub")}</div>
        </div>
      </div>

      <div className="grid grid-cols-2">
        <div className="card">
          <div className="card-title">{t("dashboard.generationQueue")}</div>
          {queue.length === 0 ? (
            <div className="empty-state">{t("dashboard.queueEmpty")}</div>
          ) : (
            <table>
              <tbody>
                {queue.map((v) => (
                  <tr key={v.id}>
                    <td>{v.script.slice(0, 40)}…</td>
                    <td>
                      <StatusPill status={v.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-title">{t("dashboard.recentVideos")}</div>
          {videos.length === 0 ? (
            <div className="empty-state">
              {t("dashboard.videosEmptyPrefix")} <Link to="/create">{t("dashboard.videosEmptyLink")}</Link>
            </div>
          ) : (
            <table>
              <tbody>
                {videos.slice(0, 5).map((v) => (
                  <tr key={v.id}>
                    <td>{v.script.slice(0, 40)}…</td>
                    <td>{v.duration_seconds}s</td>
                    <td>
                      <StatusPill status={v.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-title">{t("dashboard.savedAvatars")}</div>
        {avatars.length === 0 ? (
          <div className="empty-state">
            {t("dashboard.avatarsEmptyPrefix")} <Link to="/create">{t("dashboard.avatarsEmptyLink")}</Link>
          </div>
        ) : (
          <div className="grid grid-cols-4">
            {avatars.map((a) => (
              <div key={a.id} className="card">
                {a.name}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
