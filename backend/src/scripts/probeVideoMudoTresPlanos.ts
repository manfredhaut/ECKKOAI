/**
 * Sonda manual, descartável — RODADA 4, 29/08/2026, Parte 3.
 *
 * Gera o VÍDEO MUDO completo (compor + animar 3 blocos + concatenar com
 * xfade) para aprovação — SEM narrar, SEM sincronizar (`pararApos: "animar"`,
 * a mesma trava que o produto usa entre a Aprovação Nº1 e a Nº2).
 *
 * Testa, de ponta a ponta, tudo que a Rodada 4 tocou:
 *   Item 1 — fracionamento: 3 frases → 3 blocos, um por plano
 *   Item 2 — wan/v2.6/reference-to-video/flash, cada bloco referenciando a
 *            MESMA imagem composta (sem encadeamento de último quadro)
 *   Item 4 — xfade na emenda entre os 3 blocos
 *   Item 5 — negative_prompt no corpo de cada bloco
 *   Item 8 — assertAspectRatio no vídeo concatenado final
 *
 * Reusa cenário+traje JÁ APROVADOS no teste de aceite anterior desta mesma
 * sessão (corredor neon + jaqueta jeans com echarpe, SEM a bolsa vermelha —
 * ver `probeComposicaoTrajePose.ts`).
 *
 *   docker compose exec backend npx tsx src/scripts/probeVideoMudoTresPlanos.ts
 */
import { writeFile } from "node:fs/promises";
import { pool } from "../db/pool.js";
import { getCredential, getCredentialForVendor } from "../services/credentialLookup.js";
import { resolveTenantAvatarFalKey } from "../services/providers/platformKeys.js";
import { voiceTuningDoAvatar } from "../services/voice/voiceTuning.js";
import { readUpload, mimeDoUpload } from "../services/storage.js";
import { promptDeComposicaoPosicional } from "../services/providers/videoScene.js";
import { fracionarRoteiro, janelasDosBlocos, formatarJanela } from "../services/video/scriptFractioning.js";
import { runFalPipeline, type EntradaDeComposicao } from "../services/video/falPipeline.js";
import { criarDiarioNoBanco, abrirCorrida } from "../services/video/falPipelineJournal.js";

const AVATAR_ID = "7557957c-d22f-4fba-a1e0-c19f07f47536";
const OUTFIT_URL = "/uploads/c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd/034622f5-2442-4a51-9afb-678f4a9ff9a1.png";
const SCENARIO_URL = "/uploads/c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd/43c57fd4-6f38-46b8-b59b-a0526c26d124.png";
const ASPECT_RATIO = "16:9";

// O ROTEIRO (fala) — 3 frases, uma por plano. Tamanho calibrado para separar
// em 3 blocos (cada frase perto do teto de um bloco, então a próxima nunca
// cabe junto — ver fracionarRoteiro, empacotamento guloso por frase).
const ROTEIRO =
  "Hoje eu quero te contar algo muito importante sobre os planos da nossa empresa para este ano. " +
  "Chegou a hora de darmos um passo alem, com coragem e determinacao total, sem medo nenhum. " +
  "Junte-se a nos nessa jornada incrivel que esta apenas comecando agora mesmo.";

// A INTERPRETAÇÃO de cada plano, em INGLÊS (como chega de verdade após a
// tradução) — UM item por plano, na MESMA ordem do roteiro.
//
// Plano 3 CORRIGIDO em 29/08 (Item 2 da rodada de correções pós-vídeo-mudo).
// ANTES: "Now close to the camera, she reaches out with one hand as if
// inviting the viewer, finishing with a warm, confident look." — não dizia
// que ela já estava em pé, e o vídeo real mostrou o Wan herdando de volta a
// pose SENTADA da imagem de referência (fixa, igual em todo bloco), em vez
// de continuar o "em pé" que o plano 2 já tinha estabelecido. DEPOIS: a
// linha abre restabelecendo o estado corporal explicitamente, do jeito que
// `buildSystemPrompt` (directionTranslation.ts) agora exige de toda
// tradução segmentada — aqui escrito à mão porque esta sonda nunca passa
// pelo tradutor (monta `PLANOS_EN` direto, ver `direcaoComMarcadores`
// abaixo).
const PLANOS_EN = [
  "She is seated in a chair, calm and composed, hands resting on her lap, looking directly at the camera.",
  "She stands up from the chair with energy and takes a few confident steps forward, gaining presence.",
  "She is already standing, now close to the camera, and reaches out with one hand as if inviting the viewer, finishing with a warm, confident look.",
];

async function main() {
  const { rows: avatarRows } = await pool.query("SELECT * FROM avatars WHERE id = $1", [AVATAR_ID]);
  const avatar = avatarRows[0];
  if (!avatar) throw new Error(`avatar ${AVATAR_ID} não encontrado`);
  console.log("avatar:", avatar.id, avatar.name, "| tenant:", avatar.tenant_id);

  // --- Item 1: fracionamento — confere ANTES de gastar um centavo ---------
  const blocos = fracionarRoteiro(ROTEIRO);
  console.log(`\nblocos: ${blocos.length} (esperado ${PLANOS_EN.length}, um por plano)`);
  blocos.forEach((b, i) => console.log(`  bloco ${i}: ${b.duracaoEscolhida}s — "${b.texto}"`));
  if (blocos.length !== PLANOS_EN.length) {
    throw new Error(
      `ROTEIRO produziu ${blocos.length} blocos, esperado ${PLANOS_EN.length} (um por plano) — ajuste o ` +
        "tamanho das frases antes de gastar.",
    );
  }
  const janelas = janelasDosBlocos(blocos);
  const segundosTotais = blocos.reduce((s, b) => s + b.duracaoEscolhida, 0);
  console.log(`segundos totais (animação): ${segundosTotais}s`);

  // A direção COM marcadores — construída por POSIÇÃO, nunca por texto colado
  // à mão, para não arriscar desalinhamento entre janela e plano.
  const direcaoComMarcadores = janelas.map((j, i) => `${formatarJanela(j)} ${PLANOS_EN[i]}`).join(" ");
  console.log("\nInterpretação com marcadores:\n", direcaoComMarcadores);

  // --- Estimativa de custo ANTES de qualquer chamada -----------------------
  const custoComporUsd = 0.08;
  const custoAnimarUsd = segundosTotais * 0.025;
  const estimativaUsd = custoComporUsd + custoAnimarUsd;
  console.log(
    `\nESTIMATIVA: compor US$${custoComporUsd.toFixed(2)} + animar ${segundosTotais}s × US$0,025 = ` +
      `US$${custoAnimarUsd.toFixed(3)} → TOTAL ≈ US$${estimativaUsd.toFixed(3)}`,
  );

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

  // A MESMA função de produção — o plano 1 ("sentado") é quem decide a pose
  // inicial da composição, igual ao teste de aceite anterior.
  const promptDeComposicao = promptDeComposicaoPosicional({
    temCenario: true,
    cenarioTexto: null,
    temTraje: true,
    trajeTexto: null,
    temLateral: false,
    direcaoTexto: PLANOS_EN[0],
  });
  console.log("\npromptDeComposicao:\n", promptDeComposicao);

  const runId = await abrirCorrida({
    tenantId: avatar.tenant_id,
    script: ROTEIRO,
    targetSeconds: segundosTotais,
    charsPerSecond: 10.89,
  });
  console.log("\ncorrida:", runId);

  const resultado = await runFalPipeline({
    apiKeyFal: chaveFal.apiKey,
    apiKeyElevenLabs: voiceCredential.apiKey,
    voiceId: avatar.voice_id ?? "",
    voiceTuning: voiceTuningDoAvatar(avatar),
    script: ROTEIRO,
    fotoBase,
    fotoMimeType: mimeDoUpload(fotoUrl),
    entradasExtras,
    promptDeComposicao,
    tenantId: avatar.tenant_id,
    promptDeDirecao: direcaoComMarcadores,
    aspectRatio: ASPECT_RATIO as never,
    diario: criarDiarioNoBanco(runId),
    pararApos: "animar",
    tier: "normal",
  });

  console.log("\n✓ CORRIDA CONCLUÍDA (parou em animar, de propósito — vídeo MUDO)");
  console.log("imagemCompostaUrl:", resultado.imagemCompostaUrl);
  console.log("videoMudoUrl:", resultado.videoMudoUrl);
  console.log("duracaoSegundos (do ÚLTIMO bloco, campo legado):", resultado.duracaoSegundos);
  console.log("gastoPrevistoUsd REAL:", resultado.gastoPrevistoUsd);
  console.log("requestIds:", JSON.stringify(resultado.requestIds));

  if (resultado.imagemCompostaUrl) {
    const img = await fetch(resultado.imagemCompostaUrl);
    const buf = Buffer.from(await img.arrayBuffer());
    await writeFile("/tmp/video-mudo-3planos-imagem.png", buf);
    console.log("imagem composta salva em /tmp/video-mudo-3planos-imagem.png (", buf.length, "bytes )");
  }
  if (resultado.videoMudoUrl) {
    const vid = await fetch(resultado.videoMudoUrl);
    const buf = Buffer.from(await vid.arrayBuffer());
    await writeFile("/tmp/video-mudo-3planos.mp4", buf);
    console.log("vídeo mudo salvo em /tmp/video-mudo-3planos.mp4 (", buf.length, "bytes )");
  }
}

main()
  .catch((err) => {
    console.error("FALHOU:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
