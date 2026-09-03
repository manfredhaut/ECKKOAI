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
import type { VoiceInventory, VoiceListing } from "../services/providers/voiceProvider.js";
import {
  cloneVoice,
  deleteVoice,
  listVoiceDetails,
  listVoices,
  readVoiceSubscription,
  synthesizeSpeech,
} from "../services/providers/voiceProvider.js";
import { getCredential, getCredentialForVendor } from "../services/credentialLookup.js";
import { cloneVoiceHeygenFromBufferAndRecordUsage } from "../services/providers/avatarProvider.js";
import { takeUpload } from "../services/uploadLimits.js";
import { readUpload, saveUpload } from "../services/storage.js";
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
  PREMADE_VOICE_CATEGORY,
  checkVoiceSlots,
  effectiveVoiceSlotLimit,
  voiceIdForLog,
  voiceSlotLimit,
  type VoiceSlotLimitSource,
} from "../services/voice/voiceSample.js";
import {
  normalizeVoiceSample,
  probeSampleDurationSeconds,
} from "../services/voice/voiceSampleAudio.js";
import { voiceTuningDoAvatar } from "../services/voice/voiceTuning.js";
import type { VoicePreview } from "../services/voice/voicePreview.js";
import {
  VOICE_PREVIEW_PHRASE,
  previewUnavailableMessage,
  previewVoiceId,
  voiceNameWithTimestamp,
} from "../services/voice/voicePreview.js";

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
  app.get("/voice/sample-policy", async (req) => {
    // SLOTS, para a tela poder mostrar antes — não só depois que a GUARDA B
    // recusa. Até aqui o operador só descobria que a conta estava cheia
    // gastando uma tentativa: a contagem viajava apenas na resposta da
    // clonagem, ou seja, chegava DEPOIS de o slot ter sido consumido.
    //
    // Falha SUAVE, e é o ponto do desenho: sem credencial, ou com o fornecedor
    // fora do ar, esta rota continua devolvendo os limites de duração. Deixar
    // uma leitura acessória derrubar a política inteira travaria a gravação por
    // causa de um número informativo.
    //
    // O `used` é MEDIDO no fornecedor (`countOwnedVoices` exclui a biblioteca
    // `premade`).
    //
    // ⚠️ **O `limit` DEIXOU DE SER DECLARADO — R6.5, 24/08.** Este comentário
    // dizia que `/v1/user/subscription` respondia 401 sem `user_read` e que
    // por isso o teto era palpite nosso. MEDIDO em 24/08: **HTTP 200**,
    // `voice_limit: 10`. Agora a fonte é o fornecedor, com o ambiente vencendo
    // (um teto menor fixado à mão é proteção deliberada) e o default como
    // retaguarda — ver `effectiveVoiceSlotLimit`. A `source` sobe junto para
    // que a tela pare de dar a ressalva de "declarado" a um número medido.
    let voiceSlots: { used: number; limit: number; source: VoiceSlotLimitSource } | null = null;
    try {
      const cred = await getCredential(req.tenantId, "voice");
      if (cred) {
        const inventario = await listVoices(cred.apiKey);
        // Leitura, não tarifada, e NUNCA lança: devolve `null` quando não
        // consegue perguntar, e aí o teto cai no default.
        const assinatura = await readVoiceSubscription(cred.apiKey);
        const teto = effectiveVoiceSlotLimit(assinatura?.voiceLimit);
        voiceSlots = { used: inventario.owned, limit: teto.limit, source: teto.source };
      }
    } catch (err) {
      logEvent("info", "voice_slots_unavailable", {
        context: "voice.samplePolicy",
        detail: err instanceof Error ? err.message : String(err),
      });
    }

    return {
      min_seconds: MIN_SAMPLE_SECONDS,
      recommended_seconds: RECOMMENDED_SAMPLE_SECONDS,
      max_bytes: VOICE_SAMPLE_MAX_BYTES,
      // O TETO em segundos, derivado dos bytes pela mesma função que a rota usa
      // para recusar (`maxSampleSecondsFor`). Sem ele a tela dizia "pode gravar
      // mais, não há limite" — e havia: a 24 kHz cabem 218 s nos 10 MiB do
      // fornecedor, e o que passa disso é recusado depois de a pessoa ter
      // gravado.
      max_seconds: MAX_SAMPLE_SECONDS,
      voice_slots: voiceSlots,
    };
  });

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

      // R6.4 — limpeza de ruído, OPÇÃO da pessoa. Mesmo parsing de `replace`
      // (só "true" liga), e pelo mesmo motivo: um valor ambíguo não pode virar
      // "sim" por descuido. Aqui o "sim" errado não custa dinheiro, custa
      // TIMBRE — a limpeza é destrutiva e pode piorar uma gravação já limpa,
      // e a voz resultante é a que o cliente vai ouvir em todo vídeo.
      const campoRuido = (file.fields as Record<string, { value?: unknown } | undefined>)
        ?.remove_background_noise;
      const removerRuido = String(campoRuido?.value ?? "") === "true";

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
          // Com carimbo de data/hora: `name: avatar.name` puro produziu cinco
          // vozes homônimas na conta, impossíveis de distinguir no painel do
          // fornecedor — e é isso que torna a limpeza manual arriscada. Ver
          // voicePreview.ts.
          name: voiceNameWithTimestamp(avatar.name, new Date()),
          fileBuffer: normalizada.buffer,
          filename: normalizada.filename,
          mimeType: normalizada.mimeType,
          // R6.4 — escolha da pessoa, default `false`. Ver `removerRuido`.
          removeBackgroundNoise: removerRuido,
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
        const { failure, message } = toClientVendorError("voice", "voice.cloneVoice", err, {
          maxBytes: VOICE_SAMPLE_MAX_BYTES,
        });
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

      // --- 6b. a AMOSTRA fica amarrada à voz — R6.1, migration 064 --------
      //
      // ANTES do UPDATE de propósito. Os dois arquivos já estavam salvos no
      // storage desde o HIGIENE-1; o que nunca existiu era o vínculo, e sem
      // ele "reclonar a partir da amostra guardada" não tem alvo. Se esta
      // escrita falhasse DEPOIS do UPDATE, o avatar já estaria apontando para
      // uma voz cuja origem ninguém sabe qual é — exatamente o estado que a
      // tabela existe para não deixar acontecer.
      //
      // Não derruba a resposta se falhar: o slot já foi consumido e a voz já
      // existe. Um 5xx aqui faria a tela dizer "falhou" sobre uma clonagem
      // que aconteceu, e o reflexo de quem lê isso é clonar de novo — o mesmo
      // defeito de 09/08 que o bloco da prévia (logo abaixo) já evita.
      try {
        await pool.query(
          `INSERT INTO voice_clone_samples
             (tenant_id, avatar_id, voice_id, original_url, normalized_url, duration_seconds, remove_background_noise)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [req.tenantId, avatar.id, voiceId, sampleUrl, normalizedUrl, duracao, removerRuido],
        );
      } catch (err) {
        logEvent("error", "voice_clone_sample_not_linked", {
          avatarId: avatar.id,
          voiceId: voiceIdForLog(voiceId),
          consequence:
            "a voz existe e o slot foi consumido, mas a amostra não ficou amarrada a ela — reclonar " +
            "esta voz depois de apagá-la não será possível por este caminho",
          detail: err instanceof Error ? err.message : String(err),
        });
      }

      const { rows: updated } = await pool.query<Avatar>(
        "UPDATE avatars SET voice_id = $3 WHERE id = $1 AND tenant_id = $2 RETURNING *",
        [req.params.id, req.tenantId, voiceId],
      );

      // --- 6c. a MESMA gravação, clonada TAMBÉM na HeyGen — B6, BLOCO
      // HEYGEN-SIMPLES-1 (02/09/2026, migration 076).
      //
      // Best-effort, e de propósito: o slot ElevenLabs já foi consumido e a
      // resposta principal (voice_id) já é válida por si só — este avatar
      // continua funcionando no Normal/Premium mesmo se a HeyGen recusar ou
      // estiver fora do ar. Sem credencial HeyGen conectada, pula em
      // silêncio (o caminho de hoje, para quem não usa o tier Simples).
      //
      // A HeyGen usa a MESMA chave para avatar e voz (medido: a sonda de
      // reconhecimento A1-A5 já consultou GET /v3/voices com a credencial
      // de `provider=avatar`), então não há um "provider=voice, vendor=
      // heygen" separado para resolver — é a credencial de avatar mesmo.
      let heygenVoiceId: string | null = null;
      const heygenCredential = await getCredentialForVendor(req.tenantId, "avatar", "heygen");
      if (heygenCredential) {
        try {
          const clonado = await cloneVoiceHeygenFromBufferAndRecordUsage({
            apiKey: heygenCredential.apiKey,
            buffer: normalizada.buffer,
            mimeType: normalizada.mimeType,
            voiceName: voiceNameWithTimestamp(avatar.name, new Date()),
            tenantId: req.tenantId,
            avatarId: avatar.id,
            removeBackgroundNoise: removerRuido,
          });
          heygenVoiceId = clonado.voiceCloneId;
          await pool.query("UPDATE avatars SET heygen_voice_id = $2 WHERE id = $1", [avatar.id, heygenVoiceId]);
        } catch (err) {
          logEvent("error", "heygen_voice_clone_failed", {
            avatarId: avatar.id,
            consequence:
              "o avatar continua servindo o Normal/Premium normalmente (voice_id ElevenLabs já gravado); " +
              "só o tier Simples fica sem voz HeyGen própria para este avatar até uma nova tentativa",
            detail: err instanceof Error ? err.message : String(err),
          });
        }
      }
      if (heygenVoiceId && updated[0]) updated[0].heygen_voice_id = heygenVoiceId;

      // --- 7. prévia audível ----------------------------------------------
      //
      // Depois do UPDATE, e FORA de qualquer caminho que possa derrubar a
      // resposta. O slot já foi consumido: transformar uma falha de prévia em
      // 5xx faria a tela dizer "falhou" sobre uma clonagem que aconteceu e foi
      // cobrada — e o reflexo de quem lê isso é clonar de novo, que gasta
      // outro slot. É o defeito de 09/08 renascendo pelo outro lado.
      //
      // O id vem de `previewVoiceId(voiceId)`, NUNCA de `avatar.voice_id`:
      // aquela variável ainda guarda o id ANTIGO neste escopo, e sintetizar
      // com ela devolveria 200, áudio e player — a voz errada, aprovada como
      // se fosse a nova. Ver voicePreview.ts.
      //
      // `synthesizeSpeech` NÃO passa por `withLiveBudget` (voiceProvider.ts) e
      // isto é deliberado: prévia não é operação tarifada de produto. Não
      // acrescente o wrapper aqui por simetria com `cloneVoice` — o teto
      // existe para conter gasto de PRODUÇÃO, e meio centavo de prévia que
      // impede um slot de US$ 1,00 desperdiçado é o oposto disso.
      let preview: VoicePreview | null = null;
      let previewError: string | null = null;
      try {
        const falado = await synthesizeSpeech(
          voiceCredential.apiKey,
          previewVoiceId(voiceId),
          VOICE_PREVIEW_PHRASE,
          // Migration 067 — a prévia usa os MESMOS ajustes que o vídeo vai
          // usar. É o ponto do desenho: se ela sintetizasse com outros
          // valores, o operador aprovaria um som e receberia outro, que é
          // exatamente o defeito que a prévia existe para fechar.
          voiceTuningDoAvatar(avatar),
        );
        const previewUrl = await saveUpload(req.tenantId, falado.audio, "voice-preview.mp3");
        preview = {
          url: previewUrl,
          phrase: VOICE_PREVIEW_PHRASE,
          durationSeconds: falado.durationSeconds,
        };
      } catch (err) {
        // Registrado como `info`, não `error`: a operação que importa deu
        // certo. O que falhou foi o espelho.
        const { message } = toClientVendorError("voice", "voice.preview", err);
        previewError = previewUnavailableMessage(message);
        logEvent("info", "voice_preview_failed", {
          avatarId: avatar.id,
          voiceId: voiceIdForLog(voiceId),
          detail: err instanceof Error ? err.message : String(err),
        });
      }

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
        // Os dois andam em par: `preview` preenchido e `preview_error` nulo, ou
        // o contrário. Nunca os dois nulos — isso seria sucesso silencioso sem
        // player, que é indistinguível de uma tela quebrada.
        preview,
        preview_error: previewError,
      });
    },
  );

  /**
   * AS VOZES DA CONTA, com quem aponta para cada uma — R6, 24/08.
   *
   * É a tela da limpeza: sem ela, decidir o que apagar exige o painel do
   * fornecedor, onde CINCO vozes se chamam "TESTE REAL 15:40 01/08" e nada
   * diz qual está em uso (medido em 24/08 — 9 vozes próprias, das quais 1 é
   * apontada por avatar). Escolher pelo nome ali é escolher no escuro.
   *
   * `em_uso` sai do NOSSO banco, `nome`/`categoria` saem do fornecedor, e
   * `tem_amostra` diz se dá para reclonar depois de apagar. Os três juntos
   * são o que transforma "apagar" numa decisão informada.
   */
  app.get("/voice/voices", { preHandler: requireActiveTenant }, async (req, reply) => {
    const cred = await getCredential(req.tenantId, "voice");
    if (!cred) {
      return reply.code(409).send({
        error: "voice_credential_missing",
        message: "Conecte o ElevenLabs em Configurações antes de administrar vozes.",
      });
    }

    let inventario: VoiceListing[];
    try {
      inventario = await listVoiceDetails(cred.apiKey);
    } catch (err) {
      const { failure, message } = toClientVendorError("voice", "voice.listVoiceDetails", err);
      return reply.code(vendorErrorStatus(failure)).send({ error: "voice_provider_error", message });
    }

    // DO TENANT, sempre — nunca a conta inteira. A chave do ElevenLabs hoje é
    // do tenant, mas o dia em que ela virar de plataforma (como a da fal já é)
    // esta rota passaria a listar vozes de outros clientes se o filtro não
    // estivesse aqui desde o começo.
    const { rows: usadas } = await pool.query<{ voice_id: string; name: string }>(
      "SELECT voice_id, name FROM avatars WHERE tenant_id = $1 AND voice_id IS NOT NULL AND voice_id <> ''",
      [req.tenantId],
    );
    const { rows: comAmostra } = await pool.query<{ voice_id: string }>(
      "SELECT DISTINCT voice_id FROM voice_clone_samples WHERE tenant_id = $1",
      [req.tenantId],
    );
    const usoPorVoz = new Map(usadas.map((u) => [u.voice_id, u.name]));
    const amostras = new Set(comAmostra.map((a) => a.voice_id));

    const assinatura = await readVoiceSubscription(cred.apiKey);
    const teto = effectiveVoiceSlotLimit(assinatura?.voiceLimit);
    const proprias = inventario.filter((v) => v.category !== PREMADE_VOICE_CATEGORY);

    return reply.send({
      voices: proprias.map((v) => ({
        voice_id: v.voiceId,
        name: v.name,
        category: v.category,
        avatar_em_uso: usoPorVoz.get(v.voiceId) ?? null,
        tem_amostra_guardada: amostras.has(v.voiceId),
      })),
      voice_slots: { used: proprias.length, limit: teto.limit, source: teto.source },
      // ⚠️ AVATAR ÓRFÃO: aponta para voz que não existe mais na conta. MEDIDO
      // em 24/08 — o avatar "Mário" aponta para `wAd9MJ2I…`, ausente do
      // inventário. A geração dele falha fechada e de graça, mas falha, e até
      // esta rota nada no produto dizia isso.
      avatares_orfaos: usadas
        .filter((u) => !inventario.some((v) => v.voiceId === u.voice_id))
        .map((u) => ({ avatar: u.name, voice_id: voiceIdForLog(u.voice_id) })),
    });
  });

  /**
   * APAGA uma voz clonada — R6.2. NUNCA automática, NUNCA em cascata.
   *
   * ┌─ As duas recusas, e por que elas são do servidor e não da tela ─────────┐
   * │ 1. SEM CONFIRMAÇÃO EXPLÍCITA, recusa. E a confirmação não é um booleano │
   * │    `confirm: true` — é o `voice_id` DIGITADO de volta. Um booleano é    │
   * │    satisfeito por um clique errado e por qualquer cliente automatizado; │
   * │    repetir o id exige ter lido QUAL voz está sendo apagada, que é a     │
   * │    única coisa que erra numa conta com cinco vozes homônimas.           │
   * │ 2. VOZ EM USO, recusa. Apagar uma voz que um avatar aponta cria o       │
   * │    avatar órfão — e ele não é hipotético: existe um hoje. A saída é     │
   * │    reclonar/reapontar primeiro, e a mensagem diz isso.                  │
   * └─────────────────────────────────────────────────────────────────────────┘
   *
   * A ordem é a propriedade: as duas recusas acontecem ANTES do DELETE. Apagar
   * e depois descobrir que estava em uso não tem desfazer — no IVC o
   * fornecedor não guarda a amostra, e só existe volta se NÓS guardamos.
   */
  app.delete<{ Params: { voiceId: string }; Body: { confirm_voice_id?: string } }>(
    "/voice/voices/:voiceId",
    { preHandler: requireActiveTenant },
    async (req, reply) => {
      const voiceId = req.params.voiceId;

      if (req.body?.confirm_voice_id !== voiceId) {
        return reply.code(400).send({
          error: "voice_delete_unconfirmed",
          message:
            "Apagar uma voz é irreversível do lado do fornecedor. Para confirmar, repita o id da voz " +
            "no campo `confirm_voice_id`. Nada foi apagado.",
        });
      }

      const { rows: apontam } = await pool.query<{ name: string }>(
        "SELECT name FROM avatars WHERE tenant_id = $1 AND voice_id = $2",
        [req.tenantId, voiceId],
      );
      if (apontam.length > 0) {
        return reply.code(409).send({
          error: "voice_in_use",
          message:
            `Esta voz está em uso por ${apontam.map((a) => `"${a.name}"`).join(", ")}. Apagá-la deixaria ` +
            "o avatar apontando para uma voz que não existe, e a geração dele passaria a falhar. " +
            "Grave uma voz nova para esse avatar primeiro. Nada foi apagado.",
        });
      }

      const cred = await getCredential(req.tenantId, "voice");
      if (!cred) {
        return reply.code(409).send({
          error: "voice_credential_missing",
          message: "Conecte o ElevenLabs em Configurações. Nada foi apagado.",
        });
      }

      const { rows: amostra } = await pool.query<{ id: string }>(
        "SELECT id FROM voice_clone_samples WHERE tenant_id = $1 AND voice_id = $2 LIMIT 1",
        [req.tenantId, voiceId],
      );

      try {
        await deleteVoice(cred.apiKey, voiceId);
      } catch (err) {
        const { failure, message } = toClientVendorError("voice", "voice.deleteVoice", err);
        return reply.code(vendorErrorStatus(failure)).send({ error: "voice_provider_error", message });
      }

      // A LINHA DA AMOSTRA NÃO É APAGADA JUNTO, e isso é o desenho inteiro do
      // slot rotativo: é ela que permite reclonar esta mesma voz depois. Apagar
      // em cascata transformaria a limpeza de slot numa perda definitiva do
      // áudio — o fornecedor não devolve a amostra no IVC.
      logEvent("info", "voice_deleted", {
        tenantId: req.tenantId,
        voiceId: voiceIdForLog(voiceId),
        temAmostraGuardada: amostra.length > 0,
        consequence:
          amostra.length > 0
            ? "slot liberado; a amostra continua guardada e permite reclonar esta voz"
            : "slot liberado; NÃO há amostra guardada — esta voz não pode ser recriada por este produto",
      });

      return reply.send({
        voice_id: voiceId,
        deleted: true,
        pode_reclonar: amostra.length > 0,
      });
    },
  );

  /**
   * RECLONA a partir da amostra guardada e REAPONTA o avatar — R6.3.
   *
   * ┌─ A ordem, que é a única coisa que importa aqui ──────────────────────────┐
   * │ clonar → REAPONTAR → responder. Nunca o inverso, e nunca "apagar a       │
   * │ antiga" no meio. Se o reapontamento falhar, o avatar continua apontando  │
   * │ para a voz ANTIGA, que ainda existe — estado ruim (um slot a mais        │
   * │ ocupado) mas íntegro. Apagar antes, ou reapontar antes de ter o id novo, │
   * │ produz o avatar órfão que o R6.6 existe para impedir.                    │
   * │                                                                          │
   * │ E ela NÃO apaga a voz anterior, nem oferece: são duas decisões, e juntá- │
   * │ las faria um clique em "reclonar" destruir a voz que a pessoa ainda      │
   * │ pode querer comparar com a nova.                                         │
   * └──────────────────────────────────────────────────────────────────────────┘
   *
   * ⚠️ Que a reclonagem REPRODUZA a voz original é DEDUZIDO, não medido: o
   * operador conferiu na doc que o IVC não treina modelo, então partir dos
   * mesmos áudios TENDE ao mesmo resultado. Nenhuma comparação real foi feita.
   * A resposta diz isso à tela em `reproducao_verificada: false`.
   */
  app.post<{ Params: { id: string } }>(
    "/avatars/:id/voice-reclone",
    { preHandler: requireActiveTenant },
    async (req, reply) => {
      const { rows: avatarRows } = await pool.query<Avatar>(
        "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",
        [req.params.id, req.tenantId],
      );
      const avatar = avatarRows[0];
      if (!avatar) return reply.code(404).send({ error: "avatar_not_found" });

      // A amostra MAIS RECENTE deste avatar. `created_at DESC` porque a tabela
      // é histórico: um avatar reclonado várias vezes tem várias linhas, e a
      // última é a que corresponde à voz que está em uso.
      const { rows: amostras } = await pool.query<{
        normalized_url: string;
        remove_background_noise: boolean;
      }>(
        `SELECT normalized_url, remove_background_noise FROM voice_clone_samples
          WHERE tenant_id = $1 AND avatar_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [req.tenantId, avatar.id],
      );
      const amostra = amostras[0];
      if (!amostra) {
        return reply.code(409).send({
          error: "voice_sample_not_stored",
          message:
            "Não há amostra guardada para este avatar — a voz dele foi clonada antes de o produto passar " +
            "a guardar os áudios de origem. Para trocar a voz, grave uma nova. Nada foi cobrado.",
        });
      }

      const cred = await getCredential(req.tenantId, "voice");
      if (!cred) {
        return reply.code(409).send({
          error: "voice_credential_missing",
          message: "Conecte o ElevenLabs em Configurações. Nada foi cobrado.",
        });
      }

      // GUARDA B, a mesma da clonagem normal: reclonar consome um slot novo,
      // porque a voz antiga NÃO é apagada aqui. Pular esta conferência faria a
      // reclonagem ser o único caminho do produto que estoura o teto de slots.
      let inventario: VoiceInventory;
      try {
        inventario = await listVoices(cred.apiKey);
      } catch (err) {
        const { failure, message } = toClientVendorError("voice", "voice.listVoices", err);
        return reply.code(vendorErrorStatus(failure)).send({ error: "voice_provider_error", message });
      }
      const assinatura = await readVoiceSubscription(cred.apiKey);
      const teto = effectiveVoiceSlotLimit(assinatura?.voiceLimit);
      const slots = checkVoiceSlots({ used: inventario.owned, limit: teto.limit });
      if (!slots.ok) {
        return reply.code(409).send({
          error: slots.code,
          message:
            `${slots.message} A reclonagem não apaga a voz antiga, então ela precisa de um slot livre — ` +
            "apague uma voz sem uso primeiro.",
        });
      }

      let bytes: Buffer;
      try {
        bytes = await readUpload(amostra.normalized_url);
      } catch (err) {
        return reply.code(409).send({
          error: "voice_sample_unreadable",
          message:
            "A amostra guardada não pôde ser lida do armazenamento, então não há de que reclonar. " +
            "Grave uma voz nova. Nada foi cobrado.",
        });
      }

      let voiceId: string;
      try {
        ({ voiceId } = await cloneVoice({
          apiKey: cred.apiKey,
          name: voiceNameWithTimestamp(avatar.name, new Date()),
          fileBuffer: bytes,
          filename: "voice-sample.wav",
          mimeType: "audio/wav",
          // A MESMA escolha da clonagem original: reclonar com o valor
          // diferente produziria outra voz, e o ponto desta rota é reproduzir.
          removeBackgroundNoise: amostra.remove_background_noise,
        }));
      } catch (err) {
        if (err instanceof LiveBudgetExhaustedError) {
          return reply.code(429).send({ error: "live_budget_exhausted", message: err.message });
        }
        const { failure, message } = toClientVendorError("voice", "voice.cloneVoice", err, {
          maxBytes: VOICE_SAMPLE_MAX_BYTES,
        });
        return reply.code(vendorErrorStatus(failure)).send({ error: "voice_provider_error", message });
      }

      // O REAPONTAMENTO, imediatamente depois do clone e antes de qualquer
      // outra coisa que possa falhar. Ver o cabeçalho desta rota.
      const { rows: updated } = await pool.query<Avatar>(
        "UPDATE avatars SET voice_id = $3 WHERE id = $1 AND tenant_id = $2 RETURNING *",
        [avatar.id, req.tenantId, voiceId],
      );

      await pool.query(
        `INSERT INTO voice_clone_samples
           (tenant_id, avatar_id, voice_id, original_url, normalized_url, duration_seconds, remove_background_noise)
         VALUES ($1, $2, $3, $4, $5, NULL, $6)`,
        [req.tenantId, avatar.id, voiceId, amostra.normalized_url, amostra.normalized_url, amostra.remove_background_noise],
      );

      logEvent("info", "voice_recloned", {
        avatarId: avatar.id,
        previousVoiceId: voiceIdForLog(avatar.voice_id ?? ""),
        newVoiceId: voiceIdForLog(voiceId),
        consequence: "o avatar aponta para a voz nova; a antiga continua na conta e ocupa slot",
      });

      return reply.code(201).send({
        avatar: updated[0],
        voice_id: voiceId,
        voz_anterior_continua_na_conta: true,
        // Ver o aviso no cabeçalho: DEDUZIDO da doc, nunca comparado de fato.
        reproducao_verificada: false,
      });
    },
  );
}
