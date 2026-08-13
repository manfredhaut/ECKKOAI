import { readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "../db/pool.js";
import { config } from "../config.js";
import { getStorageProvider } from "./providers/storageProvider.js";

export async function saveUpload(
  tenantId: string,
  buffer: Buffer,
  originalName: string,
): Promise<string> {
  const { rows } = await pool.query<{ storage_provider: string }>(
    "SELECT storage_provider FROM tenants WHERE id = $1",
    [tenantId],
  );
  const provider = getStorageProvider(rows[0]?.storage_provider as "drive" | "platform_hosted" | undefined);
  return provider.save(tenantId, buffer, originalName);
}

// Reads back a previously saved upload's bytes, given the URL saveUpload()
// returned. Every StorageProvider today falls back to local disk under the
// hood (see storageProvider.ts), so this reads straight from there — will
// need to grow provider-aware fetching once a real Drive/S3 backend exists.
export async function readUpload(url: string): Promise<Buffer> {
  const relative = url.replace(/^\/uploads\//, "");
  return readFile(path.join(config.uploadsDir, relative));
}

/**
 * Tipo do arquivo pela EXTENSÃO. O storage local não guarda content-type.
 *
 * Mora aqui, ao lado de `readUpload`, porque é sempre ela que produz os bytes a
 * que este mime se refere. Enquanto viveu privada em `avatarProvider.ts`, o
 * segundo chamador (a rota de recomposição) só tinha duas saídas: copiar as
 * quatro linhas, ou importar de um módulo cuja razão de existir é outra.
 */
export function mimeDoUpload(caminho: string): string {
  const ext = caminho.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}
