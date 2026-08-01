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
import type { Mutant } from "./mutants.js";
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

export const MUTANTS: Mutant[] = [
  {
    guard: "teto: mensagem explica o consumo",
    name: "mensagem deixa de nomear o que consumiu",
    kind: "obvio",
    file: "backend/src/services/providers/liveGuard.ts",
    find: "`O que consumiu o teto, em ordem: ${consumedBy.length > 0 ? consumedBy.join(\" → \") : \"(nada registrado nesta sessão)\"}. ` +",
    replace: "",
    expect: "a mensagem não diz que a CLONAGEM DE VOZ consumiu a cota",
  },
  {
    guard: "teto: conta voz e vídeo juntas",
    name: "voz deixa de consumir o teto",
    kind: "esperto",
    file: "backend/src/services/providers/voiceProvider.ts",
    // O teto continua existindo, com o mesmo default, e a geração de vídeo
    // continua respeitando-o. Só a VOZ sai da conta — que é exatamente a
    // confusão que este bloco existe para impedir, e o número por si só
    // (1/1) continuaria parecendo certo.
    find: `  const budget = consumeLiveGeneration("clonagem de voz");`,
    replace: `  const budget = { allowed: true, used: 0, max: 1 };`,
    expect: "teto",
  },
  {
    guard: "portão de treino",
    name: "portão removido",
    kind: "obvio",
    file: "backend/src/routes/videos.ts",
    find: `if (avatar.provider_status === "processing") {`,
    replace: "if (false) {",
    expect: "não barra mais avatar com provider_status",
  },
  {
    guard: "portão de treino",
    name: "portão presente, comparando com valor que nunca ocorre",
    kind: "esperto",
    file: "backend/src/routes/videos.ts",
    // A condição continua lá, com a mesma forma. Só o valor comparado muda
    // para um que o normalizador nunca produz, então nada é barrado.
    find: `if (avatar.provider_status === "processing") {`,
    replace: `if (avatar.provider_status === "unknown") {`,
    expect: "não barra mais avatar com provider_status",
  },
];

/**
 * Quem PRECISA consumir o teto, e como se reconhece isso no fonte.
 *
 * Existe porque o arnês de mutação flagrou o buraco: as asserções abaixo
 * exercitam `consumeLiveGeneration` diretamente, então continuavam verdes
 * quando `cloneVoice` deixava de chamá-la. O contador seguia perfeito e o
 * sistema, desprotegido — e a mensagem continuava afirmando que o teto conta
 * voz e vídeo juntas.
 */
const CHAMADORES_DO_TETO: { file: string; fn: string; operacao: string }[] = [
  {
    file: "backend/src/services/providers/voiceProvider.ts",
    fn: "cloneVoice",
    operacao: "clonagem de voz",
  },
  {
    file: "backend/src/services/providers/avatarProvider.ts",
    fn: "generateVideo",
    operacao: "geração de vídeo",
  },
];

export async function checkLiveBudgetCallers(repoRoot: string): Promise<LiveBudgetCheckResult> {
  const { readFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const failures: string[] = [];
  const notes: string[] = [];

  for (const alvo of CHAMADORES_DO_TETO) {
    let source: string;
    try {
      source = await readFile(path.join(repoRoot, alvo.file), "utf-8");
    } catch {
      failures.push(`teto: não consegui ler ${alvo.file} — verificador cego é pior que reprovar.`);
      continue;
    }
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
    const chamada = new RegExp(`consumeLiveGeneration\\(\\s*["'\`]${alvo.operacao}["'\`]`);
    if (!chamada.test(code)) {
      failures.push(
        `teto: ${alvo.file} → ${alvo.fn}() não consome mais o teto com a operação "${alvo.operacao}". ` +
          "O contador continuaria correto e a mensagem continuaria dizendo que o teto conta voz e vídeo " +
          "juntas — verdade sobre o mecanismo, mentira sobre o sistema. Em live isso libera uma chamada " +
          "tarifada que a trava deveria ter barrado.",
      );
    }
  }

  notes.push(
    `teto: ${CHAMADORES_DO_TETO.length} caminho(s) tarifado(s) confirmado(s) consumindo o teto (${CHAMADORES_DO_TETO.map((c) => c.operacao).join(", ")})`,
  );
  return { failures, notes };
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

    // Provado pelo arnês de mutação (bloco GUARDAS-1): tudo acima exercita
    // `consumeLiveGeneration` DIRETAMENTE, e por isso continuava verde quando
    // `cloneVoice` deixava de chamá-la. A mensagem seguia dizendo que o teto
    // conta voz e vídeo juntas — verdade sobre o contador, mentira sobre o
    // sistema. Testar o mecanismo não é testar quem o usa.
    void 0;
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
