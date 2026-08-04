/**
 * Captura de voz e clonagem — rota dedicada.
 *
 * POR QUE UMA ROTA NOVA, e não um campo a mais em
 * `POST /avatars/:id/reference-video`: aquela rota TREINA O AVATAR antes de
 * clonar (`trainAvatar`, US$ 1,00 de `photo_avatar` mais 1 crédito de avatar).
 * Quem quer só regravar a voz não pode ser obrigado a pagar um treino novo e a
 * trocar uma aparência já aprovada — foi o aviso registrado no fim do bloco 5D,
 * e é o caminho mais caro do produto.
 *
 * Aqui a clonagem acontece SOZINHA: nenhum crédito é debitado, nenhum avatar é
 * retreinado, e o único recurso consumido é o slot de voz do fornecedor.
 *
 * A ORDEM das verificações é a coisa mais importante deste arquivo, e é
 * crescente em custo:
 *
 *   1. formato e tamanho  — bytes já na mão, custo zero
 *   2. duração            — ffprobe local, custo zero
 *   3. substituição       — linha do banco já lida, custo zero
 *   4. slots              — UMA leitura ao fornecedor (GET, não tarifado)
 *   5. clonagem           — consome o slot IRREVERSÍVEL
 *
 * Inverter 4 e 5 pareceria mais simples (deixar o fornecedor recusar) e seria
 * pior: a recusa dele chega depois de a tentativa ter sido gasta, e vem como
 * um 4xx indistinguível dos outros na nossa camada.
 */
import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import type { Avatar } from "../types.js";
import { cloneVoice, listVoices } from "../services/providers/voiceProvider.js";
import { getCredential } from "../services/credentialLookup.js";
import { takeUpload } from "../services/uploadLimits.js";
import { saveUpload } from "../services/storage.js";
import { requireActiveTenant } from "../middleware/requireActiveTenant.js";
import { toClientVendorError, vendorErrorStatus } from "../services/providers/vendorError.js";
import { LiveBudgetExhaustedError } from "../services/providers/liveGuard.js";
import { logEvent } from "../services/log/safeLog.js";
import {
  MIN_SAMPLE_SECONDS,
  RECOMMENDED_SAMPLE_SECONDS,
  VOICE_SAMPLE_MAX_BYTES,
  checkSampleDuration,
  checkSampleFormat,
  checkVoiceReplacement,
  checkVoiceSlots,
  voiceSlotLimit,
} from "../services/voice/voiceSample.js";
import {
  normalizeVoiceSample,
  probeSampleDurationSeconds,
} from "../services/voice/voiceSampleAudio.js";

export async function voiceRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Os números que a TELA precisa para desabilitar o botão pelo mesmo critério
   * que o servidor usa para recusar.
   *
   * Mesmo desenho do predicado de geração (`generationReadiness`): a tela e a
   * rota consomem a MESMA fonte. Uma tela que conhece três condições e um
   * servidor que recusa por cinco produz o pior desfecho possível — botão
   * habilitado seguido de erro, com o arquivo já enviado.
   */
  app.get("/voice/sample-policy", async () => ({
    min_seconds: MIN_SAMPLE_SECONDS,
    recommended_seconds: RECOMMENDED_SAMPLE_SECONDS,
    max_bytes: VOICE_SAMPLE_MAX_BYTES,
  }));

  app.post<{ Params: { id: string } }>(
    "/avatars/:id/voice-sample",
    { preHandler: requireActiveTenant },
    async (req, reply) => {
      // Teto SÓ desta rota, como manda uploadLimits.ts. O do vídeo de
      // referência (100 MB) seria dez vezes o que o fornecedor de voz aceita —
      // e um teto mais frouxo que o do destino apenas adia a recusa.
      const up = await takeUpload(req, reply, {
        maxBytes: VOICE_SAMPLE_MAX_BYTES,
        route: "voice.sample",
        kind: "video",
      });
      if (!up) return reply;
      const { file, buffer } = up;

      // A flag de substituição viaja no multipart, junto do arquivo. Fastify
      // entrega campos de texto em `file.fields`; qualquer valor diferente de
      // "true" é tratado como ausência — um `replace=maybe` não pode virar
      // autorização por descuido de parsing.
      const campoReplace = (file.fields as Record<string, { value?: unknown } | undefined>)?.replace;
      const replace = String(campoReplace?.value ?? "") === "true";

      const { rows: avatarRows } = await pool.query<Avatar>(
        "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",
        [req.params.id, req.tenantId],
      );
      const avatar = avatarRows[0];
      if (!avatar) return reply.code(404).send({ error: "Avatar not found" });

      const voiceCredential = await getCredential(req.tenantId, "voice");
      if (!voiceCredential) {
        return reply.code(400).send({
          error: "no_voice_credential",
          message:
            "Conecte a chave do provedor de voz em Configurações antes de gravar uma amostra.",
        });
      }

      // --- 1. GUARDA D: formato e tamanho --------------------------------
      const formato = checkSampleFormat({
        buffer,
        declaredMimeType: file.mimetype ?? null,
      });
      if (!formato.ok) {
        logEvent("info", "voice_sample_rejected", {
          reason: formato.code,
          bytes: buffer.length,
          declared: file.mimetype,
        });
        return reply.code(400).send({ error: formato.code, message: formato.message });
      }

      // --- 2. GUARDA A: duração ------------------------------------------
      const duracao = await probeSampleDurationSeconds(buffer);
      const veredictoDuracao = checkSampleDuration(duracao);
      if (!veredictoDuracao.ok) {
        logEvent("info", "voice_sample_rejected", {
          reason: veredictoDuracao.code,
          durationSeconds: duracao,
        });
        return reply
          .code(422)
          .send({ error: veredictoDuracao.code, message: veredictoDuracao.message });
      }

      // --- 3. GUARDA C: substituição -------------------------------------
      const substituicao = checkVoiceReplacement({
        currentVoiceId: avatar.voice_id,
        replace,
      });
      if (!substituicao.ok) {
        logEvent("info", "voice_sample_rejected", {
          reason: substituicao.code,
          avatarId: avatar.id,
        });
        return reply.code(409).send({
          error: substituicao.code,
          message: substituicao.message,
          // A tela precisa saber que existe um caminho (mandar `replace`) para
          // `voice_exists`, e que NÃO existe para `voice_protected`.
          replaceable: substituicao.code === "voice_exists",
        });
      }

      // --- 4. GUARDA B: slots --------------------------------------------
      // Única chamada ao fornecedor antes da clonagem, e é de leitura.
      let inventario: { total: number; cloned: number };
      try {
        inventario = await listVoices(voiceCredential.apiKey);
      } catch (err) {
        const { failure, message } = toClientVendorError("voice", "voice.listVoices", err);
        return reply.code(vendorErrorStatus(failure)).send({ error: "voice_provider_error", message });
      }
      const limite = voiceSlotLimit();
      const slots = checkVoiceSlots({ used: inventario.total, limit: limite });
      if (!slots.ok) {
        logEvent("error", "voice_sample_rejected", {
          reason: slots.code,
          used: inventario.total,
          limit: limite,
        });
        return reply.code(409).send({ error: slots.code, message: slots.message });
      }

      // --- 5. clonagem ----------------------------------------------------
      // Guardar a amostra ANTES de clonar. Se a clonagem falhar, o arquivo que
      // a pessoa acabou de gravar continua existindo — sem isso, uma falha do
      // fornecedor custa a regravação inteira, e é o momento em que ela menos
      // vai querer gravar de novo.
      const sampleUrl = await saveUpload(req.tenantId, buffer, file.filename || "voice-sample");

      const normalizada = await normalizeVoiceSample(buffer);

      let voiceId: string;
      try {
        ({ voiceId } = await cloneVoice({
          apiKey: voiceCredential.apiKey,
          name: avatar.name,
          fileBuffer: normalizada.buffer,
          filename: normalizada.filename,
          mimeType: normalizada.mimeType,
        }));
      } catch (err) {
        if (err instanceof LiveBudgetExhaustedError) {
          logEvent("error", "live_budget_exhausted", {
            context: "voice.sample",
            used: err.used,
            max: err.max,
          });
          return reply.code(429).send({ error: "live_budget_exhausted", message: err.message });
        }
        const { failure, message } = toClientVendorError("voice", "voice.cloneVoice", err);
        return reply.code(vendorErrorStatus(failure)).send({ error: "voice_provider_error", message });
      }

      // O id ANTERIOR vai para o log antes de ser sobrescrito. É a única
      // chance: a coluna guarda um valor só, e depois do UPDATE o id antigo
      // não existe em lugar nenhum deste sistema — a voz continua na conta do
      // fornecedor, mas sem nome que a ligue de volta a este avatar.
      if (avatar.voice_id) {
        logEvent("info", "voice_id_replaced", {
          avatarId: avatar.id,
          previousVoiceId: avatar.voice_id,
          newVoiceId: voiceId,
        });
      }

      const { rows: updated } = await pool.query<Avatar>(
        "UPDATE avatars SET voice_id = $3 WHERE id = $1 AND tenant_id = $2 RETURNING *",
        [req.params.id, req.tenantId, voiceId],
      );

      return reply.code(201).send({
        avatar: updated[0],
        sample_url: sampleUrl,
        duration_seconds: duracao,
        // O aviso da faixa 60–90 s sobe junto com o sucesso, e não como erro:
        // é informação, não recusa.
        warning: veredictoDuracao.warning ?? null,
        voice_slots: { used: inventario.total + 1, limit: limite },
      });
    },
  );
}
