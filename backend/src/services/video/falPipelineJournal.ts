/**
 * O diário do pipeline em Postgres — a implementação de produção de
 * `DiarioDoPipeline`.
 *
 * Separado do orquestrador de propósito: `falPipeline.ts` recebe o diário como
 * parâmetro, e é isso que permite exercitá-lo sem banco. A guarda passa um
 * gravador em memória e observa a ORDEM das chamadas; se a persistência fosse
 * importada lá dentro, a única forma de medir ordem seria subir Postgres — e
 * uma guarda que precisa de infraestrutura é uma guarda que se desliga sozinha
 * no primeiro dia difícil.
 *
 * Nenhuma destas escritas engole erro. `provider_usage` engole (o consumo não
 * pode derrubar a geração que já aconteceu), e aqui é o contrário: se o
 * `request_id` não puder ser gravado, seguir seria criar trabalho pago sem
 * ponteiro — exatamente o que este arquivo existe para impedir.
 */
import { pool } from "../../db/pool.js";
import { logEvent } from "../log/safeLog.js";
import { alertarSeGastoFalAcimaDoLimite } from "../billing/falSpendLedger.js";
import { gerarSeedWan, type DiarioDoPipeline, type EtapaDoPipeline } from "./falPipeline.js";

/**
 * Quem abriu a corrida — migration 066, W3.1.
 *
 * As duas últimas contam para o LIMITE DE REFAÇÕES; as três primeiras são o
 * caminho normal de um vídeo (criar, aprovar a imagem, aprovar o vídeo mudo)
 * e não consomem nada do limite.
 */
export type OrigemDaCorrida =
  | "criacao"
  | "aprovacao"
  | "aprovacao_video"
  | "refazer_imagem"
  | "refazer_video";

/** As que contam como refação. Ver `contarRefacoes`. */
export const ORIGENS_DE_REFACAO: OrigemDaCorrida[] = ["refazer_imagem", "refazer_video"];

/**
 * O TETO de refações por vídeo — W3.1, decisão do operador (24/08).
 *
 * TRÊS, e o número não barra nada já ocorrido: o R0 mediu o histórico inteiro
 * e o máximo de refações num único vídeo é **1** (o `d450c86c`, um clique em
 * "Refazer" 13 s depois da aprovação). O limite existe para o caso que ainda
 * não aconteceu — o clique repetido, que no Premium custa US$ 2,31 cada.
 */
export const MAX_REFACOES_POR_VIDEO = 3;

/**
 * Quantas refações este vídeo já teve.
 *
 * Corridas com `origem` NULL (anteriores à migration 066) NÃO contam — não há
 * como saber o que foram, e inventar seria fabricar dado. Isso SUBESTIMA o
 * histórico e dá margem a mais, nunca a menos.
 */
export async function contarRefacoes(videoId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    "SELECT count(*) AS n FROM fal_pipeline_runs WHERE video_id = $1 AND origem = ANY($2)",
    [videoId, ORIGENS_DE_REFACAO],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Refações de VÁRIOS vídeos numa consulta — W3.1b, 24/08.
 *
 * A tela precisa saber a contagem ANTES do clique, para desabilitar o botão;
 * e a Biblioteca lista dezenas de vídeos de uma vez. Uma consulta por linha
 * daria N+1 num caminho que hoje faz uma só — por isso o lote.
 *
 * Vídeo sem nenhuma refação NÃO volta no resultado (o `GROUP BY` não inventa
 * linha), e quem lê deve tratar ausência como zero. É o que `refacoesDe` faz.
 */
export async function contarRefacoesEmLote(videoIds: string[]): Promise<Map<string, number>> {
  if (videoIds.length === 0) return new Map();
  const { rows } = await pool.query<{ video_id: string; n: string }>(
    `SELECT video_id, count(*) AS n
       FROM fal_pipeline_runs
      WHERE video_id = ANY($1) AND origem = ANY($2)
      GROUP BY video_id`,
    [videoIds, ORIGENS_DE_REFACAO],
  );
  return new Map(rows.map((r) => [r.video_id, Number(r.n)]));
}

export interface AbrirCorridaInput {
  tenantId: string;
  /**
   * A linha de `videos` que esta corrida serve. Opcional só porque
   * `probeFalPipeline.ts` não tem vídeo nenhum para apontar — os dois call
   * sites de produto (`/approve` e `/recompose` em `routes/videos.ts`) sempre
   * têm `video.id` disponível e devem passá-lo.
   */
  videoId?: string;
  script: string;
  targetSeconds: number;
  charsPerSecond: number;
  /**
   * Quem está abrindo — migration 066. Opcional só porque a sonda
   * (`probeFalPipeline.ts`) não é nenhuma das cinco; os call sites de produto
   * passam sempre, e a guarda cobra isso.
   */
  origem?: OrigemDaCorrida;
}

/**
 * Quanto este VÍDEO já custou, somando TODAS as suas corridas — migration 062.
 *
 * ┌─ O escopo que o teto de gasto não tem ───────────────────────────────────┐
 * │ `autorizarGasto` (falPipeline.ts) freia por CORRIDA, e toda retomada     │
 * │ começa zerada de propósito: somar o gasto passado ao teto da corrida     │
 * │ recusaria a segunda metade por dinheiro que já saiu. O argumento está    │
 * │ certo e não é isto que muda.                                            │
 * │                                                                          │
 * │ O que ele não cobre é o VÍDEO. Cada "Refazer" abre corrida nova, e não   │
 * │ há limite de cliques: `/redo-video` re-paga `animar` a cada um           │
 * │ (US$ 0,375 no Wan, ~US$ 6,93 no Seedance a 15 s), e cada corrida cabe    │
 * │ sozinha no teto. Esta função é o número que faltava para enxergar isso.  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * SÓ RESPONDE — não recusa nada. Instrumentação, por decisão explícita do
 * operador (23/08): medir com dados reais antes de escolher o número de um
 * freio. Quem vier ligar o freio compara este valor contra um teto por vídeo;
 * enquanto isso, ele aparece no log de cada corrida nova (`abrirCorrida`).
 *
 * `numeric` do Postgres chega como STRING no driver — `Number(...)` explícito,
 * porque somar strings aqui concatenaria em silêncio.
 */
export async function gastoAcumuladoDoVideoUsd(videoId: string): Promise<number> {
  const { rows } = await pool.query<{ total: string | null }>(
    "SELECT COALESCE(SUM(gasto_previsto_usd), 0) AS total FROM fal_pipeline_runs WHERE video_id = $1",
    [videoId],
  );
  return Number(rows[0]?.total ?? 0);
}

/** Abre a corrida e devolve o id. As etapas penduram nele. */
export async function abrirCorrida(input: AbrirCorridaInput): Promise<string> {
  // ANTES do INSERT, e por isso o número é o das corridas ANTERIORES: lido
  // depois, ele incluiria esta corrida (em zero, porque nada foi autorizado
  // ainda) e o log passaria a somar uma parcela vazia — mesmo total, leitura
  // pior. AQUI, e não nas quatro rotas que abrem corrida (`/approve`,
  // `/recompose`, `/approve-video`, `/redo-video`), porque este é o único
  // ponto por onde todas passam: instrumentação copiada em quatro call sites
  // é instrumentação que some de um deles na próxima rodada.
  //
  // Vídeo sem id (a sonda `probeFalPipeline.ts`) não tem o que somar — e não
  // é caso de erro, é o caso documentado em `videoId`.
  if (input.videoId) {
    logEvent("info", "fal_gasto_acumulado_do_video", {
      videoId: input.videoId,
      tenantId: input.tenantId,
      gastoAcumuladoAnteriorUsd: Number((await gastoAcumuladoDoVideoUsd(input.videoId)).toFixed(4)),
    });
  }
  // PRIORIDADE 3, 28/08 — livro-caixa interno por TENANT/mês (ver
  // falSpendLedger.ts). Mesmo motivo do log acima: este é o único ponto por
  // onde as cinco rotas de produto (criação, /approve, /recompose,
  // /approve-video, /redo-video) passam.
  await alertarSeGastoFalAcimaDoLimite(input.tenantId);

  // V30, item 1 — gerado AQUI, na abertura, e não mais em memória dentro de
  // `animarNarrarSincronizar`: uma retomada roda numa invocação NOVA do
  // processo, e um seed gerado ali sortearia um valor diferente do já
  // usado pelos blocos pagos da mesma corrida. Seedance nunca lê este
  // valor (`corpoAnimarSeedance` não tem parâmetro de seed) — gravá-lo
  // mesmo para corridas Premium é inofensivo, e evita um `if (tier ===
  // "normal")` aqui que a ABERTURA da corrida não tem como avaliar (o tier
  // chega só depois, em `FalPipelineInput`).
  const seedWan = gerarSeedWan();

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO fal_pipeline_runs (tenant_id, video_id, script, target_seconds, script_chars, chars_per_second, origem, seed_wan)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [
      input.tenantId,
      input.videoId ?? null,
      input.script,
      input.targetSeconds,
      input.script.length,
      input.charsPerSecond,
      input.origem ?? null,
      seedWan,
    ],
  );
  return rows[0].id;
}

/**
 * O seed Wan desta corrida — V30, item 1. `null` só para corridas ANTERIORES
 * a esta migration (nunca gravado); `lerSeed()` (diário) trata esse caso.
 */
export async function seedDaCorrida(runId: string): Promise<number | null> {
  const { rows } = await pool.query<{ seed_wan: number | null }>(
    "SELECT seed_wan FROM fal_pipeline_runs WHERE id = $1",
    [runId],
  );
  return rows[0]?.seed_wan ?? null;
}

export async function fecharCorrida(
  runId: string,
  status: "completed" | "failed",
  motivo?: string,
): Promise<void> {
  await pool.query(
    "UPDATE fal_pipeline_runs SET status = $2, failure_reason = $3, updated_at = now() WHERE id = $1",
    [runId, status, motivo ?? null],
  );
}

/**
 * O `request_id` que ESTA etapa, NESTA corrida, chegou a receber da fal — ou
 * `null` se ela nunca chegou a receber um.
 *
 * Existe para responder, depois que uma etapa falhou, a pergunta que decide o
 * estorno: "o fornecedor chegou a aceitar este trabalho?" `gravarRequestId`
 * (acima) só é chamado pelo `onRequestId` de `falSubmit` DEPOIS que a fal
 * aceita a submissão — uma recusa (422 de schema, por exemplo) nunca chega lá,
 * e a linha desta etapa fica com `request_id NULL`. Ler essa coluna depois do
 * catch é como `classificarGasto` (videoFailure.ts) sabe se o gasto desta
 * etapa específica é `nao_saiu` ou `indeterminado`.
 *
 * Por `run_id` + `etapa`, não pelo `provider_job_id` gravado em `videos`: essa
 * coluna pode segurar o `request_id` de uma etapa ANTERIOR e já cobrada (a
 * composição, no caso de `animar`) — usá-la aqui classificaria uma recusa da
 * etapa nova como gasto que já saiu, por causa de um gasto de outra etapa.
 */
export async function requestIdDaEtapa(runId: string, etapa: EtapaDoPipeline): Promise<string | null> {
  const { rows } = await pool.query<{ request_id: string | null }>(
    `SELECT request_id FROM fal_pipeline_steps
      WHERE run_id = $1 AND etapa = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [runId, etapa],
  );
  return rows[0]?.request_id ?? null;
}

/**
 * A etapa PRESA por um request_id — V28, item 3.
 *
 * `recoverInFlightVideos` (recovery.ts) recebe da linha de `videos` só o
 * `provider_job_id` (o request_id) — não o `run_id`. Esta função é a ponte:
 * acha a linha de `fal_pipeline_steps` que tem esse request_id (índice
 * implícito por ser praticamente único — a fal não repete) e devolve o que a
 * recuperação precisa para consultar a fila de novo: as URLs REAIS gravadas
 * no submit (migration 071), não reconstruídas por fórmula — ver o comentário
 * da migration para o porquê de reconstruir ser arriscado.
 */
export interface EtapaPresa {
  id: string;
  runId: string;
  etapa: EtapaDoPipeline;
  endpointId: string | null;
  statusUrl: string | null;
  responseUrl: string | null;
  status: string | null;
}

export async function etapaPorRequestId(requestId: string): Promise<EtapaPresa | null> {
  const { rows } = await pool.query<{
    id: string;
    run_id: string;
    etapa: EtapaDoPipeline;
    endpoint_id: string | null;
    status_url: string | null;
    response_url: string | null;
    status: string | null;
  }>(
    `SELECT id, run_id, etapa, endpoint_id, status_url, response_url, status
       FROM fal_pipeline_steps
      WHERE request_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [requestId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    runId: r.run_id,
    etapa: r.etapa,
    endpointId: r.endpoint_id,
    statusUrl: r.status_url,
    responseUrl: r.response_url,
    status: r.status,
  };
}

/** Um bloco de animação já concluído e pago, pronto para ser reusado numa retomada. */
export interface BlocoConcluido {
  indice: number;
  videoUrl: string;
  requestId: string;
}

/**
 * Os blocos de animação JÁ CONCLUÍDOS desta corrida, na ordem certa —
 * V30, item 3. Só etapas `animar` com `bloco_indice` gravado (migration
 * 072) e `status='completed'` contam; um bloco `running`/`failed`, ou de
 * antes desta migration (`bloco_indice` NULL), nunca entra na lista — a
 * retomada tem de ignorá-lo, não adivinhar que ele terminou.
 *
 * `ORDER BY bloco_indice`: a ORDEM importa para quem consome (o elemento
 * `i` da lista tem de ser o resultado do bloco `i`) — `created_at` também
 * serviria no caminho feliz, mas `bloco_indice` é o dado EXPLÍCITO que
 * esta migration existe para não depender mais de inferência por data.
 *
 * `raw_response` sem `video.url` (forma inesperada, ou uma etapa `animar`
 * de antes deste campo existir no corpo) é IGNORADO, não faz a função
 * lançar — um bloco cujo resultado não se consegue reaproveitar é
 * tratado como bloco pendente, e a retomada o re-submete. Reenviar um
 * bloco que JÁ tinha sido pago é o pior caso só quando ele é descartado
 * SEM re-submissão; aqui a retomada segue e paga de novo, o mesmo custo
 * de nunca ter havido este mecanismo.
 */
export async function blocosConcluidosDaCorrida(runId: string): Promise<BlocoConcluido[]> {
  const { rows } = await pool.query<{
    bloco_indice: number;
    request_id: string | null;
    raw_response: string | null;
  }>(
    `SELECT bloco_indice, request_id, raw_response
       FROM fal_pipeline_steps
      WHERE run_id = $1 AND etapa = 'animar' AND status = 'completed' AND bloco_indice IS NOT NULL
      ORDER BY bloco_indice ASC`,
    [runId],
  );
  const blocos: BlocoConcluido[] = [];
  for (const r of rows) {
    if (!r.request_id || !r.raw_response) continue;
    let videoUrl: unknown;
    try {
      videoUrl = JSON.parse(r.raw_response)?.video?.url;
    } catch {
      continue;
    }
    if (typeof videoUrl !== "string" || !videoUrl) continue;
    blocos.push({ indice: r.bloco_indice, videoUrl, requestId: r.request_id });
  }
  return blocos;
}

export function criarDiarioNoBanco(runId: string): DiarioDoPipeline {
  return {
    async abrirEtapa(
      etapa: EtapaDoPipeline,
      ordem: number,
      vendor: string,
      endpointId: string | null,
      blocoIndice?: number | null,
    ): Promise<string> {
      const { rows } = await pool.query<{ id: string }>(
        `INSERT INTO fal_pipeline_steps (run_id, etapa, ordem, vendor, endpoint_id, request_at, bloco_indice)
         VALUES ($1, $2, $3, $4, $5, now(), $6)
         RETURNING id`,
        [runId, etapa, ordem, vendor, endpointId, blocoIndice ?? null],
      );
      return rows[0].id;
    },

    // V30, item 1 — ver o comentário de `DiarioDoPipeline.lerSeed`. Corrida
    // de ANTES da migration 072 (`seed_wan` NULL): gera um seed agora e o
    // grava, para que ela passe a ter um valor estável dali em diante — sem
    // isto, cada chamada dentro da MESMA corrida velha sortearia um seed
    // diferente, que é exatamente o defeito que esta função existe para
    // fechar.
    async lerSeed(): Promise<number> {
      const existente = await seedDaCorrida(runId);
      if (existente !== null) return existente;
      const novo = gerarSeedWan();
      await pool.query("UPDATE fal_pipeline_runs SET seed_wan = $2, updated_at = now() WHERE id = $1", [
        runId,
        novo,
      ]);
      return novo;
    },

    async gravarRequestId(stepId: string, requestId: string): Promise<void> {
      await pool.query(
        "UPDATE fal_pipeline_steps SET request_id = $2, updated_at = now() WHERE id = $1",
        [stepId, requestId],
      );
    },

    async gravarUrlsDaFila(stepId: string, statusUrl: string, responseUrl: string): Promise<void> {
      await pool.query(
        "UPDATE fal_pipeline_steps SET status_url = $2, response_url = $3, updated_at = now() WHERE id = $1",
        [stepId, statusUrl, responseUrl],
      );
    },

    async gravarRespostaCrua(stepId: string, raw: string): Promise<void> {
      await pool.query(
        `UPDATE fal_pipeline_steps
         SET raw_response = $2, raw_response_at = now(), updated_at = now()
         WHERE id = $1`,
        [stepId, raw],
      );
    },

    async fecharEtapa(stepId: string, status: "completed" | "failed", motivo?: string): Promise<void> {
      await pool.query(
        "UPDATE fal_pipeline_steps SET status = $2, failure_reason = $3, updated_at = now() WHERE id = $1",
        [stepId, status, motivo ?? null],
      );
    },

    async registrarGastoPrevisto(acumuladoUsd: number): Promise<void> {
      await pool.query(
        "UPDATE fal_pipeline_runs SET gasto_previsto_usd = $2, updated_at = now() WHERE id = $1",
        [runId, acumuladoUsd],
      );
    },
  };
}
