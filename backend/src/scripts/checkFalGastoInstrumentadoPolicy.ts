/**
 * O GASTO DA CORRIDA FICA GRAVADO — migration 062, 23/08.
 *
 * ┌─ O buraco que esta instrumentação fecha, MEDIDO em 23/08 ────────────────┐
 * │ `autorizarGasto` freia por CORRIDA, e toda retomada começa com           │
 * │ `gastoAcumuladoUsd: 0` — decisão declarada em três lugares e correta no  │
 * │ escopo dela. O que ninguém media é o VÍDEO: 24 corridas para 7 vídeos    │
 * │ neste banco, uma linha com 4. Cada "Refazer" abre corrida nova com teto  │
 * │ zerado, sem limite de cliques, e `/redo-video` re-paga `animar` a cada   │
 * │ um (US$ 0,375 no Wan, ~US$ 6,93 no Seedance a 15 s).                     │
 * │                                                                          │
 * │ E não havia ONDE somar: o `gastoPrevistoUsd` vivia na memória da         │
 * │ invocação e num `logEvent`. Nenhum freio novo nasce aqui — instrumentar  │
 * │ primeiro, escolher o número depois, por decisão explícita do operador.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  as três etapas pagas gravam o gasto, e o que se grava é o ACUMULADO
 *       da corrida (não o custo da etapa) — o último gravado é exatamente o
 *       `gastoPrevistoUsd` que a corrida devolve.
 *  G-2  cada gravação acontece ANTES da submissão que ela paga. Gravar
 *       depois transformaria o registro num relatório do que já saiu — e
 *       perderia justamente a corrida que morre no meio, com etapa já aceita
 *       pelo fornecedor.
 *  G-3  a RETOMADA (`runFalPipelineDaImagem`) também instrumenta. É ela que
 *       serve o "Refazer", ou seja, exatamente as corridas que multiplicam o
 *       gasto de um vídeo — se elas ficassem em zero, a soma por vídeo
 *       contaria só a primeira.
 *  G-4  `abrirCorrida` lê o acumulado do vídeo ANTES de inserir a corrida
 *       nova, num ponto só — as quatro rotas que abrem corrida passam por
 *       ele.
 *  G-5  a coluna existe na migration e a implementação de produção a
 *       atualiza na CORRIDA (`fal_pipeline_runs`).
 *
 * ┌─ G-1, G-2 e G-3 medem por EXECUÇÃO ──────────────────────────────────────┐
 * │ Rodam o orquestrador REAL com `globalThis.fetch` substituído e um diário │
 * │ em memória que registra `gasto:` e `submeteu:` na MESMA lista — é a      │
 * │ intercalação dessa lista que dá a ordem de G-2. Nada aqui lê o texto do  │
 * │ arquivo.                                                                 │
 * │                                                                          │
 * │ Fornecedor simulado PRÓPRIO, e não o `instalarFetch` de                  │
 * │ `checkFalSceneWiringPolicy.ts`: aquele deixa o ElevenLabs falhar de      │
 * │ propósito, e a corrida morre em `narrar` — a terceira gravação, a de     │
 * │ `sincronizar`, nunca aconteceria. As duas simulações divergem porque     │
 * │ medem coisas diferentes, não por cópia esquecida.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ G-4 e G-5 medem FORMA, e o motivo é o banco ────────────────────────────┐
 * │ `abrirCorrida` e `criarDiarioNoBanco` falam com o Postgres direto (não   │
 * │ recebem `pool` por injeção), então exercitá-las exigiria banco de pé —   │
 * │ e uma guarda que precisa de infraestrutura se desliga sozinha no         │
 * │ primeiro dia difícil. Leem o arquivo real e conferem tokens dentro do    │
 * │ recorte certo, com falha nomeada quando a âncora não é encontrada.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Custo: ZERO ────────────────────────────────────────────────────────────┐
 * │ Nenhuma rede (o `fetch` é substituído), nenhum banco (o diário é um      │
 * │ array), nenhuma espera real.                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import {
  PRECOS_FAL,
  runFalPipeline,
  runFalPipelineDaImagem,
  type DiarioDoPipeline,
} from "../services/video/falPipeline.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";
const DIARIO = "backend/src/services/video/falPipelineJournal.ts";
const MIGRATION = "backend/src/db/migrations/062_fal_run_gasto_previsto.sql";

export const MUTANTS: Mutant[] = [
  {
    guard: "as três etapas pagas gravam o gasto acumulado da corrida",
    name: "a gravação do gasto some da etapa compor",
    kind: "obvio",
    file: PIPELINE,
    find:
      '  gastoPrevistoUsd = autorizarGasto(gastoPrevistoUsd, custoComporUsd, teto, "compor");\n' +
      "  await input.diario.registrarGastoPrevisto(gastoPrevistoUsd);\n",
    replace: '  gastoPrevistoUsd = autorizarGasto(gastoPrevistoUsd, custoComporUsd, teto, "compor");\n',
    expect: "gasto instrumentado: a corrida gravou 2 vez(es) o gasto, esperado 3",
  },
  {
    guard: "o que se grava é o ACUMULADO da corrida, não o custo da etapa",
    name: "a gravação de animar passa a mandar o custo da etapa",
    kind: "esperto",
    // ESPERTO: continua havendo três gravações, o `tsc` segue verde (os dois
    // são `number`), e o ÚLTIMO valor gravado continua batendo com o
    // `gastoPrevistoUsd` devolvido — porque `sincronizar` regrava o acumulado
    // correto logo depois. O que fica errado é a leitura intermediária: uma
    // corrida que morre entre `animar` e `sincronizar` deixa no banco o custo
    // de UMA etapa onde deveria estar a soma, e a pergunta "quanto este vídeo
    // já custou?" passa a responder menos do que saiu.
    // ÂNCORA — BLOCO FRACOES-1, 28/08: a linha de `autorizarGasto`+`registrarGastoPrevisto`
    // do "animar" foi EXTRAÍDA para `animarUmBloco()` (um bloco de código
    // exercitado tanto pelo caminho de UM bloco quanto pelo de VÁRIOS), com
    // `gastoPrevistoUsd` virando `const` (era reatribuição de `let`) a
    // partir do parâmetro `gastoAcumuladoUsd` — ver
    // `docs-internal/plano-fracoes-2026-08-28.md`.
    file: PIPELINE,
    find:
      '  const gastoPrevistoUsd = autorizarGasto(gastoAcumuladoUsd, custoAnimarUsd, teto, "animar");\n' +
      "  await input.diario.registrarGastoPrevisto(gastoPrevistoUsd);\n",
    replace:
      '  const gastoPrevistoUsd = autorizarGasto(gastoAcumuladoUsd, custoAnimarUsd, teto, "animar");\n' +
      "  await input.diario.registrarGastoPrevisto(custoAnimarUsd);\n",
    expect: "gasto instrumentado: a gravação de animar não é o acumulado",
  },
  {
    guard: "a gravação do gasto acontece ANTES da submissão que ela paga",
    name: "o gasto de animar passa a ser gravado depois da submissão",
    kind: "esperto",
    // ESPERTO: as três gravações continuam existindo, com os valores CERTOS —
    // só a ordem muda, e no caminho feliz o banco termina idêntico. A
    // diferença aparece só quando a submissão falha ou o processo morre no
    // meio: o dinheiro foi pedido ao fornecedor e o registro dele não existe.
    // É o mesmo raciocínio de ordem que `gravarRespostaCrua` já protege.
    // ÂNCORA — BLOCO FRACOES-1, 28/08, mesma extração de `animarUmBloco()`
    // do mutante irmão acima; `imagemUrl` (parâmetro da função antiga) virou
    // `imagemDeEntrada` (parâmetro de `animarUmBloco`) nesta rodada.
    file: PIPELINE,
    find:
      '  const gastoPrevistoUsd = autorizarGasto(gastoAcumuladoUsd, custoAnimarUsd, teto, "animar");\n' +
      "  await input.diario.registrarGastoPrevisto(gastoPrevistoUsd);\n" +
      "\n" +
      "  const corpoDeAnimar =\n" +
      "    tier === \"premium\"\n" +
      "      ? corpoAnimarSeedance(input, imagemDeEntrada, duracaoEscolhida)\n" +
      "      : corpoAnimarWan(input, imagemDeEntrada, duracaoEscolhida);\n" +
      "\n" +
      '  const animacao = await etapaNaFal(input, "animar", 2, enderecoAnimarParaTier(tier), corpoDeAnimar);\n',
    replace:
      "  const corpoDeAnimar =\n" +
      "    tier === \"premium\"\n" +
      "      ? corpoAnimarSeedance(input, imagemDeEntrada, duracaoEscolhida)\n" +
      "      : corpoAnimarWan(input, imagemDeEntrada, duracaoEscolhida);\n" +
      "\n" +
      '  const animacao = await etapaNaFal(input, "animar", 2, enderecoAnimarParaTier(tier), corpoDeAnimar);\n' +
      '  const gastoPrevistoUsd = autorizarGasto(gastoAcumuladoUsd, custoAnimarUsd, teto, "animar");\n' +
      "  await input.diario.registrarGastoPrevisto(gastoPrevistoUsd);\n",
    expect: "gasto instrumentado: uma submissão paga aconteceu ANTES da gravação do gasto dela",
  },
  {
    guard: "abrirCorrida lê o acumulado do vídeo antes de inserir a corrida nova",
    name: "abrirCorrida para de ler o acumulado do vídeo",
    kind: "obvio",
    file: DIARIO,
    find:
      "  if (input.videoId) {\n" +
      '    logEvent("info", "fal_gasto_acumulado_do_video", {\n' +
      "      videoId: input.videoId,\n" +
      "      tenantId: input.tenantId,\n" +
      "      gastoAcumuladoAnteriorUsd: Number((await gastoAcumuladoDoVideoUsd(input.videoId)).toFixed(4)),\n" +
      "    });\n" +
      "  }\n",
    replace: "",
    expect: "gasto instrumentado: abrirCorrida não lê o acumulado do vídeo",
  },
  {
    guard: "a coluna do gasto existe na migration e a produção a atualiza na corrida",
    name: "o UPDATE do gasto passa a escrever na etapa, não na corrida",
    kind: "esperto",
    // ESPERTO: `fal_pipeline_steps` também tem `id` e `updated_at`, então o
    // SQL continua plausível à leitura — e o `runId` que ele recebe nunca é
    // um step id, então o UPDATE casa ZERO linhas e falha em silêncio. O
    // banco fica com todas as corridas em zero e a soma por vídeo responde
    // "não custou nada" para um vídeo que custou.
    file: DIARIO,
    find: '        "UPDATE fal_pipeline_runs SET gasto_previsto_usd = $2, updated_at = now() WHERE id = $1",',
    replace: '        "UPDATE fal_pipeline_steps SET gasto_previsto_usd = $2, updated_at = now() WHERE id = $1",',
    expect: "gasto instrumentado: o UPDATE do gasto não escreve em fal_pipeline_runs",
  },
];

export interface FalGastoInstrumentadoCheckResult {
  failures: string[];
  notes: string[];
}

/**
 * Curto de propósito: 17 caracteres cabem na MENOR duração
 * (`PIPELINE_MAX_CHARS_POR_DURACAO`, 5 s), e é isso que torna o custo de
 * `animar` previsível sem repetir a tabela de durações aqui.
 */
const ROTEIRO_DA_PROVA = "Roteiro da prova.";
const DURACAO_ESPERADA = 5;

/** Um evento da corrida, na ordem em que aconteceu. Ver G-2. */
type Evento = { tipo: "gasto"; valor: number } | { tipo: "submeteu"; endpoint: string };

function diarioQueRegistraGasto(eventos: Evento[]): DiarioDoPipeline {
  let contador = 0;
  return {
    async abrirEtapa() {
      contador += 1;
      return `step-${contador}`;
    },
    async gravarRequestId() {},
    async gravarRespostaCrua() {},
    async fecharEtapa() {},
    async registrarGastoPrevisto(acumuladoUsd: number) {
      eventos.push({ tipo: "gasto", valor: acumuladoUsd });
    },
  };
}

/**
 * O fornecedor simulado desta guarda — fal + ElevenLabs, os DOIS respondendo
 * 200. Ver o cabeçalho para por que ele não é o de `checkFalSceneWiringPolicy`.
 */
async function comRedeSubstituida(
  eventos: Evento[],
  chamada: () => Promise<{ gastoPrevistoUsd: number; videoUrl: string }>,
): Promise<{ gastoPrevistoUsd: number; videoUrl: string; erro: string }> {
  const fetchOriginal = globalThis.fetch;

  globalThis.fetch = (async (entrada: unknown) => {
    const url = String(
      typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada,
    );
    if (url.includes("rest.fal.ai") || url.includes("fal.invalido")) {
      return new Response(
        JSON.stringify({
          file_url: "https://exemplo.fal.invalido/entrada.bin",
          upload_url: "https://exemplo.fal.invalido/put/entrada.bin",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("api.elevenlabs.io")) {
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from("audio-da-prova").toString("base64"),
          alignment: { character_end_times_seconds: [0.1, 4.87] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/requests/") && url.endsWith("/status")) {
      return new Response(JSON.stringify({ status: "COMPLETED" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/requests/")) {
      return new Response(
        JSON.stringify({
          images: [{ url: "https://exemplo.fal.invalido/imagem.png" }],
          video: { url: "https://exemplo.fal.invalido/video.mp4" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    const endpoint = url.replace("https://queue.fal.run/", "");
    eventos.push({ tipo: "submeteu", endpoint });
    return new Response(
      JSON.stringify({
        request_id: "req-da-prova",
        status_url: `https://queue.fal.run/${endpoint}/requests/req-da-prova/status`,
        response_url: `https://queue.fal.run/${endpoint}/requests/req-da-prova`,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const modoOriginal = process.env.PROVIDER_MODE;
  let erro = "";
  let gastoPrevistoUsd = 0;
  let videoUrl = "";
  try {
    // `live`: em fixture o `falClient` desvia antes da rede e nenhuma
    // submissão existiria para ordenar contra as gravações.
    process.env.PROVIDER_MODE = "live";
    const r = await chamada();
    gastoPrevistoUsd = r.gastoPrevistoUsd;
    videoUrl = r.videoUrl;
  } catch (err) {
    erro = String(err);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  return { gastoPrevistoUsd, videoUrl, erro };
}

const ENTRADA_COMUM = {
  apiKeyFal: "chave-irrelevante-fetch-substituido",
  apiKeyElevenLabs: "chave-irrelevante-fetch-substituido",
  voiceId: "0hQuq0q2JEk1SY4lZaM9",
  script: ROTEIRO_DA_PROVA,
  fotoBase: Buffer.from("foto-da-prova"),
  fotoMimeType: "image/jpeg",
  promptDeComposicao: "traje e cenário da prova",
  tenantId: "tenant-da-prova",
  promptDeDirecao: "direção da prova em inglês",
  tetoDeGastoUsd: 99,
  pollTimeoutMs: 50,
  pollIntervalMs: 1,
} as const;

/** Ponto flutuante: os valores saem de multiplicações, não de literais. */
const IGUAL = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export async function checkFalGastoInstrumentadoPolicy(): Promise<FalGastoInstrumentadoCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // -------------------------------------------------------------------------
  // G-1 e G-2 — a corrida INTEIRA
  // -------------------------------------------------------------------------
  const eventos: Evento[] = [];
  const corrida = await comRedeSubstituida(eventos, async () => {
    const r = await runFalPipeline({ ...ENTRADA_COMUM, diario: diarioQueRegistraGasto(eventos) });
    return { gastoPrevistoUsd: r.gastoPrevistoUsd, videoUrl: r.videoUrl };
  });

  const gastos = eventos.filter((e): e is { tipo: "gasto"; valor: number } => e.tipo === "gasto");
  const submissoes = eventos.filter((e): e is { tipo: "submeteu"; endpoint: string } => e.tipo === "submeteu");

  // CONTROLE, primeiro: sem a corrida ter completado, tudo abaixo seria
  // verdade por vacuidade — três gravações ausentes numa corrida que não
  // rodou não provam nada sobre instrumentação.
  if (corrida.videoUrl === "" || submissoes.length !== 3) {
    failures.push(
      `gasto instrumentado: o CONTROLE falhou — a corrida de prova não completou as três etapas pagas ` +
        `(submissões: ${JSON.stringify(submissoes.map((s) => s.endpoint))}, videoUrl ` +
        `${JSON.stringify(corrida.videoUrl)}, erro ${JSON.stringify(corrida.erro.slice(0, 160))}). ` +
        "Sem isso, qualquer afirmação sobre o gasto gravado seria verdade por vacuidade.",
    );
  } else {
    // --- G-1 ---------------------------------------------------------------
    if (gastos.length !== 3) {
      failures.push(
        `gasto instrumentado: a corrida gravou ${gastos.length} vez(es) o gasto, esperado 3 (uma por ` +
          "etapa paga: compor, animar, sincronizar). Uma etapa que não grava é uma etapa que some da " +
          "soma por vídeo — e é justamente a soma por vídeo que responde quanto um \"Refazer\" repetido " +
          "já custou.",
      );
    } else {
      const custoAnimarEsperado = PRECOS_FAL.animarUsdPorSegundo * DURACAO_ESPERADA;
      if (!IGUAL(gastos[0].valor, PRECOS_FAL.comporUsd)) {
        failures.push(
          `gasto instrumentado: a primeira gravação foi US$ ${gastos[0].valor}, esperado ` +
            `US$ ${PRECOS_FAL.comporUsd} (o custo de compor). A corrida começa em zero, então a primeira ` +
            "gravação é o custo da primeira etapa — se ela já vem diferente, o acumulado nasce torto.",
        );
      }
      if (!IGUAL(gastos[1].valor - gastos[0].valor, custoAnimarEsperado)) {
        failures.push(
          `gasto instrumentado: a gravação de animar não é o acumulado — de US$ ${gastos[0].valor} para ` +
            `US$ ${gastos[1].valor} é um salto de US$ ${(gastos[1].valor - gastos[0].valor).toFixed(4)}, e ` +
            `animar ${DURACAO_ESPERADA} s custa US$ ${custoAnimarEsperado.toFixed(4)}. Gravar o custo da ` +
            "ETAPA em vez da soma faz uma corrida interrompida no meio deixar no banco menos do que saiu.",
        );
      }
      if (!IGUAL(gastos[2].valor, corrida.gastoPrevistoUsd)) {
        failures.push(
          `gasto instrumentado: a última gravação (US$ ${gastos[2].valor}) não é o gasto que a corrida ` +
            `devolveu (US$ ${corrida.gastoPrevistoUsd}). O banco e o retorno da função têm de contar a ` +
            "mesma história sobre a mesma corrida; duas verdades sobre dinheiro é o que a guarda de " +
            "custo existe para impedir.",
        );
      }
    }

    // --- G-2 — a INTERCALAÇÃO ----------------------------------------------
    // gasto, submeteu, gasto, submeteu, gasto, submeteu. Qualquer submissão
    // paga que apareça antes da gravação do gasto dela quebra o padrão.
    const ordem = eventos.map((e) => (e.tipo === "gasto" ? "g" : "s")).join("");
    if (ordem !== "gsgsgs") {
      failures.push(
        `gasto instrumentado: uma submissão paga aconteceu ANTES da gravação do gasto dela — ordem ` +
          `observada \`${ordem}\`, esperada \`gsgsgs\` (g = gasto gravado, s = submissão à fila). ` +
          "Gravar depois transforma o registro num relatório do que já saiu: a corrida que morre entre a " +
          "submissão e a gravação deixa trabalho aceito pelo fornecedor sem nenhum número no banco.",
      );
    } else if (failures.length === 0) {
      notes.push(
        "    gasto instrumentado: as 3 etapas pagas gravam o acumulado da corrida, cada uma ANTES da " +
          "submissão que ela paga (ordem gsgsgs)",
      );
    }
  }

  // -------------------------------------------------------------------------
  // G-3 — a RETOMADA (o "Refazer") também instrumenta
  // -------------------------------------------------------------------------
  const eventosRetomada: Evento[] = [];
  const retomada = await comRedeSubstituida(eventosRetomada, async () => {
    const r = await runFalPipelineDaImagem(
      { ...ENTRADA_COMUM, diario: diarioQueRegistraGasto(eventosRetomada) },
      "https://exemplo.fal.invalido/imagem-composta-aprovada.png",
      "req-da-composicao",
    );
    return { gastoPrevistoUsd: r.gastoPrevistoUsd, videoUrl: r.videoUrl };
  });

  const gastosRetomada = eventosRetomada.filter((e) => e.tipo === "gasto");
  if (retomada.videoUrl === "") {
    failures.push(
      `gasto instrumentado: o CONTROLE de G-3 falhou — a retomada de prova não completou (erro ` +
        `${JSON.stringify(retomada.erro.slice(0, 160))}).`,
    );
  } else if (gastosRetomada.length !== 2) {
    failures.push(
      `gasto instrumentado: a retomada pós-aprovação gravou ${gastosRetomada.length} vez(es) o gasto, ` +
        "esperado 2 (animar e sincronizar — compor não é refeito). É a retomada que serve o \"Refazer\", " +
        "ou seja, exatamente as corridas que multiplicam o gasto de um vídeo: se elas ficam em zero, a " +
        "soma por vídeo conta só a primeira e o número mente para baixo.",
    );
  } else {
    notes.push(
      "    gasto instrumentado: a retomada pós-aprovação grava as 2 etapas pagas dela (animar, sincronizar)",
    );
  }

  // -------------------------------------------------------------------------
  // G-4 — abrirCorrida lê o acumulado ANTES do INSERT (FORMA)
  // -------------------------------------------------------------------------
  const diario = lerDaRaiz(DIARIO);
  const inicioAbrir = diario.indexOf("export async function abrirCorrida(");
  const fimAbrir = diario.indexOf("export async function fecharCorrida(");
  if (inicioAbrir < 0 || fimAbrir < 0 || fimAbrir < inicioAbrir) {
    failures.push(
      `gasto instrumentado: não foi possível recortar \`abrirCorrida\` em ${DIARIO} pelas âncoras ` +
        "`export async function abrirCorrida(` e `export async function fecharCorrida(`. A guarda não " +
        "pode opinar sobre um trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
    );
  } else {
    const corpo = diario.slice(inicioAbrir, fimAbrir);
    const posLeitura = corpo.indexOf("gastoAcumuladoDoVideoUsd(");
    const posInsert = corpo.indexOf("INSERT INTO fal_pipeline_runs");
    if (posLeitura < 0) {
      failures.push(
        "gasto instrumentado: abrirCorrida não lê o acumulado do vídeo — sem isso, a única forma de " +
          "saber quanto um vídeo já custou é consultar o banco à mão, e o número deixa de aparecer no " +
          "log de cada corrida nova. É este ponto único que cobre as quatro rotas que abrem corrida.",
      );
    } else if (posInsert < 0) {
      failures.push(
        "gasto instrumentado: não achei o `INSERT INTO fal_pipeline_runs` dentro de abrirCorrida — a " +
          "âncora de ordem de G-4 não existe mais.",
      );
    } else if (posLeitura > posInsert) {
      failures.push(
        "gasto instrumentado: abrirCorrida lê o acumulado DEPOIS de inserir a corrida nova — o número " +
          "passa a incluir esta corrida (em zero, porque nada foi autorizado ainda) e o log soma uma " +
          "parcela vazia. Mesmo total, leitura pior.",
      );
    } else {
      notes.push("    gasto instrumentado: abrirCorrida lê o acumulado do vídeo antes de inserir a corrida nova");
    }
  }

  // -------------------------------------------------------------------------
  // G-5 — a coluna e o UPDATE de produção (FORMA)
  // -------------------------------------------------------------------------
  let migration = "";
  try {
    migration = lerDaRaiz(MIGRATION);
  } catch {
    migration = "";
  }
  if (!migration.includes("gasto_previsto_usd")) {
    failures.push(
      `gasto instrumentado: ${MIGRATION} não cria a coluna \`gasto_previsto_usd\` — o UPDATE de produção ` +
        "passaria a falhar em toda corrida, e a instrumentação inteira vira código que só quebra.",
    );
  } else {
    notes.push("    gasto instrumentado: a migration 062 cria fal_pipeline_runs.gasto_previsto_usd");
  }

  if (!diario.includes("UPDATE fal_pipeline_runs SET gasto_previsto_usd")) {
    failures.push(
      "gasto instrumentado: o UPDATE do gasto não escreve em fal_pipeline_runs — é a CORRIDA que soma " +
        "por `video_id`. Escrever noutra tabela com o `runId` na mão casa zero linhas e falha em " +
        "silêncio: o banco fica todo em zero e a soma por vídeo responde \"não custou nada\".",
    );
  } else {
    notes.push("    gasto instrumentado: criarDiarioNoBanco atualiza o gasto na corrida (fal_pipeline_runs)");
  }

  return { failures, notes };
}
