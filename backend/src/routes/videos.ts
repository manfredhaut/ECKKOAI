import type { FastifyInstance } from "fastify";
import path from "node:path";
import { pool } from "../db/pool.js";
import type { Avatar, Video } from "../types.js";
import { generateVideo, pollVideoJob, AvatarProviderError } from "../services/providers/avatarProvider.js";
import type { AvatarVendor } from "../services/providers/vendorCatalog.js";
import { getCredential } from "../services/credentialLookup.js";
import { createNotification } from "../services/notifications.js";
import { recordFailedProviderUsage, recordProviderUsage } from "../services/billing/usageTracking.js";
import { costBasisNote, costFor, estimateVideoCost } from "../services/billing/providerCost.js";
import { debitCredit, refundCredit } from "../services/billing/creditGate.js";
import { requireActiveTenant } from "../middleware/requireActiveTenant.js";
import { persistRemoteArtifact, probeArtifact, proxyRemoteAttachment } from "../services/downloadProxy.js";
import { ARTIFACT_INVALID_MESSAGE, InvalidArtifactError, validateVideoArtifact } from "../services/videoArtifact.js";
import { toClientVendorError, vendorErrorStatus } from "../services/providers/vendorError.js";
import { isFixtureMode } from "../services/providers/providerMode.js";
import { LiveBudgetExhaustedError } from "../services/providers/liveGuard.js";
import { resolveVideoFormat, vendorFormatSupport, type VideoFormat } from "../services/providers/videoFormat.js";
import { isFeatureEnabled } from "../services/featureFlagStore.js";
import { logEvent } from "../services/log/safeLog.js";
import { evaluateGenerationReadiness } from "../services/generationReadiness.js";

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 90; // ~7.5 minutes

function pollJob(
  videoId: string,
  tenantId: string,
  apiKey: string,
  vendor: AvatarVendor,
  jobId: string,
  durationSeconds: number,
  format: VideoFormat,
  engine: string | null,
): void {
  let attempts = 0;
  const interval = setInterval(async () => {
    attempts += 1;
    try {
      const result = await pollVideoJob(vendor, apiKey, jobId);
      if (result.status === "ready") {
        clearInterval(interval);

        // "Pronto" segundo o fornecedor não é o mesmo que "há um vídeo ali".
        // Um artefato vazio ou truncado marcado como `ready` é o pior
        // desfecho possível: a biblioteca lista, o selo diz pronto, o
        // download entrega — e só o cliente descobre, longe de qualquer log.
        // Falhar aqui é ruidoso e recuperável; deixar passar não é.
        const artifact = await probeArtifact(result.outputUrl);
        const check = validateVideoArtifact(artifact.head, artifact.totalBytes);
        if (!check.ok) {
          logEvent("error", "artifact_rejected", { context: "videos.poll", videoId, reason: check.reason, url: result.outputUrl });
          await pool.query("UPDATE videos SET status = 'error', error_message = $2 WHERE id = $1", [
            videoId,
            ARTIFACT_INVALID_MESSAGE,
          ]);
          await createNotification(tenantId, "video_error", ARTIFACT_INVALID_MESSAGE);
          // Falha DEPOIS do aceite: o fornecedor renderizou e cobrou, e nós é
          // que não conseguimos usar o artefato. A linha registra a tentativa
          // com custo zero do NOSSO lado — o que não é o mesmo que dizer que
          // não custou ao fornecedor. É por isto que ela também não estorna
          // (ver a fronteira do ESTORNO-1).
          await recordFailedProviderUsage({
            tenantId,
            videoId,
            provider: "avatar",
            vendor,
            unitType: "seconds",
            requestedUnitCount: durationSeconds,
            failureReason: ARTIFACT_INVALID_MESSAGE,
            aspectRatio: format.aspectRatio,
            resolution: format.resolution,
          });
          return;
        }

        // O artefato passa a ser NOSSO antes de virar `ready`.
        //
        // Antes desta linha, `output_url` recebia a URL assinada do fornecedor
        // tal como veio, e a Biblioteca guardava um ponteiro para um host de
        // terceiro que EXPIRA. O vídeo que o cliente pagou desaparecia da tela
        // sem nenhum erro nosso — e some justamente quando mais se precisa
        // dele, porque a assinatura vence com o tempo, não com o uso.
        //
        // Falhar aqui NÃO estorna e NÃO invalida o vídeo: o fornecedor
        // renderizou e cobrou. Cai na URL remota, que é o comportamento de
        // antes — pior, mas melhor que perder o artefato inteiro por causa de
        // uma falha de cópia.
        let servedUrl = result.outputUrl;
        let providerUrl: string | null = null;
        try {
          const saved = await persistRemoteArtifact(tenantId, result.outputUrl, `${videoId}.mp4`);
          if (saved) {
            servedUrl = saved.localUrl;
            providerUrl = result.outputUrl;
            logEvent("info", "artifact_persisted", {
              context: "videos.poll",
              videoId,
              bytes: saved.bytes,
              localUrl: saved.localUrl,
            });
          }
        } catch (err) {
          logEvent("error", "artifact_persist_failed", {
            context: "videos.poll",
            videoId,
            reason: err instanceof Error ? err.message : String(err),
            message:
              "Não consegui guardar o vídeo no nosso armazenamento; a Biblioteca vai continuar " +
              "apontando para a URL do fornecedor, que expira.",
          });
        }

        await pool.query(
          "UPDATE videos SET status = 'ready', output_url = $2, provider_output_url = $3 WHERE id = $1",
          [videoId, servedUrl, providerUrl],
        );
        await createNotification(tenantId, "video_ready", "Your video is ready.");

        // Duração REAL, com a fonte declarada. A ordem importa e não é
        // arbitrária:
        //
        //  (a) o que o FORNECEDOR declarou para o vídeo pronto. É a única
        //      fonte que não é nossa, e foi medida no LIVE-1: a HeyGen manda
        //      `data.duration` = 3,36506 num vídeo que o ffprobe deu 3,360.
        //  (b) a duração do áudio, medida pelo ElevenLabs nos timestamps.
        //      Boa, mas indireta — o vídeo pode ter sobra nas pontas.
        //  (c) o que o cliente pediu na tela. Não mede nada, e era o que
        //      estava sendo gravado como se medisse: pedimos 15 s para um
        //      vídeo de 3,372 s, e a tabela registrou 15.
        //
        // O pedido continua gravado ao lado, sempre. Sem os dois números não
        // há como saber o quanto a estimativa erra.
        const audio = await pool.query<{ audio_duration_seconds: string | null; audio_duration_source: string | null }>(
          "SELECT audio_duration_seconds, audio_duration_source FROM videos WHERE id = $1",
          [videoId],
        );
        const audioSeconds = audio.rows[0]?.audio_duration_seconds;
        const measured =
          result.durationSeconds != null
            ? { count: result.durationSeconds, source: "vendor_response" as const }
            : audioSeconds != null
              ? { count: Number(audioSeconds), source: "tts_timestamps" as const }
              : { count: durationSeconds, source: "requested" as const };

        await recordProviderUsage({
          tenantId,
          videoId,
          provider: "avatar",
          vendor,
          unitType: "seconds",
          unitCount: measured.count,
          requestedUnitCount: durationSeconds,
          unitSource: measured.source,
          // Formato e motor entram no registro de consumo, e não só na linha
          // do vídeo: é o que permitirá responder "9:16 custa mais que 16:9?"
          // sem depender de um join que deixa de funcionar quando o consumo
          // não tem vídeo associado — a voz já não tem.
          aspectRatio: format.aspectRatio,
          resolution: format.resolution,
          providerEngine: engine,
        });
      } else if (result.status === "error") {
        clearInterval(interval);
        const { message: pollMessage } = toClientVendorError("avatar", "videos.poll", new Error(result.errorMessage));
        await pool.query("UPDATE videos SET status = 'error', error_message = $2 WHERE id = $1", [
          videoId,
          pollMessage,
        ]);
        await createNotification(tenantId, "video_error", pollMessage);
        await recordFailedProviderUsage({
          tenantId,
          videoId,
          provider: "avatar",
          vendor,
          unitType: "seconds",
          requestedUnitCount: durationSeconds,
          // A mensagem SANITIZADA, nunca o corpo do fornecedor: esta coluna é
          // lida por tela de admin, e o corpo bruto já está no log.
          failureReason: pollMessage,
          aspectRatio: format.aspectRatio,
          resolution: format.resolution,
        });
      } else if (attempts === 1) {
        await pool.query("UPDATE videos SET status = 'processing' WHERE id = $1", [videoId]);
      }
    } catch (err) {
      const { message } = toClientVendorError("avatar", "videos.pollLoop", err);
      clearInterval(interval);
      await pool
        .query("UPDATE videos SET status = 'error', error_message = $2 WHERE id = $1", [videoId, message])
        .catch(() => {});
      await recordFailedProviderUsage({
        tenantId,
        videoId,
        provider: "avatar",
        vendor,
        unitType: "seconds",
        requestedUnitCount: durationSeconds,
        failureReason: message,
        aspectRatio: format.aspectRatio,
        resolution: format.resolution,
      });
    }
    if (attempts >= MAX_POLL_ATTEMPTS) {
      clearInterval(interval);
      const timeout = "O serviço de vídeo demorou mais que o esperado. Tente gerar novamente.";
      const { rowCount } = await pool
        .query("UPDATE videos SET status = 'error', error_message = $2 WHERE id = $1 AND status != 'ready'", [
          videoId,
          timeout,
        ])
        .catch(() => ({ rowCount: 0 }));
      // Só registra se o UPDATE de fato marcou erro. Sem o `rowCount`, um
      // vídeo que ficou pronto no último instante ganharia uma linha de falha
      // ao lado da de sucesso — e o pós-morte passaria a contar falhas que
      // não aconteceram.
      if (rowCount) {
        await recordFailedProviderUsage({
          tenantId,
          videoId,
          provider: "avatar",
          vendor,
          unitType: "seconds",
          requestedUnitCount: durationSeconds,
          failureReason: timeout,
          aspectRatio: format.aspectRatio,
          resolution: format.resolution,
        });
      }
    }
  }, POLL_INTERVAL_MS);
}

export async function videoRoutes(app: FastifyInstance): Promise<void> {
  /**
   * O provedor conectado a ESTE tenant honra a proporção escolhida?
   *
   * Existe para o passo "Publicação" não prometer o que o vendor do cliente
   * não entrega. Sem isto, a tela ofereceria 9:16 a um tenant em D-ID e a
   * geometria sairia da imagem de origem — sem erro nenhum, que é o modo de
   * falha mais caro: o cliente só descobre olhando o vídeo pronto.
   *
   * Nunca devolve chave nem nada da credencial além do nome do vendor.
   */
  app.get("/video-format-support", async (req) => {
    const credential = await getCredential(req.tenantId, "avatar");
    return vendorFormatSupport(credential?.vendor ?? null);
  });

  /**
   * Estimativa ANTES de existir vídeo, para o cliente ver o custo antes de
   * mandar gerar.
   *
   * Devolve a MESMA forma de `/videos/:id/cost`, com `actual: null` — assim a
   * tela tem um caminho só. Duas formas de resposta para a mesma pergunta
   * produziriam dois caminhos de renderização, e é no segundo que a ausência
   * de custo vira um zero por descuido.
   *
   * Rota fora de `/videos/...` de propósito: `/videos/cost-estimate` colidiria
   * conceitualmente com `/videos/:id`, e depender da ordem de resolução do
   * roteador para desempatar é o tipo de sutileza que quebra em silêncio.
   */
  app.get<{ Querystring: { seconds?: string } }>("/video-cost-estimate", async (req) => {
    const seconds = Number(req.query.seconds);
    const requestedSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const credential = await getCredential(req.tenantId, "avatar");
    const estimate = estimateVideoCost(requestedSeconds, credential?.vendor ?? "heygen");

    return {
      requestedSeconds,
      estimate: {
        costUsd: estimate.known ? estimate.usd : null,
        costUnknownReason: estimate.known ? null : estimate.explanation,
      },
      actual: null,
      difference: null,
      failure: null,
      basis: costBasisNote(),
      simulated: isFixtureMode(),
    };
  });

  /**
   * "Dá para gerar agora, e se não, por quê?" — a MESMA função que
   * `POST /videos` usa para recusar (services/generationReadiness.ts).
   *
   * POST, e não GET, por causa do roteiro: ele é conteúdo do cliente e pode
   * ter milhares de caracteres. Numa query string ele iria parar no log de
   * acesso, no histórico do navegador e no referer — e o único motivo de ele
   * vir junto é testar se está vazio.
   *
   * Não debita, não reserva, não chama fornecedor. É leitura pura.
   */
  app.post<{ Body: { avatar_id?: string | null; script?: string | null } }>(
    "/videos/readiness",
    async (req) => {
      return evaluateGenerationReadiness({
        tenantId: req.tenantId,
        avatarId: req.body?.avatar_id ?? null,
        script: req.body?.script ?? "",
      });
    },
  );

  app.get("/videos", async (req) => {
    const { rows } = await pool.query<Video>(
      "SELECT * FROM videos WHERE tenant_id = $1 ORDER BY created_at DESC",
      [req.tenantId],
    );
    return rows;
  });

  /**
   * O que o painel do tenant precisa e não tinha: saldo de crédito e custo do
   * mês.
   *
   * Os dois cards mostravam "—" com uma legenda que ficou FALSA depois do
   * bloco 4A: "Rastreamento de custo em breve", num sistema onde o
   * rastreamento já existe e o número aparece no passo 6. Uma tela que diz
   * "em breve" sobre algo pronto é pior que uma tela vazia — ela ensina o
   * cliente a não procurar.
   *
   * O custo soma SÓ o que tem medição, e informa quantas linhas ficaram de
   * fora. Somar as não medidas como zero faria o total parecer completo
   * (mesma regra do painel admin, bloco 4A).
   */
  app.get("/dashboard-summary", async (req) => {
    const [{ rows: creditRows }, { rows: usageRows }] = await Promise.all([
      pool.query<{ credit_type: string; balance: number }>(
        "SELECT credit_type, balance FROM tenant_credits WHERE tenant_id = $1 ORDER BY credit_type",
        [req.tenantId],
      ),
      pool.query<{ provider: string; vendor: string; unit_type: string; unit_count: string }>(
        `SELECT provider, vendor, unit_type, unit_count FROM provider_usage
         WHERE tenant_id = $1 AND outcome = 'success' AND created_at >= date_trunc('month', now())`,
        [req.tenantId],
      ),
    ]);

    let usd = 0;
    let medidas = 0;
    let semMedicao = 0;
    for (const linha of usageRows) {
      const custo = costFor({
        provider: linha.provider,
        vendor: linha.vendor,
        unitType: linha.unit_type,
        unitCount: Number(linha.unit_count),
      });
      if (custo.known) {
        usd += custo.usd;
        medidas += 1;
      } else {
        semMedicao += 1;
      }
    }

    return {
      credits: creditRows.map((r) => ({ creditType: r.credit_type, balance: Number(r.balance) })),
      costThisMonth: {
        // `null`, e não 0, quando nada foi medido: zero afirmaria que o mês
        // saiu de graça.
        usd: medidas > 0 ? Math.round(usd * 10000) / 10000 : null,
        measuredLines: medidas,
        unmeasuredLines: semMedicao,
        basis: costBasisNote(),
      },
      simulated: isFixtureMode(),
    };
  });

  /**
   * Custo de UM vídeo: a estimativa de antes e a medição de depois, lado a
   * lado, com a diferença entre as duas.
   *
   * As duas juntas, e nunca só uma: a estimativa sozinha é o que produziu o
   * erro de 4,5× sem que ninguém percebesse, e a medição sozinha esconderia o
   * quanto a estimativa erra — que é a única forma de ela melhorar.
   *
   * `actual` é `null` enquanto não houver linha de consumo. **Null, e não
   * zero**: um vídeo que ainda está gerando não custou nada ainda, e um vídeo
   * que falhou não custou nada nunca; os dois são diferentes de "custou
   * US$ 0,00", e a tela precisa poder dizer qual é qual.
   */
  app.get<{ Params: { id: string } }>("/videos/:id/cost", async (req, reply) => {
    const { rows } = await pool.query<Video>(
      "SELECT * FROM videos WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    const video = rows[0];
    if (!video) return reply.code(404).send({ error: "Video not found" });

    const vendor = video.provider_vendor ?? "heygen";
    const estimate = estimateVideoCost(video.duration_seconds, vendor);

    const { rows: usage } = await pool.query<{
      unit_count: string;
      requested_unit_count: string | null;
      unit_source: string | null;
      outcome: string;
      failure_reason: string | null;
    }>(
      `SELECT unit_count, requested_unit_count, unit_source, outcome, failure_reason
       FROM provider_usage
       WHERE video_id = $1 AND tenant_id = $2 AND provider = 'avatar'
       ORDER BY created_at DESC LIMIT 1`,
      [video.id, req.tenantId],
    );

    const linha = usage[0];
    const actual =
      linha && linha.outcome === "success"
        ? (() => {
            const seconds = Number(linha.unit_count);
            const cost = costFor({ provider: "avatar", vendor, unitType: "seconds", unitCount: seconds });
            return {
              seconds,
              unitSource: linha.unit_source,
              costUsd: cost.known ? cost.usd : null,
              costUnknownReason: cost.known ? null : cost.explanation,
              vendorUnits: cost.known ? cost.vendorUnits : null,
            };
          })()
        : null;

    return {
      requestedSeconds: video.duration_seconds,
      estimate: {
        costUsd: estimate.known ? estimate.usd : null,
        costUnknownReason: estimate.known ? null : estimate.explanation,
      },
      actual,
      // A diferença só existe quando os dois lados existem. Calculá-la contra
      // um `null` produziria um número que parece medida e é aritmética com
      // ausência.
      difference:
        actual && actual.costUsd != null && estimate.known
          ? {
              usd: Number((actual.costUsd - estimate.usd).toFixed(4)),
              factor: actual.costUsd > 0 ? Number((estimate.usd / actual.costUsd).toFixed(2)) : null,
            }
          : null,
      // Presente mesmo quando não há consumo: é o que a tela mostra em vez de
      // um traço mudo.
      failure: linha && linha.outcome === "failed" ? { reason: linha.failure_reason } : null,
      basis: costBasisNote(),
      simulated: video.simulated,
    };
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
      // Valida antes de entregar, mesmo que o polling já tenha validado ao
      // marcar `ready`: o arquivo pode ter expirado, sido substituído ou
      // truncado no meio do caminho desde então, e entregar um arquivo
      // quebrado é pior que recusar o download.
      await proxyRemoteAttachment(reply, video.output_url, `video-${video.id}${ext}`, { validate: true });
      return reply;
    } catch (err) {
      if (err instanceof InvalidArtifactError) {
        logEvent("error", "artifact_rejected", { context: "videos.download", videoId: video.id, detail: err.detail });
        return reply.code(422).send({ error: "invalid_artifact", message: err.message });
      }
      logEvent("error", "download_failed", { context: "videos.download", detail: err instanceof Error ? err.message : String(err) });
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
      publish_platform?: string | null;
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
      publish_platform: publishPlatform,
    } = req.body;

    // Plataforma → formato, SEMPRE, e antes de qualquer outra coisa. Corpo sem
    // plataforma cai no padrão declarado (YouTube/16:9, que é o que a conta já
    // entregava por omissão) em vez de deixar o campo vazio: o objetivo do
    // bloco é que nenhuma geração chegue ao fornecedor sem formato, e um
    // cliente antigo que não manda o campo não pode ser a exceção.
    const format = resolveVideoFormat(publishPlatform);

    // MESMO predicado que a tela consome (services/generationReadiness.ts).
    // Roda ANTES de criar a linha, de debitar crédito e de tocar o fornecedor:
    // o botão desabilitado é conveniência, esta recusa é a proteção. O primeiro
    // bloqueio é o que vale — a ordem dentro do predicado é de precedência.
    const readiness = await evaluateGenerationReadiness({
      tenantId: req.tenantId,
      avatarId: avatar_id,
      script,
    });
    if (!readiness.ready) {
      const [primeiro] = readiness.blockers;
      return reply
        .code(primeiro.status)
        .send({ error: primeiro.code, message: primeiro.message, blockers: readiness.blockers });
    }

    // Reconsultados aqui porque o predicado devolve o VEREDITO, não os objetos
    // — devolvê-los faria a tela receber a credencial junto do "pode gerar".
    const { rows: avatarRows } = await pool.query<Avatar>(
      "SELECT * FROM avatars WHERE id = $1 AND tenant_id = $2",
      [avatar_id, req.tenantId],
    );
    const avatar = avatarRows[0];
    const avatarCredential = await getCredential(req.tenantId, "avatar");
    // Impossível pelo predicado acima; o `throw` existe para o dia em que
    // alguém reordenar as duas coisas, e não como validação de verdade.
    if (!avatar?.provider_avatar_id || !avatarCredential) {
      throw new Error("readiness passou mas avatar/credencial sumiram entre as duas leituras");
    }
    const voiceCredential = await getCredential(req.tenantId, "voice");

    const { rows } = await pool.query<Video>(
      `INSERT INTO videos (tenant_id, avatar_id, script, scenario, outfit, scenario_prompt, outfit_prompt, duration_seconds, status, provider_vendor, simulated,
                           publish_platform, aspect_ratio, resolution)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', $9, $10, $11, $12, $13) RETURNING *`,
      [
        req.tenantId,
        avatar_id,
        script,
        scenario,
        outfit,
        scenarioPrompt,
        outfitPrompt,
        duration_seconds,
        avatarCredential.vendor,
        isFixtureMode(),
        // O formato é gravado ANTES da chamada ao fornecedor, junto da linha
        // que nasce `queued`. Se a geração falhar, o que o cliente pediu
        // continua registrado — e "qual formato foi pedido no vídeo que
        // falhou?" é justamente uma pergunta de diagnóstico.
        format.platform,
        format.aspectRatio,
        format.resolution,
      ],
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
      const { providerJobId, audioDurationSeconds, audioDurationSource, engine, engineReason } = await generateVideo({
        apiKey: avatarCredential.apiKey,
        vendor: avatarCredential.vendor as AvatarVendor,
        providerAvatarId: avatar.provider_avatar_id,
        script,
        elevenLabsApiKey: voiceCredential?.apiKey ?? null,
        voiceId: avatar.voice_id,
        tenantId: req.tenantId,
        audioTreatmentEnabled: avatar.audio_treatment_enabled,
        audioTreatmentTargetLufs: Number(avatar.audio_treatment_target_lufs),
        format,
        supportedEngines: avatar.provider_engines ?? null,
        // A flag é lida AQUI, e não dentro do provider: `avatarProvider.ts` não
        // fala com o banco, e é essa ausência de I/O que permite exercitá-lo
        // com `fetch` substituído e mais nada.
        engineEnabled: await isFeatureEnabled("explicit_avatar_engine"),
      });
      // A duração do áudio é gravada AGORA porque só agora ela é conhecida: o
      // registro de consumo acontece no laço de polling, noutra requisição. O
      // motor entra junto pelo mesmo motivo — e a RAZÃO é gravada mesmo quando
      // nenhum motor foi enviado, que é o estado normal com a flag desligada.
      await pool.query(
        `UPDATE videos SET provider_job_id = $2, audio_duration_seconds = $3, audio_duration_source = $4,
                           provider_engine = $5, provider_engine_reason = $6
         WHERE id = $1`,
        [
          video.id,
          providerJobId,
          audioDurationSeconds ?? null,
          audioDurationSource ?? null,
          engine ?? null,
          engineReason ?? null,
        ],
      );
      pollJob(
        video.id,
        req.tenantId,
        avatarCredential.apiKey,
        avatarCredential.vendor as AvatarVendor,
        providerJobId,
        duration_seconds,
        format,
        engine ?? null,
      );
    } catch (err) {
      // O job nunca foi aceito pelo fornecedor — nada foi renderizado, nenhuma
      // cota gasta. Este é o ÚLTIMO ponto do fluxo de vídeo em que o estorno
      // vale: assim que `generateVideo()` devolve um `providerJobId`, o
      // trabalho está enfileirado lá e a cota é consumida, então falha de
      // polling, artefato inválido ou download quebrado NÃO estornam (ver
      // pollJob acima e services/billing/creditGate.ts).
      await refundCredit({
        tenantId: req.tenantId,
        creditType: "video",
        relatedVideoId: video.id,
      });

      // Teto NOSSO, não falha do fornecedor: nenhuma chamada saiu e nada foi
      // cobrado. Tratado ANTES do sanitizador de erro de vendor, porque ele
      // apagaria a única informação útil — que o limite é local, que é
      // compartilhado com a clonagem de voz, e como subi-lo. Foi assim que a
      // primeira passada live terminou em "Não foi possível concluir a
      // operação no serviço de vídeo", mandando procurar defeito na HeyGen
      // quando a HeyGen nem chegou a ser chamada.
      if (err instanceof LiveBudgetExhaustedError) {
        const { rows: barrado } = await pool.query<Video>(
          "UPDATE videos SET status = 'error', error_message = $2 WHERE id = $1 RETURNING *",
          [video.id, err.message],
        );
        logEvent("error", "live_budget_exhausted", { context: "videos.create", used: err.used, max: err.max });
        return reply.code(429).send({ error: "live_budget_exhausted", message: err.message, video: barrado[0] });
      }
      const { failure, message } = toClientVendorError("avatar", "videos.create", err);
      const { rows: errored } = await pool.query<Video>(
        "UPDATE videos SET status = 'error', error_message = $2 WHERE id = $1 RETURNING *",
        [video.id, message],
      );
      // Recusa ANTES do aceite: nada foi renderizado e o crédito já foi
      // estornado acima. A linha existe mesmo assim — sem ela, "cinco
      // tentativas recusadas" e "nenhuma tentativa" ficam indistinguíveis
      // depois que o stdout do container sumir, que é o primeiro
      // `docker compose up -d`.
      await recordFailedProviderUsage({
        tenantId: req.tenantId,
        videoId: video.id,
        provider: "avatar",
        vendor: avatarCredential.vendor,
        unitType: "seconds",
        requestedUnitCount: duration_seconds,
        failureReason: message,
        aspectRatio: format.aspectRatio,
        resolution: format.resolution,
      });
      // Status de ERRO, e não 201.
      //
      // Medido na Fase 2 do bloco 5D: uma geração que o fornecedor RECUSOU
      // voltava como `HTTP 201 Created` com `status: "error"` no corpo. O
      // `vendorErrorStatus` já estava importado neste arquivo desde sempre e
      // nunca foi chamado — `videos.ts` era a única das seis rotas que tratam
      // erro de fornecedor sem ele, e a única a responder 201 numa falha.
      //
      // Importa porque `api/client.ts` só levanta erro quando `!res.ok`: com
      // 201, o cliente trata a recusa como sucesso. A tela ainda mostrava a
      // falha por olhar `video.status`, mas qualquer consumidor que confie no
      // status HTTP — e é para isso que ele existe — leria "criado".
      //
      // O corpo continua trazendo a linha do vídeo, e não só a mensagem: ela
      // carrega o `error_message` já sanitizado e o id, que é o que permite
      // olhar a tentativa depois na Biblioteca.
      return reply.code(vendorErrorStatus(failure)).send(errored[0]);
    }

    return reply.code(201).send(video);
  });
}
