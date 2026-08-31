/**
 * BUGS D e E, RODADA 3 (29/08/2026) — o motion_prompt deixa de ser idêntico
 * em todo bloco de um vídeo Normal fracionado. Escopo estrito: tier Normal/
 * motor Wan. Nada aqui exercita Seedance/Premium nem HeyGen/Simples.
 *
 * ┌─ O que cada bloco confere ────────────────────────────────────────────┐
 * │ 1. `janelasDosBlocos`/`direcaoPorJanela` (scriptFractioning.ts) — as   │
 * │    funções PURAS que fatiam a Interpretação traduzida.                │
 * │ 2. `montarPlanoDosBlocosWan` (wanOrchestration.ts) — a tabela que une  │
 * │    janela + direção fatiada por bloco.                                │
 * │ 3. `buildSystemPrompt` (directionTranslation.ts) — por EXECUÇÃO real   │
 * │    de `translateDirection`, com `fetch` substituído: confirma que a   │
 * │    instrução de segmentação SÓ é pedida com `blockWindows.length > 1`,│
 * │    e que o CACHE de reutilização é pulado nesse caso (janelas variam   │
 * │    por roteiro, e reusar sem olhar isso entregaria marcador           │
 * │    dessincronizado — ou, pior, vazaria para Simples/Premium via um    │
 * │    texto-fonte igual).                                                │
 * │ 4. O LAÇO de vários blocos (`animarNarrarSincronizar`, falPipeline.ts) │
 * │    — por ÂNCORA DE TEXTO-FONTE, não por execução. Na ESCRITA original   │
 * │    deste item (RODADA 3), uma execução real do caminho de vários       │
 * │    blocos chamaria `imagemDeEntradaDoProximoBloco` para o bloco 1+, que │
 * │    rodava `ffmpeg` de verdade sobre a URL do vídeo do bloco anterior —  │
 * │    e essa URL, num `fetch` substituído, não era um vídeo de verdade.    │
 * │    Essa função foi REMOVIDA na migração para `reference-to-video/flash` │
 * │    (item 2, RODADA 4, 29/08): todo bloco agora anima a partir da MESMA  │
 * │    imagem composta, sem extrair quadro nenhum — o obstáculo que exigia  │
 * │    âncora de texto em vez de execução NÃO EXISTE MAIS. Não reescrito    │
 * │    para execução real nesta rodada por escopo (a checagem atual         │
 * │    continua correta, só a justificativa do MÉTODO envelheceu); fica     │
 * │    registrado para quem for mexer aqui de novo.                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. Nenhuma rede de verdade (fetch substituído), nenhum banco de
 * verdade (pool.query substituído).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import {
  janelasDosBlocos,
  direcaoPorJanela,
  formatarJanela,
  type BlocoDeAnimacao,
} from "../services/video/scriptFractioning.js";
import { montarPlanoDosBlocosWan } from "../services/video/wanOrchestration.js";
import { buildSystemPrompt, translateDirection } from "../services/video/directionTranslation.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";

/** O arquivo sem comentários — mesma técnica de `checkTranslationPolicy.ts`. */
function apenasCodigo(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("//"))
    .join("\n");
}

export const MUTANTS: Mutant[] = [
  {
    guard: "animarNarrarSincronizar: cada bloco do laço usa a direção DELE, não a de outro",
    name: "o laço de blocos volta a usar sempre a direção do bloco 0",
    kind: "esperto",
    // ESPERTO: a corrida continua submetendo N blocos, cada um com um `prompt`
    // não vazio e plausível — só que todos IDÊNTICOS ao do bloco 0. É
    // exatamente a forma do Bug E, reintroduzida por um índice fixo em vez
    // de variável.
    file: PIPELINE,
    find: "      planoDosBlocos[i].direcaoDoBloco,",
    replace: "      planoDosBlocos[0].direcaoDoBloco,",
    expect: "wan-orchestration: dois blocos saíram com a MESMA direção",
  },
];

export interface WanBlockOrchestrationCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkWanBlockOrchestrationPolicy(): Promise<WanBlockOrchestrationCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------
  // 1. janelasDosBlocos — cumulativas, a partir da duração de cada bloco.
  // ---------------------------------------------------------------------
  const blocosDeProva: BlocoDeAnimacao[] = [
    { texto: "a", duracaoEscolhida: 5 },
    { texto: "b", duracaoEscolhida: 10 },
    { texto: "c", duracaoEscolhida: 15 },
  ];
  const janelas = janelasDosBlocos(blocosDeProva);
  const janelasEsperadas = [
    { inicioSegundos: 0, fimSegundos: 5 },
    { inicioSegundos: 5, fimSegundos: 15 },
    { inicioSegundos: 15, fimSegundos: 30 },
  ];
  if (JSON.stringify(janelas) !== JSON.stringify(janelasEsperadas)) {
    failures.push(
      `wan-orchestration: janelasDosBlocos devolveu ${JSON.stringify(janelas)}, esperado ` +
        `${JSON.stringify(janelasEsperadas)} — as janelas têm de ser cumulativas, cada bloco começando ` +
        "onde o anterior termina.",
    );
  }
  if (formatarJanela(janelas[1]) !== "[00:05-00:15]") {
    failures.push(
      `wan-orchestration: formatarJanela(${JSON.stringify(janelas[1])}) devolveu ` +
        `${JSON.stringify(formatarJanela(janelas[1]))}, esperado "[00:05-00:15]".`,
    );
  }

  // ---------------------------------------------------------------------
  // 2. direcaoPorJanela — o caminho FELIZ: marcadores corretos, em ordem.
  // ---------------------------------------------------------------------
  const duasJanelas = [
    { inicioSegundos: 0, fimSegundos: 5 },
    { inicioSegundos: 5, fimSegundos: 10 },
  ];
  const textoComMarcadores =
    "[00:00-00:05] She stands still, arms crossed. [00:05-00:10] She uncrosses her arms and waves.";
  const fatias = direcaoPorJanela(textoComMarcadores, duasJanelas);
  if (fatias.length !== 2 || !fatias[0].includes("arms crossed") || fatias[0].includes("waves")) {
    failures.push(
      `wan-orchestration: a 1ª fatia deveria conter só a direção do bloco 0 — saiu ${JSON.stringify(fatias)}.`,
    );
  }
  if (fatias.length !== 2 || !fatias[1].includes("waves") || fatias[1].includes("arms crossed")) {
    failures.push(
      `wan-orchestration: a 2ª fatia deveria conter só a direção do bloco 1, sem vazar a do bloco 0 — ` +
        `saiu ${JSON.stringify(fatias)}.`,
    );
  }

  // --- 2b. CONTAGEM ERRADA — fallback para o texto inteiro, nos DOIS blocos.
  const umMarcadorSo = "[00:00-00:05] She stands still, arms crossed.";
  const fatiasContagemErrada = direcaoPorJanela(umMarcadorSo, duasJanelas);
  if (
    fatiasContagemErrada.length !== 2 ||
    fatiasContagemErrada[0] !== umMarcadorSo.trim() ||
    fatiasContagemErrada[1] !== umMarcadorSo.trim()
  ) {
    failures.push(
      "wan-orchestration: com 1 marcador para 2 janelas (contagem não bate), o fallback deveria devolver " +
        `o TEXTO INTEIRO para os dois blocos — saiu ${JSON.stringify(fatiasContagemErrada)}. Um tradutor ` +
        "que não segmentou não pode fazer um bloco animar com metade da direção do outro.",
    );
  }

  // --- 2c. SEM MARCADOR NENHUM — mesmo fallback (o caso mais comum: vídeo
  // Normal de bloco único, Simples, Premium — nenhum deles pede segmentação).
  const semMarcador = "She stands still with a calm expression.";
  const fatiasSemMarcador = direcaoPorJanela(semMarcador, duasJanelas);
  if (fatiasSemMarcador.some((f) => f !== semMarcador)) {
    failures.push(
      `wan-orchestration: sem marcador nenhum, todo bloco deveria receber o texto inteiro — saiu ` +
        `${JSON.stringify(fatiasSemMarcador)}.`,
    );
  }

  // --- 2d. FATIA VAZIA (marcadores colados um no outro) — fallback também.
  const marcadoresColados = "[00:00-00:05][00:05-00:10] She waves the whole time.";
  const fatiasColadas = direcaoPorJanela(marcadoresColados, duasJanelas);
  if (fatiasColadas[0] !== marcadoresColados.trim()) {
    failures.push(
      "wan-orchestration: dois marcadores colados produzem uma fatia VAZIA para o bloco 0 — o fallback " +
        `deveria ter disparado e devolvido o texto inteiro; saiu ${JSON.stringify(fatiasColadas)}.`,
    );
  }

  // ---------------------------------------------------------------------
  // 3. montarPlanoDosBlocosWan — a TABELA, ponta a ponta.
  // ---------------------------------------------------------------------
  const plano = montarPlanoDosBlocosWan({
    blocos: blocosDeProva,
    direcaoTraduzida:
      "[00:00-00:05] primeira. [00:05-00:15] segunda. [00:15-00:30] terceira.",
    promptDeComposicaoUsado: "cenário e traje de prova",
  });
  if (
    plano.length !== 3 ||
    !plano[0].direcaoDoBloco.includes("primeira") ||
    !plano[1].direcaoDoBloco.includes("segunda") ||
    !plano[2].direcaoDoBloco.includes("terceira")
  ) {
    failures.push(
      `wan-orchestration: montarPlanoDosBlocosWan não distribuiu as 3 direções corretamente — ` +
        `${JSON.stringify(plano.map((p) => p.direcaoDoBloco))}.`,
    );
  }
  if (plano.some((p) => p.promptDeComposicaoUsado !== "cenário e traje de prova")) {
    failures.push("wan-orchestration: promptDeComposicaoUsado deveria repetir em toda linha da tabela.");
  }

  // ---------------------------------------------------------------------
  // 4. buildSystemPrompt — BYTE A BYTE igual a antes desta rodada quando não
  //    há janelas (ou só 1) — é isto que garante Simples/Premium/Normal de
  //    bloco único intactos.
  // ---------------------------------------------------------------------
  const SYSTEM_BASE_DE_ANTES =
    "You translate stage direction for an AI avatar video into English. " +
    "Preserve the directing intent: gesture, posture, camera framing, energy and pacing. " +
    "Do not translate word by word; write what a director would say to a performer. " +
    "If the text is already in English, return it unchanged. " +
    "Return only the direction text. No preamble, no quotes, no commentary, no explanation.";
  if (buildSystemPrompt(undefined) !== SYSTEM_BASE_DE_ANTES) {
    failures.push(
      `wan-orchestration: buildSystemPrompt(undefined) mudou de texto — saiu ${JSON.stringify(buildSystemPrompt(undefined))}. ` +
        "Sem janelas, o system prompt tem de ser BYTE A BYTE o de antes desta rodada: é o que Simples, " +
        "Premium e Normal de bloco único sempre recebem.",
    );
  }
  if (buildSystemPrompt([{ inicioSegundos: 0, fimSegundos: 5 }]) !== SYSTEM_BASE_DE_ANTES) {
    failures.push("wan-orchestration: com 1 janela só (nada para segmentar), o system prompt mudou.");
  }
  const comSegmentacao = buildSystemPrompt(duasJanelas);
  if (!comSegmentacao.includes("[00:00-00:05]") || !comSegmentacao.includes("[00:05-00:10]")) {
    failures.push(
      `wan-orchestration: com 2 janelas, o system prompt deveria citar as duas janelas — saiu ` +
        `${JSON.stringify(comSegmentacao)}.`,
    );
  }

  // ---------------------------------------------------------------------
  // 5. translateDirection — EXECUÇÃO real, `fetch` e `pool.query`
  //    substituídos. Confirma que SEGMENTAR (a) manda a instrução ao
  //    modelo e (b) pula o cache de reutilização.
  // ---------------------------------------------------------------------
  const { pool } = await import("../db/pool.js");
  const queryOriginal = pool.query.bind(pool);
  const fetchOriginal = globalThis.fetch;
  const modoOriginal = process.env.PROVIDER_MODE;
  // `complete()` (providerRegistry.ts) tem um atalho de FIXTURE que devolve
  // texto canned sem nunca chamar `fetch` — em fixture (o modo do gate) este
  // teste não exercitaria o `fetch` substituído nenhuma vez. MESMO ajuste já
  // feito em `checkFalSceneWiringPolicy.ts` para o mesmo motivo, ali para a
  // fal.
  process.env.PROVIDER_MODE = "live";
  const sqlsEmitidos: string[] = [];
  (pool as { query: unknown }).query = (async (texto: unknown) => {
    sqlsEmitidos.push(String(texto));
    // Devolve uma tradução JÁ FEITA — se o cache for consultado, ele "acha"
    // algo, e o teste abaixo prova que SEGMENTANDO ele nem chega a perguntar.
    if (String(texto).includes("motion_prompt_en")) {
      return { rows: [{ motion_prompt_en: "tradução em cache, não deveria valer aqui" }] };
    }
    return { rows: [] };
  }) as typeof pool.query;

  let corpoEnviado: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    corpoEnviado = JSON.parse(String(init?.body ?? "{}"));
    return new Response(
      JSON.stringify({
        candidates: [
          {
            content: { parts: [{ text: "[00:00-00:05] a. [00:05-00:10] b." }] },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 10 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const resultado = await translateDirection({
      tenantId: "00000000-0000-0000-0000-0000000000fe",
      apiKey: "irrelevante",
      vendor: "gemini",
      source: "ela fica parada, depois acena",
      locale: "pt-BR",
      blockWindows: duasJanelas,
    });
    const systemEnviado = String(
      (corpoEnviado as unknown as { system_instruction?: { parts?: { text?: string }[] } })?.system_instruction
        ?.parts?.[0]?.text ?? "",
    );
    if (!systemEnviado.includes("[00:00-00:05]") || !systemEnviado.includes("[00:05-00:10]")) {
      failures.push(
        `wan-orchestration: com blockWindows, o system_instruction enviado ao modelo não citou as janelas ` +
          `— saiu ${JSON.stringify(systemEnviado)}.`,
      );
    }
    if (sqlsEmitidos.some((s) => s.includes("motion_prompt_en"))) {
      failures.push(
        "wan-orchestration: com blockWindows, translateDirection consultou o cache de reutilização — " +
          "ele existe para o texto FONTE, e não sabe se as janelas desta corrida são as mesmas de uma " +
          "corrida anterior com o mesmo texto. Reusar aqui arrisca marcador dessincronizado, ou pior, " +
          "vazar `[mm:ss-mm:ss]` para um vídeo Simples/Premium com o mesmo texto-fonte.",
      );
    }
    if (!resultado.segmented) {
      failures.push("wan-orchestration: translateDirection não marcou segmented=true com blockWindows>1.");
    }
  } catch (err) {
    failures.push(
      `wan-orchestration: translateDirection lançou no caminho segmentado — ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    globalThis.fetch = fetchOriginal;
    pool.query = queryOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  // ---------------------------------------------------------------------
  // 6. O LAÇO de vários blocos usa `planoDosBlocos[i].direcaoDoBloco` — por
  //    ÂNCORA DE TEXTO-FONTE (ver o cabeçalho deste arquivo, item 4, para o
  //    porquê de não ser execução: `imagemDeEntradaDoProximoBloco` roda
  //    ffmpeg de verdade sobre a URL do bloco anterior, que num `fetch`
  //    substituído nunca é um vídeo de verdade).
  // ---------------------------------------------------------------------
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  const fontePipeline = apenasCodigo(readFileSync(path.join(repoRoot, PIPELINE), "utf8"));
  const inicioLaco = fontePipeline.indexOf("for (let i = 0; i < blocos.length; i++) {");
  const ancoraFim = fontePipeline.indexOf("requestIds.push(bloco.requestId);", inicioLaco);
  if (inicioLaco < 0 || ancoraFim < 0) {
    failures.push(
      `wan-orchestration: não encontrei o laço de vários blocos em ${PIPELINE} pelas âncoras esperadas ` +
        '("for (let i = 0; i < blocos.length; i++) {" … "requestIds.push(bloco.requestId);") — a guarda ' +
        "não pode opinar sobre um trecho que não achou.",
    );
  } else {
    const trechoDoLaco = fontePipeline.slice(inicioLaco, ancoraFim);
    if (!trechoDoLaco.includes("planoDosBlocos[i].direcaoDoBloco")) {
      failures.push(
        "wan-orchestration: dois blocos saíram com a MESMA direção — dentro do laço de vários blocos, a " +
          "chamada a `animarUmBloco` não usa `planoDosBlocos[i].direcaoDoBloco`. Sem essa indexação POR " +
          "`i`, todo bloco recebe a mesma direção (um índice fixo) ou a Interpretação inteira sem fatiar " +
          `— a forma exata do Bug E. Trecho lido: ${JSON.stringify(trechoDoLaco.slice(0, 400))}`,
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "    wan-orchestration: janelasDosBlocos/direcaoPorJanela fatiam corretamente (e caem no fallback " +
        "de texto inteiro em 3 formas de falha diferentes), montarPlanoDosBlocosWan monta a tabela, " +
        "buildSystemPrompt só pede segmentação — e só então pula o cache — com mais de 1 janela (sem " +
        "janelas o system prompt é BYTE A BYTE o de antes desta rodada), e o laço de vários blocos usa " +
        "`planoDosBlocos[i].direcaoDoBloco`, nunca um índice fixo",
    );
  }

  return { failures, notes };
}
