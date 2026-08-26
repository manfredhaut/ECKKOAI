/**
 * CENÁRIO/TRAJE PADRÃO DO AVATAR PERSISTEM — migration 068, Fase A item 5
 * (25/08).
 *
 * ┌─ O gap que esta guarda fecha ─────────────────────────────────────────────┐
 * │ `defaults.scenario/scenarioPrompt/outfit/outfitPrompt` (Passo 1) sempre   │
 * │ viveram só no estado do wizard de CRIAÇÃO DE VÍDEO (CreateVideoPage.tsx)  │
 * │ — nunca na linha do avatar. Os rótulos "Cenário padrão"/"Traje padrão"    │
 * │ prometiam persistência que não existia (item (c) do fechamento de 25/08: │
 * │ os textos de ajuda foram corrigidos para dizer isso, mas o comportamento │
 * │ não mudou). Fechar o gap de VERDADE — e não só o texto — é este bloco.   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  a migration 068 declara as 4 colunas em `avatars`.
 *  G-2  `PUT /avatars/:id` aceita e faz COALESCE dos 4 campos — mesmo padrão
 *       dos outros campos da rota (nome, provider, ajustes de voz): ausente
 *       no corpo não zera a coluna.
 *  G-3  "Concluir configuração" (`handleFinishSetup`, AvatarSetupStep.tsx)
 *       PERSISTE os defaults do rascunho antes de finalizar — por FORMA
 *       (recorte da função), não por execução: é um componente React com
 *       hooks, e subir a árvore inteira só para isto seria a mesma
 *       reorganização que os outros arquivos deste diretório evitam.
 *  G-4  `POST /videos` cai para o padrão do avatar SÓ quando o corpo do
 *       próprio vídeo não manda um valor — o vídeo que manda o SEU sempre
 *       vence. Os dois sentidos importam: sem o fallback, o padrão persistido
 *       nunca alcançaria um vídeo que não o repetisse; com o fallback na
 *       ordem errada, um vídeo que TENTA sobrescrever o padrão do avatar
 *       seria ignorado — pior que não ter fallback nenhum, porque pareceria
 *       funcionar.
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const MIGRATION = "backend/src/db/migrations/068_avatar_scene_defaults.sql";
const ROTA_AVATARS = "backend/src/routes/avatars.ts";
const ROTA_VIDEOS = "backend/src/routes/videos.ts";
const PASSO1 = "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx";

const CAMPOS = ["scenario", "scenario_prompt", "outfit", "outfit_prompt"] as const;

export const MUTANTS: Mutant[] = [
  {
    guard: "passo 1: Concluir configuração persiste o cenário/traje padrão no avatar",
    name: "handleFinishSetup para de persistir cenário/traje",
    kind: "esperto",
    // ESPERTO: o avatar continua sendo treinado, o botão continua
    // funcionando, a tela continua avançando normalmente — só o PUT que
    // grava scenario/outfit na linha do avatar deixa de acontecer. É
    // indistinguível de "funciona" até a PRÓXIMA visita ao produto, quando
    // o padrão que a pessoa configurou simplesmente não está mais lá.
    file: PASSO1,
    find:
      "    await guard(async () => {\n" +
      "      await api.put<Avatar>(`/avatars/${draftAvatar.id}`, {\n" +
      "        scenario: defaults.scenario || null,\n" +
      "        scenario_prompt: defaults.scenarioPrompt || null,\n" +
      "        outfit: defaults.outfit || null,\n" +
      "        outfit_prompt: defaults.outfitPrompt || null,\n" +
      "      });\n" +
      "    });\n",
    replace: "",
    expect: "avatar-defaults: Concluir configuração não persiste mais o padrão do avatar",
  },
  {
    guard: "vídeo: o valor do PRÓPRIO vídeo sempre vence o padrão persistido do avatar",
    name: "o padrão do avatar passa a vencer o valor que o vídeo manda",
    kind: "esperto",
    // ESPERTO: o fallback continua existindo — um vídeo sem cenário próprio
    // ainda recebe o padrão do avatar, e essa metade do comportamento
    // continua parecendo certa. O que quebra é a ORDEM: um vídeo que TENTA
    // sobrescrever o padrão (upload novo, prompt novo, só para ESTE vídeo)
    // é ignorado, e o padrão antigo do avatar vence sempre — pior que não
    // ter fallback, porque o campo continua preenchível na tela sem fazer
    // efeito nenhum.
    file: ROTA_VIDEOS,
    find: "    const scenarioParaGerar = scenario || avatar.scenario || null;",
    replace: "    const scenarioParaGerar = avatar.scenario || scenario || null;",
    expect: "a ORDEM inverteu (o padrão do avatar passaria a vencer o valor que o próprio vídeo manda)",
  },
];

export interface AvatarSceneDefaultsCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(repoRoot: string, relativo: string): string {
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export function checkAvatarSceneDefaultsPolicy(repoRoot: string): AvatarSceneDefaultsCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // G-1 — a migration declara as 4 colunas.
  // ---------------------------------------------------------------------------
  const migration = lerDaRaiz(repoRoot, MIGRATION);
  for (const campo of CAMPOS) {
    if (!new RegExp(`ADD COLUMN ${campo} text`).test(migration)) {
      failures.push(
        `avatar-defaults: a migration 068 não declara \`ADD COLUMN ${campo} text\` em ${MIGRATION}. Sem a ` +
          "coluna, o PUT abaixo não tem onde gravar e o UPDATE falha em produção mesmo com o gate verde.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-2 — PUT /avatars/:id aceita e faz COALESCE dos 4 campos.
  // ---------------------------------------------------------------------------
  const avatarsRoute = lerDaRaiz(repoRoot, ROTA_AVATARS);
  for (const campo of CAMPOS) {
    if (!avatarsRoute.includes(`${campo} = COALESCE($`)) {
      failures.push(
        `avatar-defaults: PUT /avatars/:id não faz \`${campo} = COALESCE(...)\` em ${ROTA_AVATARS}. Sem o ` +
          "COALESCE, um PUT que não manda este campo (ex.: só o LUFS) zeraria o padrão já salvo.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-3 — Concluir configuração persiste, por FORMA (recorte da função).
  // ---------------------------------------------------------------------------
  const passo1 = lerDaRaiz(repoRoot, PASSO1);
  const inicioFinish = passo1.indexOf("async function handleFinishSetup() {");
  const fimFinish = passo1.indexOf("\n  function updateQuality(", inicioFinish);
  if (inicioFinish < 0 || fimFinish < 0) {
    failures.push(
      `avatar-defaults: não foi possível recortar \`handleFinishSetup\` em ${PASSO1} pelas âncoras ` +
        "`async function handleFinishSetup() {` e `function updateQuality(`. A guarda não pode opinar " +
        "sobre um trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
    );
  } else {
    const corpoFinish = passo1.slice(inicioFinish, fimFinish);
    if (!corpoFinish.includes("await api.put<Avatar>(`/avatars/${draftAvatar.id}`, {")) {
      failures.push(
        `avatar-defaults: Concluir configuração não persiste mais o padrão do avatar — o PUT a ` +
          `/avatars/:id não está mais dentro de \`handleFinishSetup\` em ${PASSO1}. A pessoa configura ` +
          "cenário/traje na tela, clica em Concluir, e na próxima visita o padrão não está mais lá.",
      );
    }
    for (const [corpo, defaultsField] of [
      ["scenario: defaults.scenario", "scenario"],
      ["scenario_prompt: defaults.scenarioPrompt", "scenarioPrompt"],
      ["outfit: defaults.outfit", "outfit"],
      ["outfit_prompt: defaults.outfitPrompt", "outfitPrompt"],
    ] as const) {
      if (!corpoFinish.includes(corpo)) {
        failures.push(
          `avatar-defaults: Concluir configuração não envia \`${corpo}\` — falta em ${PASSO1}. O campo ` +
            `\`defaults.${defaultsField}\` existe na tela do Passo 1 e não chega ao PUT que persiste.`,
        );
      }
    }
  }

  // ---------------------------------------------------------------------------
  // G-4 — POST /videos: fallback existe, e o corpo do vídeo vence.
  // ---------------------------------------------------------------------------
  const videosRoute = lerDaRaiz(repoRoot, ROTA_VIDEOS);
  const FALLBACKS = [
    ["scenarioParaGerar", "scenario", "avatar.scenario"],
    ["scenarioPromptParaGerar", "scenarioPrompt", "avatar.scenario_prompt"],
    ["outfitParaGerar", "outfit", "avatar.outfit"],
    ["outfitPromptParaGerar", "outfitPrompt", "avatar.outfit_prompt"],
  ] as const;
  for (const [nomeVar, doCorpo, doAvatar] of FALLBACKS) {
    const esperado = `const ${nomeVar} = ${doCorpo} || ${doAvatar} || null;`;
    if (!videosRoute.includes(esperado)) {
      failures.push(
        `avatar-defaults: \`${esperado}\` não está mais em ${ROTA_VIDEOS}. Ou o fallback para o padrão do ` +
          `avatar sumiu (um vídeo sem valor próprio deixa de herdar o padrão), ou a ORDEM inverteu (o ` +
          "padrão do avatar passaria a vencer o valor que o próprio vídeo manda) — os dois são o mesmo " +
          "defeito, em direções opostas.",
      );
    }
  }
  // As variáveis PARA_GERAR — e não as brutas do corpo — são as que
  // efetivamente alcançam o banco (INSERT) e o fornecedor (generateVideo).
  // Contar em vez de `.includes()` simples: um mutante que reintroduzisse a
  // variável bruta AO LADO da nova, sem removê-la, passaria por um teste de
  // presença — a contagem exige as DUAS ocorrências (INSERT + generateVideo).
  for (const nomeVar of ["scenarioParaGerar", "outfitParaGerar", "scenarioPromptParaGerar", "outfitPromptParaGerar"]) {
    const ocorrenciasDeUso = (videosRoute.match(new RegExp(`[^a-zA-Z]${nomeVar}[,:]`, "g")) ?? []).length;
    // 1 na declaração (`const x = …`) não conta aqui — o regex exige vírgula
    // ou dois-pontos logo depois, que só casa com USO (item de array/objeto).
    if (ocorrenciasDeUso < 2) {
      failures.push(
        `avatar-defaults: \`${nomeVar}\` é usado em ${ocorrenciasDeUso} lugar(es) de ${ROTA_VIDEOS}, ` +
          "esperado ao menos 2 (o INSERT em `videos` e a chamada a `generateVideo`). Se um dos dois " +
          "call sites voltar a usar a variável bruta do corpo, o fallback para o padrão do avatar deixa " +
          "de valer justo ali — gravado numa coluna mas nunca enviado ao fornecedor, ou o contrário.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "    avatar-defaults: migration 068 declara as 4 colunas, PUT /avatars/:id persiste com COALESCE, " +
        "Concluir configuração grava o padrão, e POST /videos cai para ele só quando o próprio vídeo " +
        "não manda um valor seu",
    );
  }

  return { failures, notes };
}
