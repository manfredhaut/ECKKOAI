/**
 * P2-7, 22/09/2026 — a janela "Detalhes" (Biblioteca) nunca exibe *_en nem
 * identity_snapshot, e todo campo vazio mostra "—".
 *
 * CHECAGEM ESTÁTICA (leitura de texto) — mesma técnica de toda guarda deste
 * projeto que vigia um arquivo `.tsx`: o ambiente do gate roda em Node puro,
 * sem bundler/JSX, então não há como IMPORTAR o componente e executá-lo de
 * verdade (diferente das guardas de lógica pura do backend).
 *
 *  G-1  o arquivo-fonte de VideoDetailsModal.tsx não contém `_en` nem
 *       `identity_snapshot` — P1, mesmo campo já velado pelo backend
 *       (CAMPOS_VELADOS, tenantView.ts), garantia em DUAS camadas.
 *  G-2  o componente `Linha` continua com o fallback `value || "—"` — a
 *       rede de segurança para qualquer campo que chegue sem fallback
 *       próprio (a maioria já tem `?? "—"` inline, mas essa é a última
 *       linha de defesa).
 *
 * Custo: ZERO. Leitura de arquivo.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const MODULO = "frontend/src/pages/Content/VideoDetailsModal.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "Detalhes: o arquivo nunca cita motion_prompt_en/scenario_prompt_en/outfit_prompt_en",
    name: "o modal passa a exibir motion_prompt_en",
    kind: "obvio",
    file: MODULO,
    find: '<Linha label={t("content.detailsMotionPrompt")} value={video.motion_prompt ?? "—"} />',
    replace: '<Linha label={t("content.detailsMotionPrompt")} value={video.motion_prompt_en ?? "—"} />',
    expect: "Detalhes: o modal cita um campo _en",
  },
  {
    guard: "Detalhes: o arquivo nunca cita identity_snapshot",
    name: "o modal passa a exibir identity_snapshot",
    kind: "obvio",
    file: MODULO,
    find: '<Linha label={t("content.detailsAvatar")} value={avatarNome} />',
    replace:
      '<Linha label={t("content.detailsAvatar")} value={avatarNome} />\n' +
      '        <Linha label="debug" value={JSON.stringify((video as unknown as { identity_snapshot?: unknown }).identity_snapshot)} />',
    expect: "Detalhes: o modal cita identity_snapshot",
  },
  {
    guard: "Detalhes: Linha sempre cai em \"—\" quando o valor é vazio",
    name: "Linha para de aplicar o fallback",
    kind: "esperto",
    // ESPERTO: o componente continua existindo, continua recebendo `value`,
    // só o fallback some — um campo vazio passaria a renderizar string
    // vazia em vez de "—".
    file: MODULO,
    find: "<span style={{ fontSize: 13, textAlign: \"right\" }}>{value || \"—\"}</span>",
    replace: "<span style={{ fontSize: 13, textAlign: \"right\" }}>{value}</span>",
    expect: "Detalhes: Linha não tem mais o fallback",
  },
];

export interface VideoDetailsCheckResult {
  failures: string[];
  notes: string[];
}

export function checkVideoDetailsPolicy(repoRoot: string): VideoDetailsCheckResult {
  const failures: string[] = [];
  const notes: string[] = [];

  const src = readFileSync(path.join(repoRoot, MODULO), "utf8");
  // Só o CÓDIGO conta — o cabeçalho do módulo cita "*_en"/"identity_snapshot"
  // em prosa, explicando por que o componente não os usa. Sem excluir
  // comentários, esta guarda reprovaria contra a própria documentação.
  const semComentarios = src
    .split("\n")
    .filter((linha) => !linha.trim().startsWith("*") && !linha.trim().startsWith("//"))
    .join("\n");

  if (semComentarios.includes("_en")) {
    failures.push(
      "Detalhes: o modal cita um campo _en fora de comentário — P1 exige que a pessoa veja e revise " +
        "sempre o próprio texto, nunca a versão traduzida para o fornecedor.",
    );
  }
  if (semComentarios.includes("identity_snapshot")) {
    failures.push(
      "Detalhes: o modal cita identity_snapshot fora de comentário — a ficha de identidade congelada " +
        "é uso interno, nunca da tela do tenant.",
    );
  }
  if (!src.includes('{value || "—"}')) {
    failures.push('Detalhes: o componente Linha não tem mais o fallback `value || "—"` para campo vazio.');
  }

  if (failures.length === 0) {
    notes.push(
      "    Detalhes: o modal nunca cita motion_prompt_en/scenario_prompt_en/outfit_prompt_en/" +
        "identity_snapshot fora de comentário, e todo campo vazio cai em \"—\"",
    );
  }

  return { failures, notes };
}
