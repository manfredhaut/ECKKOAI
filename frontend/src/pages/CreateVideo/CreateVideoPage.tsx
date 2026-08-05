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
    estimatedSeconds: null,
    confirmAboveSeconds: null,
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

  /**
   * O que falta para poder avançar, em uma linha.
   *
   * Um botão cinza sem explicação obriga a adivinhar — e nos dois passos que
   * travam a condição não é óbvia: no 1 dá para ter cinco avatares salvos e
   * nenhum selecionado, e no 2 dá para ter digitado só espaços. `null` nos
   * passos que nunca travam, para não inventar aviso onde não há bloqueio.
   */
  const blockedReason = canProceed
    ? null
    : step === 0
      ? t("createVideo.blocked.selectAvatar")
      : step === 1
        ? t("createVideo.blocked.writeScript")
        : null;

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
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary" onClick={goNext} disabled={!canProceed}>
                {t("common.next")}
              </button>
              {blockedReason && (
                <span className="text-muted" style={{ fontSize: 13 }}>
                  {blockedReason}
                </span>
              )}
            </div>
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
          script={wizard.script}
          onEstimate={({ estimatedSeconds, confirmAboveSeconds }) =>
            setWizard((w) =>
              // Só grava se mudou: `onEstimate` dispara a cada resposta da rota
              // e um `setWizard` incondicional aqui re-renderiza o passo em laço.
              w.estimatedSeconds === estimatedSeconds && w.confirmAboveSeconds === confirmAboveSeconds
                ? w
                : { ...w, estimatedSeconds, confirmAboveSeconds },
            )
          }
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
        {blockedReason && step > 0 && (
          <span className="text-muted" style={{ fontSize: 13, alignSelf: "center" }}>
            {blockedReason}
          </span>
        )}
      </div>
    </>
  );
}
