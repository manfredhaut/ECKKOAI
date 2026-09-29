import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../../api/client";
import type { Video } from "../../types";
import { PageHeader } from "../../components/ui/PageHeader";
import { AvatarSetupStep } from "./steps/AvatarSetupStep";
import { ScriptStep } from "./steps/ScriptStep";
import { SceneStep } from "./steps/SceneStep";
import { GenerateStep } from "./steps/GenerateStep";
import { StudioMovieEditStep } from "./steps/StudioMovieEditStep";
import { DEFAULT_PUBLISH_PLATFORM } from "./publishPlatforms";
import type { WizardState } from "./types";

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
    t("createVideo.steps.studioMovieEdit"),
  ];
  // P2-3 — "Retomar aprovação" (Biblioteca, ContentPage.tsx): o link chega
  // como `create?resume=<id>`. Presente, o wizard nasce DIRETO no passo
  // "4. Gerar" (índice 3) — não faz sentido passar pelos passos 1-3 para
  // retomar um vídeo que já existe. Lido uma vez só (`useState` inicial,
  // não um efeito): trocar de query string depois de montado não deve
  // arrancar a pessoa do passo em que ela está.
  const [searchParams] = useSearchParams();
  const resumeVideoId = searchParams.get("resume") ?? undefined;
  // P2-8 — "Ajustar este vídeo": o link chega como `create?adjustFrom=<id>`.
  // Diferente de `resume`, nasce no Passo 1 (não pula pro fim) — a pessoa
  // pode querer rever/mudar QUALQUER campo, não só aprovar o que já existe.
  const adjustFromVideoId = searchParams.get("adjustFrom") ?? undefined;
  const [step, setStep] = useState(() => (resumeVideoId ? 3 : 0));
  const [wizard, setWizard] = useState<WizardState>({
    avatarId: null,
    script: "",
    estimatedSeconds: null,
    confirmAboveSeconds: null,
    // "mais" — sem alvo escolhido. Ver o comentário do campo em `types.ts`.
    targetDurationSeconds: null,
    background: null,
    // `undefined`-como-null não existe aqui: nasce `null` (sem cenário) e o
    // efeito `handleSceneDefaultsSeed`, abaixo, sobrescreve com o padrão do
    // avatar assim que ele é conhecido — ver o comentário lá para a migração.
    scenario: null,
    scenarioPrompt: null,
    // MESMA regra do cenário acima: nasce `null` e o efeito
    // `handleSceneDefaultsSeed` sobrescreve com o padrão do avatar assim
    // que ele é conhecido.
    outfit: null,
    outfitPrompt: null,
    motionPrompt: "",
    // PRÉ-SELECIONADO, nunca null: sem escolha, o campo some do corpo enviado
    // ao fornecedor e ele aplica "low" em silêncio (doc: "Defaults to 'low'
    // when omitted") — o vídeo saía apático sem a tela ter dito nada. "medium"
    // é o meio-termo; o usuário continua livre para trocar antes de gerar.
    expressiveness: "medium",
    avatarLookId: null,
    // `null` = padrão do servidor (BB2/BB3, SIMPLES-10) — nenhum vídeo
    // existente foi afetado por este campo nascer aqui.
    avatarFit: null,
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

  /**
   * MIGRAÇÃO NÃO DESTRUTIVA de Cenário E Traje — o padrão salvo no avatar
   * (`avatar.scenario`/`scenario_prompt`/`outfit`/`outfit_prompt`) vira o
   * valor INICIAL dos 4 campos por vídeo (`wizard.scenario`/`scenarioPrompt`/
   * `outfit`/`outfitPrompt`) na primeira vez que aquele avatar é selecionado
   * nesta visita — nunca de novo depois disso, mesmo que a pessoa volte ao
   * Passo 1 e avance de novo, para não descartar uma edição já feita na
   * Cena.
   *
   * TRAJE entrou nesta rodada (28/08), seguindo Cenário à risca — mesma
   * função, mesmo `Set`, mesma regra de uma vez só. Antes desta rodada
   * "Traje Padrão" tinha sido mantido no Passo 1 como identidade fixa do
   * avatar — decisão revogada na mesma sessão, pelo mesmo motivo que já
   * havia tirado Cenário de lá.
   *
   * `AvatarSetupStep.tsx` chama isto de DENTRO do mesmo efeito que já lia
   * os 4 campos do avatar selecionado — o dado nunca deixou de estar
   * disponível ali, só o destino mudou.
   *
   * `Set`, não um booleano só: trocar de avatar dentro da mesma visita
   * semeia de novo para o avatar NOVO (correto — é o padrão dele que deve
   * aparecer), e nunca mais para um avatar já visitado nesta sessão.
   */
  const seededSceneDefaultsAvatarIds = useRef<Set<string>>(new Set());
  const handleSceneDefaultsSeed = useCallback(
    (
      avatarId: string,
      scenario: string | null,
      scenarioPrompt: string | null,
      outfit: string | null,
      outfitPrompt: string | null,
    ) => {
      if (seededSceneDefaultsAvatarIds.current.has(avatarId)) return;
      seededSceneDefaultsAvatarIds.current.add(avatarId);
      setWizard((w) => ({
        ...w,
        scenario: scenario || null,
        scenarioPrompt: scenarioPrompt || null,
        outfit: outfit || null,
        outfitPrompt: outfitPrompt || null,
      }));
    },
    [],
  );

  /**
   * P2-8 — "Ajustar este vídeo": popula o wizard INTEIRO a partir do vídeo
   * original (`GET /videos/:id`, já existente — reaproveitado do P2-3).
   *
   * `seededSceneDefaultsAvatarIds.current.add(avatarId)` ANTES de
   * `setWizard`: sem isto, ao selecionar o avatar (já vindo preenchido),
   * `AvatarSetupStep` chamaria `handleSceneDefaultsSeed` normalmente e
   * SOBRESCREVERIA cenário/traje deste vídeo pelo padrão ATUAL do avatar —
   * exatamente o inverso do que "Ajustar" promete (as referências do
   * vídeo original, não o padrão de hoje do avatar).
   *
   * `avatarFit` NÃO persiste no `Video` deste tipo como campo obrigatório
   * (`"cover" | "contain" | null | undefined`) — qualquer outro valor
   * (incluindo ausência, em vídeo anterior à migration 085) cai em `null`,
   * o padrão do servidor, igual a hoje.
   */
  useEffect(() => {
    if (!adjustFromVideoId) return;
    let cancelado = false;
    api.get<Video>(`/videos/${adjustFromVideoId}`).then((v) => {
      if (cancelado) return;
      if (v.avatar_id) seededSceneDefaultsAvatarIds.current.add(v.avatar_id);
      setWizard((w) => ({
        ...w,
        avatarId: v.avatar_id,
        script: v.script,
        targetDurationSeconds: v.target_duration_seconds ?? null,
        background:
          v.background_type === "color" || v.background_type === "image"
            ? { type: v.background_type, value: v.background_value ?? "" }
            : null,
        scenario: v.scenario ?? null,
        scenarioPrompt: v.scenario_prompt ?? null,
        outfit: v.outfit ?? null,
        outfitPrompt: v.outfit_prompt ?? null,
        motionPrompt: v.motion_prompt ?? "",
        expressiveness: v.expressiveness ?? "medium",
        avatarLookId: v.avatar_look_id ?? null,
        avatarFit: v.avatar_fit === "cover" || v.avatar_fit === "contain" ? v.avatar_fit : null,
        publishPlatform: v.publish_platform ?? DEFAULT_PUBLISH_PLATFORM,
        captions: v.captions ?? false,
        tierVideo: v.tier_video ?? "normal",
      }));
    });
    return () => {
      cancelado = true;
    };
  }, [adjustFromVideoId]);

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
    step === 2 ||
    // Gerar também nunca trava — o clique em "Gerar vídeo" é uma ação dentro
    // do próprio passo, independente de avançar para Studio Movie Edit.
    step === 3;

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
          onOutfitPreparingChange={handleOutfitPreparingChange}
          onSceneDefaultsSeed={handleSceneDefaultsSeed}
          adjustFromVideoId={adjustFromVideoId}
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
          avatarId={wizard.avatarId}
          background={wizard.background}
          onBackgroundChange={(background) => setWizard((w) => ({ ...w, background }))}
          scenario={wizard.scenario}
          onScenarioChange={(scenario) => setWizard((w) => ({ ...w, scenario }))}
          scenarioPrompt={wizard.scenarioPrompt}
          onScenarioPromptChange={(scenarioPrompt) => setWizard((w) => ({ ...w, scenarioPrompt }))}
          outfit={wizard.outfit}
          onOutfitChange={(outfit) => setWizard((w) => ({ ...w, outfit }))}
          outfitPrompt={wizard.outfitPrompt}
          onOutfitPromptChange={(outfitPrompt) => setWizard((w) => ({ ...w, outfitPrompt }))}
          motionPrompt={wizard.motionPrompt}
          onMotionPromptChange={(motionPrompt) => setWizard((w) => ({ ...w, motionPrompt }))}
          expressiveness={wizard.expressiveness}
          onExpressivenessChange={(expressiveness) => setWizard((w) => ({ ...w, expressiveness }))}
          avatarLookId={wizard.avatarLookId}
          onAvatarLookChange={(avatarLookId) => setWizard((w) => ({ ...w, avatarLookId }))}
          avatarFit={wizard.avatarFit}
          onAvatarFitChange={(avatarFit) => setWizard((w) => ({ ...w, avatarFit }))}
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
          resumeVideoId={resumeVideoId}
          adjustFromVideoId={adjustFromVideoId}
        />
      )}
      {step === 4 && <StudioMovieEditStep />}

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
