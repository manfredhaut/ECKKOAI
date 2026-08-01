/**
 * Invariantes do teto de operações tarifadas.
 *
 * O defeito congelado aqui foi medido na primeira passada live: o teto conta
 * CLONAGEM DE VOZ e GERAÇÃO DE VÍDEO juntas, mas a mensagem dizia apenas
 * "1/1". Quem leu concluiu que havia tentado gerar vídeo duas vezes, quando na
 * verdade a primeira unidade tinha sido gasta pela voz, na tela anterior. O
 * resultado foi meia hora procurando defeito na HeyGen, que sequer havia sido
 * chamada.
 *
 * A verificação exercita o contador REAL e lê a mensagem REAL. Testar a
 * mensagem importa tanto quanto testar o número: o número já estava certo.
 */
import {
  LiveBudgetExhaustedError,
  consumeLiveGeneration,
  liveGenerationsConsumedBy,
  resetLiveGenerationCount,
} from "../services/providers/liveGuard.js";

export interface LiveBudgetCheckResult {
  failures: string[];
  notes: string[];
}

export function checkLiveBudgetPolicy(): LiveBudgetCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const env = { PROVIDER_LIVE_MAX_GENERATIONS: "1" } as unknown as NodeJS.ProcessEnv;

  resetLiveGenerationCount();
  try {
    // 1ª operação: a voz, como acontece ao configurar um avatar.
    const primeira = consumeLiveGeneration("clonagem de voz", env);
    if (!primeira.allowed) {
      failures.push("teto: a PRIMEIRA operação foi recusada com teto 1 — o contador começou sujo.");
    }

    // 2ª: o vídeo. Deve ser recusada.
    const segunda = consumeLiveGeneration("geração de vídeo", env);
    if (segunda.allowed) {
      failures.push(
        "teto: a segunda operação passou com PROVIDER_LIVE_MAX_GENERATIONS=1. " +
          "O teto deixou de proteger a carteira, que comporta cerca de um vídeo.",
      );
    }

    const msg = new LiveBudgetExhaustedError(segunda.used, segunda.max, "gerar vídeo").message;

    // A mensagem tem de dizer O QUE consumiu o teto. Sem isso ela nomeia o
    // limite mas não explica como ele acabou — que era exatamente o problema.
    if (!msg.includes("clonagem de voz")) {
      failures.push(
        `teto: a mensagem não diz que a CLONAGEM DE VOZ consumiu a cota. Recebida: "${msg}"`,
      );
    }
    // E tem de deixar claro que o limite é nosso, não do fornecedor.
    if (!/não é do fornecedor|DESTE aplicativo/i.test(msg)) {
      failures.push(`teto: a mensagem não deixa claro que o limite é DESTE aplicativo. Recebida: "${msg}"`);
    }
    // E como sair da situação.
    if (!msg.includes("PROVIDER_LIVE_MAX_GENERATIONS")) {
      failures.push(`teto: a mensagem não diz como aumentar o limite. Recebida: "${msg}"`);
    }

    const consumidas = liveGenerationsConsumedBy();
    if (consumidas.length !== 1 || consumidas[0] !== "clonagem de voz") {
      failures.push(
        `teto: o rastro do que consumiu ficou errado. Esperado ["clonagem de voz"], recebido ${JSON.stringify(consumidas)}.`,
      );
    }

    notes.push(
      "teto: com limite 1, a voz consome e o vídeo é recusado — e a mensagem nomeia a voz, o dono do limite e a saída",
    );
  } finally {
    // Deixar o contador sujo faria a próxima operação do processo ser recusada
    // sem motivo. O check não pode mudar o estado do que ele verifica.
    resetLiveGenerationCount();
  }

  return { failures, notes };
}

/**
 * O portão de avatar em treino continua no lugar.
 *
 * Textual, e não comportamental, de propósito: a prova comportamental exige
 * banco e sessão, e esta invariante é sobre uma linha existir. O que se barra
 * aqui é a remoção silenciosa — trocar a condição por `if (false)` durante uma
 * depuração e esquecer de voltar, que é literalmente como este bloco provou a
 * guarda.
 */
export async function checkAvatarTrainingGate(repoRoot: string): Promise<LiveBudgetCheckResult> {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const failures: string[] = [];
  const notes: string[] = [];

  const rel = "backend/src/routes/videos.ts";
  let source: string;
  try {
    source = await readFile(path.join(repoRoot, rel), "utf-8");
  } catch {
    failures.push(`portão de treino: não consegui ler ${rel} — verificador cego é pior que reprovar.`);
    return { failures, notes };
  }
  // Sem comentários: a guarda de chave de plataforma já reprovou o próprio
  // comentário que a explicava, duas vezes neste projeto.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

  if (!/provider_status\s*===\s*"processing"/.test(code)) {
    failures.push(
      `portão de treino: ${rel} não barra mais avatar com provider_status === "processing". ` +
        "Sem esse portão, gerar vídeo com avatar em treino chega ao fornecedor e falha lá — " +
        "depois de o avatar já ter sido cobrado.",
    );
  }
  if (!/avatar_still_training/.test(code)) {
    failures.push(
      `portão de treino: ${rel} não devolve mais o erro "avatar_still_training". ` +
        "A mensagem específica é o que distingue 'cedo demais' de 'falhou'.",
    );
  }

  notes.push("portão de treino: avatar em 'processing' continua barrado antes de chamar o fornecedor");
  return { failures, notes };
}
