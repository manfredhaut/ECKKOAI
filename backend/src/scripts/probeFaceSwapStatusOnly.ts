/**
 * Sonda descartável — RODADA 18b. Só CONSULTA o status de um job JÁ
 * SUBMETIDO na RODADA 18 (`probeFaceSwapEaselAi.ts`). Nenhuma submissão
 * nova — GET de status é leitura, não uma segunda chamada paga.
 *
 * Loop de até 10 checagens, 1 por minuto (10 minutos de teto). Se
 * completar, baixa a imagem. Se não completar, tenta cancelar
 * (`cancel_url`, também GET/POST sem custo documentado) e desiste.
 */
import { writeFile } from "node:fs/promises";
import { pool } from "../db/pool.js";
import { getCredentialForVendor } from "../services/credentialLookup.js";
import { resolveTenantAvatarFalKey } from "../services/providers/platformKeys.js";

const TENANT_ID = "c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd";
const REQUEST_ID = "01a05591-741b-78d2-b6e2-bbe0724a09fa";
const STATUS_URL = `https://queue.fal.run/easel-ai/advanced-face-swap/requests/${REQUEST_ID}/status`;
const RESPONSE_URL = `https://queue.fal.run/easel-ai/advanced-face-swap/requests/${REQUEST_ID}`;
const CANCEL_URL = `https://queue.fal.run/easel-ai/advanced-face-swap/requests/${REQUEST_ID}/cancel`;
const MAX_TENTATIVAS = 10;
const INTERVALO_MS = 60_000;

async function main() {
  const avatarCredential = await getCredentialForVendor(TENANT_ID, "avatar", "fal");
  if (!avatarCredential) throw new Error("credencial fal indisponível");
  const chaveFal = await resolveTenantAvatarFalKey(avatarCredential.apiKey);
  const headers = { authorization: `Key ${chaveFal.apiKey}` };

  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS; tentativa++) {
    const statusRes = await fetch(STATUS_URL, { headers });
    const statusText = await statusRes.text();
    const agora = new Date().toISOString();
    console.log(`[${agora}] tentativa ${tentativa}/${MAX_TENTATIVAS}:`, statusText);

    if (statusText.includes("COMPLETED")) {
      const resultRes = await fetch(RESPONSE_URL, { headers });
      const resultData = await resultRes.json();
      console.log("\n✓ resultado bruto:", JSON.stringify(resultData, null, 2));

      const imageUrl = resultData?.image?.url ?? resultData?.images?.[0]?.url;
      if (!imageUrl) {
        console.log("\n⚠️ Não achei URL de imagem no resultado.");
        return;
      }
      const img = await fetch(imageUrl);
      const buf = Buffer.from(await img.arrayBuffer());
      await writeFile("/tmp/v18-faceswap-resultado.png", buf);
      console.log("\nimagem salva em /tmp/v18-faceswap-resultado.png (", buf.length, "bytes )");
      return;
    }

    if (statusText.includes("ERROR") || statusRes.status >= 400) {
      console.log("\n⚠️ ERRO reportado pela fila — parando, não é timeout.");
      return;
    }

    if (tentativa < MAX_TENTATIVAS) {
      await new Promise((r) => setTimeout(r, INTERVALO_MS));
    }
  }

  console.log("\n⚠️ TIMEOUT — 10 minutos sem concluir. Tentando cancelar...");
  try {
    const cancelRes = await fetch(CANCEL_URL, { method: "PUT", headers });
    console.log("cancel_url respondeu:", cancelRes.status, await cancelRes.text());
  } catch (err) {
    console.log("falha ao tentar cancelar:", err instanceof Error ? err.message : err);
  }
  console.log("\nABANDONADO POR TIMEOUT.");
}

main()
  .catch((err) => {
    console.error("FALHOU:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
