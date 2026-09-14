/**
 * Studio Movie Edit — upload/exclusão de arquivo (Parte 2-bis) e salvar/
 * recarregar projeto (migration 080). BLOCO STUDIO-EDIT-1.
 *
 * As rotas de arquivo são SEPARADAS de `/documents` de propósito (ver o
 * cabeçalho de `services/video/editAssets.ts`). A ORDEM ao trocar arquivo é
 * OBRIGATÓRIA: sobe o novo com sucesso primeiro, só então `DELETE` no antigo
 * — a tela (`StudioMovieEditStep.tsx`) é quem garante essa ordem, chamando
 * as duas rotas em sequência.
 */
import type { FastifyInstance } from "fastify";
import { createReadStream, createWriteStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { pool } from "../db/pool.js";
import { contentTypeForExtension } from "../services/downloadProxy.js";
import { formatBytes } from "../services/uploadLimits.js";
import {
  EDIT_ASSET_KINDS,
  type EditAssetKind,
  ASSET_ID_RE,
  editAssetMaxBytes,
  encontrarArquivoDoAsset,
  novoAlvoDeEditAsset,
  removerEditAsset,
  validarKindMime,
} from "../services/video/editAssets.js";
import { duracaoFinal, type Trecho } from "../services/video/editProject.js";
import path from "node:path";

function duracaoDoPayload(payload: unknown): number {
  const trechos = (payload as { trechos?: Trecho[] } | null)?.trechos;
  return Array.isArray(trechos) ? duracaoFinal(trechos) : 0;
}

export async function editProjectRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------- assets ---

  app.post("/tenant/edit-assets", async (req, reply) => {
    const data = await req.file({ limits: { fileSize: editAssetMaxBytes() } });
    if (!data) {
      return reply.code(400).send({ error: "no_file", message: "Nenhum arquivo foi enviado." });
    }

    const kindRaw = (data.fields?.kind as { value?: unknown } | undefined)?.value;
    const kind = (EDIT_ASSET_KINDS as readonly string[]).includes(kindRaw as string)
      ? (kindRaw as EditAssetKind)
      : null;
    if (!kind) {
      return reply.code(400).send({
        error: "invalid_kind",
        message: `Campo "kind" precisa ser um de: ${EDIT_ASSET_KINDS.join(", ")}.`,
      });
    }

    const erroTipo = validarKindMime(kind, data.mimetype);
    if (erroTipo) {
      return reply.code(400).send({ error: "invalid_type", message: erroTipo });
    }

    const alvo = await novoAlvoDeEditAsset(req.tenantId, data.mimetype, data.filename);

    try {
      await pipeline(data.file, createWriteStream(alvo.absolutePath));
    } catch (err) {
      await unlink(alvo.absolutePath).catch(() => {});
      throw err;
    }

    // `truncated` só existe DEPOIS de a pipeline terminar de escoar o
    // stream — @fastify/multipart para de emitir dado além do teto, mas não
    // interrompe a conexão; o corpo excedente é descartado, não lido de
    // volta. É a forma real deste teto recusar sem deixar `413` cru: a
    // pessoa recebe o motivo, não só o código.
    if (data.file.truncated) {
      await unlink(alvo.absolutePath).catch(() => {});
      return reply.code(413).send({
        error: "file_too_large",
        message: `O arquivo passa do limite de ${formatBytes(editAssetMaxBytes())}.`,
      });
    }

    return reply.code(201).send({ asset_id: alvo.assetId, url: alvo.url });
  });

  app.get<{ Params: { asset_id: string } }>("/tenant/edit-assets/:asset_id", async (req, reply) => {
    const caminho = await encontrarArquivoDoAsset(req.tenantId, req.params.asset_id);
    if (!caminho) return reply.code(404).send({ error: "not_found" });
    reply.header("Content-Type", contentTypeForExtension(path.extname(caminho)));
    return reply.send(createReadStream(caminho));
  });

  app.delete<{ Params: { asset_id: string } }>("/tenant/edit-assets/:asset_id", async (req, reply) => {
    if (!ASSET_ID_RE.test(req.params.asset_id)) {
      return reply.code(400).send({ error: "invalid_asset_id" });
    }
    const removeu = await removerEditAsset(req.tenantId, req.params.asset_id);
    if (!removeu) return reply.code(404).send({ error: "not_found" });
    return reply.code(204).send();
  });

  // ------------------------------------------------------------ projeto ---

  app.post<{ Body: { source_video_id?: string; payload?: unknown } }>("/tenant/edit-projects", async (req, reply) => {
    const { source_video_id, payload } = req.body ?? {};
    if (!source_video_id) {
      return reply.code(400).send({ error: "missing_source_video_id" });
    }
    const { rows } = await pool.query(
      `INSERT INTO edit_projects (tenant_id, source_video_id, payload, duration_seconds)
       VALUES ($1, $2, $3::jsonb, $4) RETURNING *`,
      [req.tenantId, source_video_id, JSON.stringify(payload ?? {}), duracaoDoPayload(payload)],
    );
    return reply.code(201).send(rows[0]);
  });

  app.put<{ Params: { id: string }; Body: { payload?: unknown } }>(
    "/tenant/edit-projects/:id",
    async (req, reply) => {
      const { payload } = req.body ?? {};
      const { rows } = await pool.query(
        `UPDATE edit_projects SET payload = $3::jsonb, duration_seconds = $4, updated_at = now()
         WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        [req.params.id, req.tenantId, JSON.stringify(payload ?? {}), duracaoDoPayload(payload)],
      );
      if (!rows[0]) return reply.code(404).send({ error: "not_found" });
      return rows[0];
    },
  );

  app.get<{ Params: { id: string } }>("/tenant/edit-projects/:id", async (req, reply) => {
    const { rows } = await pool.query("SELECT * FROM edit_projects WHERE id = $1 AND tenant_id = $2", [
      req.params.id,
      req.tenantId,
    ]);
    if (!rows[0]) return reply.code(404).send({ error: "not_found" });
    return rows[0];
  });

  /** O projeto mais recente daquele vídeo, ou `null` — para a tela recarregar sozinha. */
  app.get<{ Params: { videoId: string } }>("/tenant/edit-projects/by-video/:videoId", async (req, reply) => {
    const { rows } = await pool.query(
      `SELECT * FROM edit_projects WHERE source_video_id = $1 AND tenant_id = $2
       ORDER BY updated_at DESC LIMIT 1`,
      [req.params.videoId, req.tenantId],
    );
    return rows[0] ?? null;
  });
}
