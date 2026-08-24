import { pool } from "../../db/pool.js";
import { logEvent } from "../log/safeLog.js";

export type MeteredProvider = "avatar" | "voice" | "script";
export type MeteredUnitType = "seconds" | "characters" | "tokens_in" | "tokens_out";

/** Ver DurationSource em avatarProvider.ts — mesmo vocabulário, sem acoplar. */
export type UnitSource = "vendor_response" | "tts_timestamps" | "requested";

/**
 * De qual chave saiu a chamada — migration 063.
 *
 * `platform`: credencial da plataforma (`platform_credentials`), a mesma para
 * todos os tenants; a fatura é NOSSA. `tenant_byok`: credencial do próprio
 * tenant (`api_credentials`); a fatura é dele. Hoje só a `fal` tem chave de
 * plataforma servindo geração (`servedBy` em platformCredentials.ts), mas o
 * campo não pergunta o vendor — se a HeyGen migrar amanhã, ele já responde.
 */
export type KeySource = "platform" | "tenant_byok";

export interface RecordUsageInput {
  tenantId: string;
  videoId?: string | null;
  provider: MeteredProvider;
  vendor: string;
  unitType: MeteredUnitType;
  /** O que de fato foi consumido — medido, quando há como medir. */
  unitCount: number;
  /**
   * O que o cliente PEDIU, quando difere do consumido. Guardado ao lado, e
   * nunca no lugar: sem os dois números não há como responder o quanto a
   * estimativa erra. Medido no LIVE-1: pedido 15 s, real 3,372 s.
   */
  requestedUnitCount?: number | null;
  /** De onde veio `unitCount`. Sem isso, medido e estimado ficam iguais. */
  unitSource?: UnitSource | null;
  /**
   * Formato pedido e motor usado, quando o consumo é de geração de vídeo.
   *
   * Opcionais porque nem todo consumo tem geometria: a voz mede caracteres e
   * não tem proporção nenhuma. Preencher com um valor de fachada ali faria a
   * conciliação futura acreditar que houve formato onde não há.
   */
  aspectRatio?: string | null;
  resolution?: string | null;
  /** `null` = nenhum motor foi enviado ao fornecedor. Ver videoEngine.ts. */
  providerEngine?: string | null;
  /**
   * O job no FORNECEDOR que produziu este consumo.
   *
   * Repetido aqui em vez de alcançado por join com `videos`, e a razão é
   * medida: `video_id` é `ON DELETE SET NULL` (migration 023), e em 08/08 havia
   * **15 linhas de `avatar` com `video_id` nulo** — consumo que sobreviveu ao
   * vídeo e perdeu qualquer ponte com o fornecedor. Sem esta coluna, uma
   * fatura não tem como ser conferida contra o que foi gerado.
   *
   * `null` para consumo que não tem job: voz e roteiro, e o caminho de recusa
   * anterior ao aceite.
   */
  providerJobId?: string | null;
  /**
   * A rota do FORNECEDOR que produziu este consumo — migration 063.
   *
   * Sem ela, chamadas de preços muito diferentes entram na tabela como a mesma
   * coisa: `fal-ai/nano-banana-2/edit` custa US$ 0,08 por imagem e
   * `wan/v2.6/image-to-video/flash` cobra por segundo. Foi por não haver esta
   * coluna que a reconciliação de 24/08 teve de cruzar `fal_pipeline_steps`
   * com o painel do fornecedor à mão.
   */
  endpointId?: string | null;
  /** Ver `KeySource`. `null` quando o caminho não resolve chave de plataforma. */
  keySource?: KeySource | null;
  /**
   * O custo que a RÉGUA previa quando esta chamada saiu — nunca o cobrado.
   *
   * Nenhum destes fornecedores expõe custo por chamada, então não existe
   * número real para gravar. O que se guarda é o que nós afirmávamos, para que
   * a próxima reconciliação com a fatura seja uma consulta e não uma escavação
   * — ver o comentário por extenso na migration 063.
   */
  estimatedCostUsd?: number | null;
}

/**
 * Registra consumo de fornecedor.
 *
 * **O CUSTO NÃO É GRAVADO AQUI, e isso é a mudança central do bloco 4A.** Até
 * então esta função consultava `provider_cost_rates` — uma tabela de taxas
 * mantida à mão, nunca reconciliada com fatura nenhuma — e congelava
 * `taxa × unidades` em `estimated_cost_cents`. Duas consequências, ambas
 * medidas:
 *
 *  · a taxa estava errada (US$ 0,03/s contra US$ 0,045/s medido), e
 *  · ela multiplicava a duração PEDIDA, não a entregue.
 *
 * Os dois erros na mesma conta produziram 4,5× de desvio, e o número saía na
 * tela com cara de fato. Agora o custo é DERIVADO na leitura, a partir da
 * única medição real que existe (`billing/providerCost.ts`) e das unidades
 * gravadas aqui. Nada de custo é congelado: um número medido uma vez não é um
 * preço configurável, e mantê-lo em código deixa a procedência visível ao lado
 * dele.
 *
 * Deliberadamente nunca lança: registrar consumo é telemetria secundária e não
 * pode derrubar a ação do usuário (um vídeo ficando pronto, um roteiro
 * voltando) se falhar.
 */
export async function recordProviderUsage(input: RecordUsageInput): Promise<void> {
  await writeUsage({ ...input, outcome: "success", failureReason: null });
}

export interface RecordFailedUsageInput {
  tenantId: string;
  videoId?: string | null;
  provider: MeteredProvider;
  vendor: string;
  unitType: MeteredUnitType;
  /** O que teria sido consumido se tivesse dado certo. */
  requestedUnitCount?: number | null;
  /** Motivo já SANITIZADO. O corpo bruto do fornecedor vive só no log. */
  failureReason: string;
  aspectRatio?: string | null;
  resolution?: string | null;
  /** Ver `RecordUsageInput.providerJobId`. Preenchido quando o job chegou a existir. */
  providerJobId?: string | null;
  /** Ver `RecordUsageInput.endpointId`. Numa falha ele é MAIS útil, não menos:
   * é o que distingue "a rota recusou o corpo" de "a rota não existe". */
  endpointId?: string | null;
  /** Ver `KeySource`. Numa falha responde de quem era a chave que foi recusada. */
  keySource?: KeySource | null;
  /**
   * O que TERIA custado. Fica ao lado de `requestedUnitCount`, pelo mesmo
   * motivo: sem ele não há como somar o gasto EVITADO por uma recusa.
   */
  estimatedCostUsd?: number | null;
}

/**
 * Registra uma tentativa que FALHOU, com custo zero explícito.
 *
 * A linha existe para responder "o que foi tentado, e o que aconteceu?" depois
 * que o stdout do container já sumiu — o que acontece no primeiro
 * `docker compose up -d`. Sem ela, uma passada paga que recusa cinco vezes é
 * indistinguível de uma passada que nunca aconteceu.
 *
 * `unitCount` é **0**, e aqui zero é a verdade e não uma omissão: nada foi
 * entregue. O que estava sendo PEDIDO fica em `requestedUnitCount`, que é o
 * que permite estimar o custo evitado.
 */
export async function recordFailedProviderUsage(input: RecordFailedUsageInput): Promise<void> {
  await writeUsage({
    ...input,
    unitCount: 0,
    unitSource: null,
    providerEngine: null,
    outcome: "failed",
    failureReason: input.failureReason,
  });
}

interface WriteUsageInput extends RecordUsageInput {
  outcome: "success" | "failed";
  failureReason: string | null;
}

async function writeUsage(input: WriteUsageInput): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO provider_usage
         (tenant_id, video_id, provider, vendor, unit_type, unit_count,
          requested_unit_count, unit_source, aspect_ratio, resolution, provider_engine,
          outcome, failure_reason, provider_job_id,
          endpoint_id, key_source, estimated_cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        input.tenantId,
        input.videoId ?? null,
        input.provider,
        input.vendor,
        input.unitType,
        input.unitCount,
        input.requestedUnitCount ?? null,
        input.unitSource ?? null,
        input.aspectRatio ?? null,
        input.resolution ?? null,
        input.providerEngine ?? null,
        input.outcome,
        input.failureReason,
        input.providerJobId ?? null,
        input.endpointId ?? null,
        input.keySource ?? null,
        input.estimatedCostUsd ?? null,
      ],
    );
  } catch (err) {
    logEvent("error", "provider_usage_write_failed", { provider: input.provider, vendor: input.vendor, outcome: input.outcome, detail: err });
  }
}
