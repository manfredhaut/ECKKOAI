/**
 * CENÁRIO/TRAJE DO AVATAR — CONTRATO DE BACKEND, migration 068 (Fase A item
 * 5, 25/08). ESTREITADA para só backend na rodada de Traje-por-vídeo
 * (28/08): TRAJE seguiu CENÁRIO (27/08) para fora do Passo 1.
 *
 * ┌─ O que mudou nesta rodada ─────────────────────────────────────────────────┐
 * │ Esta guarda cobria os 4 campos como "padrão do avatar EDITÁVEL no Passo    │
 * │ 1" — persistência (G-3) e releitura (G-5) incluídas. Traje seguiu Cenário  │
 * │ para fora do Passo 1: `handleFinishSetup` PAROU de persistir `outfit`/     │
 * │ `outfit_prompt` (mesma decisão já tomada para scenario/scenario_prompt em  │
 * │ 27/08), e a tela PAROU de reler os 4 campos para `defaults` (tipo extinto  │
 * │ — ver `types.ts`). G-3/G-5 (Passo 1, execução) SAÍRAM: não sobrou nada do  │
 * │ Passo 1 para provar. O que fica é só o CONTRATO DE BACKEND — as colunas    │
 * │ existem, o PUT aceita e faz COALESCE, e `POST /videos` cai para o valor    │
 * │ congelado do avatar só quando o vídeo não manda o seu. A MIGRAÇÃO (semear  │
 * │ os 4 campos em `wizard` uma vez por avatar) tem guarda própria em          │
 * │ `checkScenePerVideoPolicy.ts`, que também prova que nenhum vestígio da UI  │
 * │ de Passo 1 sobrevive para os dois campos.                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  a migration 068 declara as 4 colunas em `avatars`.
 *  G-2  `PUT /avatars/:id` aceita e faz COALESCE dos 4 campos — mesmo padrão
 *       dos outros campos da rota (nome, provider, ajustes de voz): ausente
 *       no corpo não zera a coluna. Nada mais escreve nestes 4 campos desde
 *       o Passo 1 (a UI que os editava saiu inteira), mas o backend continua
 *       aceitando-os — não há razão para recusar um PUT que os mande.
 *  G-4  `POST /videos` cai para o padrão do avatar SÓ quando o corpo do
 *       próprio vídeo não manda um valor — o vídeo que manda o SEU sempre
 *       vence. Vale para os 4 campos (backend inalterado desde 25/08).
 *
 * Custo: ZERO. Nenhuma rede, nenhum banco — leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const MIGRATION = "backend/src/db/migrations/068_avatar_scene_defaults.sql";
const ROTA_AVATARS = "backend/src/routes/avatars.ts";
const ROTA_VIDEOS = "backend/src/routes/videos.ts";

const CAMPOS = ["scenario", "scenario_prompt", "outfit", "outfit_prompt"] as const;

export const MUTANTS: Mutant[] = [
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
  //
  // `scenario`/`outfit` (as IMAGENS, não os `_prompt`) ganharam um segundo
  // caminho em 26/08 — `scenario_clear`/`outfit_clear` — para permitir
  // remover a imagem de propósito (COALESCE sozinho nunca zera nada, então
  // um "remover" precisa de um jeito de FORÇAR null). Por isso o COALESCE
  // desses dois campos pode vir dentro de um `CASE WHEN $n THEN NULL ELSE
  // COALESCE(...) END` — o padrão exige só que `COALESCE($` apareça na
  // mesma atribuição, não mais que venha logo depois do `=`.
  // ---------------------------------------------------------------------------
  const avatarsRoute = lerDaRaiz(repoRoot, ROTA_AVATARS);
  for (const campo of CAMPOS) {
    const atribuicao = new RegExp(`${campo} = [^,]*COALESCE\\(\\$`);
    if (!atribuicao.test(avatarsRoute)) {
      failures.push(
        `avatar-defaults: PUT /avatars/:id não faz \`${campo} = COALESCE(...)\` (direto ou dentro de um CASE) ` +
          `em ${ROTA_AVATARS}. Sem o COALESCE, um PUT que não manda este campo (ex.: só o LUFS) zeraria o ` +
          "padrão já salvo.",
      );
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
        "e POST /videos cai para o padrão congelado do avatar (dos 4 campos) só quando o próprio vídeo " +
        "não manda um valor seu",
    );
  }

  return { failures, notes };
}
