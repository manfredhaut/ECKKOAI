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
 *       a fal de verdade) — um roteiro fracionado (`ROTEIRO_FRACIONADO`,
 *       acima de `LIMITE_TAKE_UNICO_SEGUNDOS` — V33, item 3) tem de abrir
 *       uma etapa `animar` por bloco, com `blocoIndice` 0, 1, 2, … nesta
 *       ordem.
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
// V33, item 3 (01/09/2026) — usado só para DERIVAR o número de blocos que o
// roteiro de prova produz, em vez de fixar `[0,1,2]` de cabeça. Ver o
// comentário de `ROTEIRO_FRACIONADO` logo abaixo.
import { fracionarRoteiro } from "../services/video/scriptFractioning.js";

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
    // ÂNCORA DESAMBIGUADA — V33, item 2 (01/09/2026): a mesma linha passou a
    // existir DUAS vezes (`animarTomadaUnicaComAudioReal`, novo caminho de
    // tomada única, e `animarNarrarSincronizar`, o de sempre). Este teste
    // (`ROTEIRO_UM_BLOCO`, curto) exercita a PRIMEIRA — a âncora leva o
    // comentário que só existe acima dela.
    file: PIPELINE,
    find:
      "  // padrão é o mesmo por uniformidade com o caminho fracionado).\n" +
      "  const seedDoVideo = (await input.diario.lerSeed?.()) ?? gerarSeedWan();",
    replace:
      "  // padrão é o mesmo por uniformidade com o caminho fracionado).\n" +
      "  const seedDoVideo = gerarSeedWan();",
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
    // V33, item 3 — a mensagem passou a citar os índices DINAMICAMENTE
    // (`JSON.stringify(esperado)`, hoje `[0,1,2,3,4,5,6]` para
    // `ROTEIRO_FRACIONADO`), não mais o literal "0,1,2" fixo. `expect`
    // precisa ser a parte ESTÁVEL da frase — a que não muda se o número de
    // blocos mudar de novo.
    expect: "índice de bloco: as etapas animar não gravaram",
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
/**
 * RENOMEADO/ALONGADO em 01/09/2026 (V33, item 3) — o antigo `ROTEIRO_TRES_
 * BLOCOS` (146 caracteres, ~13,4s estimados) fracionava sob o Wan 2.6
 * porque cada bloco tinha teto de 10s; sob a migração para Wan 3.0, roteiros
 * de até `LIMITE_TAKE_UNICO_SEGUNDOS` (30s) NUNCA fracionam mais — vão pela
 * tomada única (`animarTomadaUnicaComAudioReal`), que nunca abre etapa
 * `animar` com índice de bloco. Um roteiro de 146 caracteres não exercita
 * mais G-2/G-4 (índice de bloco, não-regeneração) — precisa passar de 30s
 * estimados (>~327 caracteres) para CONTINUAR caindo no fracionamento do
 * V30, que este arquivo testa. Este roteiro (3 cópias do texto original,
 * 440 caracteres, ~40,4s estimados) garante isso com folga. O NÚMERO de
 * blocos que ele produz não é mais hardcoded — `fracionarRoteiro` decide,
 * e os testes abaixo leem o resultado dela como base de comparação (ver
 * `blocosEsperados`).
 */
const ROTEIRO_FRACIONADO = (
  "Inovar não é criar o futuro, é mudar o agora. Rompa o tradicional, use a tecnologia a seu favor e " +
  "lidere o mercado. Mude o seu negócio hoje mesmo! "
).repeat(3).trim();
/** Quantos blocos `ROTEIRO_FRACIONADO` produz — a mesma função de produção decide, nunca um número de cabeça. */
const NUMERO_DE_BLOCOS_DO_ROTEIRO_FRACIONADO = fracionarRoteiro(ROTEIRO_FRACIONADO).length;

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
 * desviam antes da rede (ver `fixtureResultFor`, falClient.ts). Nenhum byte
 * sai para a internet: cada chamada é respondida aqui mesmo.
 *
 * V33, item 2 (01/09/2026) — GANHOU DUAS URLs novas de propósito.
 * `animarTomadaUnicaComAudioReal` (roteiro ≤`LIMITE_TAKE_UNICO_SEGUNDOS`)
 * narra ANTES de animar, então mesmo os testes de UM bloco (G-1) agora
 * disparam ElevenLabs + `falUpload` do áudio antes da submissão `animar`
 * de verdade. Sem tratar as duas, elas caíam no `else` genérico (queue
 * submit) e devolviam `{request_id,...}` onde `synthesizeSpeech`/
 * `falUpload` esperam `{audio_base64,...}`/`{file_url, upload_url}` — o
 * `FalProviderError: a resposta não trouxe "file_url"` que motivou este
 * comentário. As duas são respondidas ANTES do `else`, e nenhuma delas
 * entra em `corposSubmetidos` — só a submissão `animar` de verdade conta
 * para G-1 (`corpos.length === 1`).
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
    globalThis.fetch = (async (entrada: unknown, init?: { body?: unknown; method?: string }) => {
      const url = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
      // ElevenLabs — narrar() chama isto ANTES de animar no caminho de
      // tomada única. `audio_base64` de mentira (1 byte) + um `alignment`
      // com um único fim de caractere: o suficiente para `synthesizeSpeech`
      // devolver `durationSeconds` numérico, sem inventar precisão nenhuma.
      if (url.startsWith("https://api.elevenlabs.io/")) {
        return new Response(
          JSON.stringify({ audio_base64: Buffer.from("x").toString("base64"), alignment: { character_end_times_seconds: [1.23] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      // Upload à fal — TAMBÉM disparado por narrar() (sobe o áudio) e, no
      // caminho de UM bloco só, nunca antes desta rodada.
      if (url.startsWith("https://rest.fal.ai/storage/upload/initiate")) {
        return new Response(
          JSON.stringify({ file_url: "https://exemplo.fal.invalido/audio-de-mentira.mp3", upload_url: "https://exemplo.fal.invalido/put/audio-de-mentira" }),
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

/** G-2 — as etapas `animar` de um roteiro fracionado gravam 0,1,2,…, em ordem. */
async function testeIndiceDeBloco(): Promise<string | null> {
  const { diario, chamadas } = criarDiarioDeProva(null);
  await comFalDeMentiraSubstituido([], () =>
    ignorandoFalhaDeConcatReal(() =>
      runFalPipelineDaImagem(inputDeProva(diario, ROTEIRO_FRACIONADO), "https://exemplo.fal.invalido/composta.png"),
    ),
  );
  const indicesDosAnimar = chamadas.filter((c) => c.etapa === "animar").map((c) => c.blocoIndice);
  const esperado = Array.from({ length: NUMERO_DE_BLOCOS_DO_ROTEIRO_FRACIONADO }, (_, i) => i);
  if (JSON.stringify(indicesDosAnimar) !== JSON.stringify(esperado)) {
    return (
      `índice de bloco: as etapas animar não gravaram ${JSON.stringify(esperado)} — vieram ` +
      `${JSON.stringify(indicesDosAnimar)} (${chamadas.length} chamada(s) de abrirEtapa no total)`
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
        inputDeProva(diario, ROTEIRO_FRACIONADO),
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
  const esperado = Array.from({ length: NUMERO_DE_BLOCOS_DO_ROTEIRO_FRACIONADO }, (_, i) => i).slice(1);
  if (JSON.stringify(indicesDosAnimar) !== JSON.stringify(esperado)) {
    return (
      `retomada: esperava só os blocos ${JSON.stringify(esperado)} sendo submetidos de novo — vieram ` +
      JSON.stringify(indicesDosAnimar)
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
  else
    notes.push(
      `    índice de bloco: um roteiro fracionado em ${NUMERO_DE_BLOCOS_DO_ROTEIRO_FRACIONADO} blocos abre uma etapa ` +
        "\`animar\` por bloco, com blocoIndice 0, 1, 2, … em ordem",
    );

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
