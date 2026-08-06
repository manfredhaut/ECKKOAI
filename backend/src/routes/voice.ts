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
 *   4. conversão e teto   — ffmpeg local, custo zero
 *   5. slots              — UMA leitura ao fornecedor (GET, não tarifado)
 *   6. clonagem           — consome o slot IRREVERSÍVEL
 *
 * Inverter 5 e 6 pareceria mais simples (deixar o fornecedor recusar) e seria
 * pior: a recusa dele chega depois de a tentativa ter sido gasta, e vem como
 * um 4xx indistinguível dos outros na nossa camada.
 *
 * O passo 4 entrou no HIGIENE-1 e é o mesmo raciocínio aplicado ao arquivo que
 * SAI daqui: desde que a conversão é sem perda, uma captura leve pode não caber
 * nos 10 MB do fornecedor. Converter é CPU local — cabe antes da rede.
 */
import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import type { Avatar } from "../types.js";
import type { VoiceInventory } from "../services/providers/voiceProvider.js";
import { cloneVoice, listVoices } from "../services/providers/voiceProvider.js";
import { getCredential } from "../services/credentialLookup.js";
import { takeUpload } from "../services/uploadLimits.js";
import { saveUpload } from "../services/storage.js";
import { requireActiveTenant } from "../middleware/requireActiveTenant.js";
import { toClientVendorError, vendorErrorStatus } from "../services/providers/vendorError.js";
import { LiveBudgetExhaustedError } from "../services/providers/liveGuard.js";
import { logEvent } from "../services/log/safeLog.js";
import {
  MAX_SAMPLE_SECONDS,
  MIN_SAMPLE_SECONDS,
  RECOMMENDED_SAMPLE_SECONDS,
  VOICE_SAMPLE_MAX_BYTES,
  checkNormalizedSampleSize,
  checkSampleDuration,
  checkSampleFormat,
  checkVoiceReplacement,
  checkVoiceSlots,
  voiceIdForLog,
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
    // O TETO em segundos, derivado dos bytes pela mesma função que a rota usa
    // para recusar (`maxSampleSecondsFor`). Sem ele a tela dizia "pode gravar
    // mais, não há limite" — e havia: a 24 kHz cabem 218 s nos 10 MiB do
    // fornecedor, e o que passa disso é recusado depois de a pessoa ter
    // gravado.
    max_seconds: MAX_SAMPLE_SECONDS,
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

      // A PORTA da voz protegida viaja pelo mesmo multipart: o nome do avatar,
      // digitado. Diferente de `replace`, aqui o valor importa — é ele que é
      // comparado com o nome real. String vazia é o mesmo que não digitar.
      const campoConfirmNome = (file.fields as Record<string, { value?: unknown } | undefined>)
        ?.confirm_avatar_name;
      const confirmAvatarName =
        typeof campoConfirmNome?.value === "string" ? campoConfirmNome.value : null;

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
        avatarName: avatar.name,
        confirmAvatarName,
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
          // `voice_exists`.
          replaceable: substituicao.code === "voice_exists",
          // E que para `voice_protected` a porta existe, mas é outra: digitar o
          // NOME do avatar. Sem este campo a tela não teria como oferecer a
          // saída, e a voz aprovada por engano continuaria presa para sempre —
          // que era o estado até aqui. O nome vai junto porque é ele que a
          // pessoa precisa copiar, e pedir que ela o procure noutra tela é
          // convite a digitar errado três vezes.
          requiresAvatarName: substituicao.code === "voice_protected",
          avatarName: substituicao.code === "voice_protected" ? avatar.name : undefined,
        });
      }

      // --- 4. conversão e teto do arquivo CONVERTIDO ----------------------
      //
      // Antes da leitura de slots de propósito, e a razão é a mesma ordem
      // crescente de custo do cabeçalho: converter é CPU local, custo zero, e
      // recusar aqui não toca a rede. A saída é WAV sem perda (~2,8 MB por
      // minuto a 24 kHz), então uma captura leve na entrada ainda pode não caber
      // no destino — e descobrir isso pelo 4xx do fornecedor gastaria uma
      // tentativa para dizer o que já dava para saber sem sair da máquina.
      //
      // Na prática a GUARDA A já barrou o caso por duração, com a mesma conta e
      // sem rodar o ffmpeg. Esta continua aqui porque mede o arquivo REAL: é a
      // única que pega o dia em que os bytes e a conta discordarem.
      //
      // O ORIGINAL é salvo antes de tudo: se qualquer coisa daqui para frente
      // falhar, o arquivo que a pessoa acabou de gravar continua existindo.
      // Sem isso, uma falha custa a regravação inteira, no momento em que ela
      // menos vai querer gravar de novo.
      const sampleUrl = await saveUpload(req.tenantId, buffer, file.filename || "voice-sample");

      const normalizada = await normalizeVoiceSample(buffer);
      const tamanhoConvertido = checkNormalizedSampleSize({
        bytes: normalizada.buffer.length,
      });
      if (!tamanhoConvertido.ok) {
        logEvent("info", "voice_sample_rejected", {
          reason: tamanhoConvertido.code,
          inputBytes: buffer.length,
          convertedBytes: normalizada.buffer.length,
          sampleRateHz: normalizada.sampleRateHz,
          inputSampleRateHz: normalizada.inputSampleRateHz,
          durationSeconds: duracao,
        });
        return reply.code(413).send({
          error: tamanhoConvertido.code,
          message: tamanhoConvertido.message,
          sample_url: sampleUrl,
        });
      }

      // O convertido fica em disco AO LADO do original. É o arquivo que o
      // fornecedor de fato recebe, e sem ele não há como conferir depois o que
      // foi enviado — o original prova o que foi gravado, não o que saiu daqui.
      const normalizedUrl = await saveUpload(req.tenantId, normalizada.buffer, normalizada.filename);

      // --- 5. GUARDA B: slots --------------------------------------------
      // Única chamada ao fornecedor antes da clonagem, e é de leitura.
      // O tipo vem do provider em vez de ser reescrito aqui: a cópia à mão
      // deixou de ter `owned` quando o campo nasceu, e o `tsc` só acusou
      // porque ela era explícita. Uma cópia que acompanha por acaso é pior —
      // ela diverge em silêncio.
      let inventario: VoiceInventory;
      try {
        inventario = await listVoices(voiceCredential.apiKey);
      } catch (err) {
        const { failure, message } = toClientVendorError("voice", "voice.listVoices", err);
        return reply.code(vendorErrorStatus(failure)).send({ error: "voice_provider_error", message });
      }
      const limite = voiceSlotLimit();
      // `owned`, NUNCA `total`: a resposta do fornecedor inclui as vozes
      // `premade` da biblioteca dele, que não são da pessoa e não ocupam slot.
      // Usar `total` aqui recusou uma clonagem legítima em 04/08 com "25 de 10
      // vozes em uso", numa conta que tinha 4.
      const slots = checkVoiceSlots({ used: inventario.owned, limit: limite });
      if (!slots.ok) {
        logEvent("error", "voice_sample_rejected", {
          reason: slots.code,
          used: inventario.owned,
          // O bruto vai junto: sem ele, uma recusa futura não deixa distinguir
          // "a conta encheu" de "a contagem voltou a somar a biblioteca".
          totalNoInventario: inventario.total,
          limit: limite,
        });
        return reply.code(409).send({ error: slots.code, message: slots.message });
      }

      // --- 6. clonagem ----------------------------------------------------
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
          // ENCURTADOS, e não inteiros: o sumidouro redige material opaco de
          // 40+ caracteres por forma, e um `fixture-voice-<uuid>` tem 49 — o
          // evento saía com os dois ids como `***REDACTED***`, apagando
          // exatamente o que ele existe para preservar. Ver voiceIdForLog().
          previousVoiceId: voiceIdForLog(avatar.voice_id),
          newVoiceId: voiceIdForLog(voiceId),
        });
      }

      const { rows: updated } = await pool.query<Avatar>(
        "UPDATE avatars SET voice_id = $3 WHERE id = $1 AND tenant_id = $2 RETURNING *",
        [req.params.id, req.tenantId, voiceId],
      );

      return reply.code(201).send({
        avatar: updated[0],
        sample_url: sampleUrl,
        // O que o fornecedor recebeu, ao lado do que foi gravado.
        normalized_url: normalizedUrl,
        duration_seconds: duracao,
        // O aviso da faixa 60–90 s sobe junto com o sucesso, e não como erro:
        // é informação, não recusa.
        warning: veredictoDuracao.warning ?? null,
        voice_slots: { used: inventario.owned + 1, limit: limite },
      });
    },
  );
}
