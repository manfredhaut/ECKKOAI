// Real integrations for script-generation, selected per tenant via the
// "script" BYOK credential's vendor (see vendorCatalog.ts). Model + HTTP
// call live in providerRegistry.ts, shared with copilotProvider.ts.
import { complete, AiProviderError } from "./providerRegistry.js";
import type { ScriptVendor } from "./vendorCatalog.js";
import { recordProviderUsage } from "../billing/usageTracking.js";
import {
  buildLengthInstruction,
  countWords,
  ensureCompleteEnding,
  estimateSeconds,
  logScriptDuration,
  SCRIPT_DURATION,
  targetWords,
  tokenBudget,
  truncateAtSentence,
  wordBand,
} from "../script/scriptDuration.js";

export interface GenerateScriptInput {
  apiKey: string;
  vendor: ScriptVendor;
  prompt: string;
  tenantId: string;
  /** Duração-alvo em segundos; cai no default de scriptDuration.ts. */
  targetSeconds?: number;
}

export interface GenerateScriptResult {
  script: string;
  words: number;
  estimatedSeconds: number;
  targetSeconds: number;
  /** Chamadas feitas ao vendor: 1 ou 2, nunca mais. */
  attempts: number;
  /** true se o corte determinístico precisou entrar. */
  truncated: boolean;
}

export class ScriptProviderError extends Error {}

// Teto rígido de chamadas ao vendor por roteiro. Um laço "tenta até caber"
// seria a implementação natural e é justamente a errada aqui: cada volta é
// uma requisição paga, e na cota gratuita em uso (~20/dia, compartilhada com
// o copiloto) três roteiros teimosos consumiriam o dia inteiro. Duas chamadas
// no pior caso, e o determinismo resolve o resto.
const MAX_VENDOR_CALLS = 2;

// O modelo às vezes entrega o raciocínio junto do resultado — observado ao
// vivo com este mesmo modelo, que devolveu "55 words! Target is 56 to 84...
// *Draft 2 (Adjusting length):" COMO SE FOSSE o roteiro. Isso iria inteiro
// para o ElevenLabs e sairia na boca do avatar.
//
// A instrução de sistema reduz o problema, mas instrução não é garantia, e o
// custo de um falso negativo aqui é um vídeo inutilizável entregue ao
// cliente. Estas são as formas que esse ruído assume: cabeçalho markdown,
// rótulo de rascunho, e linhas que falam sobre a contagem de palavras em vez
// de serem o texto.
const META_LINE_PATTERNS: readonly RegExp[] = [
  /^\s*#{1,6}\s+/,
  /^\s*\**\s*\(?(draft|rascunho|vers[ãa]o|option|op[çc][ãa]o)\b[^\n]*$/i,
  /^\s*\**\s*(roteiro|script|texto falado|narra[çc][ãa]o)\s*\**\s*:\s*$/i,
  /^[^\n]*\b\d+\s*(words?|palavras?)\b[^\n]*$/i,
  /^[^\n]*\b(target|alvo|contagem|word count)\b[^\n]*:[^\n]*$/i,
];

function stripMeta(text: string): string {
  const kept = text
    .split("\n")
    .filter((line) => !META_LINE_PATTERNS.some((re) => re.test(line)));
  const cleaned = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  // Se a limpeza comeu tudo, o texto original era meta-comentário inteiro —
  // devolvê-lo é mais honesto que devolver vazio, e a validação de tamanho
  // logo abaixo vai tratá-lo como fora da banda.
  return cleaned.length > 0 ? cleaned : text.trim();
}

export async function generateScript(input: GenerateScriptInput): Promise<GenerateScriptResult> {
  const targetSeconds = input.targetSeconds ?? SCRIPT_DURATION.targetSeconds;
  const target = targetWords(targetSeconds);
  const band = wordBand(targetSeconds);

  const ask = async (userContent: string): Promise<string> => {
    const { text, usage } = await complete(input.vendor, {
      apiKey: input.apiKey,
      system: buildLengthInstruction(targetSeconds),
      messages: [{ role: "user", content: userContent }],
      maxTokens: tokenBudget(targetSeconds),
    });
    if (usage) {
      await recordProviderUsage({
        tenantId: input.tenantId,
        provider: "script",
        vendor: input.vendor,
        unitType: "tokens_in",
        unitCount: usage.inputTokens,
      });
      await recordProviderUsage({
        tenantId: input.tenantId,
        provider: "script",
        vendor: input.vendor,
        unitType: "tokens_out",
        unitCount: usage.outputTokens,
      });
    }
    return text.trim();
  };

  try {
    let attempts = 1;
    let script = stripMeta(await ask(input.prompt));
    let words = countWords(script);

    // Uma única nova tentativa, e só quando saiu da banda. O desvio é dito em
    // termos do que fazer com o texto ("mais curto"/"mais longo"), não como um
    // problema de contagem a ser discutido — pedir para "ajustar de 55 para 70
    // palavras" convida o modelo a responder falando sobre palavras.
    if (words < band.min || words > band.max) {
      const correction =
        words > band.max
          ? `A versão anterior ficou longa demais. Escreva uma versão nitidamente mais curta, com cerca de ${target} palavras.`
          : `A versão anterior ficou curta demais. Escreva uma versão nitidamente mais longa, com cerca de ${target} palavras.`;
      attempts = MAX_VENDOR_CALLS;
      script = stripMeta(await ask(`${input.prompt}\n\n${correction}`));
      words = countWords(script);
    }

    // Acabaram as chances com o vendor. Acima do teto, corta-se em fim de
    // frase — determinístico, sem custo e sem cortar ninguém no meio de uma
    // palavra. Abaixo do piso não há corte que resolva: um roteiro curto
    // demais é entregue como veio, registrado no log, e continua editável
    // pelo usuário na própria tela.
    let truncated = false;
    if (words > band.max) {
      const cut = truncateAtSentence(script, band.max);
      if (cut && countWords(cut) < words) {
        script = cut;
        words = countWords(script);
        truncated = true;
      }
    }

    // Última linha de defesa, independente do tamanho: nada com frase pela
    // metade chega ao TTS. Um texto pode vir truncado sem estar longo — foi o
    // que aconteceu quando o teto de tokens acabou durante a escrita.
    const complete_ = ensureCompleteEnding(script);
    if (complete_ !== script) {
      script = complete_;
      words = countWords(script);
      truncated = true;
    }

    logScriptDuration({
      tenantId: input.tenantId,
      stage: "generation",
      words,
      estimatedSeconds: estimateSeconds(words),
      targetSeconds,
      attempts,
      truncated,
    });

    return {
      script,
      words,
      estimatedSeconds: estimateSeconds(words),
      targetSeconds,
      attempts,
      truncated,
    };
  } catch (err) {
    if (err instanceof AiProviderError) throw new ScriptProviderError(err.message);
    throw err;
  }
}
