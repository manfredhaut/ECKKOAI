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
    };
  }>("/creative-jobs", async (req, reply) => {
    const { modo, modelo_id: modeloId, titulo, prompt, aspect_ratio: aspectRatio, chave_cliente: chaveCliente } =
      req.body ?? {};

    if (!isFixtureMode()) {
      return reply.code(501).send({
        error: "not_implemented",
        message: "Geração real de criativos ainda não está disponível — só em modo simulação.",
      });
    }
    if (modo !== "imagem") {
      return reply.code(400).send({
        error: "modo_nao_suportado",
        message: 'Só o modo "imagem" está disponível nesta rodada.',
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
    if (!chaveClienteValida(chaveCliente)) {
      return reply.code(400).send({ error: "invalid_chave_cliente", message: "chave_cliente é obrigatória." });
    }
    const modelo = modeloId ? creativeModelById(modeloId) : null;
    if (!modelo || !modelo.modos.includes(modo as CreativeModo)) {
      return reply.code(400).send({ error: "modelo_invalido", message: "Modelo desconhecido para este modo." });
    }

    const tituloTrim = titulo!.trim();
    const chaveTrim = chaveCliente!.trim();
    const entrada = { prompt: prompt.trim(), aspect_ratio: aspectRatio ?? null };

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
}
