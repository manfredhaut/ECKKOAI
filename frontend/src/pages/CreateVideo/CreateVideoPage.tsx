import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PageHeader } from "../../components/ui/PageHeader";
import { AvatarSetupStep } from "./steps/AvatarSetupStep";
import { ScriptStep } from "./steps/ScriptStep";
import { SceneStep } from "./steps/SceneStep";
import { GenerateStep } from "./steps/GenerateStep";
import { DEFAULT_PUBLISH_PLATFORM } from "./publishPlatforms";
import type { AssetDefaults, WizardState } from "./types";

/**
 * Criar vídeo, em QUATRO passos: Avatar · Roteiro · Cena · Gerar.
 *
 * Eram seis, e dois saíram por motivos diferentes:
 *
 *  · **Recursos** (o antigo passo 3) coletava cenário e traje como imagens que
 *    nunca chegavam ao fornecedor, e trazia um seletor de avatar redundante com
 *    o passo 1. Foi substituído por **Cena**, onde cada controle existe porque
 *    há campo para ele do outro lado.
 *  · **Duração** oferecia 15/30/60 s e não limitava nada — nenhum campo de
 *    duração chega ao fornecedor. A duração continua sendo calculada, agora
 *    como linha informativa dentro de Gerar.
 *
 * **Publicação** saiu do fluxo de criação: ela nunca publicou nada: era um
 * seletor de plataforma que servia para derivar a proporção. A proporção é
 * decisão de cena, e é lá que ela está agora.
 */
export function CreateVideoPage() {
  const { t } = useTranslation();
  const STEPS = [
    t("createVideo.steps.avatarSetup"),
    t("createVideo.steps.script"),
    t("createVideo.steps.scene"),
    t("createVideo.steps.generate"),
  ];
  const [step, setStep] = useState(0);
  /**
   * HERANÇA do passo 1: cenário e traje "padrão" do avatar.
   *
   * Continua aqui porque o passo 1 ainda desenha esse bloco, e continua sendo
   * estado local porque ele NÃO alimenta mais geração nenhuma — o fundo que
   * chega ao fornecedor é o do passo Cena, e traje é look. Enquanto o bloco
   * existir na tela do avatar, ele é o último resto do defeito que este bloco
   * fechou: coleta que não vai a lugar nenhum.
   */
  const [defaults, setDefaults] = useState<AssetDefaults>({
    scenario: "",
    outfit: "",
    scenarioPrompt: "",
    outfitPrompt: "",
  });
  const [wizard, setWizard] = useState<WizardState>({
    avatarId: null,
    script: "",
    estimatedSeconds: null,
    confirmAboveSeconds: null,
    background: null,
    motionPrompt: "",
    expressiveness: null,
    avatarLookId: null,
    publishPlatform: DEFAULT_PUBLISH_PLATFORM,
  });

  function goNext() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  const canProceed =
    (step === 0 && wizard.avatarId !== null) ||
    (step === 1 && wizard.script.trim().length > 0) ||
    // Cena nunca trava: todos os controles dela são opcionais, e nenhum campo
    // vazio vai para o payload.
    step === 2;

  /**
   * O que falta para poder avançar, em uma linha.
   *
   * Um botão cinza sem explicação obriga a adivinhar — e nos dois passos que
   * travam a condição não é óbvia: no 1 dá para ter cinco avatares salvos e
   * nenhum selecionado, e no 2 dá para ter digitado só espaços.
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
        <SceneStep
          avatarId={wizard.avatarId}
          background={wizard.background}
          onBackgroundChange={(background) => setWizard((w) => ({ ...w, background }))}
          motionPrompt={wizard.motionPrompt}
          onMotionPromptChange={(motionPrompt) => setWizard((w) => ({ ...w, motionPrompt }))}
          expressiveness={wizard.expressiveness}
          onExpressivenessChange={(expressiveness) => setWizard((w) => ({ ...w, expressiveness }))}
          avatarLookId={wizard.avatarLookId}
          onAvatarLookChange={(avatarLookId) => setWizard((w) => ({ ...w, avatarLookId }))}
          publishPlatform={wizard.publishPlatform}
          onPublishPlatformChange={(publishPlatform) => setWizard((w) => ({ ...w, publishPlatform }))}
        />
      )}
      {step === 3 && <GenerateStep wizard={wizard} />}

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
