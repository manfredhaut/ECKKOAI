/**
 * Cliente da fal.ai — upload, submissão POR FILA, leitura de status e resultado.
 *
 * ┌─ O que este arquivo é, e o que ele NÃO é ───────────────────────────────┐
 * │ É o TRANSPORTE. Não há pipeline aqui: nada nele decide gerar imagem,    │
 * │ animar ou sincronizar lábios, e `generateVideo` continua despachando só │
 * │ heygen/did. O encadeamento das três etapas é o BLOCO 4.                 │
 * │                                                                         │
 * │ Nenhuma chamada real saiu deste arquivo até agora: ele foi escrito e    │
 * │ provado com `globalThis.fetch` substituído. Toda forma de resposta      │
 * │ abaixo está marcada NÃO VERIFICADA — nenhuma resposta real da fal.ai    │
 * │ foi observada por este projeto, e o repositório inteiro não tem uma     │
 * │ linha de registro das gerações que o operador aprovou lá.               │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ FILA, SEMPRE. Por que `fal.run` síncrono não aparece aqui ─────────────┐
 * │ A fal expõe o mesmo modelo por dois caminhos: `fal.run/{id}` responde   │
 * │ na mesma conexão, e `queue.fal.run/{id}` devolve um `request_id` na     │
 * │ hora e faz o trabalho atrás.                                            │
 * │                                                                         │
 * │ O síncrono é inaceitável AQUI pelo mesmo motivo que já custou vídeo     │
 * │ neste projeto: um socket pendurado deixa o trabalho pago sem PONTEIRO.  │
 * │ Com a fila, o `request_id` chega antes de o trabalho começar, e um      │
 * │ processo morto no meio perde tempo — não dinheiro. Sem ele, morrer no   │
 * │ meio da resposta é perder o resultado inteiro sem nada para recuperar,  │
 * │ que é exatamente o estado "queued para sempre, sem estorno" registrado  │
 * │ no CLAUDE.md.                                                           │
 * │                                                                         │
 * │ Por isso a base da fila é a ÚNICA base de submissão neste arquivo, e há │
 * │ guarda ancorada no uso (`checkFalClientPolicy`) que observa a URL       │
 * │ realmente alcançada — não o texto da constante.                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A CHAVE VEM DO TENANT (`api_credentials`, par avatar+fal), nunca de
 * `platform_credentials`. Está MEDIDO que a chave de plataforma não tem
 * consumidor neste caminho, e supor o contrário custou um dia em 09/08.
 * `resolveFalApiKey()` é o único lugar deste arquivo que sabe de onde a chave
 * vem, e ele lê a do tenant.
 */
import { getCredential } from "../credentialLookup.js";
import { describeNetworkError, logProviderNetworkError } from "./networkError.js";
import { VENDOR_ENDPOINTS } from "./endpointCatalog.js";
import { isFixtureMode } from "./providerMode.js";
import { logVendorResponse, unexpectedShapeMessage } from "./vendorResponseLog.js";
import { vendorSignal } from "./vendorTimeout.js";

/** Erro NOSSO. Distingui-lo do erro de fornecedor é o que permite não estornar errado. */
export class FalProviderError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "FalProviderError";
    this.status = status;
  }
}

/**
 * Storage. Host separado do de execução — `rest.fal.ai` guarda arquivo,
 * `queue.fal.run` faz trabalho.
 */
const FAL_STORAGE_BASE = "https://rest.fal.ai";

/**
 * A fila. É a ÚNICA base de submissão deste arquivo, e trocá-la pelo host
 * síncrono é o mutante `a submissão volta a sair pelo fal.run síncrono`.
 */
const FAL_QUEUE_BASE = "https://queue.fal.run";

/** Caminho de iniciação do upload; o `storage_type` vai na query. */
const FAL_UPLOAD_INITIATE_PATH = "/storage/upload/initiate";

/**
 * Em fixture nada sai daqui. O host tem "exemplo" de propósito: a guarda de
 * egresso varre `https://…` literal e cobra que todo fornecedor alcançado
 * esteja no catálogo — um host de mentira sem essa marca entraria na varredura
 * como fornecedor desconhecido.
 */
const FIXTURE_BASE = "https://exemplo.fal.invalido";

/** Status da fila, normalizado. O vocabulário do fornecedor é NÃO VERIFICADO. */
export type FalQueueStatus = "queued" | "processing" | "completed" | "failed";

export interface FalSubmitResult {
  requestId: string;
  /**
   * As URLs que a FILA devolveu, para serem SEGUIDAS — nunca montadas.
   *
   * MEDIDO em 13/08, e custou US$ 0,08 para descobrir: o caminho de status usa
   * o app id BASE (`fal-ai/nano-banana-2`), sem o sub-path do endpoint
   * (`/edit`). A URL montada com o sub-path devolve **405**, e o trabalho já
   * estava pago e rodando quando isso apareceu.
   *
   * Seguir o que o fornecedor devolve não é só mais curto: é a única forma que
   * não depende de adivinhar a regra de composição do caminho dele.
   */
  statusUrl: string;
  responseUrl: string;
}

/**
 * A chave da fal DO TENANT.
 *
 * `getCredential(tenantId, "avatar")` é o mesmo caminho que heygen e did já
 * usam — `api_credentials`, coluna `encrypted_key`, decifrada ali dentro. A
 * exigência de `vendor === "fal"` não é formalidade: sem ela, um tenant com
 * HeyGen conectada mandaria a chave da HeyGen para a fal.ai, que é o vazamento
 * gêmeo do que o BLOCO 2 fechou no botão "Testar" (ternário sem ramo "nenhum
 * dos dois").
 */
export async function resolveFalApiKey(tenantId: string): Promise<string> {
  const cred = await getCredential(tenantId, "avatar");
  if (!cred) {
    throw new FalProviderError(
      "fal: este tenant não tem credencial de avatar conectada. A chave da fal é POR TENANT " +
        "(api_credentials, par avatar+fal) — não existe chave de plataforma para este caminho.",
    );
  }
  if (cred.vendor !== "fal") {
    throw new FalProviderError(
      `fal: a credencial de avatar deste tenant é do vendor "${cred.vendor}", não "fal". ` +
        "Usar a chave assim mandaria a credencial de um fornecedor para outro.",
    );
  }
  return cred.apiKey;
}

/**
 * O endpoint está no catálogo?
 *
 * O catálogo é o freio de rede: um endpoint que não está lá é invisível para a
 * conta de custo e para o freio do probe de validação. A checagem acontece
 * ANTES de qualquer `fetch` — recusar depois de a requisição sair não recusa
 * nada.
 */
/**
 * A URL veio da FILA?
 *
 * O catálogo barra o ENDPOINT na submissão; esta trava cuida do passo seguinte,
 * em que a URL não é escolhida por nós e sim devolvida pelo fornecedor. Seguir
 * cegamente o que vem na resposta seria deixar o outro lado apontar para
 * qualquer host — inclusive o `fal.run` síncrono, que é o que a guarda G-1
 * existe para impedir.
 */
export function assertUrlDaFila(url: string, contexto: string): void {
  if (!url.startsWith(`${FAL_QUEUE_BASE}/`)) {
    throw new FalProviderError(
      `fal: ${contexto} recebeu a URL ${JSON.stringify(url)}, que não é da fila ` +
        `(${FAL_QUEUE_BASE}). As URLs de status e resultado são SEGUIDAS, e não montadas — mas seguir ` +
        "não pode virar seguir qualquer coisa: um host fora da fila aqui é o caminho síncrono voltando " +
        "pela porta dos fundos.",
    );
  }
}

export function assertFalEndpointNoCatalogo(endpointId: string): void {
  const caminho = endpointId.startsWith("/") ? endpointId : `/${endpointId}`;
  const conhecido = VENDOR_ENDPOINTS.some((e) => e.vendor === "fal" && e.path === caminho);
  if (!conhecido) {
    throw new FalProviderError(
      `fal: o endpoint "${endpointId}" não consta do catálogo de endpoints e por isso não é ` +
        "alcançável. Todo endpoint tarifável deste projeto entra no catálogo primeiro — é dele que " +
        "o freio deriva, e um endpoint fora dele não aparece em conta de custo nenhuma.",
    );
  }
}

/**
 * Lê a resposta como TEXTO, registra bruta e só então interpreta.
 *
 * Mesma forma do `fetchJson` do avatarProvider, e pelo mesmo motivo: o corpo
 * vai ao log antes de qualquer parsing, porque o campo que falta é justamente
 * o que ninguém previu — e quando ele falta, o trabalho já foi cobrado.
 */
async function falFetchJson(res: Response, context: string): Promise<any> {
  const rawBody = await res.text();
  logVendorResponse({ context, vendor: "fal", status: res.status, res, rawBody });

  if (!res.ok) {
    throw new FalProviderError(`fal API error (${res.status}): ${rawBody}`, res.status);
  }
  try {
    return JSON.parse(rawBody);
  } catch {
    throw new FalProviderError(
      `${context}: a fal respondeu ${res.status} com corpo que não é JSON: ${rawBody}`,
    );
  }
}

/**
 * Sobe um arquivo e devolve a URL pública dele.
 *
 * Dois passos, como a fal documenta: `initiate` devolve `{file_url, upload_url}`
 * e o PUT no `upload_url` entrega os bytes. NÃO VERIFICADO — nenhuma resposta
 * real foi observada.
 *
 * O PUT vai a um host que o FORNECEDOR escolhe (CDN), e por isso ele não passa
 * pelo catálogo: não há URL literal a catalogar, e o passo não dispara trabalho
 * tarifado — quem dispara é a submissão. O que o catálogo cobre é o `initiate`.
 */
export async function falUpload(
  apiKey: string,
  buffer: Buffer,
  mimeType: string,
  fileName?: string,
): Promise<string> {
  if (isFixtureMode()) {
    const extensao = mimeType.split("/")[1] ?? "bin";
    return `${FIXTURE_BASE}/fixture-upload/${buffer.length}.${extensao}`;
  }

  const nome = fileName ?? `asset.${mimeType.split("/")[1] ?? "bin"}`;

  let res: Response;
  try {
    res = await fetch(`${FAL_STORAGE_BASE}${FAL_UPLOAD_INITIATE_PATH}?storage_type=fal-cdn-v3`, {
      method: "POST",
      headers: { authorization: `Key ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ content_type: mimeType, file_name: nome }),
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("falClient.upload", err);
    throw new FalProviderError(`Could not reach fal API: ${describeNetworkError(err)}`);
  }

  const data = await falFetchJson(res, "fal.upload.initiate");
  const fileUrl = data?.file_url;
  const uploadUrl = data?.upload_url;
  if (!fileUrl) {
    throw new FalProviderError(unexpectedShapeMessage("fal.upload.initiate", "file_url", data));
  }
  if (!uploadUrl) {
    throw new FalProviderError(unexpectedShapeMessage("fal.upload.initiate", "upload_url", data));
  }

  let put: Response;
  try {
    put = await fetch(String(uploadUrl), {
      method: "PUT",
      headers: { "content-type": mimeType },
      body: new Uint8Array(buffer),
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("falClient.upload", err);
    throw new FalProviderError(`Could not reach fal storage: ${describeNetworkError(err)}`);
  }
  // O PUT não devolve JSON útil, mas a resposta vai ao log igual: um 403 do CDN
  // com corpo em XML é o tipo de coisa que só aparece depois, e sem registro
  // vira "o upload falhou" sem mais nada.
  logVendorResponse({
    context: "fal.upload.put",
    vendor: "fal",
    status: put.status,
    res: put,
    rawBody: await put.text(),
  });
  if (!put.ok) {
    throw new FalProviderError(`fal storage PUT falhou (${put.status})`, put.status);
  }

  return String(fileUrl);
}

/**
 * Submete um trabalho À FILA e devolve o `request_id`.
 *
 * ┌─ `onRequestId` é obrigatório, e a ordem em que ele é chamado é a razão ──┐
 * │ O `request_id` é o ÚNICO ponteiro para um trabalho que já foi aceito e   │
 * │ portanto já custa. Ele é entregue a quem persiste ANTES de qualquer      │
 * │ processamento local — antes de conferir o `status_url`, antes de montar  │
 * │ o retorno. Assim, tudo que der errado daqui para baixo perde tempo e     │
 * │ não perde o ponteiro.                                                    │
 * │                                                                          │
 * │ Um parâmetro opcional não serviria: o defeito não é esquecer de gravar,  │
 * │ é gravar TARDE, e opcional torna "não gravou" um estado legítimo.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export async function falSubmit(
  apiKey: string,
  endpointId: string,
  input: Record<string, unknown>,
  onRequestId: (requestId: string) => Promise<void> | void,
): Promise<FalSubmitResult> {
  assertFalEndpointNoCatalogo(endpointId);

  if (isFixtureMode()) {
    const requestId = `fixture-fal-${endpointId.replace(/[^a-z0-9]+/gi, "-")}`;
    await onRequestId(requestId);
    return {
      requestId,
      statusUrl: `${FAL_QUEUE_BASE}/fixture/requests/${requestId}/status`,
      responseUrl: `${FAL_QUEUE_BASE}/fixture/requests/${requestId}`,
    };
  }

  let res: Response;
  try {
    res = await fetch(`${FAL_QUEUE_BASE}/${endpointId}`, {
      method: "POST",
      headers: { authorization: `Key ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(input),
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("falClient.submit", err);
    throw new FalProviderError(`Could not reach fal API: ${describeNetworkError(err)}`);
  }

  const data = await falFetchJson(res, "fal.queue.submit");
  const requestId = data?.request_id;
  if (!requestId) {
    throw new FalProviderError(unexpectedShapeMessage("fal.queue.submit", "request_id", data));
  }

  // PERSISTÊNCIA PRIMEIRO. Nada de local acontece antes desta linha.
  await onRequestId(String(requestId));

  // Só agora o processamento local. O `status_url` é do fornecedor e serve de
  // conferência do contrato: se ele apontar para fora da fila, o trabalho foi
  // aceito por um caminho que não é o que este arquivo pediu — e nesse caso o
  // ponteiro já está salvo, que é o ponto da ordem acima.
  const statusUrl = String(data?.status_url ?? "");
  const responseUrl = String(data?.response_url ?? "");
  if (!responseUrl.startsWith(`${FAL_QUEUE_BASE}/`)) {
    throw new FalProviderError(
      `fal.queue.submit: a fila devolveu response_url ${JSON.stringify(responseUrl)}, que não é da fila. ` +
        `O request_id ${String(requestId)} JÁ foi gravado — o trabalho existe e é recuperável por ele.`,
    );
  }
  if (!statusUrl.startsWith(`${FAL_QUEUE_BASE}/`)) {
    throw new FalProviderError(
      `fal.queue.submit: a fila devolveu status_url ${JSON.stringify(statusUrl)}, que não é da fila. ` +
        `O request_id ${String(requestId)} JÁ foi gravado — o trabalho existe e é recuperável por ele.`,
    );
  }

  return { requestId: String(requestId), statusUrl, responseUrl };
}

/**
 * Uma leitura de status. O LAÇO é de quem chama.
 *
 * Mesma divisão de `pollVideoJob` no avatarProvider: laço dentro do cliente
 * esconderia o teto de tempo e o número de tentativas de quem paga por elas.
 */
export async function falPoll(
  apiKey: string,
  statusUrl: string,
): Promise<{ status: FalQueueStatus; raw: unknown }> {
  assertUrlDaFila(statusUrl, "falPoll");

  if (isFixtureMode()) {
    return { status: "completed", raw: { status: "COMPLETED", status_url: statusUrl } };
  }

  let res: Response;
  try {
    res = await fetch(statusUrl, {
      method: "GET",
      headers: { authorization: `Key ${apiKey}` },
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("falClient.poll", err);
    throw new FalProviderError(`Could not reach fal API: ${describeNetworkError(err)}`);
  }

  const data = await falFetchJson(res, "fal.queue.status");
  return { status: normalizeFalStatus(data?.status), raw: data };
}

/**
 * O vocabulário da fila. NÃO VERIFICADO: os valores vêm da documentação, não de
 * resposta observada.
 *
 * O default é `processing`, e não `failed`: um estado desconhecido significa
 * que o trabalho pode estar vivo, e tratá-lo como falha abandonaria algo já
 * pago. Quem trata o teto de tempo é o chamador.
 */
function normalizeFalStatus(bruto: unknown): FalQueueStatus {
  switch (String(bruto ?? "").toUpperCase()) {
    case "IN_QUEUE":
      return "queued";
    case "COMPLETED":
    case "OK":
      return "completed";
    case "FAILED":
    case "ERROR":
      return "failed";
    default:
      return "processing";
  }
}

/** A saída do trabalho concluído. */
export async function falResult(apiKey: string, responseUrl: string): Promise<unknown> {
  assertUrlDaFila(responseUrl, "falResult");

  if (isFixtureMode()) {
    return { fixture: true, response_url: responseUrl };
  }

  let res: Response;
  try {
    res = await fetch(responseUrl, {
      method: "GET",
      headers: { authorization: `Key ${apiKey}` },
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("falClient.result", err);
    throw new FalProviderError(`Could not reach fal API: ${describeNetworkError(err)}`);
  }

  return await falFetchJson(res, "fal.queue.result");
}
