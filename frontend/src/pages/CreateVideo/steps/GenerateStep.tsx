import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { Avatar, Video } from "../../../types";
import { StatusPill } from "../../../components/ui/StatusPill";
import type { WizardState } from "../types";
import { VideoPlayer } from "../../../features/VideoPlayer";
import { VideoCostPanel } from "../VideoCostPanel";

const PROGRESS_BY_STATUS: Record<Video["status"], number> = {
  queued: 15,
  processing: 65,
  ready: 100,
  error: 100,
};

export function GenerateStep({ wizard }: { wizard: WizardState }) {
  const { t } = useTranslation();
  const [video, setVideo] = useState<Video | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Sem este estado (e o catch abaixo), um 403 de crédito, um 409 de avatar em
  // treino ou um 429 de teto viravam promise rejeitada sem dono: o botão
  // voltava ao normal e a tela não dizia NADA. O erro precisa aparecer ao lado
  // da ação que falhou.
  const [error, setError] = useState<string | null>(null);

  // O avatar pode estar em treino no fornecedor. Descobrir isso ANTES de o
  // botão ficar clicável é o ponto: sem isso o cliente clica, espera, e leva
  // uma recusa que parece falha de geração — quando na verdade é só cedo
  // demais. Ver migration 036: só "processing" bloqueia.
  const [avatar, setAvatar] = useState<Avatar | null>(null);
  useEffect(() => {
    if (!wizard.avatarId) return;
    api
      .get<Avatar>(`/avatars/${wizard.avatarId}`)
      .then(setAvatar)
      .catch(() => setAvatar(null));
  }, [wizard.avatarId]);
  const training = avatar?.provider_status === "processing";

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function handleGenerate() {
    setSubmitting(true);
    setError(null);
    try {
      const created = await api.post<Video>("/videos", {
        avatar_id: wizard.avatarId,
        script: wizard.script,
        scenario: wizard.scenario || null,
        outfit: wizard.outfit || null,
        scenario_prompt: wizard.scenarioPrompt || null,
        outfit_prompt: wizard.outfitPrompt || null,
        duration_seconds: wizard.durationSeconds,
        // Vai SEMPRE. O servidor tem padrão para corpo sem este campo, mas
        // depender do padrão dele aqui reproduziria, um andar acima, a mesma
        // omissão que o bloco tirou do payload do fornecedor.
        publish_platform: wizard.publishPlatform,
      });
      setVideo(created);
      pollRef.current = window.setInterval(async () => {
        const latest = await api.get<Video>(`/videos/${created.id}`);
        setVideo(latest);
        if (latest.status === "ready" || latest.status === "error") {
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errors.generic"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">{t("createVideo.generate.title")}</div>

      {!video ? (
        <>
          {training && (
            <p className="text-muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 12 }}>
              {t("createVideo.generate.avatarTraining")}
            </p>
          )}
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={submitting || !wizard.script || training}
          >
            {submitting ? t("createVideo.generate.submitting") : t("createVideo.generate.generateButton")}
          </button>
          {error && (
            <p className="alert-error" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>
              {error}
            </p>
          )}
          {/* Custo ANTES de gastar. A estimativa aparece ao lado do botão que
              a torna real — mostrá-la só depois seria informar o preço depois
              da compra. */}
          <VideoCostPanel estimateSeconds={wizard.durationSeconds} />
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <StatusPill status={video.status} />
            <div style={{ flex: 1, height: 8, background: "var(--color-border)", borderRadius: 999 }}>
              <div
                style={{
                  width: `${PROGRESS_BY_STATUS[video.status]}%`,
                  height: "100%",
                  background: "var(--color-primary)",
                  borderRadius: 999,
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>

          {video.status === "ready" && video.output_url && (
            <>
              {/* Mesmo componente da Biblioteca: o aviso de simulação e o
                  respeito à proporção precisam ser idênticos nos dois lugares.
                  Duas implementações divergem, e a que divergir será a que
                  mostra fixture sem aviso numa apresentação. */}
              <VideoPlayer video={video} />
              {/* O resultado vive em useState: sair desta tela o torna
                  inalcançável. Sem este caminho, quem fecha o wizard não tem
                  como descobrir que o vídeo continua no produto. */}
              <p style={{ fontSize: 13, marginTop: 16, marginBottom: 0 }}>
                <Link to="/content">{t("createVideo.generate.openLibrary")}</Link>
              </p>
            </>
          )}

          {video.status === "error" && (
            <p style={{ color: "var(--color-tertiary)" }}>
              {video.error_message || t("createVideo.generate.failed")}
            </p>
          )}

          {/* Depois de gerar: estimativa e medição lado a lado, com a
              diferença. `refreshKey` no status porque o custo real só existe
              quando o polling registra o consumo — sem isso o painel ficaria
              preso na leitura de quando o vídeo ainda estava na fila. */}
          <VideoCostPanel videoId={video.id} refreshKey={video.status} />
        </>
      )}
    </div>
  );
}
