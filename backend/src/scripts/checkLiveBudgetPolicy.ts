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
  LIVE_ATTEMPT_LIMIT_ENV,
  LiveBudgetExhaustedError,
  consumeLiveGeneration,
  liveGenerationAttempts,
  liveGenerationsConsumedBy,
  liveGenerationsUsed,
  resetLiveGenerationCount,
  withLiveBudget,
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
    find: `  return withLiveBudget("clonagem de voz", "clonar voz", async () => {`,
    replace: `  return (async (fn: () => Promise<CloneVoiceResult>) => fn())(async () => {`,
    expect: "não consome mais o teto",
  },
  {
    guard: "teto: a falha devolve o gasto",
    name: "a devolução some do caminho de erro",
    kind: "obvio",
    file: "backend/src/services/providers/liveGuard.ts",
    find: `    releaseLiveGeneration(operation, err instanceof Error ? \`\${err.name}: \${err.message}\` : String(err));`,
    replace: "",
    expect: "a falha NÃO devolveu o gasto",
  },
  {
    guard: "teto: a falha devolve o gasto",
    name: "devolve também no sucesso",
    kind: "esperto",
    // A falha continua devolvendo, exatamente como a asserção principal
    // exige — e o teto inteiro deixa de existir, porque nada mais retém uma
    // unidade. Só o CONTRAPONTO (o sucesso retém) distingue os dois casos.
    file: "backend/src/services/providers/liveGuard.ts",
    find: `    return await fn();`,
    replace: `    const r = await fn(); releaseLiveGeneration(operation, "sempre"); return r;`,
    expect: "o sucesso não reteve o gasto",
  },
  {
    guard: "teto: a tentativa não volta",
    name: "a devolução devolve a tentativa junto",
    kind: "esperto",
    // O mais importante dos três. O gasto volta certo, o sucesso retém, a
    // superfície inspecionada não muda — e a proteção contra laço morre em
    // silêncio: um caminho que falha sempre devolve tudo a cada volta e
    // dispara indefinidamente contra o fornecedor.
    file: "backend/src/services/providers/liveGuard.ts",
    find: `  used -= 1;`,
    replace: `  used -= 1;\n  attempted -= 1;`,
    expect: "a TENTATIVA não ficou contada",
  },
  {
    guard: "portão de treino",
    name: "portão removido",
    kind: "obvio",
    file: "backend/src/services/generationReadiness.ts",
    find: `} else if (avatar.provider_status === "processing") {`,
    replace: "} else if (false) {",
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
    replace: `} else if (avatar.provider_status === "unknown") {`,
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
    // Cobra `withLiveBudget`, e não `consumeLiveGeneration` solto: consumir
    // sem o wrapper compila, roda e parece certo — só deixa de devolver o
    // gasto na falha, que é o defeito inteiro deste bloco e não tem sintoma
    // até a terceira falha de uma passada live.
    const chamada = new RegExp(`withLiveBudget\\(\\s*["'\`]${alvo.operacao}["'\`]`);
    if (!chamada.test(code)) {
      failures.push(
        `teto: ${alvo.file} → ${alvo.fn}() não consome mais o teto por withLiveBudget() com a operação ` +
          `"${alvo.operacao}". O contador continuaria correto e a mensagem continuaria dizendo que o teto ` +
          "conta voz e vídeo juntas — verdade sobre o mecanismo, mentira sobre o sistema. Em live isso " +
          "libera uma chamada tarifada que a trava deveria ter barrado, ou retém um gasto que a falha " +
          "deveria ter devolvido.",
      );
    }
    if (/consumeLiveGeneration\(/.test(code)) {
      failures.push(
        `teto: ${alvo.file} chama consumeLiveGeneration() direto. Só as guardas podem fazer isso — ` +
          "num caminho tarifado, consumir sem o wrapper é consumir sem devolver na falha.",
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
 * A devolução do teto de GASTO na falha, exercitada de verdade.
 *
 * O defeito congelado aqui foi medido no bloco PREVOO-1 e corrigido depois: o
 * teto era consumido antes da chamada e nunca voltava, então DUAS falhas
 * esgotavam a cota de uma passada live sem nenhum vídeo ter saído — e a única
 * saída era reiniciar o backend, no meio da passada.
 *
 * Três asserções que puxam em direções opostas de propósito, porque uma
 * guarda que só verifica "a falha devolve" seria satisfeita por um código que
 * devolve sempre — inclusive no sucesso, o que desligaria o teto inteiro, e
 * por um que devolve a TENTATIVA junto, o que desligaria a proteção contra
 * laço. As três juntas não têm implementação trivial que passe.
 */
export async function checkLiveBudgetRelease(): Promise<LiveBudgetCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const envGasto = { PROVIDER_LIVE_MAX_GENERATIONS: "1" } as unknown as NodeJS.ProcessEnv;

  resetLiveGenerationCount();
  try {
    // --- 1. A falha devolve o GASTO e retém a TENTATIVA ------------------
    let subiu = false;
    try {
      await withLiveBudget(
        "geração de vídeo",
        "gerar vídeo",
        async () => {
          throw new Error("fornecedor recusou o payload");
        },
        envGasto,
      );
    } catch {
      subiu = true;
    }
    if (!subiu) {
      failures.push(
        "teto: withLiveBudget engoliu o erro da operação. Devolver o teto não pode transformar uma falha " +
          "de fornecedor em sucesso silencioso — quem chamou precisa saber que nada foi gerado.",
      );
    }
    if (liveGenerationsUsed() !== 0) {
      failures.push(
        `teto: a falha NÃO devolveu o gasto (used=${liveGenerationsUsed()}, esperado 0). ` +
          "Com o teto em 2, duas falhas voltam a esgotar a cota sem nenhum vídeo ter saído, e a única " +
          "saída passa a ser reiniciar o backend no meio da passada live.",
      );
    }
    if (liveGenerationAttempts() !== 1) {
      failures.push(
        `teto: a TENTATIVA não ficou contada (attempts=${liveGenerationAttempts()}, esperado 1). ` +
          "É ela que barra o laço depois que o gasto passou a ser devolvido; devolvida junto, um caminho " +
          "que falha sempre dispara para sempre.",
      );
    }

    // --- 2. Contraponto: o SUCESSO não devolve ---------------------------
    // O try/catch não é zelo defensivo: quando a devolução da asserção 1
    // está quebrada, o teto fica em 1/1 e ESTA operação é recusada. Sem
    // capturar, a exceção sobe, o gate morre com "falhou de forma
    // inesperada", e todas as falhas já acumuladas — inclusive a mensagem
    // que diagnostica o defeito — se perdem junto. Foi assim que o arnês
    // flagrou esta guarda como inerte: ela não reprovava, ela sumia.
    try {
      await withLiveBudget("clonagem de voz", "clonar voz", async () => "ok", envGasto);
    } catch (err) {
      failures.push(
        "teto: a operação seguinte a uma FALHA foi recusada, o que só acontece se o gasto não voltou. " +
          `Recebido: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (liveGenerationsUsed() !== 1) {
      failures.push(
        `teto: o sucesso não reteve o gasto (used=${liveGenerationsUsed()}, esperado 1). ` +
          "Devolver sempre desliga o teto por completo — a carteira comporta cerca de um vídeo.",
      );
    }

    // --- 3. Esgotado o gasto, a recusa é por spend_cap --------------------
    let recusaGasto: LiveBudgetExhaustedError | null = null;
    try {
      await withLiveBudget("geração de vídeo", "gerar vídeo", async () => "não deveria rodar", envGasto);
    } catch (err) {
      if (err instanceof LiveBudgetExhaustedError) recusaGasto = err;
    }
    if (!recusaGasto) {
      failures.push(
        "teto: com o gasto em 1/1, a operação seguinte passou. O teto de gasto deixou de proteger a carteira.",
      );
    } else if (recusaGasto.deniedBy !== "spend_cap") {
      failures.push(
        `teto: a recusa por gasto esgotado veio marcada como "${recusaGasto.deniedBy}". ` +
          "As duas travas têm saídas diferentes, e nomear a errada manda a pessoa mexer na variável errada.",
      );
    }
  } finally {
    resetLiveGenerationCount();
  }

  // --- 4. O teto de TENTATIVAS trava mesmo com o gasto todo devolvido ----
  // Este é o cenário que a devolução criou: gasto folgado (10), tudo falhando,
  // gasto voltando a cada falha. Sem o contador de tentativas, este laço não
  // pararia nunca.
  const envLaco = {
    PROVIDER_LIVE_MAX_GENERATIONS: "10",
    PROVIDER_LIVE_MAX_ATTEMPTS: "2",
  } as unknown as NodeJS.ProcessEnv;

  resetLiveGenerationCount();
  try {
    for (let i = 0; i < 2; i += 1) {
      try {
        await withLiveBudget(
          "geração de vídeo",
          "gerar vídeo",
          async () => {
            throw new Error("fornecedor recusou o payload");
          },
          envLaco,
        );
      } catch {
        /* esperado */
      }
    }
    if (liveGenerationsUsed() !== 0) {
      failures.push(
        `teto: depois de 2 falhas o gasto ficou em ${liveGenerationsUsed()}, esperado 0 — a devolução parou de funcionar no laço.`,
      );
    }

    let recusaLaco: LiveBudgetExhaustedError | null = null;
    try {
      await withLiveBudget("geração de vídeo", "gerar vídeo", async () => "não deveria rodar", envLaco);
    } catch (err) {
      if (err instanceof LiveBudgetExhaustedError) recusaLaco = err;
    }
    if (!recusaLaco) {
      failures.push(
        "teto: com 2 de 2 tentativas gastas em falhas, a terceira PASSOU. O gasto volta a cada falha, então " +
          "sem o teto de tentativas um caminho quebrado dispara indefinidamente contra o fornecedor.",
      );
    } else {
      if (recusaLaco.deniedBy !== "attempt_cap") {
        failures.push(
          `teto: a recusa por laço veio marcada como "${recusaLaco.deniedBy}", esperado "attempt_cap".`,
        );
      }
      if (!recusaLaco.message.includes(LIVE_ATTEMPT_LIMIT_ENV)) {
        failures.push(
          `teto: a mensagem de teto de tentativas não diz como aumentá-lo (${LIVE_ATTEMPT_LIMIT_ENV}). Recebida: "${recusaLaco.message}"`,
        );
      }
      // O diagnóstico é metade da mensagem: chegar aqui com gasto sobrando
      // significa que as chamadas estão FALHANDO, e aumentar o limite sem
      // olhar a falha só produz mais falhas.
      if (!/est(ã|a)o falhando/i.test(recusaLaco.message)) {
        failures.push(
          `teto: a mensagem de teto de tentativas não diagnostica que as chamadas estão falhando. Recebida: "${recusaLaco.message}"`,
        );
      }
    }
  } finally {
    resetLiveGenerationCount();
  }

  notes.push(
    "teto: falha devolve o GASTO e retém a TENTATIVA; sucesso retém as duas; e 2 falhas com gasto folgado " +
      "ainda barram a 3ª tentativa (o laço continua travado)",
  );
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

  // O portão mudou de casa na Fase 1-ter do bloco 5D: saiu de `routes/videos.ts`
  // e passou a viver no predicado ÚNICO que a rota e a tela consomem. A guarda
  // SEGUE a lógica em vez de continuar apontando para onde ela morava — uma
  // guarda que vigia o arquivo errado passa verde para sempre, e é a forma mais
  // barata de ficar inerte sem que ninguém note.
  const rel = "backend/src/services/generationReadiness.ts";
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
