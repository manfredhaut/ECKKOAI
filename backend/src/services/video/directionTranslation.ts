/**
 * A INTERPRETAÇÃO vai em inglês ao fornecedor — traduzida por dentro, sem que
 * quem escreveu precise saber.
 *
 * ---------------------------------------------------------------------------
 * O QUE ATRAVESSA ESTE ARQUIVO, E O QUE NUNCA ATRAVESSA
 *
 * Atravessa: `motion_prompt`, a direção de cena. É INSTRUÇÃO — o fornecedor a
 * lê para decidir gesto e postura, e o texto em si nunca aparece no vídeo.
 *
 * NUNCA atravessa: o ROTEIRO. Ele é FALA, sai pela boca do avatar, e traduzi-lo
 * mudaria o idioma do vídeo entregue. Um roteiro em português tem de continuar
 * em português do começo ao fim do caminho, em qualquer hipótese. Este módulo
 * não tem função que receba roteiro, e é assim de propósito: a separação vale
 * mais como ausência de porta do que como comentário pedindo cuidado.
 * ---------------------------------------------------------------------------
 *
 * ┌─ O QUE É MEDIDO ────────────────────────────────────────────────────────┐
 * │ Que o caminho de modelo de texto funciona: `complete()` é o mesmo ponto  │
 * │ único que o "Gerar com IA" usa, e o tenant `dev-c77a5b` tem credencial   │
 * │ `script`/`gemini` conectada — com tokens registrados hoje às 06:02:54Z   │
 * │ (3739 de entrada, 39 de saída) por uma geração de roteiro real.          │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ O QUE NÃO FOI VERIFICADO ──────────────────────────────────────────────┐
 * │ Que a tradução MELHORE o vídeo. Que o fornecedor entenda melhor uma      │
 * │ direção em inglês do que em português é a premissa do produto, não uma   │
 * │ medição: `motion_prompt` é texto livre, não há enum para comparar, e     │
 * │ medir exigiria dois vídeos pagos com o mesmo roteiro. Registrado como    │
 * │ premissa, e não escondido dentro do código como se fosse fato.           │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { pool } from "../../db/pool.js";
import { complete } from "../providers/providerRegistry.js";
import type { ScriptVendor } from "../providers/vendorCatalog.js";
import { recordProviderUsage } from "../billing/usageTracking.js";
import { logEvent } from "../log/safeLog.js";
import { formatarJanela, type JanelaDeTempo } from "./scriptFractioning.js";

/**
 * O idioma da INTERFACE, que é o gatilho — e não o idioma detectado no texto.
 *
 * Detectar língua é palpite estatístico, e ele erra justamente onde dói: uma
 * direção curta como "close up" é indistinguível entre os dois idiomas, e um
 * detector que a classificasse como português mandaria o modelo "traduzir" um
 * texto que já estava pronto. O idioma da interface é um FATO que o cliente
 * conhece — a pessoa escolheu no seletor —, e um fato ganha de um palpite.
 */
export type InterfaceLocale = "pt-BR" | "en";

/**
 * Locale inválido ou ausente cai em `pt-BR`, e a escolha é do lado seguro.
 *
 * Os dois erros possíveis não custam a mesma coisa: cair em `en` por engano faz
 * a direção em português seguir para o fornecedor sem tradução — que é
 * exatamente o defeito que este módulo existe para fechar, e ele é silencioso.
 * Cair em `pt-BR` por engano manda um texto já inglês para o tradutor, que o
 * devolve inalterado pela instrução do item 3.4. Um custa o defeito; o outro,
 * alguns tokens.
 */
export function resolveInterfaceLocale(bruto: unknown): InterfaceLocale {
  return bruto === "en" ? "en" : "pt-BR";
}

/** Precisa passar pelo tradutor? Só o idioma decide. */
export function needsTranslation(locale: InterfaceLocale): boolean {
  return locale !== "en";
}

/**
 * A instrução ao modelo.
 *
 * Ela pede DIREÇÃO DE CENA, e não tradução literal: "mãos abertas na altura do
 * peito" traduzido palavra a palavra vira uma descrição anatômica; o que o
 * fornecedor precisa ler é a intenção de movimento.
 *
 * E ela proíbe preâmbulo explicitamente porque o modelo de roteiro deste mesmo
 * projeto já produziu resposta com introdução — `stripMeta()` existe em
 * `scriptProvider.ts` justamente para isso. Aqui a saída vai direto para um
 * campo do fornecedor, então um "Aqui está a tradução:" viraria instrução de
 * cena.
 */
const SYSTEM_BASE = [
  "You translate stage direction for an AI avatar video into English.",
  "Preserve the directing intent: gesture, posture, camera framing, energy and pacing.",
  "Do not translate word by word; write what a director would say to a performer.",
  "If the text is already in English, return it unchanged.",
  "Return only the direction text. No preamble, no quotes, no commentary, no explanation.",
];

/**
 * A instrução, COMPLETA — RODADA 3, 29/08/2026, segmentação por janela.
 *
 * ┌─ Só existe quando `janelas.length > 1` — BUG D/E, tier Normal apenas ───┐
 * │ Um vídeo Normal fracionado em vários blocos (`fracionarRoteiro`) hoje    │
 * │ manda a MESMA direção inteira para cada bloco do Wan — o bloco 2 recebe  │
 * │ de novo "comece com os braços cruzados", que não faz sentido para uma   │
 * │ imagem de entrada que já está no meio do gesto (Bug D). As janelas vêm  │
 * │ de `janelasDosBlocos` (scriptFractioning.ts), calculadas a partir do    │
 * │ MESMO roteiro que `evaluateGenerationReadiness` já validou caber no     │
 * │ tier — nunca inventadas aqui.                                           │
 * │                                                                          │
 * │ Simples (HeyGen) nunca fraciona, e Premium (Seedance) está fora do      │
 * │ fracionamento por decisão de escopo — os dois SEMPRE chamam esta função │
 * │ sem `blockWindows`, e por isso NUNCA veem esta instrução nem o formato   │
 * │ `[mm:ss-mm:ss]`: o texto que chegaria ao `motion_prompt` deles          │
 * │ continua saindo exatamente como antes desta rodada.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export function buildSystemPrompt(janelas?: JanelaDeTempo[]): string {
  if (!janelas || janelas.length <= 1) return SYSTEM_BASE.join(" ");
  const marcadores = janelas.map(formatarJanela).join(", ");
  return [
    ...SYSTEM_BASE,
    `This direction will drive ${janelas.length} separate video segments, with these exact time windows: ${marcadores}.`,
    "Split your direction into exactly one line per window, each line starting with its exact bracketed window " +
      'copied verbatim (e.g. "[00:00-00:05] ...").',
    "Describe only what happens during that window in its line.",
    // MEDIDO em 29/08 (vídeo mudo de 3 blocos, plano 3): a instrução anterior
    // ("keep pose continuous, don't reset") não bastou — cada linha é enviada
    // SOZINHA a um gerador que não tem memória das linhas anteriores nem do
    // vídeo já gerado, então uma linha que só narra a AÇÃO da janela (ex.
    // "reaches out with one hand") deixa o modelo livre para herdar a pose da
    // imagem de referência (que é sempre a mesma, fixa, em TODO bloco) em vez
    // da pose que a narrativa já estabeleceu num bloco anterior. A correção é
    // exigir que cada linha, exceto a primeira, ABRA restabelecendo o estado
    // corporal atual, explicitamente — não é suficiente que a narrativa
    // implique continuidade.
    "Every line after the first is sent to the video generator ALONE, with no memory of earlier lines and no " +
      "memory of previously generated video — it only sees this one line plus a fixed reference image. So every " +
      "line after the first must OPEN by explicitly restating the character's current body position and stance " +
      "(for example 'already standing, close to the camera' or 'still seated'), before describing the new action " +
      "— never rely on the narrative alone to imply continuity, and never let a later window default back to the " +
      "reference image's original pose unless the source direction explicitly says so.",
    "Return exactly one line per window, in the same order as given, and nothing else — no blank lines, no extra " +
      "commentary.",
  ].join(" ");
}

/**
 * Teto de saída.
 *
 * **2048, e não os 400 da primeira versão** — o número foi corrigido por
 * MEDIÇÃO em 10/08. A 400, uma direção de 74 caracteres voltou cortada no meio
 * de uma palavra ("…looking"), com `candidatesTokenCount: 15`. O orçamento não
 * tinha sido gasto pelo texto: foi gasto pelo RACIOCÍNIO do modelo, que conta
 * para o mesmo teto e não aparece na contagem de saída. Um teto dimensionado
 * pelo tamanho da resposta esperada é errado quando o modelo pensa antes de
 * responder.
 *
 * A folga não substitui a verificação: `truncated` continua sendo conferido
 * abaixo, porque um teto generoso reduz a chance do corte e não a elimina.
 */
const MAX_TOKENS = 2048;

export class DirectionTranslationError extends Error {
  constructor(readonly reason: string) {
    super(
      "Não consegui traduzir a Interpretação para o idioma do fornecedor, e por isso não gerei o vídeo. " +
        "Nada foi cobrado. Tente de novo em instantes; se persistir, simplifique o texto da Interpretação " +
        "ou deixe-o em branco.",
    );
    this.name = "DirectionTranslationError";
  }
}

export interface TranslateDirectionInput {
  tenantId: string;
  apiKey: string;
  vendor: ScriptVendor;
  /** O texto do usuário, já normalizado (trim) por `normalizeScene`. */
  source: string;
  locale: InterfaceLocale;
  /**
   * As janelas de tempo dos blocos de animação — SÓ quando o vídeo vai
   * fracionar em mais de um bloco (tier Normal, `fracionarRoteiro(script)`).
   * Ausente ou com 1 elemento só: comportamento IDÊNTICO a antes desta
   * rodada, para qualquer tier. Ver `buildSystemPrompt`.
   */
  blockWindows?: JanelaDeTempo[];
}

export interface TranslateDirectionResult {
  /** O que vai ao fornecedor. */
  english: string;
  /** De onde veio — para o log e para a guarda de "não rechamar". */
  origin: "locale_is_english" | "reused" | "model";
  /** A tradução pediu segmentação por janela? Só true com >1 janela. */
  segmented: boolean;
}

/**
 * Tradução já feita do MESMO texto, neste tenant.
 *
 * É isto que impede a rechamada quando o texto fonte não mudou, e a consulta é
 * ao BANCO em vez de a um cache em memória de propósito: cache em memória morre
 * no `restart`, e reiniciar é rotina neste projeto (código novo não entra sem
 * ele). Um cache que esquece a cada reinício não cumpre a promessa de não
 * rechamar; a coluna cumpre.
 */
async function reutilizar(tenantId: string, source: string): Promise<string | null> {
  const { rows } = await pool.query<{ motion_prompt_en: string }>(
    `SELECT motion_prompt_en
       FROM videos
      WHERE tenant_id = $1 AND motion_prompt = $2 AND motion_prompt_en IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [tenantId, source],
  );
  return rows[0]?.motion_prompt_en ?? null;
}

/**
 * O texto em inglês que vai ao fornecedor.
 *
 * SUBSTITUI, nunca acumula: o retorno é a tradução do `source` recebido agora, e
 * quem chama grava o resultado por cima. Não existe caminho em que a tradução
 * anterior se some à nova — a função não recebe a anterior, e essa ausência de
 * parâmetro é a garantia, não o comentário.
 *
 * LANÇA em vez de devolver o texto original quando o modelo falha. Devolver o
 * português seria o precedente de `background_asset_failed`, medido e caro: lá
 * o `catch` deixa a geração seguir, o vídeo sai com o fundo errado, é cobrado
 * por inteiro e a tela não diz nada. Aqui, quem chama recusa a geração.
 */
export async function translateDirection(
  input: TranslateDirectionInput,
): Promise<TranslateDirectionResult> {
  // Interface em inglês: o texto JÁ está no idioma do fornecedor, e chamar o
  // modelo para confirmar isso gastaria tokens para não mudar nada. Sai antes
  // de qualquer I/O — é o que torna "sem nenhuma chamada" observável pela
  // ausência de registro de tokens.
  if (!needsTranslation(input.locale)) {
    return { english: input.source, origin: "locale_is_english", segmented: false };
  }

  // A segmentação depende da JANELA, não só de ela existir: uma corrida que
  // cabe num bloco só (`blockWindows` com 0 ou 1 elemento) não tem o que
  // segmentar, e é o MESMO caminho de Simples/Premium — sem instrução nova,
  // sem marcador, texto corrido como sempre.
  const segmentando = Boolean(input.blockWindows && input.blockWindows.length > 1);

  // O CACHE não serve à tradução SEGMENTADA — RODADA 3, 29/08.
  //
  // `reutilizar` casa pelo TEXTO FONTE, sem olhar em quantos blocos o vídeo
  // vai fracionar. Dois vídeos com a MESMA Interpretação e roteiros de
  // tamanhos diferentes fracionam em números de blocos diferentes — as
  // janelas mudam, e uma tradução com marcadores da corrida anterior sairia
  // dessincronizada da nova. Pior: como a consulta não filtra por tier,
  // reusar aqui poderia entregar texto com `[mm:ss-mm:ss]` literal para um
  // vídeo Simples/Premium que nunca pediu segmentação nenhuma. Mais simples
  // e mais seguro que filtrar a consulta: pular o cache inteiro quando for
  // segmentar, e chamar o modelo de novo. Tradução é barata (não convertida
  // em dólar, ver `recordProviderUsage` abaixo) — o preço de uma rechamada
  // aqui é desprezível perto do preço de uma tradução errada chegando a
  // um motor pago.
  if (!segmentando) {
    const jaFeita = await reutilizar(input.tenantId, input.source);
    if (jaFeita) {
      logEvent("info", "direction_translation_reused", {
        context: "video.directionTranslation",
        sourceChars: input.source.length,
        englishChars: jaFeita.length,
      });
      return { english: jaFeita, origin: "reused", segmented: false };
    }
  }

  let texto: string;
  let usage: { inputTokens: number; outputTokens: number } | null | undefined;
  let truncado: boolean | null;
  try {
    const resposta = await complete(input.vendor, {
      apiKey: input.apiKey,
      system: buildSystemPrompt(segmentando ? input.blockWindows : undefined),
      messages: [{ role: "user", content: input.source }],
      maxTokens: MAX_TOKENS,
    });
    texto = resposta.text.trim();
    usage = resposta.usage;
    truncado = resposta.truncated;
  } catch (err) {
    logEvent("error", "direction_translation_failed", {
      context: "video.directionTranslation",
      reason: err instanceof Error ? err.message : String(err),
      consequence: "a geração é RECUSADA e nada é cobrado; o texto em português não é enviado ao fornecedor",
    });
    throw new DirectionTranslationError(err instanceof Error ? err.message : String(err));
  }

  // Resposta vazia é falha, e não "direção sem conteúdo": o usuário escreveu
  // alguma coisa, e mandar string vazia ao fornecedor apagaria em silêncio uma
  // instrução que ele deu.
  if (!texto) {
    logEvent("error", "direction_translation_failed", {
      context: "video.directionTranslation",
      reason: "o modelo devolveu texto vazio",
      consequence: "a geração é RECUSADA e nada é cobrado",
    });
    throw new DirectionTranslationError("o modelo devolveu texto vazio");
  }

  // TRUNCADA é falha, e não "tradução curta".
  //
  // Meia direção de cena não é meia instrução: é outra instrução. "Hold your
  // hands open at chest height with a calm gesture, looking" pede que o avatar
  // OLHE, sem dizer para onde — e o fornecedor aceita, responde 200 e improvisa
  // o resto. O sintoma apareceria só no vídeo pago, que é o pior lugar para
  // descobrir. Recusar aqui custa zero.
  if (truncado) {
    logEvent("error", "direction_translation_failed", {
      context: "video.directionTranslation",
      reason: `o modelo cortou a resposta no teto de ${MAX_TOKENS} tokens`,
      sourceChars: input.source.length,
      englishChars: texto.length,
      consequence: "a geração é RECUSADA e nada é cobrado; meia direção de cena não é enviada",
    });
    throw new DirectionTranslationError(`resposta truncada no teto de ${MAX_TOKENS} tokens`);
  }

  // Tokens registrados COMO O PROJETO JÁ FAZ, e sem conversão em dólar: a
  // tarifa por token de texto nunca foi medida aqui, e inventar um preço para
  // fechar a soma do mês é o defeito que `providerCost.ts` existe para não
  // repetir. Sem tarifa, a linha entra como consumo NÃO medido — que é a
  // verdade.
  //
  // E NÃO passa por `debitCredit`: crédito de roteiro é do "Gerar com IA", que
  // é uma escolha da pessoa. A tradução é decisão nossa, acontece sem ela pedir
  // e não pode consumir um saldo que ela reserva para outra coisa.
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

  // O LOG é a auditoria de fora do banco, e ele registra TAMANHO, não conteúdo:
  // a direção é texto do cliente. Quem precisa do texto exato tem a coluna
  // `motion_prompt_en`, atrás do painel admin.
  logEvent("info", "direction_translated", {
    context: "video.directionTranslation",
    vendor: input.vendor,
    sourceChars: input.source.length,
    englishChars: texto.length,
    tokensIn: usage?.inputTokens ?? null,
    tokensOut: usage?.outputTokens ?? null,
    segmented: segmentando,
  });

  return { english: texto, origin: "model", segmented: segmentando };
}
