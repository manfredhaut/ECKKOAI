/**
 * CC1, BLOCO HEYGEN-SIMPLES-10 (03/09/2026) — o payload real de
 * `POST /v3/videos` sobrevive independente do buffer de log ao vivo.
 *
 * ┌─ Por que isto existe ──────────────────────────────────────────────────────┐
 * │ `tools/registro-geracao.sh` (SIMPLES-9, Y2) lia o payload do log ao vivo   │
 * │ do backend (`docker compose logs backend --tail 500`) — e esse buffer já   │
 * │ girou 2× antes de dar tempo de alguém copiar a linha `video_payload_built`.│
 * │ `persistHeygenVideoPayload` (avatarProvider.ts) grava o mesmo corpo numa   │
 * │ tabela satélite (`heygen_video_payloads`, migration 079), ligado por       │
 * │ `video_id` — banco, não log: sobrevive a qualquer rotação.                 │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Três propriedades provadas por EXECUÇÃO real (`generateVideo`, `fetch`
 * substituído, contra um vídeo REAL em `videos` — não uma sonda sem banco):
 *
 *  1. O payload persiste, com os campos de F1 visíveis (fit, aspect_ratio,
 *     output_format, title, callback_url, callback_id).
 *  2. Persiste ANTES do `fetch` — mesmo quando o vendor RECUSA a chamada
 *     (400), a linha continua lá. É justamente na falha que o log ao vivo é
 *     menos confiável de se estar olhando na hora.
 *  3. Uma segunda chamada para o MESMO `video_id` (ex.: "Refazer vídeo")
 *     ATUALIZA o payload — não duplica, não falha, não fica com o antigo.
 *
 * ┌─ Custo: ZERO ────────────────────────────────────────────────────────────┐
 * │ `fetch` substituído — nenhuma rede real. O vídeo de prova é criado e       │
 * │ apagado no tenant real `dev-c77a5b` (mesmo padrão de                      │
 * │ `probeEstornoAnimar.ts`); a exclusão do vídeo CASCATEIA para              │
 * │ `heygen_video_payloads` (FK `ON DELETE CASCADE`), então não há limpeza    │
 * │ separada a fazer nessa tabela.                                            │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import { resolveVideoFormat } from "../services/providers/videoFormat.js";
import { resetLiveGenerationCount } from "../services/providers/liveGuard.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "persistência: o payload real de POST /v3/videos é gravado em heygen_video_payloads, ligado por video_id — mesmo quando o vendor recusa a chamada",
    name: "a chamada a persistHeygenVideoPayload desaparece de generateVideoHeygen",
    kind: "obvio",
    file: "backend/src/services/providers/avatarProvider.ts",
    find:
      "  // CC1, BLOCO HEYGEN-SIMPLES-10 — persiste ANTES do fetch, de propósito:\n" +
      "  // mesmo que a chamada falhe/dê timeout, o payload que ÍAMOS mandar fica\n" +
      "  // registrado — útil sobretudo quando o vendor falha, que é justamente\n" +
      "  // quando o log ao vivo é menos confiável de se estar olhando na hora.\n" +
      "  if (input.videoId) {\n" +
      "    await persistHeygenVideoPayload(input.videoId, body);\n" +
      "  }\n" +
      "\n",
    replace: "",
    expect: "nenhuma linha em heygen_video_payloads",
  },
  {
    guard: "persistência: uma 2ª chamada para o MESMO video_id ATUALIZA o payload (ON CONFLICT DO UPDATE), não duplica nem fica com o antigo",
    name: "o INSERT perde a cláusula ON CONFLICT DO UPDATE",
    kind: "esperto",
    // ESPERTO: a 1ª chamada continua persistindo normalmente (mutante A não
    // pegaria isto). Só a 2ª chamada para o MESMO video_id passa a violar a
    // PK sem cláusula de conflito — capturada pelo try/catch de
    // `persistHeygenVideoPayload` (nunca lança, é telemetria secundária), e
    // o efeito observável é o payload FICAR PARADO no conteúdo da 1ª
    // chamada mesmo depois de um "Refazer vídeo" de verdade.
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "       ON CONFLICT (video_id) DO UPDATE SET payload = EXCLUDED.payload, created_at = now()",
    replace: "",
    expect: "não refletiu a 2ª chamada",
  },
];

export interface HeygenPayloadPersistenceCheckResult {
  failures: string[];
  notes: string[];
}

const TENANT_SLUG = "dev-c77a5b";

async function tenantIdReal(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE slug = $1", [TENANT_SLUG]);
  if (!rows[0]) throw new Error(`tenant ${TENANT_SLUG} não encontrado — prova de persistência exige um tenant real`);
  return rows[0].id;
}

async function criarVideoDescartavel(tenantId: string, script: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO videos (tenant_id, script, duration_seconds, provider_vendor)
     VALUES ($1, $2, 5, 'heygen')
     RETURNING id`,
    [tenantId, script],
  );
  return rows[0].id;
}

async function lerPayload(videoId: string): Promise<Record<string, unknown> | null> {
  const { rows } = await pool.query<{ payload: Record<string, unknown> }>(
    "SELECT payload FROM heygen_video_payloads WHERE video_id = $1",
    [videoId],
  );
  return rows[0]?.payload ?? null;
}

/** Roda `generateVideo` de verdade, com `fetch` substituído. `vendorAceita=false` simula o vendor RECUSANDO POST /v3/videos (400). */
async function correr(
  tenantId: string,
  videoId: string,
  platform: "youtube" | "reels_tiktok",
  vendorAceita: boolean,
): Promise<{ erro: unknown }> {
  const { generateVideo } = await import("../services/providers/avatarProvider.js");

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown) => {
    const url = String(typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada);
    if (url.includes("api.elevenlabs.io") && url.includes("/with-timestamps")) {
      return new Response(
        JSON.stringify({ audio_base64: Buffer.from("audio-da-prova").toString("base64"), alignment: { character_end_times_seconds: [0.1, 2.0] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("api.heygen.com/v3/assets")) {
      return new Response(JSON.stringify({ data: { asset_id: "asset-da-prova" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("api.heygen.com/v3/videos")) {
      if (!vendorAceita) {
        return new Response(JSON.stringify({ error: { message: "recusado de propósito, prova de persistência" } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: { video_id: "job-da-prova" } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`fetch inesperado na prova de persistência de payload: ${url}`);
  }) as typeof fetch;

  let erro: unknown = null;
  try {
    await generateVideo({
      apiKey: "chave-irrelevante-fetch-substituido",
      vendor: "heygen",
      providerAvatarId: "avatar-da-prova",
      script: "Roteiro da prova de persistência de payload.",
      elevenLabsApiKey: "chave-irrelevante-fetch-substituido",
      voiceId: "voz-da-prova",
      tenantId,
      videoId,
      audioTreatmentEnabled: false,
      audioTreatmentTargetLufs: -16,
      format: resolveVideoFormat(platform),
      supportedEngines: null,
      engineEnabled: false,
      scene: null,
      engineChoice: null,
      captions: false,
    });
  } catch (err) {
    erro = err;
  } finally {
    globalThis.fetch = fetchOriginal;
  }

  return { erro };
}

export async function checkHeygenPayloadPersistencePolicy(): Promise<HeygenPayloadPersistenceCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const modoOriginal = process.env.PROVIDER_MODE;
  const tetoOriginal = process.env.PROVIDER_LIVE_MAX_GENERATIONS;

  const tenantId = await tenantIdReal();
  const videoSucesso = await criarVideoDescartavel(tenantId, "prova CC1 — caminho de sucesso");
  const videoFalha = await criarVideoDescartavel(tenantId, "prova CC1 — vendor recusa");
  const videoRedo = await criarVideoDescartavel(tenantId, "prova CC1 — redo");

  try {
    process.env.PROVIDER_MODE = "live";
    process.env.PROVIDER_LIVE_MAX_GENERATIONS = "8";
    resetLiveGenerationCount();

    // -------------------------------------------------------------------------
    // 1. Caminho de SUCESSO: o payload persiste, com os campos de F1 visíveis.
    // -------------------------------------------------------------------------
    const r1 = await correr(tenantId, videoSucesso, "youtube", true);
    resetLiveGenerationCount();
    if (r1.erro !== null) {
      failures.push(
        `persistência: a corrida de sucesso levantou ${JSON.stringify(String(r1.erro).slice(0, 160))} — esperado sucesso.`,
      );
    } else {
      const payload = await lerPayload(videoSucesso);
      if (!payload) {
        failures.push(
          "persistência: nenhuma linha em heygen_video_payloads para o vídeo de sucesso — o payload real de " +
            "POST /v3/videos precisa sobreviver independente do log ao vivo.",
        );
      } else {
        if (payload.fit !== "cover") {
          failures.push(`persistência: payload.fit = ${JSON.stringify(payload.fit)}, esperado "cover".`);
        }
        if (payload.aspect_ratio !== "16:9") {
          failures.push(`persistência: payload.aspect_ratio = ${JSON.stringify(payload.aspect_ratio)}, esperado "16:9" (youtube).`);
        }
        if (payload.output_format !== "mp4") {
          failures.push(`persistência: payload.output_format = ${JSON.stringify(payload.output_format)}, esperado "mp4" (F1).`);
        }
        if (payload.callback_id !== videoSucesso) {
          failures.push(
            `persistência: payload.callback_id = ${JSON.stringify(payload.callback_id)}, esperado ${JSON.stringify(videoSucesso)} — ` +
              "o MESMO video_id que a linha está indexada por (H2).",
          );
        }
      }
    }

    // -------------------------------------------------------------------------
    // 2. Caminho de FALHA: o vendor recusa (400) — a linha persiste MESMO
    //    ASSIM, porque a gravação acontece ANTES do fetch.
    // -------------------------------------------------------------------------
    const r2 = await correr(tenantId, videoFalha, "youtube", false);
    resetLiveGenerationCount();
    if (r2.erro === null) {
      failures.push("persistência: a corrida com vendor recusando deveria ter lançado erro, e não lançou.");
    } else {
      const payload = await lerPayload(videoFalha);
      if (!payload) {
        failures.push(
          "persistência: com o vendor recusando POST /v3/videos, nenhuma linha em heygen_video_payloads foi " +
            "encontrada — o payload precisa sobreviver mesmo quando a chamada falha, que é justamente quando " +
            "o log ao vivo é menos confiável de se estar olhando na hora.",
        );
      }
    }

    // -------------------------------------------------------------------------
    // 3. REDO: uma 2ª chamada para o MESMO video_id, com formato DIFERENTE,
    //    ATUALIZA o payload — não duplica, não fica parada na 1ª.
    // -------------------------------------------------------------------------
    const r3a = await correr(tenantId, videoRedo, "youtube", true);
    resetLiveGenerationCount();
    const r3b = await correr(tenantId, videoRedo, "reels_tiktok", true);
    resetLiveGenerationCount();
    if (r3a.erro !== null || r3b.erro !== null) {
      failures.push(
        `persistência: a prova de redo levantou erro inesperado (1ª: ${JSON.stringify(String(r3a.erro).slice(0, 100))}, ` +
          `2ª: ${JSON.stringify(String(r3b.erro).slice(0, 100))}) — esperado sucesso nas duas.`,
      );
    } else {
      const payloadFinal = await lerPayload(videoRedo);
      if (!payloadFinal) {
        failures.push("persistência: nenhuma linha em heygen_video_payloads depois do redo.");
      } else if (payloadFinal.aspect_ratio !== "9:16") {
        failures.push(
          `persistência: depois do redo (youtube → reels_tiktok), payload.aspect_ratio = ` +
            `${JSON.stringify(payloadFinal.aspect_ratio)}, esperado "9:16" — o payload gravado não refletiu a 2ª ` +
            "chamada (ficou parado no formato da 1ª).",
        );
      }
    }
  } finally {
    resetLiveGenerationCount();
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
    if (tetoOriginal === undefined) delete process.env.PROVIDER_LIVE_MAX_GENERATIONS;
    else process.env.PROVIDER_LIVE_MAX_GENERATIONS = tetoOriginal;
    // DELETE em `videos` cascateia para `heygen_video_payloads` (FK ON DELETE
    // CASCADE, migration 079) — não há limpeza separada a fazer nessa tabela.
    await pool.query("DELETE FROM videos WHERE id = ANY($1)", [[videoSucesso, videoFalha, videoRedo]]);
  }

  if (failures.length === 0) {
    notes.push(
      "  persistência: POST /v3/videos grava payload real em heygen_video_payloads (fit/aspect_ratio/output_format/callback_id conferidos)",
    );
    notes.push("  persistência: a linha sobrevive mesmo quando o vendor recusa a chamada (gravada ANTES do fetch)");
    notes.push("  persistência: uma 2ª chamada (redo) para o mesmo video_id ATUALIZA o payload, não duplica nem fica parada na 1ª");
  }

  return { failures, notes };
}
