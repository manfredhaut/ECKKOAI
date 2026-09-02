/**
 * REGRESSÃO DO TIMECODE VAZADO — três invariantes, uma por causa raiz das
 * três tentativas reais que falharam no tier Normal antes desta correção
 * (edac7e4d, 2e499147, 2f1650b7) — commit que fecha as três: procurar
 * "Tier Normal: fecha as 3 causas raiz do timecode vazado" no histórico.
 *
 * ┌─ As três causas, cada uma com mutante próprio ────────────────────────────┐
 * │ G-1  `routes/videos.ts` só pede segmentação à tradução quando o roteiro   │
 * │      EXCEDE o limiar de tomada única (`LIMITE_TAKE_UNICO_SEGUNDOS`,       │
 * │      falPipeline.ts) — a mesma condição que decide, do lado da            │
 * │      animação, se o vídeo vai fatiar de verdade. Sem isso, um roteiro     │
 * │      curto o bastante para animar num take só ainda pedia marcador        │
 * │      `[mm:ss-mm:ss]` que ninguém ia fatiar. Testado por LEITURA — a       │
 * │      condição embutida num handler Fastify de 3000+ linhas não tem um     │
 * │      ponto de entrada isolado para execução direta, e o invariante é      │
 * │      estrutural (a linha existe, gating a chamada certa), não um valor    │
 * │      numérico para comparar.                                              │
 * │ G-2  A guarda pós-tradução (`marcadoresEncontrados !== marcadoresEsperados│
 * │      `) recusa ANTES do INSERT em `videos` quando a contagem de           │
 * │      marcadores não bate com o que `traducao.segmented` promete. Testado  │
 * │      por LEITURA, mesma razão de G-1.                                     │
 * │ G-3  `reutilizar()` (directionTranslation.ts) trata uma entrada de cache  │
 * │      CONTAMINADA (com marcador, salva antes desta correção existir) como  │
 * │      cache-miss — força tradução nova em vez de vazar o marcador velho.   │
 * │      Testado por EXECUÇÃO REAL de `translateDirection` (função            │
 * │      exportada), `fetch`/`pool.query` substituídos.                       │
 * │ G-4  CONTRAPONTO de G-3: uma entrada de cache LIMPA continua sendo        │
 * │      reaproveitada — a correção não pode virar "nunca mais usar cache".   │
 * │      Sem este contraponto, um mutante que sempre retorna `null` também    │
 * │      "corrigiria" G-3 e passaria despercebido: mais caro (rechama o       │
 * │      modelo sempre) e esconde a intenção real do fix.                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. G-1/G-2 são leitura de arquivo. G-3/G-4 rodam
 * `translateDirection` de verdade com `fetch`/`pool.query` substituídos —
 * nenhum byte sai para a internet, nenhuma linha grava no banco real.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import { translateDirection } from "../services/video/directionTranslation.js";

const ROTAS_VIDEOS = "backend/src/routes/videos.ts";
const DIRECTION_TRANSLATION = "backend/src/services/video/directionTranslation.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "tier Normal: a tradução só pede segmentação quando o roteiro excede a tomada única",
    name: "routes/videos.ts volta a pedir segmentação para QUALQUER roteiro do tier Normal",
    kind: "obvio",
    // ÓBVIO: exatamente a regressão que produziu o bug real — remover a
    // condição de elegibilidade e voltar a decidir só pelo tier.
    file: ROTAS_VIDEOS,
    find: 'if (tierVideo === "normal" && !elegivelParaTomadaUnica) {',
    replace: 'if (tierVideo === "normal") {',
    expect: "routes/videos.ts pede segmentação sem checar a elegibilidade para tomada única",
  },
  {
    guard: "tier Normal: a guarda pós-tradução recusa quando a contagem de marcadores não bate",
    name: "a guarda pós-tradução compara com o operador invertido e nunca dispara",
    kind: "esperto",
    // ESPERTO: a guarda continua no lugar, com a MESMA forma — só o
    // operador muda, e ela passa a disparar exatamente quando NÃO deveria
    // (contagens iguais) e a ficar muda quando deveria disparar
    // (contagens diferentes, o caso real de 2f1650b7).
    file: ROTAS_VIDEOS,
    find: "if (marcadoresEncontrados !== marcadoresEsperados) {",
    replace: "if (marcadoresEncontrados === marcadoresEsperados) {",
    expect: "a guarda pós-tradução não dispara com contagem de marcadores divergente",
  },
  {
    guard: "tier Normal: reutilizar() trata cache com marcador como cache-miss",
    name: "reutilizar() volta a devolver a entrada de cache mesmo contaminada",
    kind: "esperto",
    // ESPERTO: a função continua consultando o banco e devolvendo ALGO —
    // só para de filtrar pelo CONTEÚDO. É o bug real, medido no teste de
    // 02/09: cache-hit de `2f1650b7` (com 3 marcadores) devolvido para uma
    // chamada que não queria segmentação nenhuma.
    file: DIRECTION_TRANSLATION,
    find: "  if (encontrado && [...encontrado.matchAll(MARCADOR_DE_JANELA)].length > 0) return null;\n  return encontrado;",
    replace: "  return encontrado;",
    expect: "reutilizar() devolveu uma tradução em cache CONTAMINADA (com marcador) para uma chamada não segmentada",
  },
  {
    guard: "tier Normal: uma entrada de cache LIMPA continua sendo reaproveitada (contraponto de G-3)",
    name: "reutilizar() passa a descartar QUALQUER cache, mesmo limpo",
    kind: "esperto",
    // CONTRAPONTO: a correção certa filtra só o CONTAMINADO. Uma correção
    // gananciosa (nunca reaproveitar nada) também "resolveria" G-3 e
    // passaria despercebida — mais caro (Gemini chamado sempre) e esconde
    // a intenção real do fix, que é seletiva.
    file: DIRECTION_TRANSLATION,
    find: "  if (encontrado && [...encontrado.matchAll(MARCADOR_DE_JANELA)].length > 0) return null;\n  return encontrado;",
    replace: "  return null;",
    expect: "reutilizar() descartou uma entrada de cache LIMPA — a correção deve filtrar só o marcador, não desligar o cache inteiro",
  },
];

function apenasCodigo(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");
}

export interface TomadaUnicaMarkerCacheCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkTomadaUnicaMarkerCachePolicy(
  repoRoot = "/repo",
): Promise<TomadaUnicaMarkerCacheCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1: routes/videos.ts só fraciona a tradução quando NÃO é elegível
  // para tomada única, e essa condição gate a chamada certa (fracionarRoteiro
  // logo abaixo, dentro do MESMO bloco) --------------------------------------
  const rotaFonte = apenasCodigo(readFileSync(path.join(repoRoot, ROTAS_VIDEOS), "utf8"));
  const condicaoElegibilidade = 'const elegivelParaTomadaUnica = script.length / PIPELINE_CHARS_PER_SECOND <= LIMITE_TAKE_UNICO_SEGUNDOS;';
  const condicaoGate = 'if (tierVideo === "normal" && !elegivelParaTomadaUnica) {';
  if (!rotaFonte.includes(condicaoElegibilidade)) {
    failures.push(
      "routes/videos.ts não calcula mais elegivelParaTomadaUnica pela MESMA fórmula de falPipeline.ts " +
        "(script.length / PIPELINE_CHARS_PER_SECOND <= LIMITE_TAKE_UNICO_SEGUNDOS) — as duas decisões " +
        "(tradução e animação) podem voltar a divergir.",
    );
  } else if (!rotaFonte.includes(condicaoGate)) {
    failures.push(
      "routes/videos.ts pede segmentação sem checar a elegibilidade para tomada única — um roteiro curto " +
        "o bastante para animar num take só volta a pedir marcador [mm:ss-mm:ss] que ninguém vai fatiar.",
    );
  } else {
    // A condição existe — confirma que ela de fato GATE a chamada de
    // fracionarRoteiro (não é um cálculo morto, sem efeito nenhum).
    const posGate = rotaFonte.indexOf(condicaoGate);
    const posFracionar = rotaFonte.indexOf("fracionarRoteiro(script)", posGate);
    if (posGate < 0 || posFracionar < 0 || posFracionar - posGate > 300) {
      failures.push(
        "routes/videos.ts: a condição de tomada única existe, mas não está gating a chamada de " +
          "fracionarRoteiro(script) de perto o bastante para eu confiar que é ela quem decide.",
      );
    } else {
      notes.push("    tomada única: routes/videos.ts só pede segmentação quando o roteiro excede LIMITE_TAKE_UNICO_SEGUNDOS");
    }
  }

  // --- G-2: a guarda pós-tradução existe, com o operador certo, DEPOIS da
  // tradução e ANTES do INSERT em videos --------------------------------------
  const guardaMarcador = "if (marcadoresEncontrados !== marcadoresEsperados) {";
  const posTraducao = rotaFonte.indexOf("motionPromptEn = traducao.english;");
  const posGuarda = rotaFonte.indexOf(guardaMarcador);
  const posInsert = rotaFonte.indexOf("INSERT INTO videos");
  if (!rotaFonte.includes(guardaMarcador)) {
    failures.push("a guarda pós-tradução não dispara com contagem de marcadores divergente — não encontrei a comparação no arquivo.");
  } else if (posTraducao < 0 || posGuarda < posTraducao || posInsert < posGuarda) {
    failures.push(
      "a guarda pós-tradução existe, mas não está posicionada entre a tradução e o INSERT em `videos` — " +
        `posições: tradução=${posTraducao}, guarda=${posGuarda}, INSERT=${posInsert}. Fora dessa ordem, ela ` +
        "não recusa mais ANTES de qualquer chamada paga.",
    );
  } else {
    notes.push("    tier Normal: a guarda de marcador roda entre a tradução e o INSERT, antes de qualquer chamada paga");
  }

  // --- G-3 e G-4: reutilizar(), por EXECUÇÃO real de translateDirection ------
  const resultadoContaminado = await testarReutilizacao(
    "[00:00-00:05] Ação A. [00:05-00:10] Ação B.",
    "she sits still and speaks firmly.",
  );
  if (resultadoContaminado.origin === "reused") {
    failures.push(
      "reutilizar() devolveu uma tradução em cache CONTAMINADA (com marcador) para uma chamada não " +
        `segmentada — origin="reused", english=${JSON.stringify(resultadoContaminado.english)}. Deveria ter ` +
        "tratado como cache-miss e chamado o modelo de novo.",
    );
  }

  const resultadoLimpo = await testarReutilizacao("she sits still and speaks firmly.", "NUNCA DEVERIA CHEGAR AQUI");
  if (resultadoLimpo.origin !== "reused" || resultadoLimpo.english !== "she sits still and speaks firmly.") {
    failures.push(
      "reutilizar() descartou uma entrada de cache LIMPA — a correção deve filtrar só o marcador, não " +
        `desligar o cache inteiro — origin="${resultadoLimpo.origin}", english=${JSON.stringify(resultadoLimpo.english)}.`,
    );
  }

  if (
    resultadoContaminado.origin === "model" &&
    resultadoLimpo.origin === "reused" &&
    resultadoLimpo.english === "she sits still and speaks firmly."
  ) {
    notes.push(
      "    tier Normal: reutilizar() ignora cache contaminado (força tradução nova) e continua reaproveitando cache limpo",
    );
  }

  return { failures, notes };
}

async function testarReutilizacao(
  cacheDevolve: string,
  respostaModeloSeChamado: string,
): Promise<{ origin: string; english: string }> {
  const modoOriginal = process.env.PROVIDER_MODE;
  const fetchOriginal = globalThis.fetch;
  const queryOriginal = pool.query.bind(pool);
  process.env.PROVIDER_MODE = "live"; // complete() não pode tomar o atalho de fixture

  (pool as { query: unknown }).query = (async (texto: unknown) => {
    if (String(texto).includes("motion_prompt_en")) {
      return { rows: [{ motion_prompt_en: cacheDevolve }] };
    }
    return { rows: [] };
  }) as typeof pool.query;

  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: respostaModeloSeChamado }] }, finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const resultado = await translateDirection({
      tenantId: "00000000-0000-0000-0000-0000000000fe",
      apiKey: "irrelevante-fetch-substituido",
      vendor: "gemini",
      source: "Plano médio. O personagem está sentado, olha direto para a lente e fala com firmeza.",
      locale: "pt-BR",
      blockWindows: undefined,
    });
    return { origin: resultado.origin, english: resultado.english };
  } finally {
    process.env.PROVIDER_MODE = modoOriginal;
    globalThis.fetch = fetchOriginal;
    (pool as { query: unknown }).query = queryOriginal as typeof pool.query;
  }
}
