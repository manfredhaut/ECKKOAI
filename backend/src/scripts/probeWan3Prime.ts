/**
 * Sonda manual, descartável — RODADA 20, 31/08/2026.
 *
 * UMA chamada real a `alibaba/wan-3.0-prime/reference-to-video` — fora do
 * pipeline de produção de propósito (mesmo raciocínio da RODADA 18: este
 * endpoint não está em `ENDPOINT_CATALOG`, e `falSubmit` recusaria antes
 * do fetch; adicioná-lo ao catálogo seria mudança de código de produção,
 * proibida nesta rodada). Fala com a fila da fal DIRETO.
 *
 * Objetivo: comparar Wan 3.0 Prime (vídeo único de 24s, sem fracionar por
 * blocos) contra o pipeline de blocos atual (Wan 2.6, 3 blocos + concat).
 *
 * Preço MEDIDO na documentação oficial da fal.ai (RODADA 19):
 * US$0,068/s a 480p — 24s = US$1,632.
 *
 *   docker compose exec backend npx tsx src/scripts/probeWan3Prime.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { pool } from "../db/pool.js";
import { getCredentialForVendor } from "../services/credentialLookup.js";
import { resolveTenantAvatarFalKey } from "../services/providers/platformKeys.js";
import { falUpload } from "../services/providers/falClient.js";

const TENANT_ID = "c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd";
const FOTO_NOVA_PATH = "/tmp/v13-foto-nova.png";
const COMPOSICAO_2_URL = "https://v3b.fal.media/files/b/0aa87c2a/invwgbw2J0_v3jahS3Y1j_jPD6Kvvf.png";
const ENDPOINT = "alibaba/wan-3.0-prime/reference-to-video";
const QUEUE_BASE = "https://queue.fal.run";

const PROMPT =
  "The person shown in Image 1 (the reference face) appears in the scene, setting, and outfit shown in " +
  "Image 2 — a neon-lit corridor with pink and blue vertical light strips, wearing a denim jacket with an " +
  "embroidered scarf. The video is one continuous, unbroken take, no cuts: it begins with the person " +
  "seated with a firm, upright posture, looking directly into the camera lens and speaking with an " +
  'inspiring, authoritative tone: "Inovar não é criar o futuro, é transformar o agora." The person then ' +
  "stands up with dynamic energy and strides firmly toward the camera, filling the frame with a strong " +
  'presence, speaking with conviction: "Rompa o tradicional, use a tecnologia a seu favor e lidere o ' +
  'mercado." The person continues into a tight close-up, extending one hand forward in an inviting ' +
  "gesture while holding a bold, confident gaze into the lens, delivering the final line: \"Mude o seu " +
  'negócio hoje mesmo de vez!" single continuous framing, one person only, no split screen, no duplicated ' +
  "character, no morphing, keep the neon corridor background throughout, visible natural skin texture, " +
  "thin gray hair visible at both temples exactly as in the reference photo, camera locked, no captions, no text";

async function main() {
  const avatarCredential = await getCredentialForVendor(TENANT_ID, "avatar", "fal");
  if (!avatarCredential) throw new Error("credencial fal indisponível");
  const chaveFal = await resolveTenantAvatarFalKey(avatarCredential.apiKey);

  const fotoBase = await readFile(FOTO_NOVA_PATH);
  console.log("uploading foto de rosto...");
  const fotoUrl = await falUpload(chaveFal.apiKey, fotoBase, "image/png");
  console.log("Image 1 (rosto):", fotoUrl);
  console.log("Image 2 (cena/traje):", COMPOSICAO_2_URL);

  const corpo = {
    prompt: PROMPT,
    reference_image_urls: [fotoUrl, COMPOSICAO_2_URL],
    duration: 24,
    resolution: "480p",
    aspect_ratio: "16:9",
    audio: false,
  };

  console.log("\nprompt:\n", PROMPT);
  console.log("\nSubmetendo a", ENDPOINT, "...");

  const submitRes = await fetch(`${QUEUE_BASE}/${ENDPOINT}`, {
    method: "POST",
    headers: { authorization: `Key ${chaveFal.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  console.log("HTTP", submitRes.status, submitRes.statusText);
  const submitText = await submitRes.text();
  console.log("corpo:", submitText);
  if (!submitRes.ok) {
    console.log("\n⚠️ PARANDO — submissão falhou.");
    return;
  }

  const submitData = JSON.parse(submitText);
  const requestId = submitData.request_id;
  const statusUrl = submitData.status_url as string;
  const responseUrl = submitData.response_url as string;
  console.log("\nrequest_id (já custa a partir daqui):", requestId);

  const limite = Date.now() + 480_000;
  let tentativas = 0;
  for (;;) {
    const statusRes = await fetch(statusUrl, { headers: { authorization: `Key ${chaveFal.apiKey}` } });
    const statusData = await statusRes.json();
    tentativas += 1;
    console.log(`[tentativa ${tentativas}] status:`, statusData.status, statusData.queue_position ?? "");
    if (statusData.status === "COMPLETED") break;
    if (statusData.status === "ERROR" || statusRes.status >= 400) {
      console.log("ERRO:", JSON.stringify(statusData));
      return;
    }
    if (Date.now() >= limite) {
      console.log("timeout esperando conclusão — request_id acima é o ponteiro, não perdido.");
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  const resultRes = await fetch(responseUrl, { headers: { authorization: `Key ${chaveFal.apiKey}` } });
  const resultData = await resultRes.json();
  console.log("\n✓ resultado bruto:", JSON.stringify(resultData, null, 2));

  const videoUrl = resultData?.video?.url;
  if (!videoUrl) {
    console.log("\n⚠️ Não achei URL de vídeo no resultado.");
    return;
  }
  const vid = await fetch(videoUrl);
  const buf = Buffer.from(await vid.arrayBuffer());
  await writeFile("/tmp/v20-wan3-resultado.mp4", buf);
  console.log("\nvídeo salvo em /tmp/v20-wan3-resultado.mp4 (", buf.length, "bytes )");
  console.log("duração reportada:", resultData?.duration);
  console.log("custo real esperado: 24 x US$0,068 = US$1,632 (480p)");
}

main()
  .catch((err) => {
    console.error("FALHOU:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
