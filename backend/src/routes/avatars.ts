import type { FastifyInstance } from "fastify";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import type { Avatar } from "../types.js";
import { trainAvatar } from "../services/providers/avatarProvider.js";
import { cloneVoice, VoiceProviderError } from "../services/providers/voiceProvider.js";
import { getCredential } from "../services/credentialLookup.js";
import { referenceVideoMaxBytes, tooLargeMessage } from "../services/uploadLimits.js";
import { isFixtureMode } from "../services/providers/providerMode.js";
import { saveUpload, readUpload } from "../services/storage.js";
import { requireActiveTenant } from "../middleware/requireActiveTenant.js";
import { debitCredit, refundCredit } from "../services/billing/creditGate.js";
import { sendAttachment, contentTypeForExtension } from "../services/downloadProxy.js";
import { toClientVendorError, vendorErrorStatus } from "../services/providers/vendorError.js";

export async function avatarRoutes(app: FastifyInstance): Promise<void> {
  app.get("/avatars", async (req) => {
    const { rows } = await pool.query<Avatar>(
      "SELECT * FROM avatars WHERE tenant_id = $1 ORDER BY created_at DESC",
      [req.tenantId],
    );
    return rows;
  });

  app.get<{ Params: { id: string } }>("/avatars/:id", async (req, reply) => {
    const { rows } = await pool.query<Avatar>(
      "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Avatar not found" });
    return rows[0];
  });

  // Downloads the reference video/audio used to train this avatar — the
  // one asset with a real counterpart to a video's output_url (a single
  // file, not an array like photo_urls). No provider "preview" exists to
  // offer instead: trainAvatar() only ever gets back a providerAvatarId
  // (see avatarProvider.ts), HeyGen/D-ID never return a preview asset we
  // store. Reference photos aren't included here either — they're 3
  // separate images with no single "download" action; same-origin
  // /uploads/<tenant>/<file> links already work for those without this
  // route if ever needed.
  app.get<{ Params: { id: string } }>("/avatars/:id/reference-video/download", async (req, reply) => {
    const { rows } = await pool.query<Avatar>(
      "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    const avatar = rows[0];
    if (!avatar || !avatar.reference_video_url) {
      return reply.code(404).send({ error: "Avatar not found" });
    }

    const ext = path.extname(avatar.reference_video_url);
    try {
      const buffer = await readUpload(avatar.reference_video_url);
      sendAttachment(reply, buffer, `avatar-reference-${avatar.id}${ext}`, contentTypeForExtension(ext));
      return reply;
    } catch (err) {
      console.error(JSON.stringify({ event: "download_failed", context: "avatars.referenceVideo", detail: err instanceof Error ? err.message : String(err) }));
      return reply.code(502).send({ error: "download_failed", message: "Não foi possível baixar o arquivo agora. Tente novamente." });
    }
  });

  app.post<{ Body: { name: string } }>("/avatars", async (req, reply) => {
    const { name } = req.body;
    const { rows } = await pool.query<Avatar>(
      "INSERT INTO avatars (tenant_id, name) VALUES ($1, $2) RETURNING *",
      [req.tenantId, name],
    );
    return reply.code(201).send(rows[0]);
  });

  app.put<{
    Params: { id: string };
    Body: Partial<
      Pick<Avatar, "name" | "provider" | "audio_treatment_enabled" | "audio_treatment_target_lufs">
    >;
  }>("/avatars/:id", async (req, reply) => {
    const { name, provider, audio_treatment_enabled, audio_treatment_target_lufs } = req.body;
    const { rows } = await pool.query<Avatar>(
      `UPDATE avatars SET
         name = COALESCE($3, name),
         provider = COALESCE($4, provider),
         audio_treatment_enabled = COALESCE($5, audio_treatment_enabled),
         audio_treatment_target_lufs = COALESCE($6, audio_treatment_target_lufs)
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [
        req.params.id,
        req.tenantId,
        name ?? null,
        provider ?? null,
        audio_treatment_enabled ?? null,
        audio_treatment_target_lufs ?? null,
      ],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Avatar not found" });
    return rows[0];
  });

  app.delete<{ Params: { id: string } }>("/avatars/:id", async (req, reply) => {
    const { rows } = await pool.query<Avatar>(
      "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    const avatar = rows[0];
    if (avatar) {
      const filesToDelete = [...avatar.photo_urls, avatar.reference_video_url].filter(
        (url): url is string => !!url,
      );
      await Promise.all(
        filesToDelete.map((url) =>
          unlink(path.join(config.uploadsDir, url.replace("/uploads/", ""))).catch(() => {}),
        ),
      );
      await pool.query("DELETE FROM avatars WHERE id = $1 AND tenant_id = $2", [
        req.params.id,
        req.tenantId,
      ]);
    }
    return reply.code(204).send();
  });

  // Upload one of the 3 setup photos (front / left / right).
  app.post<{ Params: { id: string } }>("/avatars/:id/photos", async (req, reply) => {
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "No file uploaded" });
    const url = await saveUpload(req.tenantId, await file.toBuffer(), file.filename);
    const { rows } = await pool.query<Avatar>(
      `UPDATE avatars SET photo_urls = photo_urls || to_jsonb($3::text)
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId, url],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Avatar not found" });
    return rows[0];
  });

  // Upload a recorded or provided reference video/audio, then kick off
  // avatar training (required credential) and voice cloning (optional —
  // skipped if no voice credential is connected yet).
  app.post<{ Params: { id: string } }>(
    "/avatars/:id/reference-video",
    { preHandler: requireActiveTenant },
    async (req, reply) => {
    // Teto SÓ desta rota. O padrão global do multipart (1 MiB, herdado do
    // bodyLimit do Fastify) continua valendo em todas as outras — ver
    // services/uploadLimits.ts para por que não sobe globalmente.
    const maxBytes = referenceVideoMaxBytes();

    // O estouro pode aparecer em DOIS lugares: ao pegar o arquivo e ao
    // materializá-lo (@fastify/multipart index.js:379 lança em toBuffer()
    // quando o stream foi truncado). Tratar só o primeiro deixaria o caso
    // comum — arquivo grande que começa a chegar normalmente — cair como 500.
    let file: Awaited<ReturnType<typeof req.file>>;
    let buffer: Buffer;
    try {
      file = await req.file({ limits: { fileSize: maxBytes } });
      if (!file) return reply.code(400).send({ error: "No file uploaded" });
      buffer = await file.toBuffer();
    } catch (err) {
      // A mensagem crua ("request file too large, please check multipart
      // config") não permite decidir nada: não diz quanto foi enviado nem
      // quanto cabe, então quem recebe não sabe se corta 5 s ou 5 min.
      if ((err as { code?: string })?.code === "FST_REQ_FILE_TOO_LARGE") {
        const declared = Number(req.headers["content-length"]);
        const sent = Number.isFinite(declared) && declared > 0 ? declared : null;
        console.error(
          JSON.stringify({ event: "upload_too_large", route: "avatars.referenceVideo", sent, maxBytes }),
        );
        return reply.code(413).send({
          error: "file_too_large",
          message: tooLargeMessage(sent, maxBytes),
          maxBytes,
          sentBytes: sent,
        });
      }
      throw err;
    }

    const { rows: existing } = await pool.query<Avatar>(
      "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    if (!existing[0]) return reply.code(404).send({ error: "Avatar not found" });

    const avatarCredential = await getCredential(req.tenantId, "avatar");
    if (!avatarCredential) {
      return reply.code(400).send({
        error: "no_avatar_credential",
        message: "Connect the avatar provider's API key in Settings to train an avatar.",
      });
    }

    // `buffer` já foi materializado acima, junto do tratamento de tamanho.
    const url = await saveUpload(req.tenantId, buffer, file.filename);

    // avatar_trainings keeps recording one row per attempt — now pure
    // history/telemetry (see migration 027), no longer the enforcement
    // mechanism. debitCredit() below is what actually gates/consumes; it
    // links back to this row via related_avatar_training_id.
    const { rows: trainingRows } = await pool.query<{ id: string }>(
      "INSERT INTO avatar_trainings (tenant_id, avatar_id) VALUES ($1, $2) RETURNING id",
      [req.tenantId, req.params.id],
    );

    const debit = await debitCredit({
      tenantId: req.tenantId,
      creditType: "avatar",
      relatedAvatarTrainingId: trainingRows[0].id,
    });
    if (!debit.ok) {
      return reply.code(403).send({
        error: "plan_limit_reached",
        message: "Créditos esgotados — adicione créditos ou aguarde a renovação mensal do seu plano.",
      });
    }

    let providerAvatarId: string;
    try {
      ({ providerAvatarId } = await trainAvatar({
        apiKey: avatarCredential.apiKey,
        vendor: avatarCredential.vendor as "heygen" | "did",
        photoUrls: existing[0].photo_urls,
      }));
    } catch (err) {
      // O fornecedor recusou: nada foi treinado, nenhuma cota externa foi
      // gasta. Cobrar por isso seria cobrar por um erro que não produziu nada
      // — e foi exatamente o que aconteceu no bloco DEMO-2, quando um treino
      // recusado por falta de foto zerou o crédito do tenant.
      await refundCredit({
        tenantId: req.tenantId,
        creditType: "avatar",
        relatedAvatarTrainingId: trainingRows[0].id,
      });
      const { failure, message } = toClientVendorError("avatar", "avatars.train", err);
      return reply.code(vendorErrorStatus(failure)).send({ error: "avatar_provider_error", message });
    }

    // Persist the successful avatar training immediately, before attempting
    // voice cloning below — otherwise a voice-provider failure (rate limit,
    // transient error, etc.) would discard training that already succeeded
    // and cost real provider quota, forcing a wasteful retry from scratch.
    const { rows: trained } = await pool.query<Avatar>(
      `UPDATE avatars SET reference_video_url = $3, provider_avatar_id = $4, provider = $5, simulated = $6
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId, url, providerAvatarId, avatarCredential.vendor, isFixtureMode()],
    );

    const voiceCredential = await getCredential(req.tenantId, "voice");
    if (voiceCredential) {
      try {
        const cloned = await cloneVoice({
          apiKey: voiceCredential.apiKey,
          name: existing[0].name,
          fileBuffer: buffer,
          filename: file.filename,
          mimeType: file.mimetype,
        });
        const { rows: withVoice } = await pool.query<Avatar>(
          `UPDATE avatars SET voice_id = $3 WHERE id = $1 AND tenant_id = $2 RETURNING *`,
          [req.params.id, req.tenantId, cloned.voiceId],
        );
        return withVoice[0];
      } catch (err) {
        // NÃO estorna, de propósito: o treino do avatar acima teve SUCESSO, e
        // é isso que o crédito de avatar paga. O fornecedor de avatar fez o
        // trabalho e gastou cota; a voz não tem crédito próprio. Devolver aqui
        // daria de graça um treino que já foi pago ao fornecedor.
        const { failure, message } = toClientVendorError("voice", "avatars.cloneVoice", err);
        return reply.code(vendorErrorStatus(failure)).send({ error: "voice_provider_error", message });
      }
    }

    return trained[0];
  });
}
