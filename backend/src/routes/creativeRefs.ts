/**
 * ABAS-8, 30/09/2026 — referências da aba "5. Gerar Vídeos & Imagens"
 * (creative_refs, migration 088). Só upload manual nesta rodada — "Gerar
 * referência" (origem = "gerada", via creative_jobs) fica para o bloco
 * seguinte, que reusa o motor de jobs já existente.
 */
import type { FastifyInstance } from "fastify";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import type { CreativeRef } from "../types.js";
import { saveUpload } from "../services/storage.js";
import { imageUploadMaxBytes, takeUpload } from "../services/uploadLimits.js";

const TIPOS = ["produto", "cenario", "personagem", "marca"] as const;
type Tipo = (typeof TIPOS)[number];
const MAX_POR_TIPO = 8;

function tipoValido(v: unknown): v is Tipo {
  return typeof v === "string" && (TIPOS as readonly string[]).includes(v);
}

export async function creativeRefRoutes(app: FastifyInstance): Promise<void> {
  app.get("/creative-refs", async (req) => {
    const { rows } = await pool.query<CreativeRef>(
      "SELECT * FROM creative_refs WHERE tenant_id = $1 ORDER BY tipo, created_at DESC",
      [req.tenantId],
    );
    return rows;
  });

  app.post("/creative-refs", async (req, reply) => {
    const up = await takeUpload(req, reply, {
      maxBytes: imageUploadMaxBytes(),
      route: "creativeRefs.create",
      kind: "image",
    });
    if (!up) return reply;

    const tipoRaw = (up.file.fields?.tipo as { value?: unknown } | undefined)?.value;
    if (!tipoValido(tipoRaw)) {
      return reply.code(400).send({
        error: "invalid_tipo",
        message: `Campo "tipo" precisa ser um de: ${TIPOS.join(", ")}.`,
      });
    }
    const tipo = tipoRaw;

    const rotuloRaw = (up.file.fields?.rotulo as { value?: unknown } | undefined)?.value;
    const rotulo =
      typeof rotuloRaw === "string" && rotuloRaw.trim() ? rotuloRaw.trim().slice(0, 80) : null;

    // Teto POR TIPO, não global — cada cartão tem seu próprio limite de 8,
    // do jeito que a tela desenha ("2/8" por cartão).
    const { rows: countRows } = await pool.query<{ count: string }>(
      "SELECT count(*) FROM creative_refs WHERE tenant_id = $1 AND tipo = $2",
      [req.tenantId, tipo],
    );
    if (Number(countRows[0].count) >= MAX_POR_TIPO) {
      return reply.code(400).send({
        error: "limite_de_referencias",
        message: `Este cartão já tem ${MAX_POR_TIPO} imagens, o máximo. Exclua uma antes de enviar outra.`,
      });
    }

    const url = await saveUpload(req.tenantId, up.buffer, up.file.filename);
    const { rows } = await pool.query<CreativeRef>(
      `INSERT INTO creative_refs (tenant_id, tipo, rotulo, arquivo_url, origem)
       VALUES ($1, $2, $3, $4, 'upload') RETURNING *`,
      [req.tenantId, tipo, rotulo, url],
    );
    return reply.code(201).send(rows[0]);
  });

  app.delete<{ Params: { id: string } }>("/creative-refs/:id", async (req, reply) => {
    const { rows } = await pool.query<CreativeRef>(
      "SELECT * FROM creative_refs WHERE id = $1 AND tenant_id = $2",
      [req.params.id, req.tenantId],
    );
    const ref = rows[0];
    if (ref) {
      await unlink(path.join(config.uploadsDir, ref.arquivo_url.replace("/uploads/", ""))).catch(() => {});
      await pool.query("DELETE FROM creative_refs WHERE id = $1 AND tenant_id = $2", [
        req.params.id,
        req.tenantId,
      ]);
    }
    return reply.code(204).send();
  });
}
