// Single source of truth for how long a generated script should be.
//
// The product sells "a 30-second video", but nothing in the pipeline ever
// enforced that: videos.duration_seconds is written to the database and used
// as a cost proxy, and is never sent to HeyGen or to ElevenLabs. The real
// duration is a consequence of one thing only — how many words the script
// has, spoken at the cloned voice's pace. So that is what gets controlled.
//
// Everything here is derived from three numbers. Changing the target from 30s
// to 60s or 90s means editing TARGET_SECONDS (or setting SCRIPT_TARGET_SECONDS
// in the environment) and nothing else: the word target, the acceptance band
// and the wording of the prompt all follow from it.

const envNumber = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const SCRIPT_DURATION = {
  /** Duração-alvo do roteiro falado, em segundos. */
  targetSeconds: envNumber("SCRIPT_TARGET_SECONDS", 30),

  /**
   * Ritmo de fala, em palavras por minuto. Locução de vídeo em pt-BR fica
   * tipicamente entre 130 e 160; 140 é o meio-termo com que começamos.
   *
   * Este é o número mais chutado dos três, e é de propósito que a duração
   * real do áudio devolvido pelo ElevenLabs é registrada a cada geração
   * (logScriptDuration abaixo): é com esse dado, e não com opinião, que este
   * valor deve ser corrigido depois de algumas dezenas de vídeos.
   */
  wordsPerMinute: envNumber("SCRIPT_WORDS_PER_MINUTE", 140),

  /**
   * Banda de aceitação em torno do alvo de palavras. ±20% num alvo de 30s dá
   * algo entre ~24s e ~36s — folga suficiente para o modelo terminar a frase
   * sem que valha gastar uma segunda chamada ao vendor, que é cara e, na cota
   * gratuita atual, escassa.
   */
  tolerance: envNumber("SCRIPT_DURATION_TOLERANCE", 0.2),
} as const;

/** Alvo de palavras — derivado, nunca escrito à mão. */
export function targetWords(seconds: number = SCRIPT_DURATION.targetSeconds): number {
  return Math.round((seconds / 60) * SCRIPT_DURATION.wordsPerMinute);
}

/** Faixa aceitável de palavras para uma duração-alvo. */
export function wordBand(seconds: number = SCRIPT_DURATION.targetSeconds): {
  min: number;
  max: number;
} {
  const target = targetWords(seconds);
  return {
    min: Math.floor(target * (1 - SCRIPT_DURATION.tolerance)),
    max: Math.ceil(target * (1 + SCRIPT_DURATION.tolerance)),
  };
}

/** Duração estimada, em segundos, para uma contagem de palavras. */
export function estimateSeconds(words: number): number {
  return Number(((words / SCRIPT_DURATION.wordsPerMinute) * 60).toFixed(1));
}

/**
 * Conta palavras da forma mais próxima possível do que a voz vai pronunciar:
 * separadores de espaço, descartando tokens que não têm nenhuma letra ou
 * dígito (travessões e bullets soltos, que o TTS não fala).
 */
export function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

/**
 * Corte determinístico, sempre em fim de frase — nunca no meio. Usado só
 * quando o modelo já teve sua segunda chance e ainda voltou longo demais:
 * cortar no meio de uma frase produziria um vídeo que termina com a pessoa
 * falando pela metade, que é pior que um vídeo alguns segundos mais curto.
 *
 * Se nem a primeira frase couber no limite, ela é mantida inteira: um roteiro
 * um pouco longo é melhor que um roteiro vazio.
 */
export function truncateAtSentence(text: string, maxWords: number): string {
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+|$)/g);
  if (!sentences) return text.trim();

  const kept: string[] = [];
  let total = 0;
  for (const sentence of sentences) {
    const words = countWords(sentence);
    if (kept.length > 0 && total + words > maxWords) break;
    kept.push(sentence.trim());
    total += words;
  }
  return kept.join(" ").trim();
}

/**
 * Orçamento de tokens para gerar um roteiro deste tamanho.
 *
 * Não é o alvo convertido em tokens: um modelo que raciocina antes de
 * responder gasta o orçamento pensando e, se ele acabar no meio, a API
 * devolve HTTP 200 com o texto truncado — foi o que aconteceu ao vivo, um
 * roteiro terminando em "usando o seu próprio". Por isso o cálculo soma uma
 * folga fixa e generosa para a fase de raciocínio, em cima da conversão de
 * palavras para tokens. Um teto alto não custa: o modelo para quando termina
 * de escrever, não quando atinge o teto.
 */
export function tokenBudget(seconds: number = SCRIPT_DURATION.targetSeconds): number {
  const TOKENS_PER_WORD = 3; // pt-BR, com folga sobre a média real (~1,5-2)
  const THINKING_HEADROOM = 1500;
  return Math.round(targetWords(seconds) * TOKENS_PER_WORD) + THINKING_HEADROOM;
}

/**
 * Garante que o texto termine numa frase completa, descartando uma cauda
 * truncada. Vale para qualquer origem de truncamento — teto de tokens, corte
 * do vendor, resposta interrompida.
 *
 * É a última linha de defesa antes do TTS: o avatar falando "...usando o seu
 * próprio" e parando no ar é pior que um vídeo alguns segundos mais curto.
 * Texto sem nenhuma pontuação final é devolvido como veio, porque aí não há
 * cauda identificável a remover.
 */
export function ensureCompleteEnding(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0 || /[.!?…]["')\]]?$/.test(trimmed)) return trimmed;

  const lastStop = Math.max(
    trimmed.lastIndexOf("."),
    trimmed.lastIndexOf("!"),
    trimmed.lastIndexOf("?"),
    trimmed.lastIndexOf("…"),
  );
  if (lastStop < 0) return trimmed;
  return trimmed.slice(0, lastStop + 1).trim();
}

/**
 * Instrução de tamanho e formato. Vai no papel de SYSTEM, nunca junto do
 * pedido do usuário: quando estava na mensagem de usuário, o modelo tratou o
 * alvo como assunto da conversa e devolveu o próprio raciocínio no lugar do
 * roteiro ("55 words! Target is 56 to 84... Draft 2:"). Instrução e conteúdo
 * precisam ocupar papéis diferentes.
 *
 * Fala em PALAVRAS, não em segundos: o modelo não tem noção de quanto tempo
 * leva para falar um texto, mas conta palavras razoavelmente bem.
 */
export function buildLengthInstruction(seconds: number = SCRIPT_DURATION.targetSeconds): string {
  const target = targetWords(seconds);
  const { min, max } = wordBand(seconds);
  return [
    "Você escreve roteiros para vídeos de avatar digital falante.",
    `O roteiro deve ter aproximadamente ${target} palavras (entre ${min} e ${max}).`,
    "",
    "Sua resposta é lida em voz alta exatamente como veio, palavra por palavra.",
    "Responda APENAS com o texto a ser falado, em prosa corrida. Nunca escreva",
    "título, cabeçalho, marcação de cena, rubrica, lista, indicação de tempo,",
    "contagem de palavras, comentário sobre o tamanho, rascunhos alternativos",
    "nem qualquer explicação sobre o que você fez. Termine sempre com uma frase",
    "completa, no mesmo idioma do pedido.",
  ].join("\n");
}

export interface ScriptDurationLog {
  tenantId: string;
  stage: "generation" | "synthesis";
  words: number;
  estimatedSeconds: number;
  targetSeconds: number;
  /** Duração real do áudio, quando o vendor a informa. */
  actualSeconds?: number | null;
  /** Como a duração real foi obtida, para não comparar medida com estimativa. */
  actualSource?: "elevenlabs_timestamps" | "bitrate_estimate" | null;
  attempts?: number;
  truncated?: boolean;
}

/**
 * Log estruturado, uma linha por geração. Deliberadamente não bloqueia nem
 * altera nada: existe para que wordsPerMinute acima possa ser calibrado
 * contra a duração real medida, em vez de permanecer um chute para sempre.
 *
 * Quando actualSeconds vem preenchido, `driftRatio` é a razão entre real e
 * estimado — se ele ficar consistentemente acima de 1, a voz é mais lenta que
 * o wordsPerMinute configurado e o número precisa cair.
 */
export function logScriptDuration(entry: ScriptDurationLog): void {
  const driftRatio =
    entry.actualSeconds && entry.estimatedSeconds > 0
      ? Number((entry.actualSeconds / entry.estimatedSeconds).toFixed(3))
      : null;

  console.log(
    JSON.stringify({
      event: "script_duration",
      ...entry,
      wordsPerMinute: SCRIPT_DURATION.wordsPerMinute,
      driftRatio,
    }),
  );
}
