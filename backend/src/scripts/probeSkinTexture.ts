/**
 * Sonda manual, descartável — RODADA 11, 30/08/2026.
 *
 * UM bloco Wan de 10s, isolado — mesma imagem já composta e mesmo
 * enquadramento do "bloco 1" da corrida real de V9 (7e943007, arquivo final
 * f12d913d), reconstruído byte a byte pelas MESMAS funções de produção
 * (`direcaoPorJanela`, `direcaoComExpressividade`, `comDefaultsDeDirecao`).
 * A ÚNICA variável isolada: acrescenta ao final do prompt positivo
 * "visible skin texture, visible pores, fine wrinkles, natural unretouched
 * skin detail" — nada mais muda (mesmo negative_prompt, mesmo seed, mesma
 * imagem, mesma duração).
 *
 * NÃO passa por `runFalPipeline`/`runFalPipelineDaImagem` de propósito: os
 * dois fracionam por ROTEIRO, e forçar um roteiro sintético a produzir
 * exatamente este bloco arriscaria divergir do "bloco 1" real em algum
 * detalhe não controlado. Chama `falSubmit`/`falResult` direto — MESMOS
 * exports que o pipeline usa por baixo — então NÃO cria linha em
 * `fal_pipeline_runs`/`credit_ledger`: é sonda fora da contabilidade do
 * produto, nunca vira vídeo de aprovação. Custo real é o mesmo do fornecedor
 * de qualquer forma (não há como testar de graça).
 *
 *   docker compose exec backend npx tsx src/scripts/probeSkinTexture.ts
 */
import { writeFile } from "node:fs/promises";
import { pool } from "../db/pool.js";
import { getCredentialForVendor } from "../services/credentialLookup.js";
import { resolveTenantAvatarFalKey } from "../services/providers/platformKeys.js";
import { janelasDosBlocos, direcaoPorJanela } from "../services/video/scriptFractioning.js";
import { direcaoComExpressividade } from "../services/providers/videoScene.js";
import {
  comDefaultsDeDirecao,
  NEGATIVE_PROMPT_ANIMAR_WAN,
  ENDPOINT_ANIMAR,
  lintarPromptDoBlocoWan,
  aguardarConclusao,
} from "../services/video/falPipeline.js";
import { falSubmit, falResult } from "../services/providers/falClient.js";

const TENANT_ID = "c77a5b8a-ec24-47b5-bc69-c4503d6c7cbd";
const IMAGEM_COMPOSTA = "https://v3b.fal.media/files/b/0aa87362/H8tp9leqUI26g9roDMIcW_E7XcUsbw.png";
const SEED_ORIGINAL = 1572009222; // mesmo seed da corrida real (7e943007)
const ASPECT_RATIO = "16:9";
const FRASE_TEXTURA = "visible skin texture, visible pores, fine wrinkles, natural unretouched skin detail";

// EXATO motion_prompt_en gravado em `videos.motion_prompt_en` para 7e943007.
const MOTION_PROMPT_EN =
  '[00:00-00:10] Medium shot. Seated with a firm, upright posture, look directly into the camera lens and speak with an inspiring, authoritative tone: "Inovar não é criar o futuro, é transformar o agora."\n' +
  '[00:10-00:20] Starting from a seated position, stand up with dynamic energy and stride firmly toward the camera, filling the frame with a strong presence as you speak with conviction: "Rompa o tradicional, use a tecnologia a seu favor e lidere o mercado."\n' +
  '[00:20-00:25] Already standing close to the camera in a tight close-up frame, extend your hand forward in an inviting gesture while holding a bold, confident gaze into the lens: "Mude o seu negócio hoje mesmo de vez!"';

async function main() {
  const avatarCredential = await getCredentialForVendor(TENANT_ID, "avatar", "fal");
  if (!avatarCredential) throw new Error("credencial fal indisponível para este tenant");
  const chaveFal = await resolveTenantAvatarFalKey(avatarCredential.apiKey);

  // Reconstrói o "bloco 1" (índice 1, janela 10-20s) EXATAMENTE como a
  // corrida real fez — mesmas 3 janelas (10+10+5), mesmo texto traduzido.
  const blocos = [
    { texto: "", duracaoEscolhida: 10 as const },
    { texto: "", duracaoEscolhida: 10 as const },
    { texto: "", duracaoEscolhida: 5 as const },
  ];
  const janelas = janelasDosBlocos(blocos);
  const direcoes = direcaoPorJanela(MOTION_PROMPT_EN, janelas);
  const direcaoBloco1 = direcoes[1];
  console.log("direção do bloco 1 (fatiada):", direcaoBloco1);

  const direcaoComExpr = direcaoComExpressividade(direcaoBloco1, "medium");
  const direcaoComDefaults = comDefaultsDeDirecao(direcaoComExpr);

  // MESMA montagem de `corpoAnimarWan` (falPipeline.ts), byte a byte, com a
  // frase de textura ACRESCENTADA ao final — única variável desta sonda.
  const promptBase =
    `Character1: ${direcaoComDefaults} Keep Character1's face, outfit and the scene ` +
    "background exactly as shown in the reference image — same person, same clothes, same location.";
  const promptFinal = `${promptBase} ${FRASE_TEXTURA}`;

  const corpo: Record<string, unknown> = {
    prompt: promptFinal,
    image_urls: [IMAGEM_COMPOSTA],
    generate_audio: false,
    resolution: "720p",
    aspect_ratio: ASPECT_RATIO,
    duration: "10",
    enable_prompt_expansion: false,
    multi_shots: false,
    negative_prompt: NEGATIVE_PROMPT_ANIMAR_WAN,
    seed: SEED_ORIGINAL,
  };

  console.log("\nprompt final (o que vai ao Wan):\n", promptFinal);

  // Mesma checagem que o produto roda antes de qualquer chamada paga.
  lintarPromptDoBlocoWan(corpo);
  console.log("\nlinter: PASSOU\n");

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
  const videoUrl = saida?.video?.url;
  if (!videoUrl) throw new Error("fal: concluiu sem devolver vídeo — saída bruta: " + JSON.stringify(saida));

  console.log("\n✓ CONCLUÍDO");
  console.log("videoUrl (fal, expira):", videoUrl);
  console.log("duration reportada:", saida?.video?.duration);

  const resp = await fetch(videoUrl);
  const buf = Buffer.from(await resp.arrayBuffer());
  await writeFile("/tmp/skin-texture-bloco1.mp4", buf);
  console.log("salvo em /tmp/skin-texture-bloco1.mp4 (", buf.length, "bytes )");
}

main()
  .catch((err) => {
    console.error("FALHOU:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
