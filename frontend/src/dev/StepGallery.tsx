import { useEffect, useMemo, useState } from "react";
import { AvatarSetupStep } from "../pages/CreateVideo/steps/AvatarSetupStep";
import { ScriptStep } from "../pages/CreateVideo/steps/ScriptStep";
import { SceneStep } from "../pages/CreateVideo/steps/SceneStep";
import { GenerateStep } from "../pages/CreateVideo/steps/GenerateStep";
import { DEFAULT_PUBLISH_PLATFORM } from "../pages/CreateVideo/publishPlatforms";
import { ContentPage } from "../pages/Content/ContentPage";
import { AdminPanelPage } from "../pages/AdminPanel/AdminPanelPage";
import { AdminAuthProvider } from "../adminAuth/AdminAuthContext";
import { AdminCopilotProvider } from "../adminCopilot/AdminCopilotContext";
import { GalleryBoundary } from "./GalleryBoundary";
import { FeatureFlagProvider } from "../features/FeatureFlagContext";
// A galeria fornece os MESMOS provedores de contexto que o app real, e não
// um subconjunto: os passos usam FieldHelpIcon, que depende do copiloto.
// Faltando o provider, a árvore inteira caía — defeito que a própria
// galeria expôs na primeira execução.
import { CopilotProvider } from "../copilot/CopilotContext";
import {
  installGalleryFetch,
  interceptStats,
  setGalleryFlag,
  setGalleryVendorHonorsFormat,
} from "./galleryFetch";
import type { AssetDefaults } from "../pages/CreateVideo/types";

/**
 * Galeria de passos: os componentes REAIS do fluxo de Criar vídeo, com
 * estado injetado, para poder olhá-los sem percorrer o wizard inteiro e
 * sem gastar cota de fornecedor.
 *
 * A regra que define o valor disto: **nenhuma cópia**. Os passos abaixo são
 * importados de `pages/CreateVideo/steps`, não reimplementados. Uma galeria
 * feita de cópias envelhece sozinha e passa a mostrar uma tela que não
 * existe mais — pior que não ter galeria, porque dá confiança falsa.
 *
 * A galeria é INERTE: `installGalleryFetch()` substitui `window.fetch` por
 * um interceptor que responde com dado falso e bloqueia tudo que não
 * conhece. Nada sai para a rede, nada é gravado no banco, nenhum crédito é
 * debitado. Os contadores ficam visíveis no topo da tela, para a afirmação
 * ser verificável em vez de prometida.
 */

type StepState = "vazio" | "preenchido" | "carregando" | "erro";

const STATES: StepState[] = ["vazio", "preenchido", "carregando", "erro"];

const STEPS = [
  { id: "passo1-avatar", label: "1 · Avatar" },
  { id: "passo2-roteiro", label: "2 · Roteiro" },
  { id: "passo3-cena", label: "3 · Cena" },
  { id: "passo4-gerar", label: "4 · Gerar" },
  // Telas fora do wizard, pedidas junto: a de Conteúdo (onde o selo
  // SIMULADO aparece por linha) e o Painel admin (onde consumo real e
  // simulado ficam separados, e as flags são alternadas).
  { id: "tela-conteudo", label: "Conteúdo" },
  { id: "tela-painel-admin", label: "Painel admin" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

export function StepGallery() {
  const [step, setStep] = useState<StepId>("passo1-avatar");
  const [state, setState] = useState<StepState>("vazio");
  const [backgroundFlag, setBackgroundFlag] = useState(false);
  // Provedor que NÃO honra proporção (D-ID). É o estado que só se verifica
  // olhando: uma tela desabilitada com o motivo escrito.
  const [vendorHonors, setVendorHonors] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    installGalleryFetch();
    setReady(true);
  }, []);

  // Trocar a flag remonta o provider (via `key`), que refaz o GET
  // /feature-flags contra o interceptor — é assim que o mesmo componente
  // aparece nos dois estados sem rebuild.
  useEffect(() => {
    setGalleryFlag("removable_background", backgroundFlag);
  }, [backgroundFlag]);

  useEffect(() => {
    setGalleryVendorHonorsFormat(vendorHonors);
  }, [vendorHonors]);

  if (!ready) return null;

  return (
    <div className="gallery-root">
      <GalleryHeader
        step={step}
        onStep={setStep}
        state={state}
        onState={setState}
        backgroundFlag={backgroundFlag}
        onBackgroundFlag={setBackgroundFlag}
        vendorHonors={vendorHonors}
        onVendorHonors={setVendorHonors}
      />

      <div className="gallery-stage" data-shot={`${step}-${state}`}>
        <FeatureFlagProvider key={`flags-${backgroundFlag}`}>
          <CopilotProvider>
            {/* Isola o painel: um passo quebrado não pode levar a galeria
                inteira junto — já aconteceu, e o sintoma (todas as telas em
                branco) é mais enganoso que o defeito original. */}
            <GalleryBoundary label={`${step} / ${state}`}>
              <StepUnderGlass step={step} state={state} vendorHonors={vendorHonors} />
            </GalleryBoundary>
          </CopilotProvider>
        </FeatureFlagProvider>
      </div>
    </div>
  );
}

function GalleryHeader({
  step,
  onStep,
  state,
  onState,
  backgroundFlag,
  onBackgroundFlag,
  vendorHonors,
  onVendorHonors,
}: {
  step: StepId;
  onStep: (s: StepId) => void;
  state: StepState;
  onState: (s: StepState) => void;
  backgroundFlag: boolean;
  onBackgroundFlag: (v: boolean) => void;
  vendorHonors: boolean;
  onVendorHonors: (v: boolean) => void;
}) {
  return (
    <header className="gallery-bar">
      <div className="gallery-mark">GALERIA DE DESENVOLVIMENTO</div>
      <p className="gallery-sub">
        Componentes reais do fluxo, com estado injetado. Esta tela não executa nada: nenhuma chamada
        a fornecedor, nenhuma escrita no banco, nenhum débito de crédito.
      </p>

      <div className="gallery-controls">
        <div className="gallery-group">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`gallery-chip${step === s.id ? " gallery-chip--on" : ""}`}
              onClick={() => onStep(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="gallery-group">
          {STATES.map((s) => (
            <button
              key={s}
              type="button"
              className={`gallery-chip${state === s ? " gallery-chip--on" : ""}`}
              onClick={() => onState(s)}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="gallery-group">
          <button
            type="button"
            className={`gallery-chip${backgroundFlag ? " gallery-chip--on" : ""}`}
            onClick={() => onBackgroundFlag(!backgroundFlag)}
          >
            flag fundo: {backgroundFlag ? "ligada" : "desligada"}
          </button>
          <button
            type="button"
            className={`gallery-chip${vendorHonors ? " gallery-chip--on" : ""}`}
            onClick={() => onVendorHonors(!vendorHonors)}
          >
            provedor honra proporção: {vendorHonors ? "sim" : "não"}
          </button>
        </div>
      </div>

      <GalleryStats />
    </header>
  );
}

/** Prova, na própria tela, que a galeria não fala com ninguém. */
function GalleryStats() {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 700);
    return () => window.clearInterval(id);
  }, []);

  return (
    <p className="gallery-stats">
      requisições atendidas com dado falso: <strong>{interceptStats.served}</strong> · bloqueadas:{" "}
      <strong>{interceptStats.blocked}</strong> · que saíram para a rede:{" "}
      <strong>{interceptStats.escaped}</strong>
    </p>
  );
}

const EMPTY_DEFAULTS: AssetDefaults = {
  scenario: "",
  scenarioName: "",
  outfit: "",
  scenarioPrompt: "",
  outfitPrompt: "",
};

const FILLED_DEFAULTS: AssetDefaults = {
  scenario: "/uploads/exemplo/cenario.jpg",
  // O nome ORIGINAL, e não o do armazenamento: o `scenario` acima é
  // `<uuid>.<ext>` na vida real, e é justamente por isso que o nome precisa ser
  // guardado à parte.
  scenarioName: "cenario-estudio.jpg",
  outfit: "/uploads/exemplo/traje.jpg",
  scenarioPrompt: "estúdio claro, fundo neutro, luz suave",
  outfitPrompt: "blazer azul-marinho sobre camisa branca",
};

const SAMPLE_SCRIPT =
  "Se você tem uma pequena empresa e nunca gravou um vídeo por falta de tempo, " +
  "este é o atalho: escolha seu avatar, escreva o roteiro e publique em minutos.";

function StepUnderGlass({
  step,
  state,
  vendorHonors,
}: {
  step: StepId;
  state: StepState;
  // Só serve de `key`: trocar o valor remonta o passo de Publicação, que é o
  // que faz o componente refazer o GET /video-format-support contra o
  // interceptor. Sem remontar, o `useEffect` não roda de novo e a tela
  // continuaria mostrando o estado anterior.
  vendorHonors: boolean;
}) {
  const noop = () => {};

  // O passo 5 monta um componente que dispara geração ao clicar; aqui ele é
  // renderizado apenas, nunca acionado — e mesmo se fosse, o interceptor
  // bloquearia a chamada.
  const wizard = useMemo(
    () => ({
      avatarId: state === "vazio" ? null : "gallery-avatar-1",
      script: state === "vazio" ? "" : SAMPLE_SCRIPT,
      scenario: state === "vazio" ? "" : FILLED_DEFAULTS.scenario,
      outfit: state === "vazio" ? "" : FILLED_DEFAULTS.outfit,
      scenarioPrompt: state === "vazio" ? "" : FILLED_DEFAULTS.scenarioPrompt,
      outfitPrompt: state === "vazio" ? "" : FILLED_DEFAULTS.outfitPrompt,
      estimatedSeconds: null,
      confirmAboveSeconds: null,
      // CENA preenchida no estado "preenchido": a galeria existe para mostrar
      // o que a tela faz, e um passo Cena vazio esconderia justamente os
      // controles que o DEMO-2 acrescentou.
      background: state === "vazio" ? null : ({ type: "color", value: "#1B2A4A" } as const),
      motionPrompt: state === "vazio" ? "" : "mãos abertas na altura do peito, gesto calmo",
      expressiveness: state === "vazio" ? null : ("medium" as const),
      avatarLookId: null,
      // O estado "vazio" recebe o padrão, e não string vazia: a plataforma
      // nasce escolhida no wizard real, e uma galeria que mostrasse o passo
      // sem seleção retrataria um estado que o produto não produz.
      publishPlatform: DEFAULT_PUBLISH_PLATFORM,
      // Sem legenda, que é o padrão do wizard real. A galeria retrata o estado
      // que o produto produz, e não um que só existe aqui.
      captions: false,
      // "normal", mesmo padrão do wizard real — BLOCO A.
      tierVideo: "normal" as const,
      // "mais" (sem alvo) no estado "vazio"; 30 s no "preenchido", para a
      // galeria também mostrar o teto de caracteres em ação.
      targetDurationSeconds: state === "vazio" ? null : 30,
    }),
    [state],
  );

  switch (step) {
    case "passo1-avatar":
      return (
        <AvatarSetupStep
          selectedAvatarId={state === "vazio" ? null : "gallery-avatar-1"}
          onSelectAvatar={noop}
          defaults={state === "vazio" ? EMPTY_DEFAULTS : FILLED_DEFAULTS}
          onDefaultsChange={noop}
        />
      );
    case "passo2-roteiro":
      return (
        <ScriptStep
          script={state === "vazio" ? "" : SAMPLE_SCRIPT}
          onChange={noop}
          targetDurationSeconds={wizard.targetDurationSeconds}
          onTargetDurationChange={noop}
          tierVideo={wizard.tierVideo}
        />
      );
    case "passo3-cena":
      // O passo que substituiu Recursos, Duração e Publicação. `key` no
      // suporte de formato porque o seletor embutido consulta o vendor.
      return (
        <SceneStep
          key={`scene-${vendorHonors}`}
          motionPrompt={wizard.motionPrompt}
          onMotionPromptChange={noop}
          expressiveness={wizard.expressiveness}
          onExpressivenessChange={noop}
          publishPlatform={state === "vazio" ? DEFAULT_PUBLISH_PLATFORM : "reels_tiktok"}
          onPublishPlatformChange={noop}
          tierVideo={wizard.tierVideo}
          onTierVideoChange={noop}
        />
      );
    case "passo4-gerar":
      return <GenerateStep wizard={wizard} onCaptionsChange={noop} />;
    case "tela-conteudo":
      return <ContentPage />;
    case "tela-painel-admin":
      // O painel real, com sua própria identidade de admin — servida pelo
      // interceptor, não pelo servidor.
      return (
        <AdminAuthProvider>
          <AdminCopilotProvider>
            <AdminPanelPage />
          </AdminCopilotProvider>
        </AdminAuthProvider>
      );
  }
}
