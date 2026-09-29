/**
 * O CENÁRIO e o TRAJE (texto) vão em inglês ao fornecedor — traduzidos por
 * dentro, sem que quem escreveu precise saber. Irmã de `directionTranslation.ts`,
 * separada porque a instrução ao modelo é OUTRA: aqui é DESCRIÇÃO VISUAL, e a
 * tradução tem de ser FIEL — nunca uma interpretação livre como a de direção de
 * cena. "consultório claro, jaleco branco" vira uma tradução literal do que
 * está escrito, não uma reformulação de diretor.
 *
 * ---------------------------------------------------------------------------
 * ATRÁS DE FLAG — TRANSLATE_SCENE_TEXT, hoje `false`
 *
 * A flag mora em `routes/videos.ts` (onde é consumida, não aqui). Desligada, o
 * comportamento é IDÊNTICO ao de antes deste módulo existir: nenhuma chamada
 * extra, `scenario_prompt_en`/`outfit_prompt_en` continuam NULL, e a
 * composição usa o texto em português como sempre usou.
 * ---------------------------------------------------------------------------
 *
 * UMA CHAMADA PARA OS DOIS TEXTOS, nunca duas: cenário e traje quase sempre
 * chegam juntos (Passo 1 do avatar, ou a Cena do vídeo), e duas chamadas
 * pagariam duas vezes por uma decisão que é uma só. Só entra na mensagem o
 * texto que existe — o campo ausente nunca é mencionado, e por isso nunca é
 * esperado de volta.
 *
 * SEM CACHE, de propósito nesta rodada: `translateDirection` reaproveita por
 * casar o texto fonte inteiro contra `videos.motion_prompt`. Fazer o mesmo
 * aqui, para DOIS campos que podem mudar independentemente, multiplicaria a
 * consulta e o risco de servir a tradução de um campo para o texto do outro.
 * Tradução é barata (não convertida em dólar, ver `recordProviderUsage`
 * abaixo); reaproveitar fica para quando o padrão de uso pedir.
 */
import { complete } from "../providers/providerRegistry.js";
import type { ScriptVendor } from "../providers/vendorCatalog.js";
import { recordProviderUsage } from "../billing/usageTracking.js";
import { logEvent } from "../log/safeLog.js";
import { needsTranslation, type InterfaceLocale } from "./directionTranslation.js";

const CENARIO_MARCADOR = "CENARIO:";
const TRAJE_MARCADOR = "TRAJE:";

/**
 * A instrução ao modelo — FIEL, não interpretativa.
 *
 * Ao contrário de `buildSystemPrompt` (directionTranslation.ts), que pede
 * intenção de direção, esta pede tradução literal: é descrição visual (o que
 * a composição vê), e paráfrase aqui trocaria o que a imagem vai mostrar —
 * "jaleco branco" virando "vestimenta médica clara" não é o mesmo traje.
 */
const SCENE_TEXT_SYSTEM_PROMPT = [
  "You translate a short visual scene description (a setting or an outfit) for an AI image composition into " +
    "English.",
  "Translate literally and faithfully, word for word in meaning — this is a visual description, not a stage " +
    "direction: never paraphrase, summarize, embellish, or add detail that is not in the source.",
  "Keep proper nouns, brand names, and any text already in English unchanged.",
  `The input has one or two labeled lines, exactly "${CENARIO_MARCADOR}" and/or "${TRAJE_MARCADOR}". Return the ` +
    "SAME labels you received, one per line and in the same order, each followed by its English translation.",
  "Do not invent a label that was not in the input, and do not omit a label that was.",
  "Return only those labeled lines. No preamble, no quotes, no commentary, no explanation.",
].join(" ");

/** Teto de saída. Bem menor que o de direção (2048): são frases curtas, não parágrafos. */
const MAX_TOKENS = 512;

export class SceneTextTranslationError extends Error {
  constructor(readonly reason: string) {
    super(
      "Não consegui traduzir o Cenário/Traje para o idioma do fornecedor, e por isso não gerei o vídeo. " +
        "Nada foi cobrado. Tente de novo em instantes; se persistir, simplifique o texto ou deixe-o em branco.",
    );
    this.name = "SceneTextTranslationError";
  }
}

export interface TranslateSceneTextInput {
  tenantId: string;
  apiKey: string;
  vendor: ScriptVendor;
  /** Já normalizado (trim) por quem chama. `null`/vazio não entra na mensagem. */
  scenario: string | null;
  outfit: string | null;
  locale: InterfaceLocale;
}

export interface TranslateSceneTextResult {
  scenarioEnglish: string | null;
  outfitEnglish: string | null;
}

function extrairCampo(texto: string, marcador: string): string | null {
  const linha = texto.split("\n").find((l) => l.trim().startsWith(marcador));
  if (!linha) return null;
  const valor = linha.trim().slice(marcador.length).trim();
  return valor || null;
}

/**
 * O par cenário/traje em inglês. `null` no campo que não foi pedido.
 *
 * LANÇA em vez de devolver o texto original quando o modelo falha, ou quando
 * a resposta não trouxe um campo que foi pedido — mesma razão de
 * `translateDirection`: devolver o português seria o precedente de
 * `background_asset_failed`, que cobra por um vídeo com um campo errado sem a
 * tela dizer nada.
 */
export async function translateSceneText(
  input: TranslateSceneTextInput,
): Promise<TranslateSceneTextResult> {
  if (!needsTranslation(input.locale)) {
    return { scenarioEnglish: input.scenario, outfitEnglish: input.outfit };
  }

  const linhas: string[] = [];
  if (input.scenario) linhas.push(`${CENARIO_MARCADOR} ${input.scenario}`);
  if (input.outfit) linhas.push(`${TRAJE_MARCADOR} ${input.outfit}`);
  // Quem chama já filtra os dois vazios antes de chegar aqui (mesma regra de
  // "campo vazio não é campo" de `normalizeScene`) — defensivo: uma chamada
  // direta com os dois nulos não deve gastar um token sequer.
  if (linhas.length === 0) {
    return { scenarioEnglish: null, outfitEnglish: null };
  }

  let texto: string;
  let usage: { inputTokens: number; outputTokens: number } | null | undefined;
  let truncado: boolean | null;
  try {
    const resposta = await complete(input.vendor, {
      apiKey: input.apiKey,
      system: SCENE_TEXT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: linhas.join("\n") }],
      maxTokens: MAX_TOKENS,
    });
    texto = resposta.text.trim();
    usage = resposta.usage;
    truncado = resposta.truncated;
  } catch (err) {
    logEvent("error", "scene_text_translation_failed", {
      context: "video.sceneTextTranslation",
      reason: err instanceof Error ? err.message : String(err),
      consequence: "a geração é RECUSADA e nada é cobrado; o texto em português não é enviado ao fornecedor",
    });
    throw new SceneTextTranslationError(err instanceof Error ? err.message : String(err));
  }

  if (truncado) {
    logEvent("error", "scene_text_translation_failed", {
      context: "video.sceneTextTranslation",
      reason: `o modelo cortou a resposta no teto de ${MAX_TOKENS} tokens`,
      consequence: "a geração é RECUSADA e nada é cobrado",
    });
    throw new SceneTextTranslationError(`resposta truncada no teto de ${MAX_TOKENS} tokens`);
  }

  const scenarioEnglish = input.scenario ? extrairCampo(texto, CENARIO_MARCADOR) : null;
  const outfitEnglish = input.outfit ? extrairCampo(texto, TRAJE_MARCADOR) : null;

  // Campo pedido e sem tradução na resposta é FALHA — igual a resposta vazia
  // em `translateDirection`: mandar o campo ausente ao fornecedor apagaria em
  // silêncio uma instrução que a pessoa deu.
  if ((input.scenario && !scenarioEnglish) || (input.outfit && !outfitEnglish)) {
    logEvent("error", "scene_text_translation_failed", {
      context: "video.sceneTextTranslation",
      reason: "a resposta não trouxe todos os campos pedidos",
      hadScenario: Boolean(input.scenario),
      hadOutfit: Boolean(input.outfit),
      gotScenario: Boolean(scenarioEnglish),
      gotOutfit: Boolean(outfitEnglish),
      consequence: "a geração é RECUSADA e nada é cobrado",
    });
    throw new SceneTextTranslationError("o modelo não devolveu todos os campos pedidos");
  }

  // Tokens registrados COMO O PROJETO JÁ FAZ, sem conversão em dólar — mesma
  // razão de `directionTranslation.ts`: tarifa por token de texto não é
  // medida aqui, e NÃO passa por `debitCredit` (decisão nossa, não da
  // pessoa).
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

  // Tamanho, nunca conteúdo — mesmo padrão de `direction_translated`.
  logEvent("info", "scene_text_translated", {
    context: "video.sceneTextTranslation",
    vendor: input.vendor,
    scenarioChars: input.scenario?.length ?? 0,
    outfitChars: input.outfit?.length ?? 0,
    scenarioEnglishChars: scenarioEnglish?.length ?? 0,
    outfitEnglishChars: outfitEnglish?.length ?? 0,
    tokensIn: usage?.inputTokens ?? null,
    tokensOut: usage?.outputTokens ?? null,
  });

  return { scenarioEnglish, outfitEnglish };
}
