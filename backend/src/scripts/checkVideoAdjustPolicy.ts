/**
 * P2-8, "Ajustar este vídeo" — a família de versões, validada por tenant
 * ANTES de cobrar, e o aviso de identidade que nunca vaza a ficha.
 *
 *  G-1  `resolverVersaoDeAjuste` herda `root_video_id` corretamente ao
 *       longo de uma cadeia (A → B → C: C herda a raiz de B, que é A —
 *       nunca aponta para B) — EXECUÇÃO real, banco real.
 *  G-2  tenant ERRADO devolve `null` (404, sem cobrar) — mesma execução
 *       real, tenant inexistente/de outro dono.
 *  G-3  a numeração usa `FOR UPDATE` na raiz — ausência de código
 *       (removê-lo reabre a corrida entre duas versões concorrentes).
 *  G-4  "Ajustar" nunca dá desconto (P5) — o módulo de crédito
 *       (`creditGate.ts`) não pode nem CONHECER `adjust_from_video_id`.
 *  G-5  `GET /videos/:id/adjust-info` só devolve `{voiceChanged}` — nunca
 *       o `voiceId`/a ficha em si (P1).
 *  G-6  o aviso de identidade existe no Passo 1 (busca `/adjust-info` +
 *       texto condicional) — ausência de código.
 *
 * Custo: ZERO — G-1/G-2 usam vídeos descartáveis no tenant real
 * `dev-c77a5b`, criados e apagados dentro da própria checagem.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import { resolverVersaoDeAjuste } from "../services/video/videoVersions.js";

const MODULO = "backend/src/services/video/videoVersions.ts";
const CREDIT_GATE = "backend/src/services/billing/creditGate.ts";
const ROTA = "backend/src/routes/videos.ts";
const AVATAR_SETUP = "frontend/src/pages/CreateVideo/steps/AvatarSetupStep.tsx";

export const MUTANTS: Mutant[] = [
  {
    guard: "P2-8: resolverVersaoDeAjuste herda root_video_id da CADEIA, nunca do pai direto",
    name: "a raiz passa a ser sempre o pai direto, não a raiz herdada",
    kind: "esperto",
    // ESPERTO: a função continua devolvendo um `rootId` — só ele deixa de
    // ser a PRIMEIRA versão da família e vira o pai imediato. Numa cadeia
    // A → B → C, isso faria C apontar para B (não para A), quebrando "Ver
    // versões" — a Biblioteca listaria B e C juntos, mas nunca A.
    file: MODULO,
    find: "  const rootId = pai.root_video_id ?? pai.id;",
    replace: "  const rootId = pai.id;",
    expect: "P2-8: a raiz herdada divergiu",
  },
  {
    guard: "P2-8: a numeração é protegida por FOR UPDATE na raiz — duas gerações concorrentes na mesma família nunca colidem",
    name: "o lock na raiz desaparece",
    kind: "obvio",
    file: MODULO,
    find: '  await client.query("SELECT id FROM videos WHERE id = $1 FOR UPDATE", [rootId]);',
    replace: "",
    expect: "P2-8: o FOR UPDATE na raiz sumiu",
  },
  {
    guard: "P2-8: Ajustar nunca dá desconto (P5) — o portão de crédito não conhece adjust_from_video_id",
    name: "creditGate.ts passa a conhecer adjust_from_video_id",
    kind: "esperto",
    file: CREDIT_GATE,
    find: "export interface RefundCreditInput {",
    replace: "// adjust_from_video_id\nexport interface RefundCreditInput {",
    expect: "P2-8: creditGate.ts passou a conhecer adjust_from_video_id",
  },
  {
    guard: "P2-8: GET /videos/:id/adjust-info devolve só {voiceChanged} — nunca o voiceId nem a ficha",
    name: "a rota passa a devolver o voiceId junto",
    kind: "esperto",
    file: ROTA,
    find: "      return reply.send({ voiceChanged: identidade.voiceId !== (avatar.voice_id ?? \"\") });",
    replace:
      "      return reply.send({ voiceChanged: identidade.voiceId !== (avatar.voice_id ?? \"\"), voiceId: identidade.voiceId });",
    expect: "P2-8: adjust-info devolveu um campo além de voiceChanged",
  },
  {
    guard: "P2-8: o Passo 1 avisa quando a voz do avatar mudou desde o vídeo original",
    name: "o aviso de identidade some do Passo 1",
    kind: "obvio",
    file: AVATAR_SETUP,
    find: "        {selectedAvatar && voiceChangedWarning && (",
    replace: "        {false && (",
    expect: "P2-8: o aviso de identidade sumiu do Passo 1",
  },
];

export interface VideoAdjustCheckResult {
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
  if (!rows[0]) throw new Error(`tenant ${TENANT_SLUG} não encontrado — checkVideoAdjustPolicy exige um tenant real`);
  return rows[0].id;
}

async function criarVideoDescartavel(
  tenantId: string,
  parentVideoId: string | null,
  rootVideoId: string | null,
  versionNumber: number,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO videos (tenant_id, script, duration_seconds, status, parent_video_id, root_video_id, version_number)
     VALUES ($1, 'checkVideoAdjustPolicy — descartável', 5, 'ready', $2, $3, $4)
     RETURNING id`,
    [tenantId, parentVideoId, rootVideoId, versionNumber],
  );
  return rows[0].id;
}

export async function checkVideoAdjustPolicy(repoRoot: string): Promise<VideoAdjustCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- G-1/G-2: EXECUÇÃO real, banco real, tenant real ---------------------
  const tenantId = await tenantIdReal();
  const videoA = await criarVideoDescartavel(tenantId, null, null, 1);
  const videoB = await criarVideoDescartavel(tenantId, videoA, null, 2); // pai=A, já com A como root (simula o resultado de um ajuste real)
  try {
    // A cadeia real: ajustar B (que aponta para A) precisa herdar A como
    // raiz — não apontar para B.
    await pool.query("UPDATE videos SET root_video_id = $1 WHERE id = $2", [videoA, videoB]);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const versaoC = await resolverVersaoDeAjuste(client, tenantId, videoB);
      await client.query("ROLLBACK"); // nunca insere C de verdade — só mede o cálculo
      if (!versaoC) {
        failures.push("P2-8: resolverVersaoDeAjuste não achou o vídeo B, que existe e pertence ao tenant certo.");
      } else {
        if (versaoC.rootId !== videoA) {
          failures.push(
            `P2-8: a raiz herdada divergiu — ajustando B (cuja raiz é A), esperava rootId=${videoA}, recebi ${versaoC.rootId}.`,
          );
        }
        if (versaoC.parentId !== videoB) {
          failures.push(`P2-8: o pai direto divergiu — esperava parentId=${videoB}, recebi ${versaoC.parentId}.`);
        }
        if (versaoC.versionNumber !== 3) {
          failures.push(`P2-8: a numeração divergiu — esperava version_number=3, recebi ${versaoC.versionNumber}.`);
        }
      }
    } finally {
      client.release();
    }

    // G-2 — TENANT ERRADO: o vídeo B pertence a `tenantId`, não a
    // `TENANT_INEXISTENTE` — a resolução tem de devolver `null`, nunca
    // achar a linha de outro dono.
    const clientErrado = await pool.connect();
    try {
      await clientErrado.query("BEGIN");
      const versaoErrada = await resolverVersaoDeAjuste(clientErrado, TENANT_INEXISTENTE, videoB);
      await clientErrado.query("ROLLBACK");
      if (versaoErrada !== null) {
        failures.push(
          "P2-8: resolverVersaoDeAjuste achou um vídeo de OUTRO tenant — isso cobraria uma geração a partir " +
            "de um vídeo que não pertence a quem está pedindo.",
        );
      }
    } finally {
      clientErrado.release();
    }
  } finally {
    await pool.query("DELETE FROM videos WHERE id = ANY($1)", [[videoA, videoB]]);
  }

  // --- G-3: por FORMA — o lock precisa continuar existindo ------------------
  const fonteModulo = lerDaRaiz(repoRoot, MODULO);
  if (!fonteModulo.includes('await client.query("SELECT id FROM videos WHERE id = $1 FOR UPDATE", [rootId]);')) {
    failures.push(
      "P2-8: o FOR UPDATE na raiz sumiu de videoVersions.ts — sem ele, duas gerações concorrentes na " +
        "mesma família podem calcular o MESMO version_number.",
    );
  }

  // --- G-4: por FORMA — creditGate.ts não pode CONHECER adjust_from_video_id
  const fonteCredito = lerDaRaiz(repoRoot, CREDIT_GATE);
  if (fonteCredito.includes("adjust_from_video_id") || fonteCredito.includes("adjustFromVideoId")) {
    failures.push(
      "P2-8: creditGate.ts passou a conhecer adjust_from_video_id — P5 (a plataforma não paga pelo " +
        "aprendizado do cliente) exige que \"Ajustar\" seja uma cobrança normal, sem desconto nenhum.",
    );
  }

  // --- G-5: por FORMA — adjust-info só devolve {voiceChanged} ---------------
  const fonteRota = lerDaRaiz(repoRoot, ROTA);
  if (!fonteRota.includes('return reply.send({ voiceChanged: identidade.voiceId !== (avatar.voice_id ?? "") });')) {
    failures.push(
      "P2-8: GET /videos/:id/adjust-info não devolve mais { voiceChanged } sozinho — pode ter passado a " +
        "expor o voiceId ou a ficha, que são uso interno (P1).",
    );
  }

  // --- G-6: por FORMA — o aviso existe no Passo 1 ---------------------------
  const fonteAvatarSetup = lerDaRaiz(repoRoot, AVATAR_SETUP);
  if (
    !fonteAvatarSetup.includes("/adjust-info") ||
    !fonteAvatarSetup.includes("voiceChangedWarning")
  ) {
    failures.push(
      "P2-8: o Passo 1 não avisa mais quando a voz do avatar mudou desde o vídeo original — " +
        `AvatarSetupStep.tsx não cita mais "/adjust-info" ou "voiceChangedWarning".`,
    );
  }

  if (failures.length === 0) {
    notes.push(
      "    P2-8: a família de versões herda a raiz corretamente (execução real), tenant errado nunca " +
        "acha vídeo de outro dono, a numeração segue travada por FOR UPDATE, Ajustar nunca dá desconto, " +
        "adjust-info só devolve um booleano, e o Passo 1 avisa quando a voz do avatar mudou",
    );
  }

  return { failures, notes };
}
