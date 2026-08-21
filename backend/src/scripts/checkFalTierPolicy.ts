/**
 * BLOCO A (21/08) — o sistema de níveis de vídeo (Simples/Normal/Premium):
 * o tier escolhido decide o MOTOR e o TETO dentro do pipeline da fal, e a
 * escolha atravessa da tela até o corpo submetido.
 *
 *  G-T1  tier "normal" anima pelo Wan; tier "premium" anima pelo Seedance —
 *        por EXECUÇÃO, reusando a simulação de `checkFalSceneWiringPolicy`
 *  G-T2  o teto do tier "premium" é `PIPELINE_TETO_USD_PREMIUM`, não o
 *        global — por EXECUÇÃO, com um custo real que só cabe no próprio
 *  G-T3  o corpo enviado ao Seedance é o DELE, não o do Wan reaproveitado
 *        (image_urls lista + end_user_id + duration numérico, sem os
 *        campos exclusivos do Wan) — por EXECUÇÃO, no corpo que saiu
 *  G-T4  o formulário propaga `tier_video` até o corpo do POST — por FORMA
 *  G-T5  a aprovação relê o tier da LINHA (não do formulário) — por FORMA
 *
 * ┌─ Por que G-T2 é a mais importante das cinco ─────────────────────────────┐
 * │ É a reprodução exata do BLOCO SEEDANCE-1: o motor Premium ligado sob o   │
 * │ teto do "Normal" recusa a própria etapa `animar` antes de qualquer       │
 * │ chamada — não um bug de preço, um bug de CONGELAMENTO. Sem esta guarda,  │
 * │ um refactor que "simplificasse" `tetoParaTier` de volta para um teto só  │
 * │ reintroduziria o mesmo incidente, e o gate ficaria verde até alguém      │
 * │ tentar gerar um vídeo Premium de verdade.                                │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. Mesma simulação de `checkFalSceneWiringPolicy` — `fetch`
 * substituído, ElevenLabs deixado falhar de propósito (a corrida morre na
 * narração, depois de o corpo de `animar` já ter saído, que é tudo que estas
 * guardas precisam ler).
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import { corridaDeAnimacao } from "./checkFalSceneWiringPolicy.js";
import type { Mutant } from "./mutants.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";
const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";
const PASSO_GERAR = "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "pipeline: o tier decide o motor de animação (Wan para normal, Seedance para premium)",
    name: "o tier premium continua animando pelo Wan",
    kind: "esperto",
    // ESPERTO: a corrida continua inteira, o corpo continua parecendo
    // legítimo, e SÓ o custo real (∼18,5× menor no Wan) trai o defeito — que
    // é justamente o inverso do incidente do BLOCO SEEDANCE-1 (lá, o
    // Premium pagava caro demais para o teto; aqui, ele pagaria barato
    // demais para o próprio motor que escolheu).
    file: PIPELINE,
    find: '  return tier === "premium" ? ENDPOINT_ANIMAR_PREMIUM : ENDPOINT_ANIMAR;',
    replace: "  return ENDPOINT_ANIMAR;",
    expect: "tier: o motor de animação não mudou para o Seedance no tier premium",
  },
  {
    guard: "pipeline: o teto do tier premium é o PRÓPRIO, não o global",
    name: "o teto do tier premium volta a ser o global",
    kind: "esperto",
    // A REPRODUÇÃO EXATA do BLOCO SEEDANCE-1: com este mutante aplicado, uma
    // corrida premium comum (5 s de clipe, ~US$ 2,39 de animar+compor) é
    // recusada por "TETO DE GASTO" antes de tocar o Seedance — o mesmo
    // incidente, de volta.
    file: PIPELINE,
    find:
      "function tetoParaTier(input: Pick<FalPipelineInput, \"tetoDeGastoUsd\" | \"tier\">): number {\n" +
      "  if (input.tetoDeGastoUsd !== undefined) return input.tetoDeGastoUsd;\n" +
      '  return input.tier === "premium" ? PIPELINE_TETO_USD_PREMIUM : PIPELINE_TETO_USD;\n' +
      "}",
    replace:
      "function tetoParaTier(input: Pick<FalPipelineInput, \"tetoDeGastoUsd\" | \"tier\">): number {\n" +
      "  if (input.tetoDeGastoUsd !== undefined) return input.tetoDeGastoUsd;\n" +
      "  return PIPELINE_TETO_USD;\n" +
      "}",
    expect: "tier: o teto do tier premium recusou uma etapa que caberia no teto próprio",
  },
  {
    guard: "pipeline: o corpo do Seedance leva image_urls (lista) e end_user_id, não o corpo do Wan",
    name: "o tier premium envia end_user_id vazio de identificação de conta",
    kind: "esperto",
    // O Seedance exige identificação de conta B2B (`end_user_id`, MEDIDO por
    // leitura do BLOCO SEEDANCE-1). Omiti-la não quebra o fixture — que não
    // valida corpo nenhum — e só apareceria numa chamada REAL, com o
    // fornecedor recusando por um campo obrigatório ausente.
    file: PIPELINE,
    find: "    end_user_id: input.tenantId,",
    replace: "",
    expect: "tier: o corpo do Seedance saiu sem end_user_id (identificação de conta)",
  },
  {
    guard: "tier: o formulário propaga tier_video até o corpo do POST",
    name: "o formulário deixa de propagar o tier escolhido",
    kind: "esperto",
    // Mesma forma do defeito já registrado para legenda/cenário/traje:
    // coletado na tela, e o call site é que nunca soube.
    file: PASSO_GERAR,
    find: "    tier_video: wizard.tierVideo,",
    replace: "",
    expect: "`tier_video` sumiu do corpo montado pela tela",
  },
];

export interface FalTierCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export async function checkFalTierPolicy(): Promise<FalTierCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // G-T1 e G-T3 — as duas corridas, normal e premium, pelo despacho real
  // ---------------------------------------------------------------------------
  const normal = await corridaDeAnimacao();
  const premium = await corridaDeAnimacao("premium");

  const animarNormal = normal.submissoes.find((s) => s.endpoint.includes("wan"));
  const animarPremium = premium.submissoes.find((s) => s.endpoint.includes("seedance"));

  if (!animarNormal) {
    failures.push(
      "tier: nenhuma submissão ao Wan saiu para o tier normal — sem escolha de tier, o comportamento " +
        `de toda corrida anterior ao BLOCO A precisa continuar valendo. Endpoints observados: ` +
        `${normal.submissoes.map((s) => s.endpoint).join(", ") || "(nenhum)"}; erro ${JSON.stringify(normal.erro.slice(0, 140))}.`,
    );
  }
  if (!animarPremium) {
    failures.push(
      "tier: nenhuma submissão ao Seedance saiu para o tier premium — o motor não mudou com o tier, ou " +
        `a corrida morreu antes de tentar. Endpoints observados: ` +
        `${premium.submissoes.map((s) => s.endpoint).join(", ") || "(nenhum)"}; erro ${JSON.stringify(premium.erro.slice(0, 140))}.`,
    );
  }

  // ---------------------------------------------------------------------------
  // G-T2 — o teto: a corrida premium (∼US$ 2,39 de compor+animar, 5s de
  // clipe) tem de PASSAR da etapa animar sem "TETO DE GASTO". A corrida
  // continua morrendo na narração (ElevenLabs simulado a falhar) — é esse
  // erro, e não o de teto, que se espera aqui.
  // ---------------------------------------------------------------------------
  if (premium.erro.includes("TETO DE GASTO")) {
    failures.push(
      "tier: o tier premium foi recusado por TETO DE GASTO numa corrida que caberia no teto PRÓPRIO " +
        `(PIPELINE_TETO_USD_PREMIUM) — é a reprodução exata do incidente do BLOCO SEEDANCE-1: o motor ` +
        `Premium sob o teto do Normal recusa a própria etapa animar. Erro: ${JSON.stringify(premium.erro.slice(0, 200))}.`,
    );
  }

  // ---------------------------------------------------------------------------
  // G-T3 (continuação) — o CORPO do Seedance, campo a campo.
  // ---------------------------------------------------------------------------
  if (animarPremium) {
    const corpo = animarPremium.corpo;
    if (!Array.isArray(corpo.image_urls) || corpo.image_urls.length === 0) {
      failures.push(
        `tier: o corpo do Seedance não levou \`image_urls\` como lista não vazia — saiu ` +
          `${JSON.stringify(corpo.image_urls)}. O Seedance usa lista (MEDIDO por leitura do BLOCO ` +
          "SEEDANCE-1, revertido antes de commitar); mandar `image_url` singular (campo do Wan) é o " +
          "corpo do motor errado chegando ao motor certo.",
      );
    }
    if ("image_url" in corpo) {
      failures.push(
        `tier: o corpo do Seedance levou \`image_url\` (singular, campo do Wan) além de \`image_urls\` — ` +
          `saiu ${JSON.stringify(corpo)}. É o corpo do OUTRO motor vazando para este.`,
      );
    }
    if (!corpo.end_user_id) {
      failures.push(
        `tier: o corpo do Seedance saiu sem \`end_user_id\` — saiu ${JSON.stringify(corpo)}. É a ` +
          "identificação de conta B2B que este motor exige (MEDIDO por leitura do BLOCO SEEDANCE-1).",
      );
    }
    if (typeof corpo.duration !== "number") {
      failures.push(
        `tier: \`duration\` do Seedance saiu como ${JSON.stringify(corpo.duration)} (tipo ` +
          `${typeof corpo.duration}), e devia ser NÚMERO — o Seedance documenta uma faixa contínua ` +
          "(4-30), não o enum de string fechado do Wan (`\"5\"|\"10\"|\"15\"`).",
      );
    }
    if ("enable_prompt_expansion" in corpo || "multi_shots" in corpo) {
      failures.push(
        `tier: o corpo do Seedance levou \`enable_prompt_expansion\`/\`multi_shots\` — campos do Wan, ` +
          `sem equivalente conhecido no Seedance. Saiu: ${JSON.stringify(corpo)}.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-T4 — o formulário propaga o tier escolhido (por FORMA: o defeito é
  // AUSÊNCIA de uma linha, e ausência não se exercita chamando função).
  // ---------------------------------------------------------------------------
  const passoGerar = lerDaRaiz(PASSO_GERAR);
  if (!/tier_video:\s*wizard\.tierVideo/.test(passoGerar)) {
    failures.push(
      "tier: `tier_video` sumiu do corpo montado pela tela (`corpoDaGeracao`). O seletor continuaria " +
        "aparecendo e mudando de estado, e só o pedido é que nunca saberia — o mesmo defeito que " +
        "cenário, traje e legenda já tiveram.",
    );
  }

  // ---------------------------------------------------------------------------
  // G-T5 — a aprovação relê o tier da LINHA, dentro do mesmo recorte que
  // `checkFalSceneWiringPolicy` já usa para isolar a rota de aprovação da de
  // recomposição (âncora intrínseca — gotcha 6 do ESTADO.md).
  // ---------------------------------------------------------------------------
  const rota = lerDaRaiz(ROTA_DE_VIDEOS);
  const inicio = rota.indexOf('"/videos/:id/approve"');
  const fim = rota.indexOf('"/videos/:id/recompose"', inicio);
  if (inicio < 0 || fim < 0) {
    failures.push(
      `tier: não foi possível recortar a rota de aprovação em ${ROTA_DE_VIDEOS} pelas âncoras ` +
        '`"/videos/:id/approve"` e `"/videos/:id/recompose"`.',
    );
  } else {
    const trecho = rota.slice(inicio, fim);
    if (!trecho.includes("runFalPipelineDaImagem(")) {
      failures.push(
        "tier: o recorte da rota de aprovação não contém `runFalPipelineDaImagem(` — a âncora não " +
          "encontrou o trecho certo.",
      );
    } else if (!trecho.includes("tier: videoTierParaPipeline(video.tier_video)")) {
      failures.push(
        "tier: a rota de aprovação monta a retomada sem reler `video.tier_video` — sem isto, toda " +
          "aprovação anima pelo default (\"normal\"/Wan), e um vídeo Premium aprovado sairia pelo " +
          "motor errado sem nada reclamar.",
      );
    }
  }

  // Os dois idiomas — um seletor que só existe em português é um seletor
  // quebrado para metade do produto. Mesmo padrão de checkCaptionPolicy.ts.
  for (const idioma of ["pt-BR", "en"]) {
    const textos = JSON.parse(lerDaRaiz(`frontend/src/locales/${idioma}.json`)) as {
      createVideo?: { generate?: Record<string, unknown> };
    };
    const gerar = textos.createVideo?.generate ?? {};
    const tier = (gerar.tier ?? {}) as Record<string, unknown>;
    const tierHint = (gerar.tierHint ?? {}) as Record<string, unknown>;
    if (!gerar.tierLabel) failures.push(`tier: falta \`createVideo.generate.tierLabel\` em ${idioma}.json.`);
    for (const nivel of ["simples", "normal", "premium"]) {
      if (!tier[nivel]) failures.push(`tier: falta \`createVideo.generate.tier.${nivel}\` em ${idioma}.json.`);
      if (!tierHint[nivel]) failures.push(`tier: falta \`createVideo.generate.tierHint.${nivel}\` em ${idioma}.json.`);
    }
  }

  if (failures.length === 0) {
    notes.push(
      "  tier: normal anima pelo Wan e premium pelo Seedance, cada um sob o teto que é o seu " +
        `(premium: ${JSON.stringify(premium.erro.slice(0, 60))} — a corrida chegou à animação, morreu na ` +
        "narração simulada, não no teto); o corpo do Seedance leva image_urls/end_user_id/duration " +
        "numérico e nada do Wan; a tela e a aprovação propagam o tier escolhido.",
    );
  }

  return { failures, notes };
}
