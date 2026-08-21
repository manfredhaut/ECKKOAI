/**
 * FASE 0 — as quatro correções da POC de composição por frações (fora deste
 * repositório, 21/08: câmera fixa, gesto contido, mão longe do rosto, pele
 * com atenuação leve) chegam SEMPRE ao prompt que o fornecedor recebe.
 *
 * ┌─ Por que "sempre", e por que isso não pode viver no CALL SITE ───────────┐
 * │ A regra não é "some ao que a pessoa escreveu" — é "esteja lá mesmo que a │
 * │ pessoa não tenha escrito nada". Depender de cada call site lembrar de     │
 * │ concatenar reproduziria o defeito que este projeto já pagou: cenário e   │
 * │ traje foram coletados por semanas e morriam no call site (ver o          │
 * │ cabeçalho de `videoScene.ts`). Por isso as quatro frases vivem em UM      │
 * │ lugar só (`comDefaultsDeComposicao`/`comDefaultsDeDirecao`,               │
 * │ `falPipeline.ts`) — o ponto por onde os dois caminhos de produto          │
 * │ (criação e retomada pós-aprovação) e a sonda convergem antes da chamada  │
 * │ paga.                                                                     │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ANCORADA NO USO, como `checkFalSceneWiringPolicy` ──────────────────────┐
 * │ Não confere código lendo variável: lê o CORPO submetido à fal com o       │
 * │ `fetch` substituído, reusando as mesmas duas corridas reais              │
 * │ (`corridaDeComposicao`, `corridaDeAnimacao`) daquela guarda — um texto    │
 * │ concatenado e nunca enviado é indistinguível de um texto nunca            │
 * │ concatenado do ponto de vista do fornecedor.                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Duas conferências A MAIS, por execução DIRETA das funções (sem rede
 * nenhuma): que as frases aparecem mesmo com o texto da pessoa VAZIO — as
 * duas corridas acima sempre mandam texto não vazio (`scenarioPrompt`,
 * `outfitPrompt`, a Interpretação da prova), e isso sozinho não provaria o
 * "SEMPRE" que a Fase 0 pede.
 *
 * Custo: ZERO. Mesma simulação de fornecedor de `checkFalSceneWiringPolicy`
 * (nenhuma rede real, nenhum banco, nenhuma espera).
 */
import {
  corridaDeAnimacao,
  corridaDeComposicao,
} from "./checkFalSceneWiringPolicy.js";
import {
  COMPOSICAO_PELE_ATENUACAO_LEVE,
  DIRECAO_CAMERA_FIXA,
  DIRECAO_GESTOS_CONTIDOS,
  DIRECAO_MAO_NAO_CRUZA_ROSTO,
  comDefaultsDeComposicao,
  comDefaultsDeDirecao,
} from "../services/video/falPipeline.js";
import type { Mutant } from "./mutants.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "a atenuação de pele chega SEMPRE ao prompt da composição enviada à fal",
    name: "a atenuação de pele deixa de ir à composição",
    kind: "obvio",
    file: PIPELINE,
    find: "    // FASE 0 — a atenuação de pele vai SEMPRE, mesmo sem traje/cenário por\n" +
      "    // texto. Ver `comDefaultsDeComposicao`.\n" +
      "    prompt: comDefaultsDeComposicao(input.promptDeComposicao),",
    replace: "    prompt: input.promptDeComposicao,",
    expect: "fase 0: a composição enviada à fal não leva a atenuação de pele",
  },
  {
    guard: "câmera fixa, gesto contido e mão longe do rosto chegam SEMPRE ao prompt da animação",
    name: "as três regras fixas de vídeo deixam de ir à animação",
    kind: "obvio",
    file: PIPELINE,
    find: "    // FASE 0 — câmera fixa, gesto contido, mão longe do rosto: SEMPRE, mesmo\n" +
      "    // sem Interpretação nenhuma escrita. Ver `comDefaultsDeDirecao`.\n" +
      "    prompt: comDefaultsDeDirecao(input.promptDeDirecao),",
    replace: "    prompt: input.promptDeDirecao,",
    expect: "fase 0: a animação enviada à fal não leva as regras fixas de câmera/gesto/mão",
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
  // 1. As duas funções puras: a regra vale mesmo com texto da pessoa VAZIO —
  //    é a diferença entre "complemento de instrução" e "default de sistema".
  // ---------------------------------------------------------------------------
  const composicaoVazia = comDefaultsDeComposicao("");
  if (!composicaoVazia.includes(COMPOSICAO_PELE_ATENUACAO_LEVE)) {
    failures.push(
      "fase 0: `comDefaultsDeComposicao(\"\")` não contém a atenuação de pele — a regra deixou de ser " +
        `default de sistema e passou a depender de a pessoa ter escrito algo. Saiu: ${JSON.stringify(composicaoVazia)}.`,
    );
  }
  const direcaoVazia = comDefaultsDeDirecao("");
  for (const [frase, rotulo] of [
    [DIRECAO_CAMERA_FIXA, "câmera fixa"],
    [DIRECAO_GESTOS_CONTIDOS, "gesto contido"],
    [DIRECAO_MAO_NAO_CRUZA_ROSTO, "mão longe do rosto"],
  ] as const) {
    if (!direcaoVazia.includes(frase)) {
      failures.push(
        `fase 0: \`comDefaultsDeDirecao("")\` não contém a regra de ${rotulo} — a regra deixou de ser ` +
          `default de sistema. Saiu: ${JSON.stringify(direcaoVazia)}.`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 2. O corpo REAL submetido à fal, pelas duas corridas de
  //    `checkFalSceneWiringPolicy` — a mesma simulação, para não medir um
  //    payload que o produto não manda.
  // ---------------------------------------------------------------------------
  const criacao = await corridaDeComposicao();
  if (criacao.erro.includes("ENOENT")) {
    // Mesmo gotcha do arquivo vizinho: sem `uploads/.gitkeep` a ponte morre
    // antes de montar corpo nenhum, e isto NÃO é defeito da Fase 0.
    failures.push(
      "fase 0: o arquivo de prova `uploads/.gitkeep` não existe, e sem ele a ponte morre no `readUpload` " +
        `antes de qualquer submissão (${JSON.stringify(criacao.erro.slice(0, 120))}). Isto é o ambiente da ` +
        "guarda, não a Fase 0 — restaure o arquivo (`.gitignore` tem `!uploads/.gitkeep`).",
    );
  } else {
    const composicao = criacao.submissoes.find((s) => s.endpoint.includes("nano-banana"));
    if (!composicao) {
      failures.push(
        "fase 0: nenhuma submissão de composição saiu, então não há corpo em que conferir a atenuação de " +
          `pele. Endpoints observados: ${criacao.submissoes.map((s) => s.endpoint).join(", ") || "(nenhum)"}.`,
      );
    } else {
      const prompt = String(composicao.corpo.prompt ?? "");
      if (!prompt.includes(COMPOSICAO_PELE_ATENUACAO_LEVE)) {
        failures.push(
          `fase 0: a composição enviada à fal não leva a atenuação de pele — o \`prompt\` saiu ` +
            `${JSON.stringify(prompt)} e devia terminar com ${JSON.stringify(COMPOSICAO_PELE_ATENUACAO_LEVE)}. ` +
            "Sem ela, a regra medida na POC de frações (rugas atenuadas de leve) não chega a nenhuma imagem " +
            "composta, e ninguém precisou tocar em código de motor para isso acontecer.",
        );
      }
    }
  }

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
    ].filter(([frase]) => !prompt.includes(frase as string));
    if (faltando.length > 0) {
      failures.push(
        "fase 0: a animação enviada à fal não leva as regras fixas de câmera/gesto/mão — faltando " +
          `${faltando.map(([, rotulo]) => rotulo).join(", ")}. O \`prompt\` saiu ${JSON.stringify(prompt)}. ` +
          "Sem elas, o defeito medido na POC (mão cruzando o rosto, câmera derivando) volta a acontecer, " +
          "e depende de o produto quem escreveu a Interpretação saber pedir isso — que é exatamente o que " +
          "a Fase 0 existe para não depender.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "    fase 0: as 4 regras fixas (pele, câmera, gesto, mão) chegam ao prompt enviado à fal em ambos " +
        "os motores, inclusive com o texto da pessoa vazio",
    );
  }

  return { failures, notes };
}
