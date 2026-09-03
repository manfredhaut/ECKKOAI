/**
 * BB1+BB2, BLOCO HEYGEN-SIMPLES-10 (03/09/2026) — duas respostas OPCIONAIS
 * ao mesmo problema ("a pessoa aparece grande demais no vídeo"), nenhuma
 * delas campo nativo da HeyGen.
 *
 * ┌─ BB1 — Distância ──────────────────────────────────────────────────────────┐
 * │ `addDistanceMarginToAvatarPhoto` (avatarProvider.ts) cresce o CANVAS da    │
 * │ foto de treino do avatar antes do upload — mesma técnica (blur-extend,     │
 * │ `split`+`overlay`, nunca cor sólida — política já fixada em ffmpeg.ts) que │
 * │ `resizeBackgroundImage` (L2) usa para o FUNDO, aplicada ao lado oposto:    │
 * │ em vez de RECORTAR para preencher, o quadro CRESCE ao redor da pessoa.     │
 * │ Ligada em `trainAvatar()`, a única função que lê a foto do rosto do        │
 * │ avatar antes de subir ao fornecedor (`photoUrls[0]`).                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ BB2 — Enquadramento (fit) ────────────────────────────────────────────────┐
 * │ `input.avatarFit` (novo campo, `GenerateVideoInput`) VENCE `HEYGEN_FIT`   │
 * │ quando presente — a escolha da tela por VÍDEO, ao lado de `HEYGEN_FIT`    │
 * │ (o padrão global). `null`/ausente preserva o comportamento de hoje.      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Prova por EXECUÇÃO REAL nos dois: BB1 mede por `ffprobe` os bytes
 * capturados no `POST /v3/assets` real (a foto de treino, não o vídeo);
 * BB2 lê o campo `fit` do corpo capturado em `POST /v3/videos` real.
 *
 * ┌─ Custo: ZERO ────────────────────────────────────────────────────────────┐
 * │ `fetch` substituído; ffmpeg/ffprobe reais, mas locais. Teto de sessão      │
 * │ live zerado na entrada e na saída; `uploads/` da prova apagado no          │
 * │ `finally`.                                                                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { config } from "../config.js";
import { runFfmpeg, probeVideo } from "../services/video/ffmpeg.js";
import { resolveVideoFormat } from "../services/providers/videoFormat.js";
import { resetLiveGenerationCount } from "../services/providers/liveGuard.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "distância: addDistanceMarginToAvatarPhoto é NO-OP para \"padrao\" — devolve o MESMO buffer, sem chamar ffmpeg",
    name: "o retorno antecipado de \"padrao\" desaparece",
    kind: "obvio",
    file: "backend/src/services/providers/avatarProvider.ts",
    find: '  if (distance === "padrao") return buffer;',
    replace: "",
    expect: "o buffer devolvido NÃO é o mesmo do arquivo original",
  },
  {
    guard: "distância: trainAvatar() propaga a escolha da tela — a foto de treino real sobe MAIOR quando \"afastado\"",
    name: "trainAvatar() para de repassar input.distance",
    kind: "esperto",
    // ESPERTO: `addDistanceMarginToAvatarPhoto` continua sendo chamada — só o
    // argumento deixa de ser o que o CLIENTE escolheu. Com o mutante, pedir
    // "afastado" na tela não teria efeito nenhum na foto real enviada.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: '  const photoBuffer = await addDistanceMarginToAvatarPhoto(photoBufferOriginal, input.distance ?? "padrao");',
    replace: '  const photoBuffer = await addDistanceMarginToAvatarPhoto(photoBufferOriginal, "padrao");',
    expect: "esperado fator 1.5× nos dois eixos",
  },
  {
    guard: "enquadramento: input.avatarFit VENCE HEYGEN_FIT quando presente — o payload real de POST /v3/videos reflete a escolha",
    name: "buildHeygenVideoPayload para de ler input.avatarFit",
    kind: "esperto",
    // ESPERTO: `fit` continua no corpo (o schema não fica incompleto) — só o
    // valor volta a ser sempre o padrão global, ignorando a escolha por vídeo.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "    fit: input.avatarFit ?? HEYGEN_FIT,",
    replace: "    fit: HEYGEN_FIT,",
    expect: 'com avatarFit="contain", o fit enviado ao fornecedor foi "cover", esperado "contain"',
  },
];

export interface AvatarDistanceAndFitCheckResult {
  failures: string[];
  notes: string[];
}

const TENANT_DA_PROVA = "00000000-0000-4000-8000-0000000bb010";
const NOME_DA_FOTO = "rosto-prova.png";

/** Uma foto de prova pequena e conhecida — só o TAMANHO importa aqui, não o conteúdo. */
async function gerarFotoDeProva(caminho: string): Promise<void> {
  await runFfmpeg(["-y", "-f", "lavfi", "-i", "color=c=red:s=200x300", "-frames:v", "1", caminho], "avatar-distance-prova");
}

interface CorridaTreino {
  bytesDaFoto: Buffer | null;
  erro: unknown;
}

/** Roda `trainAvatar()` de verdade, com `fetch` substituído — captura os bytes que subiram para `POST /v3/assets`. */
async function correrTreino(fotoUrl: string, distance: "padrao" | "afastado"): Promise<CorridaTreino> {
  const { trainAvatar } = await import("../services/providers/avatarProvider.js");
  let bytesDaFoto: Buffer | null = null;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown, init?: unknown) => {
    const url = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
    if (url.includes("api.heygen.com/v3/assets")) {
      const initObj = init as { body?: unknown } | undefined;
      const form = initObj?.body;
      if (form instanceof FormData) {
        const arquivo = form.get("file");
        if (arquivo instanceof Blob) bytesDaFoto = Buffer.from(await arquivo.arrayBuffer());
      }
      return new Response(JSON.stringify({ data: { asset_id: "asset-da-prova" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("api.heygen.com/v3/avatars")) {
      return new Response(
        JSON.stringify({ data: { avatar_item: { id: "avatar-treinado-da-prova", status: "processing", supported_api_engines: ["avatar_iv"] } } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`fetch inesperado na prova de distância: ${url}`);
  }) as typeof fetch;

  let erro: unknown = null;
  try {
    await trainAvatar({ apiKey: "chave-irrelevante-fetch-substituido", vendor: "heygen", photoUrls: [fotoUrl], distance });
  } catch (err) {
    erro = err;
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  return { bytesDaFoto, erro };
}

interface CorridaVideo {
  fitEnviado: unknown;
  erro: unknown;
}

/** Roda `generateVideo()` de verdade, com `fetch` substituído — captura o `fit` do corpo enviado a `POST /v3/videos`. */
async function correrVideo(avatarFit: "cover" | "contain" | null): Promise<CorridaVideo> {
  const { generateVideo } = await import("../services/providers/avatarProvider.js");
  let fitEnviado: unknown = null;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown, init?: unknown) => {
    const url = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
    if (url.includes("api.elevenlabs.io") && url.includes("/with-timestamps")) {
      return new Response(
        JSON.stringify({ audio_base64: Buffer.from("prova-de-audio").toString("base64"), alignment: { character_end_times_seconds: [0.1, 2.0] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("api.heygen.com/v3/assets")) {
      return new Response(JSON.stringify({ data: { asset_id: "asset-da-prova" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("api.heygen.com/v3/videos")) {
      const initObj = init as { body?: string } | undefined;
      const corpo = initObj?.body ? JSON.parse(initObj.body) : null;
      fitEnviado = corpo?.fit ?? null;
      return new Response(JSON.stringify({ data: { video_id: "job-da-prova" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`fetch inesperado na prova de enquadramento: ${url}`);
  }) as typeof fetch;

  let erro: unknown = null;
  try {
    await generateVideo({
      apiKey: "chave-irrelevante-fetch-substituido",
      vendor: "heygen",
      providerAvatarId: "avatar-da-prova",
      script: "Roteiro da prova de enquadramento.",
      elevenLabsApiKey: "chave-irrelevante-fetch-substituido",
      voiceId: "voz-da-prova",
      tenantId: TENANT_DA_PROVA,
      audioTreatmentEnabled: false,
      audioTreatmentTargetLufs: -16,
      format: resolveVideoFormat("youtube"),
      supportedEngines: null,
      engineEnabled: false,
      scene: null,
      engineChoice: null,
      captions: false,
      avatarFit,
    });
  } catch (err) {
    erro = err;
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  return { fitEnviado, erro };
}

export async function checkAvatarDistanceAndFitPolicy(): Promise<AvatarDistanceAndFitCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const modoOriginal = process.env.PROVIDER_MODE;
  const tetoOriginal = process.env.PROVIDER_LIVE_MAX_GENERATIONS;

  const tenantDir = path.join(config.uploadsDir, TENANT_DA_PROVA);
  const caminhoDaFoto = path.join(tenantDir, NOME_DA_FOTO);
  const fotoUrl = `/uploads/${TENANT_DA_PROVA}/${NOME_DA_FOTO}`;

  let dimsOriginais: { width: number; height: number };
  let bytesOriginais: Buffer;
  let treinoPadrao: CorridaTreino;
  let treinoAfastado: CorridaTreino;
  let videoComContain: CorridaVideo;
  let videoSemEscolha: CorridaVideo;

  try {
    await mkdir(tenantDir, { recursive: true });
    await gerarFotoDeProva(caminhoDaFoto);
    dimsOriginais = await probeVideo(caminhoDaFoto);
    // Capturado ANTES da limpeza no `finally` — o arquivo original some
    // junto do `tenantDir` ao fim desta função.
    bytesOriginais = await readFile(caminhoDaFoto);

    process.env.PROVIDER_MODE = "live";
    process.env.PROVIDER_LIVE_MAX_GENERATIONS = "8";
    resetLiveGenerationCount();

    // ---------------------------------------------------------------------
    // BB1 — a função pura (mutante 1) e a wiring real (mutante 2).
    // ---------------------------------------------------------------------
    treinoPadrao = await correrTreino(fotoUrl, "padrao");
    resetLiveGenerationCount();
    treinoAfastado = await correrTreino(fotoUrl, "afastado");
    resetLiveGenerationCount();

    // ---------------------------------------------------------------------
    // BB2 — a escolha da tela vence o padrão (mutante 3), e `null` preserva
    // o padrão de hoje (sem mutante — contraponto direto, mesma corrida).
    // ---------------------------------------------------------------------
    videoComContain = await correrVideo("contain");
    resetLiveGenerationCount();
    videoSemEscolha = await correrVideo(null);
    resetLiveGenerationCount();
  } finally {
    resetLiveGenerationCount();
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
    if (tetoOriginal === undefined) delete process.env.PROVIDER_LIVE_MAX_GENERATIONS;
    else process.env.PROVIDER_LIVE_MAX_GENERATIONS = tetoOriginal;
    await rm(tenantDir, { recursive: true, force: true }).catch(() => {});
  }

  // -----------------------------------------------------------------------
  // 1. "padrao" é NO-OP — bytes IDÊNTICOS ao arquivo original.
  // -----------------------------------------------------------------------
  if (treinoPadrao.erro !== null) {
    failures.push(`distância: o treino com "padrao" levantou ${JSON.stringify(String(treinoPadrao.erro).slice(0, 160))}.`);
  } else if (!treinoPadrao.bytesDaFoto) {
    failures.push("distância: nenhuma foto foi capturada no POST /v3/assets do treino \"padrao\".");
  } else {
    if (!bytesOriginais.equals(treinoPadrao.bytesDaFoto)) {
      failures.push(
        `distância: com "padrao", o buffer devolvido NÃO é o mesmo do arquivo original (${bytesOriginais.length} vs ` +
          `${treinoPadrao.bytesDaFoto.length} bytes) — "padrao" precisa ser NO-OP por desenho (BB3), sem passar por ffmpeg.`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // 2. "afastado" CRESCE o canvas — medido por ffprobe, não por aparência.
  // -----------------------------------------------------------------------
  if (treinoAfastado.erro !== null) {
    failures.push(`distância: o treino com "afastado" levantou ${JSON.stringify(String(treinoAfastado.erro).slice(0, 160))}.`);
  } else if (!treinoAfastado.bytesDaFoto) {
    failures.push(
      "distância: a foto de treino real não cresceu com \"afastado\" — nenhum byte capturado no POST /v3/assets " +
        "(a escolha da tela não teve efeito nenhum na foto que de fato sobe ao fornecedor).",
    );
  } else {
    // `os.tmpdir()`, NUNCA `tenantDir` — o `finally` acima já o apagou por
    // esta altura da função.
    const caminhoMedido = path.join(os.tmpdir(), `${randomUUID()}-medido-afastado.png`);
    try {
      await writeFile(caminhoMedido, treinoAfastado.bytesDaFoto);
      const dims = await probeVideo(caminhoMedido);
      const fatorLargura = dims.width / dimsOriginais.width;
      const fatorAltura = dims.height / dimsOriginais.height;
      if (Math.abs(fatorLargura - 1.5) > 0.05 || Math.abs(fatorAltura - 1.5) > 0.05) {
        failures.push(
          `distância: com "afastado", a foto real subiu em ${dims.width}×${dims.height} (original ${dimsOriginais.width}×${dimsOriginais.height}, ` +
            `fator ${fatorLargura.toFixed(2)}×${fatorAltura.toFixed(2)}) — esperado fator 1.5× nos dois eixos.`,
        );
      }
    } catch (err) {
      failures.push(`distância: não consegui medir a foto capturada — ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      await unlink(caminhoMedido).catch(() => {});
    }
  }

  // -----------------------------------------------------------------------
  // 3. A escolha de "contain" chega ao POST /v3/videos real.
  // -----------------------------------------------------------------------
  if (videoComContain.erro !== null) {
    failures.push(`enquadramento: a corrida com avatarFit="contain" levantou ${JSON.stringify(String(videoComContain.erro).slice(0, 160))}.`);
  } else if (videoComContain.fitEnviado !== "contain") {
    failures.push(
      `enquadramento: com avatarFit="contain", o fit enviado ao fornecedor foi ${JSON.stringify(videoComContain.fitEnviado)}, esperado "contain".`,
    );
  }

  // -----------------------------------------------------------------------
  // 4. Sem escolha (`null`), o padrão de hoje (HEYGEN_FIT="cover") continua valendo.
  // -----------------------------------------------------------------------
  if (videoSemEscolha.erro !== null) {
    failures.push(`enquadramento: a corrida sem avatarFit levantou ${JSON.stringify(String(videoSemEscolha.erro).slice(0, 160))}.`);
  } else if (videoSemEscolha.fitEnviado !== "cover") {
    failures.push(
      `enquadramento: sem avatarFit escolhido, o fit enviado foi ${JSON.stringify(videoSemEscolha.fitEnviado)}, esperado "cover" ` +
        "(HEYGEN_FIT, o padrão de hoje — BB3 exige que ficar sem escolher não mude nada).",
    );
  }

  if (failures.length === 0) {
    notes.push('  distância: "padrao" é NO-OP na foto real de treino; "afastado" cresce o canvas em 1.5× nos dois eixos, medido por ffprobe');
    notes.push('  enquadramento: avatarFit="contain" chega ao fit real de POST /v3/videos; sem escolha, o padrão (cover) não muda');
  }

  return { failures, notes };
}
