/**
 * QUATRO PENDÊNCIAS DA ABA 1 FECHADAS — 27/08 (rodada EXECUÇÃO, depois do
 * DESENHO "fundo e traje nativos HeyGen").
 *
 * ┌─ O que cada passo fecha ───────────────────────────────────────────────────┐
 * │ 1. Custo do "Retreinar avatar" visível ANTES do clique — rótulo estático,  │
 * │    mesmo texto do `window.confirm()` que já existia.                       │
 * │ 2. `avatarPreview` (imagem/voz do "Ver avatar") deixava de recarregar      │
 * │    quando o treino terminava — dependia só de `selectedAvatarId`, que não  │
 * │    muda nessa transição. GAP achado em desenho anterior.                   │
 * │ 3. "Fundo" nativo HeyGen (`wizard.background`) — controle de UI removido   │
 * │    em 25/08 (commit 8efc570), backend sempre esteve correto               │
 * │    (`buildHeygenVideoPayload`, confirmado em desenho anterior).            │
 * │ 4. "Traje" (Look) HeyGen — seletor do existente E botão de criar, os dois  │
 * │    removidos na mesma leva (25/08). Reuso de look já pago é grátis         │
 * │    (confirmado por leitura de `lookSelection.ts`/`looks.ts`); criar um     │
 * │    novo cobra ~US$ 1,00, e o aviso do custo é visível ANTES do clique —    │
 * │    sem `window.confirm()`, o botão já nasce com o preço ao lado.           │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A CLASSE DE DEFEITO que estas guardas existem para pegar ───────────────┐
 * │ Os controles de Fundo/Traje (3 e 4) escrevem em `wizard.background` /     │
 * │ `wizard.avatarLookId` via um callback que `CreateVideoPage.tsx` passa     │
 * │ para baixo. Um mutante que troca esse callback por um no-op deixa a TELA  │
 * │ INTEIRA funcionando normalmente — o controle aparece, responde ao clique, │
 * │ nada quebra visivelmente — e o campo escolhido simplesmente NUNCA sai do  │
 * │ estado do wizard, então nunca chega a `corpoDaGeracao()`. É exatamente a  │
 * │ classe de defeito que motivou a investigação inteira desta linha de       │
 * │ trabalho (campo preenchido na tela, descartado em silêncio).              │
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const PASSO1 = "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx";
const WIZARD_PAGE = "frontend/src/pages/CreateVideo/CreateVideoPage.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "passo 1: custo de Retreinar avatar tem rótulo estático, visível antes do clique — não só no confirm()",
    name: "o rótulo estático de custo do retreino é removido, só o confirm() sobra",
    kind: "obvio",
    file: PASSO1,
    find:
      "                {/* MESMO TEXTO do window.confirm() acima, agora também como\n" +
      "                    rótulo estático — visível ANTES do clique, não só depois\n" +
      "                    dele. O confirm() continua existindo (defesa em\n" +
      "                    profundidade contra clique acidental); o rótulo é o que\n" +
      "                    garante que o custo já era conhecido antes de clicar. */}\n" +
      "                <p className=\"text-muted\" style={{ fontSize: 12, marginTop: 6, marginBottom: 0 }}>\n" +
      "                  {t(\"createVideo.avatarSetup.retrainConfirm\")}\n" +
      "                </p>\n",
    replace: "",
    expect: "avatar-tab-restore: o custo do retreino não tem mais rótulo estático",
  },
  {
    guard: "passo 2: a prévia do avatar (Ver avatar) recarrega sozinha quando o treino termina, sem reselecionar ou recarregar",
    name: "o efeito de avatarPreview volta a depender só de selectedAvatarId",
    kind: "esperto",
    // ESPERTO: a tela continua compilando, o "Ver avatar" continua aparecendo
    // quando o treino termina (isso é outro estado, `needsTrainingCapture`,
    // que não muda). O que quebra é silencioso: os TRÊS campos de dentro
    // (imagem, voz, e o vídeo que um dia existir) ficam vazios até
    // reselecionar o avatar ou recarregar — o GAP que esta guarda existe
    // para nunca deixar voltar despercebido.
    file: PASSO1,
    find: "  }, [selectedAvatarId, selectedAvatar?.provider_status, selectedAvatar?.provider_avatar_id]);",
    replace: "  }, [selectedAvatarId]);",
    expect: "avatar-tab-restore: o efeito de avatarPreview não depende mais de provider_status/provider_avatar_id",
  },
  {
    guard: "passo 3: o controle de Fundo (SceneStep) escreve de verdade em wizard.background",
    name: "onBackgroundChange vira no-op — o controle aparece mas não escreve nada",
    kind: "esperto",
    // ESPERTO: SceneStep continua recebendo `background`/`onBackgroundChange`
    // como props, o controle de Fundo continua sendo renderizado e clicável
    // — nada quebra visivelmente na tela da Cena. O que some é o EFEITO do
    // clique: `wizard.background` nunca muda, `corpoDaGeracao()` nunca envia
    // fundo nenhum, e o vídeo sai com o fundo da foto original — exatamente
    // o defeito que motivou reconectar este controle.
    file: WIZARD_PAGE,
    find: "          onBackgroundChange={(background) => setWizard((w) => ({ ...w, background }))}",
    replace: "          onBackgroundChange={() => {}}",
    expect: "avatar-tab-restore: `onBackgroundChange` não escreve mais em `wizard.background`",
  },
  {
    guard: "passo 4b: o seletor de Traje existente (SceneStep) escreve de verdade em wizard.avatarLookId",
    name: "onAvatarLookChange vira no-op — o seletor aparece mas não escreve nada",
    kind: "esperto",
    // ESPERTO: mesmo raciocínio do Fundo — o dropdown de Traje continua
    // aparecendo e respondendo ao clique, mas `wizard.avatarLookId` nunca
    // muda. `providerAvatarIdParaGeracao` (backend) cai sempre no avatar
    // base, e um traje JÁ PAGO fica escolhível na tela sem nunca ser
    // possível usá-lo numa geração.
    file: WIZARD_PAGE,
    find: "          onAvatarLookChange={(avatarLookId) => setWizard((w) => ({ ...w, avatarLookId }))}",
    replace: "          onAvatarLookChange={() => {}}",
    expect: "avatar-tab-restore: `onAvatarLookChange` não escreve mais em `wizard.avatarLookId`",
  },
  {
    guard: "passo 4a: o botão \"Criar traje\" (Passo 1) continua ligado a handleCreateLook",
    name: "o botão Criar traje perde o onClick — fica visível mas morto",
    kind: "esperto",
    // ESPERTO: o card "Adicionar traje" inteiro continua renderizando —
    // título, campos, aviso de custo — só o clique no botão para de fazer
    // qualquer coisa. Indistinguível de "funciona" até a pessoa notar que
    // nada acontece depois de preencher o formulário e clicar.
    file: PASSO1,
    find: "                onClick={handleCreateLook}",
    replace: "                onClick={() => {}}",
    expect: "avatar-tab-restore: o botão \"Criar traje\" perdeu `onClick={handleCreateLook}`",
  },
  {
    guard: "passo 4a: o botão \"Remover\" da imagem do traje novo (ADICIONAR TRAJE) limpa a imagem escolhida",
    name: "o botão Remover da imagem do traje novo perde o onClick",
    kind: "esperto",
    // ESPERTO: o botão continua na tela, ao lado de "Imagem salva" — só o
    // clique para de limpar `lookImageUrl`/`lookImageName`. Indistinguível de
    // funcionar até a pessoa tentar trocar a imagem escolhida por engano.
    // Adicionado em 28/08 — o botão não existia antes desta rodada.
    file: PASSO1,
    find: "                    onClick={handleRemoveLookImage}",
    replace: "                    onClick={() => {}}",
    expect: 'avatar-tab-restore: o botão "Remover" da imagem do traje novo perdeu `onClick={handleRemoveLookImage}`',
  },
];

export interface AvatarTabRestoreCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(repoRoot: string, relativo: string): string {
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export function checkAvatarTabRestorePolicy(repoRoot: string): AvatarTabRestoreCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const passo1 = lerDaRaiz(repoRoot, PASSO1);
  const wizardPage = lerDaRaiz(repoRoot, WIZARD_PAGE);

  // ---------------------------------------------------------------------------
  // G-1 — custo do retreino visível ANTES do clique (rótulo estático).
  // ---------------------------------------------------------------------------
  const ocorrenciasRetrainConfirm = passo1.split('t("createVideo.avatarSetup.retrainConfirm")').length - 1;
  if (ocorrenciasRetrainConfirm < 2) {
    failures.push(
      "avatar-tab-restore: o custo do retreino não tem mais rótulo estático — " +
        `\`t("createVideo.avatarSetup.retrainConfirm")\` aparece ${ocorrenciasRetrainConfirm}x em ${PASSO1} ` +
        "(esperado 2: o confirm() e o rótulo). Sem o rótulo, o custo só aparece DEPOIS do clique.",
    );
  } else {
    notes.push("    avatar-tab-restore: custo do retreino visível antes do clique (rótulo estático + confirm())");
  }

  // ---------------------------------------------------------------------------
  // G-2 — avatarPreview recarrega quando o treino termina.
  // ---------------------------------------------------------------------------
  if (!passo1.includes("}, [selectedAvatarId, selectedAvatar?.provider_status, selectedAvatar?.provider_avatar_id]);")) {
    failures.push(
      "avatar-tab-restore: o efeito de avatarPreview não depende mais de provider_status/provider_avatar_id em " +
        `${PASSO1} — a imagem/voz do "Ver avatar" volta a ficar vazia até reselecionar o avatar ou recarregar ` +
        "a página, mesmo com o treino já terminado.",
    );
  } else {
    notes.push("    avatar-tab-restore: avatarPreview recarrega sozinho quando o treino termina");
  }

  // ---------------------------------------------------------------------------
  // G-3 — Fundo escreve em wizard.background.
  // ---------------------------------------------------------------------------
  if (!wizardPage.includes("onBackgroundChange={(background) => setWizard((w) => ({ ...w, background }))}")) {
    failures.push(
      `avatar-tab-restore: \`onBackgroundChange\` não escreve mais em \`wizard.background\` em ${WIZARD_PAGE} — ` +
        "o controle de Fundo continua na tela, mas a escolha nunca chega a corpoDaGeracao() nem ao fornecedor.",
    );
  } else {
    notes.push("    avatar-tab-restore: o controle de Fundo escreve de verdade em wizard.background");
  }

  // ---------------------------------------------------------------------------
  // G-4 — Traje (seletor existente) escreve em wizard.avatarLookId.
  // ---------------------------------------------------------------------------
  if (!wizardPage.includes("onAvatarLookChange={(avatarLookId) => setWizard((w) => ({ ...w, avatarLookId }))}")) {
    failures.push(
      `avatar-tab-restore: \`onAvatarLookChange\` não escreve mais em \`wizard.avatarLookId\` em ${WIZARD_PAGE} — ` +
        "o seletor de Traje continua na tela, mas a escolha nunca chega ao vídeo gerado.",
    );
  } else {
    notes.push("    avatar-tab-restore: o seletor de Traje existente escreve de verdade em wizard.avatarLookId");
  }

  // ---------------------------------------------------------------------------
  // G-5 — botão "Criar traje" continua ligado a handleCreateLook.
  // ---------------------------------------------------------------------------
  if (!passo1.includes("onClick={handleCreateLook}")) {
    failures.push(
      `avatar-tab-restore: o botão "Criar traje" perdeu \`onClick={handleCreateLook}\` em ${PASSO1} — ` +
        "o card continua visível, com o aviso de custo e tudo, mas o clique não faz mais nada.",
    );
  } else {
    notes.push('    avatar-tab-restore: o botão "Criar traje" continua ligado a handleCreateLook');
  }

  // ---------------------------------------------------------------------------
  // G-6 — botão "Remover" da imagem do traje novo continua ligado a
  // handleRemoveLookImage — 28/08.
  // ---------------------------------------------------------------------------
  if (!passo1.includes("onClick={handleRemoveLookImage}")) {
    failures.push(
      `avatar-tab-restore: o botão "Remover" da imagem do traje novo perdeu \`onClick={` +
        `handleRemoveLookImage}\` em ${PASSO1} — a imagem escolhida por engano fica presa, sem jeito de ` +
        "trocar sem recarregar a página inteira.",
    );
  } else {
    notes.push(
      '    avatar-tab-restore: o botão "Remover" da imagem do traje novo continua ligado a ' +
        "handleRemoveLookImage",
    );
  }

  return { failures, notes };
}
