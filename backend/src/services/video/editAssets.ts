/**
 * Arquivos enviados pela aba "5. Studio Movie Edit" — b-roll, sobreposição,
 * fundo musical. Rota própria (`routes/editProjects.ts`), SEPARADA de
 * `/documents` de propósito: aquela segue em 1 MiB (problema registrado à
 * parte), e o teto daqui precisa comportar vídeo de b-roll.
 *
 * Sem tabela própria de assets (a migration 080 só criou `edit_projects`):
 * o arquivo é salvo em `uploads/<tenant>/edit-assets/<asset_id>.<ext>`, e a
 * extensão do disco é o único "índice" — `encontrarArquivoDoAsset` acha o
 * arquivo por prefixo, sem round-trip de banco. Isso só é seguro porque
 * `asset_id` é validado contra um padrão estrito ANTES de tocar disco (ver
 * `ASSET_ID_RE`) — nunca construa caminho concatenando o valor recebido sem
 * essa validação primeiro.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readdir, unlink } from "node:fs/promises";
import path from "node:path";
import { config } from "../../config.js";

export const EDIT_ASSET_KINDS = ["broll", "sobreposicao", "fundo"] as const;
export type EditAssetKind = (typeof EDIT_ASSET_KINDS)[number];

/** UUID exato de `randomUUID()` — nunca um valor recebido sem checar isto primeiro. */
export const ASSET_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const KIND_ACCEPT: Record<EditAssetKind, string[]> = {
  broll: ["video"],
  sobreposicao: ["image", "video"],
  fundo: ["audio"],
};

const MIME_EXT: Record<string, string> = {
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "video/x-msvideo": ".avi",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "audio/mpeg": ".mp3",
  "audio/wav": ".wav",
  "audio/x-wav": ".wav",
  "audio/mp4": ".m4a",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
};

/**
 * Teto de tamanho dos arquivos de edição (b-roll, sobreposição, fundo).
 *
 * Mesmo desenho de `referenceVideoMaxBytes`/`imageUploadMaxBytes`
 * (`uploadLimits.ts`): configurável, com um padrão que já serve, e um valor
 * inválido cai no padrão em vez de virar `NaN` (que desligaria o teto em
 * silêncio).
 */
const DEFAULT_MAX_BYTES = 150 * 1024 * 1024;

export function editAssetMaxBytes(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.EDIT_ASSET_MAX_MB;
  if (!raw) return DEFAULT_MAX_BYTES;
  const mb = Number(raw);
  return Number.isFinite(mb) && mb > 0 ? Math.floor(mb) * 1024 * 1024 : DEFAULT_MAX_BYTES;
}

/** Tipo aceito para este `kind`, ou uma mensagem legível de recusa. */
export function validarKindMime(kind: EditAssetKind, mimetype: string): string | null {
  const aceitos = KIND_ACCEPT[kind];
  const tipo = mimetype.split("/")[0]?.toLowerCase();
  if (!aceitos.includes(tipo)) {
    return `Arquivo do tipo "${mimetype}" não é aceito para ${kind} — esperado ${aceitos
      .map((t) => `${t}/*`)
      .join(" ou ")}.`;
  }
  return null;
}

function extensaoSegura(mimetype: string, originalName: string): string {
  const doMime = MIME_EXT[mimetype.toLowerCase()];
  if (doMime) return doMime;
  // Fallback pelo nome original, mas só um padrão estrito de extensão — nunca
  // o nome inteiro, que é justamente o vetor de path traversal.
  const ext = path.extname(originalName).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : "";
}

export function editAssetsDir(tenantId: string): string {
  return path.join(config.uploadsDir, tenantId, "edit-assets");
}

export interface EditAssetTarget {
  assetId: string;
  absolutePath: string;
  /** Caminho servido pelo proxy próprio — nunca o caminho de disco cru. */
  url: string;
}

export async function novoAlvoDeEditAsset(
  tenantId: string,
  mimetype: string,
  originalName: string,
): Promise<EditAssetTarget> {
  const assetId = randomUUID();
  const ext = extensaoSegura(mimetype, originalName);
  const dir = editAssetsDir(tenantId);
  await mkdir(dir, { recursive: true });
  // `/api` É OBRIGATÓRIO aqui: esta url alimenta <img>/<video>/<audio src=...>
  // diretamente (nunca passa pelo client `api.*`, que prefixa sozinho) — sem
  // o prefixo, o pedido cai no fallback do SPA (index.html) em vez da rota
  // de verdade. Achado em 14/09/2026 (STUDIO-EDIT-1-VERIF, item 3): a
  // sobreposição por imagem chegava com `naturalWidth/Height = 0`, porque o
  // `fetch` devolvia `text/html` em vez de `image/jpeg`.
  return {
    assetId,
    absolutePath: path.join(dir, `${assetId}${ext}`),
    url: `/api/tenant/edit-assets/${assetId}`,
  };
}

/**
 * GUARDA DE CAMINHO: `assetId` só é aceito se bater com `ASSET_ID_RE`. É a
 * única barreira contra path traversal — sem ela, `assetId` chegaria direto
 * a um `path.join`.
 */
export async function encontrarArquivoDoAsset(tenantId: string, assetId: string): Promise<string | null> {
  if (!ASSET_ID_RE.test(assetId)) return null;
  const dir = editAssetsDir(tenantId);
  let arquivos: string[];
  try {
    arquivos = await readdir(dir);
  } catch {
    return null;
  }
  const achado = arquivos.find((f) => f === assetId || f.startsWith(`${assetId}.`));
  return achado ? path.join(dir, achado) : null;
}

/** Idempotente: `false` quando o arquivo já não existia — não é erro para quem chama. */
export async function removerEditAsset(tenantId: string, assetId: string): Promise<boolean> {
  const caminho = await encontrarArquivoDoAsset(tenantId, assetId);
  if (!caminho) return false;
  await unlink(caminho).catch(() => {});
  return true;
}
