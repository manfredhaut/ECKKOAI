import { useCallback, useState } from "react";
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
 *    duração chega ao fornecedor. A duração continua sendo calculada, e
 *    aparece como linha informativa dentro de Gerar.
 *
 * Uma DURAÇÃO-ALVO voltou depois, dentro de **Roteiro** — mas é outra coisa:
 * não é enviada ao fornecedor (nenhum motor tem campo para isso), e sim o
 * teto de RECUSA do roteiro escrito ali. Ver `ScriptStep.tsx`.
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
   * ⚠️ **Deixou de ser coleta órfã no BLOCO B2.** Até então este estado não
   * alimentava geração nenhuma: os arquivos subiam, a tela escrevia "Imagem
   * salva", e `corpoDaGeracao` não os mandava — morriam aqui, a um passo do
   * servidor. Agora eles descem para o passo 4 (`defaults={defaults}`) e saem
   * no corpo de `POST /videos`.
   *
   * O que eles alimentam é a COMPOSIÇÃO da fal, que junta rosto, traje e
   * cenário numa imagem-base. No caminho HeyGen eles continuam sem destino, e
   * isso não é descuido: aquele contrato não tem campo para cenário nem para
   * traje — traje lá é look, e fundo é o do passo Cena.
   */
  const [defaults, setDefaults] = useState<AssetDefaults>({
    scenario: "",
    scenarioName: "",
    outfit: "",
    scenarioPrompt: "",
    outfitPrompt: "",
  });
  const [wizard, setWizard] = useState<WizardState>({
    avatarId: null,
    script: "",
    estimatedSeconds: null,
    confirmAboveSeconds: null,
    // "mais" — sem alvo escolhido. Ver o comentário do campo em `types.ts`.
    targetDurationSeconds: null,
    background: null,
    motionPrompt: "",
    // PRÉ-SELECIONADO, nunca null: sem escolha, o campo some do corpo enviado
    // ao fornecedor e ele aplica "low" em silêncio (doc: "Defaults to 'low'
    // when omitted") — o vídeo saía apático sem a tela ter dito nada. "medium"
    // é o meio-termo; o usuário continua livre para trocar antes de gerar.
    expressiveness: "medium",
    avatarLookId: null,
    publishPlatform: DEFAULT_PUBLISH_PLATFORM,
    // SEM legenda por padrão. A escolha contrária muda o corpo enviado ao
    // fornecedor de um jeito que nenhuma geração deste projeto exercitou.
    captions: false,
    // "normal" é o único tier do caminho da fal com motor funcionando desde
    // antes do BLOCO A — mesmo comportamento de toda geração anterior a ele.
    tierVideo: "normal",
  });

  /**
   * Há traje sendo preparado no avatar do passo 1?
   *
   * Sobe do `AvatarSetupStep` porque o `Avançar` é montado aqui e o estado do
   * traje mora lá. `useCallback` para o efeito que avisa não disparar a cada
   * render do pai.
   */
  const [outfitPreparing, setOutfitPreparing] = useState(false);
  const handleOutfitPreparingChange = useCallback((p: boolean) => setOutfitPreparing(p), []);

  function goNext() {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  const canProceed =
    // O traje em preparo trava o passo 1, e é a única trava que não é sobre
    // preenchimento: ele JÁ FOI COBRADO (60 un, US$ 1,00 medidos) e ainda não
    // está no seletor da Cena. Avançar agora leva direto a gerar um vídeo sem
    // ele — dois prejuízos no mesmo clique, o traje que não chegou e a geração
    // que vai ter de ser refeita.
    (step === 0 && wizard.avatarId !== null && !outfitPreparing) ||
    (step === 1 && wizard.script.trim().length > 0) ||
    // Cena nunca trava: todos os controles dela são opcionais, e nenhum campo
    // vazio vai para o payload.
    step === 2;

  /**
   * O que falta para poder avançar, em uma linha.
   *
   * Um botão cinza sem explicação obriga a adivinhar — e nos dois passos que
   * travam a condição não é óbvia: no 1 dá para ter cinco avatares salvos e
   * nenhum selecionado, e no 2 dá para ter digitado só espaços. No caso do
   * traje é pior: o botão apagaria por causa de algo que está acontecendo em
   * outro bloco da mesma tela, e sem a frase a pessoa concluiria que travou.
   */
  const blockedReason = canProceed
    ? null
    : step === 0
      ? outfitPreparing
        ? t("createVideo.blocked.outfitPreparing")
        : t("createVideo.blocked.selectAvatar")
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
          onOutfitPreparingChange={handleOutfitPreparingChange}
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
        <ScriptStep
          script={wizard.script}
          onChange={(script) => setWizard((w) => ({ ...w, script }))}
          targetDurationSeconds={wizard.targetDurationSeconds}
          onTargetDurationChange={(targetDurationSeconds) =>
            setWizard((w) => ({ ...w, targetDurationSeconds }))
          }
          tierVideo={wizard.tierVideo}
        />
      )}
      {step === 2 && (
        <SceneStep
          motionPrompt={wizard.motionPrompt}
          onMotionPromptChange={(motionPrompt) => setWizard((w) => ({ ...w, motionPrompt }))}
          expressiveness={wizard.expressiveness}
          onExpressivenessChange={(expressiveness) => setWizard((w) => ({ ...w, expressiveness }))}
          publishPlatform={wizard.publishPlatform}
          onPublishPlatformChange={(publishPlatform) => setWizard((w) => ({ ...w, publishPlatform }))}
          tierVideo={wizard.tierVideo}
          onTierVideoChange={(tierVideo) => setWizard((w) => ({ ...w, tierVideo }))}
          targetDurationSeconds={wizard.targetDurationSeconds}
        />
      )}
      {step === 3 && (
        <GenerateStep
          wizard={wizard}
          onCaptionsChange={(captions) => setWizard((w) => ({ ...w, captions }))}
          // O passo 1 coleta cenário e traje; é aqui que eles atravessam até o
          // corpo de `POST /videos`. Antes desta linha o bloco do passo 1 era o
          // último resto de coleta que não ia a lugar nenhum.
          defaults={defaults}
        />
      )}

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
