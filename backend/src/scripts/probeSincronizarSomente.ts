/**
 * Sonda manual, descartável — RODADA 1, 29/08/2026.
 *
 * Reprocessa SÓ narrar+sincronizar do vídeo `134bc164` (já pago em compor+
 * animar — US$ 0,865 acumulados — e perdido no 422 `file_download_error`
 * corrigido nesta rodada). Não refaz compor nem animar: chama
 * `runFalPipelineDoVideoMudo` DIRETO, a mesma função que
 * `/videos/:id/approve-video` chama, com os dados JÁ GRAVADOS no vídeo
 * (`fal_muted_video_url`, `fal_composed_image_url`, `provider_job_id`).
 *
 * Por que não pela rota HTTP: o vídeo está em `status='error'`, e a rota só
 * aceita `awaiting_approval_video`. Resetar o status por SQL só para
 * satisfazer o guard da rota reproduziria MAIS efeitos colaterais (débito de
 * crédito, notificação, persistência de artefato, contagem no teto diário)
 * do que este teste precisa provar — que é só o `video_url` chegando como URL
 * pública ao `fal-ai/sync-lipsync/v2`.
 *
 * NÃO atualiza `videos.status`/`output_url` — o vídeo continua "error" no
 * produto depois deste teste. O arquivo final é baixado e entregue por fora.
 *
 *   docker compose exec backend npx tsx src/scripts/probeSincronizarSomente.ts
 */
import { pool } from "../db/pool.js";
import { getCredential, getCredentialForVendor } from "../services/credentialLookup.js";
import { resolveTenantAvatarFalKey } from "../services/providers/platformKeys.js";
import { voiceTuningDoAvatar } from "../services/voice/voiceTuning.js";
import {
  runFalPipelineDoVideoMudo,
  videoTierParaPipeline,
  escolherDuracao,
  PIPELINE_DURACAO_MAXIMA,
  PIPELINE_CHARS_PER_SECOND,
} from "../services/video/falPipeline.js";
import { criarDiarioNoBanco, abrirCorrida } from "../services/video/falPipelineJournal.js";

const VIDEO_ID = "134bc164-6df4-423c-adf7-9985337d1129";

async function main() {
  const { rows: videoRows } = await pool.query("SELECT * FROM videos WHERE id = $1", [VIDEO_ID]);
  const video = videoRows[0];
  if (!video) throw new Error(`vídeo ${VIDEO_ID} não encontrado`);
  if (!video.fal_muted_video_url) throw new Error("vídeo sem fal_muted_video_url — nada para reprocessar");

  console.log("vídeo:", video.id, "| tenant:", video.tenant_id, "| status atual (não muda):", video.status);
  console.log("fal_muted_video_url (o que estava quebrando):", video.fal_muted_video_url);
  console.log("fal_composed_image_url:", video.fal_composed_image_url);
  console.log("provider_job_id (animar, já pago):", video.provider_job_id);

  const { rows: avatarRows } = await pool.query("SELECT * FROM avatars WHERE id = $1", [video.avatar_id]);
  const avatar = avatarRows[0];
  if (!avatar) throw new Error("avatar não encontrado");

  const avatarCredential = await getCredentialForVendor(video.tenant_id, "avatar", "fal");
  const voiceCredential = await getCredential(video.tenant_id, "voice");
  if (!avatarCredential || !voiceCredential) throw new Error("credencial fal/voz indisponível para este tenant");
  const chaveFal = await resolveTenantAvatarFalKey(avatarCredential.apiKey);

  const novoRunId = await abrirCorrida({
    tenantId: video.tenant_id,
    videoId: video.id,
    script: video.script,
    targetSeconds: escolherDuracao(video.script.length) ?? PIPELINE_DURACAO_MAXIMA,
    charsPerSecond: PIPELINE_CHARS_PER_SECOND,
    origem: "aprovacao_video",
  });
  console.log("\nnova corrida (só narrar+sincronizar):", novoRunId);

  const resultado = await runFalPipelineDoVideoMudo(
    {
      apiKeyFal: chaveFal.apiKey,
      apiKeyElevenLabs: voiceCredential.apiKey,
      voiceId: avatar.voice_id ?? "",
      voiceTuning: voiceTuningDoAvatar(avatar),
      script: video.script,
      // Nem a composição nem a animação são refeitas aqui — os campos
      // existem porque o input é o mesmo tipo. Mesmo padrão de
      // `routes/videos.ts` em `/approve-video`.
      fotoBase: Buffer.alloc(0),
      fotoMimeType: "image/jpeg",
      promptDeComposicao: "",
      promptDeDirecao: "",
      tenantId: video.tenant_id,
      aspectRatio: video.aspect_ratio ?? undefined,
      diario: criarDiarioNoBanco(novoRunId),
      tier: videoTierParaPipeline(video.tier_video),
    },
    video.fal_muted_video_url,
    video.fal_composed_image_url,
    "",
    video.provider_job_id ?? "",
  );

  console.log("\n✓ SINCRONIZAÇÃO CONCLUÍDA");
  console.log("videoUrl (fal, expira):", resultado.videoUrl);
  console.log("audioDurationSeconds:", resultado.audioDurationSeconds);
  console.log("requestIds:", JSON.stringify(resultado.requestIds));
  console.log("gastoPrevistoUsd (só narrar+sincronizar desta corrida):", resultado.gastoPrevistoUsd);
}

main()
  .catch((err) => {
    console.error("FALHOU:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
