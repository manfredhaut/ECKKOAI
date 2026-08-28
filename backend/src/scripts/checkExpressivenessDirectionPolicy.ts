/**
 * EXPRESSIVIDADE NO PROMPT DE DIREÇÃO (Wan/Seedance) — BLOCO
 * EXPRESSIVIDADE-FAL, 28/08/2026.
 *
 * ┌─ O que faltava, em uma frase ─────────────────────────────────────────────┐
 * │ `expressiveness` só chegava ao fornecedor pelo caminho HeyGen             │
 * │ (`buildHeygenVideoPayload`, condicional a `avatar_iv`). No tier           │
 * │ Normal/Premium o campo era coletado, persistido e morria — o mesmo        │
 * │ defeito de FORMA que Cenário/Traje já tiveram antes de ganhar transporte. │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  os 3 níveis (low/medium/high) produzem 3 frases de Expressividade
 *       DIFERENTES entre si, por execução direta de `expressividadeParaDirecao`.
 *  G-2  `direcaoComExpressividade` junta a Interpretação da pessoa com a
 *       frase de Expressividade — as duas aparecem no resultado.
 *  G-3  PONTA A PONTA: os 3 níveis, submetidos de verdade via
 *       `runFalPipelineDaImagem` (fetch substituído, zero rede), produzem 3
 *       corpos DIFERENTES no `prompt` enviado ao Wan — cada um contendo a
 *       frase do seu próprio nível e NENHUMA das outras duas.
 *
 * Reusa `instalarFetch`/`criarDiario` de `checkFalSceneWiringPolicy.ts` — a
 * MESMA simulação de fornecedor que já mede a direção chegando ao Wan,
 * evitando uma segunda cópia divergente do `fetch` substituído.
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco.
 */
import type { Mutant } from "./mutants.js";
import { expressividadeParaDirecao, direcaoComExpressividade } from "../services/providers/videoScene.js";
import { instalarFetch, criarDiario, type Submissao } from "./checkFalSceneWiringPolicy.js";

const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";
const VIDEO_SCENE = "backend/src/services/providers/videoScene.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "expressividadeParaDirecao: os 3 níveis produzem frases diferentes",
    name: "os 3 níveis passam a produzir a mesma frase",
    kind: "esperto",
    // ESPERTO: a função continua devolvendo string não-vazia para os 3
    // níveis (nenhum `tsc` acusa, nenhum "campo vazio" dispara) — só que
    // sempre a MESMA frase, então o motor de animação nunca sabe qual nível
    // foi escolhido.
    file: VIDEO_SCENE,
    find:
      '  if (nivel === "low") return "subtle, restrained facial expressiveness, minimal emotion in delivery";\n' +
      '  if (nivel === "medium") return "natural, moderate facial expressiveness";\n' +
      '  if (nivel === "high") return "highly expressive, animated facial expressions and emotive delivery";\n',
    replace: '  if (nivel === "low" || nivel === "medium" || nivel === "high") return "natural expressiveness";\n',
    // MEDIDO ao aplicar este mutante à mão (28/08): a mensagem real do G-1 diz
    // "produziram N frase(s) única(s) — esperado 3", não "a MESMA frase".
    expect: "os 3 níveis produziram 1 frase(s) única(s) — esperado 3",
  },
  {
    guard: "direcaoComExpressividade: a Interpretação da pessoa não é descartada",
    name: "a função passa a devolver só a Expressividade",
    kind: "esperto",
    // ESPERTO: o resultado continua não-vazio quando há Expressividade
    // escolhida (o caso comum, já que a tela nasce com um chip selecionado)
    // — só que a Interpretação que a PESSOA escreveu desaparece em silêncio.
    file: VIDEO_SCENE,
    find: "  return [motionPrompt.trim(), expressividadeParaDirecao(expressiveness)].filter(Boolean).join(\". \");",
    replace: "  return expressividadeParaDirecao(expressiveness);",
    // MEDIDO ao aplicar este mutante à mão (28/08): a mensagem real do G-2 diz
    // "descartou a Interpretação da pessoa — saiu ...", não "não chegou ao
    // prompt final".
    expect: "descartou a Interpretação da pessoa",
  },
];

export interface ExpressivenessDirectionCheckResult {
  failures: string[];
  notes: string[];
}

const NIVEIS = ["low", "medium", "high"] as const;
const MOTION_PROMPT_DA_PROVA = "speak calmly to camera";

export async function checkExpressivenessDirectionPolicy(): Promise<ExpressivenessDirectionCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1: os 3 níveis, frases diferentes -----------------------------
  const frases = NIVEIS.map((n) => expressividadeParaDirecao(n));
  const frasesUnicas = new Set(frases);
  if (frasesUnicas.size !== NIVEIS.length) {
    failures.push(
      `expressividade: os 3 níveis produziram ${frasesUnicas.size} frase(s) única(s) — esperado 3. ` +
        `Frases: ${JSON.stringify(frases)}.`,
    );
  }
  if (frases.some((f) => !f)) {
    failures.push(`expressividade: algum nível produziu frase vazia — ${JSON.stringify(frases)}.`);
  }

  // --- G-2: a Interpretação da pessoa sobrevive na junção -----------------
  const direcaoMedia = direcaoComExpressividade(MOTION_PROMPT_DA_PROVA, "medium");
  if (!direcaoMedia.includes(MOTION_PROMPT_DA_PROVA)) {
    failures.push(
      `expressividade: direcaoComExpressividade() descartou a Interpretação da pessoa — saiu ` +
        `${JSON.stringify(direcaoMedia)}, esperado conter ${JSON.stringify(MOTION_PROMPT_DA_PROVA)}.`,
    );
  }
  if (!direcaoMedia.includes(expressividadeParaDirecao("medium"))) {
    failures.push(
      `expressividade: direcaoComExpressividade() não incluiu a frase do nível "medium" — saiu ` +
        `${JSON.stringify(direcaoMedia)}.`,
    );
  }

  // --- G-3: PONTA A PONTA — os 3 níveis chegam DIFERENTES ao Wan de verdade
  const { runFalPipelineDaImagem } = await import("../services/video/falPipeline.js");
  const promptsNoWan: Record<string, string> = {};
  for (const nivel of NIVEIS) {
    const estado = { submissoes: [] as Submissao[], publicados: [] as { rotulo: string; fileUrl: string }[] };
    const restaurarFetch = instalarFetch(estado);
    const modoOriginal = process.env.PROVIDER_MODE;
    try {
      process.env.PROVIDER_MODE = "live";
      await runFalPipelineDaImagem(
        {
          apiKeyFal: "chave-irrelevante-fetch-substituido",
          apiKeyElevenLabs: "chave-irrelevante-fetch-substituido",
          voiceId: "0hQuq0q2JEk1SY4lZaM9",
          script: "Roteiro curto da prova.",
          fotoBase: Buffer.alloc(0),
          fotoMimeType: "image/jpeg",
          promptDeComposicao: "consultorio claro",
          tenantId: "tenant-da-prova",
          promptDeDirecao: direcaoComExpressividade(MOTION_PROMPT_DA_PROVA, nivel),
          diario: criarDiario(estado.publicados) as never,
          pararApos: "animar",
        } as never,
        "https://v3b.fal.media/imagem-aprovada.png",
        "req-da-composicao",
      );
    } catch {
      // A corrida pode lançar depois de submeter (ex.: poll simulado) — o
      // que importa aqui já foi capturado em `estado.submissoes` antes disso.
    } finally {
      restaurarFetch();
      if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
      else process.env.PROVIDER_MODE = modoOriginal;
    }

    const animar = estado.submissoes.find((s) => s.endpoint.includes("wan"));
    if (!animar) {
      failures.push(`expressividade: nível "${nivel}" não produziu submissão nenhuma ao Wan.`);
      continue;
    }
    promptsNoWan[nivel] = String(animar.corpo.prompt ?? "");
  }

  const valoresSubmetidos = Object.values(promptsNoWan);
  if (valoresSubmetidos.length === NIVEIS.length) {
    const unicos = new Set(valoresSubmetidos);
    if (unicos.size !== NIVEIS.length) {
      failures.push(
        `expressividade: os 3 níveis produziram ${unicos.size} prompt(s) único(s) no corpo real enviado ` +
          `ao Wan — esperado 3. Prompts: ${JSON.stringify(promptsNoWan)}.`,
      );
    } else {
      for (const nivel of NIVEIS) {
        const fraseDoNivel = expressividadeParaDirecao(nivel);
        if (!promptsNoWan[nivel].includes(fraseDoNivel)) {
          failures.push(
            `expressividade: o prompt submetido para o nível "${nivel}" não contém a frase esperada ` +
              `(${JSON.stringify(fraseDoNivel)}) — saiu ${JSON.stringify(promptsNoWan[nivel])}.`,
          );
        }
        for (const outro of NIVEIS) {
          if (outro === nivel) continue;
          const fraseDoOutro = expressividadeParaDirecao(outro);
          if (promptsNoWan[nivel].includes(fraseDoOutro)) {
            failures.push(
              `expressividade: o prompt do nível "${nivel}" contém a frase do nível "${outro}" — os dois ` +
                "se misturaram no corpo enviado ao Wan.",
            );
          }
        }
      }
    }
  }

  if (failures.length === 0) {
    notes.push(
      `    expressividade: low/medium/high produzem 3 frases distintas, sobrevivem à junção com a ` +
        `Interpretação, e chegam DIFERENTES de verdade ao \`prompt\` submetido ao Wan (execução real, ` +
        `${ROTA_DE_VIDEOS} → runFalPipelineDaImagem)`,
    );
  }

  return { failures, notes };
}
