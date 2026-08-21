/**
 * VARREDURA DE BOOT — a rede de segurança mínima do desenho atual.
 *
 * ┌─ O defeito que isto fecha ──────────────────────────────────────────────┐
 * │ O acompanhamento de uma geração vive num `setInterval` na memória do    │
 * │ processo web (`routes/videos.ts`). Morto o processo — `restart          │
 * │ backend`, `up -d`, desligar o PC —, o laço morre com ele e NADA o       │
 * │ re-arma: `index.ts` chamava migrações, `buildApp`, o agendador de       │
 * │ crédito e `listen`, e mais nada. A linha ficava em `queued` ou          │
 * │ `processing` para sempre, com o crédito já debitado e sem estorno.      │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ISTO NÃO É UMA FILA, e a distinção importa: não há tabela de trabalho, não
 * há consumidor, não há concorrência entre processos e não há reentrega. É uma
 * varredura ÚNICA, no boot, que faz quatro coisas com o que encontra:
 *
 *   · está aguardando aprovação e é recente → NÃO TOCA. Ver abaixo.
 *   · está aguardando aprovação há tempo demais → encerra como
 *                                          `approval_expired`, SEM estornar;
 *   · tem `provider_job_id` e é recente  → re-arma o MESMO acompanhamento;
 *   · não tem `provider_job_id`          → o fornecedor nunca aceitou:
 *                                          encerra como `recovery_orphan` e
 *                                          ESTORNA;
 *   · passou da idade máxima             → encerra como `recovery_stale`, e
 *                                          estorna conforme a mesma regra.
 *
 * O que ela deliberadamente NÃO faz: não chama fornecedor por conta própria,
 * não cria trabalho novo, não repete o que já foi enviado, e não roda de novo
 * enquanto o processo viver.
 */
import { pool } from "../../db/pool.js";
import { logEvent } from "../log/safeLog.js";
import { refundCredit } from "../billing/creditGate.js";
import { recordFailedProviderUsage } from "../billing/usageTracking.js";
import { createNotification } from "../notifications.js";
import { decidirEstorno, type VideoFailureReason } from "./videoFailure.js";

/** Idade acima da qual um registro preso é encerrado em vez de reacompanhado. */
export const VIDEO_RECOVERY_MAX_AGE_ENV = "VIDEO_RECOVERY_MAX_AGE_MS";

/**
 * 6 horas. DEDUZIDO, não medido — não há amostra de registro preso neste
 * projeto (a varredura de 08/08 achou ZERO). O número sai de duas pontas
 * conhecidas: o polling desiste em ~7,5 min (`MAX_POLL_ATTEMPTS × 5 s`), então
 * qualquer coisa acima disso já é anômalo; e a URL assinada que o fornecedor
 * devolve expira, então reacompanhar algo de ontem tende a achar um artefato
 * que não dá mais para baixar. Seis horas cobre uma noite de máquina
 * desligada sem prometer ressuscitar a semana passada.
 */
export const DEFAULT_VIDEO_RECOVERY_MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function videoRecoveryMaxAgeMs(): number {
  const bruto = process.env[VIDEO_RECOVERY_MAX_AGE_ENV];
  if (!bruto) return DEFAULT_VIDEO_RECOVERY_MAX_AGE_MS;
  const n = Number(bruto);
  // Valor inválido cai no default em vez de virar NaN: com `NaN` toda
  // comparação de idade é falsa, e a varredura reacompanharia registros de
  // qualquer idade em silêncio — falha na direção errada.
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_VIDEO_RECOVERY_MAX_AGE_MS;
  return Math.floor(n);
}

/** O estado do caminho da fal em que a IMAGEM composta espera um clique humano. */
export const STATUS_AGUARDANDO_APROVACAO = "awaiting_approval";

/**
 * O estado um passo adiante: o VÍDEO MUDO (já animado, já pago) espera um
 * segundo clique antes de narrar + sincronizar. FASE 2 (Modo B), 21/08.
 * Mesmo papel que `STATUS_AGUARDANDO_APROVACAO` tem para a imagem — ver os
 * dois juntos no branch abaixo, dentro do laço da varredura.
 */
export const STATUS_AGUARDANDO_APROVACAO_VIDEO = "awaiting_approval_video";

/**
 * Os estados que a varredura SELECIONA.
 *
 * Os dois `awaiting_approval*` estão aqui de propósito, e isso é o contrário
 * do que parece: eles entram para poder ser IGNORADOS com conhecimento de
 * causa, e para poder EXPIRAR. Deixá-los fora do `SELECT` daria o mesmo
 * resultado no caso recente — a linha nunca chegaria ao laço — e nenhum no
 * caso velho: uma aprovação abandonada ficaria na galeria para sempre, e
 * qualquer um dos dois viraria o novo `queued` preso que esta varredura
 * existe para não deixar existir.
 */
export const STATUS_VARRIDOS: readonly string[] = [
  "queued",
  "processing",
  STATUS_AGUARDANDO_APROVACAO,
  STATUS_AGUARDANDO_APROVACAO_VIDEO,
];

/** Idade acima da qual uma aprovação pendente é dada por abandonada. */
export const VIDEO_APPROVAL_MAX_AGE_ENV = "VIDEO_APPROVAL_MAX_AGE_MS";

/**
 * 24 horas — e ele é DELIBERADAMENTE quatro vezes o de `recovery`.
 *
 * ┌─ Por que não as mesmas 6 h ─────────────────────────────────────────────┐
 * │ As 6 h descrevem trabalho EM VOO: o polling desiste em ~7,5 min e a URL │
 * │ assinada do fornecedor expira, então reacompanhar algo velho tende a    │
 * │ achar um artefato que não dá mais para baixar. Uma aprovação pendente   │
 * │ não tem NADA em voo — ninguém está gastando enquanto ela espera, não há │
 * │ job a reacompanhar, e o trabalho que existe (a imagem) já está pago e   │
 * │ gravado.                                                                │
 * │                                                                         │
 * │ O que pode expirar aqui é o ARTEFATO: a imagem composta vive em         │
 * │ `v3b.fal.media` e a validade dessa URL é NÃO VERIFICADA. 24 h é o maior │
 * │ prazo que ainda se chama "hoje".                                        │
 * │                                                                         │
 * │ E o custo de errar é assimétrico: expirar cedo demais obriga a recompor │
 * │ (US$ 0,08) quem compôs à noite e aprovou de manhã — que é o caso de uso │
 * │ real —, enquanto expirar tarde só deixa uma linha parada mais tempo,    │
 * │ sem consumir nada de ninguém.                                           │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
export const DEFAULT_VIDEO_APPROVAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function videoApprovalMaxAgeMs(): number {
  const bruto = process.env[VIDEO_APPROVAL_MAX_AGE_ENV];
  if (!bruto) return DEFAULT_VIDEO_APPROVAL_MAX_AGE_MS;
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_VIDEO_APPROVAL_MAX_AGE_MS;
  return Math.floor(n);
}

export interface VideoEmVoo {
  id: string;
  tenant_id: string;
  status: string;
  provider_job_id: string | null;
  provider_vendor: string | null;
  publish_platform: string | null;
  aspect_ratio: string | null;
  resolution: string | null;
  provider_engine: string | null;
  duration_seconds: number;
  simulated: boolean;
  idade_ms: number;
}

/**
 * Quem re-arma o acompanhamento. Injetado em vez de importado para que a
 * varredura possa ser exercitada com um duplo — a guarda precisa contar quem
 * foi reacompanhado sem subir a aplicação nem tocar a rede.
 */
export type Reacompanhar = (linha: VideoEmVoo) => void | Promise<void>;

export interface RecoveryResult {
  encontrados: number;
  reacompanhados: number;
  encerradosOrfaos: number;
  encerradosVelhos: number;
  estornados: number;
  falhas: number;
  /** Deixados em paz: a composição está paga e espera um clique humano. */
  aguardandoAprovacao: number;
  /** Aprovações abandonadas, encerradas SEM estorno. */
  aprovacoesExpiradas: number;
}

const MENSAGEM_ORFAO =
  "Esta geração foi interrompida antes de o serviço de vídeo aceitar o trabalho. " +
  "Nada foi cobrado e o crédito foi devolvido — pode gerar de novo.";

const MENSAGEM_VELHO =
  "Esta geração ficou parada tempo demais e foi encerrada. O trabalho pode ter sido " +
  "concluído no serviço de vídeo; o identificador do job está guardado para conferência.";

/**
 * A mensagem da expiração diz o que foi gasto, e diz que NÃO volta.
 *
 * Não é rigor de contabilidade: é a diferença entre a pessoa entender que
 * perdeu US$ 0,08 de composição e achar que perdeu o vídeo inteiro. Sem isso,
 * a leitura natural de "encerrada" é a mais cara.
 */
const MENSAGEM_APROVACAO_EXPIRADA =
  "A imagem composta ficou esperando aprovação por tempo demais e esta geração foi encerrada. " +
  "A composição já havia sido feita e cobrada, então o crédito não volta — mas nenhuma etapa " +
  "seguinte chegou a ser paga. Comece uma geração nova quando quiser.";

/**
 * A mesma ideia da mensagem acima, um passo adiante: quando é o VÍDEO MUDO
 * que expira, `animar` já foi pago — não só `compor`. FASE 2 (Modo B), 21/08.
 */
const MENSAGEM_APROVACAO_VIDEO_EXPIRADA =
  "O vídeo animado ficou esperando aprovação por tempo demais e esta geração foi encerrada. " +
  "A composição e a animação já haviam sido feitas e cobradas, então o crédito não volta — mas " +
  "narrar e sincronizar não chegaram a ser pagos. Comece uma geração nova quando quiser.";

/**
 * Encerra um registro preso, gravando o MOTIVO junto do estado.
 *
 * `AND status = ANY(...)` no `UPDATE`: se o polling de outro caminho tiver
 * resolvido a linha entre o `SELECT` e este `UPDATE`, não se sobrescreve um
 * estado terminal — é a mesma proteção que o caminho de timeout já usava com
 * `AND status != 'ready'`.
 *
 * `deEstados` é parâmetro porque a expiração de aprovação parte de um estado
 * que os outros três encerramentos nunca veem. Fixá-lo em `queued|processing`
 * faria o `UPDATE` da expiração casar zero linhas e falhar CALADO — a linha
 * continuaria em `awaiting_approval`, a varredura continuaria contando uma
 * expiração que não aconteceu, e o próximo boot repetiria tudo.
 */
async function encerrar(
  linha: VideoEmVoo,
  reason: VideoFailureReason,
  mensagem: string,
  deEstados: readonly string[] = ["queued", "processing"],
): Promise<{ encerrado: boolean; estornado: boolean }> {
  const { rowCount } = await pool.query(
    `UPDATE videos SET status = 'error', error_message = $2, failure_reason = $3
      WHERE id = $1 AND status = ANY($4)`,
    [linha.id, mensagem, reason, deEstados],
  );
  if (!rowCount) return { encerrado: false, estornado: false };

  const decisao = decidirEstorno(reason, linha.provider_job_id != null);
  logEvent(decisao.estorna ? "info" : "error", "video_recovery_encerrado", {
    context: "video.recovery",
    videoId: linha.id,
    reason,
    gasto: decisao.gasto,
    nota: decisao.nota,
    providerJobId: linha.provider_job_id ? linha.provider_job_id.slice(0, 8) + "…" : null,
  });

  await recordFailedProviderUsage({
    tenantId: linha.tenant_id,
    videoId: linha.id,
    provider: "avatar",
    vendor: linha.provider_vendor ?? "heygen",
    unitType: "seconds",
    requestedUnitCount: linha.duration_seconds,
    failureReason: mensagem,
    aspectRatio: linha.aspect_ratio,
    resolution: linha.resolution,
    providerJobId: linha.provider_job_id,
  });

  let estornado = false;
  if (decisao.estorna) {
    // O índice único parcial `credit_ledger_one_refund_per_video` é a garantia
    // final de estorno único: mesmo que a varredura rode duas vezes (dois
    // boots seguidos), a segunda devolve `already_refunded` e não cria linha.
    const r = await refundCredit({
      tenantId: linha.tenant_id,
      creditType: "video",
      relatedVideoId: linha.id,
    });
    estornado = r.refunded;
  }

  await createNotification(linha.tenant_id, "video_error", mensagem);
  return { encerrado: true, estornado };
}

/**
 * A varredura. Roda UMA vez, no boot, antes de a aplicação aceitar conexão.
 *
 * Nunca lança: um erro aqui não pode impedir o servidor de subir — um processo
 * que não sobe não acompanha nada, que é o oposto do que este arquivo existe
 * para garantir.
 */
export async function recoverInFlightVideos(reacompanhar: Reacompanhar): Promise<RecoveryResult> {
  const resultado: RecoveryResult = {
    encontrados: 0,
    reacompanhados: 0,
    encerradosOrfaos: 0,
    encerradosVelhos: 0,
    estornados: 0,
    falhas: 0,
    aguardandoAprovacao: 0,
    aprovacoesExpiradas: 0,
  };
  const idadeMax = videoRecoveryMaxAgeMs();
  const idadeMaxAprovacao = videoApprovalMaxAgeMs();

  let linhas: VideoEmVoo[];
  try {
    const { rows } = await pool.query<VideoEmVoo>(
      `SELECT id, tenant_id, status, provider_job_id, provider_vendor, publish_platform,
              aspect_ratio, resolution, provider_engine, duration_seconds, simulated,
              (EXTRACT(EPOCH FROM (now() - created_at)) * 1000)::bigint AS idade_ms
         FROM videos
        WHERE status = ANY($1)
        ORDER BY created_at ASC`,
      [STATUS_VARRIDOS],
    );
    linhas = rows.map((r) => ({ ...r, idade_ms: Number(r.idade_ms) }));
  } catch (err) {
    logEvent("error", "video_recovery_falhou", {
      context: "video.recovery",
      detail: err instanceof Error ? err.message : String(err),
      consequence: "nenhum registro preso foi recolhido neste boot",
    });
    resultado.falhas += 1;
    return resultado;
  }

  resultado.encontrados = linhas.length;
  if (linhas.length === 0) {
    logEvent("info", "video_recovery_vazio", { context: "video.recovery", maxAgeMs: idadeMax });
    return resultado;
  }

  for (const linha of linhas) {
    try {
      // A APROVAÇÃO PENDENTE VEM PRIMEIRO, e antes das duas condições abaixo.
      //
      // Ela tem `provider_job_id` — o `request_id` da COMPOSIÇÃO, que a rota
      // grava —, então sem esta exceção ela não cai no ramo do órfão: cai no
      // de REACOMPANHAR. E reacompanhar chama `pollVideoJob`, que despacha por
      // `did ? … : heygen`: com vendor `fal`, a chave do tenant sairia em
      // claro para `api.heygen.com`. É o mesmo vazamento que
      // `VENDORS_WITH_CONNECTION_PROBE` existe para impedir, por outra porta.
      //
      // E não há o que acompanhar: a corrida terminou onde devia terminar. O
      // que falta é um humano clicar.
      if (linha.status === STATUS_AGUARDANDO_APROVACAO || linha.status === STATUS_AGUARDANDO_APROVACAO_VIDEO) {
        const mensagem =
          linha.status === STATUS_AGUARDANDO_APROVACAO_VIDEO
            ? MENSAGEM_APROVACAO_VIDEO_EXPIRADA
            : MENSAGEM_APROVACAO_EXPIRADA;
        if (linha.idade_ms > idadeMaxAprovacao) {
          const r = await encerrar(linha, "approval_expired", mensagem, [linha.status]);
          if (r.encerrado) resultado.aprovacoesExpiradas += 1;
          if (r.estornado) resultado.estornados += 1;
          continue;
        }
        resultado.aguardandoAprovacao += 1;
        logEvent("info", "video_recovery_aguardando_aprovacao", {
          context: "video.recovery",
          videoId: linha.id,
          status: linha.status,
          idadeMs: linha.idade_ms,
          maxAgeMs: idadeMaxAprovacao,
        });
        continue;
      }
      // A ORDEM das duas condições não é arbitrária: órfão vem primeiro porque
      // um registro sem job id é irrecuperável em qualquer idade — trocar a
      // ordem faria um órfão recente ser "reacompanhado", e reacompanhar o que
      // não tem job id é pedir status de um trabalho que não existe.
      if (!linha.provider_job_id) {
        const r = await encerrar(linha, "recovery_orphan", MENSAGEM_ORFAO);
        if (r.encerrado) resultado.encerradosOrfaos += 1;
        if (r.estornado) resultado.estornados += 1;
        continue;
      }
      if (linha.idade_ms > idadeMax) {
        const r = await encerrar(linha, "recovery_stale", MENSAGEM_VELHO);
        if (r.encerrado) resultado.encerradosVelhos += 1;
        if (r.estornado) resultado.estornados += 1;
        continue;
      }
      await reacompanhar(linha);
      resultado.reacompanhados += 1;
    } catch (err) {
      resultado.falhas += 1;
      logEvent("error", "video_recovery_linha_falhou", {
        context: "video.recovery",
        videoId: linha.id,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logEvent("info", "video_recovery_concluida", { context: "video.recovery", maxAgeMs: idadeMax, ...resultado });
  return resultado;
}
