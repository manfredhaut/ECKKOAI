export interface AssetDefaults {
  scenario: string;
  outfit: string;
  scenarioPrompt: string;
  outfitPrompt: string;
}

export interface WizardState {
  avatarId: string | null;
  script: string;
  scenario: string;
  outfit: string;
  scenarioPrompt: string;
  outfitPrompt: string;
  /**
   * O QUE O SERVIDOR ESTIMOU a partir do roteiro, e não uma escolha da tela.
   *
   * Era `15 | 30 | 60`, um chip do passo 4 que nunca chegou ao fornecedor. Fica
   * aqui só para o passo 6 saber se precisa pedir confirmação; o número que
   * vale é sempre o que o servidor derivar do roteiro na hora de gerar.
   * `null` enquanto a estimativa não voltou.
   */
  estimatedSeconds: number | null;
  /** Teto declarado pelo servidor, acima do qual o passo 6 confirma. */
  confirmAboveSeconds: number | null;
  /**
   * Plataforma de publicação. É dela que sai a proporção enviada ao
   * fornecedor — ver `publishPlatforms.ts` e o catálogo do backend.
   */
  publishPlatform: string;
}
