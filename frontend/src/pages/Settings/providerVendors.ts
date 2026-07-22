import type { CredentialProviderId } from "../../types";

// Mirrors backend/src/services/providers/vendorCatalog.ts. "stub" means no
// real integration exists yet for that provider category — it's still
// listed (as the only option) rather than hidden, so the dropdown honestly
// reflects what the backend can actually do.
export interface VendorOption {
  id: string;
  labelKey: string;
  keyLabelKey: string;
  keyPlaceholderKey: string;
  helpKey: string;
}

export const VENDORS_BY_PROVIDER: Record<CredentialProviderId, VendorOption[]> = {
  script: [
    {
      id: "anthropic",
      labelKey: "settings.vendor.anthropic.label",
      keyLabelKey: "settings.vendor.anthropic.keyLabel",
      keyPlaceholderKey: "settings.vendor.anthropic.keyPlaceholder",
      helpKey: "settings.vendor.anthropic.help",
    },
    {
      id: "gemini",
      labelKey: "settings.vendor.gemini.label",
      keyLabelKey: "settings.vendor.gemini.keyLabel",
      keyPlaceholderKey: "settings.vendor.gemini.keyPlaceholder",
      helpKey: "settings.vendor.gemini.help",
    },
    {
      id: "openai",
      labelKey: "settings.vendor.openai.label",
      keyLabelKey: "settings.vendor.openai.keyLabel",
      keyPlaceholderKey: "settings.vendor.openai.keyPlaceholder",
      helpKey: "settings.vendor.openai.help",
    },
  ],
  avatar: [
    {
      id: "heygen",
      labelKey: "settings.vendor.heygen.label",
      keyLabelKey: "settings.vendor.heygen.keyLabel",
      keyPlaceholderKey: "settings.vendor.heygen.keyPlaceholder",
      helpKey: "settings.vendor.heygen.help",
    },
    {
      id: "did",
      labelKey: "settings.vendor.did.label",
      keyLabelKey: "settings.vendor.did.keyLabel",
      keyPlaceholderKey: "settings.vendor.did.keyPlaceholder",
      helpKey: "settings.vendor.did.help",
    },
  ],
  voice: [
    {
      id: "elevenlabs",
      labelKey: "settings.vendor.elevenlabs.label",
      keyLabelKey: "settings.vendor.elevenlabs.keyLabel",
      keyPlaceholderKey: "settings.vendor.elevenlabs.keyPlaceholder",
      helpKey: "settings.vendor.elevenlabs.help",
    },
  ],
};
