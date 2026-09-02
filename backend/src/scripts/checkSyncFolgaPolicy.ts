/**
 * FOLGA DE SINCRONIZAÇÃO — 02/09/2026. `MARGEM_DURACAO_WAN3_SEGUNDOS`
 * garante, por CONSTRUÇÃO, que o `duration` PEDIDO ao Wan nunca fica a
 * menos de 0,5s da fala — mas nunca tinha sido medido se o Wan RESPEITA
 * esse pedido no vídeo REAL entregue. Esta guarda mede a duração real
 * (`ffprobe`, mesma técnica de `checkTrimOvershootPolicy.ts`) e recusa
 * ANTES de sincronizar quando a folga real não sobrevive à entrega.
 *
 * ┌─ Cinco invariantes, cada uma com mutante próprio ─────────────────────────┐
 * │ G-1  folga insuficiente RECUSA (FolgaDeSincronizacaoInsuficienteError).   │
 * │ G-2  folga suficiente NÃO recusa — contraponto de G-1, mesma comparação, │
 * │      sentido oposto (pega inversão de operador, não só remoção).         │
 * │ G-3  a folga é ARREDONDADA em milissegundos antes de comparar — achado   │
 * │      REAL da validação offline desta correção: `5 - 4.9` em IEEE754 dá   │
 * │      `0.09999999999999964`, não `0.1` exato, e sem arredondar a          │
 * │      fronteira `>=` vira sorte de representação binária. Testado no      │
 * │      limiar EXATO (fala 4,9s contra vídeo de 5,000s).                    │
 * │ G-4  `/redo-video` escalona a margem pelo contador de recusas            │
 * │      (`sync_folga_recusas × ESCALADA_MARGEM_POR_RECUSA_SEGUNDOS`) —      │
 * │      por LEITURA (a chamada vive num handler Fastify sem ponto de        │
 * │      entrada isolado, mesma razão de G-1 em                              │
 * │      `checkTomadaUnicaMarkerCachePolicy.ts`).                            │
 * │ G-5  a margem extra realmente CHEGA ao `duration` pedido ao Wan em       │
 * │      `animarTomadaUnicaComAudioReal` — por EXECUÇÃO real, comparando o   │
 * │      corpo submetido com e sem margem extra.                             │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. G-1/G-2/G-3/G-5 rodam `runFalPipelineDaImagem` de verdade
 * (`fetch` substituído) com `ffprobe` REAL contra a fixture local
 * versionada (`fixtures/simulated-video-9x16.mp4`, 5,000s medidos) — nunca
 * um fornecedor de verdade. G-4 é leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import type { DiarioDoPipeline, FalPipelineInput } from "../services/video/falPipeline.js";
import { runFalPipelineDaImagem, FolgaDeSincronizacaoInsuficienteError } from "../services/video/falPipeline.js";
import { FIXTURES_DIR } from "../services/providers/fixtureProvider.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";
const ROTAS_VIDEOS = "backend/src/routes/videos.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "folga de sincronização: recusa quando o vídeo real sai mais curto que a fala",
    name: "o limiar de folga vira negativo — qualquer folga passa, mesmo faltando",
    kind: "obvio",
    file: PIPELINE,
    find: "export const FOLGA_MINIMA_SINCRONIZAR_SEGUNDOS = 0.1;",
    replace: "export const FOLGA_MINIMA_SINCRONIZAR_SEGUNDOS = -1;",
    expect: "folga de sincronização: recusou quando não deveria (folga suficiente)",
  },
  {
    guard: "folga de sincronização: folga suficiente NÃO recusa (contraponto de G-1)",
    name: "a comparação da folga é invertida — suficiente passa a recusar, insuficiente passa a aceitar",
    kind: "esperto",
    // ESPERTO: a comparação continua na MESMA forma (`folgaSegundos <op> LIMIAR`),
    // só o operador inverte — pega quem "conserta" trocando o sentido sem
    // perceber, não só quem apaga a checagem.
    file: PIPELINE,
    find: "const suficiente = folgaSegundos >= FOLGA_MINIMA_SINCRONIZAR_SEGUNDOS;",
    replace: "const suficiente = folgaSegundos <= FOLGA_MINIMA_SINCRONIZAR_SEGUNDOS;",
    expect: "folga de sincronização: não recusou quando deveria (folga insuficiente)",
  },
  {
    guard: "folga de sincronização: a folga é arredondada em milissegundos antes de comparar",
    name: "o arredondamento some — o ruído de ponto flutuante decide a fronteira",
    kind: "esperto",
    // ESPERTO: sem o arredondamento, o código continua "funcionando" para
    // toda folga que não caia bem em cima da fronteira — só quebra
    // exatamente no limiar (5 - 4.9 = 0.09999999999999964 em IEEE754), o
    // caso que a validação offline desta correção realmente pegou.
    file: PIPELINE,
    find: "const folgaSegundos = Math.round((geometriaDoVideo.durationSeconds - fala.durationSeconds) * 1000) / 1000;",
    replace: "const folgaSegundos = geometriaDoVideo.durationSeconds - fala.durationSeconds;",
    expect: "folga de sincronização: recusou no limiar exato (0,1s) — ruído de ponto flutuante decidindo a fronteira",
  },
  {
    guard: "/redo-video escalona a margem pelo contador de recusas consecutivas",
    name: "/redo-video para de escalonar — sempre manda margem extra zero",
    kind: "obvio",
    file: ROTAS_VIDEOS,
    find: "margemDuracaoWan3ExtraSegundos: video.sync_folga_recusas * ESCALADA_MARGEM_POR_RECUSA_SEGUNDOS,",
    replace: "margemDuracaoWan3ExtraSegundos: 0,",
    expect: "/redo-video não escalona mais a margem pelo contador de recusas",
  },
  {
    guard: "a margem extra chega ao duration pedido ao Wan na tomada única",
    name: "animarTomadaUnicaComAudioReal para de somar a margem extra ao duration pedido",
    kind: "esperto",
    file: PIPELINE,
    find: "Math.ceil((fala.durationSeconds ?? 0) + MARGEM_DURACAO_WAN3_SEGUNDOS + (input.margemDuracaoWan3ExtraSegundos ?? 0)),",
    replace: "Math.ceil((fala.durationSeconds ?? 0) + MARGEM_DURACAO_WAN3_SEGUNDOS),",
    expect: "a margem extra não mudou o duration pedido ao Wan",
  },
];

const FIXTURE_URI = "file://" + path.join(FIXTURES_DIR, "simulated-video-9x16.mp4");

function criarDiarioDeProva(): DiarioDoPipeline {
  return {
    async abrirEtapa() {
      return "step-de-prova";
    },
    async gravarRequestId() {},
    async gravarUrlsDaFila() {},
    async gravarRespostaCrua() {},
    async fecharEtapa() {},
    async registrarGastoPrevisto() {},
  };
}

function inputDeProva(margemExtra?: number): FalPipelineInput {
  return {
    apiKeyFal: "chave-da-prova",
    apiKeyElevenLabs: "chave-irrelevante",
    voiceId: "voice-da-prova",
    script: "Inovar não é criar o futuro, é mudar o agora. Rompa o tradicional, use a tecnologia a seu favor.",
    fotoBase: Buffer.alloc(0),
    fotoMimeType: "image/jpeg",
    promptDeComposicao: "traje e cenário da prova",
    tenantId: "tenant-da-prova",
    promptDeDirecao: "calm gesture, looking at the camera",
    diario: criarDiarioDeProva(),
    tier: "normal",
    esperar: async () => {},
    verificarAspectRatio: false,
    margemDuracaoWan3ExtraSegundos: margemExtra,
  };
}

/** Mesma técnica de `checkWan3TomadaUnicaPolicy.ts` — fetch substituído, ElevenLabs com duração ESCOLHIDA, Wan/sync devolvem a fixture local. */
async function comFalDeMentiraSubstituido<T>(
  falaSegundos: number,
  corpos: { endpoint: string; corpo: Record<string, unknown> }[],
  fn: () => Promise<T>,
): Promise<T> {
  const fetchOriginal = globalThis.fetch;
  const modoOriginal = process.env.PROVIDER_MODE;
  let contador = 0;
  try {
    process.env.PROVIDER_MODE = "live";
    globalThis.fetch = (async (entrada: unknown, init?: { body?: unknown }) => {
      const url = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
      if (url.startsWith("https://api.elevenlabs.io/")) {
        return new Response(
          JSON.stringify({
            audio_base64: Buffer.from("audio-de-mentira").toString("base64"),
            alignment: { character_end_times_seconds: [1.0, falaSegundos] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://rest.fal.ai/storage/upload/initiate")) {
        return new Response(
          JSON.stringify({ file_url: FIXTURE_URI, upload_url: "https://exemplo.fal.invalido/put/mentira.bin" }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/put/")) return new Response("", { status: 200, headers: { "content-type": "text/plain" } });
      if (url.endsWith("/status")) {
        return new Response(JSON.stringify({ status: "COMPLETED" }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/requests/")) {
        return new Response(JSON.stringify({ video: { url: FIXTURE_URI } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      const endpoint = url.replace("https://queue.fal.run/", "");
      const corpo = init?.body ? JSON.parse(String(init.body)) : {};
      corpos.push({ endpoint, corpo });
      const id = `req-teste-${contador++}`;
      return new Response(
        JSON.stringify({ request_id: id, status_url: `${url}/requests/${id}/status`, response_url: `${url}/requests/${id}` }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    return await fn();
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }
}

async function rodar(falaSegundos: number, margemExtra?: number): Promise<{ lancouFolga: boolean; corpos: { endpoint: string; corpo: Record<string, unknown> }[] }> {
  const corpos: { endpoint: string; corpo: Record<string, unknown> }[] = [];
  try {
    await comFalDeMentiraSubstituido(falaSegundos, corpos, () =>
      runFalPipelineDaImagem(inputDeProva(margemExtra), FIXTURE_URI),
    );
    return { lancouFolga: false, corpos };
  } catch (err) {
    if (err instanceof FolgaDeSincronizacaoInsuficienteError) return { lancouFolga: true, corpos };
    throw err;
  }
}

export interface SyncFolgaCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkSyncFolgaPolicy(): Promise<SyncFolgaCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1/G-2/G-3: execução real contra a fixture de 5,000s ---------------
  const insuficiente = await rodar(4.95); // folga real 0,05s
  if (!insuficiente.lancouFolga) {
    failures.push("folga de sincronização: recusou quando não deveria (folga suficiente) — deveria ter recusado com 0,05s de folga.");
  }

  const suficiente = await rodar(4.5); // folga real 0,5s
  if (suficiente.lancouFolga) {
    failures.push("folga de sincronização: não recusou quando deveria (folga insuficiente) — não deveria ter recusado com 0,5s de folga.");
  }

  const noLimiar = await rodar(4.9); // folga real MATEMATICAMENTE 0,1s (ruído de ponto flutuante no meio)
  if (noLimiar.lancouFolga) {
    failures.push("folga de sincronização: recusou no limiar exato (0,1s) — ruído de ponto flutuante decidindo a fronteira.");
  }

  if (
    insuficiente.lancouFolga &&
    !suficiente.lancouFolga &&
    !noLimiar.lancouFolga
  ) {
    notes.push("    folga de sincronização: recusa com 0,05s de folga, aceita com 0,5s e no limiar exato de 0,1s — fronteira >= confirmada");
  }

  // --- G-5: a margem extra chega ao duration pedido ao Wan ------------------
  const semMargem = await rodar(4.95, 0);
  const comMargem = await rodar(4.95, 2);
  const duracaoSem = semMargem.corpos.find((c) => c.endpoint.includes("wan-3.0"))?.corpo.duration;
  const duracaoCom = comMargem.corpos.find((c) => c.endpoint.includes("wan-3.0"))?.corpo.duration;
  if (typeof duracaoSem !== "number" || typeof duracaoCom !== "number" || duracaoCom <= duracaoSem) {
    failures.push(
      `a margem extra não mudou o duration pedido ao Wan — sem margem: ${JSON.stringify(duracaoSem)}, ` +
        `com margem extra de 2s: ${JSON.stringify(duracaoCom)}. O segundo tinha de ser maior.`,
    );
  } else {
    notes.push(`    folga de sincronização: margemDuracaoWan3ExtraSegundos chega ao duration pedido (${duracaoSem}s → ${duracaoCom}s com +2s de margem)`);
  }

  // --- G-4: /redo-video escalona pelo contador — por LEITURA -----------------
  const rotaFonte = readFileSync(path.join(process.env.REPO_ROOT ?? "/repo", ROTAS_VIDEOS), "utf8");
  const linhaEscalonamento = "margemDuracaoWan3ExtraSegundos: video.sync_folga_recusas * ESCALADA_MARGEM_POR_RECUSA_SEGUNDOS,";
  if (!rotaFonte.includes(linhaEscalonamento)) {
    failures.push("/redo-video não escalona mais a margem pelo contador de recusas consecutivas.");
  } else {
    notes.push("    folga de sincronização: /redo-video escalona a margem por video.sync_folga_recusas × ESCALADA_MARGEM_POR_RECUSA_SEGUNDOS");
  }

  return { failures, notes };
}
