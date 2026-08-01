/**
 * Registro da resposta BRUTA do fornecedor, antes de qualquer interpretação.
 *
 * A razão é concreta e cara: `avatarProvider.ts` carrega contratos marcados
 * `// ASSUMPTION` — o mais importante deles, `data.avatar_item.id`, nunca foi
 * confirmado contra uma resposta real. Se o parser errar o caminho DEPOIS de a
 * HeyGen ter cobrado pela criação do avatar, o dinheiro já saiu e o id, que é a
 * única coisa que torna aquele avatar utilizável, se perde com o corpo da
 * resposta descartado.
 *
 * O corpo vai INTEIRO para o log, sem truncar. Truncar é o instinto certo para
 * ruído e o errado para isto: o campo que falta é justamente o que ninguém
 * previu, e ele tende a estar no fim de um objeto aninhado. Um log cortado em
 * 500 caracteres resolveria o problema que não temos e perderia o que temos.
 *
 * Cabeçalhos de REQUISIÇÃO nunca são registrados — é onde a chave viaja
 * (`x-api-key`). Da resposta, só uma allowlist: o que ajuda a diagnosticar
 * (tipo do conteúdo, id da requisição do lado do fornecedor, limites de taxa)
 * e nada mais.
 */

/** Cabeçalhos de resposta que valem log. Fora daqui, nada é registrado. */
const HEADER_ALLOWLIST = [
  "content-type",
  "content-length",
  "date",
  "x-request-id",
  "request-id",
  "x-ratelimit-remaining",
  "x-ratelimit-limit",
  "retry-after",
];

/**
 * Chaves cujo VALOR é substituído antes de ir para o log.
 *
 * Deliberadamente estreita. Não inclui `video_url` nem `url`: elas carregam
 * token de assinatura, mas são o endereço do artefato — exatamente o que se
 * precisa para diagnosticar um download que falhou. Mascará-las tornaria o log
 * inútil para o caso mais provável, em troca de esconder algo que expira
 * sozinho e não dá acesso à conta.
 */
const SECRET_KEY_PATTERN = /(api[_-]?key|secret|password|authorization|access[_-]?token|refresh[_-]?token)/i;

const REDACTED = "***REDACTED***";

/** Substitui valores de chaves sensíveis, preservando a forma do objeto. */
function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? REDACTED : maskSecrets(v);
    }
    return out;
  }
  return value;
}

function safeHeaders(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of HEADER_ALLOWLIST) {
    const v = res.headers.get(name);
    if (v !== null) out[name] = v;
  }
  return out;
}

/**
 * Descreve a FORMA do que chegou: as chaves presentes em cada nível.
 *
 * É o que transforma "campo ausente" em algo acionável. Saber que o campo
 * esperado não veio não diz nada; saber que no lugar dele vieram
 * `["avatar_id","status"]` diz imediatamente onde o contrato mudou e qual é o
 * caminho novo.
 *
 * Só nomes de chave, nunca valores — a forma é o que interessa aqui, e valores
 * já foram para o log bruto logo antes.
 */
export function describeShape(value: unknown, depth = 3): string {
  if (value === null) return "null";
  if (value === undefined) return "ausente";
  if (Array.isArray(value)) {
    return depth <= 0 ? `array(${value.length})` : `array(${value.length}) de ${describeShape(value[0], depth - 1)}`;
  }
  if (typeof value !== "object") return typeof value;
  const keys = Object.keys(value as object);
  if (keys.length === 0) return "objeto vazio";
  if (depth <= 0) return `objeto{${keys.join(", ")}}`;
  const inner = keys
    .map((k) => `${k}: ${describeShape((value as Record<string, unknown>)[k], depth - 1)}`)
    .join(", ");
  return `{${inner}}`;
}

/**
 * Mensagem de erro de parsing que nomeia o que CHEGOU.
 *
 * `context` identifica a chamada, `expectedPath` o caminho que se esperava, e
 * a forma real vem junto. Quem lê isto às 3 da manhã não precisa de mais nada
 * para saber se o contrato mudou ou se a chamada falhou de outro jeito.
 */
export function unexpectedShapeMessage(context: string, expectedPath: string, body: unknown): string {
  return (
    `${context}: a resposta não trouxe "${expectedPath}". ` +
    `Forma recebida: ${describeShape(body)}. ` +
    "O corpo bruto completo está no log do servidor, no evento vendor_response."
  );
}

/**
 * Contrato quebrado NO PIOR MOMENTO: o fornecedor diz que concluiu, e a
 * resposta não traz o artefato.
 *
 * É diferente de um erro de geração, e a diferença importa em dinheiro. Aqui o
 * trabalho FOI feito e quase certamente foi cobrado — só não conseguimos ler
 * onde ele está. Por isso:
 *
 *  - **Falha na hora.** Continuar em polling até o teto transforma isto num
 *    "demorou mais que o esperado", que manda quem lê procurar lentidão onde
 *    houve contrato quebrado.
 *  - **NÃO estorna.** É exatamente a fronteira fixada no bloco ESTORNO-1: o
 *    estorno vale enquanto o fornecedor não aceitou o trabalho. Depois disso a
 *    cota dele já foi gasta, e devolver crédito seria dar de graça algo que já
 *    pagamos. Confirmado no código: `refundCredit()` só é chamado no `catch`
 *    de `generateVideo()` em `routes/videos.ts`; o laço de polling nunca
 *    estorna, e este caminho volta por ele.
 *  - **Registra o suficiente para recuperar à mão.** As chaves recebidas vão
 *    na mensagem, e o corpo inteiro já foi para o log em `vendor_response`.
 */
export function contractMismatch(context: string, expectedPath: string, body: unknown): string {
  const detail =
    `${context}: o fornecedor reportou CONCLUÍDO mas não devolveu "${expectedPath}". ` +
    "O trabalho foi feito e provavelmente cobrado — isto NÃO é um erro de geração e NÃO gera estorno. " +
    `Forma recebida: ${describeShape(body)}. ` +
    "O corpo bruto completo está no log do servidor, no evento vendor_response.";

  console.error(JSON.stringify({ event: "vendor_contract_mismatch", context, expectedPath, detail }));
  return detail;
}

/**
 * Registra a resposta bruta. Chamado ANTES de qualquer parsing.
 *
 * `rawBody` é o texto exato que chegou. Quando é JSON válido, também vai a
 * versão com segredos mascarados — as duas juntas, porque o texto cru é a
 * prova do que o fornecedor mandou e a versão em objeto é o que se lê.
 *
 * Nunca lança: um log que derruba a requisição que deveria estar observando é
 * pior que log nenhum.
 */
export function logVendorResponse(input: {
  context: string;
  vendor: string;
  status: number;
  res: Response;
  rawBody: string;
}): void {
  try {
    let body: unknown;
    let bodyForm: "json" | "texto";
    try {
      // Quando é JSON, o objeto mascarado É o corpo inteiro — nada some, só os
      // valores de chave sensível. Registrar TAMBÉM o texto cru seria anular a
      // máscara: a primeira versão deste arquivo fazia isso, e a prova do
      // bloco flagrou a chave aparecendo em claro no campo ao lado do
      // mascarado. Um segredo mascarado em um campo e legível no seguinte não
      // está mascarado.
      body = maskSecrets(JSON.parse(input.rawBody));
      bodyForm = "json";
    } catch {
      // Não é JSON (página de erro de proxy, HTML, texto). Aí não há estrutura
      // para mascarar por chave, então vai o texto — passado por uma varredura
      // que corta o que se PARECE com segredo. Continua sem truncar.
      body = scrubSecretsFromText(input.rawBody);
      bodyForm = "texto";
    }
    console.log(
      JSON.stringify({
        event: "vendor_response",
        context: input.context,
        vendor: input.vendor,
        status: input.status,
        ok: input.res.ok,
        headers: safeHeaders(input.res),
        bodyBytes: input.rawBody.length,
        bodyForm,
        // Corpo INTEIRO, sem corte. Ver o cabeçalho deste arquivo.
        body,
      }),
    );
  } catch (err) {
    console.error("logVendorResponse falhou (seguindo mesmo assim)", err);
  }
}

/**
 * Corta o que parece segredo num corpo que NÃO é JSON.
 *
 * Grosseiro de propósito: sem estrutura, a alternativa a uma heurística é não
 * registrar nada — e é justamente o corpo não-JSON (um HTML de 502, um texto
 * de erro de proxy) que costuma explicar as falhas mais confusas.
 */
function scrubSecretsFromText(text: string): string {
  return text
    .replace(/(api[_-]?key|secret|password|authorization|token)("?\s*[:=]\s*"?)[^"\s,&}]+/gi, `$1$2${REDACTED}`)
    .replace(/\b(sk-[A-Za-z0-9-]{8,}|AIza[A-Za-z0-9_-]{8,})\b/g, REDACTED);
}
