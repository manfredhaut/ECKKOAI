/**
 * FASE 0 — as correções da POC de composição por frações (fora deste
 * repositório, 21/08: câmera fixa, gesto contido, mão longe do rosto) mais
 * a de plano único (RODADA 6, item 5, 30/08) chegam SEMPRE ao prompt que
 * o fornecedor recebe.
 *
 * ⚠️ ITEM 3, RODADA 6 (30/08/2026): a regra de atenuação de pele
 * (`COMPOSICAO_PELE_ATENUACAO_LEVE`) foi REMOVIDA de `falPipeline.ts` —
 * contradizia `NEGATIVE_PROMPT_ANIMAR_WAN` ("plastic skin, waxy skin") no
 * mesmo vídeo. As checagens dela saíram desta guarda junto; composição não
 * tem mais regra de Fase 0 nenhuma.
 *
 * ⚠️ ITEM 5, RODADA 6 (30/08/2026): `DIRECAO_PLANO_UNICO` ("single
 * continuous shot, one person, full frame, no split screen") entrou na
 * lista de direção — DEFEITO MEDIDO: o quadro bruto do bloco 2 de uma
 * corrida real de 3 blocos saiu como tríptico (três painéis verticais da
 * mesma pessoa), direto do Wan.
 *
 * ┌─ Por que "sempre", e por que isso não pode viver no CALL SITE ───────────┐
 * │ A regra não é "some ao que a pessoa escreveu" — é "esteja lá mesmo que a │
 * │ pessoa não tenha escrito nada". Depender de cada call site lembrar de     │
 * │ concatenar reproduziria o defeito que este projeto já pagou: cenário e   │
 * │ traje foram coletados por semanas e morriam no call site (ver o          │
 * │ cabeçalho de `videoScene.ts`). Por isso as três frases vivem em UM        │
 * │ lugar só (`comDefaultsDeDirecao`, `falPipeline.ts`) — o ponto por onde    │
 * │ os dois caminhos de produto (criação e retomada pós-aprovação) e a       │
 * │ sonda convergem antes da chamada paga.                                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ANCORADA NO USO, como `checkFalSceneWiringPolicy` ──────────────────────┐
 * │ Não confere código lendo variável: lê o CORPO submetido à fal com o       │
 * │ `fetch` substituído, reusando a mesma corrida real (`corridaDeAnimacao`)  │
 * │ daquela guarda — um texto concatenado e nunca enviado é indistinguível    │
 * │ de um texto nunca concatenado do ponto de vista do fornecedor.            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Uma conferência A MAIS, por execução DIRETA da função (sem rede
 * nenhuma): que as frases aparecem mesmo com o texto da pessoa VAZIO — a
 * corrida acima sempre manda texto não vazio (a Interpretação da prova), e
 * isso sozinho não provaria o "SEMPRE" que a Fase 0 pede.
 *
 * Custo: ZERO. Mesma simulação de fornecedor de `checkFalSceneWiringPolicy`
 * (nenhuma rede real, nenhum banco, nenhuma espera).
 */
import { corridaDeAnimacao } from "./checkFalSceneWiringPolicy.js";
import {
  DIRECAO_CAMERA_FIXA,
  DIRECAO_GESTOS_CONTIDOS,
  DIRECAO_MAO_NAO_CRUZA_ROSTO,
  DIRECAO_PLANO_UNICO,
  comDefaultsDeDirecao,
} from "../services/video/falPipeline.js";
import type { Mutant } from "./mutants.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "câmera fixa, gesto contido, mão longe do rosto e plano único chegam SEMPRE ao prompt da animação",
    name: "as quatro regras fixas de vídeo deixam de ir à animação",
    kind: "obvio",
    // REESCRITO na migração para `reference-to-video/flash` (item 2, 29/08):
    // `prompt` virou um template multi-linha com o rótulo "Character1:" na
    // frente — ver `checkFalSceneWiringPolicy.ts` para a mesma âncora usada
    // do outro lado.
    file: PIPELINE,
    find: "    // FASE 0 — câmera fixa, gesto contido, mão longe do rosto: SEMPRE, mesmo\n" +
      "    // sem Interpretação nenhuma escrita. Ver `comDefaultsDeDirecao`.\n" +
      "    prompt:\n" +
      "      `Character1: ${comDefaultsDeDirecao(direcaoDoBloco)} Keep Character1's face, outfit and the scene ` +",
    replace:
      "    prompt:\n" +
      "      `Character1: ${direcaoDoBloco} Keep Character1's face, outfit and the scene ` +",
    expect: "fase 0: a animação enviada à fal não leva as regras fixas de câmera/gesto/mão/plano",
  },
];

export interface FalFase0DefaultsCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkFalFase0DefaultsPolicy(): Promise<FalFase0DefaultsCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // 1. A função pura: a regra vale mesmo com texto da pessoa VAZIO — é a
  //    diferença entre "complemento de instrução" e "default de sistema".
  // ---------------------------------------------------------------------------
  const direcaoVazia = comDefaultsDeDirecao("");
  for (const [frase, rotulo] of [
    [DIRECAO_CAMERA_FIXA, "câmera fixa"],
    [DIRECAO_GESTOS_CONTIDOS, "gesto contido"],
    [DIRECAO_MAO_NAO_CRUZA_ROSTO, "mão longe do rosto"],
    [DIRECAO_PLANO_UNICO, "plano único"],
  ] as const) {
    if (!direcaoVazia.includes(frase)) {
      failures.push(
        `fase 0: \`comDefaultsDeDirecao("")\` não contém a regra de ${rotulo} — a regra deixou de ser ` +
          `default de sistema. Saiu: ${JSON.stringify(direcaoVazia)}.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. O corpo REAL submetido à fal, pela corrida de animação de
  //    `checkFalSceneWiringPolicy` — a mesma simulação, para não medir um
  //    payload que o produto não manda. Composição não tem mais regra de
  //    Fase 0 nenhuma desde o ITEM 3 da RODADA 6 (30/08/2026) — nada a
  //    conferir em `corridaDeComposicao()` aqui.
  // ---------------------------------------------------------------------------
  const animacao = await corridaDeAnimacao();
  const animar = animacao.submissoes.find((s) => s.endpoint.includes("wan"));
  if (!animar) {
    failures.push(
      "fase 0: nenhuma submissão ao motor de animação saiu, então não há corpo em que conferir as regras " +
        `fixas de câmera/gesto/mão. Endpoints observados: ${animacao.submissoes.map((s) => s.endpoint).join(", ") || "(nenhum)"}.`,
    );
  } else {
    const prompt = String(animar.corpo.prompt ?? "");
    const faltando = [
      [DIRECAO_CAMERA_FIXA, "câmera fixa"],
      [DIRECAO_GESTOS_CONTIDOS, "gesto contido"],
      [DIRECAO_MAO_NAO_CRUZA_ROSTO, "mão longe do rosto"],
      [DIRECAO_PLANO_UNICO, "plano único"],
    ].filter(([frase]) => !prompt.includes(frase as string));
    if (faltando.length > 0) {
      failures.push(
        "fase 0: a animação enviada à fal não leva as regras fixas de câmera/gesto/mão/plano — faltando " +
          `${faltando.map(([, rotulo]) => rotulo).join(", ")}. O \`prompt\` saiu ${JSON.stringify(prompt)}. ` +
          "Sem elas, o defeito medido na POC (mão cruzando o rosto, câmera derivando) ou o tríptico medido " +
          "na RODADA 6 (item 1) voltam a acontecer, e dependem de o produto quem escreveu a Interpretação " +
          "saber pedir isso — que é exatamente o que a Fase 0 existe para não depender.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "    fase 0: as 4 regras fixas de direção (câmera, gesto, mão, plano único) chegam ao prompt de " +
        "animação enviado ao Wan, inclusive com o texto da pessoa vazio — a atenuação de pele foi removida " +
        "(ITEM 3, RODADA 6, 30/08/2026)",
    );
  }

  return { failures, notes };
}
