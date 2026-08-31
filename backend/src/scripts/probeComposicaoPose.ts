/**
 * Sonda manual, descartável — RODADA 2, 29/08/2026.
 *
 * Testa as DUAS mudanças desta rodada com uma composição+animação REAIS,
 * ponta a ponta até `animar` (`pararApos: "animar"`), pelo orquestrador de
 * verdade (`runFalPipeline`), com a Interpretação real passando pelo mesmo
 * `promptDeComposicaoPosicional` que o produto usa:
 *
 *   1. A cláusula de POSE (`direcaoTexto`, videoScene.ts) — a Interpretação
 *      pede um início com os braços cruzados sobre o peito. Se a cláusula
 *      funcionar, a IMAGEM COMPOSTA (não o vídeo) deve mostrar isso. Prova
 *      exigida pela regra permanente do CLAUDE.md: abrir a imagem de
 *      verdade e descrever o que se vê, fixture não conta.
 *   2. `negative_prompt` no corpo do Wan (`corpoAnimarWan`) — confirmar que
 *      o fornecedor aceita o campo (sem 422) e observar se os artefatos que
 *      ele lista (traço de desenho, pele plástica, legenda queimada) somem
 *      do clipe de 5 s.
 *
 * NÃO narra nem sincroniza — nenhuma das duas mudanças desta rodada toca
 * voz, e pular narrar+sincronizar evita o custo do ElevenLabs+lipsync numa
 * prova que não precisa deles.
 *
 * Avatar real: "Teste de telas de confirmação" (741c02d1), traje só por
 * TEXTO (outfit_prompt, sem imagem), lateral incluída como referência.
 * Roteiro de 23 caracteres — cabe no bucket de 5 s (teto 47).
 *
 * Custo esperado: compor (US$0,08) + animar 5s Wan (US$0,025 × 5 = US$0,125)
 * = US$0,205.
 *
 *   docker compose exec backend npx tsx src/scripts/probeComposicaoPose.ts
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

const AVATAR_ID = "741c02d1-8342-4414-81ff-30af958ab0a2";
const SCRIPT = "Ola, tudo bem com voce?"; // 23 caracteres — bucket de 5 s

// Em INGLÊS: chega assim à Interpretação real (motion_prompt_en) antes de
// custar (directionTranslation.ts, na rota) — aqui simulado direto, já
// traduzido, porque a sonda não passa pela rota.
const DIRECAO_EN =
  "She starts with her arms crossed confidently over her chest and a calm, serious expression, then " +
  "uncrosses her arms and gestures naturally at chest height while speaking.";

async function main() {
  const { rows: avatarRows } = await pool.query("SELECT * FROM avatars WHERE id = $1", [AVATAR_ID]);
  const avatar = avatarRows[0];
  if (!avatar) throw new Error(`avatar ${AVATAR_ID} não encontrado`);
  console.log("avatar:", avatar.id, avatar.name, "| tenant:", avatar.tenant_id);
  console.log("outfit_prompt:", avatar.outfit_prompt);

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

  const ladoDireitoUrl = photoUrls[1];
  const entradasExtras: EntradaDeComposicao[] = [];
  if (ladoDireitoUrl) {
    entradasExtras.push({
      rotulo: "lado_direito",
      bytes: await readUpload(ladoDireitoUrl),
      mimeType: mimeDoUpload(ladoDireitoUrl),
    });
  }

  // A MESMA função que `avatarProvider.ts`/`routes/videos.ts` usam em
  // produção — não uma reimplementação da sonda.
  const promptDeComposicao = promptDeComposicaoPosicional({
    temCenario: false,
    cenarioTexto: null,
    temTraje: Boolean(avatar.outfit_prompt),
    trajeTexto: avatar.outfit_prompt,
    temLateral: Boolean(ladoDireitoUrl),
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
    pararApos: "animar",
    tier: "normal",
  });

  console.log("\n✓ CORRIDA CONCLUÍDA (parou em animar, de propósito)");
  console.log("imagemCompostaUrl:", resultado.imagemCompostaUrl);
  console.log("videoMudoUrl:", resultado.videoMudoUrl);
  console.log("duracaoSegundos:", resultado.duracaoSegundos);
  console.log("gastoPrevistoUsd:", resultado.gastoPrevistoUsd);
  console.log("requestIds:", JSON.stringify(resultado.requestIds));

  // Baixa os dois artefatos AGORA — as URLs da fal expiram.
  if (resultado.imagemCompostaUrl) {
    const img = await fetch(resultado.imagemCompostaUrl);
    const buf = Buffer.from(await img.arrayBuffer());
    await writeFile("/tmp/pose-imagem-composta.png", buf);
    console.log("imagem composta salva em /tmp/pose-imagem-composta.png (", buf.length, "bytes )");
  }
  if (resultado.videoMudoUrl) {
    const vid = await fetch(resultado.videoMudoUrl);
    const buf = Buffer.from(await vid.arrayBuffer());
    await writeFile("/tmp/pose-video-mudo.mp4", buf);
    console.log("vídeo mudo salvo em /tmp/pose-video-mudo.mp4 (", buf.length, "bytes )");
  }
}

main()
  .catch((err) => {
    console.error("FALHOU:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
