/**
 * O SUMIDOURO do log: nenhum evento sai deste processo sem passar por aqui.
 *
 * ┌─ Por que no sumidouro, e não em cada publicador ────────────────────────┐
 * │ O vazamento medido no bloco PREVOO-1 não foi falha do LOG-1. O LOG-1    │
 * │ mascarava corretamente o corpo do fornecedor no evento `vendor_response`│
 * │ — e o `vendor_error`, emitido por OUTRO módulo alguns milissegundos     │
 * │ depois, publicava o mesmo texto legível. O corpo bruto viaja dentro de  │
 * │ `err.message`, porque `fetchJson` o embute na exceção, e daí em diante  │
 * │ ele é só uma string que qualquer publicador pode imprimir.              │
 * │                                                                         │
 * │ Consertar aquele publicador fechou UM caso. A classe continuava aberta, │
 * │ e o próximo publicador a imprimir `err.message` reabriria o buraco sem  │
 * │ que ninguém percebesse — porque o publicador novo não parece perigoso.  │
 * │ Enquanto a redação for responsabilidade de quem publica, ela depende de │
 * │ cada autor futuro lembrar. No sumidouro, não depende de ninguém.        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Por que por FORMA, e não por nome de campo ────────────────────────────┐
 * │ Mascarar `api_key`, `token` e afins cobre o que se ANTECIPOU. Um        │
 * │ segredo que chegue dentro de `detail`, de `message`, de um item de      │
 * │ array ou de um campo com nome inocente passa inteiro — e é exatamente   │
 * │ essa a forma do vazamento real: o valor estava dentro de `detail`, um   │
 * │ nome que não sugere segredo nenhum.                                     │
 * │                                                                         │
 * │ Casar por forma cobre o valor onde quer que ele esteja. O custo é       │
 * │ falso positivo — um texto legítimo que se pareça com chave é redigido.  │
 * │ Esse é o lado barato de errar: perde-se contexto de um log; do outro    │
 * │ lado, publica-se a chave da conta.                                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A máscara por NOME de campo do LOG-1 continua existindo e não é substituída:
 * ela elide corpo volumoso e mascara campos conhecidos ANTES daqui. As duas se
 * somam, e é assim que deve ser — uma pega o que se conhece, a outra o que não.
 */

const REDACTED = "***REDACTED***";

/**
 * Formas de segredo. Cada uma existe por um achado, não por precaução:
 *
 *  · `sk-…`        — OpenAI/Anthropic e derivados.
 *  · `AIza…`       — chave do Google AI Studio, o formato esperado.
 *  · `AQ.…`        — o formato INESPERADO: registrado neste projeto, 53
 *                    caracteres, e aceito como API key. Uma chave real que
 *                    quase foi descartada por "não parecer com AIza".
 *  · `xi-…`/`hg_…` — prefixos de ElevenLabs e HeyGen.
 *  · `uuid:hex`    — fal.ai. Não tem prefixo nenhum, e nenhuma das duas
 *                    metades é longa o bastante para o padrão genérico: passava
 *                    inteira, em claro.
 *  · JWT           — três blocos base64 separados por ponto.
 *  · `Bearer …`    — o cabeçalho inteiro, quando ele vaza dentro de um texto.
 *  · hex/base64 longos — o caso genérico: 32+ caracteres de material opaco
 *                    contíguo não é prosa, e não há por que estar num log.
 */
const SECRET_SHAPES: Array<{ nome: string; re: RegExp }> = [
  { nome: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { nome: "bearer", re: /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi },
  { nome: "openai_anthropic", re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { nome: "google_aistudio", re: /\bAIza[A-Za-z0-9_-]{20,}\b/g },
  { nome: "google_aq", re: /\bAQ\.[A-Za-z0-9_-]{20,}\b/g },
  { nome: "elevenlabs", re: /\bxi-[A-Za-z0-9]{24,}\b/g },
  { nome: "heygen", re: /\bhg_[A-Za-z0-9]{24,}\b/g },
  // fal.ai — `<uuid>:<hex>`, e o par INTEIRO é o segredo. As duas metades vão
  // juntas num match só porque o `id` sozinho já identifica a credencial e a
  // metade hex sozinha é a senha: publicar uma delas entrega meio segredo, e
  // meio segredo num log é o que se vaza sem perceber.
  //
  // MEDIDO em 12/08, contra o redator de então: `uuid:32hex` passava INTEIRA,
  // em claro, e `uuid:64hex` saía com só a metade hex redigida (`uuid:***`).
  // Nenhum dos dois casos era coberto — o genérico `opaco` exige 40+ caracteres
  // contíguos, e nem o uuid (36) nem o hex de 32 chegam lá; o `:` corta o
  // match. Por isso este padrão existe, e por isso ele vem ANTES do opaco.
  //
  // `{32,}` cobre as duas formas medidas com uma régua só: nada a manter em dia
  // se a fal emitir um segredo mais longo.
  { nome: "fal", re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{32,}\b/gi },
  // Genérico, e o mais importante: qualquer bloco opaco longo. Fica por
  // último porque os específicos dão nome ao que foi encontrado, o que ajuda
  // a diagnosticar de onde veio.
  { nome: "opaco", re: /\b[A-Za-z0-9+/_-]{40,}={0,2}\b/g },
];

/** Pares `chave=valor` / `"chave": "valor"` cujo VALOR é segredo por posição. */
const SECRET_ASSIGNMENT =
  /((?:api[_-]?key|apikey|secret|password|senha|authorization|access[_-]?token|refresh[_-]?token|xi-api-key|x-api-key)["']?\s*[:=]\s*["']?)([^"'\s,&}\]]{6,})/gi;

/**
 * Redige uma string por FORMA. Aplicada a toda string do evento, em qualquer
 * profundidade.
 */
export function redactText(text: string): string {
  let out = text.replace(SECRET_ASSIGNMENT, `$1${REDACTED}`);
  for (const { re } of SECRET_SHAPES) {
    // `re` é global; `lastIndex` é reiniciado a cada uso porque `replace` com
    // /g já o faz. Reutilizar o objeto entre chamadas é seguro aqui, e evita
    // recompilar oito expressões por linha de log.
    out = out.replace(re, REDACTED);
  }
  return out;
}

/**
 * Percorre QUALQUER estrutura e redige as strings.
 *
 * Cobre objeto, array, array dentro de objeto, objeto dentro de array, e
 * qualquer aninhamento — o vazamento que motivou isto estava a um nível, mas
 * "um nível" nunca foi a garantia desejada.
 *
 * Nunca lança e nunca entra em laço infinito: referência circular vira um
 * marcador, porque um log que derruba o processo que deveria estar observando
 * é pior que log nenhum.
 */
export function redactDeep(value: unknown, vistos = new WeakSet<object>()): unknown {
  if (typeof value === "string") return redactText(value);
  if (value === null || typeof value !== "object") return value;

  if (vistos.has(value as object)) return "<circular>";
  vistos.add(value as object);

  if (Array.isArray(value)) return value.map((v) => redactDeep(v, vistos));

  // Error não é enumerável: `{...err}` perde message e stack, e é justamente
  // a `message` que carrega o corpo do fornecedor. Convertido à mão.
  if (value instanceof Error) {
    return { name: value.name, message: redactText(value.message), stack: redactText(value.stack ?? "") };
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = redactDeep(v, vistos);
  }
  return out;
}

/**
 * Publica um evento estruturado. **É o único caminho de saída de log deste
 * projeto**, e `npm run check` reprova quem publicar por fora.
 *
 * `level` decide entre stdout e stderr; a redação é a mesma nos dois, porque
 * um segredo em stdout não é menos segredo.
 */
export function logEvent(
  level: "info" | "warn" | "error",
  event: string,
  fields: Record<string, unknown> = {},
): void {
  try {
    const corpo = redactDeep({ event, ...fields });
    const linha = JSON.stringify(corpo);
    if (level === "error") console.error(linha);
    else if (level === "warn") console.warn(linha);
    else console.log(linha);
  } catch (err) {
    // Último recurso: nem o log pode derrubar a requisição que ele observa.
    console.error(`logEvent falhou para "${event}": ${err instanceof Error ? err.message : String(err)}`);
  }
}
