/**
 * V32, Parte B — SONDA ÚNICA, isolada, FORA do pipeline de produção.
 *
 * Chama `alibaba/wan-3.0/reference-to-video` diretamente (fetch cru, sem
 * `falSubmit`/`etapaNaFal`/catálogo de endpoints) para medir, com uma
 * geração real, se o lipsync nativo deste modelo poderia substituir
 * `fal-ai/sync-lipsync/v2`. NÃO toca em `videos`/`fal_pipeline_runs` —
 * nenhuma linha de produção é criada ou lida além de fontes read-only
 * (composição já paga do vídeo 72c84d03, foto do avatar).
 *
 * Custo real: ElevenLabs (síntese, ~US$0,015) + Wan 3.0 (20s a 480p =
 * US$1,00) = ~US$1,02, dentro do teto de US$1,10 desta rodada.
 *
 * Rodar: docker compose exec backend npx tsx src/scripts/probeWan3ReferenceToVideo.ts
 */
import { writeFile } from "node:fs/promises";
// Import isolado, primeiro — GOTCHA achado ao escrever esta sonda, NÃO
// corrigido em produção por instrução desta rodada ("não tocar no pipeline").
//
// Existe um anel de importação real (diferente do já documentado em
// avatarProvider.ts:14-18, R5, 24/08): providerCost.ts calcula
// DEFAULT_HEYGEN_TETO_USD no TOPO do módulo, chamando
// estimateSecondsFromChars(HEYGEN_MAX_SCRIPT_CHARS) de scriptDuration.ts;
// scriptDuration.ts importa VOICE_SPEED de voiceProvider.ts; voiceProvider.ts
// importa fixtureProvider.ts; fixtureProvider.ts importa avatarProvider.ts;
// avatarProvider.ts importa falPipeline.ts (runFalPipeline); e falPipeline.ts
// importa PRECOS_FAL/tetoNormalUsd de volta de providerCost.ts — fechando o
// anel num ponto que a nota de 24/08 não cobria (aquela evitava só a aresta
// avatarProvider→providerCost DIRETA, trocando por voiceCost.js; esta é
// avatarProvider→falPipeline→providerCost).
//
// Em produção (entry point routes/videos.ts) isso nunca quebra porque
// `providerCost.js` é importado cedo o bastante na árvore para terminar de
// avaliar ANTES de qualquer ramo do anel tentar usá-lo pela metade. Um
// script cujo import de entrada visita o anel por outro nó primeiro (aqui,
// efetivamente `voiceProvider.js`, puxado por `synthesizeSpeech` abaixo)
// inverte a ordem e dispara `ReferenceError: Cannot access
// 'HEYGEN_MAX_SCRIPT_CHARS'/'VOICE_SPEED' before initialization`. Importar
// `providerCost.js` primeiro e sozinho aqui reproduz a ordem de produção —
// é um contorno NESTE SCRIPT, não uma correção do anel em si.
import "../services/billing/providerCost.js";
import { pool } from "../db/pool.js";
import { getCredential, getCredentialForVendor } from "../services/credentialLookup.js";
import { resolveTenantAvatarFalKey } from "../services/providers/platformKeys.js";
import { falUpload } from "../services/providers/falClient.js";
import { synthesizeSpeech } from "../services/providers/voiceProvider.js";
import { voiceTuningDoAvatar } from "../services/voice/voiceTuning.js";
import { readUpload } from "../services/storage.js";

const TENANT_ID = "c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd";
const VIDEO_ID = "72c84d03-df22-40cd-93d9-4303fb95cdf1"; // já composto e pago, awaiting_approval
const SCRIPT_146 =
  "Inovar não é criar o futuro, é mudar o agora. Rompa o tradicional, use a tecnologia a seu favor e " +
  "lidere o mercado. Mude o seu negócio hoje mesmo!";
const ENDPOINT = "alibaba/wan-3.0/reference-to-video";
const QUEUE_BASE = "https://queue.fal.run";

// Item 3 — cláusula de identidade NO COMEÇO, não no fim (invertido em
// relação ao prompt de produção do Wan 2.6, que a põe no fim).
const PROMPT =
  "Character1 keeps their face, outfit and scene background exactly as shown in the reference images " +
  "— same person, same clothes, same location. Character1 wears a navy blue dress shirt, no tie, " +
  "sleeves slightly rolled up, standing in a modern office with a large window showing a city at dusk " +
  "in the background. Calm gesture, hands open at chest height, direct eye contact with the camera, " +
  "light smile.";

async function main(): Promise<void> {
  console.log("PROVIDER_MODE=", process.env.PROVIDER_MODE);
  if (process.env.PROVIDER_MODE !== "live") {
    throw new Error("Esta sonda só faz sentido em live — PROVIDER_MODE atual não é live. Abortando sem gastar.");
  }

  // --- credenciais reais do tenant -----------------------------------------
  const avatarCred = await getCredentialForVendor(TENANT_ID, "avatar", "fal");
  const voiceCred = await getCredential(TENANT_ID, "voice");
  if (!avatarCred || !voiceCred) throw new Error("credencial ausente — abortando sem gastar.");
  const { apiKey: apiKeyFal } = await resolveTenantAvatarFalKey(avatarCred.apiKey);
  const apiKeyElevenLabs = voiceCred.apiKey;

  // --- ativos reais, já pagos / gratuitos ----------------------------------
  const v = await pool.query<{ fal_composed_image_url: string; avatar_id: string }>(
    "SELECT fal_composed_image_url, avatar_id FROM videos WHERE id = $1",
    [VIDEO_ID],
  );
  const composedUrl = v.rows[0]?.fal_composed_image_url;
  if (!composedUrl) throw new Error("vídeo de referência sem imagem composta — abortando.");
  console.log("imagem composta (já paga, reusada):", composedUrl);

  const a = await pool.query<{
    photo_urls: string[];
    voice_id: string;
    voice_stability: number;
    voice_similarity_boost: number;
    voice_style: number;
    voice_speaker_boost: boolean;
  }>(
    "SELECT photo_urls, voice_id, voice_stability, voice_similarity_boost, voice_style, voice_speaker_boost FROM avatars WHERE id = $1",
    [v.rows[0].avatar_id],
  );
  const avatar = a.rows[0];
  if (!avatar?.photo_urls?.[0] || !avatar.voice_id) throw new Error("avatar sem foto ou voz — abortando.");

  console.log("subindo a foto real do avatar para a fal (upload não é tarifado)...");
  const fotoBytes = await readUpload(avatar.photo_urls[0]);
  const fotoUrl = await falUpload(apiKeyFal, fotoBytes, "image/jpeg");
  console.log("foto real subida:", fotoUrl);

  console.log("sintetizando a fala (ElevenLabs, custo real pequeno)...");
  const tuning = voiceTuningDoAvatar(avatar);
  const fala = await synthesizeSpeech(apiKeyElevenLabs, avatar.voice_id, SCRIPT_146, tuning);
  console.log(`áudio sintetizado: ${fala.audio.length} bytes, ${fala.durationSeconds}s medidos (fonte: ${fala.source})`);
  const audioUrl = await falUpload(apiKeyFal, fala.audio, "audio/mpeg");
  console.log("áudio subido para a fal:", audioUrl);

  // --- SUBMISSÃO REAL, FORA DO CATÁLOGO DE PRODUÇÃO ------------------------
  const corpo = {
    prompt: PROMPT,
    reference_image_urls: [composedUrl, fotoUrl],
    reference_audio_urls: [audioUrl],
    duration: 20,
    resolution: "480p",
    aspect_ratio: "16:9",
    audio: true,
    // Preserva o prompt exatamente como escrito — mesma razão do Wan 2.6 de
    // produção: sem isto o fornecedor reescreve a direção por conta própria.
    enable_prompt_expansion: false,
  };
  console.log("SUBMETENDO (isto vai cobrar de verdade):", JSON.stringify(corpo, null, 1));

  const submitRes = await fetch(`${QUEUE_BASE}/${ENDPOINT}`, {
    method: "POST",
    headers: { authorization: `Key ${apiKeyFal}`, "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
  const submitBody = await submitRes.text();
  console.log("resposta do submit:", submitRes.status, submitBody.slice(0, 500));
  if (!submitRes.ok) {
    throw new Error(`submit falhou (${submitRes.status}) — se isto é 4xx, é provável que NADA tenha sido cobrado.`);
  }
  const submitData = JSON.parse(submitBody);
  const requestId = submitData.request_id;
  const statusUrl = submitData.status_url;
  const responseUrl = submitData.response_url;
  console.log("request_id:", requestId, "status_url:", statusUrl);

  // --- POLL -----------------------------------------------------------------
  const inicio = Date.now();
  const TIMEOUT_MS = 10 * 60 * 1000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(statusUrl, { headers: { authorization: `Key ${apiKeyFal}` } });
    const statusBody = await statusRes.json();
    console.log(`[${Math.round((Date.now() - inicio) / 1000)}s] status:`, JSON.stringify(statusBody));
    if (statusBody.status === "COMPLETED") break;
    if (statusBody.status === "ERROR" || statusRes.status >= 400) {
      throw new Error(`fila reportou erro: ${JSON.stringify(statusBody)}`);
    }
    if (Date.now() - inicio > TIMEOUT_MS) {
      throw new Error(`timeout de 10min esperando a fila. request_id=${requestId} — NÃO PERDIDO, consultável depois.`);
    }
  }

  const resultRes = await fetch(responseUrl, { headers: { authorization: `Key ${apiKeyFal}` } });
  const resultBody = await resultRes.text();
  console.log("RESULTADO CRU:", resultBody);
  const resultado = JSON.parse(resultBody);

  const videoUrl = resultado?.video?.url;
  if (!videoUrl) throw new Error("resultado sem video.url — corpo cru acima.");
  console.log("VÍDEO GERADO:", videoUrl);

  // Baixa o arquivo para inspeção visual/técnica.
  const videoRes = await fetch(videoUrl);
  const bytes = Buffer.from(await videoRes.arrayBuffer());
  const outPath = "/tmp/wan3-probe.mp4";
  await writeFile(outPath, bytes);
  console.log(`vídeo baixado: ${outPath}, ${bytes.length} bytes`);

  console.log("");
  console.log("=== RESUMO ===");
  console.log("request_id:", requestId);
  console.log("video_url:", videoUrl);
  console.log("bytes:", bytes.length);
  console.log("duração do áudio sintetizado (ElevenLabs):", fala.durationSeconds, "s");
  process.exit(0);
}

main().catch((err) => {
  console.error("SONDA ABORTOU:", err);
  process.exit(1);
});
