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
