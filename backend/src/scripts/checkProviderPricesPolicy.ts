/**
 * PREÇO É DADO, NÃO CÓDIGO — a tabela de preços (W2, migration 065, 24/08).
 *
 * ┌─ O defeito de DIREÇÃO que o W2 conserta ─────────────────────────────────┐
 * │ `costFor` devolve `known:false` para a fal, e o produto seguia como se   │
 * │ ausência de preço significasse BARATO: o teto de US$ 2,00 autorizou uma  │
 * │ chamada de sync-lipsync calculando US$ 0,45 onde o painel cobrou         │
 * │ US$ 3,20. O freio existia — mediu com a régua errada e liberou.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  endpoint SEM preço na tabela NÃO é autorizado — o pipeline recusa
 *       ANTES da submissão, com "custo desconhecido" na mensagem.
 *  G-2  preço AGREGADO (total de período) não autoriza sozinho, e não entra
 *       no cálculo: um total não tem unidade.
 *  G-3  preço com mais de 30 dias AVISA e continua autorizando — recusar por
 *       idade travaria o produto por um preço que provavelmente está certo;
 *       calar seria afirmar sem reconferir.
 *  G-4  as TRÊS etapas pagas do pipeline consultam a tabela. Uma que não
 *       consultasse manteria o defeito vivo justamente onde ele nasceu.
 *  G-5  ausência de preço vira `usd: null`, JAMAIS `0`.
 *
 * G-1, G-2, G-3 e G-5 medem por EXECUÇÃO (funções puras e `pool.query`
 * substituído); G-4 mede FORMA, porque exercitar as três etapas exigiria o
 * pipeline inteiro — o que `checkFalGastoInstrumentadoPolicy` já faz por
 * outro ângulo.
 *
 * Custo: ZERO.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import {
  DIAS_ATE_ENVELHECER,
  custoDe,
  estaVelho,
  invalidarCacheDePrecos,
  precoConfiavel,
} from "../services/billing/providerPrices.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";
const PRECOS = "backend/src/services/billing/providerPrices.ts";
const MIGRATION = "backend/src/db/migrations/065_provider_prices.sql";

export const MUTANTS: Mutant[] = [
  {
    guard: "endpoint sem preço não é autorizado",
    name: "custo desconhecido volta a ser tratado como barato",
    kind: "esperto",
    // ESPERTO: `?? peloCodigo` parece defensivo — "se não tem na tabela, usa
    // a régua". É EXATAMENTE o defeito que o W2 veio consertar, reescrito com
    // outra sintaxe: um endpoint novo entra em produção sem preço, o teto o
    // autoriza pela régua interna, e ninguém descobre até a fatura.
    // ⚠️ MIRA `custoDe`, e não o `if` do pipeline — 24/08. A primeira versão
    // mutava `custoDaEtapa` em falPipeline.ts e o gate seguia VERDE: esta
    // guarda mede a FUNÇÃO PURA, e um `if` no pipeline não a alcança. Alcance,
    // não lógica — o mesmo padrão do I1 e do mutante do ensaio.
    file: PRECOS,
    find: "      autorizavel: false,\n      usd: null,\n      preco: null,",
    replace: "      autorizavel: true,\n      usd: null,\n      preco: null,",
    expect: "preços: custo desconhecido foi autorizado",
  },
  {
    guard: "preço agregado não autoriza sozinho",
    name: "o total do período passa a valer como preço unitário",
    kind: "esperto",
    // ESPERTO: a tabela tem o número, ele veio do PAINEL, e usá-lo parece o
    // certo. Mas US$ 3,20 em duas chamadas não diz o preço de uma — pode ser
    // 1,60+1,60 ou 3,15+0,05, e a diferença decide se o teto libera. Pior: o
    // agregado do Wan é `per_second`, então multiplicá-lo dá US$ 5,00 para um
    // clipe de 5 s e barra toda geração (medido no ensaio de 24/08).
    file: PRECOS,
    find: "  return preco !== null && preco.unitario;",
    replace: "  return preco !== null;",
    // TRANSCRITO da mensagem real: o mutante mira `precoConfiavel`, e quem
    // o pega é a checagem dela — não a de `custoDe`, que lê `preco.unitario`
    // direto e não passa por aqui.
    expect: "`precoConfiavel` aprovou um preço com `unitario: false`",
  },
  {
    guard: "ausência de preço vira null, nunca zero",
    name: "custo desconhecido devolve zero",
    kind: "esperto",
    // ESPERTO: zero é um número, soma, e não quebra nada. Some como se a
    // chamada fosse de GRAÇA — e é o endpoint sem preço, o que ninguém mediu,
    // que passaria a aparecer como gratuito em toda conta.
    file: PRECOS,
    find: "      usd: null,\n      preco: null,",
    replace: "      usd: 0,\n      preco: null,",
    expect: "preços: ausência de preço virou 0 em vez de null",
  },
];

export interface ProviderPricesCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

/** As linhas que o banco de mentira devolve — uma por caso a medir. */
const LINHAS = [
  {
    endpoint_id: "prova/unitario-novo",
    vendor: "fal",
    usd: "0.05",
    unidade: "per_second",
    origem: "PAINEL",
    medido_em: new Date().toISOString().slice(0, 10),
    unitario: true,
    nota: null,
  },
  {
    endpoint_id: "prova/agregado",
    vendor: "fal",
    usd: "3.20",
    unidade: "per_audio_second",
    origem: "PAINEL",
    medido_em: new Date().toISOString().slice(0, 10),
    unitario: false,
    nota: "total do periodo",
  },
  {
    endpoint_id: "prova/unitario-velho",
    vendor: "fal",
    usd: "0.10",
    unidade: "per_call",
    origem: "DOC",
    // Bem além do limiar, para o caso não depender de quantos dias faltam.
    medido_em: new Date(Date.now() - (DIAS_ATE_ENVELHECER + 40) * 86_400_000).toISOString().slice(0, 10),
    unitario: true,
    nota: null,
  },
];

async function comTabelaDeMentira<T>(chamada: () => Promise<T>): Promise<T> {
  const original = pool.query.bind(pool);
  invalidarCacheDePrecos();
  try {
    (pool as { query: unknown }).query = (async (texto: unknown) => {
      if (/FROM provider_prices/.test(String(texto))) return { rows: LINHAS, rowCount: LINHAS.length };
      return { rows: [], rowCount: 0 };
    }) as typeof pool.query;
    return await chamada();
  } finally {
    (pool as { query: unknown }).query = original;
    invalidarCacheDePrecos();
  }
}

export async function checkProviderPricesPolicy(): Promise<ProviderPricesCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const m = await comTabelaDeMentira(async () => ({
    unitario: await custoDe("prova/unitario-novo", 10),
    agregado: await custoDe("prova/agregado", 10),
    velho: await custoDe("prova/unitario-velho", 1),
    ausente: await custoDe("prova/nao-existe", 10),
  }));

  // -------------------------------------------------------------------------
  // G-1 e G-5 — desconhecido não autoriza, e não vira zero
  // -------------------------------------------------------------------------
  if (m.ausente.autorizavel) {
    failures.push(
      "preços: custo desconhecido foi autorizado — um endpoint fora da tabela passaria pelo teto " +
        "calculado pela régua interna. Foi tratar ausência de preço como \"barato\" que deixou uma " +
        "chamada de US$ 3,20 passar por um teto de US$ 2,00.",
    );
  }
  if (m.ausente.usd !== null) {
    failures.push(
      `preços: ausência de preço virou ${JSON.stringify(m.ausente.usd)} em vez de null. Zero SOMA como se ` +
        "a chamada fosse de graça, e é justamente o endpoint que ninguém mediu que apareceria como " +
        "gratuito em toda conta.",
    );
  }
  if (!m.ausente.motivo.includes("custo desconhecido")) {
    failures.push(
      `preços: a recusa por preço ausente não diz "custo desconhecido" — texto: ` +
        `${JSON.stringify(m.ausente.motivo.slice(0, 100))}. É essa frase que a tela mostra.`,
    );
  }

  // -------------------------------------------------------------------------
  // G-2 — agregado não autoriza
  // -------------------------------------------------------------------------
  if (m.agregado.autorizavel) {
    failures.push(
      "preços: agregado foi tratado como unitário — US$ 3,20 em duas chamadas não diz o preço de UMA " +
        "(pode ser 1,60+1,60 ou 3,15+0,05, e a diferença decide se o teto libera). Pior: um agregado " +
        "`per_second` multiplicado pela duração dá US$ 5,00 num clipe de 5 s e barra toda geração.",
    );
  }
  if (precoConfiavel(m.agregado.preco)) {
    failures.push("preços: `precoConfiavel` aprovou um preço com `unitario: false`.");
  }
  if (!precoConfiavel(m.unitario.preco)) {
    // CONTROLE: sem um caso que APROVA, "não autoriza agregado" seria verdade
    // por vacuidade — a função poderia estar recusando tudo.
    failures.push(
      "preços: o CONTROLE falhou — `precoConfiavel` recusou um preço unitário e recente. A guarda não " +
        "distinguiria \"recusa agregado\" de \"nunca aprova nada\".",
    );
  }

  // -------------------------------------------------------------------------
  // G-3 — velho avisa e AUTORIZA
  // -------------------------------------------------------------------------
  if (!m.velho.preco || !estaVelho(m.velho.preco)) {
    failures.push(
      `preços: um preço de ${DIAS_ATE_ENVELHECER + 40} dias atrás não foi considerado velho — o aviso de ` +
        "preço desatualizado nunca apareceria.",
    );
  } else if (!m.velho.autorizavel) {
    failures.push(
      "preços: preço velho deixou de autorizar. Recusar por idade trava o produto por um preço que " +
        "provavelmente continua certo — o desenho é AVISAR e seguir.",
    );
  } else if (!/dias atrás/.test(m.velho.motivo)) {
    failures.push(
      `preços: o aviso de preço velho não diz há quantos dias — texto: ${JSON.stringify(m.velho.motivo.slice(0, 90))}.`,
    );
  } else {
    notes.push(
      `    preços: desconhecido não autoriza (usd null), agregado não autoriza, velho (>${DIAS_ATE_ENVELHECER}d) avisa e segue`,
    );
  }

  // -------------------------------------------------------------------------
  // G-4 — as três etapas consultam a tabela (FORMA)
  // -------------------------------------------------------------------------
  const pipeline = lerDaRaiz(PIPELINE);
  const consultas = (pipeline.match(/await custoDaEtapa\(/g) ?? []).length;
  if (consultas < 3) {
    failures.push(
      `preços: só ${consultas} das 3 etapas pagas consultam a tabela em ${PIPELINE}. A que não consulta ` +
        "mantém o defeito vivo exatamente onde ele nasceu — e `sincronizar`, a etapa da divergência de " +
        "4,6x, é a que mais importa.",
    );
  } else {
    notes.push(`    preços: as ${consultas} etapas pagas do pipeline consultam \`provider_prices\``);
  }

  // -------------------------------------------------------------------------
  // A migration existe e semeia com procedência
  // -------------------------------------------------------------------------
  let migration = "";
  try {
    migration = lerDaRaiz(MIGRATION);
  } catch {
    migration = "";
  }
  for (const termo of ["provider_prices", "PAINEL", "unitario"]) {
    if (!migration.includes(termo)) {
      failures.push(`preços: ${MIGRATION} não menciona \`${termo}\` — a tabela ou a procedência sumiram.`);
    }
  }
  if (migration.includes("provider_prices") && !failures.some((f) => f.includes(MIGRATION))) {
    notes.push("    preços: a migration 065 cria a tabela e semeia com origem e marca de agregado");
  }

  return { failures, notes };
}
