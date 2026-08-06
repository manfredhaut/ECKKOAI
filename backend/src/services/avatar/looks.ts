/**
 * TRAJE é look do avatar — criar e listar.
 *
 * A regra de produto que decide o desenho: o fornecedor não tem campo de traje
 * em `POST /v3/videos`. O que existe é o avatar ter vários LOOKS, e o vídeo
 * escolher um. Escolher já funcionava (passo Cena); o que faltava era criar.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ISTO NÃO VIVE DENTRO DA ROTA
 *
 * A ordem entre freio, débito e chamada é a parte mais importante deste
 * arquivo, e é a que precisa ser provada reprovando. Dentro de um handler do
 * Fastify ela só seria alcançável subindo a aplicação inteira; aqui é uma
 * função que a guarda chama e confere. A rota fica com o que é dela:
 * autenticação, forma do corpo e código HTTP.
 *
 * A ORDEM, e ela custa dinheiro se trocada: forma → teto diário → débito →
 * fornecedor. Debitar antes de chamar é deliberado (mesma razão de
 * `debitCredit` na rota de vídeo: debitar depois abriria corrida entre duas
 * requisições simultâneas). O estorno só existe no `catch` da chamada, porque
 * foi MEDIDO em 06/08 que o fornecedor debita no 200 — depois do aceite não há
 * o que devolver.
 * ---------------------------------------------------------------------------
 */
import { pool } from "../../db/pool.js";
import type { AvatarLook, CreatedAvatarLook } from "../providers/avatarProvider.js";
import { createAvatarLook, readAvatarLookStatus } from "../providers/avatarProvider.js";
import type { AvatarVendor } from "../providers/vendorCatalog.js";
import { isFixtureMode } from "../providers/providerMode.js";
import { debitCredit, refundCredit } from "../billing/creditGate.js";
import {
  DailyGenerationLimitError,
  assertDailyGenerationBudget,
} from "../billing/dailyGenerationLimit.js";
import { HEYGEN_LOOK_COST } from "../billing/providerCost.js";
import { logEvent } from "../log/safeLog.js";

export type CriarLookRecusa =
  | "avatar_not_trained"
  | "look_name_required"
  | "look_content_required"
  | "daily_generation_limit"
  | "insufficient_credits"
  | "look_creation_failed";

export type CriarLookResult =
  | {
      ok: true;
      look: AvatarLook;
      /** Do FORNECEDOR: o traje só é escolhível quando vira `completed`. */
      status: "processing" | "completed" | "failed";
      simulated: boolean;
    }
  | { ok: false; code: CriarLookRecusa; status: number; message: string };

export interface CriarLookInput {
  tenantId: string;
  avatarId: string;
  /** `null` enquanto o avatar não terminou o treino no fornecedor. */
  providerAvatarId: string | null;
  name: string;
  prompt?: string | null;
  imageUrl?: string | null;
  apiKey: string;
  vendor: AvatarVendor;
}

/**
 * O caminho live DEIXOU DE RECUSAR em 06/08.
 *
 * O que o mantinha fechado era não se conhecer o endpoint — descobri-lo exigia
 * um POST, que gasta. Foi medido: `POST /v3/avatars` com `type: "prompt"`,
 * `name` e o id do LOOK em `avatar_id`. Ver `createAvatarLook()`.
 *
 * A segunda razão do fechamento continua de pé e não some com a implementação:
 * um traje custa **60 unidades, US$ 1,00** (medido no mesmo dia). Ela deixou de
 * ser recusa e virou três outras coisas — o teto diário compartilhado com
 * vídeo, o débito no ledger, e o número na tela antes de a pessoa confirmar.
 */
export async function criarLook(input: CriarLookInput): Promise<CriarLookResult> {
  if (!input.providerAvatarId) {
    return {
      ok: false,
      code: "avatar_not_trained",
      status: 400,
      message: "Este avatar ainda não foi treinado no fornecedor. Conclua o passo 1 antes de criar trajes.",
    };
  }

  const nome = input.name.trim();
  if (!nome) {
    return {
      ok: false,
      code: "look_name_required",
      status: 400,
      message: "Dê um nome ao traje — é por ele que você vai escolher na hora de gerar.",
    };
  }

  const prompt = (input.prompt ?? "").trim();
  if (!prompt && !input.imageUrl) {
    return {
      ok: false,
      code: "look_content_required",
      status: 400,
      message: "Envie uma imagem do traje ou descreva-o em texto. Um nome sozinho não descreve roupa nenhuma.",
    };
  }

  // -------------------------------------------------------------------------
  // O FREIO, antes de qualquer chamada e antes do débito.
  //
  // Um traje custa 60 unidades — US$ 1,00, MEDIDO em 06/08 — o mesmo que 20
  // segundos de vídeo cobrados. Passa pelo teto diário compartilhado com as
  // gerações de vídeo, porque a carteira é uma só.
  //
  // Em fixture nada é cobrado e nada é contado, exatamente como na rota de
  // vídeo: incluir a simulação no teto inventaria um limite inexistente.
  // -------------------------------------------------------------------------
  const simulado = isFixtureMode();
  if (!simulado) {
    try {
      await assertDailyGenerationBudget();
    } catch (err) {
      if (err instanceof DailyGenerationLimitError) {
        return { ok: false, code: "daily_generation_limit", status: 429, message: err.message };
      }
      throw err;
    }
  }

  // A LINHA NASCE ANTES DA CHAMADA, ainda sem o id do fornecedor.
  //
  // Não é ordem estética: `refundCredit()` exige EXATAMENTE UMA referência, que
  // é a chave de idempotência do estorno — sem ela um estorno pode repetir, o
  // que cria dinheiro. Criar traje não tinha nenhuma das três referências
  // existentes, e a primeira execução da guarda reprovou com "houve 0 estorno,
  // esperado 1": o crédito não voltava quando o fornecedor lançava. Esta linha é
  // a referência (migration 046), e por isso precede o débito.
  const { rows: criadas } = await pool.query<{ id: string }>(
    `INSERT INTO avatar_looks
       (tenant_id, avatar_id, provider_look_id, name, preview_image_url, prompt, simulated, status)
     VALUES ($1, $2, NULL, $3, $4, $5, $6, 'processing')
     RETURNING id`,
    [input.tenantId, input.avatarId, nome, input.imageUrl ?? null, prompt || null, simulado],
  );
  const lookRowId = criadas[0].id;

  // O crédito de AVATAR, e não um tipo novo: look é do avatar, é o que o
  // fornecedor entende por traje, e criar um mexe no mesmo grupo que o treino
  // criou. Em fixture isto cai no balde de ensaio (migration 043).
  const debito = await debitCredit({
    tenantId: input.tenantId,
    creditType: "avatar",
    relatedAvatarLookId: lookRowId,
  });
  if (!debito.ok) {
    // Sem débito não houve tentativa: a linha não deve sobrar como traje.
    await pool.query("DELETE FROM avatar_looks WHERE id = $1", [lookRowId]);
    return {
      ok: false,
      code: "insufficient_credits",
      status: 403,
      message: simulado
        ? "Saldo de ENSAIO de avatar esgotado. Nenhuma cobrança aconteceu e o saldo real não foi tocado."
        : "Créditos de avatar esgotados — adicione créditos ou aguarde a renovação mensal do seu plano.",
    };
  }

  let criado: CreatedAvatarLook;
  try {
    criado = await createAvatarLook({
      apiKey: input.apiKey,
      vendor: input.vendor,
      providerAvatarId: input.providerAvatarId,
      name: nome,
      prompt,
    });
  } catch (err) {
    // Estorno pela MESMA fronteira do vídeo: a chamada lançou, o fornecedor não
    // aceitou o trabalho, nada foi produzido. Medido em 06/08 que o dinheiro sai
    // no 200 — então depois do aceite não há o que devolver, e este `catch` é o
    // único lugar em que devolver é honesto.
    await refundCredit({
      tenantId: input.tenantId,
      creditType: "avatar",
      relatedAvatarLookId: lookRowId,
    });
    // A linha fica como `failed`, e não é apagada: ela é a referência do
    // estorno no ledger, e apagá-la (ON DELETE SET NULL) desarmaria a
    // idempotência que acabou de ser usada. `cost_units` continua NULL —
    // estornado é o mesmo que não cobrado.
    await pool.query("UPDATE avatar_looks SET status = 'failed' WHERE id = $1", [lookRowId]);
    logEvent("error", "look_creation_failed", {
      context: "avatar.criarLook",
      detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
      consequence: "nenhum traje foi criado e o crédito voltou",
    });
    return {
      ok: false,
      code: "look_creation_failed",
      status: 502,
      message:
        "O fornecedor recusou a criação do traje e nada foi cobrado — o crédito voltou. " +
        (err instanceof Error ? err.message : String(err)),
    };
  }

  await pool.query(
    `UPDATE avatar_looks
        SET provider_look_id = $2, status = $3, cost_units = $4,
            preview_image_url = COALESCE($5, preview_image_url)
      WHERE id = $1`,
    [lookRowId, criado.id, criado.status, simulado ? null : HEYGEN_LOOK_COST.units, criado.previewImageUrl],
  );

  return {
    ok: true,
    look: { id: criado.id, name: criado.name, previewImageUrl: criado.previewImageUrl ?? input.imageUrl ?? null },
    status: criado.status,
    simulated: simulado,
  };
}

/** Linha de `avatar_looks` como a listagem a lê (migrations 044 e 045). */
interface AvatarLookRow {
  id: string;
  /** NULL entre a criação da linha e o 200 do fornecedor (migration 046). */
  provider_look_id: string | null;
  name: string;
  preview_image_url: string | null;
  status: "processing" | "completed" | "failed";
}

/** Um traje ainda em preparo, para a tela poder mostrar andamento. */
export interface LookPendente {
  id: string;
  name: string;
  status: "processing" | "failed";
}

/**
 * Reconcilia com o fornecedor os trajes que ainda estão em preparo.
 *
 * Roda na LISTAGEM, e não num `setInterval`: o polling de vídeo vive na memória
 * do processo e um reinício o perde para sempre — defeito conhecido e registrado
 * neste projeto. Aqui o gatilho é alguém abrir a tela, então reiniciar o backend
 * não deixa traje nenhum presol: a próxima abertura reconcilia.
 *
 * Consultar status é GET e não é tarifado — medido em 06/08, a quota não se
 * moveu em nenhuma das consultas de acompanhamento.
 */
async function reconciliarPendentes(
  tenantId: string,
  avatarId: string,
  apiKey: string,
  vendor: AvatarVendor,
  linhas: AvatarLookRow[],
): Promise<void> {
  // Só os que já têm id do fornecedor: sem id não há o que consultar — a linha
  // está no intervalo entre nascer e o 200 chegar, que dura uma requisição.
  const pendentes = linhas.filter((l) => l.status === "processing" && l.provider_look_id);
  if (pendentes.length === 0) return;

  for (const linha of pendentes) {
    const atual = await readAvatarLookStatus(apiKey, vendor, linha.provider_look_id as string);
    if (atual.status === "processing") continue;
    await pool.query(
      `UPDATE avatar_looks SET status = $3, preview_image_url = COALESCE($4, preview_image_url)
        WHERE tenant_id = $1 AND provider_look_id = $2`,
      [tenantId, linha.provider_look_id, atual.status, atual.previewImageUrl],
    );
    linha.status = atual.status;
    linha.preview_image_url = atual.previewImageUrl ?? linha.preview_image_url;
    logEvent("info", "look_status_reconciled", {
      context: "avatar.listarLooks",
      avatarId,
      status: atual.status,
    });
  }
}

/**
 * Os looks do fornecedor mais os criados aqui, em UMA lista.
 *
 * Duas listas na tela obrigariam a pessoa a saber de onde veio cada traje para
 * poder escolher um, e de onde veio é problema nosso. Os do fornecedor vêm
 * primeiro porque o primeiro deles é o traje atual do avatar — o padrão de "não
 * trocar de traje" continua sendo o primeiro da lista.
 */
export async function listarLooks(
  tenantId: string,
  avatarId: string,
  doFornecedor: AvatarLook[],
  credencial?: { apiKey: string; vendor: AvatarVendor },
): Promise<{ looks: AvatarLook[]; pendentes: LookPendente[] }> {
  const { rows } = await pool.query<AvatarLookRow>(
    `SELECT id, provider_look_id, name, preview_image_url, status FROM avatar_looks
      WHERE tenant_id = $1 AND avatar_id = $2 ORDER BY created_at ASC`,
    [tenantId, avatarId],
  );

  if (credencial) {
    await reconciliarPendentes(tenantId, avatarId, credencial.apiKey, credencial.vendor, rows);
  }

  // ESCOLHÍVEL é só o que está pronto. Um traje em preparo na lista faria a
  // geração sair com um look que ainda não existe no fornecedor — e a geração
  // custa. `failed` também fica de fora do seletor, mas NÃO some da tela: ele
  // foi pago, e esconder dinheiro gasto é pior que mostrar um erro.
  const prontos = rows.filter((l) => l.status === "completed" && l.provider_look_id);

  // Deduplicado pelo id que vai ao fornecedor: um look criado aqui volta na
  // listagem dele assim que fica pronto — medido, o grupo passou a ter 2 looks —
  // e mostrar o mesmo traje duas vezes faz a pessoa achar que criou dois.
  const locais = prontos
    .filter((l) => !doFornecedor.some((f) => f.id === l.provider_look_id))
    .map((l) => ({ id: l.provider_look_id as string, name: l.name, previewImageUrl: l.preview_image_url }));

  // O id do PENDENTE é o da nossa linha quando o fornecedor ainda não devolveu
  // o dele: a tela precisa de uma chave estável para listar o andamento, e ela
  // nunca é usada para escolher traje — pendente não é escolhível.
  const pendentes = rows
    .filter((l) => l.status !== "completed")
    .map((l) => ({
      id: l.provider_look_id ?? l.id,
      name: l.name,
      status: l.status as "processing" | "failed",
    }));

  return { looks: [...doFornecedor, ...locais], pendentes };
}
