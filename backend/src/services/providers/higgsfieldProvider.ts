/**
 * ABAS-29, 30/09/2026 -- primeira chamada REAL a Higgsfield (Fase 5 do
 * plano). Base URL e contrato confirmados contra a documentacao oficial
 * (docs.higgsfield.ai) em 30/09/2026:
 *
 * - Cabecalho: "Authorization: Key ID:SECRET" -- bate exatamente com o
 *   formato ja armazenado em PLATFORM_HIGGSFIELD_API_KEY (ver
 *   platformCredentials.ts: a credencial chega como UM par "KeyID:Secret"
 *   junto, decisao ja confirmada em 29/09 -- ABAS-4).
 * - Fluxo: POST /{model_id} (enfileira) -> GET /requests/{id}/status
 *   (sonda) -> POST /requests/{id}/cancel (cancela, so antes de comecar a
 *   processar).
 * - MEDIDO em 30/09: os dois hosts da documentacao (platform.higgsfield.ai
 *   e api.higgsfield.ai) respondem IDENTICO -- mesmo status, mesmo corpo,
 *   testados contra os 3 modelos do catalogo. Sao aliases do mesmo
 *   backend. Fica com platform.higgsfield.ai (o que a referencia geral
 *   chama de "estavel").
 * - MEDIDO em 30/09: Soul 2 e Marketing Studio Image sao reconhecidos
 *   pela API de verdade (400 de validacao de parametro, nao 404) --
 *   confirma que os ids corrigidos em creativeCatalog.ts estao certos.
 *   Marketing Studio Image chegou a devolver 200 real:
 *   {"credits":"3.538","usd":"0.222"} para uma imagem 1k.
 *
 * /estimate e de LEITURA/SIMULACAO por contrato do proprio fornecedor
 * (docs/concepts/billing-and-retention: "Use the estimate endpoint...
 * before submitting generation" -- devolve custo sem cobrar nada, nunca
 * gera). Por isso, diferente de submeter uma geracao de verdade, chamar
 * /estimate nao entra na categoria de "teste real/pago so por clique do
 * usuario" -- e o mesmo tipo de chamada que validatePlatformCredential
 * ja faz para os outros fornecedores (platformKeyProbe.ts).
 *
 * submitCreativeJob() JA GERA DE VERDADE E COBRA -- nunca deve ser
 * chamada por mim, so a partir do clique real do operador na tela
 * (mesma regra de todo teste real/pago deste projeto).
 *
 * PENDENCIA REGISTRADA (30/09): bytedance/seedance-2.5/image-to-video
 * exige `image_url` obrigatorio, e a tela de Criativos hoje (modos
 * broll/propaganda) so coleta `prompt` -- nao existe lugar para
 * fornecer uma imagem de referencia ainda. submitCreativeJob() aceita
 * qualquer corpo (nao valida por modelo), mas o CHAMADOR (creativeJobs.ts)
 * ainda nao tem de onde tirar esse campo para o Seedance -- decisao do
 * operador pendente: trocar para text-to-video (so prompt, mais simples)
 * ou somar upload de imagem de referencia a tela.
 *
 * PAINEL-SEEDANCE-1, 01/10/2026 — duration/resolution confirmados contra
 * a doc oficial da Higgsfield (open.higgsfield.ai/models/bytedance/
 * seedance-2.5/image-to-video e .../text-to-video): ambos agora vao no
 * corpo, com default (5s/720p) quando a tela nao manda valor, e editaveis
 * pela tela (slider de duracao + chips de resolucao) quando manda.
 * GERACAO REAL ainda NAO exercitada contra a API autenticada — só a
 * montagem do corpo foi provada, por execucao local.
 */
import { resolvePlatformKey } from "../platformCredentialStore.js";
import { describeNetworkError, logProviderNetworkError } from "./networkError.js";
import { vendorSignal } from "./vendorTimeout.js";
import { logVendorResponse } from "./vendorResponseLog.js";
import { logEvent } from "../log/safeLog.js";
import { saveUpload } from "../storage.js";
import type { CreativeJobPollResult } from "./creativeTypes.js";

// MEDIDO 30/09: platform.higgsfield.ai e api.higgsfield.ai respondem
// identico -- ver cabecalho do arquivo.
export const HIGGSFIELD_BASE_URL = "https://platform.higgsfield.ai";

export class HiggsfieldNotConfiguredError extends Error {}
export class HiggsfieldProviderError extends Error {}

async function resolverCredencial(): Promise<string> {
  const resolved = await resolvePlatformKey("higgsfield");
  if (!resolved) {
    throw new HiggsfieldNotConfiguredError("Credencial da Higgsfield nao configurada.");
  }
  return resolved.value;
}

/**
 * MEDIDO 30/09: a resposta de /estimate varia por modelo -- modelos com
 * preco fechado por chamada devolvem {type:"estimate", credits, usd}
 * (ex.: Marketing Studio Image, US$0.222 medido de verdade); modelos
 * cujo preco depende de parametros de saida nao fornecidos devolvem
 * {type:"description", pricing_description} em vez de um numero (ex.:
 * Seedance 2.5 sem resolucao/duracao de saida no corpo de teste).
 */
export type HiggsfieldEstimateResult =
  | { type: "estimate"; credits: string; usd: string }
  | { type: "description"; pricingDescription: string };

/**
 * Estimativa de custo -- NUNCA gera, NUNCA cobra (contrato do proprio
 * fornecedor, ver cabecalho). O corpo precisa bater com o que a geracao
 * real enviaria, para a estimativa valer.
 */
export async function estimateCreativeJob(
  modelId: string,
  body: Record<string, unknown>,
): Promise<HiggsfieldEstimateResult> {
  const apiKey = await resolverCredencial();
  let res: Response;
  try {
    res = await fetch(`${HIGGSFIELD_BASE_URL}/estimate/${modelId}`, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("higgsfieldProvider.estimate", err);
    throw new HiggsfieldProviderError(`Could not reach Higgsfield API: ${describeNetworkError(err)}`);
  }
  const rawBody = await res.text();
  logVendorResponse({ context: "higgsfield.estimate", vendor: "Higgsfield", status: res.status, res, rawBody });
  if (!res.ok) {
    throw new HiggsfieldProviderError(`Higgsfield estimate error (${res.status}): ${rawBody}`);
  }
  const data = JSON.parse(rawBody) as {
    type?: string;
    credits?: string;
    usd?: string;
    pricing_description?: string;
  };
  if (data.type === "description" && data.pricing_description) {
    return { type: "description", pricingDescription: data.pricing_description };
  }
  return { type: "estimate", credits: data.credits ?? "0", usd: data.usd ?? "0" };
}

export interface HiggsfieldSubmitResult {
  requestId: string;
  statusUrl: string;
  cancelUrl: string;
}

/**
 * GERA DE VERDADE E COBRA. So deve ser chamada a partir do clique real
 * do operador na tela -- ver cabecalho do arquivo.
 */
export async function submitCreativeJob(
  modelId: string,
  body: Record<string, unknown>,
): Promise<HiggsfieldSubmitResult> {
  const apiKey = await resolverCredencial();
  let res: Response;
  try {
    res = await fetch(`${HIGGSFIELD_BASE_URL}/${modelId}`, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("higgsfieldProvider.submit", err);
    throw new HiggsfieldProviderError(`Could not reach Higgsfield API: ${describeNetworkError(err)}`);
  }
  const rawBody = await res.text();
  logVendorResponse({ context: "higgsfield.submit", vendor: "Higgsfield", status: res.status, res, rawBody });
  if (!res.ok) {
    throw new HiggsfieldProviderError(`Higgsfield submit error (${res.status}): ${rawBody}`);
  }
  const data = JSON.parse(rawBody) as { request_id: string; status_url: string; cancel_url: string };
  return { requestId: data.request_id, statusUrl: data.status_url, cancelUrl: data.cancel_url };
}

interface HiggsfieldStatusResponse {
  status: "queued" | "in_progress" | "completed" | "failed" | "nsfw";
  request_id: string;
  error?: string;
  // MEDIDO contra a doc oficial: modelos de IMAGEM devolvem `images`
  // (array), modelos de VIDEO devolvem `video` (objeto unico) -- os dois
  // sao checados aqui, nunca assumido qual forma o modelo chamador usa.
  images?: { url: string }[];
  video?: { url: string };
}

/**
 * Sonda o estado de uma geracao ja submetida. NUNCA guarda a URL do
 * fornecedor direto -- baixa o arquivo de verdade e salva em /uploads
 * (mesma disciplina de todo provedor deste projeto), por isso precisa
 * de `tenantId` mesmo a chamada de status em si nao precisando dele.
 */
export async function pollCreativeJobHiggsfield(
  tenantId: string,
  requestId: string,
): Promise<CreativeJobPollResult> {
  const apiKey = await resolverCredencial();
  let res: Response;
  try {
    res = await fetch(`${HIGGSFIELD_BASE_URL}/requests/${requestId}/status`, {
      headers: { Authorization: `Key ${apiKey}` },
      signal: vendorSignal(),
    });
  } catch (err) {
    logProviderNetworkError("higgsfieldProvider.poll", err);
    throw new HiggsfieldProviderError(`Could not reach Higgsfield API: ${describeNetworkError(err)}`);
  }
  const rawBody = await res.text();
  logVendorResponse({ context: "higgsfield.poll", vendor: "Higgsfield", status: res.status, res, rawBody });
  if (!res.ok) {
    throw new HiggsfieldProviderError(`Higgsfield status error (${res.status}): ${rawBody}`);
  }
  const data = JSON.parse(rawBody) as HiggsfieldStatusResponse;

  if (data.status === "queued" || data.status === "in_progress") {
    return { status: "processing" };
  }

  if (data.status === "completed") {
    const remoteUrl = data.video?.url ?? data.images?.[0]?.url;
    if (!remoteUrl) {
      return {
        status: "error",
        errorMessage: "Higgsfield reportou concluído mas não devolveu nenhuma URL de saída.",
      };
    }
    let fileRes: Response;
    try {
      fileRes = await fetch(remoteUrl, { signal: vendorSignal() });
    } catch (err) {
      logProviderNetworkError("higgsfieldProvider.download", err);
      return {
        status: "error",
        errorMessage: `Geração concluída e cobrada, mas o download falhou: ${describeNetworkError(err)}`,
      };
    }
    if (!fileRes.ok) {
      return {
        status: "error",
        errorMessage: `Geração concluída e cobrada, mas o download falhou (status ${fileRes.status}).`,
      };
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    const nomeOriginal = new URL(remoteUrl).pathname.split("/").pop() || "higgsfield-output";
    const outputUrl = await saveUpload(tenantId, buffer, nomeOriginal);
    return { status: "ready", outputUrl };
  }

  // failed ou nsfw -- os dois terminais, nenhum cobrado (ver docs:
  // "Failed and NSFW requests are not charged").
  return {
    status: "error",
    errorMessage:
      data.status === "nsfw"
        ? "Conteúdo recusado pelo filtro de moderação do fornecedor (nsfw)."
        : (data.error ?? "A geração falhou no fornecedor, sem motivo detalhado."),
  };
}

/**
 * Cancela uma geração ainda na fila (antes de começar a processar) --
 * 202 se cancelou, 400 se já tinha começado. Best-effort: nunca lança,
 * porque cancelar é uma tentativa de limpeza, não deveria derrubar o
 * fluxo que a chamou.
 */
export interface CorpoHiggsfield {
  modelIdReal: string;
  body: Record<string, unknown>;
}

/**
 * Monta o model_id REAL e o corpo da submissao, por modelo do
 * catalogo (creativeCatalog.ts). PURA -- nenhuma chamada de rede.
 *
 * Para broll/propaganda (Seedance 2.5), decide image-to-video vs
 * text-to-video com base em imagemReferenciaUrl estar presente ou
 * nao -- ver pendencia no cabecalho do arquivo (ABAS-30 resolveu:
 * os dois sao suportados, a escolha e automatica por modelo).
 *
 * resolution: SEM controle de tela ainda para Soul 2 (720p/1080p) 
 * nem Marketing Studio Image (1k/2k/4k) -- MEDIDO em 30/09 que
 * "1k" e INVALIDO para Soul 2 (erro 400 real). Default escolhido
 * aqui (1080p/2k) ate a tela ganhar esse controle.
 */
export function construirCorpoHiggsfield(
  modeloId: string,
  entrada: {
    prompt: string;
    aspectRatio: string | null;
    imagemReferenciaUrl: string | null;
    // PAINEL-SEEDANCE-1, 01/10/2026 — confirmados contra a doc oficial da
    // Higgsfield (open.higgsfield.ai/models/bytedance/seedance-2.5/*):
    // duration inteiro 4-30s, resolution 480p/720p/1080p. Opcionais porque
    // só se aplicam ao Seedance — Soul 2 e Marketing Studio Image (imagem)
    // continuam com resolution própria, fixa, mais abaixo.
    videoDuracaoSegundos?: number | null;
    videoResolution?: "480p" | "720p" | "1080p" | null;
    // PAINEL-GENJUTSU-1, 02/10/2026 -- só para o Genjutsu Object Swap
    // (Etapa 7): vídeo de origem (upload prévio, 4-30s) + 1-8 imagens do
    // novo produto. Nenhum outro modelo usa estes dois campos.
    videoUrlFonte?: string | null;
    imagensReferenciaUrls?: string[] | null;
  },
): CorpoHiggsfield {
  if (modeloId === "higgsfield-ai/soul/v2/standard") {
    return {
      modelIdReal: modeloId,
      body: {
        prompt: entrada.prompt,
        aspect_ratio: entrada.aspectRatio ?? "1:1",
        resolution: "1080p",
      },
    };
  }
  if (modeloId === "marketing-studio/image") {
    // PAINEL-REF-IMAGEM-1, 01/10/2026 — confirmado contra a doc oficial
    // (docs.higgsfield.ai/docs/models/marketing-studio-image/generate-and-
    // edit): `image_urls` aceita até 16 URLs; omitir o campo é geração por
    // texto puro (comportamento de antes desta mudança, preservado).
    // Soul 2 (ramo acima) NÃO tem este campo no schema — se uma
    // referência for escolhida com Soul 2 selecionado, ela é
    // silenciosamente ignorada aqui, e a tela já avisa disso antes do
    // clique (referenceImageHintSoul2).
    return {
      modelIdReal: modeloId,
      body: {
        prompt: entrada.prompt,
        aspect_ratio: entrada.aspectRatio ?? "1:1",
        resolution: "2k",
        ...(entrada.imagemReferenciaUrl ? { image_urls: [entrada.imagemReferenciaUrl] } : {}),
      },
    };
  }
  if (modeloId === "bytedance/seedance-2.5/image-to-video") {
    const duration = entrada.videoDuracaoSegundos ?? 5;
    const resolution = entrada.videoResolution ?? "720p";
    if (entrada.imagemReferenciaUrl) {
      return {
        modelIdReal: "bytedance/seedance-2.5/image-to-video",
        body: { image_url: entrada.imagemReferenciaUrl, prompt: entrada.prompt, duration, resolution },
      };
    }
    return {
      modelIdReal: "bytedance/seedance-2.5/text-to-video",
      body: { prompt: entrada.prompt, aspect_ratio: entrada.aspectRatio ?? "16:9", duration, resolution },
    };
  }
  if (modeloId === "higgsfield/genjutsu/object-swap/v1.0") {
    if (!entrada.videoUrlFonte || !entrada.imagensReferenciaUrls || entrada.imagensReferenciaUrls.length === 0) {
      throw new HiggsfieldProviderError(
        "Genjutsu Object Swap exige um vídeo de origem e ao menos 1 imagem de referência.",
      );
    }
    return {
      modelIdReal: modeloId,
      body: {
        video_url: entrada.videoUrlFonte,
        image_urls: entrada.imagensReferenciaUrls,
        prompt: entrada.prompt,
        resolution: entrada.videoResolution ?? "720p",
      },
    };
  }
  throw new HiggsfieldProviderError(
    `Sem corpo de submissão desenhado para o modelo "${modeloId}".`,
  );
}

export async function cancelCreativeJob(requestId: string): Promise<boolean> {
  const apiKey = await resolverCredencial();
  try {
    const res = await fetch(`${HIGGSFIELD_BASE_URL}/requests/${requestId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Key ${apiKey}` },
      signal: vendorSignal(),
    });
    return res.status === 202;
  } catch (err) {
    logProviderNetworkError("higgsfieldProvider.cancel", err);
    return false;
  }
}

/**
 * ABAS-29 -- reconciliação no boot para creative_jobs reais presos em
 * voo (enviando/na_fila/gerando). DIFERENTE da reconciliação de
 * exportação (exportRunner.ts): um job aqui pode já ter sido COBRADO
 * pelo fornecedor -- marcar como falha sem checar primeiro enganaria o
 * operador sobre o que foi gasto. Por isso RECONSULTA de verdade
 * (pollCreativeJobHiggsfield), nunca assume.
 *
 * Um job preso em "enviando" SEM request_id (caiu antes do POST real
 * terminar) não tem o que reconsultar -- vira "incerto", o estado que a
 * própria tabela já reserva para exatamente este caso (nunca "falhou",
 * que afirmaria sem saber que nada foi cobrado).
 */
export async function reconciliarCreativeJobsPresos(
  pool: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> },
): Promise<{ reconsultados: number; incertos: number }> {
  const { rows } = await pool.query(
    `SELECT id, tenant_id, request_id FROM creative_jobs
     WHERE simulated = false AND estado IN ('enviando', 'na_fila', 'gerando')`,
  );
  let reconsultados = 0;
  let incertos = 0;
  for (const row of rows) {
    const id = row.id as string;
    const tenantId = row.tenant_id as string;
    const requestId = row.request_id as string | null;
    if (!requestId) {
      await pool.query(
        `UPDATE creative_jobs SET estado = 'incerto',
           erro_fornecedor = 'processo reiniciado antes de confirmar o envio -- pode ou não ter sido cobrado'
         WHERE id = $1`,
        [id],
      );
      incertos++;
      continue;
    }
    try {
      const poll = await pollCreativeJobHiggsfield(tenantId, requestId);
      if (poll.status === "processing") {
        reconsultados++;
        continue;
      }
      if (poll.status === "ready") {
        await pool.query(
          `UPDATE creative_jobs SET estado = 'pronto', arquivo_url = $2, terminado_em = now() WHERE id = $1`,
          [id, poll.outputUrl],
        );
      } else {
        await pool.query(
          `UPDATE creative_jobs SET estado = 'falhou', erro_fornecedor = $2, terminado_em = now() WHERE id = $1`,
          [id, poll.errorMessage],
        );
      }
      reconsultados++;
    } catch (err) {
      logEvent("error", "higgsfield_boot_reconciliation_failed", { jobId: id, detail: err });
    }
  }
  return { reconsultados, incertos };
}
