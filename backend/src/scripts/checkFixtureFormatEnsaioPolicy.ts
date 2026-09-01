/**
 * V34, item 19 — ENSAIO de fixture cobrindo 16:9, 9:16, 1:1 e 4:5, com as
 * dimensões conferidas por `ffprobe` — não por aritmética.
 *
 * ┌─ O que isto prova, e por que os outros três não bastam sozinhos ────────┐
 * │ `checkNormalAspectRatioPolicy.ts` prova que o CÓDIGO chama              │
 * │ `aspectRatioParaFornecedor`/`deriveVariantsForVideo` nos lugares certos  │
 * │ (âncora de texto — barato, mas não mede nada). `checkDerivationPolicy   │
 * │ .ts` mede a invariante do SUJEITO (nunca amplia) para os 4 formatos,    │
 * │ mas contra uma fixture 9:16 SEM preenchimento diferente desta. Nenhum   │
 * │ dos dois roda a cadeia REAL que este bloco introduziu:                  │
 * │ `deriveVariantsForVideo` chamada com o master 9:16 do produto e         │
 * │ conferida por `ffprobe` que a saída de CADA formato pedido tem a        │
 * │ PROPORÇÃO pedida — inclusive 4:5, que antes desta rodada nunca tinha    │
 * │ sido gerado por este caminho (V25 removeu a opção da tela antes de      │
 * │ qualquer vídeo real ser derivado para ela).                             │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 *  G-1  16:9, 9:16 e 1:1: a saída REAL (arquivo no disco, medido por
 *       `ffprobe`) mede uma proporção dentro de 1% da pedida.
 *  G-2  4:5 (o formato que este bloco reativa): a saída REAL mede 0,8 ± 1%
 *       — não é o master (9:16 = 0,5625) passando disfarçado.
 *
 * `deriveOneVariant` (deriveVariants.ts) devolve `width`/`height` da conta
 * PLANEJADA (`plan.canvas`), não do arquivo — só o `subject` é medido por
 * `ffprobe` ali dentro. Este ensaio fecha exatamente essa lacuna: ffprobe do
 * ARQUIVO DE SAÍDA em si, não da conta que o previu nem do sujeito dentro
 * dele. Usa `deriveOneVariant` (não `deriveVariantsForVideo`) de propósito —
 * o wrapper grava em `video_variants`, com FK real para `videos`/`tenants`,
 * e este ensaio não tem vídeo real para apontar; `deriveOneVariant` é a
 * MESMA cadeia de ffmpeg, sem o registro em banco.
 *
 * Custo: ZERO. `ffmpeg`/`ffprobe` reais, fixture local versionada, escrita
 * numa pasta de tenant descartável (limpa no `finally`).
 */
import { mkdir, copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { probeVideo, ffmpegAvailable } from "../services/video/ffmpeg.js";
import { deriveOneVariant } from "../services/video/deriveVariants.js";
import { FIXTURES_DIR } from "../services/providers/fixtureProvider.js";

const TENANT_DA_PROVA = "_v34-ensaio-formatos";

const ALVOS: { aspect: string; razao: number }[] = [
  { aspect: "16:9", razao: 16 / 9 },
  { aspect: "9:16", razao: 9 / 16 },
  { aspect: "1:1", razao: 1 },
  { aspect: "4:5", razao: 4 / 5 },
];

export interface FixtureFormatEnsaioResult {
  failures: string[];
  notes: string[];
}

export async function checkFixtureFormatEnsaioPolicy(): Promise<FixtureFormatEnsaioResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const disponivel = await ffmpegAvailable();
  if (!disponivel.ok) {
    notes.push(
      `ensaio de formatos: ffmpeg indisponível (${disponivel.detail.slice(0, 60)}) — o ensaio dos 4 ` +
        "formatos (16:9/9:16/1:1/4:5) NÃO foi executado nesta passada.",
    );
    return { failures, notes };
  }

  const tenantDir = path.join(config.uploadsDir, TENANT_DA_PROVA);
  await mkdir(tenantDir, { recursive: true });
  const masterPath = path.join(tenantDir, `${randomUUID()}-master.mp4`);

  try {
    await copyFile(path.join(FIXTURES_DIR, "simulated-video-9x16.mp4"), masterPath);
    const masterGeo = await probeVideo(masterPath);

    const medidos: string[] = [];
    for (const alvo of ALVOS) {
      let variante;
      try {
        variante = await deriveOneVariant(masterPath, alvo.aspect, TENANT_DA_PROVA);
      } catch (err) {
        failures.push(
          `ensaio de formatos: deriveOneVariant(${alvo.aspect}) falhou — ` +
            `${err instanceof Error ? err.message.slice(0, 160) : err}.`,
        );
        continue;
      }

      const arquivoReal = path.join(config.uploadsDir, variante.outputUrl.replace(/^\/uploads\//, ""));
      const saida = await probeVideo(arquivoReal);
      await rm(arquivoReal, { force: true });
      const razaoReal = saida.width / saida.height;
      const erro = Math.abs(razaoReal - alvo.razao) / alvo.razao;

      if (erro > 0.01) {
        failures.push(
          `ensaio de formatos: ${alvo.aspect} saiu ${saida.width}×${saida.height} (proporção ` +
            `${razaoReal.toFixed(4)}), esperado ~${alvo.razao.toFixed(4)} (erro ${(erro * 100).toFixed(2)}%, ` +
            "acima de 1% tolerado). A derivação não está entregando o formato pedido no ARQUIVO real.",
        );
      }

      medidos.push(`${alvo.aspect}=${saida.width}×${saida.height} (${razaoReal.toFixed(4)})`);
    }

    if (failures.length === 0) {
      notes.push(
        `ensaio de formatos: master 9:16 real (${masterGeo.width}×${masterGeo.height}) derivado para os 4 ` +
          "formatos do produto por deriveOneVariant (ffmpeg real), cada ARQUIVO DE SAÍDA medido por " +
          `ffprobe dentro de 1% da proporção pedida — ${medidos.join(", ")}`,
      );
    }
  } catch (err) {
    failures.push(
      `ensaio de formatos: falhou ao rodar (${err instanceof Error ? err.message.slice(0, 160) : err}).`,
    );
  } finally {
    await rm(tenantDir, { recursive: true, force: true }).catch(() => {});
  }

  return { failures, notes };
}
