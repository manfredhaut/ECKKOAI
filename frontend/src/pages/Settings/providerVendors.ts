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
  /**
   * Espelha `VENDORS_WITH_CONNECTION_PROBE` do backend. `false` desabilita o
   * botão "Testar" e mostra o motivo — cortesia de interface, não a proteção:
   * quem recusa de verdade é a rota, que devolve `probe_unavailable` antes de
   * decifrar a chave. Marcar `true` aqui por engano não faz chave nenhuma sair.
   */
  hasConnectionProbe: boolean;
}

export const VENDORS_BY_PROVIDER: Record<CredentialProviderId, VendorOption[]> = {
  script: [
    {
      id: "anthropic",
      labelKey: "settings.vendor.anthropic.label",
      keyLabelKey: "settings.vendor.anthropic.keyLabel",
      keyPlaceholderKey: "settings.vendor.anthropic.keyPlaceholder",
      helpKey: "settings.vendor.anthropic.help",
      hasConnectionProbe: true,
    },
    {
      id: "gemini",
      labelKey: "settings.vendor.gemini.label",
      keyLabelKey: "settings.vendor.gemini.keyLabel",
      keyPlaceholderKey: "settings.vendor.gemini.keyPlaceholder",
      helpKey: "settings.vendor.gemini.help",
      hasConnectionProbe: true,
    },
    {
      id: "openai",
      labelKey: "settings.vendor.openai.label",
      keyLabelKey: "settings.vendor.openai.keyLabel",
      keyPlaceholderKey: "settings.vendor.openai.keyPlaceholder",
      helpKey: "settings.vendor.openai.help",
      hasConnectionProbe: true,
    },
  ],
  avatar: [
    {
      id: "heygen",
      labelKey: "settings.vendor.heygen.label",
      keyLabelKey: "settings.vendor.heygen.keyLabel",
      keyPlaceholderKey: "settings.vendor.heygen.keyPlaceholder",
      helpKey: "settings.vendor.heygen.help",
      hasConnectionProbe: true,
    },
    {
      id: "did",
      labelKey: "settings.vendor.did.label",
      keyLabelKey: "settings.vendor.did.keyLabel",
      keyPlaceholderKey: "settings.vendor.did.keyPlaceholder",
      helpKey: "settings.vendor.did.help",
      hasConnectionProbe: true,
    },
    {
      id: "fal",
      labelKey: "settings.vendor.fal.label",
      keyLabelKey: "settings.vendor.fal.keyLabel",
      keyPlaceholderKey: "settings.vendor.fal.keyPlaceholder",
      helpKey: "settings.vendor.fal.help",
      // SEM SONDA, e por isso o "Testar" fica desabilitado para ela. Escrever
      // uma sonda aqui exigiria escolher um endpoint da fal e mandar a chave
      // para ele; enquanto essa escolha não for feita, recusar é a única forma
      // de o botão não adivinhar um fornecedor.
      hasConnectionProbe: false,
    },
  ],
  voice: [
    {
      id: "elevenlabs",
      labelKey: "settings.vendor.elevenlabs.label",
      keyLabelKey: "settings.vendor.elevenlabs.keyLabel",
      keyPlaceholderKey: "settings.vendor.elevenlabs.keyPlaceholder",
      helpKey: "settings.vendor.elevenlabs.help",
      hasConnectionProbe: true,
    },
  ],
};
