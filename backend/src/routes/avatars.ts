import type { FastifyInstance } from "fastify";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import type { Avatar } from "../types.js";
import { listAvatarLooks, trainAvatar, waitForAvatarReady, AvatarPhotoRequiredError } from "../services/providers/avatarProvider.js";
import type { AvatarVendor } from "../services/providers/vendorCatalog.js";
import type { AvatarProviderStatus } from "../services/providers/avatarProvider.js";
import { getCredential, getCredentialForVendor } from "../services/credentialLookup.js";
import type { ResolvedCredential } from "../services/credentialLookup.js";
import { VENDORS_WITH_TRAINING_PATH } from "../services/providers/vendorCatalog.js";
import {
  imageUploadMaxBytes,
  referenceVideoMaxBytes,
  checkReferenceVideoDuration,
  takeUpload,
} from "../services/uploadLimits.js";
import { isFixtureMode } from "../services/providers/providerMode.js";
import { saveUpload, readUpload } from "../services/storage.js";
import { requireActiveTenant } from "../middleware/requireActiveTenant.js";
import { debitCredit, refundCredit } from "../services/billing/creditGate.js";
import { sendAttachment, contentTypeForExtension } from "../services/downloadProxy.js";
import { toClientVendorError, vendorErrorStatus } from "../services/providers/vendorError.js";
import { logEvent } from "../services/log/safeLog.js";
import { probeSampleDurationSeconds } from "../services/voice/voiceSampleAudio.js";
import { criarLook, listarLooks } from "../services/avatar/looks.js";
import { HEYGEN_LOOK_COST } from "../services/billing/providerCost.js";

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

  /**
   * Os LOOKS (trajes) deste avatar.
   *
   * Devolve `{ looks, canChoose }` em vez de só a lista: com um look — que é o
   * caso da conta real — a tela precisa mostrar o seletor DESABILITADO com a
   * explicação de que traje se cria no avatar, e não no vídeo. Deixar a tela
   * deduzir isso de `looks.length` espalharia a regra por dois lugares.
   *
   * Nunca falha: fornecedor mudo devolve lista vazia, e lista vazia leva ao
   * mesmo estado de um look só. Um erro aqui travaria o passo Cena inteiro por
   * causa do controle menos importante dele.
   */
  app.get<{ Params: { id: string } }>("/avatars/:id/looks", async (req, reply) => {
    const { rows } = await pool.query<Avatar>(
      "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    const avatar = rows[0];
    if (!avatar) return reply.code(404).send({ error: "Avatar not found" });

    const credential = await getCredential(req.tenantId, "avatar");
    if (!credential || !avatar.provider_avatar_id) {
      // SEM TRAJE POSSÍVEL, e é um estado legítimo: um avatar em treino ainda
      // não tem `provider_avatar_id`, e um tenant sem credencial não tem a quem
      // pedir. Os dois caem aqui.
      //
      // `pendentes: []` é a correção de um defeito MEDIDO: este retorno omitia
      // o campo, a tela fazia `lookInfo.pendentes.length`, e o clique num card
      // nesse estado derrubava o passo 1 inteiro. Lista vazia é a verdade —
      // sem fornecedor não há preparo em andamento — e ela é o que a tela
      // espera contar.
      //
      // `lookCost` continua FORA de propósito, e essa é a diferença entre os
      // dois campos: declarar "criar um traje custa US$ 1,00" ao lado de um
      // avatar que não pode receber traje nenhum é anunciar preço de coisa
      // indisponível. A ausência aqui é informação, não lacuna — a tela lê
      // isso como "não há custo a declarar" e não mostra a linha.
      return { looks: [], pendentes: [], canChoose: false, simulated: isFixtureMode() };
    }

    const doFornecedor = await listAvatarLooks(
      credential.apiKey,
      credential.vendor as AvatarVendor,
      avatar.provider_avatar_id,
    );

    // Os trajes criados AQUI entram na mesma lista, depois dos do fornecedor.
    // `pendentes` vai separado: são os que ainda estão em preparo no fornecedor
    // e por isso NÃO podem ser escolhidos — a tela mostra o andamento deles.
    const { looks, pendentes } = await listarLooks(req.tenantId, avatar.id, doFornecedor, {
      apiKey: credential.apiKey,
      vendor: credential.vendor as AvatarVendor,
    });

    return {
      looks,
      pendentes,
      canChoose: looks.length > 1,
      simulated: isFixtureMode(),
      // O custo de criar um traje novo, para a tela declarar ANTES do clique.
      // MEDIDO em 06/08, e não estimado.
      lookCost: { units: HEYGEN_LOOK_COST.units, usd: HEYGEN_LOOK_COST.usd },
    };
  });

  /**
   * CRIAR um traje novo para este avatar.
   *
   * O passo 1 já coletava traje — upload de imagem e um prompt — desde antes do
   * DEMO-2, e nada disso alimentava geração nenhuma: depois que
   * `corpoDaGeracao()` passou a montar o corpo de `POST /videos`, os campos
   * pararam até de sair da tela. Esta rota é o destino que faltava para aquele
   * formulário.
   *
   * ---------------------------------------------------------------------------
   * O CAMINHO LIVE NASCE FECHADO, E ISSO É DELIBERADO
   *
   * O endpoint de criação de look do fornecedor NÃO é conhecido. Descobri-lo
   * exigiria um POST de sondagem — que gasta — e nenhum contrato lido por GET
   * declara essa operação. Escolher um path plausível e mandar seria o pior dos
   * mundos: pareceria implementado, e o erro só apareceria com dinheiro em jogo.
   *
   * Há um segundo motivo, independente do primeiro: criar avatar ou look no
   * fornecedor custa da ordem de US$ 1,00 — cerca de seis vezes um vídeo de
   * 15 s. Um botão que gasta isso não pode nascer ligado por acidente.
   *
   * Em `fixture` o caminho é inteiro e de verdade: a linha é persistida, o traje
   * aparece no seletor do passo Cena, e o id escolhido chega ao payload como
   * qualquer outro look.
   */
  app.post<{ Params: { id: string }; Body: { name?: string; imageUrl?: string; prompt?: string } }>(
    "/avatars/:id/looks",
    { preHandler: requireActiveTenant },
    async (req, reply) => {
      const { rows } = await pool.query<Avatar>(
        "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",
        [req.params.id, req.tenantId],
      );
      const avatar = rows[0];
      if (!avatar) return reply.code(404).send({ error: "Avatar not found" });

      // O veredito inteiro — forma do corpo E recusa do modo pago — vem de
      // `criarLook()`. A rota não decide nada sobre traje; se decidisse, a
      // recusa do live só seria alcançável subindo a aplicação, e uma regra que
      // custa US$ 1,00 por engano precisa ser exercitável no gate.
      const credential = await getCredential(req.tenantId, "avatar");
      if (!credential) {
        return reply.code(400).send({
          error: "no_avatar_credential",
          message: "Nenhum provedor de avatar está conectado. Conecte a chave em Configurações.",
        });
      }

      const resultado = await criarLook({
        tenantId: req.tenantId,
        avatarId: avatar.id,
        providerAvatarId: avatar.provider_avatar_id,
        name: req.body?.name ?? "",
        prompt: req.body?.prompt ?? null,
        imageUrl: req.body?.imageUrl ?? null,
        apiKey: credential.apiKey,
        vendor: credential.vendor as AvatarVendor,
      });

      if (!resultado.ok) {
        return reply.code(resultado.status).send({ error: resultado.code, message: resultado.message });
      }
      return reply.code(201).send({
        look: resultado.look,
        status: resultado.status,
        simulated: resultado.simulated,
      });
    },
  );

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
      logEvent("error", "download_failed", { context: "avatars.referenceVideo", detail: err instanceof Error ? err.message : String(err) });
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
      Pick<
        Avatar,
        | "name"
        | "provider"
        | "audio_treatment_enabled"
        | "audio_treatment_target_lufs"
        // Os quatro ajustes de síntese — migration 067, 25/08. Mesmo padrão de
        // COALESCE dos dois de tratamento de áudio: campo ausente no corpo não
        // zera a coluna, mantém o valor salvo.
        | "voice_stability"
        | "voice_similarity_boost"
        | "voice_style"
        | "voice_speaker_boost"
        // Cenário/traje PADRÃO do avatar — migration 068, Fase A item 5
        // (25/08). Mesmo padrão de COALESCE dos demais: campo ausente no
        // corpo não zera a coluna, mantém o valor salvo.
        | "scenario"
        | "scenario_prompt"
        | "outfit"
        | "outfit_prompt"
      >
    >;
  }>("/avatars/:id", async (req, reply) => {
    const {
      name,
      provider,
      audio_treatment_enabled,
      audio_treatment_target_lufs,
      voice_stability,
      voice_similarity_boost,
      voice_style,
      voice_speaker_boost,
      scenario,
      scenario_prompt,
      outfit,
      outfit_prompt,
    } = req.body;
    const { rows } = await pool.query<Avatar>(
      `UPDATE avatars SET
         name = COALESCE($3, name),
         provider = COALESCE($4, provider),
         audio_treatment_enabled = COALESCE($5, audio_treatment_enabled),
         audio_treatment_target_lufs = COALESCE($6, audio_treatment_target_lufs),
         voice_stability = COALESCE($7, voice_stability),
         voice_similarity_boost = COALESCE($8, voice_similarity_boost),
         voice_style = COALESCE($9, voice_style),
         voice_speaker_boost = COALESCE($10, voice_speaker_boost),
         scenario = COALESCE($11, scenario),
         scenario_prompt = COALESCE($12, scenario_prompt),
         outfit = COALESCE($13, outfit),
         outfit_prompt = COALESCE($14, outfit_prompt)
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [
        req.params.id,
        req.tenantId,
        name ?? null,
        provider ?? null,
        audio_treatment_enabled ?? null,
        audio_treatment_target_lufs ?? null,
        voice_stability ?? null,
        voice_similarity_boost ?? null,
        voice_style ?? null,
        voice_speaker_boost ?? null,
        scenario ?? null,
        scenario_prompt ?? null,
        outfit ?? null,
        outfit_prompt ?? null,
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
    // Teto de IMAGEM: são as 3 fotos do rosto, tiradas quase sempre no
    // celular. Em 1 MiB, praticamente nenhuma foto recente passava.
    const up = await takeUpload(req, reply, {
      maxBytes: imageUploadMaxBytes(),
      route: "avatars.photos",
      kind: "image",
    });
    if (!up) return reply;

    const url = await saveUpload(req.tenantId, up.buffer, up.file.filename);
    const { rows } = await pool.query<Avatar>(
      `UPDATE avatars SET photo_urls = photo_urls || to_jsonb($3::text)
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId, url],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Avatar not found" });
    return rows[0];
  });

  // Upload a recorded or provided reference video, then kick off avatar
  // training (required credential) at HeyGen/D-ID. A clonagem de voz SAIU
  // desta rota (ver `/avatars/:id/voice-sample`, routes/voice.ts) — o
  // treino nunca leu o buffer deste upload (usa `photo_urls`), então
  // embutir a voz aqui só forçava o mesmo arquivo, dimensionado para
  // VÍDEO (`referenceVideoMaxBytes`, bem maior que o teto do ElevenLabs),
  // a ir para um fornecedor com limite muito menor — foi essa divergência
  // de teto que produziu o 502 medido em 26/08.
  app.post<{ Params: { id: string } }>(
    "/avatars/:id/reference-video",
    { preHandler: requireActiveTenant },
    async (req, reply) => {
    // Teto SÓ desta rota. O padrão global do multipart (1 MiB, herdado do
    // bodyLimit do Fastify) continua valendo em todas as outras — ver
    // services/uploadLimits.ts para por que não sobe globalmente.
    const up = await takeUpload(req, reply, {
      maxBytes: referenceVideoMaxBytes(),
      route: "avatars.referenceVideo",
      kind: "video",
    });
    if (!up) return reply;
    const { file, buffer } = up;

    // TETO DE DURAÇÃO — o quanto antes, igual à checagem de tamanho acima:
    // antes de buscar o avatar, antes da credencial. Esta gravação treina o
    // avatar E clona a voz no mesmo envio (ver comentário da rota), então o
    // teto vale para os dois de uma vez, e testar a recusa não depende de
    // nenhuma credencial de fornecedor estar configurada.
    const durationSeconds = await probeSampleDurationSeconds(buffer);
    const duracaoVerdict = checkReferenceVideoDuration(durationSeconds);
    if (!duracaoVerdict.ok) {
      logEvent("info", "reference_video_rejected", {
        reason: duracaoVerdict.code,
        durationSeconds,
        route: "avatars.referenceVideo",
      });
      return reply.code(422).send({ error: duracaoVerdict.code, message: duracaoVerdict.message });
    }

    const { rows: existing } = await pool.query<Avatar>(
      "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    if (!existing[0]) return reply.code(404).send({ error: "Avatar not found" });

    // TREINO é exclusivo de quem `trainAvatar()` sabe atender — HeyGen ou
    // D-ID, nunca "o vendor padrão de provider=avatar" do tenant. Esse
    // padrão pode ser `fal` (guardada para o pipeline de ANIMAÇÃO, sem ramo
    // de treino nenhum — VENDORS_BY_PROVIDER em vendorCatalog.ts), e usar
    // `getCredential` genérico aqui já mandou uma chave fal para a HeyGen em
    // claro, com 401 do fornecedor e dinheiro em jogo (26/08). HeyGen
    // primeiro — é o único vendor que a decisão de 25/08 liga para o tier
    // Simples — com D-ID como alternativa legítima, nunca fal.
    let avatarCredential: ResolvedCredential | null = null;
    for (const vendorDeTreino of VENDORS_WITH_TRAINING_PATH.avatar) {
      avatarCredential = await getCredentialForVendor(req.tenantId, "avatar", vendorDeTreino);
      if (avatarCredential) break;
    }
    if (!avatarCredential) {
      return reply.code(400).send({
        error: "no_avatar_training_credential",
        message: "Treino de avatar requer credencial HeyGen (ou D-ID) configurada — conecte em Configurações.",
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
    let providerStatus: AvatarProviderStatus;
    // Motores que o fornecedor declara para ESTE avatar. Só a resposta de
    // criação os traz; perder este momento significaria uma chamada extra
    // depois, ou nunca saber.
    let supportedEngines: string[] | null = null;
    try {
      ({ providerAvatarId, status: providerStatus, supportedEngines = null } = await trainAvatar({
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
      // Precondição NOSSA, não falha do fornecedor — ver o comentário de
      // `AvatarPhotoRequiredError`. Captura DEDICADA, antes do genérico
      // abaixo: por `classifyVendorFailure`, isto cairia em "unknown" e
      // viraria 502 "tente novamente", escondendo que o conserto é enviar
      // uma foto. Só alcançável no caminho LIVE — fixture nunca lança isto.
      if (err instanceof AvatarPhotoRequiredError) {
        logEvent("info", "avatar_photo_required_by_vendor", {
          avatarId: req.params.id,
          vendor: avatarCredential.vendor,
        });
        return reply.code(422).send({ error: "avatar_photo_required_by_vendor", message: err.message });
      }
      const { failure, message } = toClientVendorError("avatar", "avatars.train", err);
      return reply.code(vendorErrorStatus(failure)).send({ error: "avatar_provider_error", message });
    }

    // Persist the successful avatar training immediately, before attempting
    // voice cloning below — otherwise a voice-provider failure (rate limit,
    // transient error, etc.) would discard training that already succeeded
    // and cost real provider quota, forcing a wasteful retry from scratch.
    // Espera o avatar sair de "processing" ANTES de responder. Medido em live:
    // a HeyGen devolve o avatar já cobrado mas ainda em treino, e sem esperar
    // aqui o cliente conclui a configuração achando que pode gerar vídeo — e
    // leva a recusa na etapa seguinte, que é a cara. Estourar o tempo não é
    // erro: grava "processing", e a tela passa a dizer "em treino".
    providerStatus = await waitForAvatarReady(
      avatarCredential.vendor as "heygen" | "did",
      avatarCredential.apiKey,
      providerAvatarId,
      providerStatus,
    );

    const { rows: trained } = await pool.query<Avatar>(
      `UPDATE avatars SET reference_video_url = $3, provider_avatar_id = $4, provider = $5, simulated = $6,
                          provider_status = $7, provider_engines = $8
       WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [
        req.params.id,
        req.tenantId,
        url,
        providerAvatarId,
        avatarCredential.vendor,
        isFixtureMode(),
        providerStatus,
        supportedEngines,
      ],
    );

    // A clonagem de voz que existia aqui (ElevenLabs, a partir do MESMO
    // buffer de vídeo) foi removida — ver `/avatars/:id/voice-sample` em
    // routes/voice.ts, que já fazia isto de forma dedicada (arquivo só de
    // áudio, teto próprio `VOICE_SAMPLE_MAX_BYTES`, conversão ffmpeg,
    // checagem de substituição) desde antes desta rodada. O treino de
    // avatar nunca dependeu da voz: `trained[0]` já é a resposta completa.
    return trained[0];
  });
}
