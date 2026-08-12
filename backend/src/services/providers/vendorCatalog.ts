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

export type ScriptVendor = (typeof VENDORS_BY_PROVIDER)["script"][number];
export type AvatarVendor = (typeof VENDORS_BY_PROVIDER)["avatar"][number];
export type VoiceVendor = (typeof VENDORS_BY_PROVIDER)["voice"][number];

export function isValidVendor(provider: CredentialProvider, vendor: string): boolean {
  return (VENDORS_BY_PROVIDER[provider] as readonly string[]).includes(vendor);
}

export function defaultVendor(provider: CredentialProvider): string {
  return VENDORS_BY_PROVIDER[provider][0];
}
