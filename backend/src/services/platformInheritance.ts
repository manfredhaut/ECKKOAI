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
export interface Cobertura {
  id: PlatformCredentialId;
}

/**
 * ⚠️ **A PLATAFORMA VENCE SEMPRE — regra GERAL desde 25/08 (h.3).**
 *
 * Até aqui a regra do W1 (24/08) era `byok_vence`: "a plataforma paga a
 * AUSÊNCIA; quem tem chave própria continua pagando a dele" — com UMA
 * exceção isolada, `avatar/fal`, que fazia o contrário desde `2a04b4a`
 * (21/08) por decisão pontual daquele bloco (a BYOK do tenant `dev-c77a5b`
 * era a chave que devolvia 401 em 19/08).
 *
 * O operador respondeu ao item (g)/(h.3) do fechamento de 25/08: a
 * divergência não é mais um ramo à parte — é a regra para QUALQUER vendor.
 * **Ter uma linha aqui (não-`null`) já significa "a plataforma vence
 * quando tiver a chave"**, para todo par. A fal deixou de ser exceção porque
 * deixou de haver exceção: ela é só mais uma entrada do mesmo mapa.
 *
 * A ausência de cobertura (entrada `null`, ou par fora do mapa) continua
 * caindo no BYOK do tenant exatamente como antes — isso não mudou, e é a
 * retaguarda que protege `avatar/did`/`script/anthropic`/`script/openai`
 * abaixo, que seguem sem entrada por decisão, não por lacuna.
 *
 * ⚠️ **MEDIDO no banco local, 25/08 — ISTO NÃO É INERTE.** `SELECT key,
 * last_four FROM platform_credentials` mostra linha gravada para os QUATRO
 * pares abaixo (heygen, elevenlabs, google, fal) — não só a fal. A regra
 * geral fica ATIVA para os quatro imediatamente, não represada esperando
 * alguém cadastrar uma chave. Ver o relatório do item 3 (h.3) para o
 * levantamento completo, vendor por vendor.
 */
export const HERANCA_DE_PLATAFORMA: Record<string, Cobertura | null> = {
  // Os quatro casos que o W1 abriu — até 24/08 os quatro tinham
  // `servedBy: ""` no painel ("armazenada e validada; ainda sem consumidor
  // no código"); hoje (25/08) TODOS têm linha gravada em
  // `platform_credentials` (MEDIDO no banco local) — a regra geral vale de
  // verdade para os quatro, não só para a fal.
  "avatar/heygen": { id: "heygen" },
  "voice/elevenlabs": { id: "elevenlabs" },
  "script/gemini": { id: "google" },

  // Já servida desde 21/08 (`2a04b4a`). Continua aqui — agora como um caso
  // igual aos outros três, não mais o único `plataforma_vence` do mapa.
  "avatar/fal": { id: "fal" },

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
