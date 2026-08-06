import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import { MAX_IMAGE_BYTES, formatBytes } from "../../../uploadLimits";
import { Field } from "../../../components/ui/Field";
import { PublishStep } from "./PublishStep";
import type { SceneBackground, WizardState } from "../types";
import type { AvatarLooksResponse } from "../../../types";

/**
 * O passo CENA: fundo, interpretação, traje e formato.
 *
 * Substitui o passo 3 antigo, que coletava cenário e traje como imagens, os
 * gravava no banco e nunca os mandava a lugar nenhum — o call site de
 * `generateVideo()` simplesmente não os passava. Ele também tinha um seletor de
 * avatar redundante com o passo 1, que some aqui.
 *
 * Cada controle desta tela existe porque o FORNECEDOR tem campo para ele, e
 * nenhum existe além disso:
 *
 *   fundo          →  background.type "color" | "image"   (não há vídeo)
 *   interpretação  →  motion_prompt + expressiveness
 *   traje          →  qual look entra em avatar_id
 *   formato        →  aspect_ratio + resolution
 */

const EXPRESSIVENESS = ["low", "medium", "high"] as const;

/**
 * Teto do texto de interpretação.
 *
 * NOSSO, não do fornecedor: a documentação dele não declara limite nenhum para
 * `motion_prompt`, e o único exemplo publicado tem cinco palavras. O contador
 * existe para dar noção de tamanho, e o número é redondo justamente porque não
 * está medindo nada do outro lado.
 */
const MOTION_PROMPT_MAX = 600;

/**
 * O contrato mora em `types.ts`, compartilhado com o passo 1 — que é quem CRIA
 * traje. Manter uma cópia local aqui faria as duas telas discordarem sobre o
 * que é escolhível na primeira vez que o contrato mudasse, e foi o que
 * aconteceu quando o passo 1 passou a devolver `pendentes`.
 */
type LooksResponse = AvatarLooksResponse;

export function SceneStep({
  avatarId,
  background,
  onBackgroundChange,
  motionPrompt,
  onMotionPromptChange,
  expressiveness,
  onExpressivenessChange,
  avatarLookId,
  onAvatarLookChange,
  publishPlatform,
  onPublishPlatformChange,
}: {
  avatarId: string | null;
  background: SceneBackground | null;
  onBackgroundChange: (value: SceneBackground | null) => void;
  motionPrompt: string;
  onMotionPromptChange: (value: string) => void;
  expressiveness: WizardState["expressiveness"];
  onExpressivenessChange: (value: WizardState["expressiveness"]) => void;
  avatarLookId: string | null;
  onAvatarLookChange: (value: string | null) => void;
  publishPlatform: string;
  onPublishPlatformChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [looks, setLooks] = useState<LooksResponse | null>(null);

  useEffect(() => {
    if (!avatarId) {
      setLooks(null);
      return;
    }
    let cancelled = false;
    api
      .get<LooksResponse>(`/avatars/${avatarId}/looks`)
      .then((r) => {
        if (!cancelled) setLooks(r);
      })
      // Falha de leitura vira "um look só", que é o mesmo estado de quem não
      // tem trajes: o passo inteiro não pode travar pelo controle menos
      // importante dele.
      .catch(() => {
        if (!cancelled)
          setLooks({ looks: [], pendentes: [], canChoose: false, simulated: false, lookCost: { units: 0, usd: 0 } });
      });
    return () => {
      cancelled = true;
    };
  }, [avatarId]);

  async function handleImageUpload(file: File) {
    setUploadError(null);
    // Validação LOCAL antes de qualquer rede: tipo e tamanho. O servidor
    // continua sendo quem recusa de verdade (ele confere os bytes), mas
    // mandar 40 MB para receber um 413 gasta a banda de quem está numa
    // conexão ruim, que é justamente quem menos pode pagar por isso.
    if (!file.type.startsWith("image/")) {
      setUploadError(t("createVideo.scene.backgroundNotImage"));
      return;
    }
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
      onBackgroundChange({ type: "image", value: url });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : t("errors.generic"));
    }
  }

  const listaLooks = looks?.looks ?? [];
  const podeEscolherLook = looks?.canChoose === true;

  return (
    <div className="card">
      <div className="card-title">{t("createVideo.scene.title")}</div>

      {/* ---------------------------------------------------------- FUNDO */}
      <Field label={t("createVideo.scene.backgroundLabel")} help={t("createVideo.scene.backgroundHelp")}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            type="button"
            className={`chip${background === null ? " selected" : ""}`}
            onClick={() => onBackgroundChange(null)}
          >
            {t("createVideo.scene.backgroundNone")}
          </button>
          <button
            type="button"
            className={`chip${background?.type === "color" ? " selected" : ""}`}
            onClick={() => onBackgroundChange({ type: "color", value: background?.type === "color" ? background.value : "#1B2A4A" })}
          >
            {t("createVideo.scene.backgroundColor")}
          </button>
          <label className={`chip${background?.type === "image" ? " selected" : ""}`}>
            {t("createVideo.scene.backgroundImage")}
            <input
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleImageUpload(file);
              }}
            />
          </label>
        </div>

        {background?.type === "color" && (
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10 }}>
            <input
              type="color"
              value={background.value}
              onChange={(e) => onBackgroundChange({ type: "color", value: e.target.value })}
              aria-label={t("createVideo.scene.backgroundColor")}
            />
            <code style={{ fontSize: 13 }}>{background.value}</code>
          </div>
        )}

        {/* PRÉVIA do que foi escolhido. Um fundo escolhido e não mostrado é
            indistinguível de nenhum fundo — e foi assim que a escolha anterior
            passou semanas sem que ninguém notasse que ela não chegava. */}
        {background?.type === "image" && (
          <div style={{ marginTop: 10 }}>
            <img
              src={background.value}
              alt={t("createVideo.scene.backgroundPreview")}
              style={{ maxWidth: 220, borderRadius: "var(--radius-card)", display: "block" }}
            />
          </div>
        )}

        {uploadError && (
          <p className="alert-error" style={{ fontSize: 13, marginTop: 8 }}>
            {uploadError}
          </p>
        )}
        <p className="text-muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
          {t("createVideo.scene.backgroundNoVideo")}
        </p>
      </Field>

      {/* -------------------------------------------------- INTERPRETAÇÃO */}
      <Field
        label={t("createVideo.scene.motionLabel")}
        help={t("createVideo.scene.motionHelp")}
        helpPrompt={t("createVideo.scene.motionHelpPrompt")}
      >
        <textarea
          rows={4}
          value={motionPrompt}
          maxLength={MOTION_PROMPT_MAX}
          placeholder={t("createVideo.scene.motionPlaceholder")}
          onChange={(e) => onMotionPromptChange(e.target.value)}
        />
        <div className="text-muted" style={{ fontSize: 12, textAlign: "right" }}>
          {t("createVideo.scene.motionCounter", { used: motionPrompt.length, max: MOTION_PROMPT_MAX })}
        </div>
        {/* A procedência do conselho, escrita. O fornecedor publica UM exemplo
            de cinco palavras e nenhuma regra de escrita; tudo o que está no
            texto de ajuda é recomendação nossa, e dizer isso é o que impede a
            tela de emprestar autoridade que ela não tem. */}
        <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
          {t("createVideo.scene.motionOurAdvice")}
        </p>
      </Field>

      <Field label={t("createVideo.scene.expressivenessLabel")} help={t("createVideo.scene.expressivenessHelp")}>
        <div className="chip-group">
          {EXPRESSIVENESS.map((nivel) => (
            <button
              key={nivel}
              type="button"
              className={`chip${expressiveness === nivel ? " selected" : ""}`}
              onClick={() => onExpressivenessChange(expressiveness === nivel ? null : nivel)}
            >
              {t(`createVideo.scene.expressiveness_${nivel}`)}
            </button>
          ))}
        </div>
      </Field>

      {/* ---------------------------------------------------------- TRAJE */}
      <Field label={t("createVideo.scene.lookLabel")} help={t("createVideo.scene.lookHelp")}>
        <select
          value={avatarLookId ?? ""}
          disabled={!podeEscolherLook}
          onChange={(e) => onAvatarLookChange(e.target.value || null)}
        >
          <option value="">{t("createVideo.scene.lookDefault")}</option>
          {listaLooks.map((look) => (
            <option key={look.id} value={look.id}>
              {look.name}
            </option>
          ))}
        </select>
        {!podeEscolherLook && (
          <p className="text-muted" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>
            {t("createVideo.scene.lookSingle")}
          </p>
        )}
      </Field>

      {/* -------------------------------------------------------- FORMATO */}
      <PublishStep platform={publishPlatform} onChange={onPublishPlatformChange} />
    </div>
  );
}
