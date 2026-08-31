/**
 * Sonda manual, descartável — RODADA 15, 31/08/2026.
 *
 * Regenera SÓ o bloco 2 (5s, close-up) da corrida `4e16669e` (V14) —
 * reaproveita os blocos 0 e 1 JÁ PAGOS e JÁ APROVADOS (mesmas URLs brutas da
 * fal, sem regenerar), e reconcatena os 3 com o pipeline de produção
 * (`concatVideos`, `corrigirCor: true` por default no tier Normal).
 *
 * O QUE MUDOU NO BLOCO 2, e por quê (achado da RODADA 14, medido por
 * inspeção visual): o close-up perdeu o corredor neon por completo,
 * trocando por um fundo branco de estúdio — `corrigirCor` não tem como
 * consertar isso, é defeito de CONTEÚDO, não de cor.
 *   (a) cláusula reforçando explicitamente o cenário, pedida pelo operador.
 *   (b) frase de textura de pele TROCADA por uma mais leve, só para este
 *       bloco — a original ("visible pores, fine wrinkles") pode ter
 *       exagerado o realismo em close-up a ponto de competir com a
 *       instrução de cenário. Blocos 0/1 NÃO são tocados.
 *
 * MESMO seed da corrida (1500392061) — identidade visual entre os 3 blocos
 * depende disso.
 *
 * Custo esperado: 1 bloco Wan de 5s (~US$0,125-0,15). Reconcatenação é
 * ffmpeg local, custo zero.
 *
 *   docker compose exec backend npx tsx src/scripts/probeRecomposeBloco2.ts
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pool } from "../db/pool.js";
import { getCredentialForVendor } from "../services/credentialLookup.js";
import { resolveTenantAvatarFalKey } from "../services/providers/platformKeys.js";
import { direcaoComExpressividade } from "../services/providers/videoScene.js";
import {
  comDefaultsDeDirecao,
  NEGATIVE_PROMPT_ANIMAR_WAN,
  ENDPOINT_ANIMAR,
  lintarPromptDoBlocoWan,
  aguardarConclusao,
} from "../services/video/falPipeline.js";
import { falSubmit, falResult, falUpload } from "../services/providers/falClient.js";
import { concatVideos } from "../services/video/ffmpeg.js";
import { saveUpload } from "../services/storage.js";

const TENANT_ID = "c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd";
const VIDEO_ID = "7e943007-e3c9-4442-80fb-9a6f59165b81";
const IMAGEM_COMPOSTA = "https://v3b.fal.media/files/b/0aa87a60/Gn2sa6hpT8huXw5Q5_fBg_3IqEIZTw.png";
const SEED = 1500392061; // mesmo seed da corrida d201b11f (V14)
const ASPECT_RATIO = "16:9";

// Blocos 0 e 1 — JÁ PAGOS, JÁ APROVADOS, reaproveitados sem regenerar.
const BLOCO0_URL = "https://v3b.fal.media/files/b/0aa87a9f/DHhPYnx07EcHV78ZZVuPM_0blss3dH.mp4";
const BLOCO1_URL = "https://v3b.fal.media/files/b/0aa87aa5/8K7djFjBMgFynXkrPkgQb_EuWhrUVE.mp4";

const DIRECAO_BLOCO2_BASE =
  'Already standing close to the camera in a tight close-up frame, extend your hand forward in an ' +
  'inviting gesture while holding a bold, confident gaze into the lens: "Mude o seu negócio hoje mesmo de vez!"';

const CLAUSULA_CENARIO =
  "same neon corridor background, pink and blue vertical light strips, do NOT change to plain/studio background";

const FRASE_TEXTURA_LEVE = "natural skin texture, avoid over-smoothing, avoid excessive wrinkles or blemishes";

async function main() {
  // Item 1 — confirma blocos 0/1 ainda alcançáveis, sem regenerar.
  for (const [nome, url] of [["bloco0", BLOCO0_URL], ["bloco1", BLOCO1_URL]] as const) {
    const r = await fetch(url, { method: "HEAD" });
    console.log(`${nome}: HTTP ${r.status}, content-length ${r.headers.get("content-length")}`);
    if (!r.ok) throw new Error(`${nome} não está mais acessível — PARE, não regenerar sem nova autorização.`);
  }

  const avatarCredential = await getCredentialForVendor(TENANT_ID, "avatar", "fal");
  if (!avatarCredential) throw new Error("credencial fal indisponível para este tenant");
  const chaveFal = await resolveTenantAvatarFalKey(avatarCredential.apiKey);

  const direcaoBloco2 = `${DIRECAO_BLOCO2_BASE} ${CLAUSULA_CENARIO} ${FRASE_TEXTURA_LEVE}`;
  const direcaoComExpr = direcaoComExpressividade(direcaoBloco2, "medium");
  const direcaoComDefaults = comDefaultsDeDirecao(direcaoComExpr);
  const promptFinal =
    `Character1: ${direcaoComDefaults} Keep Character1's face, outfit and the scene ` +
    "background exactly as shown in the reference image — same person, same clothes, same location.";

  const corpo: Record<string, unknown> = {
    prompt: promptFinal,
    image_urls: [IMAGEM_COMPOSTA],
    generate_audio: false,
    resolution: "720p",
    aspect_ratio: ASPECT_RATIO,
    duration: "5",
    enable_prompt_expansion: false,
    multi_shots: false,
    negative_prompt: NEGATIVE_PROMPT_ANIMAR_WAN,
    seed: SEED,
  };

  console.log("\nprompt final do bloco 2 (o que vai ao Wan):\n", promptFinal);

  // Item 3 — linter local, ANTES de qualquer chamada paga.
  lintarPromptDoBlocoWan(corpo);
  console.log("\nlinter: PASSOU\n");

  // Item 4 — UMA única chamada paga, real.
  let requestId = "";
  const submissao = await falSubmit(chaveFal.apiKey, ENDPOINT_ANIMAR, corpo, (id) => {
    requestId = id;
    console.log("request_id (JÁ custa a partir daqui):", id);
  });
  await aguardarConclusao(chaveFal.apiKey, submissao.statusUrl, requestId, {
    timeoutMs: 300_000,
    intervalMs: 5_000,
    esperar: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  const saida = (await falResult(chaveFal.apiKey, submissao.responseUrl)) as {
    video?: { url?: string; duration?: number };
  };
  const bloco2Url = saida?.video?.url;
  if (!bloco2Url) throw new Error("fal: concluiu sem devolver vídeo — saída bruta: " + JSON.stringify(saida));
  console.log("\n✓ BLOCO 2 NOVO CONCLUÍDO");
  console.log("bloco2Url (fal, expira):", bloco2Url);
  console.log("duration reportada:", saida?.video?.duration);

  const bruto2 = await fetch(bloco2Url);
  const bruto2Buf = Buffer.from(await bruto2.arrayBuffer());
  await writeFile("/tmp/v15-bloco2-bruto.mp4", bruto2Buf);
  console.log("bloco2 bruto salvo em /tmp/v15-bloco2-bruto.mp4 (", bruto2Buf.length, "bytes )");

  // Item 5 — reconcatena os 3 (0 e 1 originais + 2 novo), mesmo pipeline,
  // corrigirCor ativo (tier Normal).
  const dir = await mkdtemp(path.join(tmpdir(), "v15-concat-"));
  const outputPath = path.join(dir, "concatenado.mp4");
  try {
    await concatVideos([BLOCO0_URL, BLOCO1_URL, bloco2Url], outputPath, { corrigirCor: true });
    const bytes = await readFile(outputPath);
    console.log("\nconcatenação local concluída,", bytes.length, "bytes");

    // Item 6 — publica: sobe para a fal (mesmo formato de retorno que
    // `concatenarBlocosEPublicar` produz), depois persiste localmente como
    // o `/approve` real faz.
    const falUrl = await falUpload(chaveFal.apiKey, bytes, "video/mp4");
    const salvo = await saveUpload(TENANT_ID, bytes, `${VIDEO_ID}-mudo-v15.mp4`);
    console.log("arquivo final persistido localmente em:", salvo);

    await pool.query(
      `UPDATE videos SET fal_muted_video_url = $2, approval_requested_at = now()
         WHERE id = $1`,
      [VIDEO_ID, salvo],
    );
    console.log("videos.fal_muted_video_url atualizado por ID exato.");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

main()
  .catch((err) => {
    console.error("FALHOU:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
