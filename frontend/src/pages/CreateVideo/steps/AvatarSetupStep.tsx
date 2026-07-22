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
  const [intensity, setIntensity] = useState(1);
  const [quality, setQualityState] = useState<QualityOptions>(DEFAULT_QUALITY);
  const [targetLufsDraft, setTargetLufsDraft] = useState(-16);

  const camera = useCamera();
  const recorder = useMediaRecorderCapture();
  const referenceFileInput = useRef<HTMLInputElement | null>(null);

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

  async function handleCreateAvatar() {
    if (!name) return;
    const avatar = await api.post<Avatar>("/avatars", { name });
    setDraftAvatar(avatar);
    await camera.start();
  }

  async function handleCapturePhoto() {
    if (!draftAvatar) return;
    const blob = await camera.capturePhoto();
    if (!blob) return;
    const updated = await api.upload<Avatar>(`/avatars/${draftAvatar.id}/photos`, blob, "photo.jpg");
    setDraftAvatar(updated);
  }

  function handleStartRecording() {
    const stream = camera.getRecordingStream();
    if (stream) recorder.start(stream);
  }

  async function handleUploadRecording() {
    if (!draftAvatar || !recorder.recordedBlob) return;
    const updated = await api.upload<Avatar>(
      `/avatars/${draftAvatar.id}/reference-video`,
      recorder.recordedBlob,
      "reference.webm",
    );
    setDraftAvatar(updated);
  }

  async function handleReferenceFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !draftAvatar) return;
    const updated = await api.upload<Avatar>(
      `/avatars/${draftAvatar.id}/reference-video`,
      file,
      file.name,
    );
    setDraftAvatar(updated);
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

              {backgroundId !== "none" && (
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

              <div className="card-title" style={{ marginTop: 20 }}>
                {t("createVideo.avatarSetup.referenceVideoTitle")}
              </div>
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
