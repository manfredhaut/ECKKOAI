/**
 * TOMADA ÚNICA do tier Normal — V33, itens 2, 3 e 4 (01/09/2026): migração
 * do motor de animação para `alibaba/wan-3.0/reference-to-video`.
 *
 * Três invariantes NOVAS desta rodada, cada uma com mutante próprio:
 *
 *  G-1  `duration` enviado ao Wan vem do ÁUDIO REAL medido
 *       (`Math.ceil(fala.durationSeconds) + MARGEM_DURACAO_WAN3_SEGUNDOS`),
 *       nunca de uma estimativa por caracteres — foi pedir segundos pela
 *       estimativa, sem saber quanto a fala de fato ocupa, que abriu o
 *       buraco de silêncio medido na sonda V32 (20s pedidos, ~12s de fala
 *       real). Testado por EXECUÇÃO: ElevenLabs simulado devolve uma
 *       duração CONHECIDA (6,4s) e o corpo real submetido ao Wan tem de
 *       pedir exatamente `ceil(6,4) + 1 = 8`.
 *  G-2  a cláusula de IDENTIDADE vem no COMEÇO do prompt do Wan, não no
 *       fim (invertido em relação ao Wan 2.6) — testado por EXECUÇÃO, no
 *       prompt real submetido.
 *  G-3  roteiros ATÉ `LIMITE_TAKE_UNICO_SEGUNDOS` (30s estimados) tomam o
 *       caminho de TOMADA ÚNICA (uma etapa `animar`, sem `blocoIndice`);
 *       roteiros ACIMA continuam fracionando (V30, sem mudar) — testado
 *       por EXECUÇÃO, contando quantas etapas `animar` cada um abre.
 *
 * Custo: ZERO. Mesmo padrão de `checkBlockResumePolicy.ts`: `fetch`
 * substituído, `PROVIDER_MODE=live` só para o corpo real chegar a existir
 * (em fixture, `falSubmit`/`falResult` desviam antes da rede).
 */
import type { Mutant } from "./mutants.js";
import type { DiarioDoPipeline, FalPipelineInput } from "../services/video/falPipeline.js";
import { runFalPipelineDaImagem } from "../services/video/falPipeline.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "tomada única: duration vem do áudio real medido, nunca de uma estimativa por caracteres",
    name: "duration volta a vir da duração ESCOLHIDA por caracteres, ignorando o áudio real",
    kind: "esperto",
    // ESPERTO: a corrida continua narrando antes de animar (a ORDEM não
    // muda) e `duration` continua sendo um número plausível — só que
    // calculado a partir da estimativa por caracteres (`escolherDuracao`),
    // não do áudio que acabou de ser medido. É exatamente o defeito que
    // abriu o buraco de silêncio na sonda V32: pedir mais segundos do que a
    // fala ocupa.
    file: PIPELINE,
    find: "  const duracaoWan3 = Math.max(1, Math.ceil(fala.durationSeconds ?? 0) + MARGEM_DURACAO_WAN3_SEGUNDOS);",
    replace: "  const duracaoWan3 = escolherDuracao(input.script.length) ?? 10;",
    expect: "tomada única: duration não veio do áudio real medido",
  },
  {
    guard: "tomada única: a cláusula de identidade vem no COMEÇO do prompt do Wan",
    name: "a cláusula de identidade volta para o FIM do prompt",
    kind: "esperto",
    // ESPERTO: a cláusula de identidade continua presente no prompt (um
    // `.includes()` sozinho continuaria verde) — só a POSIÇÃO muda. O Wan
    // 2.6 pré-V33 concatenava a cláusula de preservação de identidade no
    // FIM do prompt; o pedido desta rodada foi movê-la para o COMEÇO,
    // porque o texto no fim arrisca o modelo já ter "decidido" a cena antes
    // de ler a restrição.
    file: PIPELINE,
    find:
      "  const prompt = [\n" +
      "    clausulaDeReferencia,\n" +
      "    comDefaultsDeDirecao(direcaoDoBloco),",
    replace:
      "  const prompt = [\n" +
      "    comDefaultsDeDirecao(direcaoDoBloco),\n" +
      "    clausulaDeReferencia,",
    expect: "tomada única: a cláusula de identidade não está no começo do prompt",
  },
  {
    guard: "tomada única: só roteiros até LIMITE_TAKE_UNICO_SEGUNDOS pulam o fracionamento",
    name: "o limite de tomada única deixa de ser respeitado — tudo passa a fracionar",
    kind: "obvio",
    // Zera o limite: mesmo o roteiro mais curto passa a exceder o teto de
    // decisão e cai no caminho fracionado (V30) — o oposto do que esta
    // rodada pediu (abaixo de 30s, uma chamada só, sem blocos).
    file: PIPELINE,
    find: "export const LIMITE_TAKE_UNICO_SEGUNDOS = 30;",
    replace: "export const LIMITE_TAKE_UNICO_SEGUNDOS = 0;",
    // TRANSCRITO da mensagem real — não paráfrase (ver o gotcha já registrado
    // neste projeto: `expect` precisa ser substring literal do texto real).
    expect: "deveria abrir EXATAMENTE 1 etapa animar SEM índice de bloco",
  },
];

export interface Wan3TomadaUnicaCheckResult {
  failures: string[];
  notes: string[];
}

interface ChamadaAbrirEtapa {
  etapa: string;
  blocoIndice: number | null | undefined;
}

function criarDiarioDeProva(): { diario: DiarioDoPipeline; chamadas: ChamadaAbrirEtapa[] } {
  const chamadas: ChamadaAbrirEtapa[] = [];
  const diario: DiarioDoPipeline = {
    async abrirEtapa(etapa, _ordem, _vendor, _endpointId, blocoIndice) {
      chamadas.push({ etapa, blocoIndice });
      return `step-${chamadas.length}`;
    },
    async gravarRequestId() {},
    async gravarUrlsDaFila() {},
    async gravarRespostaCrua() {},
    async fecharEtapa() {},
    async registrarGastoPrevisto() {},
  };
  return { diario, chamadas };
}

function inputDeProva(diario: DiarioDoPipeline, script: string): FalPipelineInput {
  return {
    apiKeyFal: "chave-da-prova",
    apiKeyElevenLabs: "chave-irrelevante",
    voiceId: "voice-da-prova",
    script,
    fotoBase: Buffer.alloc(0),
    fotoMimeType: "image/jpeg",
    promptDeComposicao: "traje e cenário da prova",
    tenantId: "tenant-da-prova",
    // EM INGLÊS de propósito — mesmo motivo de `checkBlockResumePolicy.ts`:
    // o linter determinístico do prompt do Wan reprova português esquecido.
    promptDeDirecao: "calm gesture, looking at the camera",
    diario,
    tier: "normal",
    pararApos: "animar",
    esperar: async () => {},
    verificarAspectRatio: false,
  };
}

/**
 * `fetch` substituído — ElevenLabs SEMPRE sucede com uma duração CONHECIDA
 * (6,4s, via `alignment.character_end_times_seconds`), fal upload/queue
 * sempre aceitam. Captura o CORPO de cada submissão à fila, por endpoint.
 */
async function comFalDeMentiraSubstituido<T>(
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
            alignment: { character_end_times_seconds: [1.0, 6.4] },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://rest.fal.ai/storage/upload/initiate")) {
        return new Response(
          JSON.stringify({
            file_url: "https://exemplo.fal.invalido/upload-de-mentira.bin",
            upload_url: "https://exemplo.fal.invalido/put/upload-de-mentira.bin",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/put/")) {
        return new Response("", { status: 200, headers: { "content-type": "text/plain" } });
      }
      if (url.endsWith("/status")) {
        return new Response(JSON.stringify({ status: "COMPLETED" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/requests/")) {
        return new Response(
          JSON.stringify({ video: { url: `https://exemplo.fal.invalido/animado-${contador}.mp4` } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
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

async function ignorandoFalhaDeConcatReal(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    // O que sobra depois da(s) submissão(ões) de `animar` (concatenação,
    // checagem de proporção) usa `ffmpeg`/`ffprobe` de verdade, fora do
    // `fetch` — mesmo em "live" com `fetch` substituído, eles tentam baixar
    // as URLs de mentira pela rede real e falham. IRRELEVANTE para G-1/G-2/
    // G-3: o que elas medem (o corpo submetido a `animar`) já aconteceu,
    // síncrono, antes disso — mesmo padrão de `checkBlockResumePolicy.ts`.
  }
}

const ROTEIRO_CURTO = "Inovar não é criar o futuro, é mudar o agora. Rompa o tradicional, use a tecnologia a seu favor.";
const ROTEIRO_LONGO = (
  "Inovar não é criar o futuro, é mudar o agora. Rompa o tradicional, use a tecnologia a seu favor e " +
  "lidere o mercado. Mude o seu negócio hoje mesmo! "
).repeat(3).trim();

export async function checkWan3TomadaUnicaPolicy(): Promise<Wan3TomadaUnicaCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1 e G-2: uma corrida curta, o corpo real que chegou ao Wan --------
  //
  // Envolvida em `ignorandoFalhaDeConcatReal` mesmo no caminho normal (1
  // bloco só, nunca concatena): sob o mutante G-3 (`LIMITE_TAKE_UNICO_
  // SEGUNDOS` zerado), este MESMO roteiro passa a fracionar em 2 blocos e
  // tenta concatená-los com `ffmpeg` de verdade contra URLs de mentira —
  // sem a proteção, a exceção sobe e derruba `checkPolicy.ts` inteiro,
  // silenciando a mensagem de G-1/G-2 (MEDIDO: foi exatamente o que
  // aconteceu antes desta correção).
  const corpos: { endpoint: string; corpo: Record<string, unknown> }[] = [];
  const { diario } = criarDiarioDeProva();
  await ignorandoFalhaDeConcatReal(() =>
    comFalDeMentiraSubstituido(corpos, () =>
      runFalPipelineDaImagem(inputDeProva(diario, ROTEIRO_CURTO), "https://exemplo.fal.invalido/composta.png"),
    ),
  );
  const animar = corpos.find((c) => c.endpoint === "alibaba/wan-3.0/reference-to-video");

  if (!animar) {
    failures.push(
      "tomada única: nenhuma submissão ao motor de animação saiu para um roteiro curto — endpoints " +
        `observados: ${corpos.map((c) => c.endpoint).join(", ") || "(nenhum)"}.`,
    );
  } else {
    // G-1 — duration = ceil(6.4) + 1 = 8, nunca a estimativa por caracteres
    // (que para este roteiro de 100 caracteres escolheria 10s, o teto do
    // bloco — um número DIFERENTE, o que garante que o teste discrimina).
    if (animar.corpo.duration !== 8) {
      failures.push(
        `tomada única: duration não veio do áudio real medido — esperava 8 (ceil(6,4s) + margem de 1s) ` +
          `e saiu ${JSON.stringify(animar.corpo.duration)}.`,
      );
    } else {
      notes.push("    tomada única: duration = ceil(áudio real) + margem, medido no corpo real submetido (8 = ceil(6,4) + 1)");
    }

    // G-2 — a cláusula de identidade ("Reference1 shows the person" / "keep
    // the exact identity") aparece ANTES da direção da pessoa
    // ("calm gesture, looking at the camera").
    const prompt = String(animar.corpo.prompt ?? "");
    const posIdentidade = prompt.indexOf("keep the exact identity");
    const posDirecao = prompt.indexOf("calm gesture, looking at the camera");
    if (posIdentidade < 0 || posDirecao < 0) {
      failures.push(
        `tomada única: não achei os dois marcadores no prompt para comparar a ordem — identidade em ` +
          `${posIdentidade}, direção em ${posDirecao}. Prompt: ${JSON.stringify(prompt)}.`,
      );
    } else if (posIdentidade > posDirecao) {
      failures.push(
        "tomada única: a cláusula de identidade não está no começo do prompt — apareceu DEPOIS da " +
          `direção da pessoa (identidade na posição ${posIdentidade}, direção na ${posDirecao}). Prompt: ` +
          `${JSON.stringify(prompt)}.`,
      );
    } else {
      notes.push("    tomada única: a cláusula de identidade chega ANTES da direção da pessoa no prompt real submetido ao Wan");
    }
  }

  // --- G-3: curto = 1 etapa animar sem índice; longo = várias, com índice --
  const { diario: diarioCurto, chamadas: chamadasCurto } = criarDiarioDeProva();
  await ignorandoFalhaDeConcatReal(() =>
    comFalDeMentiraSubstituido([], () =>
      runFalPipelineDaImagem(inputDeProva(diarioCurto, ROTEIRO_CURTO), "https://exemplo.fal.invalido/composta.png"),
    ),
  );
  const animaresCurto = chamadasCurto.filter((c) => c.etapa === "animar");
  if (animaresCurto.length !== 1 || animaresCurto[0]?.blocoIndice != null) {
    failures.push(
      `tomada única: um roteiro curto (${ROTEIRO_CURTO.length} caracteres, abaixo de ` +
        `LIMITE_TAKE_UNICO_SEGUNDOS) deveria abrir EXATAMENTE 1 etapa animar SEM índice de bloco — abriu ` +
        `${JSON.stringify(animaresCurto)}.`,
    );
  }

  const { diario: diarioLongo, chamadas: chamadasLongo } = criarDiarioDeProva();
  await ignorandoFalhaDeConcatReal(() =>
    comFalDeMentiraSubstituido([], () =>
      runFalPipelineDaImagem(inputDeProva(diarioLongo, ROTEIRO_LONGO), "https://exemplo.fal.invalido/composta.png"),
    ),
  );
  const animaresLongo = chamadasLongo.filter((c) => c.etapa === "animar");
  if (animaresLongo.length <= 1) {
    failures.push(
      `tomada única: um roteiro longo (${ROTEIRO_LONGO.length} caracteres, acima de ` +
        `LIMITE_TAKE_UNICO_SEGUNDOS) deveria continuar fracionando em vários blocos — abriu só ` +
        `${animaresLongo.length} etapa(s) animar.`,
    );
  } else if (animaresLongo.some((c) => c.blocoIndice == null)) {
    failures.push(
      `tomada única: o roteiro longo fracionou, mas ao menos uma etapa animar não gravou índice de bloco ` +
        `— ${JSON.stringify(animaresLongo)}.`,
    );
  }

  if (failures.length === 0 && animar) {
    notes.push(
      `    tomada única: roteiro curto (${ROTEIRO_CURTO.length} car.) abre 1 etapa animar sem índice; ` +
        `roteiro longo (${ROTEIRO_LONGO.length} car.) fraciona em ${animaresLongo.length} etapas, cada uma ` +
        "com índice de bloco",
    );
  }

  return { failures, notes };
}
