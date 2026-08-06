import { pool } from "../../db/pool.js";
import { isFixtureMode } from "../providers/providerMode.js";

export type CreditType = "video" | "script" | "avatar";

/**
 * O nome da CONTA onde o movimento é escrito — que não é a mesma coisa que o
 * tipo de crédito pedido.
 *
 * Existem seis contas e três tipos: cada tipo tem a conta real, que é dinheiro,
 * e a conta de ENSAIO, que é o que o modo `fixture` consome (migration 043).
 *
 * POR QUE ISTO É UM TIPO SEPARADO, e não `CreditType` ampliado com mais três
 * valores: ampliar o tipo público faria `grantPurchasedCredit()` — que é compra
 * via Stripe — e `applyGrant()` — que é a concessão mensal do plano — passarem a
 * ACEITAR contas de ensaio nas suas assinaturas. Nenhuma das duas deve poder
 * tocar um balde de ensaio: uma cobra cartão, a outra reflete o plano
 * contratado, e as duas movimentam valor real. Mantendo `CreditType` com três
 * valores, quem impede o engano é o compilador, e não a lembrança de quem
 * estiver editando o arquivo às pressas.
 */
type LedgerCreditType = CreditType | `${CreditType}_rehearsal`;

/**
 * A conta a movimentar para um tipo de crédito, decidida pelo MODO.
 *
 * Em `fixture` nada é enviado a fornecedor e nada é cobrado, então debitar o
 * saldo real seria cobrar por um ensaio. Foi o que aconteceu até 05/08: o
 * tenant de desenvolvimento chegou a `video: 0` ensaiando, e saldo zero é
 * recusa no portão de prontidão — ensaiar de graça ficou impossível.
 *
 * Isto é chamado em exatamente três lugares, e os três estão listados aqui de
 * propósito, porque a lista é a parte fácil de errar:
 *   1. `debitCredit()`      — logo abaixo;
 *   2. `refundCredit()`     — só como base, ver a nota lá sobre o ledger;
 *   3. `evaluateGenerationReadiness()` — o retrato que a rota e a tela leem.
 *
 * O terceiro é o que faz a diferença entre corrigir e parecer corrigir: o
 * portão recusa ANTES do débito, então trocar a conta só no débito deixaria a
 * geração barrada com 403 enquanto o balde de ensaio ficava intocado.
 */
export function contaDe(creditType: CreditType, fixture = isFixtureMode()): LedgerCreditType {
  return fixture ? `${creditType}_rehearsal` : creditType;
}

export interface DebitCreditInput {
  tenantId: string;
  creditType: CreditType;
  amount?: number; // defaults to 1 — one debit per video/script/avatar attempt
  relatedVideoId?: string | null;
  relatedScriptGenerationId?: string | null;
  relatedAvatarTrainingId?: string | null;
  /** Criação de traje (migration 046). Look não é treino: referência própria. */
  relatedAvatarLookId?: string | null;
}

export type DebitCreditResult =
  | { ok: true; balance: number }
  | { ok: false; reason: "insufficient_credits"; balance: number };

// Debits `amount` (default 1) credits of `creditType` from the tenant's
// balance. A missing tenant_credits row — new signups don't seed the 3
// rows yet (migration 028, flagged there for a later step) — is treated as
// balance 0, not a bug: the gate must fail closed (insufficient_credits),
// never throw just because the row hasn't been provisioned.
//
// The balance read, the UPDATE...RETURNING, and the credit_ledger INSERT
// all run in one transaction (FOR UPDATE locks the row for the duration)
// so the cached balance and the immutable ledger can never diverge if one
// write fails after the other.
export async function debitCredit(input: DebitCreditInput): Promise<DebitCreditResult> {
  const amount = input.amount ?? 1;
  // A conta, não o tipo: em `fixture` o movimento inteiro — leitura, desconto e
  // lançamento — acontece no balde de ensaio, e o saldo real não é tocado.
  const conta = contaDe(input.creditType);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: balanceRows } = await client.query<{ balance: number }>(
      "SELECT balance FROM tenant_credits WHERE tenant_id = $1 AND credit_type = $2 FOR UPDATE",
      [input.tenantId, conta],
    );
    const currentBalance = balanceRows[0]?.balance ?? 0;

    if (currentBalance < amount) {
      await client.query("ROLLBACK");
      return { ok: false, reason: "insufficient_credits", balance: currentBalance };
    }

    const { rows: updatedRows } = await client.query<{ balance: number }>(
      `UPDATE tenant_credits SET balance = balance - $3, updated_at = now()
       WHERE tenant_id = $1 AND credit_type = $2
       RETURNING balance`,
      [input.tenantId, conta, amount],
    );

    // `simulated` é lido do modo do provedor, não recebido como parâmetro:
    // se dependesse de cada chamador lembrar de passar a flag, bastaria um
    // esquecer para um consumo simulado entrar no ledger como real — e um
    // número inflado que parece legítimo é pior que um número faltando.
    // Só os tipos que passam por HeyGen/ElevenLabs podem ser simulados;
    // roteiro usa provedor de texto, que não tem modo fixture.
    const simulated = isFixtureMode() && (input.creditType === "video" || input.creditType === "avatar");

    await client.query(
      `INSERT INTO credit_ledger
         (tenant_id, credit_type, delta, reason, simulated, related_video_id, related_script_generation_id, related_avatar_training_id, related_avatar_look_id)
       VALUES ($1, $2, $3, 'consumption', $4, $5, $6, $7, $8)`,
      [
        input.tenantId,
        conta,
        -amount,
        simulated,
        input.relatedVideoId ?? null,
        input.relatedScriptGenerationId ?? null,
        input.relatedAvatarTrainingId ?? null,
        input.relatedAvatarLookId ?? null,
      ],
    );

    await client.query("COMMIT");
    return { ok: true, balance: updatedRows[0].balance };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface GrantPurchasedCreditInput {
  tenantId: string;
  creditType: CreditType;
  quantity: number;
  stripePaymentIntentId: string;
}

export interface GrantPurchasedCreditResult {
  balance: number;
  alreadyGranted: boolean;
}

// Credits a one-off Stripe purchase (routes/stripeWebhook.ts,
// checkout.session.completed with metadata.type === 'credit_purchase').
// Stripe can and does redeliver the same webhook event, so this must be
// idempotent per payment_intent — not just "safe to call twice", but a
// guaranteed no-op the second time. Same lock-then-check ordering as
// monthlyGrant.ts's applyGrant(): lock the tenant_credits row first, THEN
// check credit_ledger for this payment_intent, so two deliveries racing
// each other serialize on the row lock instead of both passing the check.
export async function grantPurchasedCredit(
  input: GrantPurchasedCreditInput,
): Promise<GrantPurchasedCreditResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: balanceRows } = await client.query<{ balance: number }>(
      "SELECT balance FROM tenant_credits WHERE tenant_id = $1 AND credit_type = $2 FOR UPDATE",
      [input.tenantId, input.creditType],
    );

    const { rows: existing } = await client.query(
      "SELECT 1 FROM credit_ledger WHERE stripe_payment_intent_id = $1 AND credit_type = $2",
      [input.stripePaymentIntentId, input.creditType],
    );
    if (existing[0]) {
      await client.query("ROLLBACK");
      return { balance: balanceRows[0]?.balance ?? 0, alreadyGranted: true };
    }

    let balance: number;
    if (balanceRows[0]) {
      const { rows: updated } = await client.query<{ balance: number }>(
        `UPDATE tenant_credits SET balance = balance + $3, updated_at = now()
         WHERE tenant_id = $1 AND credit_type = $2
         RETURNING balance`,
        [input.tenantId, input.creditType, input.quantity],
      );
      balance = updated[0].balance;
    } else {
      // Defensive only — every tenant should already have this row
      // (migration 028's backfill, and the signup transaction for new ones).
      const { rows: inserted } = await client.query<{ balance: number }>(
        "INSERT INTO tenant_credits (tenant_id, credit_type, balance) VALUES ($1, $2, $3) RETURNING balance",
        [input.tenantId, input.creditType, input.quantity],
      );
      balance = inserted[0].balance;
    }

    await client.query(
      `INSERT INTO credit_ledger (tenant_id, credit_type, delta, reason, stripe_payment_intent_id)
       VALUES ($1, $2, $3, 'purchase', $4)`,
      [input.tenantId, input.creditType, input.quantity, input.stripePaymentIntentId],
    );

    await client.query("COMMIT");
    return { balance, alreadyGranted: false };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface RefundCreditInput {
  tenantId: string;
  creditType: CreditType;
  amount?: number;
  /**
   * A tentativa que falhou. Exatamente UM destes é obrigatório: é a chave de
   * idempotência — sem ela não há como distinguir "estornar de novo" de
   * "estornar outra tentativa".
   */
  relatedVideoId?: string | null;
  relatedScriptGenerationId?: string | null;
  relatedAvatarTrainingId?: string | null;
  relatedAvatarLookId?: string | null;
}

export type RefundCreditResult =
  | { refunded: true; balance: number }
  | { refunded: false; reason: "already_refunded" | "no_reference" };

/**
 * Devolve o crédito de uma tentativa que o fornecedor RECUSOU.
 *
 * ---------------------------------------------------------------------------
 * ONDE ESTÁ A LINHA — leia antes de chamar isto em um lugar novo
 *
 * Estorna: a chamada ao fornecedor lançou. Nada foi produzido, nenhuma cota
 * externa foi consumida, e o cliente ficou sem nada. Cobrar por isso é cobrar
 * por um erro nosso ou uma indisponibilidade deles.
 *
 * NÃO estorna: qualquer falha DEPOIS de o fornecedor aceitar o trabalho. Se o
 * job de vídeo foi enfileirado e o polling falha, se o artefato chega
 * truncado, se o download quebra — o fornecedor renderizou, a cota dele foi
 * gasta, e o dinheiro já saiu. Devolver crédito aí transformaria um problema
 * de entrega em crédito grátis, e o incentivo seria exatamente o errado.
 *
 * Caso de fronteira que já existe no código: em `avatars.ts`, o treino do
 * avatar pode ter SUCESSO e a clonagem de voz falhar em seguida. Não estorna:
 * o crédito de avatar pagou o treino, e o treino aconteceu. A voz não tem
 * crédito próprio (ver o mapa no CLAUDE.md, bloco ESTORNO-1).
 * ---------------------------------------------------------------------------
 *
 * O débito continua ANTES da chamada, de propósito. Debitar depois eliminaria
 * o estorno, mas abriria uma corrida: duas requisições simultâneas passariam
 * as duas pela verificação de saldo e as duas chamariam o fornecedor. Prefere-
 * se cobrar e devolver a arriscar gastar cota que não existe.
 *
 * Idempotente por tentativa: o `INSERT` do estorno é protegido por um índice
 * único parcial (migration 035), e a checagem abaixo roda depois do
 * `FOR UPDATE` — mesmo padrão de `grantPurchasedCredit()`, para que duas
 * chamadas concorrentes serializem no lock em vez de passarem as duas.
 */
export async function refundCredit(input: RefundCreditInput): Promise<RefundCreditResult> {
  const amount = input.amount ?? 1;
  const references = [
    ["related_video_id", input.relatedVideoId],
    ["related_script_generation_id", input.relatedScriptGenerationId],
    ["related_avatar_training_id", input.relatedAvatarTrainingId],
    ["related_avatar_look_id", input.relatedAvatarLookId],
  ].filter(([, value]) => value) as [string, string][];

  // Sem referência não há chave de idempotência, e um estorno que pode repetir
  // é pior que nenhum: cria dinheiro. Recusa em vez de adivinhar.
  if (references.length !== 1) return { refunded: false, reason: "no_reference" };
  const [column, value] = references[0];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // A CONTA VEM DO DÉBITO, NÃO DO MODO ATUAL.
    //
    // O débito e o estorno não acontecem no mesmo instante: entre um e outro
    // cabe a chamada ao fornecedor e, na prática deste projeto, cabe também um
    // `restart` — que é rotina aqui, porque código novo não entra sem ele. Se o
    // modo mudar nesse intervalo, decidir a conta por `contaDe()` devolveria o
    // crédito ao balde errado: um ensaio debitado em `fixture` viraria crédito
    // real em `live`, o que é criar dinheiro, e o inverso apagaria saldo pago.
    //
    // O lançamento de consumo já diz em que conta o débito caiu. Ele é a
    // resposta, e é a única que não depende de o ambiente ter ficado parado.
    // Sem lançamento (débito que nunca existiu) cai-se no modo atual, que é o
    // melhor palpite disponível e não pode piorar nada: não havendo débito, o
    // `UPDATE` abaixo também não encontra o que devolver.
    const { rows: contaRows } = await client.query<{ credit_type: LedgerCreditType }>(
      `SELECT credit_type FROM credit_ledger
        WHERE reason = 'consumption' AND ${column} = $1
        ORDER BY created_at ASC LIMIT 1`,
      [value],
    );
    const conta = contaRows[0]?.credit_type ?? contaDe(input.creditType);

    const { rows: balanceRows } = await client.query<{ balance: number }>(
      "SELECT balance FROM tenant_credits WHERE tenant_id = $1 AND credit_type = $2 FOR UPDATE",
      [input.tenantId, conta],
    );

    const { rows: existing } = await client.query(
      `SELECT 1 FROM credit_ledger WHERE reason = 'refund' AND ${column} = $1`,
      [value],
    );
    if (existing[0]) {
      await client.query("ROLLBACK");
      return { refunded: false, reason: "already_refunded" };
    }

    const { rows: updated } = await client.query<{ balance: number }>(
      `UPDATE tenant_credits SET balance = balance + $3, updated_at = now()
       WHERE tenant_id = $1 AND credit_type = $2
       RETURNING balance`,
      [input.tenantId, conta, amount],
    );
    // Linha de tenant_credits ausente é o mesmo caso defensivo de
    // debitCredit(): sem linha não houve débito, então não há o que devolver.
    if (!updated[0]) {
      await client.query("ROLLBACK");
      return { refunded: false, reason: "no_reference" };
    }

    // `simulated` nunca é recebido do chamador — mas aqui ele sai da CONTA, e
    // não do modo. Pela mesma razão do bloco acima: se o modo mudou entre o
    // débito e o estorno, ler o modo marcaria como real o estorno de um débito
    // simulado, e as duas listas do painel deixariam de bater exatamente no
    // caso que elas existem para mostrar.
    const emEnsaio = conta !== input.creditType;
    const simulated =
      (emEnsaio || isFixtureMode()) && (input.creditType === "video" || input.creditType === "avatar");

    await client.query(
      `INSERT INTO credit_ledger
         (tenant_id, credit_type, delta, reason, simulated, ${column})
       VALUES ($1, $2, $3, 'refund', $4, $5)`,
      [input.tenantId, conta, amount, simulated, value],
    );

    await client.query("COMMIT");
    return { refunded: true, balance: updated[0].balance };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
