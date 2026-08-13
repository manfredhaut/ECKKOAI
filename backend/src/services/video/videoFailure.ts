/**
 * POR QUE o vídeo falhou, e se o dinheiro saiu — enumerado, num lugar só.
 *
 * ┌─ O defeito que este arquivo fecha ──────────────────────────────────────┐
 * │ `videos.status = 'error'` é escrito em SETE lugares e significa CINCO   │
 * │ coisas financeiramente distintas: nunca cobrado, cobrado e estornado,   │
 * │ cobrado e não estornado, cobrado e entregue inutilizável, e             │
 * │ desconhecido. O que distinguia os cinco era a existência de uma linha   │
 * │ em `provider_usage` e de um `refund` no ledger — nunca o campo que a    │
 * │ tela lê.                                                                │
 * │                                                                         │
 * │ MEDIDO em 08/08, no banco: o único vídeo em `error` do acervo tem       │
 * │ `error_message` = "Não foi possível concluir a operação no serviço de   │
 * │ vídeo…" — uma frase sanitizada, correta para o cliente, e que não diz   │
 * │ qual dos sete pontos a escreveu nem se houve cobrança.                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * A MÁQUINA DE ESTADOS NÃO MUDA **por causa deste arquivo**. O que entra aqui é
 * uma coluna ao LADO do estado, dizendo por quê — distinguir cinco significados
 * de `error` nunca precisou de estado novo, e inventar um teria sido custo sem
 * ganho.
 *
 * ⚠️ Ela MUDOU depois, e por outro motivo: a migration 052 acrescentou
 * `awaiting_approval`, porque o caminho da fal para no meio com dinheiro já
 * gasto e dinheiro ainda por gastar, e nenhum dos quatro descreve isso.
 * O aviso original continua valendo como aviso — todo consumidor de
 * `videos.status` teve de ser tocado naquela rodada.
 */

/**
 * Os motivos, como valores literais. A ordem é a do fluxo: primeiro o que
 * acontece antes de o fornecedor ser tocado, depois o que acontece depois.
 */
export const VIDEO_FAILURE_REASONS = [
  // --- ANTES de qualquer chamada ------------------------------------------
  /** Portão de crédito recusou. Nada foi debitado, nada foi chamado. */
  "insufficient_credits",
  /** Teto NOSSO de sessão live. Nenhuma chamada saiu; o débito foi estornado. */
  "live_budget_exhausted",

  // --- a voz foi sintetizada; o vídeo não chegou a ser pedido --------------
  /**
   * Teto NOSSO sobre a duração MEDIDA do áudio. O `POST /v3/videos` não saiu, e
   * o débito foi estornado.
   *
   * Motivo PRÓPRIO, e não `vendor_rejected`: o fornecedor de vídeo nunca soube
   * da tentativa. Mas também não pertence ao bloco de cima — a síntese de voz
   * ACONTECEU e foi cobrada (frações de centavo), então "antes de qualquer
   * chamada" seria falso. É a única linha do enum com custo parcial real.
   */
  "audio_too_long",

  // --- a chamada de criação saiu ------------------------------------------
  /** O fornecedor recusou a criação. Não há job, não há render, não há cobrança. */
  "vendor_rejected",
  /** A chamada de criação estourou o teto de tempo. Ver providers/vendorTimeout.ts. */
  "vendor_timeout",

  // --- o job foi aceito; o que falhou veio depois --------------------------
  /** O fornecedor disse `ready` e entregou artefato inutilizável. Renderizou e cobrou. */
  "artifact_invalid",
  /** O fornecedor reportou erro no próprio job, depois de aceitá-lo. */
  "vendor_reported_error",
  /** Exceção no laço de polling — falha NOSSA sobre um job que existe lá. */
  "poll_loop_error",
  /** O teto de tentativas do polling acabou com o job ainda em andamento. */
  "poll_timeout",

  // --- a varredura de boot achou a linha presa -----------------------------
  /** Preso sem `provider_job_id`: o fornecedor nunca chegou a aceitar. */
  "recovery_orphan",
  /** Preso além da idade máxima: velho demais para valer a pena reacompanhar. */
  "recovery_stale",
  /**
   * Ninguém aprovou a composição dentro da janela (24 h — ver `recovery.ts`).
   *
   * NÃO estorna, e é o segundo motivo do enum com gasto `saiu`: a composição
   * aconteceu, foi cobrada, e a imagem está gravada. Devolver crédito aqui
   * seria devolver dinheiro por serviço prestado.
   */
  "approval_expired",
] as const;

export type VideoFailureReason = (typeof VIDEO_FAILURE_REASONS)[number];

export function isVideoFailureReason(v: unknown): v is VideoFailureReason {
  return typeof v === "string" && (VIDEO_FAILURE_REASONS as readonly string[]).includes(v);
}

/**
 * O dinheiro saiu para o fornecedor?
 *
 * Três valores, e o terceiro é o honesto: `indeterminado`. Reduzi-lo a um dos
 * outros dois seria inventar — e é justamente a invenção que este projeto
 * evita ao separar MEDIDO de DEDUZIDO.
 */
export type VendorSpend = "nao_saiu" | "saiu" | "indeterminado";

/**
 * A FRONTEIRA, e ela é a mesma que `routes/videos.ts` já declarava em prosa:
 * o aceite. Assim que `generateVideo()` devolve um `providerJobId`, o trabalho
 * está enfileirado no fornecedor e a cota é consumida.
 *
 * Por isso a decisão NÃO é tomada só pelo motivo: ela precisa saber se houve
 * job. `vendor_timeout` é o caso que torna isso visível — a mesma palavra
 * descreve "estourou antes de o fornecedor aceitar" (nada saiu) e "estourou
 * com job já criado" (saiu).
 *
 * `artifact_invalid` é o único motivo em que o gasto é `saiu` e não
 * `indeterminado`: o fornecedor devolveu um artefato pronto, o que é prova de
 * que renderizou.
 */
export function classificarGasto(reason: VideoFailureReason, temJobId: boolean): VendorSpend {
  // ANTES do `temJobId`, e de propósito: o gasto de uma aprovação expirada não
  // depende de haver job id, porque ele é anterior ao estado. Uma linha só
  // chega a `awaiting_approval` DEPOIS de a composição ter sido paga e a
  // imagem ter sido gravada — o dinheiro saiu por construção. Deixá-lo depois
  // faria uma linha sem `provider_job_id` (uma gravação que falhou, por
  // exemplo) ser classificada como `nao_saiu` e ESTORNAR uma composição que
  // aconteceu.
  if (reason === "approval_expired") return "saiu";
  if (!temJobId) return "nao_saiu";
  if (reason === "artifact_invalid") return "saiu";
  return "indeterminado";
}

export interface DecisaoDeEstorno {
  estorna: boolean;
  gasto: VendorSpend;
  /** Frase para o log e para o relatório. Nunca vai para a tela do cliente. */
  nota: string;
}

/**
 * Estorna ou não, e por quê.
 *
 * A regra, em uma linha: **se o dinheiro não saiu para o fornecedor, o crédito
 * volta; se saiu, não volta, e o motivo fica registrado.**
 *
 * `indeterminado` NÃO estorna, e essa é a escolha que precisa ficar escrita:
 * devolver crédito sobre um gasto que pode ter acontecido cria crédito do
 * nada, e é o erro que ninguém reclama — só aparece na conciliação, meses
 * depois (a mesma frase que a migration 035 usa para justificar os índices
 * únicos de estorno). Errar para o lado de não devolver é visível: o cliente
 * reclama, e a linha guarda o motivo para responder.
 */
export function decidirEstorno(reason: VideoFailureReason, temJobId: boolean): DecisaoDeEstorno {
  const gasto = classificarGasto(reason, temJobId);
  if (gasto === "nao_saiu") {
    return {
      estorna: true,
      gasto,
      nota: `motivo=${reason}: o fornecedor nunca aceitou o trabalho (sem provider_job_id), então nada foi cobrado — o crédito volta`,
    };
  }
  if (gasto === "saiu") {
    return {
      estorna: false,
      gasto,
      nota: `motivo=${reason}: o fornecedor entregou um artefato, logo renderizou e cobrou — o crédito NÃO volta`,
    };
  }
  return {
    estorna: false,
    gasto,
    nota: `motivo=${reason}: o job foi aceito (há provider_job_id), então a cota do fornecedor foi consumida — o crédito NÃO volta, e a reconciliação pelo job id é o que resta`,
  };
}

/**
 * Os motivos em que a varredura de boot pode reacompanhar em vez de encerrar.
 * Nenhum deles é terminal — são os dois estados que a máquina admite como "em
 * andamento".
 */
export const ESTADOS_NAO_TERMINAIS = ["queued", "processing"] as const;
