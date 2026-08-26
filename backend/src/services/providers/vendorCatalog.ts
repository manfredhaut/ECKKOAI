import type { CredentialProvider } from "../../types.js";

// Single source of truth for which vendors a tenant can pick per BYOK
// provider category. "stub" means no real integration exists yet — it's
// listed explicitly rather than hidden so the UI stays honest about it.
export const VENDORS_BY_PROVIDER = {
  script: ["anthropic", "gemini", "openai"],
  // "fal" entra para que a chave possa ser GUARDADA por tenant — nada mais.
  // Não há ramo de geração para ela (`generateVideo` continua despachando só
  // heygen/did) e não há sonda de conexão. `heygen` segue PRIMEIRO porque
  // `defaultVendor()` devolve o primeiro da lista, e mover isso trocaria o
  // fornecedor de todo tenant que nunca escolheu um.
  avatar: ["heygen", "did", "fal"],
  voice: ["elevenlabs"],
} as const satisfies Record<CredentialProvider, readonly string[]>;

/**
 * Vendors com SONDA DE CONEXÃO — os únicos que o botão "Testar" pode alcançar.
 *
 * Existe porque `checkAvatarConnection` decide por ternário
 * (`vendor === "did" ? … : heygen`), e um ternário não tem caso "nenhum dos
 * dois": todo vendor novo cai no ramo `else` e vai bater na HeyGen. Com "fal"
 * no catálogo, isso deixaria de ser um teste inútil e passaria a ser um
 * VAZAMENTO — a chave da fal, em claro, enviada para `api.heygen.com` num
 * cabeçalho `x-api-key`.
 *
 * A lista é de quem TEM sonda, não de quem não tem: um vendor novo nasce fora
 * dela e é recusado por omissão. O inverso — enumerar os proibidos — deixaria o
 * próximo vendor vazar por esquecimento, que é exatamente como este chegou aqui.
 */
export const VENDORS_WITH_CONNECTION_PROBE: Readonly<Record<CredentialProvider, readonly string[]>> = {
  script: ["anthropic", "gemini", "openai"],
  avatar: ["heygen", "did"],
  voice: ["elevenlabs"],
};

/** O vendor tem sonda de conexão? Só quem responde `true` pode ser testado. */
export function hasConnectionProbe(provider: CredentialProvider, vendor: string): boolean {
  return VENDORS_WITH_CONNECTION_PROBE[provider].includes(vendor);
}

/**
 * Vendors que TREINAM avatar — os únicos que `trainAvatar()` sabe atender.
 *
 * Existe pelo mesmo motivo de `VENDORS_WITH_CONNECTION_PROBE`: o dispatch de
 * treino também é um ternário (`vendor === "did" ? … : heygen`), e um
 * ternário não tem caso "nenhum dos dois" — todo vendor novo cai no `else` e
 * vai bater na HeyGen. Foi assim que `avatar/fal` (só GUARDA a chave, sem
 * ramo de treino nenhum — ver comentário de `VENDORS_BY_PROVIDER` acima)
 * acabou mandando a chave da fal, em claro, para `api.heygen.com` num
 * cabeçalho `x-api-key` — 401 do fornecedor, dinheiro real em jogo (26/08).
 *
 * Hoje coincide com `VENDORS_WITH_CONNECTION_PROBE.avatar`: os mesmos dois
 * vendors têm implementação de verdade (`trainAvatarHeygen`/`trainAvatarDid`
 * em avatarProvider.ts). É uma lista PRÓPRIA, não um alias, porque as duas
 * capacidades podem divergir no futuro sem motivo nenhum para arrastar uma
 * atrás da outra.
 */
export const VENDORS_WITH_TRAINING_PATH: Readonly<Record<CredentialProvider, readonly string[]>> = {
  script: [],
  avatar: ["heygen", "did"],
  voice: [],
};

/** O vendor treina avatar? Quem responde `false` nunca deve receber uma chamada de treino. */
export function hasTrainingPath(provider: CredentialProvider, vendor: string): boolean {
  return VENDORS_WITH_TRAINING_PATH[provider].includes(vendor);
}

/**
 * Vendors com CAMINHO DE GERAÇÃO PELO PRODUTO — os únicos que `POST /videos`
 * pode aceitar.
 *
 * Mesma forma da lista acima, e pelo mesmo motivo: é a lista de quem TEM, não
 * de quem não tem. Vendor novo nasce FORA dela e é recusado por omissão; a
 * alternativa — enumerar os proibidos — deixa o próximo vazar por esquecimento.
 *
 * ┌─ Por que `fal` está de fora mesmo tendo ramo em `generateVideo` ─────────┐
 * │ O ramo existe (`generateVideoFal`), e ainda assim a rota o recusa. Não é │
 * │ esquecimento: é a decisão do BLOCO B2. A corrida da fal grava em         │
 * │ `fal_pipeline_runs`/`fal_pipeline_steps` e **não cria linha em           │
 * │ `videos`** — porque `recovery.ts:211` encerra como `recovery_orphan`     │
 * │ qualquer vídeo sem `provider_job_id`, em qualquer idade, e a corrida     │
 * │ para deliberadamente em `compor`, sem job id de vídeo nenhum. A rota,    │
 * │ porém, INSERE a linha em `videos` antes de chamar o provider. Deixar     │
 * │ passar aqui produziria exatamente a colisão que a decisão evita.         │
 * │                                                                          │
 * │ Enquanto isso, quem alcança o ramo é a sonda (`probeFalPipeline.ts`),    │
 * │ que não passa por esta rota. Ligar o caminho de produto é o B3 — e ele   │
 * │ começa por decidir onde o débito de crédito acontece.                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export const VENDORS_WITH_GENERATION_PATH: Readonly<Record<CredentialProvider, readonly string[]>> = {
  script: ["anthropic", "gemini", "openai"],
  // `fal` ENTROU no B3. No B2 ela ficava de fora por uma razão precisa: a
  // corrida para em `compor` e não tem job id de VÍDEO, e a varredura de boot
  // encerrava como `recovery_orphan` qualquer vídeo sem `provider_job_id`, em
  // qualquer idade — enquanto a rota INSERE a linha antes de chamar o
  // provider. O B3 fechou os dois lados: a linha vai para `awaiting_approval`
  // com o `request_id` da composição como `provider_job_id`, e o recovery
  // passou a conhecer esse estado. Não há mais órfão a produzir.
  //
  // O que NÃO mudou: a fal continua FORA de `VENDORS_WITH_CONNECTION_PROBE`.
  // Ter caminho de geração e ter sonda são coisas diferentes, e é o ternário
  // do botão "Testar" que mandaria a chave dela para a HeyGen.
  avatar: ["heygen", "did", "fal"],
  voice: ["elevenlabs"],
};

/** O vendor pode gerar pelo produto? Quem responde `false` é recusado na rota. */
export function hasGenerationPath(provider: CredentialProvider, vendor: string): boolean {
  return VENDORS_WITH_GENERATION_PATH[provider].includes(vendor);
}

export type ScriptVendor = (typeof VENDORS_BY_PROVIDER)["script"][number];
export type AvatarVendor = (typeof VENDORS_BY_PROVIDER)["avatar"][number];
export type VoiceVendor = (typeof VENDORS_BY_PROVIDER)["voice"][number];

export function isValidVendor(provider: CredentialProvider, vendor: string): boolean {
  return (VENDORS_BY_PROVIDER[provider] as readonly string[]).includes(vendor);
}

export function defaultVendor(provider: CredentialProvider): string {
  return VENDORS_BY_PROVIDER[provider][0];
}
