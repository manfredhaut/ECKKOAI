/**
 * QUAL chave de plataforma cobre cada `(provider, vendor)` do tenant — W1.
 *
 * ┌─ O buraco que isto fecha, MEDIDO em 24/08 ───────────────────────────────┐
 * │ A chave de plataforma substituía o VALOR da linha do tenant e nunca      │
 * │ CRIAVA a linha. Um tenant recém-criado nasce com três linhas de vendor   │
 * │ VAZIO e chave nula (medido em `admin-3` e `ecko-…`), então               │
 * │ `getCredential` devolvia `null`, a geração respondia 400                 │
 * │ `tier_vendor_unavailable`, e a chave de plataforma — gravada, válida,    │
 * │ ali do lado — nunca era consultada. 23 de 34 tenants estavam nesse       │
 * │ estado.                                                                  │
 * │                                                                          │
 * │ Decisão do operador (24/08), respondendo ao bloco CHAVES-2: **a          │
 * │ plataforma passa a pagar quando o tenant não tem chave própria.** Tenant │
 * │ COM chave própria continua pagando a dele — a precedência é essa, e não  │
 * │ a inversa.                                                               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Por que um mapa explícito, e não o nome do vendor ──────────────────────┐
 * │ Seria tentador derivar (`vendor` → id de mesmo nome). Três dos cinco     │
 * │ pares quebram essa regra: `script/gemini` é coberto pela chave `google`, │
 * │ `avatar/did` não tem chave de plataforma nenhuma, e `script/anthropic`   │
 * │ tem uma chave parecida (`copilot`) que serve OUTRA coisa — o copiloto    │
 * │ público e o do admin. Derivar por nome faria o roteiro de um tenant      │
 * │ passar a consumir a cota do suporte sem uma linha de código dizendo      │
 * │ isso.                                                                    │
 * │                                                                          │
 * │ `null` é uma entrada de primeira classe aqui: significa "não há chave de │
 * │ plataforma para este par, e a ausência é deliberada". Faltar do mapa e   │
 * │ estar no mapa como `null` são coisas diferentes, e as duas caem no mesmo │
 * │ comportamento (sem herança) de propósito — o que muda é o leitor saber   │
 * │ se alguém pensou no caso.                                                │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * MÓDULO FOLHA em relação a `credentialLookup` e aos providers: importa só o
 * tipo do id e o catálogo de vendors. É a lição do ciclo de 24/08 aplicada
 * antes de doer — ver `billing/voiceCost.ts`.
 */
import type { PlatformCredentialId } from "./platformCredentials.js";
import type { CredentialProvider } from "../types.js";

/**
 * `(provider, vendor)` → id da chave de plataforma que o cobre.
 *
 * A chave do mapa é `provider/vendor` como string única porque o par é o que
 * identifica: `heygen` só existe em `avatar`, mas `google` cobre `script` e
 * nada mais, e amanhã pode cobrir dois.
 */
export type Precedencia =
  /** Regra do W1: a chave do TENANT vence; a plataforma só cobre a ausência. */
  | "byok_vence"
  /** A plataforma vence mesmo havendo BYOK — hoje só a fal. Ver a nota abaixo. */
  | "plataforma_vence";

export interface Cobertura {
  id: PlatformCredentialId;
  precedencia: Precedencia;
}

/**
 * ⚠️ **AS DUAS PRECEDÊNCIAS DIVERGEM, e a divergência é DECLARADA — 24/08.**
 *
 * A regra do W1, dita pelo operador, é `byok_vence`: "a plataforma passa a
 * pagar quando o tenant não tem chave própria; tenant COM chave própria
 * continua pagando a dele".
 *
 * A fal faz o CONTRÁRIO desde `2a04b4a` (21/08): `resolveTenantAvatarFalKey`
 * consulta a plataforma PRIMEIRO e só cai na BYOK se ela faltar. Não é
 * descuido — foi a centralização deliberada daquele bloco, e é o que está
 * sustentando o caminho da fal HOJE: a BYOK do tenant `dev-c77a5b` é a chave
 * que devolveu 401 em 19/08, e alinhá-la à regra geral a traria de volta,
 * re-bloqueando o P7.c.
 *
 * Por isso a precedência é um CAMPO e não uma regra global: o código declara
 * a divergência em vez de escondê-la, e mudá-la é editar uma palavra num
 * lugar. Qual das duas a fal deve seguir é decisão do operador, registrada
 * como pendente.
 */
export const HERANCA_DE_PLATAFORMA: Record<string, Cobertura | null> = {
  // Os quatro casos que o W1 abriu — até 24/08 os quatro tinham
  // `servedBy: ""` no painel ("armazenada e validada; ainda sem consumidor
  // no código").
  "avatar/heygen": { id: "heygen", precedencia: "byok_vence" },
  "voice/elevenlabs": { id: "elevenlabs", precedencia: "byok_vence" },
  "script/gemini": { id: "google", precedencia: "byok_vence" },

  // Já servida desde 21/08 (`2a04b4a`), por `resolveTenantAvatarFalKey`. Está
  // aqui para que a herança do tenant zerado alcance TAMBÉM a fal: aquela
  // função resolve o VALOR de uma linha que já existe, e o tenant novo não
  // tem linha nenhuma. As duas convivem e concordam — a mesma chave.
  "avatar/fal": { id: "fal", precedencia: "plataforma_vence" },

  // AUSÊNCIAS DELIBERADAS, e cada uma por um motivo diferente:
  //
  // `did` nunca teve chave de plataforma, e `generateVideo` sequer despacha
  // para ele hoje pelo caminho de tier.
  "avatar/did": null,
  // `anthropic` TEM uma chave parecida (`copilot`), e é justamente por isso
  // que ela está aqui como `null` em vez de faltar: aquele cartão declara
  // servir "copiloto público (pré-cadastro) e copiloto interno do admin".
  // Herdar por ela faria o roteiro de um cliente consumir a cota do suporte.
  // Ligar isto é decisão de produto, não de fiação.
  "script/anthropic": null,
  // Sem chave de plataforma OpenAI em lugar nenhum do projeto.
  "script/openai": null,
};

/**
 * A chave de plataforma que cobre este par, ou `null` quando não há.
 *
 * Par desconhecido (vendor novo que ninguém mapeou) devolve `null` — falha
 * FECHADA: o tenant sem chave própria continua sem acesso, exatamente como
 * antes desta função existir, e ninguém herda uma chave por acidente de
 * nomenclatura.
 */
export function plataformaQueCobre(
  provider: CredentialProvider,
  vendor: string,
): Cobertura | null {
  return HERANCA_DE_PLATAFORMA[`${provider}/${vendor}`] ?? null;
}
