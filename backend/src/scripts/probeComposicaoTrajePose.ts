/**
 * Sonda manual, descartável — teste de aceite do Bug D revisto (29/08/2026).
 *
 * Reusa o MESMO par cenário+traje que já provou o defeito duas vezes neste
 * projeto (vídeo 134bc164, avatar 7557957c: corredor neon + jaqueta jeans
 * com echarpe) — a foto de traje mostra a pessoa encostada numa parede,
 * segurando uma bolsinha vermelha, perna cruzada. Testa se a correção em
 * `promptDeComposicaoPosicional` (videoScene.ts) faz a composição:
 *   1. vestir SÓ a roupa da referência (jaqueta, echarpe)
 *   2. IGNORAR a pose/bolsa da foto de traje
 *   3. usar a pose do PRIMEIRO PLANO do roteiro ("sentado") em vez disso
 *
 * `pararApos: "compor"` — só a imagem composta importa para este teste.
 * Custo esperado: US$ 0,08 (só `compor`).
 *
 *   docker compose exec backend npx tsx src/scripts/probeComposicaoTrajePose.ts
 */
import { writeFile } from "node:fs/promises";
import { pool } from "../db/pool.js";
import { getCredential, getCredentialForVendor } from "../services/credentialLookup.js";
import { resolveTenantAvatarFalKey } from "../services/providers/platformKeys.js";
import { voiceTuningDoAvatar } from "../services/voice/voiceTuning.js";
import { readUpload, mimeDoUpload } from "../services/storage.js";
import { promptDeComposicaoPosicional } from "../services/providers/videoScene.js";
import { runFalPipeline, type EntradaDeComposicao } from "../services/video/falPipeline.js";
import { criarDiarioNoBanco, abrirCorrida } from "../services/video/falPipelineJournal.js";

const AVATAR_ID = "7557957c-d22f-4fba-a1e0-c19f07f47536";
const OUTFIT_URL = "/uploads/c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd/034622f5-2442-4a51-9afb-678f4a9ff9a1.png";
const SCENARIO_URL = "/uploads/c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd/43c57fd4-6f38-46b8-b59b-a0526c26d124.png";
const SCRIPT = "Hoje eu vou te mostrar algo novo."; // curto, so para caber no bloco de 5s

// Plano 1 do roteiro, em INGLÊS (como chega de verdade após a tradução).
const DIRECAO_EN =
  "She is seated in a chair, hands resting calmly, looking at the camera with a warm expression.";

async function main() {
  const { rows: avatarRows } = await pool.query("SELECT * FROM avatars WHERE id = $1", [AVATAR_ID]);
  const avatar = avatarRows[0];
  if (!avatar) throw new Error(`avatar ${AVATAR_ID} não encontrado`);
  console.log("avatar:", avatar.id, avatar.name, "| tenant:", avatar.tenant_id);

  const avatarCredential = await getCredentialForVendor(avatar.tenant_id, "avatar", "fal");
  const voiceCredential = await getCredential(avatar.tenant_id, "voice");
  if (!avatarCredential || !voiceCredential) {
    throw new Error("credencial fal/voz indisponível para este tenant");
  }
  const chaveFal = await resolveTenantAvatarFalKey(avatarCredential.apiKey);

  const photoUrls: string[] = avatar.photo_urls ?? [];
  const fotoUrl = photoUrls[0];
  if (!fotoUrl) throw new Error("avatar sem foto de rosto");
  const fotoBase = await readUpload(fotoUrl);

  const entradasExtras: EntradaDeComposicao[] = [
    { rotulo: "cenario", bytes: await readUpload(SCENARIO_URL), mimeType: mimeDoUpload(SCENARIO_URL) },
    { rotulo: "traje", bytes: await readUpload(OUTFIT_URL), mimeType: mimeDoUpload(OUTFIT_URL) },
  ];

  const promptDeComposicao = promptDeComposicaoPosicional({
    temCenario: true,
    cenarioTexto: null,
    temTraje: true,
    trajeTexto: null,
    temLateral: false,
    direcaoTexto: DIRECAO_EN,
  });
  console.log("\npromptDeComposicao (o que vai ao nano-banana-2/edit):\n", promptDeComposicao);

  const runId = await abrirCorrida({
    tenantId: avatar.tenant_id,
    script: SCRIPT,
    targetSeconds: 5,
    charsPerSecond: 10.89,
  });
  console.log("\ncorrida:", runId);

  const resultado = await runFalPipeline({
    apiKeyFal: chaveFal.apiKey,
    apiKeyElevenLabs: voiceCredential.apiKey,
    voiceId: avatar.voice_id ?? "",
    voiceTuning: voiceTuningDoAvatar(avatar),
    script: SCRIPT,
    fotoBase,
    fotoMimeType: mimeDoUpload(fotoUrl),
    entradasExtras,
    promptDeComposicao,
    tenantId: avatar.tenant_id,
    promptDeDirecao: DIRECAO_EN,
    diario: criarDiarioNoBanco(runId),
    pararApos: "compor",
    tier: "normal",
  });

  console.log("\n✓ CORRIDA CONCLUÍDA (parou em compor, de propósito)");
  console.log("imagemCompostaUrl:", resultado.imagemCompostaUrl);
  console.log("gastoPrevistoUsd:", resultado.gastoPrevistoUsd);

  if (resultado.imagemCompostaUrl) {
    const img = await fetch(resultado.imagemCompostaUrl);
    const buf = Buffer.from(await img.arrayBuffer());
    await writeFile("/tmp/teste-aceite-traje-pose.png", buf);
    console.log("imagem composta salva em /tmp/teste-aceite-traje-pose.png (", buf.length, "bytes )");
  }
}

main()
  .catch((err) => {
    console.error("FALHOU:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
