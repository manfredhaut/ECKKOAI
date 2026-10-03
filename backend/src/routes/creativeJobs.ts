/**
 * ABAS-6, 29/09/2026 — rota do motor de jobs da aba "5. Gerar Vídeos & Imagens".
 * ABAS-29/30, 30/09/2026 — Fase 5: Higgsfield REAL para imagem/broll/
 * propaganda (narração/música continuam só em fixture -- são outro
 * fornecedor, ElevenLabs, fora do escopo desta rodada; ver
 * higgsfieldProvider.ts).
 *
 * Fluxo em LIVE: estima (estimateCreativeJob, nunca cobra) -> grava a
 * linha já com a estimativa ('estimado') -> submete de verdade
 * (submitCreativeJob, COBRA) -> 'na_fila'. A sondagem (GET /creative-
 * jobs/:id) chama pollCreativeJobHiggsfield, que baixa o arquivo de
 * verdade para /uploads antes de marcar 'pronto' -- nunca guarda URL do
 * fornecedor.
 *
 * PENDÊNCIA REGISTRADA: esta rota ainda não tem guarda de mutante própria
 * (diferente de checkVideoTitlePolicy.ts). As invariantes que uma guarda
 * futura precisaria proteger: modo≠"imagem" é recusado; chave_cliente
 * duplicada nunca cria uma segunda linha; arquivo_url só é gravado depois
 * do fixture/fornecedor devolver "ready".
 */
import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { isFixtureMode } from "../services/providers/providerMode.js";
import { creativeModelById, CREATIVE_MODELS } from "../services/providers/creativeCatalog.js";
import { createCreativeJobFixture, pollCreativeJobFixture } from "../services/providers/creativeFixture.js";
import {
  assertHiggsfieldGuards,
  HiggsfieldConcurrencyError,
  HiggsfieldTenantDailyLimitError,
} from "../services/providers/higgsfieldLimits.js";
import {
  construirCorpoHiggsfield,
  estimateCreativeJob,
  submitCreativeJob,
  cancelCreativeJob,
  pollCreativeJobHiggsfield,
  HiggsfieldNotConfiguredError,
  HiggsfieldProviderError,
} from "../services/providers/higgsfieldProvider.js";
import { logEvent } from "../services/log/safeLog.js";
import type { CreativeModo } from "../services/providers/creativeCatalog.js";
import { probeSampleDurationSeconds } from "../services/voice/voiceSampleAudio.js";
import { probeVideo } from "../services/video/ffmpeg.js";
import { saveUpload } from "../services/storage.js";
import { getCredential } from "../services/credentialLookup.js";
import { synthesizeSpeech, logSynthesisBody, listVoiceDetails } from "../services/providers/voiceProvider.js";
import {
  takeUpload,
  creativeAudioUploadCeilingBytes,
  referenceVideoMaxBytes,
} from "../services/uploadLimits.js";
import { writeFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";

interface CreativeJobRow {
  id: string;
  tenant_id: string;
  video_id: string | null;
  modo: string;
  modelo: string;
  titulo: string;
  entrada: unknown;
  estimativa_usd: string | null;
  chave_cliente: string;
  request_id: string | null;
  status_url: string | null;
  cancel_url: string | null;
  estado: string;
  erro_fornecedor: string | null;
  correlation_id: string;
  arquivo_url: string | null;
  simulated: boolean;
  credencial_origem: string | null;
  created_at: string;
  enviado_em: string | null;
  terminado_em: string | null;
}

function tituloValido(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t.length > 0 && t.length <= 80 && !/[\x00-\x1F\x7F]/.test(t);
}

function chaveClienteValida(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const t = v.trim();
  return t.length > 0 && t.length <= 200;
}

// ABAS-29 -- só estes 3 modos têm provedor real (Higgsfield) ligado.
// narração/música continuam só em fixture (outro fornecedor).
const MODOS_HIGGSFIELD = new Set<CreativeModo>(["imagem", "broll", "propaganda", "trocarproduto"]);

async function sincronizarComFixture(job: CreativeJobRow): Promise<CreativeJobRow> {
  if (job.estado !== "gerando" || !job.request_id) return job;
  const poll = await pollCreativeJobFixture(job.request_id);
  if (poll.status === "processing") return job;
  if (poll.status === "ready") {
    const { rows } = await pool.query<CreativeJobRow>(
      `UPDATE creative_jobs SET estado = 'pronto', arquivo_url = $2, terminado_em = now()
       WHERE id = $1 RETURNING *`,
      [job.id, poll.outputUrl],
    );
    return rows[0];
  }
  const { rows } = await pool.query<CreativeJobRow>(
    `UPDATE creative_jobs SET estado = 'falhou', erro_fornecedor = $2, terminado_em = now()
     WHERE id = $1 RETURNING *`,
    [job.id, poll.errorMessage],
  );
  return rows[0];
}

/**
 * ABAS-29 -- equivalente real de sincronizarComFixture. Só sonda quando
 * o job está genuinamente em voo (na_fila/gerando) com request_id real.
 * pollCreativeJobHiggsfield já baixa o arquivo para /uploads antes de
 * devolver "ready" -- esta função só grava o resultado, nunca toca rede
 * de arquivo diretamente.
 */
async function sincronizarComHiggsfield(job: CreativeJobRow): Promise<CreativeJobRow> {
  if (!["na_fila", "gerando"].includes(job.estado) || !job.request_id) return job;
  let poll;
  try {
    poll = await pollCreativeJobHiggsfield(job.tenant_id, job.request_id);
  } catch (err) {
    logEvent("error", "higgsfield_poll_failed", { jobId: job.id, detail: err });
    return job;
  }
  if (poll.status === "processing") return job;
  if (poll.status === "ready") {
    const { rows } = await pool.query<CreativeJobRow>(
      `UPDATE creative_jobs SET estado = 'pronto', arquivo_url = $2, terminado_em = now()
       WHERE id = $1 RETURNING *`,
      [job.id, poll.outputUrl],
    );
    return rows[0];
  }
  const { rows } = await pool.query<CreativeJobRow>(
    `UPDATE creative_jobs SET estado = 'falhou', erro_fornecedor = $2, terminado_em = now()
     WHERE id = $1 RETURNING *`,
    [job.id, poll.errorMessage],
  );
  return rows[0];
}

async function sincronizarComProvedor(job: CreativeJobRow): Promise<CreativeJobRow> {
  return job.simulated ? sincronizarComFixture(job) : sincronizarComHiggsfield(job);
}

export async function creativeJobRoutes(app: FastifyInstance): Promise<void> {
  // PAINEL-MODELO-1, 01/10/2026 — catálogo filtrado por modo, para o
  // <select> de modelo deixar de ser cosmético (CreativesStep.tsx): a
  // tela passa a listar os modelos REAIS deste modo, com o default
  // curado (ver creativeCatalog.ts) vindo marcado, em vez de um
  // mapeamento hardcoded no frontend.
  app.get<{ Querystring: { modo?: string } }>("/creative-models", async (req, reply) => {
    const { modo } = req.query;
    if (!modo) return reply.code(400).send({ error: "modo_required" });
    return CREATIVE_MODELS.filter((m) => m.modos.includes(modo as never));
  });

  app.get("/creative-jobs", async (req) => {
    const { rows } = await pool.query<CreativeJobRow>(
      "SELECT * FROM creative_jobs WHERE tenant_id = $1 ORDER BY created_at DESC",
      [req.tenantId],
    );
    return rows;
  });

  app.get<{ Params: { id: string } }>("/creative-jobs/:id", async (req, reply) => {
    const { rows } = await pool.query<CreativeJobRow>(
      "SELECT * FROM creative_jobs WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    const job = rows[0];
    if (!job) return reply.code(404).send({ error: "not_found" });
    return sincronizarComProvedor(job);
  });

  app.post<{
    Body: {
      modo?: string;
      modelo_id?: string;
      titulo?: string;
      prompt?: string;
      aspect_ratio?: string | null;
      chave_cliente?: string;
      voice_id?: string | null;
      duracao_segundos?: number | null;
      imagem_referencia_url?: string | null;
      video_duracao_segundos?: number | null;
      video_resolution?: string | null;
      video_url_fonte?: string | null;
      imagens_referencia_urls?: string[] | null;
    };
  }>("/creative-jobs", async (req, reply) => {
    const {
      modo,
      modelo_id: modeloId,
      titulo,
      prompt,
      aspect_ratio: aspectRatio,
      chave_cliente: chaveCliente,
      voice_id: voiceId,
      duracao_segundos: duracaoSegundos,
      imagem_referencia_url: imagemReferenciaUrl,
      video_duracao_segundos: videoDuracaoSegundos,
      video_resolution: videoResolution,
      video_url_fonte: videoUrlFonte,
      imagens_referencia_urls: imagensReferenciaUrls,
    } = req.body ?? {};

    // ABAS-29 -- checkCreativeJobsPolicy.ts (invariante 1) exige o
    // padrão textual exato "if (!isFixtureMode())" ANTES de
    // MODOS_SUPORTADOS -- por isso dois `if` em vez de um `&&`.
    // PAINEL-NARRACAO-1, 01/10/2026 — narração/música saíram daqui: têm
    // fornecedor PRÓPRIO (ElevenLabs, já integrado — ver o ramo síncrono
    // mais abaixo), e não dependem de MODOS_HIGGSFIELD, que é só o
    // catálogo da Higgsfield.
    const MODOS_DE_AUDIO_LIVE = new Set(["narracao", "musica"]);
    if (!isFixtureMode()) {
      if (!MODOS_HIGGSFIELD.has(modo as CreativeModo) && !MODOS_DE_AUDIO_LIVE.has(modo as string)) {
        return reply.code(501).send({
          error: "not_implemented",
          message:
            "Geração real ainda só está disponível para imagem, b-roll, propaganda, narração e música.",
        });
      }
    }
    const MODOS_SUPORTADOS = new Set(["imagem", "narracao", "musica", "broll", "propaganda", "trocarproduto"]);
    if (typeof modo !== "string" || !MODOS_SUPORTADOS.has(modo)) {
      return reply.code(400).send({
        error: "modo_nao_suportado",
        message: "Só os modos imagem, narração, música, b-roll e propaganda estão disponíveis nesta rodada.",
      });
    }
    if (!tituloValido(titulo)) {
      return reply.code(400).send({
        error: "invalid_title",
        message: "Informe um título para o material, de 1 a 80 caracteres, sem caracteres de controle.",
      });
    }
    if (typeof prompt !== "string" || !prompt.trim()) {
      return reply.code(400).send({ error: "invalid_prompt", message: "Informe um prompt." });
    }
    const MODOS_DE_AUDIO = new Set(["narracao", "musica"]);
    if (MODOS_DE_AUDIO.has(modo)) {
      if (
        typeof duracaoSegundos !== "number" ||
        !Number.isFinite(duracaoSegundos) ||
        duracaoSegundos < 3 ||
        duracaoSegundos > 600
      ) {
        return reply.code(400).send({
          error: "invalid_duracao",
          message: "Informe uma duração de 3 a 600 segundos.",
        });
      }
    }
    if (!chaveClienteValida(chaveCliente)) {
      return reply.code(400).send({ error: "invalid_chave_cliente", message: "chave_cliente é obrigatória." });
    }
    const modelo = modeloId ? creativeModelById(modeloId) : null;
    if (!modelo || !modelo.modos.includes(modo as CreativeModo)) {
      return reply.code(400).send({ error: "modelo_invalido", message: "Modelo desconhecido para este modo." });
    }

    // PAINEL-GENJUTSU-1, 02/10/2026 -- Genjutsu Object Swap exige um
    // vídeo de origem já enviado (POST /creative-jobs/genjutsu-source,
    // abaixo) e ao menos 1 imagem do novo produto.
    if (modo === "trocarproduto") {
      if (typeof videoUrlFonte !== "string" || !videoUrlFonte.trim()) {
        return reply.code(400).send({
          error: "invalid_video_fonte",
          message: "Envie o vídeo de origem antes de gerar.",
        });
      }
      if (
        !Array.isArray(imagensReferenciaUrls) ||
        imagensReferenciaUrls.filter((u) => typeof u === "string" && u.trim()).length === 0
      ) {
        return reply.code(400).send({
          error: "invalid_imagens_referencia",
          message: "Escolha ao menos 1 imagem do novo produto (cartão Produto, nas Referências).",
        });
      }
    }

    // ABAS-24 — Etapa 6 do plano (robustez): semáforo de concorrência da
    // credencial Higgsfield inteira + teto diário de jobs por tenant.
    try {
      await assertHiggsfieldGuards(req.tenantId, modo as string);
    } catch (err) {
      if (err instanceof HiggsfieldConcurrencyError || err instanceof HiggsfieldTenantDailyLimitError) {
        return reply.code(429).send({
          error: err instanceof HiggsfieldConcurrencyError ? "higgsfield_concorrencia" : "higgsfield_teto_diario",
          message: err.message,
          used: err.used,
          max: err.max,
        });
      }
      throw err;
    }

    const tituloTrim = titulo!.trim();
    const chaveTrim = chaveCliente!.trim();
    const entrada = {
      prompt: prompt.trim(),
      aspect_ratio: aspectRatio ?? null,
      voice_id: typeof voiceId === "string" && voiceId.trim() ? voiceId.trim() : null,
      duracao_segundos: MODOS_DE_AUDIO.has(modo) ? duracaoSegundos : null,
      imagem_referencia_url:
        (modo === "broll" || modo === "propaganda") &&
        typeof imagemReferenciaUrl === "string" &&
        imagemReferenciaUrl.trim()
          ? imagemReferenciaUrl.trim()
          : null,
      // PAINEL-SEEDANCE-1, 01/10/2026 — só broll/propaganda (Seedance);
      // demais modos ignoram.
      video_duracao_segundos:
        (modo === "broll" || modo === "propaganda") && typeof videoDuracaoSegundos === "number"
          ? videoDuracaoSegundos
          : null,
      video_resolution:
        (modo === "broll" || modo === "propaganda" || modo === "trocarproduto") &&
        (videoResolution === "480p" || videoResolution === "720p" || videoResolution === "1080p")
          ? videoResolution
          : null,
      video_url_fonte:
        modo === "trocarproduto" && typeof videoUrlFonte === "string" && videoUrlFonte.trim()
          ? videoUrlFonte.trim()
          : null,
      imagens_referencia_urls:
        (modo === "trocarproduto" || modo === "broll" || modo === "propaganda") &&
          Array.isArray(imagensReferenciaUrls)
        ? imagensReferenciaUrls.filter((u): u is string => typeof u === "string" && u.trim().length > 0).slice(0, 8)
        : null,
    };

    // ABAS-29 -- em LIVE, estima ANTES de gravar a linha (nunca cobra --
    // ver cabeçalho do higgsfieldProvider.ts). Falha de estimativa não
    // bloqueia a geração: só fica sem número (estimativa_usd null).
    let corpoReal: { modelIdReal: string; body: Record<string, unknown> } | null = null;
    let estimativaUsd: number | null = null;
    if (!isFixtureMode()) {
      corpoReal = construirCorpoHiggsfield(modelo.id, {
        prompt: entrada.prompt,
        aspectRatio: entrada.aspect_ratio,
        imagemReferenciaUrl: entrada.imagem_referencia_url,
        videoDuracaoSegundos: entrada.video_duracao_segundos,
        videoResolution: entrada.video_resolution as "480p" | "720p" | "1080p" | null,
        videoUrlFonte: entrada.video_url_fonte,
        imagensReferenciaUrls: entrada.imagens_referencia_urls,
      });
      try {
        const est = await estimateCreativeJob(corpoReal.modelIdReal, corpoReal.body);
        if (est.type === "estimate") estimativaUsd = Number(est.usd);
      } catch (err) {
        if (err instanceof HiggsfieldNotConfiguredError) {
          return reply.code(503).send({ error: "higgsfield_nao_configurado", message: err.message });
        }
        logEvent("error", "higgsfield_estimate_failed", { detail: err });
      }
    }

    let rows: CreativeJobRow[];
    try {
      ({ rows } = await pool.query<CreativeJobRow>(
        `INSERT INTO creative_jobs
           (tenant_id, modo, modelo, titulo, entrada, chave_cliente, estado, simulated, estimativa_usd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          req.tenantId,
          modo,
          modelo.id,
          tituloTrim,
          JSON.stringify(entrada),
          chaveTrim,
          isFixtureMode() ? "enviando" : "estimado",
          isFixtureMode(),
          estimativaUsd,
        ],
      ));
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        const existing = await pool.query<CreativeJobRow>(
          "SELECT * FROM creative_jobs WHERE tenant_id = $1 AND chave_cliente = $2",
          [req.tenantId, chaveTrim],
        );
        if (existing.rows[0]) return reply.code(200).send(await sincronizarComProvedor(existing.rows[0]));
      }
      throw err;
    }

    const job = rows[0];

    // PAINEL-NARRACAO-1, 01/10/2026 — narração/música em modo REAL: fora
    // do fluxo Higgsfield (fila, polling, request_id). ElevenLabs
    // responde na mesma chamada — síncrono, sem passar por 'na_fila'.
    // Erro aqui marca 'falhou' e devolve 201 (mesmo padrão do Higgsfield
    // logo abaixo: o job sempre existe, o estado é que conta a história).
    if (!isFixtureMode() && MODOS_DE_AUDIO_LIVE.has(modo as string)) {
      const cred = await getCredential(req.tenantId, "voice");
      if (!cred) {
        const updated = await pool.query<CreativeJobRow>(
          `UPDATE creative_jobs SET estado = 'falhou', erro_fornecedor = $2, terminado_em = now()
           WHERE id = $1 RETURNING *`,
          [job.id, "Conecte o ElevenLabs em Configurações antes de gerar narração ou música."],
        );
        return reply.code(201).send(updated.rows[0]);
      }

      try {
        // voice_id escolhido na tela (narração) ou a primeira voz da
        // conta (música, sem seletor próprio — mesmo padrão de
        // platformKeyNarrationTest.ts).
        let voiceIdEscolhido = entrada.voice_id;
        if (!voiceIdEscolhido) {
          const inventario = await listVoiceDetails(cred.apiKey);
          voiceIdEscolhido = inventario[0]?.voiceId ?? null;
        }
        if (!voiceIdEscolhido) {
          throw new Error("Nenhuma voz disponível nesta conta ElevenLabs para sintetizar.");
        }

        logSynthesisBody("creativeJobs.synthesize", { text: entrada.prompt });
        const sintetizado = await synthesizeSpeech(cred.apiKey, voiceIdEscolhido, entrada.prompt);
        const outputUrl = await saveUpload(req.tenantId, sintetizado.audio, "criativo-narracao.mp3");

        const updated = await pool.query<CreativeJobRow>(
          `UPDATE creative_jobs
           SET estado = 'pronto', arquivo_url = $2, enviado_em = now(), terminado_em = now(),
               credencial_origem = $3
           WHERE id = $1 RETURNING *`,
          [job.id, outputUrl, cred.source],
        );
        return reply.code(201).send(updated.rows[0]);
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : String(err);
        const updated = await pool.query<CreativeJobRow>(
          `UPDATE creative_jobs SET estado = 'falhou', erro_fornecedor = $2, terminado_em = now()
           WHERE id = $1 RETURNING *`,
          [job.id, mensagem],
        );
        return reply.code(201).send(updated.rows[0]);
      }
    }

    if (isFixtureMode()) {
      const { jobId } = await createCreativeJobFixture({
        tenantId: req.tenantId,
        modo: modo as CreativeModo,
        modeloId: modelo.id,
        titulo: tituloTrim,
        prompt: entrada.prompt,
        aspectRatio: entrada.aspect_ratio,
      });
      const updated = await pool.query<CreativeJobRow>(
        `UPDATE creative_jobs SET estado = 'gerando', request_id = $2, enviado_em = now() WHERE id = $1 RETURNING *`,
        [job.id, jobId],
      );
      return reply.code(201).send(updated.rows[0]);
    }

    // ABAS-29 -- LIVE: submete de verdade AGORA. A partir daqui, COBRA.
    await pool.query("UPDATE creative_jobs SET estado = 'enviando' WHERE id = $1", [job.id]);
    try {
      const result = await submitCreativeJob(corpoReal!.modelIdReal, corpoReal!.body);
      const updated = await pool.query<CreativeJobRow>(
        `UPDATE creative_jobs
         SET estado = 'na_fila', request_id = $2, status_url = $3, cancel_url = $4,
             enviado_em = now(), credencial_origem = 'platform'
         WHERE id = $1 RETURNING *`,
        [job.id, result.requestId, result.statusUrl, result.cancelUrl],
      );
      return reply.code(201).send(updated.rows[0]);
    } catch (err) {
      const mensagem =
        err instanceof HiggsfieldProviderError ? err.message : err instanceof Error ? err.message : String(err);
      const updated = await pool.query<CreativeJobRow>(
        `UPDATE creative_jobs SET estado = 'falhou', erro_fornecedor = $2, terminado_em = now()
         WHERE id = $1 RETURNING *`,
        [job.id, mensagem],
      );
      return reply.code(201).send(updated.rows[0]);
    }
  });

  // PAINEL-GENJUTSU-1, 02/10/2026 -- upload do vídeo de ORIGEM do
  // Genjutsu Object Swap (entrada da geração, não um resultado pronto --
  // diferente de /upload e /upload-visual abaixo, que são bypass de
  // geração). Valida duração (4-30s) e resolução mínima (409.600 px por
  // quadro, medido contra a documentação oficial) antes de salvar.
  app.post("/creative-jobs/genjutsu-source", async (req, reply) => {
    const up = await takeUpload(req, reply, {
      maxBytes: referenceVideoMaxBytes(),
      route: "creativeJobs.genjutsuSource",
      kind: "video",
    });
    if (!up) return reply;

    if (up.file.mimetype.split("/")[0] !== "video") {
      return reply.code(400).send({
        error: "invalid_type",
        message: `Arquivo do tipo "${up.file.mimetype}" não é aceito — esperado video/*.`,
      });
    }

    const tmp = path.join(os.tmpdir(), `${randomUUID()}-genjutsu-source`);
    let geometria;
    try {
      await writeFile(tmp, up.buffer);
      geometria = await probeVideo(tmp);
    } catch {
      await unlink(tmp).catch(() => {});
      return reply.code(422).send({
        error: "video_not_readable",
        message: "Não foi possível ler o vídeo — ele pode estar corrompido ou incompleto.",
      });
    }
    await unlink(tmp).catch(() => {});

    if (geometria.durationSeconds < 4 || geometria.durationSeconds > 30) {
      return reply.code(422).send({
        error: "video_duration_out_of_range",
        message: `O vídeo tem ${Math.round(geometria.durationSeconds)}s — o Genjutsu Object Swap aceita de 4 a 30 segundos.`,
      });
    }
    const pixels = geometria.width * geometria.height;
    if (pixels < 409_600) {
      return reply.code(422).send({
        error: "video_resolution_too_low",
        message: `O vídeo tem ${geometria.width}x${geometria.height} (${pixels} pixels por quadro) — o Genjutsu Object Swap exige ao menos 409.600 pixels por quadro (ex.: 1280x720).`,
      });
    }

    const url = await saveUpload(req.tenantId, up.buffer, up.file.filename);
    return reply.code(201).send({
      url,
      width: geometria.width,
      height: geometria.height,
      durationSeconds: geometria.durationSeconds,
    });
  });

  app.post("/creative-jobs/upload", async (req, reply) => {
    const up = await takeUpload(req, reply, {
      maxBytes: creativeAudioUploadCeilingBytes(),
      route: "creativeJobs.upload",
      kind: "audio",
    });
    if (!up) return reply;

    const modoRaw = (up.file.fields?.modo as { value?: unknown } | undefined)?.value;
    if (modoRaw !== "narracao" && modoRaw !== "musica") {
      return reply.code(400).send({
        error: "modo_nao_suportado",
        message: "Upload direto só está disponível para narração ou música.",
      });
    }
    const modo = modoRaw;

    if (up.file.mimetype.split("/")[0] !== "audio") {
      return reply.code(400).send({
        error: "invalid_type",
        message: `Arquivo do tipo "${up.file.mimetype}" não é aceito — esperado audio/*.`,
      });
    }

    const tituloRaw = (up.file.fields?.titulo as { value?: unknown } | undefined)?.value;
    if (!tituloValido(tituloRaw)) {
      return reply.code(400).send({
        error: "invalid_title",
        message: "Informe um título para o material, de 1 a 80 caracteres, sem caracteres de controle.",
      });
    }
    const titulo = tituloRaw.trim();

    const chaveRaw = (up.file.fields?.chave_cliente as { value?: unknown } | undefined)?.value;
    if (typeof chaveRaw !== "string" || !chaveRaw.trim()) {
      return reply.code(400).send({ error: "invalid_chave_cliente", message: "chave_cliente é obrigatória." });
    }
    const chaveCliente = chaveRaw.trim();

    const duracaoReal = await probeSampleDurationSeconds(up.buffer);
    if (duracaoReal === null) {
      return reply.code(422).send({
        error: "audio_not_readable",
        message: "Não foi possível medir a duração do arquivo — ele pode estar corrompido ou incompleto.",
      });
    }
    if (duracaoReal < 3 || duracaoReal > 600) {
      return reply.code(422).send({
        error: "audio_duration_out_of_range",
        message: `O arquivo tem ${Math.round(duracaoReal)}s e a faixa aceita é de 3 a 600 segundos.`,
      });
    }

    const url = await saveUpload(req.tenantId, up.buffer, up.file.filename);
    const entrada = { prompt: null, aspect_ratio: null, voice_id: null, duracao_segundos: duracaoReal };

    try {
      const { rows } = await pool.query<CreativeJobRow>(
        `INSERT INTO creative_jobs (tenant_id, modo, modelo, titulo, entrada, chave_cliente, estado, arquivo_url, simulated)
         VALUES ($1, $2, 'upload', $3, $4, $5, 'pronto', $6, false) RETURNING *`,
        [req.tenantId, modo, titulo, JSON.stringify(entrada), chaveCliente, url],
      );
      return reply.code(201).send(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        const existing = await pool.query<CreativeJobRow>(
          "SELECT * FROM creative_jobs WHERE tenant_id = $1 AND chave_cliente = $2",
          [req.tenantId, chaveCliente],
        );
        if (existing.rows[0]) return reply.code(200).send(existing.rows[0]);
      }
      throw err;
    }
  });

  app.post("/creative-jobs/upload-visual", async (req, reply) => {
    const up = await takeUpload(req, reply, {
      maxBytes: referenceVideoMaxBytes(),
      route: "creativeJobs.uploadVisual",
      kind: "video",
    });
    if (!up) return reply;

    const VISUAL_ACCEPT: Record<string, readonly string[]> = {
      imagem: ["image"],
      sobreposicao: ["image"],
      broll: ["video"],
      propaganda: ["image", "video"],
    };
    const modoRaw = (up.file.fields?.modo as { value?: unknown } | undefined)?.value;
    if (typeof modoRaw !== "string" || !VISUAL_ACCEPT[modoRaw]) {
      return reply.code(400).send({
        error: "modo_nao_suportado",
        message: "Upload direto só está disponível para imagem, propaganda, b-roll ou sobreposição.",
      });
    }
    const modo = modoRaw;
    const aceitos = VISUAL_ACCEPT[modo];

    const tipoReal = up.file.mimetype.split("/")[0]?.toLowerCase();
    if (!tipoReal || !aceitos.includes(tipoReal)) {
      return reply.code(400).send({
        error: "invalid_type",
        message: `Arquivo do tipo "${up.file.mimetype}" não é aceito para ${modo} — esperado ${aceitos
          .map((t) => `${t}/*`)
          .join(" ou ")}.`,
      });
    }

    const tituloRaw = (up.file.fields?.titulo as { value?: unknown } | undefined)?.value;
    if (!tituloValido(tituloRaw)) {
      return reply.code(400).send({
        error: "invalid_title",
        message: "Informe um título para o material, de 1 a 80 caracteres, sem caracteres de controle.",
      });
    }
    const titulo = tituloRaw.trim();

    const chaveRaw = (up.file.fields?.chave_cliente as { value?: unknown } | undefined)?.value;
    if (typeof chaveRaw !== "string" || !chaveRaw.trim()) {
      return reply.code(400).send({ error: "invalid_chave_cliente", message: "chave_cliente é obrigatória." });
    }
    const chaveCliente = chaveRaw.trim();

    let duracaoForaDoEsperado = false;
    if (tipoReal === "video") {
      const tmp = path.join(os.tmpdir(), `${randomUUID()}-creative-visual`);
      try {
        await writeFile(tmp, up.buffer);
        const geometria = await probeVideo(tmp);
        duracaoForaDoEsperado = geometria.durationSeconds < 4 || geometria.durationSeconds > 30;
      } catch {
        duracaoForaDoEsperado = true;
      } finally {
        await unlink(tmp).catch(() => {});
      }
    }

    const url = await saveUpload(req.tenantId, up.buffer, up.file.filename);
    const entrada = {
      prompt: null,
      aspect_ratio: null,
      voice_id: null,
      duracao_segundos: null,
      duracao_fora_do_esperado: duracaoForaDoEsperado,
    };

    try {
      const { rows } = await pool.query<CreativeJobRow>(
        `INSERT INTO creative_jobs (tenant_id, modo, modelo, titulo, entrada, chave_cliente, estado, arquivo_url, simulated)
         VALUES ($1, $2, 'upload', $3, $4, $5, 'pronto', $6, false) RETURNING *`,
        [req.tenantId, modo, titulo, JSON.stringify(entrada), chaveCliente, url],
      );
      return reply.code(201).send(rows[0]);
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        const existing = await pool.query<CreativeJobRow>(
          "SELECT * FROM creative_jobs WHERE tenant_id = $1 AND chave_cliente = $2",
          [req.tenantId, chaveCliente],
        );
        if (existing.rows[0]) return reply.code(200).send(existing.rows[0]);
      }
      throw err;
    }
  });

  // GALERIA-2, 02/10/2026 -- cancela um job AINDA NA FILA na Higgsfield
  // (antes de comecar a processar -- depois disso a API recusa). Best-
  // effort do lado do provider (cancelCreativeJob nunca lanca); aqui so
  // gravamos 'cancelado' se o fornecedor confirmou (202).
  app.post<{ Params: { id: string } }>("/creative-jobs/:id/cancel", async (req, reply) => {
    const { rows } = await pool.query<CreativeJobRow>(
      "SELECT * FROM creative_jobs WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    const job = rows[0];
    if (!job) return reply.code(404).send({ error: "not_found" });
    if (job.estado !== "na_fila" || !job.request_id) {
      return reply.code(409).send({
        error: "nao_cancelavel",
        message: "Este job não está mais na fila — só dá para cancelar antes de a geração começar.",
      });
    }
    const cancelado = await cancelCreativeJob(job.request_id);
    if (!cancelado) {
      return reply.code(409).send({
        error: "cancelamento_recusado",
        message:
          "A Higgsfield recusou o cancelamento — a geração provavelmente já começou (e será cobrada se terminar).",
      });
    }
    const { rows: updated } = await pool.query<CreativeJobRow>(
      `UPDATE creative_jobs SET estado = 'cancelado', terminado_em = now() WHERE id = $1 RETURNING *`,
      [job.id],
    );
    return updated[0];
  });

  app.delete<{ Params: { id: string } }>("/creative-jobs/:id", async (req, reply) => {
    const { rows } = await pool.query<CreativeJobRow>(
      "SELECT * FROM creative_jobs WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    const job = rows[0];
    if (job) {
      if (job.arquivo_url) {
        await unlink(path.join(config.uploadsDir, job.arquivo_url.replace("/uploads/", ""))).catch(() => {});
      }
      await pool.query("DELETE FROM creative_jobs WHERE id = $1 AND tenant_id = $2", [
        req.params.id,
        req.tenantId,
      ]);
    }
    return reply.code(204).send();
  });
}
