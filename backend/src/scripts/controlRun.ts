/**
 * Rodada de CONTROLE — Parte B do bloco 5F. ARMADA, NÃO DISPARADA.
 *
 * Uma rodada responde três perguntas que nenhuma quantidade de leitura resolve:
 *
 *  1. **O preenchimento em 9:16 é regra do fornecedor ou consequência da foto
 *     daquele avatar?** O 5F mediu 57,8% de barra num master 9:16 e 0% num
 *     master 16:9 — mas os dois vieram de avatares DIFERENTES, então a
 *     comparação não é controlada. Aqui é o mesmo avatar, o mesmo roteiro, e a
 *     única variável é a proporção.
 *  2. **1080p é aceito no nosso plano?** Documentado que custa igual a 720p;
 *     nunca pedido. Uma recusa é resposta tão boa quanto uma aceitação.
 *  3. **O truncamento por segundo inteiro tem um quarto ponto?** Hoje a regra
 *     fecha exata em três medições. Um quarto ponto a torna difícil de
 *     confundir com coincidência.
 *
 * ESTE SCRIPT NÃO CHAMA FORNECEDOR NENHUM. Ele imprime o que sairia
 * (`--payloads`) e mede o que voltou (`--measure`). Quem dispara é a interface,
 * com o ambiente em `live` — e isso depende de aval explícito.
 *
 *   npx tsx src/scripts/controlRun.ts --payloads
 *   npx tsx src/scripts/controlRun.ts --measure <arquivo-9x16> <arquivo-16x9>
 */
import { buildHeygenVideoPayload } from "../services/providers/avatarProvider.js";
import { probeVideo } from "../services/video/ffmpeg.js";
import { probePadding } from "../services/video/paddingProbe.js";
import { HEYGEN_VIDEO_COST, billedSecondsFor, costFor } from "../services/billing/providerCost.js";

/**
 * O roteiro da rodada.
 *
 * Curto de propósito: a cobrança trunca em segundo inteiro, então o mais curto
 * que ainda renderize é o mais barato. 32 caracteres dão ~2,7 s pela taxa
 * observada no 5D (206 caracteres → 17,6 s, ou ~11,7 caracteres por segundo),
 * o que deve truncar em 2 s de cobrança.
 *
 * O texto é o MESMO nas duas gerações. Se fosse diferente, a diferença de
 * duração viraria uma variável a mais, e a comparação de preenchimento
 * deixaria de ser controlada.
 */
export const CONTROL_SCRIPT = "Olá. Este é um teste de formato.";

/** O avatar de 02/08 — o mesmo que produziu o master com 57,8% de barra. */
export const CONTROL_AVATAR = {
  name: "Mário",
  avatarId: "983c7de4-dde5-49b7-8628-0374cbf33d1f",
  providerAvatarId: "45528bb8bf914899b12403e6d50cb780",
  voiceId: "wAd9MJ2IK71FGs1FWjIX",
} as const;

/** As duas gerações. Mesma resolução, mesma duração pedida, proporção diferente. */
export const CONTROL_RUNS = [
  { aspectRatio: "9:16" as const, platform: "reels_tiktok" as const, ordem: 1 },
  { aspectRatio: "16:9" as const, platform: "youtube" as const, ordem: 2 },
];

function printPayloads(): void {
  console.log("ROTEIRO (idêntico nas duas):");
  console.log(`  ${JSON.stringify(CONTROL_SCRIPT)}  (${CONTROL_SCRIPT.length} caracteres)`);
  console.log(`  estimativa de fala: ~${(CONTROL_SCRIPT.length / 11.7).toFixed(1)} s`);
  console.log(`\nAVATAR: ${CONTROL_AVATAR.name} (voz clonada ${CONTROL_AVATAR.voiceId.slice(0, 6)}…)`);

  console.log("\nPAYLOADS que sairiam em POST /v3/videos — montados pelo montador REAL:\n");
  for (const run of CONTROL_RUNS) {
    const { body, engine, engineReason } = buildHeygenVideoPayload(
      {
        providerAvatarId: CONTROL_AVATAR.providerAvatarId,
        format: { platform: run.platform, aspectRatio: run.aspectRatio, resolution: "1080p" },
        supportedEngines: ["avatar_iv", "avatar_iii"],
        // A flag continua DESLIGADA: a ligação entre `supported_api_engines` e
        // `engine.type` é dedução, e um valor recusado derruba a geração — que
        // é justamente o caminho caro.
        engineEnabled: false,
      } as never,
      "<audio_asset_id devolvido pelo upload do TTS>",
    );
    console.log(`  ${run.ordem}) ${run.aspectRatio} — plataforma ${run.platform}`);
    console.log(`     motor: ${engine ?? "não enviado"} (${engineReason})`);
    console.log(JSON.stringify(body, null, 2).split("\n").map((l) => "     " + l).join("\n"));
    console.log();
  }

  const estimativa = costFor({
    provider: "avatar",
    vendor: "heygen",
    unitType: "seconds",
    unitCount: 3,
  });
  console.log(
    `CUSTO ESTIMADO: ${estimativa.known ? `US$ ${estimativa.usd} por geração (3 s cobrados)` : "ausente"} ` +
      `⇒ ~US$ ${estimativa.known ? (estimativa.usd * 2).toFixed(2) : "?"} nas duas.`,
  );
  console.log(
    `Se a fala truncar em 2 s, cai para US$ ${(2 * (HEYGEN_VIDEO_COST.unitsPerBilledSecond / HEYGEN_VIDEO_COST.unitsPerDollar) * 2).toFixed(2)}.`,
  );
}

async function measure(arquivos: string[]): Promise<void> {
  if (arquivos.length === 0) {
    console.error("uso: controlRun.ts --measure <arquivo>...");
    process.exit(2);
  }

  console.log("MEDIÇÃO DA RODADA DE CONTROLE\n");
  const linhas: Array<{ nome: string; geo: string; padding: string; conteudo: string; dur: number }> = [];

  for (const f of arquivos) {
    const geo = await probeVideo(f);
    const pad = await probePadding(f);
    const nome = f.split(/[\\/]/).pop() ?? f;

    console.log(`=== ${nome}`);
    console.log(`  quadro       ${geo.width}×${geo.height}  ${geo.codec}  ${geo.durationSeconds.toFixed(3)}s`);
    console.log(`  PREENCHIMENTO ${pad.verdict}  ${(pad.paddingFraction * 100).toFixed(1)}%`);
    console.log(`  conteúdo     ${pad.content.width}×${pad.content.height}  (proporção ${pad.contentAspect.toFixed(3)})`);
    console.log(`  cobrado      ${billedSecondsFor(geo.durationSeconds)} s inteiros de ${geo.durationSeconds.toFixed(3)}s entregues`);
    console.log();

    linhas.push({
      nome,
      geo: `${geo.width}×${geo.height}`,
      padding: `${(pad.paddingFraction * 100).toFixed(1)}%`,
      conteudo: `${pad.content.width}×${pad.content.height}`,
      dur: geo.durationSeconds,
    });
  }

  console.log("A PERGUNTA CENTRAL — o preenchimento acompanha a proporção?");
  console.log("  arquivo                        quadro       barra    conteúdo");
  for (const l of linhas) {
    console.log(`  ${l.nome.slice(0, 28).padEnd(30)} ${l.geo.padEnd(12)} ${l.padding.padEnd(8)} ${l.conteudo}`);
  }
  console.log(
    "\n  Se o 9:16 vier com barra e o 16:9 não, o preenchimento é do FORNECEDOR e a política do master\n" +
      "  precisa ser revista. Se os dois vierem limpos, o master de 02/08 é que era atípico.",
  );

  console.log("\nQUARTO PONTO DO TRUNCAMENTO — preencha com a quota lida antes e depois:");
  for (const l of linhas) {
    const cobrado = billedSecondsFor(l.dur);
    console.log(
      `  ${l.nome.slice(0, 28).padEnd(30)} entregue ${l.dur.toFixed(3)}s ⇒ previsão ` +
        `${cobrado * HEYGEN_VIDEO_COST.unitsPerBilledSecond} unidades (${cobrado} s × ` +
        `${HEYGEN_VIDEO_COST.unitsPerBilledSecond})`,
    );
  }
  console.log("  Se a quota debitada bater com a previsão, a regra deixa de ser dedução de três pontos.");
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--payloads")) {
    printPayloads();
    return;
  }
  if (argv.includes("--measure")) {
    await measure(argv.slice(argv.indexOf("--measure") + 1));
    return;
  }
  console.error("uso: controlRun.ts --payloads | --measure <arquivo>...");
  process.exit(2);
}

main().catch((err) => {
  console.error("controlRun falhou:", err);
  process.exit(1);
});
