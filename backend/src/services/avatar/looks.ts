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
 * A recusa do modo live é a parte mais importante deste arquivo, e é a que
 * precisa ser provada reprovando. Dentro de um handler do Fastify ela só seria
 * alcançável subindo a aplicação inteira; aqui é uma função que a guarda chama
 * com o modo trocado e confere o veredito. A rota fica com o que é dela:
 * autenticação, forma do corpo e código HTTP.
 * ---------------------------------------------------------------------------
 */
import { randomUUID } from "node:crypto";
import { pool } from "../../db/pool.js";
import type { AvatarLook } from "../providers/avatarProvider.js";
import { isFixtureMode } from "../providers/providerMode.js";

export type CriarLookRecusa =
  | "avatar_not_trained"
  | "look_name_required"
  | "look_content_required"
  | "look_creation_not_implemented";

export type CriarLookResult =
  | { ok: true; look: AvatarLook }
  | { ok: false; code: CriarLookRecusa; status: number; message: string };

export interface CriarLookInput {
  tenantId: string;
  avatarId: string;
  /** `null` enquanto o avatar não terminou o treino no fornecedor. */
  providerAvatarId: string | null;
  name: string;
  prompt?: string | null;
  imageUrl?: string | null;
}

/**
 * A recusa do caminho pago, escrita uma vez só.
 *
 * Dois motivos independentes, e cada um bastaria:
 *
 *  1. O endpoint de criação de look do fornecedor NÃO é conhecido. Nenhum
 *     contrato lido por GET declara a operação, e descobri-la exigiria um POST
 *     de sondagem — que gasta. Escolher um path plausível e mandar pareceria
 *     implementado e só falharia com dinheiro em jogo.
 *  2. Criar avatar ou look no fornecedor custa da ordem de US$ 1,00, cerca de
 *     seis vezes um vídeo de 15 s. Um botão que gasta isso não pode nascer
 *     ligado por acidente.
 *
 * O texto cita o CUSTO de propósito: uma recusa que só diz "não implementado"
 * convida a implementar às pressas, e a segunda razão continuaria de pé.
 */
export const RECUSA_LIVE =
  "Criar traje não está implementado no modo live. O endpoint de criação de look do fornecedor não é " +
  "conhecido — nenhum contrato lido declara essa operação, e descobri-la exigiria um POST de sondagem, " +
  "que gasta. Além disso, criar avatar ou look no fornecedor custa cerca de US$ 1,00, aproximadamente " +
  "seis vezes um vídeo de 15 s: não é uma chamada para acontecer por tentativa. Escolher entre os trajes " +
  "que o avatar já tem continua funcionando normalmente.";

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

  // A ordem importa: a recusa do modo vem DEPOIS da validação de forma. Um
  // corpo malformado deve ouvir que está malformado nos dois modos — senão em
  // live todo erro vira "não implementado" e ninguém descobre o de verdade.
  if (!isFixtureMode()) {
    return { ok: false, code: "look_creation_not_implemented", status: 501, message: RECUSA_LIVE };
  }

  // O id tem a mesma FORMA dos looks de fixture (`<avatar>-look-<algo>`), de
  // propósito: o payload impresso na simulação não precisa de caso especial
  // para distinguir traje criado de traje que já existia, e o dia em que o
  // caminho real chegar troca só quem gera o id.
  const providerLookId = `${input.providerAvatarId}-look-${randomUUID().slice(0, 8)}`;

  await pool.query(
    `INSERT INTO avatar_looks (tenant_id, avatar_id, provider_look_id, name, preview_image_url, prompt, simulated)
     VALUES ($1, $2, $3, $4, $5, $6, true)`,
    [input.tenantId, input.avatarId, providerLookId, nome, input.imageUrl ?? null, prompt || null],
  );

  return { ok: true, look: { id: providerLookId, name: nome, previewImageUrl: input.imageUrl ?? null } };
}

/** Linha de `avatar_looks` como a listagem a lê (migration 044). */
interface AvatarLookRow {
  provider_look_id: string;
  name: string;
  preview_image_url: string | null;
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
): Promise<AvatarLook[]> {
  const { rows } = await pool.query<AvatarLookRow>(
    `SELECT provider_look_id, name, preview_image_url FROM avatar_looks
      WHERE tenant_id = $1 AND avatar_id = $2 ORDER BY created_at ASC`,
    [tenantId, avatarId],
  );

  // Deduplicado pelo id que vai ao fornecedor: no dia em que o caminho real
  // existir, um look criado aqui pode voltar na lista dele, e mostrar o mesmo
  // traje duas vezes faria a pessoa achar que criou dois.
  const locais = rows
    .filter((l) => !doFornecedor.some((f) => f.id === l.provider_look_id))
    .map((l) => ({ id: l.provider_look_id, name: l.name, previewImageUrl: l.preview_image_url }));

  return [...doFornecedor, ...locais];
}
