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
import {
  CONFIRM_ABOVE_SECONDS,
  estimateSecondsFromChars,
  estimateSecondsFromScript,
  requiresLongVideoConfirmation,
  scriptDurationBasis,
} from "../services/video/scriptDuration.js";
import { isExpressiveness, normalizeScene, type SceneBackground } from "../services/providers/videoScene.js";
import { isHeygenEngine } from "../services/providers/videoEngine.js";
import {
  DailyGenerationLimitError,
  assertDailyGenerationBudget,
  readDailyBudget,
} from "../services/billing/dailyGenerationLimit.js";

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

/**
 * O fundo como veio do corpo da requisição, sem confiar em nada dele.
 *
 * Um `type` que não seja `color` nem `image` vira AUSÊNCIA de fundo, e não um
 * erro: recusar a geração inteira por causa de um campo de cena que o cliente
 * mandou torto seria caro demais para o que está em jogo — a validação que
 * importa (hex bem formado) está em `normalizeScene`, e o que ela recusa também
 * vira ausência.
 */
function leBackground(raw: { type?: string | null; value?: string | null } | null | undefined): SceneBackground | null {
  if (!raw || typeof raw.value !== "string" || raw.value.length === 0) return null;
  if (raw.type === "color") return { type: "color", value: raw.value };
  if (raw.type === "image") return { type: "image", uploadUrl: raw.value };
  return null;
}

/**
 * A linha do vídeo com a duração MEDIDA ao lado, quando ela já existe.
 *
 * `videos` não tem coluna de duração entregue: a medição vive em
 * `provider_usage`, gravada pelo laço de polling noutra requisição. Sem esta
 * junção, a única duração que chega à tela é `duration_seconds` — que é uma
 * estimativa e era mostrada como se fosse o vídeo (o player dizia "15s" num
 * arquivo de 37 s).
 *
 * A linha com `unit_source = 'requested'` é DESCARTADA de propósito: ela guarda
 * o pedido, não uma medição, e trazê-la aqui apenas repetiria a mentira por um
 * caminho mais comprido.
 */
const SELECT_VIDEO_WITH_DELIVERED = `
  SELECT v.*, u.unit_count AS delivered_seconds, u.unit_source AS delivered_source
    FROM videos v
    LEFT JOIN LATERAL (
      SELECT unit_count, unit_source
        FROM provider_usage
       WHERE video_id = v.id
         AND tenant_id = v.tenant_id
         AND provider = 'avatar'
         AND outcome = 'success'
         AND unit_source IN ('vendor_response', 'tts_timestamps')
       ORDER BY created_at DESC
       LIMIT 1
    ) u ON true`;

interface VideoRow extends Video {
  /**
   * `numeric` do Postgres chega como string. Opcional porque as linhas recém
   * inseridas (`RETURNING *`) passam por aqui sem a junção — e nesse instante a
   * ausência de medição é a verdade: o vídeo nem foi gerado ainda.
   */
  delivered_seconds?: string | number | null;
  delivered_source?: string | null;
}

/**
 * Converte a duração medida e acrescenta a ESTIMADA, derivada do roteiro.
 *
 * As duas viajam juntas para que a tela nunca precise escolher entre mostrar um
 * número errado e não mostrar nada: quando há medição, ela ganha; enquanto não
 * há, a estimativa aparece rotulada como estimativa.
 */
function withDeliveredSeconds(row: VideoRow) {
  return {
    ...row,
    delivered_seconds: row.delivered_seconds != null ? Number(row.delivered_seconds) : null,
    delivered_source: row.delivered_source ?? null,
    estimated_seconds: estimateSecondsFromScript(row.script),
  };
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
  app.get<{ Querystring: { chars?: string } }>("/video-cost-estimate", async (req) => {
    // A CONTAGEM de caracteres, nunca o roteiro. O texto é conteúdo do cliente
    // e numa query string iria parar no log de acesso, no histórico e no
    // referer — o mesmo motivo que fez `/videos/readiness` ser POST. Para
    // estimar duração, o comprimento é tudo o que se precisa.
    const chars = Number(req.query.chars);
    const scriptChars = Number.isFinite(chars) && chars > 0 ? Math.floor(chars) : 0;
    const estimatedSeconds = estimateSecondsFromChars(scriptChars);
    const credential = await getCredential(req.tenantId, "avatar");
    const estimate = estimateVideoCost(estimatedSeconds, credential?.vendor ?? "heygen");

    return {
      // Estimada, e não pedida: desde o bloco DURAÇÃO-1 não existe mais duração
      // pedida. O passo 3 do assistente escolhia 15/30/60 s e nada no caminho
      // até o fornecedor lia esse número.
      estimatedSeconds,
      scriptChars,
      pacing: scriptDurationBasis(),
      // O teto vem do SERVIDOR, junto do veredito. Uma tela que reimplementa a
      // comparação passa a discordar do servidor no dia em que o teto mudar.
      confirmAboveSeconds: CONFIRM_ABOVE_SECONDS,
      requiresConfirmation: requiresLongVideoConfirmation(estimatedSeconds),
      estimate: {
        costUsd: estimate.known ? estimate.usd : null,
        costUnknownReason: estimate.known ? null : estimate.explanation,
      },
      // O teto DIÁRIO viaja com a estimativa para a tela poder avisar antes do
      // clique, e não depois do 429. É leitura: quem recusa continua sendo o
      // servidor, na rota de criação.
      dailyBudget: await readDailyBudget(),
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
    const { rows } = await pool.query<VideoRow>(
      `${SELECT_VIDEO_WITH_DELIVERED} WHERE v.tenant_id = $1 ORDER BY v.created_at DESC`,
      [req.tenantId],
    );
    return rows.map(withDeliveredSeconds);
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
    // A estimativa sai do ROTEIRO, não de `duration_seconds`.
    //
    // Medido em 05/08: a coluna guardava 15 (o chip escolhido no passo 3), o
    // vídeo entregue teve 36,9876 s, e esta linha mostrava US$ 0,75 ao lado dos
    // US$ 1,80 que a carteira pagou — a estimativa valia 0,42× do real. O chip
    // nunca limitou nada: nenhum campo de duração chega ao fornecedor.
    //
    // O roteiro é a única entrada que de fato determina a duração, e é ele que
    // o fornecedor recebe. Ver services/video/scriptDuration.ts.
    const estimatedSeconds = estimateSecondsFromScript(video.script);
    const estimate = estimateVideoCost(estimatedSeconds, vendor);

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
      // MESMA forma de `/video-cost-estimate` — a tela tem um caminho só.
      estimatedSeconds,
      scriptChars: video.script.length,
      pacing: scriptDurationBasis(),
      confirmAboveSeconds: CONFIRM_ABOVE_SECONDS,
      requiresConfirmation: requiresLongVideoConfirmation(estimatedSeconds),
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
    const { rows } = await pool.query<VideoRow>(
      `${SELECT_VIDEO_WITH_DELIVERED} WHERE v.id = $1 AND v.tenant_id = $2`,
      [req.params.id, req.tenantId],
    );
    if (!rows[0]) return reply.code(404).send({ error: "Video not found" });
    return withDeliveredSeconds(rows[0]);
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
      /**
       * ACEITO E IGNORADO desde o bloco DURAÇÃO-1.
       *
       * Era o chip de 15/30/60 s do passo 3, e ele nunca chegou ao fornecedor:
       * `buildHeygenVideoPayload` não tem campo de duração e nada corta o
       * roteiro. Continua no tipo porque um cliente antigo pode mandá-lo, e
       * recusar por causa de um campo que nunca fez nada seria trocar uma
       * mentira silenciosa por uma quebra barulhenta.
       */
      duration_seconds?: number;
      publish_platform?: string | null;
      /**
       * OS CONTROLES DE CENA. Ver `providers/videoScene.ts`.
       *
       * `background` aceita `{type:"color", value:"#rrggbb"}` ou
       * `{type:"image", uploadUrl:"/uploads/…"}`. Fundo por VÍDEO não existe no
       * contrato do fornecedor e por isso não existe aqui.
       */
      background?: { type?: string | null; value?: string | null } | null;
      motion_prompt?: string | null;
      expressiveness?: string | null;
      engine_choice?: string | null;
      /** Look do avatar. Traje é look; ver o passo Cena. */
      avatar_look_id?: string | null;
    };
  }>("/videos", { preHandler: requireActiveTenant }, async (req, reply) => {
    const {
      avatar_id,
      script,
      scenario,
      outfit,
      scenario_prompt: scenarioPrompt,
      outfit_prompt: outfitPrompt,
      publish_platform: publishPlatform,
      motion_prompt: motionPromptBruto,
      expressiveness: expressividadeBruta,
      engine_choice: engineChoiceBruto,
      avatar_look_id: avatarLookId,
    } = req.body;

    // A cena é NORMALIZADA aqui, uma vez, e o resultado é o que vai para o
    // banco E para o fornecedor. Normalizar em dois lugares deixaria o que foi
    // gravado divergir do que foi enviado — e é justamente a linha do banco que
    // permite gerar de novo com os mesmos parâmetros.
    const scene = normalizeScene({
      background: leBackground(req.body.background),
      motionPrompt: motionPromptBruto ?? null,
      expressiveness: isExpressiveness(expressividadeBruta) ? expressividadeBruta : null,
    });
    const engineChoice = isHeygenEngine(engineChoiceBruto) ? engineChoiceBruto : null;

    // A duração é DERIVADA do roteiro, aqui e em nenhum outro lugar.
    //
    // Inteira porque a coluna é `integer` (migration 002), e TRUNCADA porque é
    // assim que o fornecedor cobra: 36,9876 s viram 36 s cobrados. Arredondar
    // para cima inventaria uma unidade que ninguém debitou.
    const estimatedSeconds = estimateSecondsFromScript(script);
    const duration_seconds = Math.floor(estimatedSeconds);

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

    // TETO DIÁRIO — no servidor, antes do débito e antes de qualquer chamada.
    //
    // Só vale para geração PAGA: em fixture nada é cobrado e nada é contado. O
    // teto de sessão (`liveGuard`) continua existindo e não substitui este —
    // aquele vive na memória do processo e um `restart` devolve o orçamento
    // inteiro, o que neste projeto acontece toda vez que entra código novo.
    if (!isFixtureMode()) {
      try {
        await assertDailyGenerationBudget();
      } catch (err) {
        if (err instanceof DailyGenerationLimitError) {
          return reply.code(429).send({
            error: "daily_generation_limit",
            message: err.message,
            used: err.used,
            max: err.max,
          });
        }
        throw err;
      }
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
                           publish_platform, aspect_ratio, resolution,
                           background_type, background_value, motion_prompt, expressiveness, engine_choice, avatar_look_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued', $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
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
        // A cena JÁ NORMALIZADA. O que está aqui é exatamente o que vai ao
        // fornecedor — é isso que torna "gerar de novo com os mesmos
        // parâmetros" uma repetição de verdade, e não uma reconstrução.
        scene.background?.type ?? null,
        scene.background?.type === "color"
          ? scene.background.value
          : scene.background?.type === "image"
            ? scene.background.uploadUrl
            : null,
        scene.motionPrompt,
        scene.expressiveness,
        engineChoice,
        avatarLookId ?? null,
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
        // O LOOK escolhido no passo Cena, quando há mais de um. Traje é look do
        // avatar, não parâmetro de vídeo — e sem look escolhido vale o do
        // avatar, que é o que sempre valeu.
        providerAvatarId: avatarLookId ?? avatar.provider_avatar_id,
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
        // Aqui é onde cenário e interpretação PARAM de se perder. O defeito
        // anterior não estava no fornecedor nem no montador de payload: estava
        // exatamente nesta chamada, que não passava os campos que a tela
        // coletava e o banco guardava.
        scene,
        engineChoice,
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
      // A linha CRUA, sem a duração medida ao lado: não há medição nenhuma numa
      // geração que o fornecedor recusou, e a guarda de erro de vendor confere
      // esta chamada por forma exata — enfeitá-la aqui a faria deixar de
      // reconhecer o caminho que ela existe para proteger.
      return reply.code(vendorErrorStatus(failure)).send(errored[0]);
    }

    return reply.code(201).send(withDeliveredSeconds(video));
  });
}
