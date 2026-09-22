import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Avatar, Video } from "../../types";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { SimulatedBadge } from "../../features/SimulatedBadge";
import { VideoPlayer } from "../../features/VideoPlayer";
import { VideoDetailsModal } from "./VideoDetailsModal";

type Tab = "avatars" | "videos";

export function ContentPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("avatars");
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  // P2-3 — erro do cancelamento. Precisa de dono próprio (não o `error` de
  // nenhum outro fluxo desta tela): sem ele, uma rejeição de `handleCancelVideo`
  // vira "Uncaught (in promise)" no console, sem nada visível na tela.
  const [cancelError, setCancelError] = useState<string | null>(null);
  // P2-7 — a janela de Detalhes. O vídeo inteiro fica no estado (não só o
  // id): a lista `videos` pode reordenar/atualizar entre o clique e o
  // render, e reler por id a cada render é o mesmo custo de guardar o
  // objeto, sem a complicação extra de sincronizar os dois.
  const [detailsFor, setDetailsFor] = useState<Video | null>(null);
  // P2-8 — "Ver versões": filtra a tabela para uma família só, sem CTE
  // recursiva nenhuma (a lista inteira já está em memória) — `raizDe`
  // resolve a raiz da família (o próprio id, se `root_video_id` for null).
  const [filtroFamilia, setFiltroFamilia] = useState<string | null>(null);

  useEffect(() => {
    api.get<Avatar[]>("/avatars").then(setAvatars);
    api.get<Video[]>("/videos").then(setVideos);
  }, []);

  const playingVideo = videos.find((v) => v.id === playing) ?? null;

  function raizDe(v: Video): string {
    return v.root_video_id ?? v.id;
  }
  const videosExibidos = filtroFamilia
    ? videos
        .filter((v) => v.id === filtroFamilia || raizDe(v) === filtroFamilia)
        .sort((a, b) => (a.version_number ?? 1) - (b.version_number ?? 1))
    : videos;

  /**
   * P2-3 — cancelar direto da Biblioteca. Mesmo padrão de tratamento de
   * erro do resto do produto (F10): `ApiError` (que estende `Error`) vira
   * `err.message`; qualquer outra coisa cai em `errors.generic`. Nunca
   * deixa a promise rejeitar sem dono.
   */
  async function handleCancelVideo(v: Video) {
    const confirmKey = v.status === "awaiting_approval_video" ? "cancelConfirmVideo" : "cancelConfirmImage";
    if (!window.confirm(t(`createVideo.generate.${confirmKey}`))) return;
    setCancelError(null);
    try {
      const updated = await api.post<Video>(`/videos/${v.id}/cancel`, {});
      setVideos((vs) => vs.map((x) => (x.id === updated.id ? updated : x)));
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : t("errors.generic"));
    }
  }

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
              {t("content.avatarsEmptyPrefix")} <Link to="../create">{t("content.avatarsEmptyLink")}</Link>
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
          {cancelError && <p style={{ color: "var(--color-tertiary)" }}>{cancelError}</p>}
          {filtroFamilia && (
            <p style={{ fontSize: 13, marginTop: 0 }}>
              {t("content.filteringVersions")}{" "}
              <button className="btn btn-outline" style={{ padding: "2px 8px" }} onClick={() => setFiltroFamilia(null)}>
                {t("content.clearFilter")}
              </button>
            </p>
          )}
          {videos.length === 0 ? (
            <div className="empty-state">
              {t("content.videosEmptyPrefix")} <Link to="../create">{t("content.videosEmptyLink")}</Link>
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
                {videosExibidos.map((v) => {
                  // P2-8 — a família de versões: "Versão N" só aparece quando
                  // N > 1 (a versão original nunca ganha o rótulo); "Ver
                  // versões" só quando a família tem MAIS de um membro —
                  // uma versão original sem nenhum ajuste ainda não tem o
                  // que listar.
                  const versao = v.version_number ?? 1;
                  const temFamilia = videos.some((x) => x.id !== v.id && raizDe(x) === raizDe(v));
                  return (
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
                      {versao > 1 && (
                        <span className="text-muted" style={{ fontSize: 12, marginLeft: 6 }}>
                          {t("content.versionLabel", { n: versao })}
                        </span>
                      )}
                      {temFamilia && (
                        <>
                          {" · "}
                          <button
                            className="btn btn-outline"
                            style={{ padding: "1px 6px", fontSize: 12 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setFiltroFamilia(raizDe(v));
                            }}
                          >
                            {t("content.seeVersions")}
                          </button>
                        </>
                      )}
                    </td>
                    <td>{v.duration_seconds}s</td>
                    <td>
                      <StatusPill status={v.status} />
                    </td>
                    <td>{new Date(v.created_at).toLocaleDateString()}</td>
                    <td style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {/* P2-7 — sempre visível, qualquer status. */}
                      <button
                        className="btn btn-outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetailsFor(v);
                        }}
                      >
                        {t("content.details")}
                      </button>
                      {v.output_url && (
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
                      )}
                      {/* P2-3 — "Retomar aprovação" reabre o wizard direto no
                          passo "4. Gerar", na MESMA tela de aprovação
                          pendente (GenerateStep já sabe renderizar por
                          `video.status`). Link relativo com "../": esta
                          página é o elemento da Route "/content", uma
                          folha das <Routes> aninhadas em "/:slug/*" — um
                          "to" relativo SEM "../" resolve relativo ao
                          PRÓPRIO caminho da rota que renderizou o link
                          (aqui, "/:slug/content"), não ao pai comum, e
                          por isso "create" (sem prefixo) vira
                          "/:slug/content/create" — path inexistente, tela
                          em branco. MEDIDO no navegador em 22/09/2026:
                          o "to" sem "../" gerava exatamente esse href
                          quebrado. "../create" sobe um nível (para
                          "/:slug") e desce para "create", chegando em
                          "/:slug/create" — o mesmo destino, venha o clique
                          de "/content" ou de "/create" (VideoPlayer.tsx
                          usa o mesmo "../create" pelo mesmo motivo). */}
                      {(v.status === "awaiting_approval" || v.status === "awaiting_approval_video") && (
                        <>
                          <Link
                            className="btn btn-outline"
                            to={`../create?resume=${v.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {t("content.resumeApproval")}
                          </Link>
                          <button
                            className="btn btn-outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleCancelVideo(v);
                            }}
                          >
                            {t("content.cancelVideo")}
                          </button>
                        </>
                      )}
                      {/* P2-8 — "Ajustar este vídeo": só quando NÃO está em
                          voo (nem sendo processado, nem esperando
                          aprovação — aí o caminho certo é Retomar/Cancelar
                          acima). `ready`/`error`/`cancelled` são os três
                          estados TERMINAIS onde faz sentido pedir uma
                          versão nova a partir deste. */}
                      {(v.status === "ready" || v.status === "error" || v.status === "cancelled") && (
                        <Link
                          className="btn btn-outline"
                          to={`../create?adjustFrom=${v.id}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {t("content.adjust")}
                        </Link>
                      )}
                    </td>
                  </tr>
                  );
                })}
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

      {detailsFor && (
        <VideoDetailsModal video={detailsFor} avatars={avatars} onClose={() => setDetailsFor(null)} />
      )}
    </>
  );
}
