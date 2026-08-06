/**
 * INVENTÁRIO DA DÍVIDA COM PRAZO — o que ainda fala v2 com a HeyGen.
 *
 * O fornecedor carimba a data no corpo de TODA resposta v2:
 *
 *   "warning": { "message": "This v2 endpoint is Legacy and will be removed on
 *                2026-10-31. …" }
 *
 * Isto não é uma lista de coisas quebradas — os endpoints v2 respondem 200 hoje.
 * É uma lista de coisas que param de responder numa data conhecida, e a única
 * razão de existir é que ninguém descubra isso em produção.
 *
 * POR QUE UM ARQUIVO EM VEZ DE UM COMENTÁRIO: um comentário não impede que a
 * décima chamada v2 entre sem ser notada. Este arquivo é lido pela guarda
 * `checkLegacyEndpointPolicy`, que varre o código atrás de `/v2/` e reprova
 * qualquer ocorrência que não esteja declarada aqui — com o arquivo em que ela
 * pode estar. Entrar na lista é uma decisão; entrar sem decisão, não dá.
 *
 * O QUE FOI MEDIDO EM 06/08, por GET, sem gastar nada:
 *
 *  - `/v2/photo_avatar/{id}` e `/v2/avatar_group/{g}/avatars` TÊM substituto v3
 *    e já foram migrados. A rota de listagem não era a que o aviso do fornecedor
 *    sugeria: `/v3/avatar_groups/{g}`, `/v3/avatars/{g}/looks` e
 *    `/v3/avatar_groups/{g}/avatars` devolvem 404 de roteador, e quem responde
 *    200 é `GET /v3/avatars/looks?group_id={g}`.
 *  - `/v2/user/remaining_quota` NÃO tem substituto conhecido. Sondados
 *    `/v3/user/remaining_quota`, `/v3/users/remaining_quota`,
 *    `/v3/users/me/quota`, `/v3/users/me/remaining_quota` e `/v3/quota`: os
 *    cinco devolvem 404. `/v3/users/me` responde 200 e traz a CARTEIRA em
 *    dólares (`wallet.remaining_balance`), que não é a mesma coisa que a cota em
 *    unidades — a régua medida é 60 un = US$ 1,00, mas quem paga por carteira e
 *    quem paga por cota não são necessariamente a mesma leitura.
 */

/** A data que o fornecedor carimba em toda resposta v2. */
export const HEYGEN_V2_SUNSET = "2026-10-31";

export interface LegacyEndpoint {
  /** Prefixo do caminho, como aparece no código. */
  path: string;
  /**
   * A rota v3 equivalente, MEDIDA respondendo 200 — ou `null` quando a sondagem
   * não achou nenhuma. `null` é uma medição, não uma omissão: ver o cabeçalho.
   */
  replacement: string | null;
  /** Arquivos (relativos à raiz do repositório) em que esta chamada pode estar. */
  files: string[];
  /** Por que ainda está aqui. */
  reason: string;
}

export const LEGACY_V2_ENDPOINTS: LegacyEndpoint[] = [
  {
    path: "/v2/user/remaining_quota",
    replacement: null,
    files: [
      "backend/src/services/providers/avatarProvider.ts",
      "backend/src/services/providers/endpointCatalog.ts",
      "backend/src/services/providers/platformKeyProbe.ts",
      "backend/src/scripts/quotaBaseline.ts",
      "backend/src/scripts/checkPlatformKeyPolicy.ts",
    ],
    reason:
      "não há substituto v3 conhecido — cinco caminhos plausíveis sondados em 06/08, todos 404. " +
      "`/v3/users/me` dá a carteira em dólares, não a cota em unidades. Esta é a leitura que prova " +
      "que uma passada não gastou nada, então perdê-la sem substituto é perder a régua.",
  },
  {
    path: "/v2/photo_avatar",
    replacement: "/v3/avatars/looks/{look_id}",
    files: ["backend/src/scripts/probeLookEndpoints.ts"],
    reason:
      "migrado no produto em 06/08. Sobrevive só na sonda, que existe justamente para COMPARAR as duas " +
      "famílias — tirá-la de lá cegaria a medição que provou que o v2 lê look v3 com 200.",
  },
  {
    path: "/v2/avatar_group",
    replacement: "/v3/avatars/looks?group_id={group_id}",
    files: [
      "backend/src/scripts/probeLookEndpoints.ts",
      "backend/src/scripts/checkPlatformKeyPolicy.ts",
    ],
    reason:
      "migrado no produto em 06/08. Fica na sonda pelo mesmo motivo do anterior, e na guarda de chave de " +
      "plataforma como caminho que o probe de credencial NÃO pode alcançar.",
  },
];

/** Os caminhos declarados, para a guarda comparar com o que achou no código. */
export function declaredLegacyPaths(): string[] {
  return LEGACY_V2_ENDPOINTS.map((e) => e.path);
}

/** Quantos ainda não têm para onde ir. É este número que a data de sunset ameaça. */
export function legacyWithoutReplacement(): LegacyEndpoint[] {
  return LEGACY_V2_ENDPOINTS.filter((e) => e.replacement === null);
}
