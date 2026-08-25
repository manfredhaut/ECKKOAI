/**
 * O TETO DE REFAÇÕES E O ESTORNO QUE NÃO EXISTE — W3, 24/08/2026.
 *
 * ┌─ Dois freios, o mesmo dinheiro ──────────────────────────────────────────┐
 * │ 1. REFAÇÃO tem limite (3 por vídeo). Cada clique em "Refazer" paga o     │
 * │    fornecedor de novo — US$ 0,08 na imagem, US$ 0,375 no vídeo do Wan,   │
 * │    US$ 2,31 no do Seedance — e até 24/08 não havia limite nenhum.        │
 * │    MEDIDO: o histórico inteiro tem no MÁXIMO 1 refação num vídeo, então  │
 * │    o teto de 3 não barra nada que já aconteceu.                          │
 * │                                                                          │
 * │ 2. FALHA PARCIAL não estorna, e isso precisa ficar VISÍVEL. Quando       │
 * │    `sincronizar` falha com `compor` e `animar` já pagos, o dinheiro      │
 * │    saiu: `decidirEstorno` trata gasto já aceito como `indeterminado`, e  │
 * │    `debitCredit` cobra por VÍDEO e não por etapa. Uma mensagem que       │
 * │    dissesse só "falhou" ensinaria a clicar de novo — que paga tudo de    │
 * │    novo.                                                                 │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  a 4ª refação é RECUSADA, e antes de abrir corrida.
 *  G-2  as duas rotas de "Refazer" dividem o MESMO contador — dois
 *       contadores separados dariam 3+3 e, no Premium, quase US$ 7 só de
 *       animação repetida.
 *  G-3  os 5 call sites de `abrirCorrida` declaram a origem. Um sem origem
 *       não conta como refação, e o limite passa a ter um furo silencioso.
 *  G-4  a recusa por teto de gasto DIZ que as etapas anteriores já foram
 *       pagas e que o trabalho é recuperável — nunca um "falhou" seco.
 *  G-5  a TELA desabilita os dois botões de Refazer assim que a 3ª refação é
 *       REGISTRADA — sem esperar o clique da 4ª. E a leitura entrega a
 *       contagem, senão a tela não teria como saber antes de tentar.
 *
 * G-1 e G-2 medem por EXECUÇÃO (contagem real com `pool.query` substituído);
 * G-3 e G-4 medem FORMA — o primeiro porque os call sites vivem em handlers
 * do Fastify, o segundo porque a mensagem é o produto.
 *
 * Custo: ZERO.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import {
  MAX_REFACOES_POR_VIDEO,
  ORIGENS_DE_REFACAO,
  contarRefacoes,
} from "../services/video/falPipelineJournal.js";

const ROTA = "backend/src/routes/videos.ts";
const TELA = "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx";
const LOCALES = ["frontend/src/locales/pt-BR.json", "frontend/src/locales/en.json"];
const DIARIO = "backend/src/services/video/falPipelineJournal.ts";
const PIPELINE = "backend/src/services/video/falPipeline.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "a 4a refação é recusada",
    name: "o limite de refações some do Refazer da imagem",
    kind: "obvio",
    file: ROTA,
    find:
      "      const { video, avatar, apiKeyFal, apiKeyElevenLabs } = carga;\n" +
      "      if (await refacoesEsgotadas(video.id, reply)) return reply;\n" +
      "      // SÓ CAPTURA E PERSISTE — ver o comentário da migration 061.",
    replace:
      "      const { video, avatar, apiKeyFal, apiKeyElevenLabs } = carga;\n" +
      "      // SÓ CAPTURA E PERSISTE — ver o comentário da migration 061.",
    // TRANSCRITO: quem dispara é a checagem de CONTAGEM (uma das duas rotas
    // deixou de conferir), não a de ausência do código de erro — a função
    // `refacoesEsgotadas` continua definida no arquivo, só deixa de ser
    // chamada num dos dois botões.
    expect: "das 2 rotas de Refazer conferem o limite",
  },
  {
    guard: "os dois Refazer dividem o mesmo contador",
    name: "a contagem passa a olhar só a refação de imagem",
    kind: "esperto",
    // ESPERTO: continua HAVENDO limite, e o botão de refazer imagem continua
    // sendo barrado no 4º clique. O que muda é que "Refazer o vídeo" deixa de
    // contar — e é justamente o caro: US$ 2,31 por clique no Seedance, contra
    // US$ 0,08 da imagem. O limite sobrevive no papel e some onde importa.
    file: DIARIO,
    find: 'export const ORIGENS_DE_REFACAO: OrigemDaCorrida[] = ["refazer_imagem", "refazer_video"];',
    replace: 'export const ORIGENS_DE_REFACAO: OrigemDaCorrida[] = ["refazer_imagem"];',
    expect: "refações: a contagem não cobre as duas origens",
  },
  {
    guard: "a recusa por teto diz o que já foi pago",
    name: "a recusa por teto vira um erro seco",
    kind: "esperto",
    // ESPERTO: a recusa continua acontecendo, o dinheiro continua sendo
    // poupado na etapa que não saiu, e um teste de "recusa?" seguiria verde.
    // O que se perde é a única informação que impede o próximo clique: que as
    // etapas ANTERIORES já foram pagas e que o resultado parcial é
    // recuperável. Sem ela, o reflexo é tentar de novo — e pagar tudo de novo.
    file: PIPELINE,
    find: '        "Nada foi pedido ao fornecedor nesta etapa. As etapas anteriores JA foram pagas e os request_id " +\n        "delas estao gravados: o resultado parcial e recuperavel e nao deve ser refeito.",',
    replace: '        "Nada foi pedido ao fornecedor nesta etapa.",',
    expect: "refações: a recusa por teto não diz que as etapas anteriores foram pagas",
  },
  {
    guard: "a tela desabilita o Refazer ao esgotar o limite",
    name: "o botão volta a ficar clicável e a recusa só chega no clique",
    kind: "esperto",
    // ESPERTO: o servidor CONTINUA recusando com 409, então nenhum dinheiro
    // sai e um teste de "o limite funciona?" seguiria verde. O que se perde é
    // a previsibilidade da tela: nesta etapa o clique é a única coisa que a
    // pessoa pode fazer, e um botão que parece disponível e responde "não"
    // ensina que o produto é imprevisível. É a mesma regra de
    // `generationReadiness` — a tela desabilita pelo MESMO critério do
    // servidor.
    file: TELA,
    find: "  const refacoesEsgotadas = refacoesLimite !== null && refacoesFeitas >= refacoesLimite;",
    replace: "  const refacoesEsgotadas = false;",
    expect: "refações: a tela não deriva o esgotamento da contagem",
  },
  {
    guard: "a leitura entrega a contagem de refações",
    name: "a leitura de vídeo para de trazer as refações",
    kind: "esperto",
    // ESPERTO: a tela continua com a lógica de desabilitar, o servidor
    // continua recusando, e nada quebra — `refacoes` fica `undefined` e a
    // tela trata ausência como "não sei" (falhar fechado ali esconderia o
    // botão por um campo faltando). O efeito é o botão nunca desabilitar, e
    // a recusa voltar a chegar só no clique. O defeito reaparece inteiro,
    // por um caminho que não passa pela tela.
    file: ROTA,
    find: "    return comRefacoes(rows);",
    replace: "    return rows.map(withDeliveredSeconds);",
    expect: "refações: a listagem de vídeos não entrega a contagem",
  },
];

export interface RefacoesCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

/** Conta com um banco de mentira: `linhas` são as origens já gravadas. */
async function contarCom(origens: (string | null)[]): Promise<number> {
  const original = pool.query.bind(pool);
  try {
    (pool as { query: unknown }).query = (async (texto: unknown, valores?: unknown[]) => {
      if (!/FROM fal_pipeline_runs/.test(String(texto))) return { rows: [], rowCount: 0 };
      // Reproduz o `origem = ANY($2)` do SQL real: é justamente essa lista que
      // o mutante de G-2 encolhe, e filtrar aqui é o que faz a guarda medir a
      // constante em vez de um número inventado.
      const aceitas = (valores?.[1] ?? []) as string[];
      const n = origens.filter((o) => o !== null && aceitas.includes(o)).length;
      return { rows: [{ n: String(n) }], rowCount: 1 };
    }) as typeof pool.query;
    return await contarRefacoes("video-da-prova");
  } finally {
    (pool as { query: unknown }).query = original;
  }
}

export async function checkRefacoesPolicy(): Promise<RefacoesCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // -------------------------------------------------------------------------
  // G-2 — as duas origens contam, e as outras três não
  // -------------------------------------------------------------------------
  const soImagem = await contarCom(["refazer_imagem", "refazer_imagem"]);
  const soVideo = await contarCom(["refazer_video", "refazer_video"]);
  const caminhoNormal = await contarCom(["criacao", "aprovacao", "aprovacao_video"]);
  const antigas = await contarCom([null, null, null]);

  if (soImagem !== 2 || soVideo !== 2) {
    failures.push(
      `refações: a contagem não cobre as duas origens — imagem=${soImagem}, vídeo=${soVideo}, esperado 2 ` +
        "em cada. Deixar `refazer_video` de fora some com o limite exatamente onde ele custa mais: " +
        "US$ 2,31 por clique no Seedance, contra US$ 0,08 da imagem.",
    );
  } else if (caminhoNormal !== 0) {
    failures.push(
      `refações: o caminho NORMAL de um vídeo (criar, aprovar, aprovar vídeo) contou como ` +
        `${caminhoNormal} refação(ões). Um vídeo comum já nasceria com o limite consumido, e o primeiro ` +
        "Refazer legítimo seria recusado.",
    );
  } else if (antigas !== 0) {
    failures.push(
      `refações: corridas sem origem (anteriores à migration 066) contaram ${antigas}. Não há como saber ` +
        "o que foram, e contá-las inventaria dado — a escolha é subestimar e dar margem a mais.",
    );
  } else {
    notes.push(
      "    refações: as duas origens de Refazer contam no MESMO limite; criação/aprovação e corridas " +
        "sem origem não contam",
    );
  }

  // -------------------------------------------------------------------------
  // G-1 — a 4ª é recusada, e antes de abrir corrida
  // -------------------------------------------------------------------------
  const rota = lerDaRaiz(ROTA);
  const usos = (rota.match(/if \(await refacoesEsgotadas\(video\.id, reply\)\) return reply;/g) ?? []).length;
  if (usos < 2) {
    failures.push(
      `refações: só ${usos} das 2 rotas de Refazer conferem o limite — a que não confere continua sendo ` +
        "um botão sem teto. `/recompose` e `/redo-video` precisam das duas.",
    );
  } else {
    const posRecusa = rota.indexOf("if (await refacoesEsgotadas(video.id, reply)) return reply;");
    const posAbrir = rota.indexOf("const runId = await abrirCorrida({", posRecusa);
    if (posAbrir >= 0 && posRecusa > posAbrir) {
      failures.push(
        "refações: a recusa acontece DEPOIS de abrir a corrida — a linha de corrida fica no banco sem " +
          "nenhuma etapa, e a próxima leitura do diário passa a ver uma corrida órfã que ninguém abriu " +
          "de propósito.",
      );
    } else {
      notes.push(
        `    refações: as 2 rotas de Refazer recusam a partir da ${MAX_REFACOES_POR_VIDEO + 1}ª, antes de abrir corrida`,
      );
    }
  }
  if (!rota.includes("refacoes_esgotadas")) {
    failures.push(
      "refações: o Refazer da imagem não confere o limite — o código de erro `refacoes_esgotadas` sumiu " +
        "da rota, e com ele a recusa.",
    );
  }

  // -------------------------------------------------------------------------
  // G-3 — os 5 call sites declaram origem
  // -------------------------------------------------------------------------
  const chamadas = (rota.match(/await abrirCorrida\(\{/g) ?? []).length;
  const comOrigem = (rota.match(/origem: "(criacao|aprovacao|aprovacao_video|refazer_imagem|refazer_video)"/g) ?? []).length;
  if (comOrigem !== chamadas) {
    failures.push(
      `refações: ${chamadas} chamada(s) a abrirCorrida e só ${comOrigem} com origem declarada. Corrida ` +
        "sem origem não conta como refação — o limite ganha um furo silencioso, e o furo fica " +
        "justamente no caminho que alguém acrescentou sem lembrar desta regra.",
    );
  } else {
    notes.push(`    refações: as ${chamadas} chamadas a abrirCorrida declaram de onde vieram`);
  }

  // -------------------------------------------------------------------------
  // G-4 — a recusa por teto diz o que já foi pago (falha parcial visível)
  // -------------------------------------------------------------------------
  const pipeline = lerDaRaiz(PIPELINE);
  const recusa = pipeline.slice(pipeline.indexOf("TETO DE GASTO:"), pipeline.indexOf("TETO DE GASTO:") + 900);
  const exigidas = ["JA foram pagas", "recuperavel", "nao deve ser refeito"];
  const faltando = exigidas.filter((t) => !recusa.includes(t));
  if (pipeline.indexOf("TETO DE GASTO:") < 0) {
    failures.push("refações: não achei a mensagem de teto de gasto no pipeline.");
  } else if (faltando.length > 0) {
    failures.push(
      `refações: a recusa por teto não diz que as etapas anteriores foram pagas — falta ` +
        `${faltando.map((t) => JSON.stringify(t)).join(", ")}. É a ÚNICA informação que impede o próximo ` +
        "clique: `decidirEstorno` trata gasto já aceito como `indeterminado` e `debitCredit` cobra por " +
        "VÍDEO, então tentar de novo paga tudo de novo.",
    );
  } else {
    notes.push(
      "    refações: a recusa por teto diz que as anteriores já foram pagas e que o parcial é recuperável",
    );
  }

  // -------------------------------------------------------------------------
  // G-5 — a tela desabilita ao REGISTRAR a 3ª, não no clique da 4ª
  // -------------------------------------------------------------------------
  const tela = lerDaRaiz(TELA);

  if (!/refacoesFeitas >= refacoesLimite/.test(tela)) {
    failures.push(
      "refações: a tela não deriva o esgotamento da contagem — o botão de Refazer deixaria de " +
        "desabilitar, e a recusa voltaria a chegar só no clique. Nesta etapa o clique é a única ação " +
        "disponível: um botão que parece pronto e responde \"não\" ensina que o produto é imprevisível.",
    );
  } else if (/refacoesFeitas > refacoesLimite/.test(tela)) {
    failures.push(
      "refações: a tela usa `>` e não `>=` — o botão só travaria na QUARTA refação registrada, ou seja, " +
        "depois de a quarta já ter sido paga. O limite é 3: com 3 feitas, o botão tem de estar travado.",
    );
  } else {
    const desabilitados = (tela.match(/disabled=\{busy \|\| refacoesEsgotadas\}/g) ?? []).length;
    if (desabilitados < 2) {
      failures.push(
        `refações: só ${desabilitados} dos 2 botões de Refazer olham o limite na tela. O que não olha ` +
          "continua clicável — e é o par (imagem e vídeo) que divide o MESMO contador.",
      );
    } else {
      notes.push(
        `    refações: os 2 botões de Refazer desabilitam assim que a ${MAX_REFACOES_POR_VIDEO}ª é registrada (>=, não >)`,
      );
    }
  }

  // A leitura precisa ENTREGAR a contagem, senão a tela não tem o que ler.
  if (!rota.includes("comRefacoes(rows)")) {
    failures.push(
      "refações: a listagem de vídeos não entrega a contagem — `refacoes` chegaria `undefined`, a tela " +
        "trataria como \"não sei\" (que é o certo: falhar fechado ali esconderia o botão por um campo " +
        "faltando) e o botão nunca desabilitaria. O defeito reaparece inteiro sem passar pela tela.",
    );
  } else {
    notes.push("    refações: a leitura de vídeos entrega `refacoes: {feitas, limite}` para a tela");
  }

  for (const arquivo of LOCALES) {
    let texto = "";
    try {
      texto = lerDaRaiz(arquivo);
    } catch {
      failures.push(`refações: não consegui ler ${arquivo}.`);
      continue;
    }
    if (!texto.includes("refacoesEsgotadas")) {
      failures.push(
        `refações: ${arquivo} não tem a chave \`createVideo.generate.refacoesEsgotadas\` — o motivo do ` +
          "botão travado apareceria como a chave de tradução crua, e um botão desabilitado sem motivo " +
          "legível é pior que um botão que recusa.",
      );
    }
  }

  return { failures, notes };
}
