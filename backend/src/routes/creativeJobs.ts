/**
 * ABAS-6, 29/09/2026 — rota do motor de jobs da aba "5. Gerar Vídeos & Imagens".
 *
 * Só o modo "imagem", só em fixture (ver creativeFixture.ts). Modo diferente
 * de "imagem", ou PROVIDER_MODE=live, são recusados explicitamente — nunca
 * um sucesso silencioso com dado fingido.
 *
 * PENDÊNCIA REGISTRADA: esta rota ainda não tem guarda de mutante própria
 * (diferente de checkVideoTitlePolicy.ts). As invariantes que uma guarda
 * futura precisaria proteger: modo≠"imagem" é recusado; chave_cliente
 * duplicada nunca cria uma segunda linha; arquivo_url só é gravado depois
 * do fixture devolver "ready".
 */
import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { isFixtureMode } from "../services/providers/providerMode.js";
import { creativeModelById } from "../services/providers/creativeCatalog.js";
import { createCreativeJobFixture, pollCreativeJobFixture } from "../services/providers/creativeFixture.js";
import type { CreativeModo } from "../services/providers/creativeCatalog.js";
import { probeSampleDurationSeconds } from "../services/voice/voiceSampleAudio.js";
import { probeVideo } from "../services/video/ffmpeg.js";
import { saveUpload } from "../services/storage.js";
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

export async function creativeJobRoutes(app: FastifyInstance): Promise<void> {
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
    return sincronizarComFixture(job);
  });

  app.post<{
    Body: {
      modo?: string;
      modelo_id?: string;
      titulo?: string;
      prompt?: string;
      aspect_ratio?: string | null;
      chave_cliente?: string;
      // ABAS-10/11 — opcional, só usado quando modo="narracao". `null`/
      // ausente = voz padrão (a fixture ignora; o caminho real ainda não
      // lê este campo, ver pendência registrada no bloco de UI).
      voice_id?: string | null;
      // ABAS-11 — obrigatório para modo narracao/musica: 3 a 600 segundos.
      // Ignorado (não gravado) para os demais modos.
      duracao_segundos?: number | null;
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
    } = req.body ?? {};

    if (!isFixtureMode()) {
      return reply.code(501).send({
        error: "not_implemented",
        message: "Geração real de criativos ainda não está disponível — só em modo simulação.",
      });
    }
    const MODOS_SUPORTADOS = new Set(["imagem", "narracao", "musica"]);
    if (typeof modo !== "string" || !MODOS_SUPORTADOS.has(modo)) {
      return reply.code(400).send({
        error: "modo_nao_suportado",
        message: "Só os modos imagem, narração e música estão disponíveis nesta rodada.",
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

    const tituloTrim = titulo!.trim();
    const chaveTrim = chaveCliente!.trim();
    const entrada = {
      prompt: prompt.trim(),
      aspect_ratio: aspectRatio ?? null,
      voice_id: typeof voiceId === "string" && voiceId.trim() ? voiceId.trim() : null,
      duracao_segundos: MODOS_DE_AUDIO.has(modo) ? duracaoSegundos : null,
    };

    let rows: CreativeJobRow[];
    try {
      ({ rows } = await pool.query<CreativeJobRow>(
        `INSERT INTO creative_jobs (tenant_id, modo, modelo, titulo, entrada, chave_cliente, estado, simulated)
         VALUES ($1, $2, $3, $4, $5, $6, 'enviando', true) RETURNING *`,
        [req.tenantId, modo, modelo.id, tituloTrim, JSON.stringify(entrada), chaveTrim],
      ));
    } catch (err) {
      if ((err as { code?: string }).code === "23505") {
        // Duplo clique com a MESMA chave_cliente: devolve o job já existente,
        // nunca cria uma segunda linha — mesma garantia do índice único
        // creative_jobs_tenant_chave_cliente_idx (migration 088).
        const existing = await pool.query<CreativeJobRow>(
          "SELECT * FROM creative_jobs WHERE tenant_id = $1 AND chave_cliente = $2",
          [req.tenantId, chaveTrim],
        );
        if (existing.rows[0]) return reply.code(200).send(await sincronizarComFixture(existing.rows[0]));
      }
      throw err;
    }

    const job = rows[0];
    const { jobId } = await createCreativeJobFixture({
      tenantId: req.tenantId,
      modo: "imagem",
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
  });

  // ABAS-12 — upload direto de narração/música: sem IA, sem fixture. A
  // duração REAL do arquivo (ffprobe) decide se cabe na faixa 3-600s — não
  // há campo de duração declarada nesta trilha (ver o comentário de
  // creativeAudioUploadCeilingBytes, uploadLimits.ts, sobre por que o teto
  // de bytes não pode depender dela). O job nasce direto em estado="pronto",
  // sem request_id: nenhum fornecedor é chamado neste caminho, e simulated
  // fica false — é o próprio arquivo da pessoa, nunca uma fixture.
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

  // ABAS-13 — upload direto para Imagem, Propaganda, B-roll e Sobreposição.
  // Tipo aceito por modo: Imagem/Sobreposição só imagem; B-roll só vídeo;
  // Propaganda os dois. Diferente do upload de áudio (ABAS-12), vídeo fora
  // da faixa de Duração (4-30s) NUNCA é recusado — entra com um aviso
  // (`entrada.duracao_fora_do_esperado`), decisão explícita do operador:
  // o arquivo já existe pronto, e travar a pessoa por causa de alguns
  // segundos a mais seria pior que deixar entrar com um aviso visível.
  app.post("/creative-jobs/upload-visual", async (req, reply) => {
    // O MESMO problema de ordem do áudio (creativeAudioUploadCeilingBytes,
    // ABAS-12): @fastify/multipart só expõe campos do formulário (inclusive
    // "modo") DEPOIS de req.file() terminar de ler o arquivo, e o limite de
    // bytes precisa estar fixado ANTES disso. Por isso o teto aqui é ÚNICO
    // para todo upload visual (o maior dos dois, referenceVideoMaxBytes) —
    // é a checagem de TIPO REAL, logo depois, que decide o que cada modo
    // aceita de fato. `modo` chega como campo de formulário comum, lido de
    // `up.file.fields`, exatamente como já funciona em creativeRefs.ts
    // (campo "tipo") e em /creative-jobs/upload (campo "modo", áudio).
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

    // Duração só é medida (e só importa) quando o arquivo É vídeo — imagem
    // não tem o conceito, e não recusamos nem avisamos sobre ela.
    let duracaoForaDoEsperado = false;
    if (tipoReal === "video") {
      const tmp = path.join(os.tmpdir(), `${randomUUID()}-creative-visual`);
      try {
        await writeFile(tmp, up.buffer);
        const geometria = await probeVideo(tmp);
        duracaoForaDoEsperado = geometria.durationSeconds < 4 || geometria.durationSeconds > 30;
      } catch {
        // Não foi possível medir: não bloqueia (mesma filosofia de "aceita
        // com aviso"), mas registra a incerteza como se estivesse fora —
        // melhor um aviso de mais do que um vídeo de duração desconhecida
        // aparecendo como se estivesse dentro da faixa.
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

  // ABAS-14, 30/09/2026 — excluir um job da Galeria. Mesmo padrão de
  // creativeRefs.ts: apaga o arquivo do disco (se existir) e a linha,
  // idempotente (204 mesmo se já não existir). SEM guarda de estado ainda
  // — um job "gerando"/"na_fila" pode ser excluído sem cancelar o que já
  // foi enviado ao fornecedor; pendência registrada, mesma família da
  // ausência de guarda de mutante já anotada no topo do arquivo.
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
