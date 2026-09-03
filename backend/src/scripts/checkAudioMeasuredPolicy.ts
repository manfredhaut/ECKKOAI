/**
 * G1+G3, BLOCO HEYGEN-SIMPLES-3 (03/09/2026) — a duração MEDIDA, de verdade.
 *
 * ┌─ O que G1 corrige ────────────────────────────────────────────────────────┐
 * │ `requireAudio` chamava `synthesizeSpeech` (ElevenLabs) e devolvia o        │
 * │ AUTORRELATO do fornecedor (`synthesized.durationSeconds`, dos timestamps   │
 * │ que ELE reportou) como a duração "medida" — mas esse número foi medido    │
 * │ ANTES de `processVoiceAudio` (loudnorm por ffmpeg) transformar o áudio.    │
 * │ O `buffer` que de fato sobe como `audio_asset_id` é o TRATADO, e nada     │
 * │ media a duração DELE. Desde SIMPLES-3, `probeSampleDurationSeconds`       │
 * │ (ffprobe) mede os BYTES FINAIS — os mesmos que a chamada paga recebe —,   │
 * │ e essa medição VENCE o autorrelato quando bem-sucedida.                   │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A prova é por EXECUÇÃO REAL de ffprobe contra um WAV construído em memória
 * (mesma técnica de `checkCloneSampleFormatPolicy.ts` — nenhum arquivo de
 * fixture externo, nenhuma dependência de disco fora do que o próprio teste
 * cria e apaga):
 *
 *  1. O autorrelato ElevenLabs (`alignment`) MENTE (diz 999 s); o áudio REAL
 *     tem ~2 s. A duração que sai de `requireAudio` precisa ser a REAL — se
 *     fosse o autorrelato vencendo, o teto de `MAX_SCRIPT_SECONDS` (600 s)
 *     nunca dispararia para um autorrelato mentiroso menor, e um autorrelato
 *     mentiroso MAIOR (o caso real, "a mesma contagem já produziu 10,19 s e
 *     11,12 s") continuaria enganando a régua.
 *  2. Áudio CORROMPIDO (ffprobe falha) cai no FALLBACK — o autorrelato, não
 *     `null`/erro. Sem este contraponto, "sempre usar ffprobe" e "nunca usar
 *     o autorrelato, mesmo como rede de segurança" ficariam indistinguíveis.
 *
 * G3 — o campo `audioMeasured` de `GET /videos/:id/cost` é o que a tela lê
 * para mostrar o "medido" ANTES de o vídeo terminar (`VideoCostPanel.tsx`).
 * Verificado por LEITURA do trecho exato da rota (mesmo padrão de
 * `checkPreflightSummaryPolicy.ts`/`checkHeygenVoiceCloneWiringPolicy.ts`):
 * o campo já é testado por EXECUÇÃO indiretamente pela sua fonte
 * (`videos.audio_duration_seconds`/`_source`, gravados pelo caminho que os
 * dois mutantes acima protegem) — o que falta garantir aqui é só que a
 * ROTA continua LENDO essa fonte, e convertendo `numeric` (string do
 * node-postgres) para `number` antes de expor à tela.
 *
 * ┌─ Custo: ZERO ────────────────────────────────────────────────────────────┐
 * │ `fetch` substituído nos dois vendors; nenhuma rede real. O teto de sessão  │
 * │ live é zerado na entrada e na saída; `uploads/<tenant>/` da prova é       │
 * │ apagado no `finally`.                                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { rm } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { config } from "../config.js";
import { resolveVideoFormat } from "../services/providers/videoFormat.js";
import { resetLiveGenerationCount } from "../services/providers/liveGuard.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "áudio medido: ffprobe sobre o arquivo FINAL vence o autorrelato do ElevenLabs",
    name: "requireAudio volta a devolver o autorrelato, sem medir o arquivo final",
    kind: "esperto",
    // ESPERTO: `probeSampleDurationSeconds` continua sendo chamado — só o
    // RESULTADO deixa de ser usado. `medida` vira uma variável morta, e a
    // duração devolvida volta a ser a de ANTES do tratamento de áudio —
    // exatamente o defeito que G1 fecha, só que sem apagar a chamada (o que
    // um `void medida` já cobriria de forma óbvia demais para passar
    // despercebido; isto é mais sutil: o `??` perde o lado esquerdo).
    //
    // O autorrelato MENTIROSO da prova (999s) é > MAX_SCRIPT_SECONDS (600s)
    // de propósito: com este mutante aplicado, a duração devolvida É o
    // autorrelato, e 999s dispara o PORTÃO existente (`AudioTooLongError`,
    // ver checkAudioDurationGatePolicy.ts) antes mesmo de a corrida
    // terminar — a prova reprova por aí, não por comparar os dois números.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "    durationSeconds: medida ?? synthesized.durationSeconds,",
    replace: "    durationSeconds: synthesized.durationSeconds,",
    expect: "a corrida com áudio válido levantou",
  },
  {
    guard: "áudio medido: sem ffprobe (arquivo corrompido), cai no autorrelato — nunca null/erro",
    name: "o fallback para o autorrelato desaparece",
    kind: "esperto",
    // ESPERTO: a medição por ffprobe continua vencendo quando disponível —
    // só o FALLBACK some. Um áudio que o ffprobe não consegue ler (binário
    // ausente, buffer corrompido) passaria a devolver `durationSeconds:
    // null` mesmo quando o ElevenLabs tinha um número plausível — pior do
    // que o comportamento de antes desta rodada inteira.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "    durationSeconds: medida ?? synthesized.durationSeconds,",
    replace: "    durationSeconds: medida,",
    expect: "esperado 3.5 (o autorrelato",
  },
  {
    guard: "custo: GET /videos/:id/cost expõe audioMeasured a partir de audio_duration_seconds/_source",
    name: "audioMeasured para de ler a coluna persistida",
    kind: "esperto",
    // ESPERTO: o campo `audioMeasured` continua existindo no objeto de
    // resposta — só o VALOR passa a ser sempre `null`, mesmo com a coluna
    // preenchida. A tela voltaria a mostrar "nenhum ainda" durante todo o
    // processamento — a mesma janela muda que G3 existe para fechar.
    file: "backend/src/routes/videos.ts",
    find:
      "      audioMeasured:\n" +
      "        video.audio_duration_seconds != null\n" +
      "          ? { seconds: Number(video.audio_duration_seconds), source: video.audio_duration_source }\n" +
      "          : null,",
    replace: "      audioMeasured: null,",
    expect: "não expõe mais `audioMeasured` condicionado a",
  },
];

export interface AudioMeasuredCheckResult {
  failures: string[];
  notes: string[];
}

const TENANT_DA_PROVA = "00000000-0000-4000-8000-0000000a3d10";

/** WAV PCM 16 bit mono, silêncio — só a DURAÇÃO importa aqui, não o conteúdo. */
function wavSilencio(sampleRate: number, seconds: number): Buffer {
  const amostras = Math.floor(sampleRate * seconds);
  const dados = Buffer.alloc(amostras * 2);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dados.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dados.length, 40);
  return Buffer.concat([header, dados]);
}

/**
 * Roda `requireAudio` de verdade (via `generateVideo`), com `fetch`
 * substituído — a ElevenLabs devolve o `audioBase64`/`alignment` dados, e o
 * `fetch` do HeyGen só confirma que a chamada paga chegou ao fim.
 */
async function correr(audioBase64: string, autorrelatoSegundos: number): Promise<{ segundos: number | null; erro: unknown }> {
  const { generateVideo } = await import("../services/providers/avatarProvider.js");
  let segundos: number | null = null;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown) => {
    const url = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
    if (url.includes("api.elevenlabs.io") && url.includes("/with-timestamps")) {
      return new Response(
        JSON.stringify({
          audio_base64: audioBase64,
          alignment: { character_end_times_seconds: [0.1, autorrelatoSegundos] },
        }),
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
      return new Response(JSON.stringify({ data: { video_id: "job-da-prova" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`fetch inesperado na prova de áudio medido: ${url}`);
  }) as typeof fetch;

  let erro: unknown = null;
  try {
    await generateVideo({
      apiKey: "chave-irrelevante-fetch-substituido",
      vendor: "heygen",
      providerAvatarId: "avatar-da-prova",
      script: "Roteiro da prova de áudio medido.",
      elevenLabsApiKey: "chave-irrelevante-fetch-substituido",
      voiceId: "voz-da-prova",
      tenantId: TENANT_DA_PROVA,
      // DESLIGADO: `processVoiceAudio` devolve o buffer INTOCADO quando
      // desligado — é isso que garante que os bytes que o ffprobe mede aqui
      // são EXATAMENTE os que a ElevenLabs "devolveu" (o WAV construído em
      // memória), não um MP3 recodificado que mudaria a prova de lugar.
      audioTreatmentEnabled: false,
      audioTreatmentTargetLufs: -16,
      format: resolveVideoFormat("youtube"),
      supportedEngines: null,
      engineEnabled: false,
      scene: null,
      engineChoice: null,
      captions: false,
      onAudioMeasured: async ({ seconds }) => {
        segundos = seconds;
      },
    });
  } catch (err) {
    erro = err;
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  return { segundos, erro };
}

export async function checkAudioMeasuredPolicy(): Promise<AudioMeasuredCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const modoOriginal = process.env.PROVIDER_MODE;
  const tetoOriginal = process.env.PROVIDER_LIVE_MAX_GENERATIONS;

  const SEGUNDOS_REAIS = 2.0;
  const AUTORRELATO_MENTIROSO = 999;
  const wav = wavSilencio(16000, SEGUNDOS_REAIS);
  const wavBase64 = wav.toString("base64");

  let comAudioValido: { segundos: number | null; erro: unknown };
  let comAudioCorrompido: { segundos: number | null; erro: unknown };
  try {
    process.env.PROVIDER_MODE = "live";
    process.env.PROVIDER_LIVE_MAX_GENERATIONS = "8";
    resetLiveGenerationCount();

    comAudioValido = await correr(wavBase64, AUTORRELATO_MENTIROSO);
    resetLiveGenerationCount();
    // Bytes que NÃO são áudio nenhum — ffprobe recusa, o fallback tem de
    // segurar. Autorrelato PLAUSÍVEL aqui (3.5s), diferente do mentiroso
    // acima, para não confundir "o fallback funciona" com "o número certo é
    // sempre 999 por coincidência".
    comAudioCorrompido = await correr(Buffer.from("isto não é áudio nenhum").toString("base64"), 3.5);
  } finally {
    resetLiveGenerationCount();
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
    if (tetoOriginal === undefined) delete process.env.PROVIDER_LIVE_MAX_GENERATIONS;
    else process.env.PROVIDER_LIVE_MAX_GENERATIONS = tetoOriginal;
    await rm(path.join(config.uploadsDir, TENANT_DA_PROVA), { recursive: true, force: true }).catch(() => {});
  }

  // ---------------------------------------------------------------------------
  // 1. Áudio REAL, autorrelato MENTIROSO: ffprobe vence.
  // ---------------------------------------------------------------------------
  if (comAudioValido.erro !== null) {
    failures.push(
      `áudio medido: a corrida com áudio válido levantou ${JSON.stringify(String(comAudioValido.erro).slice(0, 160))}.`,
    );
  } else if (comAudioValido.segundos === null) {
    failures.push("áudio medido: nenhuma duração foi gravada na corrida com áudio válido.");
  } else if (Math.abs(comAudioValido.segundos - SEGUNDOS_REAIS) > 0.15) {
    failures.push(
      `áudio medido: a duração gravada foi ${comAudioValido.segundos}s — esperado ~${SEGUNDOS_REAIS}s (o ` +
        `arquivo REAL), não ${AUTORRELATO_MENTIROSO}s (o autorrelato mentiroso do ElevenLabs). O ffprobe ` +
        "sobre o arquivo final precisa vencer o que o fornecedor DIZ que sintetizou.",
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Áudio CORROMPIDO: cai no autorrelato (fallback), nunca null.
  // ---------------------------------------------------------------------------
  if (comAudioCorrompido.erro !== null) {
    failures.push(
      `áudio medido: a corrida com áudio corrompido levantou ${JSON.stringify(String(comAudioCorrompido.erro).slice(0, 160))} ` +
        "— esperado sucesso, com fallback para o autorrelato.",
    );
  } else if (comAudioCorrompido.segundos !== 3.5) {
    failures.push(
      `áudio medido: com áudio corrompido (ffprobe não consegue medir), a duração gravada foi ` +
        `${JSON.stringify(comAudioCorrompido.segundos)}, esperado 3.5 (o autorrelato, único número disponível). ` +
        "Perder a rede de segurança faria toda geração com áudio ilegível por ffprobe ficar sem duração " +
        "nenhuma, mesmo com um número plausível à mão.",
    );
  }

  // ---------------------------------------------------------------------------
  // 3. GET /videos/:id/cost expõe `audioMeasured` a partir das mesmas colunas.
  // ---------------------------------------------------------------------------
  const { readFile } = await import("node:fs/promises");
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  let rota: string;
  try {
    rota = await readFile(path.join(repoRoot, "backend/src/routes/videos.ts"), "utf-8");
  } catch {
    rota = "";
    failures.push("custo: não consegui ler routes/videos.ts para conferir audioMeasured.");
  }
  if (rota && !/audioMeasured:\s*\n\s*video\.audio_duration_seconds\s*!=\s*null/.test(rota)) {
    failures.push(
      "custo: GET /videos/:id/cost não expõe mais `audioMeasured` condicionado a " +
        "`video.audio_duration_seconds != null` — a tela voltaria a não ter de onde ler o \"medido\" " +
        "intermediário enquanto o vídeo ainda está processando.",
    );
  }
  if (rota && !/seconds:\s*Number\(video\.audio_duration_seconds\)/.test(rota)) {
    failures.push(
      "custo: `audioMeasured.seconds` não converte `video.audio_duration_seconds` com `Number(...)` — a " +
        "coluna é `numeric` (node-postgres devolve string), e sem a conversão a tela receberia uma string " +
        "onde espera um número.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      `  áudio medido: com áudio real de ${SEGUNDOS_REAIS}s e autorrelato de ${AUTORRELATO_MENTIROSO}s, a ` +
        "duração gravada é a MEDIDA por ffprobe, não o autorrelato",
    );
    notes.push("  áudio medido: com áudio ilegível por ffprobe, cai no autorrelato (3.5s), nunca null");
    notes.push("  custo: audioMeasured em GET /videos/:id/cost lê audio_duration_seconds/_source, convertido a number");
  }

  return { failures, notes };
}
