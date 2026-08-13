/**
 * SONDA DE CONTRATO da fal — roda o orquestrador REAL, etapa a etapa, e imprime
 * o corpo CRU de cada resposta.
 *
 *   # só o upload (NÃO é tarifado): mede o contrato de storage
 *   docker compose exec -T backend npx tsx src/scripts/probeFalPipeline.ts \
 *     --tenant <uuid> --ate upload
 *
 *   # + a composição (~US$ 0,08)
 *   … --tenant <uuid> --ate compor --teto 0.10
 *
 *   # + a animação (~US$ 1,00) e a sincronia
 *   … --tenant <uuid> --ate narrar --teto 1.20
 *   … --tenant <uuid> --teto 2.00
 *
 * ┌─ Por que o orquestrador de produção, e não um script paralelo ──────────┐
 * │ São 484 linhas escritas contra contrato DEDUZIDO. Um script paralelo     │
 * │ mediria o contrato da fal e não mediria o nosso código — e é o nosso     │
 * │ que vai para produção. Rodando `runFalPipeline`, tudo que a sonda        │
 * │ exercita é o caminho real: o mesmo payload, o mesmo polling, o mesmo     │
 * │ diário, o mesmo teto.                                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Dinheiro ──────────────────────────────────────────────────────────────┐
 * │ `--teto` é passado ao orquestrador e o porteiro recusa ANTES de cada     │
 * │ submissão. `--ate` encerra a corrida numa etapa, sem disparar as         │
 * │ seguintes. Os dois juntos são o que permite medir uma etapa por vez sem  │
 * │ pagar as outras.                                                         │
 * │                                                                          │
 * │ Não consome `consumeLiveGeneration()` nem crédito de tenant: a sonda NÃO │
 * │ é o produto, e gastar orçamento de sessão aqui esconderia do fluxo real  │
 * │ o que ele tem disponível. O que ela respeita é o teto em dólares.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { pool } from "../db/pool.js";
import { falUpload, resolveFalApiKey } from "../services/providers/falClient.js";
import { getCredential } from "../services/credentialLookup.js";
import { isFixtureMode } from "../services/providers/providerMode.js";
import {
  PIPELINE_CHARS_PER_SECOND,
  PIPELINE_MAX_CHARS,
  PIPELINE_TARGET_SECONDS,
  runFalPipeline,
  type EtapaDoPipeline,
} from "../services/video/falPipeline.js";
import { abrirCorrida, criarDiarioNoBanco, fecharCorrida } from "../services/video/falPipelineJournal.js";

const argv = process.argv.slice(2);
function arg(nome: string): string | null {
  const i = argv.indexOf(nome);
  return i >= 0 ? argv[i + 1] ?? null : null;
}

/**
 * A voz é REUSADA, sempre. MEDIDO em 13/08: a conta tem 10 vozes próprias de
 * 10 slots — clonar aqui seria recusado pela nossa régua antes de sair.
 */
const VOZ_PADRAO = "0hQuq0q2JEk1SY4lZaM9";

const ROTEIRO_PADRAO = "Oi! Este é um teste do pipeline novo. Dez segundos, nada mais.";

async function main(): Promise<void> {
  const tenantId = arg("--tenant");
  if (!tenantId) {
    console.error("Faltou --tenant <uuid>.");
    process.exit(2);
  }
  const ate = (arg("--ate") ?? "") as EtapaDoPipeline | "upload" | "";
  const teto = Number(arg("--teto") ?? "0.10");
  const ROTEIRO = arg("--roteiro") ?? ROTEIRO_PADRAO;
  const VOZ = arg("--voz") ?? VOZ_PADRAO;
  const PROMPT =
    arg("--prompt") ??
    "Retrato de meio corpo da mesma pessoa, jaleco branco, fundo de consultório claro e desfocado, " +
      "iluminação suave, olhando para a câmera, boca fechada e expressão neutra.";

  if (isFixtureMode()) {
    console.error(
      "PROVIDER_MODE=fixture: a sonda não mediria contrato nenhum — o falClient desvia antes da rede.\n" +
        "Rode com o container em live.",
    );
    process.exit(2);
  }

  const cred = await getCredential(tenantId, "avatar");
  if (!cred || cred.vendor !== "fal") {
    console.error(
      `Este tenant não tem credencial de avatar do vendor "fal" (tem: ${cred?.vendor ?? "nenhuma"}).\n` +
        "Semeie com src/scripts/seedFalKey.ts antes.",
    );
    process.exit(2);
  }
  const apiKey = await resolveFalApiKey(tenantId);

  console.log(
    JSON.stringify({
      etapa: "inicio",
      tenantId,
      ate: ate || "(tudo)",
      tetoUsd: teto,
      roteiroChars: ROTEIRO.length,
      tetoDeChars: PIPELINE_MAX_CHARS,
      segundosEstimados: Number((ROTEIRO.length / PIPELINE_CHARS_PER_SECOND).toFixed(4)),
      targetSeconds: PIPELINE_TARGET_SECONDS,
    }),
  );

  // ---------------------------------------------------------------- UPLOAD
  // Primeiro e sozinho: é a única chamada real que NÃO é tarifada, então é o
  // contrato que se pode medir sem decidir nada sobre dinheiro.
  const foto = await lerFoto();
  const fileUrl = await falUpload(apiKey, foto, "image/jpeg", "sonda.jpg");
  console.log(JSON.stringify({ etapa: "upload", ok: true, fileUrl }));
  if (ate === "upload") {
    await pool.end();
    return;
  }

  // ------------------------------------------------------------- PIPELINE
  const runId = await abrirCorrida({
    tenantId,
    script: ROTEIRO,
    targetSeconds: PIPELINE_TARGET_SECONDS,
    charsPerSecond: PIPELINE_CHARS_PER_SECOND,
  });
  console.log(JSON.stringify({ etapa: "corrida", runId }));

  try {
    const r = await runFalPipeline({
      apiKeyFal: apiKey,
      apiKeyElevenLabs: (await getCredential(tenantId, "voice"))?.apiKey ?? "",
      voiceId: VOZ,
      script: ROTEIRO,
      fotoBase: foto,
      fotoMimeType: "image/jpeg",
      promptDeComposicao: PROMPT,
      diario: criarDiarioNoBanco(runId),
      tetoDeGastoUsd: teto,
      pararApos: (ate || undefined) as EtapaDoPipeline | undefined,
    });
    await fecharCorrida(runId, "completed");
    console.log(JSON.stringify({ etapa: "fim", ...r }));

    if (r.videoUrl) {
      const destino = path.join(config.uploadsDir, "_prova", "fal-sonda");
      await mkdir(destino, { recursive: true });
      const arquivo = path.join(destino, `${runId}.mp4`);
      const resp = await fetch(r.videoUrl);
      await writeFile(arquivo, Buffer.from(await resp.arrayBuffer()));
      console.log(JSON.stringify({ etapa: "salvo", arquivo }));
    }
  } catch (err) {
    await fecharCorrida(runId, "failed", err instanceof Error ? err.message : String(err));
    console.error(JSON.stringify({ etapa: "falhou", motivo: err instanceof Error ? err.message : String(err) }));
  }

  // Os corpos CRUS, como ficaram gravados. É o que a sonda existe para colher.
  const { rows } = await pool.query(
    `SELECT etapa, ordem, endpoint_id, request_id, status, raw_response
     FROM fal_pipeline_steps WHERE run_id = $1 ORDER BY ordem`,
    [runId],
  );
  for (const linha of rows) console.log(JSON.stringify({ etapa: "cru", ...linha }));

  await pool.end();
}

/** A foto de entrada. Usa a primeira que houver em `uploads/_prova/`. */
async function lerFoto(): Promise<Buffer> {
  const caminho = arg("--foto");
  if (caminho) return readFile(caminho);
  throw new Error(
    "Faltou --foto <caminho>. A sonda não inventa imagem: a composição é sobre um rosto real, e " +
      "mandar um placeholder gastaria US$ 0,08 para medir o contrato com a entrada errada.",
  );
}

main().catch((err) => {
  console.error("probeFalPipeline falhou:", err instanceof Error ? err.message : err);
  process.exit(1);
});
