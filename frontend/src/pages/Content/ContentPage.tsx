import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Avatar, Video } from "../../types";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { SimulatedBadge } from "../../features/SimulatedBadge";

type Tab = "avatars" | "videos";

export function ContentPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("avatars");
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);

  useEffect(() => {
    api.get<Avatar[]>("/avatars").then(setAvatars);
    api.get<Video[]>("/videos").then(setVideos);
  }, []);

  return (
    <>
      <PageHeader title={t("content.title")} subtitle={t("content.subtitle")} />

      <div className="chip-group" style={{ marginBottom: 20 }}>
        <button
          className={`chip${tab === "avatars" ? " selected" : ""}`}
          onClick={() => setTab("avatars")}
        >
          {t("content.tabAvatars")}
        </button>
        <button
          className={`chip${tab === "videos" ? " selected" : ""}`}
          onClick={() => setTab("videos")}
        >
          {t("content.tabVideos")}
        </button>
      </div>

      {tab === "avatars" && (
        <div className="card">
          {avatars.length === 0 ? (
            <div className="empty-state">
              {t("content.avatarsEmptyPrefix")} <Link to="/create">{t("content.avatarsEmptyLink")}</Link>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("content.colName")}</th>
                  <th>{t("content.colVoice")}</th>
                  <th>{t("content.colCreated")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {avatars.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.voice_id ?? "—"}</td>
                    <td>{new Date(a.created_at).toLocaleDateString()}</td>
                    <td style={{ display: "flex", gap: 8 }}>
                      {a.reference_video_url && (
                        <a
                          className="btn btn-outline"
                          href={`/api/avatars/${a.id}/reference-video/download`}
                          download
                        >
                          {t("content.download")}
                        </a>
                      )}
                      <button className="btn btn-outline">{t("content.retrain")}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "videos" && (
        <div className="card">
          {videos.length === 0 ? (
            <div className="empty-state">
              {t("content.videosEmptyPrefix")} <Link to="/create">{t("content.videosEmptyLink")}</Link>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("content.colScript")}</th>
                  <th>{t("content.colDuration")}</th>
                  <th>{t("content.colStatus")}</th>
                  <th>{t("content.colCreated")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {videos.map((v) => (
                  <tr key={v.id}>
                    <td>
                      {v.script.slice(0, 60)}
                      {/* Marca por linha: usa o fato gravado no vídeo, não o
                          modo atual do ambiente. */}
                      <SimulatedBadge compact simulated={v.simulated} />
                    </td>
                    <td>{v.duration_seconds}s</td>
                    <td>
                      <StatusPill status={v.status} />
                    </td>
                    <td>{new Date(v.created_at).toLocaleDateString()}</td>
                    <td>
                      {v.output_url ? (
                        <a className="btn btn-outline" href={`/api/videos/${v.id}/download`} download>
                          {t("content.download")}
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  );
}
