/**
 * P2-3, 22/09/2026 — CANCELAR uma aprovação pendente, sem estorno (P5).
 *
 *  G-1  `tentarCancelarVideo` NUNCA chama refundCredit — P5: a plataforma
 *       não paga pelo aprendizado do cliente. Os dois status canceláveis
 *       só são alcançados DEPOIS de uma etapa paga já ter rodado.
 *  G-2  cancelar é recusado fora de `awaiting_approval`/
 *       `awaiting_approval_video` — EXECUÇÃO real, banco real.
 *  G-3  cancelar de outro tenant é recusado (nunca revela se o vídeo
 *       existe) — EXECUÇÃO real, banco real.
 *  G-4  `cancelled` nunca entra em `STATUS_VARRIDOS` (recovery.ts) — não
 *       precisa entrar lá para nunca ser reprocessado; a ausência É a
 *       proteção.
 *  G-5  `tentarCancelarVideo` nunca grava `failure_reason` — cancelar não
 *       é uma falha.
 *
 * Custo: ZERO — G-2/G-3 usam um vídeo descartável no tenant real
 * `dev-c77a5b`, criado e apagado dentro da própria checagem, sem nenhuma
 * chamada a fornecedor.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import { tentarCancelarVideo } from "../services/video/videoCancel.js";

const MODULO = "backend/src/services/video/videoCancel.ts";
const RECOVERY = "backend/src/services/video/recovery.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "tentarCancelarVideo NUNCA chama refundCredit (P5: a plataforma não paga pelo aprendizado do cliente)",
    name: "cancelar volta a estornar o crédito",
    kind: "obvio",
    file: MODULO,
    find: "  if (rowCount) return { ok: true, video: rows[0] };",
    replace:
      "  if (rowCount) {\n" +
      "    const { refundCredit } = await import(\"../billing/creditGate.js\");\n" +
      "    await refundCredit({ tenantId, creditType: \"video\", relatedVideoId: rows[0].id });\n" +
      "    return { ok: true, video: rows[0] };\n" +
      "  }",
    expect: "cancelar: videoCancel.ts voltou a estornar crédito",
  },
  {
    guard: "cancelar é recusado fora de awaiting_approval/awaiting_approval_video",
    name: "STATUS_CANCELAVEIS ganha um status que não devia poder cancelar",
    kind: "esperto",
    // ESPERTO: não remove a checagem inteira — só AMPLIA a lista, o que uma
    // guarda que só olhasse "existe uma checagem de status?" não pegaria.
    file: MODULO,
    find: 'export const STATUS_CANCELAVEIS = ["awaiting_approval", "awaiting_approval_video"] as const;',
    replace: 'export const STATUS_CANCELAVEIS = ["awaiting_approval", "awaiting_approval_video", "ready"] as const;',
    expect: "cancelar: um vídeo em \"ready\" foi cancelado",
  },
  {
    guard: "cancelar de outro tenant é recusado (nunca revela se o vídeo existe)",
    name: "o UPDATE deixa de filtrar por tenant_id",
    kind: "esperto",
    // ESPERTO: `$2` (tenantId) continua sendo passado como parâmetro — só
    // deixa de ser REFERENCIADO na query, o que uma checagem que só olhasse
    // "tenantId ainda é usado em algum lugar da função?" não pegaria (ele
    // segue usado no SELECT de fallback, só não no UPDATE que decide).
    file: MODULO,
    find: "WHERE id = $1 AND tenant_id = $2 AND status = ANY($3)",
    replace: "WHERE id = $1 AND status = ANY($3)",
    expect: "cancelar: um vídeo de OUTRO tenant foi cancelado",
  },
  {
    guard: "cancelled nunca entra em STATUS_VARRIDOS (recovery.ts) — a ausência é a proteção contra reprocessamento",
    name: "cancelled é reintroduzido em STATUS_VARRIDOS",
    kind: "obvio",
    file: RECOVERY,
    find:
      'export const STATUS_VARRIDOS: readonly string[] = [\n' +
      '  "queued",\n' +
      '  "processing",\n' +
      '  STATUS_AGUARDANDO_APROVACAO,\n' +
      '  STATUS_AGUARDANDO_APROVACAO_VIDEO,\n' +
      '];',
    replace:
      'export const STATUS_VARRIDOS: readonly string[] = [\n' +
      '  "queued",\n' +
      '  "processing",\n' +
      '  STATUS_AGUARDANDO_APROVACAO,\n' +
      '  STATUS_AGUARDANDO_APROVACAO_VIDEO,\n' +
      '  "cancelled",\n' +
      '];',
    expect: "recuperação: cancelled voltou a ser varrido",
  },
  {
    guard: "tentarCancelarVideo nunca grava failure_reason — cancelar não é uma falha",
    name: "o UPDATE de cancelar passa a gravar failure_reason",
    kind: "esperto",
    file: MODULO,
    find: "UPDATE videos SET status = 'cancelled'",
    replace: "UPDATE videos SET status = 'cancelled', failure_reason = 'vendor_rejected'",
    expect: "cancelar: videoCancel.ts grava failure_reason",
  },
];

export interface VideoCancelCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(repoRoot: string, relativo: string): string {
  return readFileSync(path.join(repoRoot, relativo), "utf8").replace(/\r\n/g, "\n");
}

const TENANT_SLUG = "dev-c77a5b";
const TENANT_INEXISTENTE = "00000000-0000-4000-8000-000000000000";

async function tenantIdReal(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE slug = $1", [TENANT_SLUG]);
  if (!rows[0]) throw new Error(`tenant ${TENANT_SLUG} não encontrado — checkVideoCancelPolicy exige um tenant real`);
  return rows[0].id;
}

async function criarVideoDescartavel(tenantId: string, status: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO videos (tenant_id, script, duration_seconds, status)
     VALUES ($1, 'checkVideoCancelPolicy — descartável', 5, $2)
     RETURNING id`,
    [tenantId, status],
  );
  return rows[0].id;
}

export async function checkVideoCancelPolicy(repoRoot: string): Promise<VideoCancelCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1/G-5: por FORMA — o arquivo não pode conter os textos que ------
  // reintroduziriam estorno ou failure_reason.
  const src = lerDaRaiz(repoRoot, MODULO);
  if (src.includes("refundCredit")) {
    failures.push(
      "cancelar: videoCancel.ts voltou a estornar crédito — P5 (a plataforma não paga pelo aprendizado do " +
        "cliente) exige que cancelar NUNCA devolva o crédito de uma etapa paga já rodada.",
    );
  }
  if (src.includes("failure_reason")) {
    failures.push(
      "cancelar: videoCancel.ts grava failure_reason — cancelar é decisão do cliente, não uma falha; esse " +
        "enum descreve POR QUE a máquina falhou.",
    );
  }

  // --- G-4: por FORMA — recovery.ts nunca varre `cancelled` ---------------
  const recoverySrc = lerDaRaiz(repoRoot, RECOVERY);
  const statusVarridosMatch = recoverySrc.match(/STATUS_VARRIDOS: readonly string\[\] = \[([\s\S]*?)\];/);
  if (!statusVarridosMatch) {
    failures.push(`recuperação: ${RECOVERY} não declara mais STATUS_VARRIDOS no formato esperado.`);
  } else if (statusVarridosMatch[1].includes("cancelled")) {
    failures.push(
      "recuperação: cancelled voltou a ser varrido — STATUS_VARRIDOS não pode incluir \"cancelled\": a " +
        "ausência dele na lista É a proteção contra reprocessamento, não uma checagem por exclusão.",
    );
  }

  // --- G-2/G-3: EXECUÇÃO real, banco real, tenant real --------------------
  const tenantId = await tenantIdReal();
  const videoReady = await criarVideoDescartavel(tenantId, "ready");
  const videoAguardando = await criarVideoDescartavel(tenantId, "awaiting_approval");
  try {
    // G-2 — status fora da lista permitida é recusado.
    const resultadoStatusErrado = await tentarCancelarVideo(tenantId, videoReady);
    if (resultadoStatusErrado.ok) {
      failures.push(
        `cancelar: um vídeo em "ready" foi cancelado (esperava-se recusa "not_pending") — cancelar só pode ` +
          "agir sobre awaiting_approval/awaiting_approval_video.",
      );
    } else if (resultadoStatusErrado.motivo !== "not_pending") {
      failures.push(
        `cancelar: um vídeo em "ready" devolveu motivo "${resultadoStatusErrado.motivo}", esperado "not_pending".`,
      );
    }

    // G-3 — tenant diferente é recusado, sem revelar que o vídeo existe.
    const resultadoTenantErrado = await tentarCancelarVideo(TENANT_INEXISTENTE, videoAguardando);
    if (resultadoTenantErrado.ok) {
      failures.push(
        "cancelar: um vídeo de OUTRO tenant foi cancelado — o UPDATE precisa filtrar por tenant_id, sempre.",
      );
    } else if (resultadoTenantErrado.motivo !== "not_found") {
      failures.push(
        `cancelar: tenant errado devolveu motivo "${resultadoTenantErrado.motivo}", esperado "not_found" ` +
          "(um id de outro tenant não pode ser distinguido de um id inexistente).",
      );
    }

    // Contraponto — o caminho FELIZ continua funcionando: o mesmo vídeo,
    // com o tenant CERTO, cancela de verdade.
    const resultadoFeliz = await tentarCancelarVideo(tenantId, videoAguardando);
    if (!resultadoFeliz.ok) {
      failures.push(
        `cancelar: o caminho feliz (tenant certo, status pendente) foi recusado — motivo "${resultadoFeliz.motivo}".`,
      );
    } else if (resultadoFeliz.video.status !== "cancelled") {
      failures.push(`cancelar: o caminho feliz não gravou status "cancelled" — gravou "${resultadoFeliz.video.status}".`);
    }
  } finally {
    await pool.query("DELETE FROM videos WHERE id = ANY($1)", [[videoReady, videoAguardando]]);
  }

  if (failures.length === 0) {
    notes.push(
      "    cancelar: nunca estorna (P5), nunca grava failure_reason, recusa fora de awaiting_approval*, " +
        "recusa de outro tenant (execução real) e cancelled nunca entra em STATUS_VARRIDOS",
    );
  }

  return { failures, notes };
}
