/**
 * Derivação de formatos a partir do master — o caminho de custo ZERO.
 *
 * Uma geração no fornecedor produz UM arquivo. Todos os outros formatos saem
 * dele aqui, por software, sem tocar a rede e sem debitar crédito. A regra que
 * governa o pixel está em `formatDerivation.ts`; este módulo é quem a executa,
 * persiste e mede.
 *
 * ---------------------------------------------------------------------------
 * O MASTER TEM DE ESTAR NO NOSSO DISCO — não é preferência, é dano já ocorrido
 *
 * A URL que a HeyGen devolve é assinada e expira. Dois vídeos deste projeto
 * ficaram inacessíveis exatamente assim: `output_url` apontava para
 * `files2.heygen.ai`, a assinatura venceu, e o artefato pelo qual já se tinha
 * pago virou 403. Derivar a partir de uma URL de fornecedor reintroduziria o
 * mesmo defeito num caminho novo — e pior, de forma intermitente, porque
 * funcionaria durante todo o desenvolvimento e falharia semanas depois.
 *
 * Por isso `deriveVariants` RECUSA um master que não seja nosso, em vez de
 * tentar baixar. Baixar seria conveniente e esconderia o problema: o master
 * precisa estar persistido antes, e é responsabilidade de quem marca o vídeo
 * como pronto.
 * ---------------------------------------------------------------------------
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { pool } from "../../db/pool.js";
import { config } from "../../config.js";
import { logEvent } from "../log/safeLog.js";
import { validateVideoArtifact } from "../videoArtifact.js";
import { probeVideo, runFfmpeg } from "./ffmpeg.js";
import {
  buildDerivationArgs,
  buildSubjectProbeArgs,
  deriveFormat,
  targetForAspect,
  type Resolution,
} from "../providers/formatDerivation.js";

/**
 * Lado curto do quadro de entrega. É o teto do fornecedor — a mesma âncora que
 * a HeyGen usa —, e não um número escolhido por nós: trocá-lo move a tabela
 * inteira de formatos junto, coerentemente.
 */
export const DELIVERY_SHORT_EDGE = 1080;

export class MasterNotLocalError extends Error {
  constructor(url: string) {
    super(
      `O master não está no nosso armazenamento (${url.slice(0, 40)}…). A derivação lê o arquivo do ` +
        "disco de propósito: URL de fornecedor é assinada e expira, e dois vídeos já foram perdidos assim.",
    );
    this.name = "MasterNotLocalError";
  }
}

export interface DerivedVariant {
  aspectRatio: string;
  width: number;
  height: number;
  outputUrl: string;
  /** Geometria MEDIDA do sujeito — por ffprobe, não pela nossa conta. */
  subject: Resolution;
  elapsedMs: number;
  shortfall: string | null;
}

/** Caminho local de um upload nosso. Lança se a URL não for nossa. */
export function localPathForUpload(url: string): string {
  if (!url.startsWith("/uploads/")) throw new MasterNotLocalError(url);
  const relative = url.replace(/^\/uploads\//, "");
  // Um `..` na URL sairia do diretório de uploads. A checagem é feita depois
  // de resolver, e não por busca de substring, porque a codificação de `..`
  // tem variantes suficientes para que a busca ingênua erre.
  const full = path.resolve(config.uploadsDir, relative);
  if (!full.startsWith(path.resolve(config.uploadsDir))) throw new MasterNotLocalError(url);
  return full;
}

/**
 * Deriva um formato do master e devolve a variante MEDIDA.
 *
 * A medição do sujeito acontece por uma passada separada de ffmpeg que aplica
 * só a escala do sujeito num quadro. É a única forma de constatar — em vez de
 * afirmar — que o sujeito não foi ampliado, e custa uma fração de segundo
 * contra os segundos da transcodificação completa.
 */
export async function deriveOneVariant(
  masterPath: string,
  master: Resolution,
  aspectRatio: string,
  tenantId: string,
): Promise<DerivedVariant> {
  const target = targetForAspect(aspectRatio, DELIVERY_SHORT_EDGE);
  const plan = deriveFormat(master, { aspectRatio, target });

  const tenantDir = path.join(config.uploadsDir, tenantId);
  await mkdir(tenantDir, { recursive: true });

  const name = `${randomUUID()}-${aspectRatio.replace(":", "x")}.mp4`;
  const outPath = path.join(tenantDir, name);
  const probePath = path.join(tenantDir, `.subject-${randomUUID()}.png`);

  const { elapsedMs } = await runFfmpeg(
    buildDerivationArgs(masterPath, outPath, plan.canvas),
    `derive ${aspectRatio}`,
  );

  let subject: Resolution;
  try {
    await runFfmpeg(buildSubjectProbeArgs(masterPath, probePath, plan.canvas), `subject ${aspectRatio}`);
    const probed = await probeVideo(probePath);
    subject = { width: probed.width, height: probed.height };
  } finally {
    // A sonda é lixo de medição; deixá-la no diretório do cliente a faria
    // aparecer como artefato dele.
    await rm(probePath, { force: true });
  }

  // O artefato derivado passa pela MESMA validação do que vem do fornecedor.
  // Uma transcodificação que morre no meio deixa um mp4 truncado — prefixo
  // válido, arquivo inútil —, que é exatamente o modo de falha que a validação
  // do DEMO-1 existe para pegar.
  const head = await readFile(outPath);
  const size = (await stat(outPath)).size;
  const check = validateVideoArtifact(head.subarray(0, 64), size);
  if (!check.ok) {
    await rm(outPath, { force: true });
    throw new Error(`a derivação ${aspectRatio} produziu artefato inválido: ${check.reason}`);
  }

  // A INVARIANTE do bloco, verificada com o número medido e não com o previsto.
  // Falhar aqui é preferível a entregar: um sujeito ampliado é irreversível do
  // ponto de vista de qualidade, e passa despercebido numa tela pequena.
  if (subject.height > master.height || subject.width > master.width) {
    await rm(outPath, { force: true });
    throw new Error(
      `a derivação ${aspectRatio} AMPLIOU o sujeito (${subject.width}×${subject.height} contra o master ` +
        `${master.width}×${master.height}). A política proíbe ampliar: inventaria nitidez que não existe.`,
    );
  }

  logEvent("info", "variant_derived", {
    aspectRatio,
    canvas: `${plan.canvas.width}x${plan.canvas.height}`,
    subject: `${subject.width}x${subject.height}`,
    elapsedMs,
    meetsTarget: plan.meetsTarget,
  });

  return {
    aspectRatio,
    width: plan.canvas.width,
    height: plan.canvas.height,
    outputUrl: `/uploads/${tenantId}/${name}`,
    subject,
    elapsedMs,
    shortfall: plan.shortfall,
  };
}

/**
 * Deriva os formatos pedidos e grava as linhas de variante.
 *
 * O formato que COINCIDE com o do master não é derivado: ele já existe, e
 * recodificá-lo custaria uma perda de qualidade em troca de nada. Ele entra
 * como variante apontando para o próprio arquivo do master, com a origem que
 * de fato teve — `generated`, porque foi o fornecedor que o produziu.
 */
export async function deriveVariantsForVideo(input: {
  videoId: string;
  tenantId: string;
  masterUrl: string;
  masterAspectRatio: string;
  aspectRatios: readonly string[];
}): Promise<DerivedVariant[]> {
  const masterPath = localPathForUpload(input.masterUrl);
  const probed = await probeVideo(masterPath);
  const master: Resolution = { width: probed.width, height: probed.height };

  const out: DerivedVariant[] = [];

  for (const aspectRatio of input.aspectRatios) {
    if (aspectRatio === input.masterAspectRatio) {
      const target = targetForAspect(aspectRatio, DELIVERY_SHORT_EDGE);
      const plan = deriveFormat(master, { aspectRatio, target });
      await recordVariant(input.videoId, input.tenantId, {
        aspectRatio,
        width: master.width,
        height: master.height,
        outputUrl: input.masterUrl,
        subject: master,
        elapsedMs: 0,
        shortfall: plan.shortfall,
      }, "generated");
      out.push({
        aspectRatio,
        width: master.width,
        height: master.height,
        outputUrl: input.masterUrl,
        subject: master,
        elapsedMs: 0,
        shortfall: plan.shortfall,
      });
      continue;
    }

    const variant = await deriveOneVariant(masterPath, master, aspectRatio, input.tenantId);
    await recordVariant(input.videoId, input.tenantId, variant, "derived");
    out.push(variant);
  }

  return out;
}

async function recordVariant(
  videoId: string,
  tenantId: string,
  v: DerivedVariant,
  origin: "generated" | "derived",
): Promise<void> {
  await pool.query(
    `INSERT INTO video_variants
       (video_id, tenant_id, aspect_ratio, width, height, origin, output_url,
        subject_width, subject_height, elapsed_ms, shortfall, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'ready')
     ON CONFLICT (video_id, aspect_ratio) DO UPDATE SET
       width = EXCLUDED.width, height = EXCLUDED.height, origin = EXCLUDED.origin,
       output_url = EXCLUDED.output_url, subject_width = EXCLUDED.subject_width,
       subject_height = EXCLUDED.subject_height, elapsed_ms = EXCLUDED.elapsed_ms,
       shortfall = EXCLUDED.shortfall, status = 'ready', error_message = NULL`,
    [
      videoId,
      tenantId,
      v.aspectRatio,
      v.width,
      v.height,
      origin,
      v.outputUrl,
      v.subject.width,
      v.subject.height,
      v.elapsedMs,
      v.shortfall,
    ],
  );
}
