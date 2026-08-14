/**
 * O cenário e o traje ganham campo no fluxo de AVATAR EXISTENTE — BLOCO B5c.
 *
 * ┌─ O gap que esta guarda fecha ─────────────────────────────────────────────┐
 * │ `videos.scenario`/`scenario_prompt` e `outfit`/`outfit_prompt` já           │
 * │ chegavam à fal (B2/B5) — o que faltava era a TELA: `defaults.scenario`     │
 * │ só era preenchível dentro de "criar avatar novo", e `defaults.outfit` não  │
 * │ era preenchível em LUGAR NENHUM. Um avatar existente, que é o caminho      │
 * │ normal de gerar um vídeo, não tinha onde preencher nenhum dos dois.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ANCORADA NO USO, ancoragem INTRÍNSECA ao bloco novo ────────────────────┐
 * │ O recorte vai do comentário que abre o bloco novo até o comentário que    │
 * │ abre o próximo bloco existente ("ORDEM DO PASSO 1") — nunca um wrapper de │
 * │ layout. Rede anti-vazamento nos dois sentidos: o recorte não pode conter  │
 * │ `addLookButton`/`handleCreateLook` (o traje ANTIGO — look do fornecedor,  │
 * │ US$ 1,00, sem relação com `outfit`/`outfit_prompt`) nem `newAvatarTitle`  │
 * │ (o OUTRO ramo, "criar avatar novo", que esta rodada não toca).            │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Um mutante, dois campos conferidos ──────────────────────────────────────┐
 * │ A invariante é sobre os DOIS — cenário e traje —, e a conferência mede os │
 * │ dois. O mutante único mexe só no traje: é o campo genuinamente NOVO desta  │
 * │ rodada (o cenário já existia, só não neste ramo; o traje não existia em   │
 * │ lugar nenhum), e é o mais provável de nascer sem o `onChange` — o mesmo   │
 * │ padrão do "cenário para de entrar" na G-1 do B5, que também deixou o      │
 * │ contraponto (traje) de fora do mutante por decisão, não por descuido.     │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const STEP = "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "o cenário e o traje do avatar existente chegam ao corpo enviado à fal",
    name: "o campo de traje do avatar existente perde o onChange",
    kind: "esperto",
    // ESPERTO: o campo continua na tela, com o mesmo rótulo, o mesmo
    // placeholder, a mesma aparência — e digitar nele não faz mais nada. É
    // indistinguível de "funciona" até alguém gerar um vídeo e notar que o
    // traje escrito não chegou à composição, que é exatamente a forma do
    // defeito que esta rodada existe para fechar (o campo antigo morria do
    // mesmo jeito: existia, coletava, e não alimentava nada).
    file: STEP,
    find:
      '                  <input\n' +
      '                    placeholder={t("createVideo.avatarSetup.outfitPlaceholder")}\n' +
      '                    value={defaults.outfitPrompt}\n' +
      '                    onChange={(e) => onDefaultsChange({ ...defaults, outfitPrompt: e.target.value })}\n' +
      '                  />',
    replace:
      '                  <input\n' +
      '                    placeholder={t("createVideo.avatarSetup.outfitPlaceholder")}\n' +
      '                    value={defaults.outfitPrompt}\n' +
      '                  />',
    expect: "existing-avatar: traje do avatar existente sem onChange — o campo não propaga o texto",
  },
];

export interface ExistingAvatarAssetsCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  // CRLF → LF. Ver o gotcha 3 do ESTADO.md: o working copy vem em CRLF e todo
  // trecho transcrito aqui é escrito com `\n`.
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export async function checkExistingAvatarAssetsPolicy(): Promise<ExistingAvatarAssetsCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const codigo = lerDaRaiz(STEP);
  const inicio = codigo.indexOf("{/* CENÁRIO E TRAJE deste vídeo — BLOCO B5c.");
  const fim = codigo.indexOf("{/* ORDEM DO PASSO 1, e ela é o ponto deste bloco.", inicio);

  if (inicio < 0 || fim < 0) {
    failures.push(
      `existing-avatar: não foi possível recortar o bloco de cenário/traje em ${STEP} pelas âncoras ` +
        '`{/* CENÁRIO E TRAJE deste vídeo` e `{/* ORDEM DO PASSO 1`. A guarda não pode opinar sobre um ' +
        "trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
    );
    return { failures, notes };
  }

  const trecho = codigo.slice(inicio, fim);

  // Rede anti-vazamento, nos dois sentidos.
  if (trecho.includes("addLookButton") || trecho.includes("handleCreateLook")) {
    failures.push(
      "existing-avatar: o recorte do bloco de cenário/traje engoliu o traje ANTIGO " +
        "(`addLookButton`/`handleCreateLook`) — a âncora vazou para o bloco do LOOK do fornecedor, e o " +
        "que for conferido nele não diz nada sobre `outfit`/`outfit_prompt`.",
    );
  }
  if (trecho.includes("newAvatarTitle")) {
    failures.push(
      "existing-avatar: o recorte do bloco de cenário/traje engoliu o ramo `newAvatarTitle` (\"criar " +
        "avatar novo\") — a âncora vazou para o outro ramo do componente, que esta rodada não toca.",
    );
  }

  for (const [rotulo, campo] of [
    ["cenário", "scenarioPrompt"],
    ["traje", "outfitPrompt"],
  ] as const) {
    const onChange = `onChange={(e) => onDefaultsChange({ ...defaults, ${campo}: e.target.value })}`;
    if (!trecho.includes(onChange)) {
      failures.push(
        `existing-avatar: ${rotulo} do avatar existente sem onChange — o campo não propaga o texto. ` +
          `Esperado \`${onChange}\` dentro do bloco de cenário/traje. Um campo que existe na tela e não ` +
          "escreve em `defaults` é indistinguível de funcionar até alguém gerar um vídeo.",
      );
    }
    const upload = `handleAssetUpload("${campo === "scenarioPrompt" ? "scenario" : "outfit"}", e.target.files[0])`;
    if (!trecho.includes(upload)) {
      failures.push(
        `existing-avatar: upload de ${rotulo} do avatar existente ausente — esperado \`${upload}\` dentro ` +
          "do bloco de cenário/traje.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "    existing-avatar: cenário e traje têm upload e onChange no ramo de avatar existente, sem " +
        "vazar para o traje antigo (LOOK) nem para o ramo de avatar novo",
    );
  }

  return { failures, notes };
}
