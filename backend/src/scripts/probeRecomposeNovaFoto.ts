/**
 * Sonda manual, descartável — RODADA 16, 31/08/2026.
 *
 * Recompõe a imagem do avatar "TESTE REAL 15:40 01/08" usando a foto de
 * rosto de alta resolução (1200×1599, `FOTO AVATAR TESTE MANFRED.png`),
 * reaproveitando cenário e traje já aprovados (corredor neon + jaqueta
 * jeans com echarpe, vídeo `7e943007`). NÃO altera `avatars.photo_urls`.
 *
 * TRÊS composições em PARALELO, mesmo prompt nas três (mesma técnica de
 * `Promise.all` de `runFalPipeline`, cada uma sua própria corrida/diário) —
 * o objetivo é dar ao operador 3 amostras para escolher, não decidir por
 * conta própria.
 *
 * Histórico da frase de cabelo (achado da RODADA 12 — a composição original
 * "arredondou" o cabelo lateral fino e grisalho para careca total):
 *   RODADA 13 — "not fully bald, natural receding hairline": remendo
 *   demarcado demais.
 *   RODADA 13b — frase mais contida: voltou a zerar o cabelo por completo.
 *   RODADA 16 — meio-termo pedido pelo operador: fios esparsos e visíveis,
 *   sem negar a careca nem prometer linha do cabelo.
 *
 * Frase de pele: a ORIGINAL (RODADA 11/V11), não a diluída da V15 — desta
 * vez aplicada na COMPOSIÇÃO (nas rodadas 13/13b só a de cabelo entrava
 * aqui; a de pele só tinha sido usada na etapa de ANIMAR).
 *
 * Custo esperado: 3 × compor (US$0,08) = US$0,24.
 *
 *   docker compose exec backend npx tsx src/scripts/probeRecomposeNovaFoto.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { pool } from "../db/pool.js";
import { getCredential, getCredentialForVendor } from "../services/credentialLookup.js";
import { resolveTenantAvatarFalKey } from "../services/providers/platformKeys.js";
import { voiceTuningDoAvatar } from "../services/voice/voiceTuning.js";
import { readUpload, mimeDoUpload } from "../services/storage.js";
import { promptDeComposicaoPosicional } from "../services/providers/videoScene.js";
import { direcaoDoPrimeiroBloco } from "../services/video/scriptFractioning.js";
import { runFalPipeline, type EntradaDeComposicao } from "../services/video/falPipeline.js";
import { criarDiarioNoBanco, abrirCorrida } from "../services/video/falPipelineJournal.js";
import type { AspectRatio } from "../services/providers/videoFormat.js";

const AVATAR_ID = "7557957c-d22f-4fba-a1e0-c19f07f47536";
const VIDEO_ID_REFERENCIA = "7e943007-e3c9-4442-80fb-9a6f59165b81"; // cenário/traje já aprovados
const FOTO_NOVA_PATH = "/tmp/v13-foto-nova.png";
const NUM_TENTATIVAS = 3;

const SCRIPT =
  "Inovar não é criar o futuro, é transformar o agora. Rompa o tradicional, use a tecnologia a seu favor " +
  "e lidere o mercado. Mude o seu negócio hoje mesmo de vez!";

const MOTION_PROMPT_EN =
  '[00:00-00:10] Medium shot. Seated with a firm, upright posture, look directly into the camera lens and speak with an inspiring, authoritative tone: "Inovar não é criar o futuro, é transformar o agora."\n' +
  '[00:10-00:20] Starting from a seated position, stand up with dynamic energy and stride firmly toward the camera, filling the frame with a strong presence as you speak with conviction: "Rompa o tradicional, use a tecnologia a seu favor e lidere o mercado."\n' +
  '[00:20-00:25] Already standing close to the camera in a tight close-up frame, extend your hand forward in an inviting gesture while holding a bold, confident gaze into the lens: "Mude o seu negócio hoje mesmo de vez!"';

const FRASE_CABELO =
  "sparse, thin gray hair strands visible at both temples — subtle, natural, not a bald head but not a " +
  "full hairline either, just a few visible strands";

const FRASE_PELE = "visible skin texture, visible pores, fine wrinkles, natural unretouched skin detail";

async function gerarUmaComposicao(
  indice: number,
  ctx: {
    apiKeyFal: string;
    apiKeyElevenLabs: string;
    voiceId: string;
    voiceTuning: ReturnType<typeof voiceTuningDoAvatar>;
    tenantId: string;
    aspectRatio: AspectRatio;
    fotoBase: Buffer;
    entradasExtras: EntradaDeComposicao[];
    promptDeComposicao: string;
  },
): Promise<void> {
  const runId = await abrirCorrida({
    tenantId: ctx.tenantId,
    videoId: VIDEO_ID_REFERENCIA,
    script: SCRIPT,
    targetSeconds: 25,
    charsPerSecond: 10.89,
  });
  console.log(`[tentativa ${indice}] corrida:`, runId);

  const resultado = await runFalPipeline({
    apiKeyFal: ctx.apiKeyFal,
    apiKeyElevenLabs: ctx.apiKeyElevenLabs,
    voiceId: ctx.voiceId,
    voiceTuning: ctx.voiceTuning,
    script: SCRIPT,
    fotoBase: ctx.fotoBase,
    fotoMimeType: "image/png",
    entradasExtras: ctx.entradasExtras,
    promptDeComposicao: ctx.promptDeComposicao,
    tenantId: ctx.tenantId,
    promptDeDirecao: MOTION_PROMPT_EN,
    aspectRatio: ctx.aspectRatio,
    diario: criarDiarioNoBanco(runId),
    pararApos: "compor",
    tier: "normal",
  });

  console.log(`[tentativa ${indice}] gastoPrevistoUsd:`, resultado.gastoPrevistoUsd);
  console.log(`[tentativa ${indice}] requestIds:`, JSON.stringify(resultado.requestIds));

  if (resultado.imagemCompostaUrl) {
    const img = await fetch(resultado.imagemCompostaUrl);
    const buf = Buffer.from(await img.arrayBuffer());
    const nomeArquivo = `/tmp/v16-composicao-${indice}.png`;
    await writeFile(nomeArquivo, buf);
    console.log(`[tentativa ${indice}] imagem salva em ${nomeArquivo} (`, buf.length, "bytes )");
  }
}

async function main() {
  const { rows: avatarRows } = await pool.query("SELECT * FROM avatars WHERE id = $1", [AVATAR_ID]);
  const avatar = avatarRows[0];
  if (!avatar) throw new Error(`avatar ${AVATAR_ID} não encontrado`);

  const { rows: videoRows } = await pool.query("SELECT * FROM videos WHERE id = $1", [VIDEO_ID_REFERENCIA]);
  const video = videoRows[0];
  if (!video) throw new Error(`video ${VIDEO_ID_REFERENCIA} não encontrado`);
  console.log("cenário:", video.scenario);
  console.log("traje:", video.outfit);

  const avatarCredential = await getCredentialForVendor(avatar.tenant_id, "avatar", "fal");
  const voiceCredential = await getCredential(avatar.tenant_id, "voice");
  if (!avatarCredential || !voiceCredential) throw new Error("credencial fal/voz indisponível para este tenant");
  const chaveFal = await resolveTenantAvatarFalKey(avatarCredential.apiKey);

  const fotoBase = await readFile(FOTO_NOVA_PATH);
  console.log("foto nova:", FOTO_NOVA_PATH, "(", fotoBase.length, "bytes )");

  const entradasExtras: EntradaDeComposicao[] = [];
  if (video.scenario) {
    entradasExtras.push({
      rotulo: "cenario",
      bytes: await readUpload(video.scenario),
      mimeType: mimeDoUpload(video.scenario),
    });
  }
  if (video.outfit) {
    entradasExtras.push({
      rotulo: "traje",
      bytes: await readUpload(video.outfit),
      mimeType: mimeDoUpload(video.outfit),
    });
  }

  const direcaoBloco0 = direcaoDoPrimeiroBloco(SCRIPT, MOTION_PROMPT_EN);
  const promptBase = promptDeComposicaoPosicional({
    temCenario: Boolean(video.scenario),
    cenarioTexto: video.scenario_prompt,
    temTraje: Boolean(video.outfit),
    trajeTexto: video.outfit_prompt,
    temLateral: false,
    direcaoTexto: direcaoBloco0,
  });
  const promptDeComposicao = `${promptBase} ${FRASE_CABELO}. ${FRASE_PELE}`;
  console.log("\npromptDeComposicao (o mesmo nas 3 tentativas):\n", promptDeComposicao);

  const voiceTuning = voiceTuningDoAvatar(avatar);
  const ctx = {
    apiKeyFal: chaveFal.apiKey,
    apiKeyElevenLabs: voiceCredential.apiKey,
    voiceId: avatar.voice_id ?? "",
    voiceTuning,
    tenantId: avatar.tenant_id,
    aspectRatio: (video.aspect_ratio as AspectRatio | null) ?? "16:9",
    fotoBase,
    entradasExtras,
    promptDeComposicao,
  };

  console.log(`\nDisparando ${NUM_TENTATIVAS} composições em paralelo...\n`);
  await Promise.all(
    Array.from({ length: NUM_TENTATIVAS }, (_, i) => gerarUmaComposicao(i + 1, ctx)),
  );
  console.log("\n✓ AS 3 COMPOSIÇÕES CONCLUÍRAM");
}

main()
  .catch((err) => {
    console.error("FALHOU:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
