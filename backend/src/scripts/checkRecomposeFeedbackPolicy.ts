/**
 * "REFAZER A IMAGEM" USA O FEEDBACK DE VERDADE — PRIORIDADE 2, 28/08/2026.
 *
 * ┌─ O defeito que isto fecha ────────────────────────────────────────────────┐
 * │ `POST /videos/:id/recompose` já capturava e PERSISTIA o texto de          │
 * │ feedback (`refazer_feedback`, migration 061), mas o prompt enviado à fal  │
 * │ continuava sendo `promptDaComposicaoDaLinha(video)` puro — a pessoa       │
 * │ escrevia o que precisava mudar, e a imagem nova saía pedida do mesmo      │
 * │ jeito de sempre, porque o texto só chegava ao banco, nunca ao fornecedor. │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  `promptDeComposicaoComFeedback(base, null)` devolve a base intacta —
 *       regressão de sempre (sem feedback, comportamento idêntico ao de
 *       antes desta rodada).
 *  G-2  `promptDeComposicaoComFeedback(base, feedback)` contém os DOIS
 *       textos — não substitui a base, incorpora o ajuste sobre ela.
 *  G-3  PONTA A PONTA: dois feedbacks DIFERENTES, através de `recompor()`
 *       de verdade (fetch substituído, zero rede), produzem dois corpos
 *       DIFERENTES no `prompt` enviado a `fal-ai/nano-banana-2/edit`, cada
 *       um contendo o seu próprio texto e nenhum o do outro.
 *  G-4  a rota `/recompose` de fato CHAMA `promptDeComposicaoComFeedback`
 *       com `refazerFeedback` — por FORMA: a função pode estar certa e a
 *       rota continuar chamando só `promptDaComposicaoDaLinha(video)`.
 *
 * Custo: ZERO. Nenhuma rede real, nenhum banco.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { promptDeComposicaoComFeedback } from "../services/providers/videoScene.js";
import { instalarFetch, criarDiario, type Submissao } from "./checkFalSceneWiringPolicy.js";

const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";
const VIDEO_SCENE = "backend/src/services/providers/videoScene.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "promptDeComposicaoComFeedback: sem feedback, a base sai intacta",
    name: "a base passa a levar um sufixo mesmo sem feedback",
    kind: "esperto",
    // ESPERTO: com feedback ausente, um sufixo fixo (vazio, mas presente)
    // faria toda composição sem "Refazer" ganhar um texto extra que nunca
    // existiu antes desta rodada — regressão silenciosa no caminho comum.
    file: VIDEO_SCENE,
    find: "  if (!feedbackLimpo) return promptBase;",
    replace: '  if (!feedbackLimpo) return `${promptBase}.`;',
    expect: "promptDeComposicaoComFeedback",
  },
  {
    guard: "promptDeComposicaoComFeedback: com feedback, os dois textos aparecem",
    name: "o feedback deixa de ser incorporado ao prompt",
    kind: "esperto",
    // ESPERTO: a função continua não-vazia e continua incluindo a base —
    // só o AJUSTE da pessoa desaparece, voltando ao defeito original.
    file: VIDEO_SCENE,
    find: '  return [promptBase, `Ajuste solicitado pela pessoa: ${feedbackLimpo}`].filter(Boolean).join(". ");',
    replace: "  return promptBase;",
    expect: "promptDeComposicaoComFeedback",
  },
  {
    guard: "/recompose chama promptDeComposicaoComFeedback com refazerFeedback",
    name: "a rota volta a montar o prompt sem o feedback",
    kind: "obvio",
    // ÓBVIO: sem a chamada, a função pode estar perfeita e nunca ser usada
    // pela rota — exatamente o defeito de origem desta prioridade.
    file: ROTA_DE_VIDEOS,
    find: "          promptDeComposicao: promptDeComposicaoComFeedback(promptDaComposicaoDaLinha(video), refazerFeedback),",
    replace: "          promptDeComposicao: promptDaComposicaoDaLinha(video),",
    expect: "/recompose não chama promptDeComposicaoComFeedback",
  },
];

export interface RecomposeFeedbackCheckResult {
  failures: string[];
  notes: string[];
}

const BASE_DA_PROVA = "consultorio claro e desfocado. jaleco branco abotoado";

async function submissaoDeComposicaoCom(promptDeComposicao: string): Promise<Submissao | undefined> {
  const { recompor } = await import("../services/video/falApproval.js");
  const estado = { submissoes: [] as Submissao[], publicados: [] as { rotulo: string; fileUrl: string }[] };
  const restaurarFetch = instalarFetch(estado);
  const modoOriginal = process.env.PROVIDER_MODE;
  try {
    process.env.PROVIDER_MODE = "live";
    await recompor({
      apiKeyFal: "chave-irrelevante-fetch-substituido",
      apiKeyElevenLabs: "chave-irrelevante-fetch-substituido",
      voiceId: "0hQuq0q2JEk1SY4lZaM9",
      script: "Roteiro curto da prova.",
      fotoBase: Buffer.alloc(0),
      fotoMimeType: "image/jpeg",
      promptDeComposicao,
      tenantId: "tenant-da-prova",
      promptDeDirecao: "direção da prova em inglês",
      diario: criarDiario(estado.publicados) as never,
    } as never);
  } catch {
    // A composição pode não terminar (o `pararApos: "compor"` interrompe
    // antes de qualquer outra etapa) — o que importa já foi capturado em
    // `estado.submissoes` antes disso.
  } finally {
    restaurarFetch();
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }
  return estado.submissoes.find((s) => s.endpoint.includes("nano-banana"));
}

export async function checkRecomposeFeedbackPolicy(repoRoot: string): Promise<RecomposeFeedbackCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1: sem feedback, base intacta ------------------------------------
  const semFeedback = promptDeComposicaoComFeedback(BASE_DA_PROVA, null);
  if (semFeedback !== BASE_DA_PROVA) {
    failures.push(
      `promptDeComposicaoComFeedback: sem feedback devolveu ${JSON.stringify(semFeedback)}, esperado a ` +
        `base intacta ${JSON.stringify(BASE_DA_PROVA)} — sem "Refazer" com texto, o comportamento tem ` +
        "de ser idêntico ao de antes desta rodada.",
    );
  }

  // --- G-2: com feedback, os dois textos aparecem -------------------------
  const feedbackA = "tire os óculos";
  const comFeedbackA = promptDeComposicaoComFeedback(BASE_DA_PROVA, feedbackA);
  if (!comFeedbackA.includes(BASE_DA_PROVA) || !comFeedbackA.includes(feedbackA)) {
    failures.push(
      `promptDeComposicaoComFeedback: com feedback devolveu ${JSON.stringify(comFeedbackA)}, esperado ` +
        `conter a base e o feedback ${JSON.stringify(feedbackA)} — o ajuste não pode substituir o que já ` +
        "existe, só se somar a ele.",
    );
  }

  // --- G-3: PONTA A PONTA — dois feedbacks, dois prompts DIFERENTES no fal
  const feedbackB = "fundo mais escuro";
  const [submissaoA, submissaoB] = await Promise.all([
    submissaoDeComposicaoCom(promptDeComposicaoComFeedback(BASE_DA_PROVA, feedbackA)),
    submissaoDeComposicaoCom(promptDeComposicaoComFeedback(BASE_DA_PROVA, feedbackB)),
  ]);

  if (!submissaoA || !submissaoB) {
    failures.push(
      "recompose: um dos dois feedbacks não produziu submissão nenhuma a fal-ai/nano-banana-2/edit — " +
        `A presente: ${Boolean(submissaoA)}, B presente: ${Boolean(submissaoB)}.`,
    );
  } else {
    const promptA = String(submissaoA.corpo.prompt ?? "");
    const promptB = String(submissaoB.corpo.prompt ?? "");
    if (promptA === promptB) {
      failures.push(
        "recompose: dois feedbacks DIFERENTES produziram o MESMO prompt enviado ao fornecedor — " +
          `${JSON.stringify(promptA)}. O texto digitado no "Refazer" não está chegando à composição.`,
      );
    }
    if (!promptA.includes(feedbackA) || promptA.includes(feedbackB)) {
      failures.push(
        `recompose: o prompt do feedback A não contém só o texto de A — saiu ${JSON.stringify(promptA)}.`,
      );
    }
    if (!promptB.includes(feedbackB) || promptB.includes(feedbackA)) {
      failures.push(
        `recompose: o prompt do feedback B não contém só o texto de B — saiu ${JSON.stringify(promptB)}.`,
      );
    }
  }

  // --- G-4: a rota de fato chama a função, por FORMA ----------------------
  const rotaSrc = readFileSync(path.join(repoRoot, ROTA_DE_VIDEOS), "utf8");
  if (!rotaSrc.includes("promptDeComposicaoComFeedback(promptDaComposicaoDaLinha(video), refazerFeedback)")) {
    failures.push(
      `recompose: ${ROTA_DE_VIDEOS} não chama promptDeComposicaoComFeedback(promptDaComposicaoDaLinha(video), ` +
        "refazerFeedback) — a função pode estar certa e a rota continuar montando o prompt sem o feedback.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      "    recompose: o feedback do \"Refazer\" incorpora-se ao prompt de composição (sem feedback, " +
        "comportamento idêntico ao de antes), e dois feedbacks distintos chegam DIFERENTES de verdade ao " +
        "`prompt` submetido a fal-ai/nano-banana-2/edit (execução real, routes/videos.ts → recompor)",
    );
  }

  return { failures, notes };
}
