import { useTranslation } from "react-i18next";
import type { Avatar, Video } from "../../types";
import { StatusPill } from "../../components/ui/StatusPill";
import { durationLabel } from "../../features/VideoPlayer";
import { ASPECT_RATIO_LABELS } from "../../features/aspectRatioLabels";

/**
 * P2-7, 22/09/2026 — "Detalhes" na Biblioteca. Nenhum dado NOVO: todo campo
 * aqui já vinha em `GET /videos`/`GET /videos/:id` (SELECT v.*), só faltava
 * o tipo `Video` do frontend declará-lo (types.ts).
 *
 * P1 — NENHUM campo `*_en` nem `identity_snapshot` entra aqui. Os dois
 * já são velados pelo backend (`CAMPOS_VELADOS`, tenantView.ts) — este
 * componente nem precisaria excluí-los de propósito, porque eles nunca
 * chegam no objeto `video` — mas a garantia aqui é dupla: só listo campos
 * que EU escolhi (`motion_prompt`, nunca `motion_prompt_en`).
 *
 * "Avatar usado" cruza `video.avatar_id` com a lista de avatares que
 * `ContentPage.tsx` já carrega para a própria aba "Avatares" — sem chamada
 * nova, sem alterar o backend.
 */

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "6px 0",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      <span className="text-muted" style={{ fontSize: 13 }}>
        {label}
      </span>
      <span style={{ fontSize: 13, textAlign: "right" }}>{value || "—"}</span>
    </div>
  );
}

export function VideoDetailsModal({
  video,
  avatars,
  onClose,
}: {
  video: Video;
  avatars: Avatar[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const avatarNome = avatars.find((a) => a.id === video.avatar_id)?.name ?? "—";
  const duration = durationLabel(video);
  const deliveredLabel = duration
    ? duration.estimated
      ? t("content.durationEstimated", { seconds: Math.floor(duration.seconds) })
      : t("content.durationDelivered", { seconds: duration.seconds.toFixed(2).replace(".", ",") })
    : "—";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>{t("content.detailsTitle")}</h3>
          <button className="btn btn-outline" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>

        <Linha
          label={t("content.detailsTier")}
          value={video.tier_video ? t(`createVideo.generate.tier.${video.tier_video}`) : "—"}
        />
        <Linha
          label={t("content.detailsAspectRatio")}
          value={video.aspect_ratio ? ASPECT_RATIO_LABELS[video.aspect_ratio] ?? video.aspect_ratio : "—"}
        />
        <Linha label={t("content.detailsResolution")} value={video.resolution ?? "—"} />
        <Linha
          label={t("content.detailsTargetDuration")}
          value={
            video.target_duration_seconds
              ? t("content.detailsSeconds", { seconds: video.target_duration_seconds })
              : "—"
          }
        />
        <Linha label={t("content.detailsDeliveredDuration")} value={deliveredLabel} />
        <Linha label={t("content.detailsScenarioText")} value={video.scenario_prompt ?? "—"} />
        <Linha
          label={t("content.detailsScenarioImage")}
          value={video.scenario ? t("content.detailsHasImage") : t("content.detailsNoImage")}
        />
        <Linha label={t("content.detailsOutfitText")} value={video.outfit_prompt ?? "—"} />
        <Linha
          label={t("content.detailsOutfitImage")}
          value={video.outfit ? t("content.detailsHasImage") : t("content.detailsNoImage")}
        />
        <Linha label={t("content.detailsMotionPrompt")} value={video.motion_prompt ?? "—"} />
        <Linha
          label={t("content.detailsExpressiveness")}
          value={video.expressiveness ? t(`createVideo.scene.expressiveness_${video.expressiveness}`) : "—"}
        />
        <Linha
          label={t("content.detailsCaptions")}
          value={
            video.captions
              ? video.captions_delivered
                ? t("content.detailsCaptionsYes")
                : t("content.detailsCaptionsMissing")
              : t("content.detailsCaptionsNo")
          }
        />
        <Linha label={t("content.detailsAvatar")} value={avatarNome} />
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            padding: "6px 0",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <span className="text-muted" style={{ fontSize: 13 }}>
            {t("content.detailsStatus")}
          </span>
          <StatusPill status={video.status} />
        </div>
        {/* Formato de data BRASILEIRO sempre — `"pt-BR"` fixo, e não o idioma
            da interface (`i18n.language`, que pode estar em `en`): a data
            de um vídeo gerado no Brasil não muda de formato porque alguém
            trocou o idioma do menu. */}
        <Linha label={t("content.detailsCreatedAt")} value={new Date(video.created_at).toLocaleString("pt-BR")} />
      </div>
    </div>
  );
}
