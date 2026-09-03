/**
 * L1+L2, BLOCO HEYGEN-SIMPLES-6 (03/09/2026) — o fundo por IMAGEM sobe
 * REDIMENSIONADO ao quadro real, não mais do tamanho nativo do upload.
 *
 * ┌─ O bug, MEDIDO no vídeo real desta sessão ──────────────────────────────┐
 * │ `background` de `POST /v3/videos` (schema relido em 03/09/2026, doc     │
 * │ pública) só tem `type`/`value`/`url`/`asset_id` — NENHUM campo de       │
 * │ escala, recorte, posição ou dimensão (`fit`, o campo top-level, rege    │
 * │ como o AVATAR se encaixa no quadro, nunca a imagem de fundo — os dois   │
 * │ são independentes no schema). Sem enquadramento nosso, o arquivo subia  │
 * │ do tamanho NATIVO do upload (ex.: uma foto de escritório 800×600), e o  │
 * │ fornecedor o colocava assim — pequeno, num canto, é o retângulo que o   │
 * │ operador viu.                                                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A prova é por EXECUÇÃO REAL: uma imagem de prova, gerada por ffmpeg
 * (`color=size=100x50`, deliberadamente ERRADA — nem a proporção nem o
 * tamanho do quadro alvo), sobe pelo caminho de verdade
 * (`generateVideoHeygen` → `resizeBackgroundImage` → `heygenUploadAsset`),
 * e os BYTES capturados no `POST /v3/assets` real (FormData, não JSON — o
 * `Blob` interceptado dá o arquivo exato que subiria) são medidos por
 * `ffprobe`. Comparar o VALOR (dimensão em pixels), não a aparência.
 *
 * ┌─ Custo: ZERO ────────────────────────────────────────────────────────────┐
 * │ `fetch` substituído nos dois vendors; ffmpeg/ffprobe reais, mas locais.   │
 * │ Teto de sessão live zerado na entrada e na saída; `uploads/` da prova    │
 * │ apagado no `finally`.                                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { config } from "../config.js";
import { runFfmpeg, probeVideo } from "../services/video/ffmpeg.js";
import { resolveVideoFormat, pixelDimensionsFor } from "../services/providers/videoFormat.js";
import { resetLiveGenerationCount } from "../services/providers/liveGuard.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "fundo: a imagem sobe redimensionada ao quadro real, não no tamanho nativo do upload",
    name: "generateVideoHeygen para de redimensionar o fundo antes do upload",
    kind: "esperto",
    // ESPERTO: o upload continua acontecendo (o vídeo não perde o fundo) —
    // só a chamada a `resizeBackgroundImage` desaparece, e os bytes CRUS
    // (o tamanho nativo do arquivo enviado pela pessoa) sobem direto. É
    // exatamente o bug medido no vídeo real: o fundo sobe pequeno.
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "      const { width, height } = pixelDimensionsFor(input.format.aspectRatio, input.format.resolution);\n" +
      "      const imagem = await resizeBackgroundImage(imagemCrua, width, height);\n" +
      '      backgroundAssetId = await heygenUploadAsset(input.apiKey, imagem, "image/png");',
    replace: '      backgroundAssetId = await heygenUploadAsset(input.apiKey, imagemCrua, "image/png");',
    expect: "o asset do fundo não bateu com o quadro alvo",
  },
  {
    guard: "resolução: o payload real leva resolution=1080p (N1)",
    name: "MEASURED_RESOLUTION volta a 720p",
    kind: "esperto",
    // ESPERTO: o campo `resolution` continua sendo enviado — só o VALOR
    // volta ao antigo. A tarifa não varia por resolução (confirmado pelo
    // operador); manter 720p sem necessidade entrega menos qualidade de
    // graça.
    file: "backend/src/services/providers/videoFormat.ts",
    find: 'const MEASURED_RESOLUTION: VideoResolution = "1080p";',
    replace: 'const MEASURED_RESOLUTION: VideoResolution = "720p";',
    expect: 'resolution enviado foi "720p", esperado "1080p"',
  },
];

export interface BackgroundResizeCheckResult {
  failures: string[];
  notes: string[];
}

const TENANT_DA_PROVA = "00000000-0000-4000-8000-0000000e1f02";
const NOME_DO_ARQUIVO = "fundo-prova.png";

/** Gera uma imagem de prova ERRADA (100×50) — nem a proporção nem o tamanho do quadro alvo. */
async function gerarImagemDeProva(caminho: string): Promise<void> {
  await runFfmpeg(
    ["-y", "-f", "lavfi", "-i", "color=c=blue:s=100x50", "-frames:v", "1", caminho],
    "background-resize-prova",
  );
}

interface Corrida {
  bytesDoFundo: Buffer | null;
  resolutionEnviada: unknown;
  erro: unknown;
}

async function correr(): Promise<Corrida> {
  const { generateVideo } = await import("../services/providers/avatarProvider.js");
  let bytesDoFundo: Buffer | null = null;
  let resolutionEnviada: unknown = null;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown, init?: unknown) => {
    const url = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
    if (url.includes("api.elevenlabs.io") && url.includes("/with-timestamps")) {
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from("prova-de-audio").toString("base64"),
          alignment: { character_end_times_seconds: [0.1, 3.5] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("api.heygen.com/v3/assets")) {
      const initObj = init as { body?: unknown } | undefined;
      const form = initObj?.body;
      if (form instanceof FormData) {
        const arquivo = form.get("file");
        if (arquivo instanceof Blob && arquivo.type === "image/png") {
          bytesDoFundo = Buffer.from(await arquivo.arrayBuffer());
        }
      }
      return new Response(JSON.stringify({ data: { asset_id: `asset-${randomUUID().slice(0, 8)}` } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("api.heygen.com/v3/videos")) {
      const initObj = init as { body?: string } | undefined;
      const corpo = initObj?.body ? JSON.parse(initObj.body) : null;
      resolutionEnviada = corpo?.resolution ?? null;
      return new Response(JSON.stringify({ data: { video_id: "job-da-prova" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`fetch inesperado na prova de redimensionamento de fundo: ${url}`);
  }) as typeof fetch;

  let erro: unknown = null;
  try {
    await generateVideo({
      apiKey: "chave-irrelevante-fetch-substituido",
      vendor: "heygen",
      providerAvatarId: "avatar-da-prova",
      script: "Roteiro da prova de redimensionamento de fundo.",
      elevenLabsApiKey: "chave-irrelevante-fetch-substituido",
      voiceId: "voz-da-prova",
      tenantId: TENANT_DA_PROVA,
      audioTreatmentEnabled: false,
      audioTreatmentTargetLufs: -16,
      format: resolveVideoFormat("youtube"),
      supportedEngines: null,
      engineEnabled: false,
      scene: { background: { type: "image", uploadUrl: `/uploads/${TENANT_DA_PROVA}/${NOME_DO_ARQUIVO}` } },
      engineChoice: null,
      captions: false,
    });
  } catch (err) {
    erro = err;
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  return { bytesDoFundo, resolutionEnviada, erro };
}

export async function checkBackgroundResizePolicy(): Promise<BackgroundResizeCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const modoOriginal = process.env.PROVIDER_MODE;
  const tetoOriginal = process.env.PROVIDER_LIVE_MAX_GENERATIONS;

  const tenantDir = path.join(config.uploadsDir, TENANT_DA_PROVA);
  const caminhoDaImagem = path.join(tenantDir, NOME_DO_ARQUIVO);
  const alvo = pixelDimensionsFor(resolveVideoFormat("youtube").aspectRatio, resolveVideoFormat("youtube").resolution);

  let corrida: Corrida;
  try {
    await mkdir(tenantDir, { recursive: true });
    await gerarImagemDeProva(caminhoDaImagem);

    process.env.PROVIDER_MODE = "live";
    process.env.PROVIDER_LIVE_MAX_GENERATIONS = "8";
    resetLiveGenerationCount();

    corrida = await correr();
  } finally {
    resetLiveGenerationCount();
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
    if (tetoOriginal === undefined) delete process.env.PROVIDER_LIVE_MAX_GENERATIONS;
    else process.env.PROVIDER_LIVE_MAX_GENERATIONS = tetoOriginal;
    await rm(tenantDir, { recursive: true, force: true }).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // 1. O asset do fundo sobe no TAMANHO DO QUADRO ALVO — não nos 100×50 da
  //    imagem de prova (deliberadamente errados).
  // ---------------------------------------------------------------------------
  if (corrida.erro !== null) {
    failures.push(
      `fundo: a corrida levantou ${JSON.stringify(String(corrida.erro).slice(0, 160))} — esperado sucesso.`,
    );
  } else if (!corrida.bytesDoFundo) {
    failures.push("fundo: nenhum asset PNG foi capturado em POST /v3/assets.");
  } else {
    // `os.tmpdir()`, NUNCA `tenantDir` — o `finally` acima já apagou aquele
    // diretório inteiro antes de chegar aqui.
    const arquivoMedido = path.join(os.tmpdir(), `${randomUUID()}-medido.png`);
    try {
      await writeFile(arquivoMedido, corrida.bytesDoFundo);
      const geometria = await probeVideo(arquivoMedido);
      if (geometria.width !== alvo.width || geometria.height !== alvo.height) {
        failures.push(
          `fundo: o asset do fundo não bateu com o quadro alvo — subiu ${geometria.width}×${geometria.height}, ` +
            `esperado ${alvo.width}×${alvo.height} (16:9 @ 1080p). A imagem de prova era 100×50 de propósito: se ` +
            "isto reprovar com esse número, o redimensionamento não está acontecendo — é o próprio bug medido no " +
            "vídeo real desta sessão.",
        );
      }
    } finally {
      await rm(arquivoMedido, { force: true }).catch(() => {});
    }
  }

  // ---------------------------------------------------------------------------
  // 2. resolution=1080p chega ao POST /v3/videos real — N1.
  // ---------------------------------------------------------------------------
  if (corrida.resolutionEnviada !== "1080p") {
    failures.push(
      `resolução: resolution enviado foi ${JSON.stringify(corrida.resolutionEnviada)}, esperado "1080p" — a ` +
        "tarifa não varia por resolução (confirmado pelo operador), então manter 720p entregava menos qualidade " +
        "de graça.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      `  fundo: uma imagem de prova 100×50 (deliberadamente errada) sobe redimensionada para ${alvo.width}×${alvo.height} ` +
        "(o quadro real, 16:9 @ 1080p) — medido por ffprobe nos bytes REAIS capturados em POST /v3/assets",
    );
    notes.push('  resolução: o POST /v3/videos real leva resolution="1080p"');
  }

  return { failures, notes };
}
