import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import { MAX_IMAGE_BYTES, formatBytes } from "../../../uploadLimits";
import type { Avatar } from "../../../types";
import { Field } from "../../../components/ui/Field";

export function ChooseAssetsStep({
  avatarId,
  onAvatarChange,
  scenario,
  onScenarioChange,
  outfit,
  onOutfitChange,
  scenarioPrompt,
  onScenarioPromptChange,
  outfitPrompt,
  onOutfitPromptChange,
}: {
  avatarId: string | null;
  onAvatarChange: (id: string) => void;
  scenario: string;
  onScenarioChange: (value: string) => void;
  outfit: string;
  onOutfitChange: (value: string) => void;
  scenarioPrompt: string;
  onScenarioPromptChange: (value: string) => void;
  outfitPrompt: string;
  onOutfitPromptChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [avatars, setAvatars] = useState<Avatar[]>([]);

  useEffect(() => {
    api.get<Avatar[]>("/avatars").then(setAvatars);
  }, []);

  // Erro visível: antes, uma recusa do servidor (413) virava promise
  // rejeitada sem dono e a tela não dizia nada.
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function handleAssetUpload(kind: "scenario" | "outfit", file: File) {
    setUploadError(null);
    if (file.size > MAX_IMAGE_BYTES) {
      setUploadError(
        t("createVideo.avatarSetup.imageTooLarge", {
          size: formatBytes(file.size),
          max: formatBytes(MAX_IMAGE_BYTES),
        }),
      );
      return;
    }
    try {
      const { url } = await api.upload<{ url: string }>("/uploads", file, file.name);
      if (kind === "scenario") onScenarioChange(url);
      else onOutfitChange(url);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("errors.generic"));
    }
  }

  return (
    <div className="card">
      <div className="card-title">{t("createVideo.assets.title")}</div>

      {uploadError && (
        <p className="alert-error" style={{ fontSize: 13 }}>
          {uploadError}
        </p>
      )}

      <Field
        label={t("createVideo.assets.avatarLabel")}
        help={t("createVideo.assets.avatarHelp")}
        helpPrompt={t("createVideo.assets.avatarHelpPrompt")}
      >
        <select value={avatarId ?? ""} onChange={(e) => onAvatarChange(e.target.value)}>
          <option value="" disabled>
            {t("createVideo.assets.selectAvatar")}
          </option>
          {avatars.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2">
        <div>
          <Field label={t("createVideo.assets.uploadImageLabel")}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleAssetUpload("scenario", e.target.files[0])}
            />
          </Field>
          {scenario && (
            <p className="text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 16 }}>
              {t("createVideo.assets.imageSaved")}
            </p>
          )}
          <Field
            label={t("createVideo.assets.scenarioLabel")}
            help={t("createVideo.assets.scenarioHelp")}
            helpPrompt={t("createVideo.avatarSetup.scenarioHelpPrompt")}
          >
            <input
              value={scenarioPrompt}
              onChange={(e) => onScenarioPromptChange(e.target.value)}
              placeholder={t("createVideo.assets.scenarioPlaceholder")}
            />
          </Field>
        </div>
        <div>
          <Field label={t("createVideo.assets.uploadImageLabel")}>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && handleAssetUpload("outfit", e.target.files[0])}
            />
          </Field>
          {outfit && (
            <p className="text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 16 }}>
              {t("createVideo.assets.imageSaved")}
            </p>
          )}
          <Field
            label={t("createVideo.assets.outfitLabel")}
            help={t("createVideo.assets.outfitHelp")}
            helpPrompt={t("createVideo.avatarSetup.outfitHelpPrompt")}
          >
            <input
              value={outfitPrompt}
              onChange={(e) => onOutfitPromptChange(e.target.value)}
              placeholder={t("createVideo.assets.outfitPlaceholder")}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}
