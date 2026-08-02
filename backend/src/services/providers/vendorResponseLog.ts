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
import { logEvent, redactText } from "../log/safeLog.js";

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

/**
 * Chaves cujo valor é VOLUMOSO e não tem valor diagnóstico nenhum em claro.
 *
 * Existe por causa do ElevenLabs: `audio_base64` traz o mp3 inteiro dentro do
 * JSON, e uma fala de 3 segundos já são ~50 KB de base64. Registrar isso não é
 * só desperdício de disco — é um log que ninguém consegue ler, onde o campo
 * que importa fica soterrado, e é exatamente o oposto do que o LOG-1 existe
 * para fazer. O que se preserva é o que responde as perguntas reais: veio
 * áudio? quantos bytes? Os bytes em si não dizem nada a quem depura.
 *
 * `alignment`/`normalized_alignment` entram pelo mesmo motivo de volume: são
 * arrays com um timestamp POR CARACTERE. O valor deles é lido pelo código
 * (é a fonte da duração real), não pelo humano que lê o log.
 */
const ELIDE_KEY_PATTERN = /^(audio_base64|audio|alignment|normalized_alignment)$/i;

/**
 * Teto de bytes por campo, INDEPENDENTE do nome.
 *
 * A lista de nomes acima é suposição: nenhum daqueles campos foi observado numa
 * resposta real do ElevenLabs — foram tirados da documentação. Se o vendor
 * chamar o áudio de outra coisa, ou se um fornecedor novo entrar, a elisão por
 * nome não pega nada e o log volta a engolir payload. Esta é a retaguarda que
 * não depende de acertar o nome.
 *
 * 2048 bytes, escolhido a partir de dado e não de gosto: o maior campo legítimo
 * já observado numa resposta real é a URL assinada da HeyGen, com **519
 * caracteres** (`data.video_url`; a thumbnail tem 519). O teto dá quase quatro
 * vezes essa folga, o que cobre também uma mensagem de erro longa em texto — e
 * ainda assim corta três ordens de grandeza abaixo de um mp3 em base64
 * (~64.000 caracteres para 3 segundos de fala).
 *
 * Errar para o lado de elidir é barato: sobra o tipo, o tamanho e o caminho do
 * campo, que é o que se usa para diagnosticar. Errar para o outro lado enche o
 * log de conteúdo que ninguém lê e que às vezes nem deveria ser retido.
 */
const MAX_FIELD_BYTES = 2048;

/** Descreve um valor volumoso sem registrar o conteúdo. */
function elide(value: unknown, motivo: "nome" | "tamanho" = "nome"): string {
  const por = motivo === "tamanho" ? " por tamanho" : "";
  if (typeof value === "string") return `<elidido${por}: string de ${value.length} chars>`;
  if (Array.isArray(value)) return `<elidido${por}: array de ${value.length} itens>`;
  if (value && typeof value === "object") {
    return `<elidido${por}: objeto{${Object.keys(value as object).join(", ")}}>`;
  }
  return `<elidido${por}: ${typeof value}>`;
}

/**
 * Tamanho serializado de um valor, para decidir a elisão por tamanho.
 *
 * Nunca lança: um valor com referência circular ou não serializável não pode
 * derrubar o log que existe para observar a falha. Quando não dá para medir,
 * trata como grande — errar para o lado de elidir é o lado barato.
 */
function serializedBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 0 : Buffer.byteLength(json, "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

/**
 * Substitui valores de chaves sensíveis e elide os volumosos, preservando a
 * forma do objeto.
 */
function maskSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskSecrets);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(k)) out[k] = REDACTED;
      else if (ELIDE_KEY_PATTERN.test(k)) out[k] = elide(v);
      // Retaguarda por TAMANHO: pega o campo volumoso cujo nome não está na
      // lista — que é o caso provável, já que a lista é suposição.
      else if (serializedBytes(v) > MAX_FIELD_BYTES) out[k] = elide(v, "tamanho");
      else out[k] = maskSecrets(v);
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

  logEvent("error", "vendor_contract_mismatch", { context, expectedPath, detail });
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
    logEvent("info", "vendor_response", { context: input.context,
        vendor: input.vendor,
        status: input.status,
        ok: input.res.ok,
        headers: safeHeaders(input.res),
        bodyBytes: input.rawBody.length,
        bodyForm,
        // Corpo INTEIRO, sem corte. Ver o cabeçalho deste arquivo.
        body,
      });
  } catch (err) {
    console.error("logVendorResponse falhou (seguindo mesmo assim):", redactText(String(err)));
  }
}

/**
 * Registra uma resposta cujo corpo é BINÁRIO — áudio, vídeo, imagem.
 *
 * Existe porque o endpoint simples de text-to-speech do ElevenLabs devolve o
 * mp3 cru, sem envelope JSON. Passar isso por `logVendorResponse` gravaria os
 * bytes do áudio no log, que é justamente o que não pode acontecer: o log
 * viraria ilegível, cresceria em megabytes por geração, e ainda por cima
 * guardaria a voz do cliente em texto de log — um dado que não temos motivo
 * para reter e que ninguém consegue usar para depurar.
 *
 * O que se registra é o que responde às perguntas de diagnóstico: chegou algo?
 * quantos bytes? de que tipo? com que status? O conteúdo, nunca.
 */
export function logVendorBinaryResponse(input: {
  context: string;
  vendor: string;
  status: number;
  res: Response;
  byteLength: number;
}): void {
  try {
    logEvent("info", "vendor_response", { context: input.context,
        vendor: input.vendor,
        status: input.status,
        ok: input.res.ok,
        headers: safeHeaders(input.res),
        bodyBytes: input.byteLength,
        bodyForm: "binario",
        // Sem campo `body`: não há o que registrar de um corpo binário além do
        // que já está acima. Um resumo textual aqui só daria a impressão de
        // que o conteúdo foi inspecionado.
        body: `<binário não registrado: ${input.byteLength} bytes>`,
      });
  } catch (err) {
    console.error("logVendorBinaryResponse falhou (seguindo mesmo assim):", redactText(String(err)));
  }
}

/**
 * Corta o que parece segredo num corpo que NÃO é JSON.
 *
 * Grosseiro de propósito: sem estrutura, a alternativa a uma heurística é não
 * registrar nada — e é justamente o corpo não-JSON (um HTML de 502, um texto
 * de erro de proxy) que costuma explicar as falhas mais confusas.
 */
/**
 * Mantido como nome próprio por já ser usado em `vendorError.ts`, mas o corpo
 * agora delega ao sumidouro: uma segunda implementação de "o que parece
 * segredo" divergiria da primeira em silêncio, e a divergência só apareceria
 * como um segredo que passou.
 */
export function scrubSecretsFromText(text: string): string {
  return redactText(text);
}
