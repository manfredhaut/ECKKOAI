import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/ui/PageHeader";
import { AvatarSetupStep } from "./steps/AvatarSetupStep";
import { ScriptStep } from "./steps/ScriptStep";
import { ChooseAssetsStep } from "./steps/ChooseAssetsStep";
import { DurationStep } from "./steps/DurationStep";
import { PublishStep } from "./steps/PublishStep";
import { GenerateStep } from "./steps/GenerateStep";
import { DEFAULT_PUBLISH_PLATFORM } from "./publishPlatforms";
import type { AssetDefaults, WizardState } from "./types";

export function CreateVideoPage() {
  const { t } = useTranslation();
  const STEPS = [
    t("createVideo.steps.avatarSetup"),
    t("createVideo.steps.script"),
    t("createVideo.steps.assets"),
    t("createVideo.steps.duration"),
    // "Publicação" vem depois de duração e antes de gerar: é a última decisão
    // que muda o arquivo produzido, e a proporção só faz sentido escolher com
    // o conteúdo já definido.
    t("createVideo.steps.publish"),
    t("createVideo.steps.generate"),
  ];
  const [step, setStep] = useState(0);
  const [defaults, setDefaults] = useState<AssetDefaults>({
    scenario: "",
    outfit: "",
    scenarioPrompt: "",
    outfitPrompt: "",
  });
  const [wizard, setWizard] = useState<WizardState>({
    avatarId: null,
    script: "",
    scenario: "",
    outfit: "",
    scenarioPrompt: "",
    outfitPrompt: "",
    durationSeconds: 30,
    publishPlatform: DEFAULT_PUBLISH_PLATFORM,
  });

  function goNext() {
    if (step === 0) {
      setWizard((w) => ({
        ...w,
        scenario: defaults.scenario,
        outfit: defaults.outfit,
        scenarioPrompt: defaults.scenarioPrompt,
        outfitPrompt: defaults.outfitPrompt,
      }));
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  const canProceed =
    (step === 0 && wizard.avatarId !== null) ||
    (step === 1 && wizard.script.trim().length > 0) ||
    step === 2 ||
    step === 3 ||
    // Publicação sempre tem uma plataforma escolhida (nasce no padrão), então
    // não há como travar aqui.
    step === 4;

  return (
    <>
      <PageHeader title={t("createVideo.title")} subtitle={t("createVideo.subtitle")} />

      <div className="step-indicator">
        {STEPS.map((label, i) => (
          <div key={label} className={`step${i === step ? " active" : i < step ? " done" : ""}`}>
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {step === 0 && (
        <AvatarSetupStep
          selectedAvatarId={wizard.avatarId}
          onSelectAvatar={(id) => setWizard((w) => ({ ...w, avatarId: id }))}
          defaults={defaults}
          onDefaultsChange={setDefaults}
          nextButton={
            <button className="btn btn-primary" onClick={goNext} disabled={!canProceed}>
              {t("common.next")}
            </button>
          }
        />
      )}
      {step === 1 && (
        <ScriptStep script={wizard.script} onChange={(script) => setWizard((w) => ({ ...w, script }))} />
      )}
      {step === 2 && (
        <ChooseAssetsStep
          avatarId={wizard.avatarId}
          onAvatarChange={(avatarId) => setWizard((w) => ({ ...w, avatarId }))}
          scenario={wizard.scenario}
          onScenarioChange={(scenario) => setWizard((w) => ({ ...w, scenario }))}
          outfit={wizard.outfit}
          onOutfitChange={(outfit) => setWizard((w) => ({ ...w, outfit }))}
          scenarioPrompt={wizard.scenarioPrompt}
          onScenarioPromptChange={(scenarioPrompt) => setWizard((w) => ({ ...w, scenarioPrompt }))}
          outfitPrompt={wizard.outfitPrompt}
          onOutfitPromptChange={(outfitPrompt) => setWizard((w) => ({ ...w, outfitPrompt }))}
        />
      )}
      {step === 3 && (
        <DurationStep
          duration={wizard.durationSeconds}
          onChange={(durationSeconds) => setWizard((w) => ({ ...w, durationSeconds }))}
        />
      )}
      {step === 4 && (
        <PublishStep
          platform={wizard.publishPlatform}
          onChange={(publishPlatform) => setWizard((w) => ({ ...w, publishPlatform }))}
        />
      )}
      {step === 5 && <GenerateStep wizard={wizard} />}

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        {step > 0 && (
          <button className="btn btn-outline" onClick={goBack}>
            {t("common.back")}
          </button>
        )}
        {step > 0 && step < STEPS.length - 1 && (
          <button className="btn btn-primary" onClick={goNext} disabled={!canProceed}>
            {t("common.next")}
          </button>
        )}
      </div>
    </>
  );
}
