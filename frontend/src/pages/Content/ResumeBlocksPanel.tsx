import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "../../api/client";
import type { Video, ResumeInfo } from "../../types";

/**
 * V34, item 18 — a tela que faltava para um vídeo Normal fracionado que
 * travou num `poll_timeout`.
 *
 * Sem isto, o operador via o vídeo preso em "processing" para sempre: os
 * blocos já animados (já PAGOS) ficavam presos atrás de `POST
 * /videos/:id/resume-blocks`, uma rota que já existia mas não tinha botão
 * nenhum. `GET /videos/:id/resume-info` é custo ZERO (só lê o que já foi
 * pago) e roda ao montar, antes de qualquer clique.
 *
 * Só aparece quando `video.status === "processing"` e `video.failure_reason
 * === "poll_timeout"` — o MESMO par que `carregarRetomadaPendente`
 * (routes/videos.ts) exige antes de aceitar retomar. Fora disso a rota
 * devolveria 409, e não há razão para mostrar o painel.
 */
export function ResumeBlocksPanel({
  video,
  onResumed,
}: {
  video: Video;
  onResumed: (updated: Video) => void;
}) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<ResumeInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    setLoadingInfo(true);
    setError(null);
    api
      .get<ResumeInfo>(`/videos/${video.id}/resume-info`)
      .then((r) => {
        if (!cancelado) setInfo(r);
      })
      .catch((err) => {
        if (!cancelado) setError(err instanceof ApiError ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelado) setLoadingInfo(false);
      });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id]);

  async function handleResume() {
    setResuming(true);
    setError(null);
    try {
      const atualizado = await api.post<Video>(`/videos/${video.id}/resume-blocks`, {});
      onResumed(atualizado);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setResuming(false);
    }
  }

  return (
    <div className="alert alert-warning" onClick={(e) => e.stopPropagation()}>
      <strong>{t("content.resume.title")}</strong>
      <p style={{ margin: "6px 0" }}>
        {loadingInfo
          ? t("content.resume.loadingInfo")
          : info
            ? t("content.resume.explanation", { done: info.blocosConcluidos, total: info.blocosTotais })
            : null}
      </p>
      {!loadingInfo && info && (
        <p style={{ margin: "6px 0" }}>
          {info.custoRestanteUsd !== null
            ? t("content.resume.costRemaining", { amount: info.custoRestanteUsd.toFixed(2) })
            : t("content.resume.costUnknown")}
        </p>
      )}
      <p style={{ margin: "6px 0", opacity: 0.85 }}>{t("content.resume.window")}</p>
      {error && (
        <p className="alert-error" style={{ fontSize: 13, marginTop: 8, marginBottom: 8 }}>
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary"
        disabled={resuming || loadingInfo}
        onClick={handleResume}
      >
        {resuming ? t("content.resume.buttonLoading") : t("content.resume.button")}
      </button>
    </div>
  );
}
