import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Avatar, Video } from "../../types";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { SimulatedBadge } from "../../features/SimulatedBadge";
import { VideoPlayer } from "../../features/VideoPlayer";

type Tab = "avatars" | "videos";

export function ContentPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("avatars");
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    api.get<Avatar[]>("/avatars").then(setAvatars);
    api.get<Video[]>("/videos").then(setVideos);
  }, []);

  const playingVideo = videos.find((v) => v.id === playing) ?? null;

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
              {t("content.avatarsEmptyPrefix")} <Link to="create">{t("content.avatarsEmptyLink")}</Link>
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
                    {/* NUNCA o id cru do fornecedor. `5Qfze6o4PjDKPpAI4Ux4` não
                        diz nada a quem usa o produto, e expõe um identificador
                        interno do ElevenLabs numa tela de cliente. O que importa
                        ali é binário — a voz foi clonada ou não. */}
                    <td>{a.voice_id ? t("content.voiceCloned") : "—"}</td>
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
              {t("content.videosEmptyPrefix")} <Link to="create">{t("content.videosEmptyLink")}</Link>
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
                  <tr
                    key={v.id}
                    onClick={() => v.output_url && setPlaying(playing === v.id ? null : v.id)}
                    style={{ cursor: v.output_url ? "pointer" : "default" }}
                    className={playing === v.id ? "row-selected" : undefined}
                  >
                    <td>
                      {/* Reticências e um espaço antes do badge: sem os dois, o
                          corte colava na marca e saía "…em modo fixture, seSIMULADO". */}
                      {v.script.length > 60 ? `${v.script.slice(0, 60)}… ` : `${v.script} `}
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
                        <button
                          className="btn btn-outline"
                          onClick={(e) => {
                            // Sem isto o clique sobe para a linha e alterna o
                            // player duas vezes — abrindo e fechando na hora.
                            e.stopPropagation();
                            setPlaying(playing === v.id ? null : v.id);
                          }}
                        >
                          {playing === v.id ? t("content.hideVideo") : t("content.watch")}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Player DENTRO do produto — o objetivo do bloco 5D. Fica abaixo da
              tabela, e não num modal, porque a lista continua visível: dá para
              comparar dois vídeos alternando entre as linhas sem fechar nada. */}
          {playingVideo && (
            <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--color-border)" }}>
              <VideoPlayer video={playingVideo} />
            </div>
          )}
        </div>
      )}
    </>
  );
}
