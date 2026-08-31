/**
 * Sonda manual, descartável — RODADA 18, 31/08/2026.
 *
 * Teste ISOLADO de `easel-ai/advanced-face-swap` (provedor diferente na
 * mesma plataforma fal) — fora do pipeline de produção de propósito.
 *
 * `falSubmit` (falClient.ts) recusa qualquer endpoint fora de
 * `ENDPOINT_CATALOG` (endpointCatalog.ts) ANTES do fetch — é a proteção
 * que garante que a fal só é chamada por um endpoint já documentado e
 * tarifado no nosso catálogo. Adicionar `easel-ai/advanced-face-swap` a
 * esse catálogo É mudança de código de produção, proibida nesta rodada.
 * Por isso esta sonda fala com a fila da fal DIRETO (fetch cru), sem
 * passar por `falSubmit`/o catálogo — nenhum arquivo de produção é
 * tocado, nenhum avatar/vídeo é modificado.
 *
 * Custo esperado: teto autorizado US$ 0,05, uma única chamada.
 *
 *   docker compose exec backend npx tsx src/scripts/probeFaceSwapEaselAi.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { pool } from "../db/pool.js";
import { getCredentialForVendor } from "../services/credentialLookup.js";
import { resolveTenantAvatarFalKey } from "../services/providers/platformKeys.js";
import { falUpload } from "../services/providers/falClient.js";

const TENANT_ID = "c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd";
const FOTO_NOVA_PATH = "/tmp/v13-foto-nova.png";
const COMPOSICAO_2_URL = "https://v3b.fal.media/files/b/0aa87c2a/invwgbw2J0_v3jahS3Y1j_jPD6Kvvf.png";
const ENDPOINT = "easel-ai/advanced-face-swap";
const QUEUE_BASE = "https://queue.fal.run";

async function main() {
  const avatarCredential = await getCredentialForVendor(TENANT_ID, "avatar", "fal");
  if (!avatarCredential) throw new Error("credencial fal indisponível para este tenant");
  const chaveFal = await resolveTenantAvatarFalKey(avatarCredential.apiKey);

  const fotoBase = await readFile(FOTO_NOVA_PATH);
  console.log("uploading face_image_0...");
  const faceImageUrl = await falUpload(chaveFal.apiKey, fotoBase, "image/png");
  console.log("face_image_0 URL:", faceImageUrl);

  const corpo = {
    face_image_0: faceImageUrl,
    gender_0: "male",
    target_image: COMPOSICAO_2_URL,
    workflow_type: "user_hair",
    upscale: true,
  };

  console.log("\nSubmetendo a", ENDPOINT, "com corpo:", JSON.stringify(corpo, null, 2));

  const submitRes = await fetch(`${QUEUE_BASE}/${ENDPOINT}`, {
    method: "POST",
    headers: { authorization: `Key ${chaveFal.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });

  console.log("\nHTTP", submitRes.status, submitRes.statusText);
  const submitText = await submitRes.text();
  console.log("corpo da resposta:", submitText);

  if (submitRes.status === 403 || submitRes.status === 404) {
    console.log("\n⚠️ PARANDO — endpoint não acessível (403/404), conforme guardrail do item 1.");
    return;
  }
  if (!submitRes.ok) {
    console.log("\n⚠️ PARANDO — resposta não-OK inesperada.");
    return;
  }

  const submitData = JSON.parse(submitText);
  const requestId = submitData.request_id;
  const statusUrl = submitData.status_url as string;
  const responseUrl = submitData.response_url as string;
  console.log("\nrequest_id (já pode custar a partir daqui):", requestId);

  const limite = Date.now() + 300_000;
  let tentativas = 0;
  for (;;) {
    const statusRes = await fetch(statusUrl, { headers: { authorization: `Key ${chaveFal.apiKey}` } });
    const statusData = await statusRes.json();
    tentativas += 1;
    console.log(`[tentativa ${tentativas}] status:`, statusData.status);
    if (statusData.status === "COMPLETED") break;
    if (statusData.status === "ERROR" || statusRes.status >= 400) {
      console.log("ERRO na fila:", JSON.stringify(statusData));
      return;
    }
    if (Date.now() >= limite) {
      console.log("timeout esperando conclusão.");
      return;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }

  const resultRes = await fetch(responseUrl, { headers: { authorization: `Key ${chaveFal.apiKey}` } });
  const resultData = await resultRes.json();
  console.log("\n✓ resultado bruto:", JSON.stringify(resultData, null, 2));

  const imageUrl = resultData?.image?.url ?? resultData?.images?.[0]?.url;
  if (!imageUrl) {
    console.log("\n⚠️ Não achei URL de imagem no resultado — inspecionar o JSON acima.");
    return;
  }
  const img = await fetch(imageUrl);
  const buf = Buffer.from(await img.arrayBuffer());
  await writeFile("/tmp/v18-faceswap-resultado.png", buf);
  console.log("\nimagem salva em /tmp/v18-faceswap-resultado.png (", buf.length, "bytes )");
}

main()
  .catch((err) => {
    console.error("FALHOU:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
