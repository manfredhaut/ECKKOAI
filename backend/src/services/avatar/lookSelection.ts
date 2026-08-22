/**
 * QUAL id vai ao fornecedor: o do traje escolhido ou o do avatar.
 *
 * Uma linha de decisão, num módulo próprio, e a razão é a de sempre neste
 * projeto: enquanto ela morava como `avatarLookId ?? avatar.provider_avatar_id`
 * dentro do handler do Fastify, a única forma de exercitá-la era subir a
 * aplicação inteira. O arnês mostrou o preço disso — o mutante que apagava o
 * look reprovava o gate por OUTRA guarda, e a guarda do contrato nunca opinava.
 * Uma guarda que não consegue opinar sobre o defeito que existe para pegar é
 * inerte, e inerte é pior que ausente.
 *
 * ---------------------------------------------------------------------------
 * POR QUE A SUBSTITUIÇÃO, E NÃO UM CAMPO
 *
 * O fornecedor NÃO tem campo de traje em `POST /v3/videos`. A doc dele diz, na
 * letra: "The look id is the avatar_id to pass when creating a video". O traje
 * é um LOOK do avatar, e escolher traje é mandar outro id no MESMO campo.
 *
 * A consequência prática é que o defeito aqui é silencioso dos dois lados: o
 * corpo continua bem formado, o fornecedor continua respondendo 200, e o vídeo
 * chega com a roupa errada — cobrado. Foi assim em 06/08.
 * ---------------------------------------------------------------------------
 * G2 (22/08/2026) — VALIDAÇÃO ANTES DA SUBSTITUIÇÃO, gap dimensionado em Z0.3.
 *
 * `providerAvatarIdParaGeracao` sempre foi PURA: recebe o id e devolve o id,
 * sem tocar banco. `assertLookUsavel` é uma função nova, ao lado, porque o que
 * ela precisa checar não cabe numa função pura — precisa do estado gravado em
 * `avatar_looks` no INSTANTE do clique.
 *
 * O que ela FECHA: um traje criado por texto é ASSÍNCRONO (`status
 * 'processing'`, migration 045) — nada impedia hoje que um clique em Gerar,
 * disparado antes do fornecedor terminar, mandasse o `provider_look_id` de um
 * traje que ainda não existe de verdade. E um traje `simulated=true` (nascido
 * em `fixture`) nunca deveria alcançar uma chamada `live` — ele não tem
 * contrapartida real no fornecedor.
 *
 * O que ela NÃO FECHA, deliberadamente: um `avatarLookId` que não tem NENHUMA
 * linha local. Isso não é sinônimo de "inválido" — `listarLooks()` mistura
 * looks criados por NÓS com looks NATIVOS do fornecedor, nunca inseridos em
 * `avatar_looks` (documentado em CLAUDE.md como "18 órfãos", 11/08). Recusar
 * todo id sem linha local quebraria esse caminho, hoje legítimo. Fechar ESSE
 * gap exigiria confirmar o id contra o catálogo do fornecedor por chamada
 * (GET, sem custo, mas fora do escopo desta rodada) — registrado como aberto,
 * não fingido como coberto.
 * ---------------------------------------------------------------------------
 */
import type { Pool } from "pg";
import { isFixtureMode } from "../providers/providerMode.js";

export type LookInvalidoCode = "look_outro_avatar" | "look_nao_pronto" | "look_simulado_em_live";

export class LookInvalidoError extends Error {
  constructor(
    message: string,
    public readonly code: LookInvalidoCode,
  ) {
    super(message);
    this.name = "LookInvalidoError";
  }
}

interface LinhaAvatarLook {
  avatar_id: string;
  status: string;
  simulated: boolean;
}

/**
 * Recusa ANTES de qualquer chamada ao fornecedor quando o `avatarLookId`
 * corresponde a uma linha NOSSA (`avatar_looks`) que não pode ser usada agora.
 *
 * Consultado por TENANT, não por (tenant, avatar): um `provider_look_id`
 * criado para outro avatar deste mesmo tenant não pode ficar invisível só
 * porque o filtro incluiu `avatar_id` na cláusula — aqui ele precisa aparecer
 * e ser recusado por nome, não desaparecer como "sem linha local".
 *
 * Não lança nada quando não há linha nenhuma: ver o comentário do módulo,
 * seção G2, sobre por que isso é o comportamento certo, não um buraco.
 */
export async function assertLookUsavel(
  pool: Pool,
  params: { tenantId: string; avatarId: string; avatarLookId: string },
): Promise<void> {
  const { rows } = await pool.query<LinhaAvatarLook>(
    "SELECT avatar_id, status, simulated FROM avatar_looks WHERE tenant_id = $1 AND provider_look_id = $2",
    [params.tenantId, params.avatarLookId],
  );
  if (rows.length === 0) {
    return;
  }
  const doAvatar = rows.find((linha) => linha.avatar_id === params.avatarId);
  if (!doAvatar) {
    throw new LookInvalidoError(
      "O traje escolhido pertence a outro avatar desta conta — ele não pode ser usado para gerar este " +
        "vídeo. Nada foi cobrado.",
      "look_outro_avatar",
    );
  }
  if (doAvatar.status !== "completed") {
    throw new LookInvalidoError(
      `O traje escolhido ainda está "${doAvatar.status}" no fornecedor — ele só pode ser usado numa ` +
        "geração quando terminar de ficar pronto. Nada foi cobrado.",
      "look_nao_pronto",
    );
  }
  if (doAvatar.simulated && !isFixtureMode()) {
    throw new LookInvalidoError(
      "O traje escolhido foi criado em modo de ENSAIO (simulado) e não existe de verdade no fornecedor — " +
        "não pode ser usado numa geração real. Nada foi cobrado.",
      "look_simulado_em_live",
    );
  }
}

/**
 * @param providerAvatarId id do avatar no fornecedor — o padrão de "não trocar
 *   de roupa", e o que toda geração deste produto usou até agora.
 * @param avatarLookId look escolhido no passo Cena, ou `null`/vazio quando
 *   ninguém escolheu.
 */
export function providerAvatarIdParaGeracao(
  providerAvatarId: string,
  avatarLookId: string | null | undefined,
): string {
  // String vazia é tratada como ausência de propósito: um `<select>` sem
  // escolha manda `""`, e `"" ?? x` devolve `""` — que iria ao fornecedor como
  // avatar inexistente e derrubaria a geração DEPOIS do débito.
  const look = (avatarLookId ?? "").trim();
  return look.length > 0 ? look : providerAvatarId;
}
