/**
 * Execução de ffmpeg e ffprobe. Sem dependência nova, e por escolha.
 *
 * `fluent-ffmpeg` foi avaliado e descartado: o que ele oferece de pronto para
 * este caso é `pad`, que preenche as laterais com COR SÓLIDA. A política deste
 * projeto preenche com uma extensão desfocada do próprio quadro, o que exige
 * `split` + `overlay` — montado à mão de qualquer jeito. A dependência traria
 * uma camada a manter sem substituir uma linha do que importa.
 *
 * Os argumentos viajam sempre como ARRAY, nunca como string de shell. Este
 * repositório vive num caminho com espaço e acento ("AVATAR VIDEO MÓDULO"), e
 * uma linha montada à mão quebra ali — sendo que a correção improvisada de
 * sempre (aspas no lugar errado) só move o defeito para o primeiro nome de
 * arquivo estranho.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logEvent } from "../log/safeLog.js";

const run = promisify(execFile);

/** Teto de tempo por invocação. Um ffmpeg pendurado seguraria a requisição. */
const TIMEOUT_MS = 10 * 60 * 1000;

export interface VideoGeometry {
  width: number;
  height: number;
  durationSeconds: number;
  codec: string;
}

export class FfmpegUnavailableError extends Error {
  constructor(binario: string, causa: string) {
    super(
      `${binario} não está disponível neste ambiente (${causa}). A derivação de formatos depende ` +
        "dele; sem ffmpeg o produto só consegue entregar a proporção que o fornecedor gerou.",
    );
    this.name = "FfmpegUnavailableError";
  }
}

/**
 * Geometria REAL de um arquivo, lida do arquivo.
 *
 * Todo número de dimensão deste bloco passa por aqui em vez de sair da nossa
 * aritmética — a conta prevê, o `ffprobe` constata, e é a diferença entre as
 * duas que revelaria um erro no gerador de filtro.
 */
export async function probeVideo(filePath: string): Promise<VideoGeometry> {
  let stdout: string;
  try {
    ({ stdout } = await run(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,codec_name",
        "-show_entries", "format=duration",
        "-of", "json",
        filePath,
      ],
      { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
    ));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT/.test(msg)) throw new FfmpegUnavailableError("ffprobe", "binário não encontrado");
    throw new Error(`ffprobe falhou em ${filePath}: ${msg}`);
  }

  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width?: number; height?: number; codec_name?: string }>;
    format?: { duration?: string };
  };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream?.height) {
    throw new Error(
      `ffprobe não encontrou stream de vídeo em ${filePath}. Arquivo de áudio, arquivo truncado, ` +
        "ou uma página de erro salva com extensão de vídeo — os três já aconteceram neste projeto.",
    );
  }

  return {
    width: stream.width,
    height: stream.height,
    durationSeconds: Number(parsed.format?.duration ?? 0),
    codec: stream.codec_name ?? "desconhecido",
  };
}

export interface FfmpegRunResult {
  /** Tempo de parede da transcodificação. Vai para a tela, ver Fase 5.5. */
  elapsedMs: number;
}

/** Executa ffmpeg com os argumentos já montados. */
export async function runFfmpeg(args: string[], context: string): Promise<FfmpegRunResult> {
  const started = Date.now();
  try {
    await run("ffmpeg", args, { timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/ENOENT/.test(msg)) throw new FfmpegUnavailableError("ffmpeg", "binário não encontrado");
    // A saída do ffmpeg não carrega credencial — os argumentos são caminhos de
    // arquivo local —, mas passa pelo sumidouro como todo o resto: a regra é
    // não haver exceção, senão a próxima exceção é a que vaza.
    logEvent("error", "ffmpeg_failed", { context, detail: msg });
    throw new Error(`ffmpeg falhou (${context}): ${msg}`);
  }
  const elapsedMs = Date.now() - started;
  logEvent("info", "ffmpeg_ok", { context, elapsedMs });
  return { elapsedMs };
}

/** ffmpeg e ffprobe estão instalados? Usado pelo preflight e pelo gate. */
export async function ffmpegAvailable(): Promise<{ ok: boolean; detail: string }> {
  try {
    const { stdout } = await run("ffmpeg", ["-version"], { timeout: 30_000 });
    return { ok: true, detail: stdout.split("\n")[0]?.trim() ?? "ffmpeg presente" };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message.split("\n")[0] : String(err) };
  }
}

/**
 * O ÚLTIMO QUADRO de um vídeo — BLOCO FRACOES-1, 28/08/2026, item 2 do plano
 * (`docs-internal/plano-fracoes-2026-08-28.md`).
 *
 * `videoUrl` é lido DIRETO pelo ffmpeg (aceita `https://` como entrada) — sem
 * baixar bytes para cá antes, porque o binário já sabe fazer isso e um
 * download manual só duplicaria a mesma leitura de rede.
 *
 * A técnica: probe a duração real (`probeVideo`), busca `duração − 0,1 s`
 * (nunca negativo) e extrai 1 quadro dali — mais confiável que `-sseof`, que
 * em clipes muito curtos pode acabar buscando antes do início.
 */
export async function extractLastFrame(videoUrl: string, outputImagePath: string): Promise<void> {
  const geometria = await probeVideo(videoUrl);
  const buscarEm = Math.max(0, geometria.durationSeconds - 0.1);
  await runFfmpeg(
    [
      "-y",
      "-ss", String(buscarEm),
      "-i", videoUrl,
      "-frames:v", "1",
      "-update", "1",
      "-q:v", "2",
      outputImagePath,
    ],
    "extractLastFrame",
  );
}

/**
 * CONCATENA N vídeos MUDOS numa saída só — BLOCO FRACOES-1, item 3 do plano.
 *
 * `videoUrls` também são lidos DIRETO por URL, um `-i` por entrada — mesma
 * razão de `extractLastFrame`.
 *
 * SEMPRE usa o filtro `concat` (nunca o demuxer `concat -c copy`): o POC
 * (`POC-MOTORES/05-fracoes/`, 21/08) MEDIU que o Wan não reproduz a mesma
 * dimensão de pixel entre chamadas (1284×716 numa, 1286×716 noutra, mesma
 * `resolution` pedida nas duas) — copiar direto falha ou produz vídeo
 * quebrado nesse caso, e não há como saber ANTES se vai divergir. `scale` +
 * `setsar=1` para a geometria do PRIMEIRO vídeo, antes do `concat`, absorve a
 * divergência sempre, ao custo de recodificar mesmo quando as dimensões já
 * batiam — o custo é tempo de CPU local, não dinheiro de fornecedor.
 */
export async function concatVideos(videoUrls: string[], outputPath: string): Promise<void> {
  if (videoUrls.length === 0) {
    throw new Error("concatVideos: lista de vídeos vazia — nada para concatenar.");
  }
  if (videoUrls.length === 1) {
    // Um vídeo só: "concatenar" é só trazer para o formato de saída
    // combinado, sem filtro de concat nenhum (que exigiria N>=2 entradas).
    await runFfmpeg(["-y", "-i", videoUrls[0], "-c:v", "libx264", "-an", outputPath], "concatVideos-unico");
    return;
  }

  const primeira = await probeVideo(videoUrls[0]);
  const inputs = videoUrls.flatMap((url) => ["-i", url]);
  const scaled = videoUrls
    .map((_, i) => `[${i}:v]scale=${primeira.width}:${primeira.height},setsar=1[v${i}]`)
    .join(";");
  const concatInputs = videoUrls.map((_, i) => `[v${i}]`).join("");
  const filterComplex = `${scaled};${concatInputs}concat=n=${videoUrls.length}:v=1:a=0[outv]`;

  await runFfmpeg(
    ["-y", ...inputs, "-filter_complex", filterComplex, "-map", "[outv]", "-c:v", "libx264", outputPath],
    "concatVideos",
  );
}
