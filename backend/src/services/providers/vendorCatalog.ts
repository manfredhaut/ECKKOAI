import type { CredentialProvider } from "../../types.js";

// Single source of truth for which vendors a tenant can pick per BYOK
// provider category. "stub" means no real integration exists yet — it's
// listed explicitly rather than hidden so the UI stays honest about it.
export const VENDORS_BY_PROVIDER = {
  script: ["anthropic", "gemini", "openai"],
  avatar: ["heygen", "did"],
  voice: ["elevenlabs"],
} as const satisfies Record<CredentialProvider, readonly string[]>;

export type ScriptVendor = (typeof VENDORS_BY_PROVIDER)["script"][number];
export type AvatarVendor = (typeof VENDORS_BY_PROVIDER)["avatar"][number];
export type VoiceVendor = (typeof VENDORS_BY_PROVIDER)["voice"][number];

export function isValidVendor(provider: CredentialProvider, vendor: string): boolean {
  return (VENDORS_BY_PROVIDER[provider] as readonly string[]).includes(vendor);
}

export function defaultVendor(provider: CredentialProvider): string {
  return VENDORS_BY_PROVIDER[provider][0];
}
