/**
 * RETOMADA de vídeo fracionado sem regerar bloco pago — V30, item 7.
 *
 * Quatro invariantes, cada uma com mutante próprio:
 *
 *  G-1  o SEED desta corrida é lido do diário (persistido na abertura,
 *       `abrirCorrida`) e reutilizado em toda submissão — nunca sorteado de
 *       novo numa retomada. Testado por EXECUÇÃO: `fetch` substituído,
 *       `PROVIDER_MODE=live` (em fixture `falSubmit` nunca chega à rede, e
 *       o corpo submetido nunca existiria para inspecionar), diário de
 *       prova com `lerSeed()` fixo, e o `seed` capturado no corpo REAL
 *       submetido tem de bater com o valor do diário.
 *  G-2  cada bloco de animação grava o próprio ÍNDICE (0-based) no diário
 *       — não mais `ordem=2` sozinho, que é igual para todo bloco. Testado
 *       por EXECUÇÃO, em FIXTURE (sem custo de rede real: `falSubmit`
 *       ainda chama `onRequestId`/`abrirEtapa` na fixture, só não fala com
 *       a fal de verdade) — um roteiro de 3 blocos tem de abrir 3 etapas
 *       `animar` com `blocoIndice` 0, 1, 2, nesta ordem.
 *  G-3  `reacompanharFal` (routes/videos.ts) — a única coisa que a
 *       varredura de boot chama para vídeos fal — NUNCA referencia a
 *       retomada de blocos. Testado por LEITURA: a função é recortada por
 *       nome e o texto dela não pode conter `runFalPipelineRetomandoBlocos`
 *       em hipótese nenhuma. Retomar é SEMPRE clique humano, nunca boot.
 *  G-4  um bloco JÁ PAGO (presente em `blocosJaConcluidos`) nunca é
 *       reenviado numa retomada. Testado por EXECUÇÃO, em FIXTURE — com o
 *       bloco 0 marcado como concluído, `runFalPipelineRetomandoBlocos` só
 *       pode abrir etapas `animar` novas para os índices 1 e 2.
 *
 * Custo: ZERO. G-1 usa `fetch` substituído (nenhum byte sai para a
 * internet, mesmo em "live"); G-2/G-4 rodam em fixture puro.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import type { DiarioDoPipeline, FalPipelineInput } from "../services/video/falPipeline.js";
import { runFalPipelineDaImagem, runFalPipelineRetomandoBlocos } from "../services/video/falPipeline.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";
const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "o seed Wan desta corrida é lido do diário e reutilizado — nunca sorteado de novo numa retomada",
    name: "o seed volta a ser sorteado fresco a cada chamada, ignorando o diário",
    kind: "esperto",
    // ESPERTO: continua havendo UM seed por corrida, o mesmo em todo bloco
    // DESTA chamada — só que, entre uma chamada e OUTRA (a corrida
    // original e a retomada, duas invocações do processo), o valor deixa
    // de ser o mesmo. O caminho feliz de um vídeo de bloco único, numa
    // única chamada, continuaria indistinguível — é por isso que a prova é
    // por EXECUÇÃO comparando o valor CAPTURADO contra o do diário, não
    // por leitura de forma.
    file: PIPELINE,
    find: "  const seedDoVideo = (await input.diario.lerSeed?.()) ?? gerarSeedWan();",
    replace: "  const seedDoVideo = gerarSeedWan();",
    expect: "seed: o valor submetido à fal não bateu com o do diário",
  },
  {
    guard: "cada bloco de animação grava o próprio índice (0-based) no diário",
    name: "o índice do bloco deixa de ser passado a etapaNaFal",
    kind: "obvio",
    file: PIPELINE,
    find:
      "      planoDosBlocos[i].direcaoDoBloco,\n" +
      "      seedDoVideo,\n" +
      "      fotoDeIdentidadeUrl,\n" +
      "      i,\n" +
      "    );",
    replace:
      "      planoDosBlocos[i].direcaoDoBloco,\n" +
      "      seedDoVideo,\n" +
      "      fotoDeIdentidadeUrl,\n" +
      "      null,\n" +
      "    );",
    expect: "índice de bloco: as etapas animar não gravaram 0,1,2 —",
  },
  {
    guard: "reacompanharFal nunca referencia a retomada de blocos — retomar é sempre clique humano, nunca a varredura de boot",
    name: "reacompanharFal passa a referenciar runFalPipelineRetomandoBlocos",
    kind: "esperto",
    // ESPERTO: `reacompanharFal` continua só BUSCANDO o resultado do bloco
    // preso (nada nessa parte muda) — o que se insere é uma referência
    // MORTA (nunca chamada com argumentos reais) à função de retomada,
    // só para provar que a guarda pega a PRESENÇA do nome, não uma chamada
    // de verdade disparando algo. Se a guarda só pegasse uma CHAMADA real,
    // uma referência-mas-não-chamada (o primeiro passo de alguém ligando
    // isto por engano) passaria despercebida.
    file: ROTA_DE_VIDEOS,
    find: '  logEvent("info", "fal_recovery_resultado_recuperado", {',
    replace:
      "  void runFalPipelineRetomandoBlocos;\n" +
      '  logEvent("info", "fal_recovery_resultado_recuperado", {',
    expect: "reacompanharFal referencia runFalPipelineRetomandoBlocos",
  },
  {
    guard: "um bloco já pago (em blocosJaConcluidos) nunca é reenviado numa retomada",
    name: "a retomada volta a submeter todos os blocos, inclusive os já pagos",
    kind: "esperto",
    // ESPERTO: a lista final de vídeos concatenados continua na ORDEM
    // certa (o bloco 0 reaproveitado entra no lugar certo) — só que o
    // laço reenvia TODOS os blocos de qualquer forma, pagando de novo
    // pelos que já estavam prontos. Uma guarda que só olhasse a ORDEM do
    // resultado final não pegaria isto; é por isso que a prova conta
    // quantas etapas `animar` NOVAS foram abertas, não só o resultado.
    file: PIPELINE,
    find: "  for (let i = blocosJaConcluidos.length; i < blocos.length; i++) {",
    replace: "  for (let i = 0; i < blocos.length; i++) {",
    expect: "retomada: um bloco já concluído foi reenviado",
  },
];

export interface BlockResumeCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

interface ChamadaAbrirEtapa {
  etapa: string;
  ordem: number;
  vendor: string;
  endpointId: string | null;
  blocoIndice: number | null | undefined;
}

function criarDiarioDeProva(lerSeedFixo: number | null): {
  diario: DiarioDoPipeline;
  chamadas: ChamadaAbrirEtapa[];
} {
  const chamadas: ChamadaAbrirEtapa[] = [];
  const diario: DiarioDoPipeline = {
    async abrirEtapa(etapa, ordem, vendor, endpointId, blocoIndice) {
      chamadas.push({ etapa, ordem, vendor, endpointId, blocoIndice });
      return `step-${chamadas.length}`;
    },
    async gravarRequestId() {},
    async gravarUrlsDaFila() {},
    async gravarRespostaCrua() {},
    async fecharEtapa() {},
    async registrarGastoPrevisto() {},
  };
  if (lerSeedFixo !== null) {
    diario.lerSeed = async () => lerSeedFixo;
  }
  return { diario, chamadas };
}

const ROTEIRO_UM_BLOCO = "Bom dia, isto é um teste curto.";
const ROTEIRO_TRES_BLOCOS =
  "Inovar não é criar o futuro, é mudar o agora. Rompa o tradicional, use a tecnologia a seu favor e " +
  "lidere o mercado. Mude o seu negócio hoje mesmo!";

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
    // EM INGLÊS de propósito: o linter determinístico do prompt do Wan
    // (`lintarPromptDoBlocoWan`) reprova texto que pareça português não
    // traduzido, e esta função exercita a submissão de verdade.
    promptDeDirecao: "calm gesture, looking at the camera",
    diario,
    tier: "normal",
    pararApos: "animar",
    esperar: async () => {},
    verificarAspectRatio: false,
  };
}

/**
 * Substitui `fetch` por um fornecedor de mentira que aceita QUALQUER
 * submissão `animar`, sempre responde `COMPLETED` na primeira leitura de
 * status, e devolve um vídeo de mentira no resultado — capturando o CORPO
 * de cada submissão em `corposSubmetidos`.
 *
 * `PROVIDER_MODE=live` é necessário: em fixture, `falSubmit`/`falResult`
 * desviam antes da rede (ver `fixtureResultFor`, falClient.ts — que, à
 * parte, só reconhece a forma antiga do endpoint Wan,
 * `wan/v2.6/image-to-video/flash`, não a atual `reference-to-video/flash`
 * — GAP achado ao escrever esta guarda, fora do escopo do V30, reportado
 * à parte). Nenhum byte sai para a internet: cada chamada é respondida
 * aqui mesmo.
 */
async function comFalDeMentiraSubstituido<T>(
  corposSubmetidos: Record<string, unknown>[],
  fn: () => Promise<T>,
): Promise<T> {
  const fetchOriginal = globalThis.fetch;
  const modoOriginal = process.env.PROVIDER_MODE;
  let contador = 0;
  try {
    process.env.PROVIDER_MODE = "live";
    globalThis.fetch = (async (entrada: unknown, init?: { body?: unknown }) => {
      const url = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
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
      const corpo = init?.body ? JSON.parse(String(init.body)) : {};
      corposSubmetidos.push(corpo);
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

/** G-1 — o seed submetido à fal bate com o do diário, em execução real. */
async function testeSeedReutilizado(): Promise<string | null> {
  const SEED_DO_DIARIO = 918273645;
  const corpos: Record<string, unknown>[] = [];
  const { diario } = criarDiarioDeProva(SEED_DO_DIARIO);
  await comFalDeMentiraSubstituido(corpos, () =>
    runFalPipelineDaImagem(inputDeProva(diario, ROTEIRO_UM_BLOCO), "https://exemplo.fal.invalido/composta.png"),
  );

  if (corpos.length !== 1) {
    return `seed: esperava 1 submissão capturada, vieram ${corpos.length}`;
  }
  if (corpos[0].seed !== SEED_DO_DIARIO) {
    return (
      `seed: o valor submetido à fal não bateu com o do diário — diário=${SEED_DO_DIARIO}, ` +
      `submetido=${JSON.stringify(corpos[0].seed)}`
    );
  }
  return null;
}

/**
 * O que acontece DEPOIS de todos os blocos serem submetidos (concatenação,
 * item 8 de 29/08 — `assertAspectRatio`) usa `ffmpeg`/`ffprobe` de
 * verdade, fora do `fetch` — mesmo em "live" com `fetch` substituído, eles
 * tentam baixar as URLs de mentira pela rede REAL e falham. Isso é
 * ESPERADO e IRRELEVANTE para G-2/G-4: o que as duas medem (as chamadas
 * `abrirEtapa` de cada bloco) já aconteceu, de forma síncrona, ANTES da
 * concatenação começar — a asserção de índices logo abaixo detectaria de
 * qualquer forma uma falha REAL ocorrida antes disso (a lista viria
 * incompleta ou fora de ordem).
 */
async function ignorandoFalhaDeConcatReal(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch {
    // silenciado de propósito — ver o comentário acima.
  }
}

/** G-2 — as 3 etapas `animar` de um roteiro de 3 blocos gravam 0,1,2, em ordem. */
async function testeIndiceDeBloco(): Promise<string | null> {
  const { diario, chamadas } = criarDiarioDeProva(null);
  await comFalDeMentiraSubstituido([], () =>
    ignorandoFalhaDeConcatReal(() =>
      runFalPipelineDaImagem(inputDeProva(diario, ROTEIRO_TRES_BLOCOS), "https://exemplo.fal.invalido/composta.png"),
    ),
  );
  const indicesDosAnimar = chamadas.filter((c) => c.etapa === "animar").map((c) => c.blocoIndice);
  const esperado = [0, 1, 2];
  if (JSON.stringify(indicesDosAnimar) !== JSON.stringify(esperado)) {
    return (
      `índice de bloco: as etapas animar não gravaram 0,1,2 — vieram ${JSON.stringify(indicesDosAnimar)} ` +
      `(${chamadas.length} chamada(s) de abrirEtapa no total)`
    );
  }
  return null;
}

/** G-4 — bloco 0 marcado como já concluído nunca é reenviado numa retomada. */
async function testeBlocoNaoRegenerado(): Promise<string | null> {
  const { diario, chamadas } = criarDiarioDeProva(null);
  await comFalDeMentiraSubstituido([], () =>
    ignorandoFalhaDeConcatReal(() =>
      runFalPipelineRetomandoBlocos(
        inputDeProva(diario, ROTEIRO_TRES_BLOCOS),
        "https://exemplo.fal.invalido/composta.png",
        [{ videoUrl: "https://exemplo.fal.invalido/bloco-0-ja-pago.mp4", requestId: "req-bloco-0-ja-pago" }],
      ),
    ),
  );
  const indicesDosAnimar = chamadas.filter((c) => c.etapa === "animar").map((c) => c.blocoIndice);
  if (indicesDosAnimar.includes(0)) {
    return (
      "retomada: um bloco já concluído foi reenviado — o bloco 0 (já em blocosJaConcluidos) abriu uma " +
      `etapa \`animar\` NOVA. Índices que abriram etapa nova: ${JSON.stringify(indicesDosAnimar)}`
    );
  }
  const esperado = [1, 2];
  if (JSON.stringify(indicesDosAnimar) !== JSON.stringify(esperado)) {
    return (
      `retomada: esperava só os blocos 1 e 2 sendo submetidos de novo — vieram ${JSON.stringify(indicesDosAnimar)}`
    );
  }
  return null;
}

export async function checkBlockResumePolicy(): Promise<BlockResumeCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const erroSeed = await testeSeedReutilizado();
  if (erroSeed) failures.push(erroSeed);
  else notes.push("    seed: o valor lido do diário é o mesmo enviado à fal, medido no corpo real submetido");

  const erroIndice = await testeIndiceDeBloco();
  if (erroIndice) failures.push(erroIndice);
  else notes.push("    índice de bloco: um roteiro de 3 blocos abre 3 etapas `animar` com blocoIndice 0, 1, 2");

  const erroRegeneracao = await testeBlocoNaoRegenerado();
  if (erroRegeneracao) failures.push(erroRegeneracao);
  else
    notes.push(
      "    retomada: com o bloco 0 já concluído, só os blocos 1 e 2 abrem etapa `animar` nova — o 0 nunca é reenviado",
    );

  // --- LEITURA: reacompanharFal nunca referencia a retomada de blocos -----
  const rota = lerDaRaiz(ROTA_DE_VIDEOS);
  const inicio = rota.indexOf("export async function reacompanharFal(");
  const fim = rota.indexOf("function leBackground(", inicio);
  if (inicio < 0 || fim < 0) {
    failures.push(
      "reacompanharFal: não foi possível recortar a função pelas âncoras `export async function " +
        "reacompanharFal(` e `function leBackground(`. A guarda não pode opinar sobre um trecho que não " +
        "encontrou, e passar verde aqui seria o pior desfecho.",
    );
  } else {
    const trecho = rota.slice(inicio, fim);
    if (trecho.includes("runFalPipelineRetomandoBlocos")) {
      failures.push(
        "reacompanharFal referencia runFalPipelineRetomandoBlocos — a varredura de boot (a única chamadora " +
          "desta função) passaria a poder disparar uma retomada paga sozinha, sem clique humano nenhum. " +
          "Retomar tem de continuar sendo SEMPRE uma ação explícita, como /redo-video.",
      );
    } else {
      notes.push("    reacompanharFal: nunca referencia a retomada de blocos — retomar continua sendo só clique humano");
    }
  }

  return { failures, notes };
}
