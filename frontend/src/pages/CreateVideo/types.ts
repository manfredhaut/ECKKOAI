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
  durationSeconds: 15 | 30 | 60;
}
