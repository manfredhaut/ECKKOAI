/**
 * Sonda manual, descartável — RODADA 1, item de investigação de áudio ausente
 * (29/08/2026).
 *
 * Gera UMA síntese nova (mesmo script/voz do vídeo `134bc164`) e salva o MP3
 * BRUTO em disco antes de qualquer upload — os bytes reais da corrida
 * anterior nunca foram persistidos (só `bytes.length`/`durationSeconds` vão
 * ao diário; o base64 é elidido no log). Não sobe para a fal: só grava local
 * para inspeção com ffmpeg/ffprobe por fora.
 *
 * FETCH CRU ao ElevenLabs, sem importar `voiceProvider.ts` — importá-lo
 * dispara um ciclo `scriptDuration.ts` <-> `providerCost.ts` que estoura
 * `ReferenceError: Cannot access 'VOICE_SPEED' before initialization`
 * (achado desta sonda, pré-existente, fora do escopo da Rodada 1: não é nada
 * que os itens 1-3 tocaram). Os parâmetros do corpo abaixo são transcritos do
 * log real `voice_payload_built` da corrida bem-sucedida (cb30c193).
 *
 *   docker compose exec backend npx tsx src/scripts/probeCheckNarracaoSom.ts
 */
import { writeFile } from "node:fs/promises";
import { pool } from "../db/pool.js";
import { getCredential } from "../services/credentialLookup.js";

const VIDEO_ID = "134bc164-6df4-423c-adf7-9985337d1129";

async function main() {
  const { rows: videoRows } = await pool.query("SELECT * FROM videos WHERE id = $1", [VIDEO_ID]);
  const video = videoRows[0];
  if (!video) throw new Error(`vídeo ${VIDEO_ID} não encontrado`);

  const { rows: avatarRows } = await pool.query("SELECT * FROM avatars WHERE id = $1", [video.avatar_id]);
  const avatar = avatarRows[0];
  if (!avatar) throw new Error("avatar não encontrado");

  const voiceCredential = await getCredential(video.tenant_id, "voice");
  if (!voiceCredential) throw new Error("credencial de voz indisponível");

  console.log("voiceId:", avatar.voice_id);
  console.log("script (196 chars esperados):", video.script);

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(avatar.voice_id)}`, {
    method: "POST",
    headers: { "xi-api-key": voiceCredential.apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      text: video.script,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: 0.85 },
    }),
  });
  console.log("\nstatus HTTP:", res.status);
  if (!res.ok) {
    console.error("corpo do erro:", (await res.text()).slice(0, 500));
    throw new Error(`ElevenLabs API error (${res.status})`);
  }
  const audio = Buffer.from(await res.arrayBuffer());

  console.log("bytes recebidos:", audio.length);

  await writeFile("/tmp/narracao_bruta_elevenlabs.mp3", audio);
  console.log("\nsalvo em /tmp/narracao_bruta_elevenlabs.mp3");
}

main()
  .catch((err) => {
    console.error("FALHOU:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
