/**
 * Seleção do motor de renderização do avatar (Avatar IV / III / V da HeyGen).
 *
 * O insumo apareceu sozinho, e só porque o LOG-1 passou a guardar o corpo bruto
 * da resposta. A criação de avatar devolve, dentro de `avatar_item`:
 *
 *     "supported_api_engines": ["avatar_iv", "avatar_iii"]
 *
 * Isso é MEDIDO — está no registro de 2026-08-01, `heygen.createAvatar`, 200,
 * 434 bytes. O fornecedor declara, por avatar, quais motores aquele avatar
 * aceita. Até aqui esse campo era descartado junto com o resto do corpo.
 *
 * O que é DEDUZIDO, e a razão de o envio ficar atrás de flag: que os valores de
 * `supported_api_engines` são o mesmo vocabulário do campo `engine.type` de
 * `POST /v3/videos`. Os nomes são idênticos e a leitura é a natural, mas a
 * documentação não amarra os dois campos, e nenhuma geração nossa jamais enviou
 * `engine`. Um valor recusado ali derrubaria a geração inteira — e a geração é
 * o caminho caro. Por isso a SELEÇÃO acontece sempre e é registrada sempre; o
 * ENVIO só acontece com a flag `explicit_avatar_engine` ligada.
 *
 * Assim o dado é colhido sem arriscar nada: mesmo desligada, cada vídeo grava
 * qual motor teria sido escolhido e por quê.
 */

/**
 * Motores documentados pela HeyGen para `POST /v3/videos`, no campo
 * `engine: { type }`. DOCUMENTADO (doc pública, duas fontes concordantes),
 * NUNCA exercitado por nós.
 */
export const HEYGEN_ENGINES = ["avatar_v", "avatar_iv", "avatar_iii"] as const;
export type HeygenEngine = (typeof HEYGEN_ENGINES)[number];

/**
 * Ordem de preferência quando o avatar declara mais de um motor.
 *
 * `avatar_iv` primeiro porque é o default declarado do fornecedor — escolhê-lo
 * explicitamente reproduz o comportamento que a conta já tinha, o que mantém a
 * primeira geração com `engine` comparável às anteriores. `avatar_v` fica FORA
 * da preferência de propósito: ele pede um `reference_look_id` que não temos, e
 * nenhum avatar nosso o declarou.
 */
export const ENGINE_PREFERENCE: readonly HeygenEngine[] = ["avatar_iv", "avatar_iii"];

/** Usado quando não há declaração utilizável. É o default do próprio fornecedor. */
export const DEFAULT_ENGINE: HeygenEngine = "avatar_iv";

/**
 * Por que este motor, e não outro. Vai para o banco junto do vídeo.
 *
 * Existe porque "qual motor foi usado" sozinho não permite diagnosticar nada:
 * `avatar_iv` escolhido por estar declarado e `avatar_iv` escolhido por não
 * haver declaração nenhuma são situações diferentes, e só a segunda indica que
 * um avatar entrou no fluxo sem passar pela leitura da resposta de criação.
 */
export type EngineReason =
  /** O avatar declarou, e a nossa preferência estava na lista dele. */
  | "declared_preference"
  /** O avatar declarou, mas nenhuma preferência nossa consta: usamos a primeira que ele declarou. */
  | "declared_first_unlisted"
  /** O avatar não declarou nada (criado antes desta leitura existir, ou vendor sem o campo). */
  | "default_no_declaration"
  /** Declarou só valores que não reconhecemos. */
  | "default_unknown_declaration";

export interface EngineSelection {
  engine: HeygenEngine;
  reason: EngineReason;
}

/**
 * O que veio da tela é um motor que este código conhece?
 *
 * Aceita `unknown` porque o chamador é uma rota HTTP: o corpo da requisição não
 * tem tipo até alguém conferir, e conferir aqui mantém a lista de motores num
 * lugar só.
 */
export function isHeygenEngine(value: unknown): value is HeygenEngine {
  return typeof value === "string" && isKnownEngine(value);
}

function isKnownEngine(value: string): value is HeygenEngine {
  return (HEYGEN_ENGINES as readonly string[]).includes(value);
}

/**
 * Escolhe o motor a partir do que o avatar declarou.
 *
 * NUNCA falha e nunca devolve vazio: sem motor não há decisão a registrar, e
 * uma seleção ausente reabriria a porta que este bloco fechou — o fornecedor
 * escolhendo por omissão. Toda saída carrega a razão, inclusive as de
 * retaguarda.
 */
export function selectEngine(declared: readonly string[] | null | undefined): EngineSelection {
  if (!declared || declared.length === 0) {
    return { engine: DEFAULT_ENGINE, reason: "default_no_declaration" };
  }

  const known = declared.filter(isKnownEngine);
  if (known.length === 0) {
    // Declarou algo que não reconhecemos — provavelmente um motor novo. Cair no
    // default é mais seguro que repassar um valor desconhecido adiante, e a
    // razão registra que houve declaração ilegível, que é o gatilho para
    // revisitar a lista.
    return { engine: DEFAULT_ENGINE, reason: "default_unknown_declaration" };
  }

  const preferido = ENGINE_PREFERENCE.find((e) => known.includes(e));
  if (preferido) return { engine: preferido, reason: "declared_preference" };

  // O avatar aceita motores, só nenhum dos que preferimos. A lista dele vence a
  // nossa: quem sabe o que aquele avatar renderiza bem é o fornecedor.
  return { engine: known[0], reason: "declared_first_unlisted" };
}

/**
 * Normaliza `supported_api_engines` vindo do corpo do fornecedor.
 *
 * Aceita só array de string; qualquer outra forma vira `null` ("não declarou"),
 * que é o que a seleção trata como ausência. Guardar lixo daria a impressão de
 * que houve declaração.
 */
export function readSupportedEngines(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const items = raw.filter((v): v is string => typeof v === "string" && v.length > 0);
  return items.length > 0 ? items : null;
}
