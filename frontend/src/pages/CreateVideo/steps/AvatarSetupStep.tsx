import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { Avatar } from "../../../types";
import { useCamera } from "../hooks/useCamera";
import { useMediaRecorderCapture } from "../hooks/useMediaRecorder";
import type { AssetDefaults } from "../types";
import { Field } from "../../../components/ui/Field";
import { BACKGROUND_OPTIONS, DEFAULT_BACKGROUND_ID } from "../virtualBackground/backgroundOptions";
import { DEFAULT_QUALITY } from "../imageQuality/applyQualityTreatment";
import type { QualityOptions } from "../imageQuality/applyQualityTreatment";
import { useFeature } from "../../../features/FeatureFlagContext";
import { MAX_IMAGE_BYTES, MAX_REFERENCE_VIDEO_BYTES, formatBytes } from "../../../uploadLimits";
import { RecordingProgress } from "../RecordingProgress";
import { VoiceSampleRecorder } from "../VoiceSampleRecorder";

export function AvatarSetupStep({
  selectedAvatarId,
  onSelectAvatar,
  defaults,
  onDefaultsChange,
  nextButton,
}: {
  selectedAvatarId: string | null;
  onSelectAvatar: (id: string | null) => void;
  defaults: AssetDefaults;
  onDefaultsChange: (defaults: AssetDefaults) => void;
  // Rendered by the parent (CreateVideoPage owns goNext/canProceed) — this
  // step is the one place the wizard's "next" button moves inline instead
  // of sitting in the shared footer, so the element is built once by the
  // parent and just placed here, not reimplemented.
  nextButton?: ReactNode;
}) {
  const { t } = useTranslation();
  const PHOTO_SLOTS = [
    t("createVideo.avatarSetup.slotFront"),
    t("createVideo.avatarSetup.slotRight"),
    t("createVideo.avatarSetup.slotLeft"),
  ];
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [draftAvatar, setDraftAvatar] = useState<Avatar | null>(null);
  const [backgroundId, setBackgroundId] = useState(DEFAULT_BACKGROUND_ID);
  // Fundo removível está atrás de flag: ver services/featureFlags.ts.
  const removableBackground = useFeature("removable_background");
  const [intensity, setIntensity] = useState(1);
  const [quality, setQualityState] = useState<QualityOptions>(DEFAULT_QUALITY);
  const [targetLufsDraft, setTargetLufsDraft] = useState(-16);

  const camera = useCamera();
  const recorder = useMediaRecorderCapture();
  // Derivado da lista, e não guardado num estado próprio: dois estados para a
  // mesma verdade divergem no primeiro `refreshAvatars()`, e o que divergiria
  // aqui é a voz que a tela acha que o avatar tem.
  const selectedAvatar = avatars.find((a) => a.id === selectedAvatarId) ?? null;
  const referenceFileInput = useRef<HTMLInputElement | null>(null);
  const photoFileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    refreshAvatars();
  }, []);

  useEffect(() => {
    const option = BACKGROUND_OPTIONS.find((o) => o.id === backgroundId);
    camera.setBackground({ backgroundColor: option?.color ?? null, intensity });
  }, [backgroundId, intensity]);

  useEffect(() => {
    camera.setQuality(quality);
  }, [quality]);

  // Resyncs only when a different avatar becomes the draft (not on every
  // unrelated field update via setDraftAvatar), so it doesn't clobber an
  // in-progress LUFS slider drag.
  useEffect(() => {
    if (draftAvatar) setTargetLufsDraft(Number(draftAvatar.audio_treatment_target_lufs));
  }, [draftAvatar?.id]);

  function refreshAvatars() {
    api.get<Avatar[]>("/avatars").then(setAvatars);
  }

  async function handleDeleteAvatar(avatar: Avatar) {
    if (!window.confirm(t("knowledge.confirmDelete", { name: avatar.name }))) return;
    await api.delete(`/avatars/${avatar.id}`);
    if (selectedAvatarId === avatar.id) onSelectAvatar(null);
    refreshAvatars();
  }

  // Erro visível de qualquer ação que fale com o servidor. Sem isso, uma
  // falha de treino de avatar ou de clonagem de voz virava promise rejeitada
  // sem dono: o botão voltava ao normal e a tela não dizia nada.
  const [actionError, setActionError] = useState<string | null>(null);

  async function guard(action: () => Promise<void>): Promise<void> {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t("errors.generic"));
    }
  }

  async function handleCreateAvatar() {
    if (!name) return;
    await guard(async () => {
      const avatar = await api.post<Avatar>("/avatars", { name });
      setDraftAvatar(avatar);
      await camera.start();
    });
  }

  async function handleCapturePhoto() {
    if (!draftAvatar) return;
    const blob = await camera.capturePhoto();
    if (!blob) return;
    await guard(async () => {
      const updated = await api.upload<Avatar>(`/avatars/${draftAvatar.id}/photos`, blob, "photo.jpg");
      setDraftAvatar(updated);
    });
  }

  // Enviar foto de arquivo, em vez de capturar pela câmera.
  //
  // Sem este caminho o passo inteiro trava numa máquina sem câmera: concluir
  // exige 3 fotos, o botão "Capturar" depende de `camera.ready`, e não havia
  // alternativa nenhuma — enquanto o vídeo de referência logo abaixo sempre
  // teve o seu "ou enviar arquivo". A assimetria não era intencional.
  //
  // Aceita várias de uma vez e envia em sequência, porque o backend ANEXA ao
  // final de `photo_urls` (não grava por índice): mandar em paralelo deixaria
  // a ordem à mercê de qual requisição chega primeiro, e a ordem é o que
  // define em qual posição cada foto aparece.
  async function handlePhotoFileChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0 || !draftAvatar) return;
    const remaining = PHOTO_SLOTS.length - draftAvatar.photo_urls.length;
    const grande = files.slice(0, remaining).find((f) => f.size > MAX_IMAGE_BYTES);
    if (grande && rejectImageIfTooLarge(grande.size)) {
      e.target.value = "";
      return;
    }
    await guard(async () => {
      let latest = draftAvatar;
      for (const file of files.slice(0, remaining)) {
        latest = await api.upload<Avatar>(`/avatars/${latest.id}/photos`, file, file.name);
      }
      setDraftAvatar(latest);
    });
    // Permite reenviar o mesmo arquivo depois de um erro: sem isto, escolher
    // o mesmo nome não dispara `change` de novo.
    e.target.value = "";
  }

  function handleStartRecording() {
    const stream = camera.getRecordingStream();
    if (stream) recorder.start(stream);
  }

  /**
   * Recusa antes de enviar. Não substitui a checagem do servidor — que
   * continua sendo a autoridade — mas evita subir dezenas de megabytes para
   * receber um 413 no fim, que numa conexão ruim é a diferença entre um aviso
   * imediato e vários minutos perdidos.
   */
  function rejectIfTooLarge(size: number): boolean {
    if (size <= MAX_REFERENCE_VIDEO_BYTES) return false;
    setActionError(
      t("createVideo.avatarSetup.fileTooLarge", {
        size: formatBytes(size),
        max: formatBytes(MAX_REFERENCE_VIDEO_BYTES),
      }),
    );
    return true;
  }

  /** Mesma cortesia do vídeo, com o teto e a orientação de IMAGEM. */
  function rejectImageIfTooLarge(size: number): boolean {
    if (size <= MAX_IMAGE_BYTES) return false;
    setActionError(
      t("createVideo.avatarSetup.imageTooLarge", {
        size: formatBytes(size),
        max: formatBytes(MAX_IMAGE_BYTES),
      }),
    );
    return true;
  }

  async function handleUploadRecording() {
    if (!draftAvatar || !recorder.recordedBlob) return;
    if (rejectIfTooLarge(recorder.recordedBlob.size)) return;
    // Este é o passo que dispara treino de avatar e clonagem de voz — os
    // dois fornecedores externos ao mesmo tempo, e o ponto mais provável de
    // falha do fluxo inteiro.
    await guard(async () => {
      const updated = await api.upload<Avatar>(
        `/avatars/${draftAvatar.id}/reference-video`,
        recorder.recordedBlob as Blob,
        "reference.webm",
      );
      setDraftAvatar(updated);
    });
  }

  async function handleReferenceFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !draftAvatar) return;
    if (rejectIfTooLarge(file.size)) {
      e.target.value = "";
      return;
    }
    await guard(async () => {
      const updated = await api.upload<Avatar>(
        `/avatars/${draftAvatar.id}/reference-video`,
        file,
        file.name,
      );
      setDraftAvatar(updated);
    });
  }

  function handleFinishSetup() {
    if (!draftAvatar) return;
    camera.stop();
    refreshAvatars();
    onSelectAvatar(draftAvatar.id);
    setCreating(false);
    setDraftAvatar(null);
    setName("");
  }

  function updateQuality(patch: Partial<QualityOptions>) {
    setQualityState((q) => ({ ...q, ...patch }));
  }

  async function handleAudioTreatmentToggle(enabled: boolean) {
    if (!draftAvatar) return;
    const updated = await api.put<Avatar>(`/avatars/${draftAvatar.id}`, {
      audio_treatment_enabled: enabled,
    });
    setDraftAvatar(updated);
  }

  async function commitTargetLufs(value: number) {
    if (!draftAvatar) return;
    const updated = await api.put<Avatar>(`/avatars/${draftAvatar.id}`, {
      audio_treatment_target_lufs: value,
    });
    setDraftAvatar(updated);
  }

  async function handleAssetUpload(kind: "scenario" | "outfit", file: File) {
    const { url } = await api.upload<{ url: string }>("/uploads", file, file.name);
    onDefaultsChange({ ...defaults, [kind]: url });
  }

  if (!creating) {
    return (
      <div className="card">
        <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
          {t("createVideo.avatarSetup.scopeNote")}
        </p>
        <button className="btn btn-primary" style={{ marginBottom: 20 }} onClick={() => setCreating(true)}>
          {t("createVideo.avatarSetup.newAvatarButton")}
        </button>

        {nextButton && <div style={{ marginBottom: 20 }}>{nextButton}</div>}

        <div className="card-title">{t("createVideo.avatarSetup.yourAvatars")}</div>
        {avatars.length === 0 ? (
          <p className="text-muted" style={{ marginBottom: 16 }}>
            {t("createVideo.avatarSetup.noAvatarsYet")}
          </p>
        ) : (
          <div className="grid grid-cols-3" style={{ marginBottom: 16 }}>
            {avatars.map((a) => (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                className={`card${selectedAvatarId === a.id ? " selected" : ""}`}
                style={{
                  textAlign: "left",
                  cursor: "pointer",
                  borderColor: selectedAvatarId === a.id ? "var(--color-primary)" : undefined,
                  // 1px de borda verde sobre fundo branco desaparece em
                  // projetor — MEDIDO na Fase 0 do 5D (o card renderizava com
                  // 0,8px efetivos). Três reforços independentes, porque
                  // nenhum deles sozinho sobrevive a todo equipamento: borda
                  // grossa, halo, e uma faixa lateral que não depende de
                  // fidelidade de cor.
                  borderWidth: selectedAvatarId === a.id ? 3 : undefined,
                  boxShadow:
                    selectedAvatarId === a.id ? "0 0 0 4px color-mix(in srgb, var(--color-primary) 30%, transparent)" : undefined,
                  borderLeftWidth: selectedAvatarId === a.id ? 8 : undefined,
                }}
                onClick={() => onSelectAvatar(a.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelectAvatar(a.id);
                }}
              >
                <strong>{a.name}</strong>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
                  {t("createVideo.avatarSetup.photosVoiceStatus", {
                    count: a.photo_urls.length,
                    voiceStatus: a.reference_video_url
                      ? t("createVideo.avatarSetup.voiceReady")
                      : t("createVideo.avatarSetup.voiceNotReady"),
                  })}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <span className={`status-pill status-${a.provider_avatar_id ? "avatar-trained" : "disconnected"}`}>
                    {a.provider_avatar_id
                      ? t("createVideo.avatarSetup.avatarTrained")
                      : t("createVideo.avatarSetup.avatarPending")}
                  </span>
                  <span className={`status-pill status-${a.voice_id ? "voice-cloned" : "disconnected"}`}>
                    {a.voice_id
                      ? t("createVideo.avatarSetup.voiceCloned")
                      : t("createVideo.avatarSetup.voicePending")}
                  </span>
                </div>
                <button
                  className="btn btn-outline"
                  style={{ marginTop: 8 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteAvatar(a);
                  }}
                >
                  {t("knowledge.delete")}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Captura de voz do avatar SELECIONADO.
            Fica atrás da seleção de propósito: aparece só depois de a pessoa
            escolher um avatar, e nunca ao lado de "Novo avatar" — aquele botão
            abre o caminho que treina um avatar novo (US$ 1,00 mais 1 crédito),
            e vizinhança visual entre os dois convidaria justamente à confusão
            que este bloco existe para evitar. Aqui nada é treinado e nenhum
            crédito é debitado: o único recurso consumido é o slot de voz. */}
        {selectedAvatar && (
          <VoiceSampleRecorder
            avatar={selectedAvatar}
            onCloned={(updated) =>
              setAvatars((prev) => prev.map((a) => (a.id === updated.id ? updated : a)))
            }
          />
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-title">{t("createVideo.avatarSetup.newAvatarTitle")}</div>
      <p className="text-muted" style={{ fontSize: 13, marginBottom: 16 }}>
        {t("createVideo.avatarSetup.scopeNote")}
      </p>

      {!draftAvatar ? (
        <div style={{ maxWidth: 320 }}>
          <Field
            label={t("createVideo.avatarSetup.nameLabel")}
            help={t("createVideo.avatarSetup.nameHelp")}
            helpPrompt={t("createVideo.avatarSetup.nameHelpPrompt")}
          >
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("createVideo.avatarSetup.namePlaceholder")}
            />
          </Field>
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={handleCreateAvatar} disabled={!name}>
            {t("createVideo.avatarSetup.startCapture")}
          </button>
          {actionError && <div className="alert alert-error">{actionError}</div>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2" style={{ marginBottom: 20 }}>
            <div>
              <div className="card-title">{t("createVideo.avatarSetup.cameraPreview")}</div>
              {camera.error && <p style={{ color: "var(--color-tertiary)" }}>{camera.error}</p>}
              {/* Hidden source the segmenter/canvas read frames from — the
                  canvas below is what the user actually sees and what gets
                  captured/recorded, since it already reflects the current
                  virtual background + intensity. */}
              <video ref={camera.videoRef} muted playsInline style={{ display: "none" }} />
              <canvas
                ref={camera.canvasRef}
                style={{
                  width: "100%",
                  borderRadius: "var(--radius-card)",
                  border: "1px solid var(--color-border)",
                  background: "#000",
                }}
              />

              {/* Contrato de feature flag: quando desligada, o recurso NÃO
                  some e NÃO vira um botão que dá erro — aparece inerte, com
                  o motivo que o admin cadastrou. Some sem explicação parece
                  defeito; botão que falha parece descaso. */}
              {!removableBackground.enabled ? (
                <div className="feature-unavailable">
                  <div className="feature-unavailable-title">
                    {t("createVideo.avatarSetup.background.label")} — {t("featureFlags.unavailable")}
                  </div>
                  {removableBackground.reason}
                </div>
              ) : (
              <Field
                label={t("createVideo.avatarSetup.background.label")}
                help={
                  camera.segmentationError
                    ? t("createVideo.avatarSetup.background.unavailable")
                    : t("createVideo.avatarSetup.background.help")
                }
              >
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {BACKGROUND_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="btn btn-outline"
                      disabled={option.color !== null && !!camera.segmentationError}
                      onClick={() => setBackgroundId(option.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        borderColor: backgroundId === option.id ? "var(--color-primary)" : undefined,
                      }}
                    >
                      <span
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          border: "1px solid var(--color-border)",
                          background: option.color ? `rgb(${option.color.join(",")})` : "transparent",
                        }}
                      />
                      {t(option.labelKey)}
                    </button>
                  ))}
                </div>
              </Field>
              )}

              {removableBackground.enabled && backgroundId !== "none" && (
                <Field
                  label={`${t("createVideo.avatarSetup.background.intensityLabel")} (${Math.round(intensity * 100)}%)`}
                  help={t("createVideo.avatarSetup.background.intensityHelp")}
                >
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(intensity * 100)}
                    onChange={(e) => setIntensity(Number(e.target.value) / 100)}
                  />
                </Field>
              )}

              <Field
                label={t("createVideo.avatarSetup.imageQuality.label")}
                help={t("createVideo.avatarSetup.imageQuality.help")}
              >
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => updateQuality({ mode: "auto" })}
                    style={{ borderColor: quality.mode === "auto" ? "var(--color-primary)" : undefined }}
                  >
                    {t("createVideo.avatarSetup.imageQuality.auto")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => updateQuality({ mode: "manual" })}
                    style={{ borderColor: quality.mode === "manual" ? "var(--color-primary)" : undefined }}
                  >
                    {t("createVideo.avatarSetup.imageQuality.manual")}
                  </button>
                </div>
              </Field>

              {quality.mode === "manual" && (
                <>
                  <Field
                    label={`${t("createVideo.avatarSetup.imageQuality.brightness")} (${quality.brightness})`}
                  >
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={quality.brightness}
                      onChange={(e) => updateQuality({ brightness: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={`${t("createVideo.avatarSetup.imageQuality.contrast")} (${quality.contrast})`}>
                    <input
                      type="range"
                      min={-100}
                      max={100}
                      value={quality.contrast}
                      onChange={(e) => updateQuality({ contrast: Number(e.target.value) })}
                    />
                  </Field>
                  <Field
                    label={`${t("createVideo.avatarSetup.imageQuality.sharpness")} (${quality.sharpness}%)`}
                  >
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={quality.sharpness}
                      onChange={(e) => updateQuality({ sharpness: Number(e.target.value) })}
                    />
                  </Field>
                  <Field label={`${t("createVideo.avatarSetup.imageQuality.denoise")} (${quality.denoise}%)`}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={quality.denoise}
                      onChange={(e) => updateQuality({ denoise: Number(e.target.value) })}
                    />
                  </Field>
                </>
              )}
            </div>
            <div>
              {/* O erro fica NESTA coluna, e não na da câmera, porque é aqui
                  que ficam as ações que falham — enviar foto e enviar o vídeo
                  de referência. "Créditos esgotados" aparecia do outro lado da
                  tela, longe do botão que o produziu. */}
              {actionError && (
                <div className="alert alert-error" style={{ marginBottom: 12 }}>
                  {actionError}
                </div>
              )}

              <div className="card-title">
                {t("createVideo.avatarSetup.facePhotos", { count: draftAvatar.photo_urls.length })}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {PHOTO_SLOTS.map((slot, i) => (
                  <div key={slot} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 90, fontSize: 13 }} className="text-muted">
                      {slot}
                    </span>
                    {draftAvatar.photo_urls[i] ? (
                      <img
                        src={draftAvatar.photo_urls[i]}
                        alt={slot}
                        style={{ width: 48, height: 48, borderRadius: 8, objectFit: "cover" }}
                      />
                    ) : (
                      <button className="btn btn-outline" onClick={handleCapturePhoto} disabled={!camera.ready}>
                        {t("createVideo.avatarSetup.capture")}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Fora dos slots, e não dentro de cada um, porque o backend
                  anexa ao fim da lista: um botão por slot prometeria escolher
                  a posição, e a foto cairia na primeira vaga livre de
                  qualquer jeito. */}
              {draftAvatar.photo_urls.length < PHOTO_SLOTS.length && (
                <div style={{ marginTop: 8 }}>
                  <button className="btn btn-ghost" onClick={() => photoFileInput.current?.click()}>
                    {t("createVideo.avatarSetup.orUploadPhoto")}
                  </button>
                  <input
                    ref={photoFileInput}
                    type="file"
                    accept="image/*"
                    multiple
                    hidden
                    onChange={handlePhotoFileChange}
                  />
                  <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                    {t("createVideo.avatarSetup.uploadPhotoHint")}
                  </p>
                </div>
              )}

              <div className="card-title" style={{ marginTop: 20 }}>
                {t("createVideo.avatarSetup.referenceVideoTitle")}
              </div>
              {/* O que o fornecedor espera, ANTES de gravar. É texto, não
                  validação: nada aqui bloqueia o envio. Dizer depois — na
                  recusa por tamanho, ou pior, num avatar de qualidade ruim —
                  custa uma regravação inteira. */}
              {!draftAvatar.reference_video_url && (
                <p className="text-muted" style={{ fontSize: 12, marginTop: 4, marginBottom: 8 }}>
                  {t("createVideo.avatarSetup.referenceGuidance")}
                </p>
              )}

              {draftAvatar.reference_video_url ? (
                <p className="text-muted">{t("createVideo.avatarSetup.referenceSaved")}</p>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {!recorder.isRecording ? (
                    <button className="btn btn-outline" onClick={handleStartRecording} disabled={!camera.ready}>
                      {t("createVideo.avatarSetup.recordWithCamera")}
                    </button>
                  ) : (
                    <button className="btn btn-secondary" onClick={recorder.stop}>
                      {t("createVideo.avatarSetup.stopRecording")}
                    </button>
                  )}
                  {recorder.recordedBlob && (
                    <button className="btn btn-primary" onClick={handleUploadRecording}>
                      {t("createVideo.avatarSetup.saveRecording")}
                    </button>
                  )}
                  <button className="btn btn-ghost" onClick={() => referenceFileInput.current?.click()}>
                    {t("createVideo.avatarSetup.orUploadFile")}
                  </button>
                  <input
                    ref={referenceFileInput}
                    type="file"
                    accept="video/*,audio/*"
                    hidden
                    onChange={handleReferenceFileChange}
                  />
                </div>
              )}

              {/* Progresso em direção à META, não ao teto. O contador anterior
                  dizia "0:15 de 2:00 — para sozinho em 105s": vigiava o limite
                  superior e deixava a meta inferior invisível, que foi como um
                  clone acabou treinado com 15,37 s de amostra. */}
              {recorder.isRecording && <RecordingProgress elapsedSeconds={recorder.elapsedSeconds} />}

              {/* Depois de parar, o veredito PERMANECE: é o último momento em
                  que regravar ainda é barato. Some quando a gravação já foi
                  enviada. */}
              {!recorder.isRecording && recorder.recordedBlob && !draftAvatar.reference_video_url && (
                <RecordingProgress elapsedSeconds={recorder.elapsedSeconds} />
              )}

              {/* Tamanho SEMPRE que houver gravação, não só quando estoura:
                  é o número que explica um envio lento e o único jeito de
                  comparar com o teto antes de tentar. */}
              {recorder.recordedBlob && !draftAvatar.reference_video_url && (
                <p
                  className={recorder.isOverSizeLimit ? "alert-error" : "text-muted"}
                  style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}
                >
                  {recorder.isOverSizeLimit
                    ? t("createVideo.avatarSetup.recordingTooLarge", {
                        size: formatBytes(recorder.recordedBlob.size),
                        max: formatBytes(MAX_REFERENCE_VIDEO_BYTES),
                      })
                    : t("createVideo.avatarSetup.recordingSize", {
                        size: formatBytes(recorder.recordedBlob.size),
                        max: formatBytes(MAX_REFERENCE_VIDEO_BYTES),
                      })}
                </p>
              )}

              <div className="card-title" style={{ marginTop: 20 }}>
                {t("createVideo.avatarSetup.audioTreatment.title")}
              </div>
              <Field help={t("createVideo.avatarSetup.audioTreatment.help")}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleAudioTreatmentToggle(true)}
                    style={{
                      borderColor: draftAvatar.audio_treatment_enabled ? "var(--color-primary)" : undefined,
                    }}
                  >
                    {t("createVideo.avatarSetup.audioTreatment.enabled")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => handleAudioTreatmentToggle(false)}
                    style={{
                      borderColor: !draftAvatar.audio_treatment_enabled ? "var(--color-primary)" : undefined,
                    }}
                  >
                    {t("createVideo.avatarSetup.audioTreatment.disabled")}
                  </button>
                </div>
              </Field>

              {draftAvatar.audio_treatment_enabled && (
                <Field
                  label={`${t("createVideo.avatarSetup.audioTreatment.targetLufsLabel")} (${targetLufsDraft} LUFS)`}
                  help={t("createVideo.avatarSetup.audioTreatment.targetLufsHelp")}
                >
                  <input
                    type="range"
                    min={-24}
                    max={-6}
                    value={targetLufsDraft}
                    onChange={(e) => setTargetLufsDraft(Number(e.target.value))}
                    onMouseUp={() => commitTargetLufs(targetLufsDraft)}
                    onTouchEnd={() => commitTargetLufs(targetLufsDraft)}
                  />
                </Field>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2" style={{ marginBottom: 20 }}>
            <div>
              <div className="card-title">{t("createVideo.avatarSetup.scenarioTitle")}</div>
              <Field
                label={t("createVideo.avatarSetup.uploadImageLabel")}
                help={t("createVideo.avatarSetup.scenarioHelp")}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleAssetUpload("scenario", e.target.files[0])}
                />
              </Field>
              {defaults.scenario && (
                <p className="text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 16 }}>
                  {t("createVideo.avatarSetup.imageSaved")}
                </p>
              )}
              <Field
                label={t("createVideo.avatarSetup.generateViaAiLabel")}
                help={t("createVideo.avatarSetup.scenarioPromptHelp")}
                helpPrompt={t("createVideo.avatarSetup.scenarioHelpPrompt")}
              >
                <input
                  placeholder={t("createVideo.avatarSetup.scenarioPlaceholder")}
                  value={defaults.scenarioPrompt}
                  onChange={(e) => onDefaultsChange({ ...defaults, scenarioPrompt: e.target.value })}
                />
              </Field>
            </div>
            <div>
              <div className="card-title">{t("createVideo.avatarSetup.outfitTitle")}</div>
              <Field
                label={t("createVideo.avatarSetup.uploadImageLabel")}
                help={t("createVideo.avatarSetup.outfitHelp")}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleAssetUpload("outfit", e.target.files[0])}
                />
              </Field>
              {defaults.outfit && (
                <p className="text-muted" style={{ fontSize: 12, marginTop: -8, marginBottom: 16 }}>
                  {t("createVideo.avatarSetup.imageSaved")}
                </p>
              )}
              <Field
                label={t("createVideo.avatarSetup.generateViaAiLabel")}
                help={t("createVideo.avatarSetup.outfitPromptHelp")}
                helpPrompt={t("createVideo.avatarSetup.outfitHelpPrompt")}
              >
                <input
                  placeholder={t("createVideo.avatarSetup.outfitPlaceholder")}
                  value={defaults.outfitPrompt}
                  onChange={(e) => onDefaultsChange({ ...defaults, outfitPrompt: e.target.value })}
                />
              </Field>
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleFinishSetup}
            disabled={draftAvatar.photo_urls.length < 3 || !draftAvatar.reference_video_url}
          >
            {t("createVideo.avatarSetup.finishSetup")}
          </button>
        </>
      )}
    </div>
  );
}
