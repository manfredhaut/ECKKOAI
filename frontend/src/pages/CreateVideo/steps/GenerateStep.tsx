import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../../api/client";
import type { Video } from "../../../types";
import { StatusPill } from "../../../components/ui/StatusPill";
import type { WizardState } from "../types";

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

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function handleGenerate() {
    setSubmitting(true);
    try {
      const created = await api.post<Video>("/videos", {
        avatar_id: wizard.avatarId,
        script: wizard.script,
        scenario: wizard.scenario || null,
        outfit: wizard.outfit || null,
        scenario_prompt: wizard.scenarioPrompt || null,
        outfit_prompt: wizard.outfitPrompt || null,
        duration_seconds: wizard.durationSeconds,
      });
      setVideo(created);
      pollRef.current = window.setInterval(async () => {
        const latest = await api.get<Video>(`/videos/${created.id}`);
        setVideo(latest);
        if (latest.status === "ready" || latest.status === "error") {
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      }, 2000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card">
      <div className="card-title">{t("createVideo.generate.title")}</div>

      {!video ? (
        <button className="btn btn-primary" onClick={handleGenerate} disabled={submitting || !wizard.script}>
          {submitting ? t("createVideo.generate.submitting") : t("createVideo.generate.generateButton")}
        </button>
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
              <video
                src={video.output_url}
                controls
                style={{ width: "100%", maxWidth: 480, borderRadius: "var(--radius-card)" }}
              />
              <div style={{ marginTop: 12 }}>
                <a className="btn btn-primary" href={`/api/videos/${video.id}/download`} download>
                  {t("createVideo.generate.download")}
                </a>
              </div>
            </>
          )}

          {video.status === "error" && (
            <p style={{ color: "var(--color-tertiary)" }}>
              {video.error_message || t("createVideo.generate.failed")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
