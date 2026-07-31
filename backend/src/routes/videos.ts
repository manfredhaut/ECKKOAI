import type { FastifyInstance } from "fastify";
import path from "node:path";
import { pool } from "../db/pool.js";
import type { Avatar, Video } from "../types.js";
import { generateVideo, pollVideoJob, AvatarProviderError } from "../services/providers/avatarProvider.js";
import type { AvatarVendor } from "../services/providers/vendorCatalog.js";
import { getCredential } from "../services/credentialLookup.js";
import { createNotification } from "../services/notifications.js";
import { recordProviderUsage } from "../services/billing/usageTracking.js";
import { debitCredit } from "../services/billing/creditGate.js";
import { requireActiveTenant } from "../middleware/requireActiveTenant.js";
import { proxyRemoteAttachment } from "../services/downloadProxy.js";
import { toClientVendorError, vendorErrorStatus } from "../services/providers/vendorError.js";
import { isFixtureMode } from "../services/providers/providerMode.js";

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 90; // ~7.5 minutes

function pollJob(
  videoId: string,
  tenantId: string,
  apiKey: string,
  vendor: AvatarVendor,
  jobId: string,
  durationSeconds: number,
): void {
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts += 1;
    try {
      const result = await pollVideoJob(vendor, apiKey, jobId);
      if (result.status === "ready") {
        clearInterval(interval);
        await pool.query("UPDATE videos SET status = 'ready', output_url = $2 WHERE id = $1", [
          videoId,
          result.outputUrl,
        ]);
        await createNotification(tenantId, "video_ready", "Your video is ready.");
        // duration_seconds is the requested length, not a value the vendor
        // confirms back — the closest available proxy for billed seconds
        // (see CLAUDE.md / billing plan, Fase 1: neither HeyGen nor D-ID's
        // poll response is parsed for an actual rendered duration today).
        await recordProviderUsage({
          tenantId,
          videoId,
          provider: "avatar",
          vendor,
          unitType: "seconds",
          unitCount: durationSeconds,
        });
      } else if (result.status === "error") {
        clearInterval(interval);
        const { message: pollMessage } = toClientVendorError("avatar", "videos.poll", new Error(result.errorMessage));
        await pool.query("UPDATE videos SET status = 'error', error_message = $2 WHERE id = $1", [
          videoId,
          pollMessage,
        ]);
        await createNotification(tenantId, "video_error", pollMessage);
      } else if (attempts === 1) {
        await pool.query("UPDATE videos SET status = 'processing' WHERE id = $1", [videoId]);
      }
    } catch (err) {
      const { message } = toClientVendorError("avatar", "videos.pollLoop", err);
      clearInterval(interval);
      await pool
        .query("UPDATE videos SET status = 'error', error_message = $2 WHERE id = $1", [videoId, message])
        .catch(() => {});
    }
    if (attempts >= MAX_POLL_ATTEMPTS) {
      clearInterval(interval);
      await pool
        .query("UPDATE videos SET status = 'error', error_message = 'O serviço de vídeo demorou mais que o esperado. Tente gerar novamente.' WHERE id = $1 AND status != 'ready'", [
          videoId,
        ])
        .catch(() => {});
    }
  }, POLL_INTERVAL_MS);
}

export async function videoRoutes(app: FastifyInstance): Promise<void> {
  app.get("/videos", async (req) => {
    const { rows } = await pool.query<Video>(
      "SELECT * FROM videos WHERE tenant_id = $1 ORDER BY created_at DESC",
      [req.tenantId],
    );
    return rows;
  });

  app.get<{ Params: { id: string } }>("/videos/:id", async (req, reply) => {
    const { rows } = await pool.query<Video>(
      "SELECT * FROM videos WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Video not found" });
    return rows[0];
  });

  // Proxies the vendor's output_url through our own server instead of
  // linking it directly — HeyGen/D-ID host the file on their own CDN, so a
  // plain <a href download> would be cross-origin and the browser silently
  // ignores the `download` attribute in that case (confirmed live: the tab
  // just navigates to the CDN URL instead of saving the file).
  app.get<{ Params: { id: string } }>("/videos/:id/download", async (req, reply) => {
    const { rows } = await pool.query<Video>(
      "SELECT * FROM videos WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    const video = rows[0];
    if (!video || !video.output_url) return reply.code(404).send({ error: "Video not found" });

    let ext = ".mp4";
    try {
      ext = path.extname(new URL(video.output_url).pathname) || ".mp4";
    } catch {
      // Malformed output_url — fall back to the .mp4 default above.
    }

    try {
      await proxyRemoteAttachment(reply, video.output_url, `video-${video.id}${ext}`);
      return reply;
    } catch (err) {
      console.error(JSON.stringify({ event: "download_failed", context: "videos.download", detail: err instanceof Error ? err.message : String(err) }));
      return reply.code(502).send({ error: "download_failed", message: "Não foi possível baixar o vídeo agora. Tente novamente." });
    }
  });

  app.post<{
    Body: {
      avatar_id: string | null;
      script: string;
      scenario: string | null;
      outfit: string | null;
      scenario_prompt: string | null;
      outfit_prompt: string | null;
      duration_seconds: number;
    };
  }>("/videos", { preHandler: requireActiveTenant }, async (req, reply) => {
    const {
      avatar_id,
      script,
      scenario,
      outfit,
      scenario_prompt: scenarioPrompt,
      outfit_prompt: outfitPrompt,
      duration_seconds,
    } = req.body;

    if (!avatar_id) {
      return reply.code(400).send({ error: "avatar_id is required to generate a video" });
    }

    const { rows: avatarRows } = await pool.query<Avatar>(
      "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",
      [avatar_id, req.tenantId],
    );
    const avatar = avatarRows[0];
    if (!avatar?.provider_avatar_id) {
      return reply.code(400).send({ error: "This avatar hasn't finished training yet." });
    }

    const avatarCredential = await getCredential(req.tenantId, "avatar");
    if (!avatarCredential) {
      return reply.code(400).send({
        error: "no_avatar_credential",
        message: "Connect the avatar provider's API key in Settings to generate a video.",
      });
    }
    const voiceCredential = await getCredential(req.tenantId, "voice");

    const { rows } = await pool.query<Video>(
      `INSERT INTO videos (tenant_id, avatar_id, script, scenario, outfit, scenario_prompt, outfit_prompt, duration_seconds, status, provider_vendor, simulated)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', $9, $10) RETURNING *`,
      [req.tenantId, avatar_id, script, scenario, outfit, scenarioPrompt, outfitPrompt, duration_seconds, avatarCredential.vendor, isFixtureMode()],
    );
    const video = rows[0];

    // videos itself is the historical/telemetry record here (no separate
    // table needed, unlike script_generations/avatar_trainings) — the row
    // above is created unconditionally, debitCredit() below is what
    // actually gates/consumes, linked back via related_video_id.
    const debit = await debitCredit({
      tenantId: req.tenantId,
      creditType: "video",
      relatedVideoId: video.id,
    });
    if (!debit.ok) {
      await pool.query(
        "UPDATE videos SET status = 'error', error_message = 'Insufficient credits' WHERE id = $1",
        [video.id],
      );
      return reply.code(403).send({
        error: "plan_limit_reached",
        message: "Créditos esgotados — adicione créditos ou aguarde a renovação mensal do seu plano.",
      });
    }

    try {
      const { providerJobId } = await generateVideo({
        apiKey: avatarCredential.apiKey,
        vendor: avatarCredential.vendor as AvatarVendor,
        providerAvatarId: avatar.provider_avatar_id,
        script,
        elevenLabsApiKey: voiceCredential?.apiKey ?? null,
        voiceId: avatar.voice_id,
        tenantId: req.tenantId,
        audioTreatmentEnabled: avatar.audio_treatment_enabled,
        audioTreatmentTargetLufs: Number(avatar.audio_treatment_target_lufs),
      });
      await pool.query("UPDATE videos SET provider_job_id = $2 WHERE id = $1", [video.id, providerJobId]);
      pollJob(
        video.id,
        req.tenantId,
        avatarCredential.apiKey,
        avatarCredential.vendor as AvatarVendor,
        providerJobId,
        duration_seconds,
      );
    } catch (err) {
      const { message } = toClientVendorError("avatar", "videos.create", err);
      const { rows: errored } = await pool.query<Video>(
        "UPDATE videos SET status = 'error', error_message = $2 WHERE id = $1 RETURNING *",
        [video.id, message],
      );
      return reply.code(201).send(errored[0]);
    }

    return reply.code(201).send(video);
  });
}
