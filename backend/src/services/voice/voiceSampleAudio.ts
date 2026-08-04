/**
 * Medição e normalização da amostra de voz — a parte que precisa de ffmpeg.
 *
 * Separada da política (`voiceSample.ts`) de propósito: a política é pura e
 * pode ser exercitada por uma guarda em qualquer lugar, enquanto isto aqui
 * depende de dois binários e de disco. Misturar as duas obrigaria a guarda a
 * ter ffmpeg para verificar uma regra de negócio, e a primeira vez que isso
 * falhasse por ambiente a guarda seria dada como quebrada em vez de a regra.
 *
 * `ffmpeg` e `ffprobe` JÁ existem na imagem do backend (`/usr/bin`, medido no
 * bloco 5E) — nada a instalar.
 */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, writeFile, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { logEvent } from "../log/safeLog.js";
import { CLONE_SAMPLE_RATE_HZ } from "./voiceSample.js";

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${bin} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/**
 * Duração REAL do áudio, medida no arquivo.
 *
 * Devolve `null` quando não dá para medir, e o chamador trata isso como
 * recusa — nunca como "passou". A alternativa (assumir zero, ou assumir que
 * está bom) transformaria um arquivo corrompido em amostra aceita, e a
 * clonagem gastaria o slot antes de alguém descobrir.
 *
 * O formato do contêiner NÃO é passado ao ffprobe: deixar que ele detecte é o
 * que permite aceitar webm/opus vindo do MediaRecorder sem uma tabela de
 * mapeamento nossa, que envelheceria a cada navegador novo.
 */
export async function probeSampleDurationSeconds(buffer: Buffer): Promise<number | null> {
  const file = path.join(os.tmpdir(), `${randomUUID()}-sample`);
  try {
    await writeFile(file, buffer);
    const out = await run("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    const seconds = Number(out.trim());
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  } catch (err) {
    logEvent("error", "voice_sample_probe_failed", {
      detail: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    await unlink(file).catch(() => {});
  }
}

/**
 * Taxa de amostragem do áudio de entrada, em Hz. `null` quando não dá para ler.
 *
 * Desde o FECHAMENTO-1 ela NÃO decide a taxa de saída — a conversão fixa
 * `CLONE_SAMPLE_RATE_HZ`. O que ela ainda faz é registro: o log guarda a taxa
 * de origem ao lado da de destino, e sem isso não haveria como saber depois se
 * uma amostra a 24 kHz veio de uma captura de 48 kHz reamostrada ou já chegou
 * assim. É a diferença entre poder auditar a conversão e ter de confiar nela.
 */
export async function probeSampleRateHz(buffer: Buffer): Promise<number | null> {
  const file = path.join(os.tmpdir(), `${randomUUID()}-rate`);
  try {
    await writeFile(file, buffer);
    const out = await run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=sample_rate",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    const hz = Number(out.trim());
    return Number.isInteger(hz) && hz > 0 ? hz : null;
  } catch (err) {
    logEvent("error", "voice_sample_probe_failed", {
      stage: "sample_rate",
      detail: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    await unlink(file).catch(() => {});
  }
}

/**
 * Formato de saída da normalização: **WAV PCM 16 bit, mono, 24 kHz.**
 *
 * SEM PERDA DE CODIFICAÇÃO, desde o HIGIENE-1, e essa parte não mudou. O perfil
 * anterior era lossy sobre lossy: a captura do navegador já chega comprimida
 * (webm/opus), e transcodificá-la para mp3 128 kbps aplicava uma SEGUNDA passada
 * de compressão com perda sobre material que já tinha perdido informação. Os
 * artefatos das duas não se cancelam — eles se somam, e o que some primeiro é
 * exatamente a banda alta e a microdinâmica que caracterizam um timbre. O
 * fornecedor não recusa uma amostra pior: ele entrega um clone pior e consome o
 * slot, que não volta.
 *
 * A TAXA passou a ser FIXA em 24 kHz no FECHAMENTO-1, e é a única reversão
 * deliberada do perfil do HIGIENE-1. Lá ela era preservada da entrada, sob o
 * argumento de que reduzir taxa joga fora banda alta. O argumento continua certo
 * em geral e está errado NESTE ponto: a banda que a clonagem usa termina em
 * torno de 10 kHz, e 24 kHz de amostragem carrega até 12 kHz (Nyquist) — sobra
 * sobre a fala inteira. Os 48 kHz preservados dobravam o arquivo para transportar
 * banda que a clonagem descarta.
 *
 * O preço disso foi medido e não é teórico: a captura real de 2:33 do E2E-1, leve
 * na entrada (2,4 MB), virava 14,0 MB convertida e passava a ser RECUSADA pelo
 * teto de 10 MiB do fornecedor — uma gravação boa, barrada por bytes que não
 * carregavam informação útil. A 24 kHz a mesma captura cabe.
 *
 * A constante mora na política (`voiceSample.ts`) e não aqui porque é dela que
 * sai o teto de DURAÇÃO da amostra. Fixá-la aqui deixaria as duas réguas em
 * arquivos diferentes, que é exatamente a divergência que o FECHAMENTO-1 fechou.
 *
 * Mono continua: uma amostra de voz não tem informação estéreo útil, e dois
 * canais só dobram o arquivo sem acrescentar nada ao timbre. Se um dia apertar
 * de novo, o caminho é FLAC (sem perda e menor), nunca voltar para mp3.
 */
const OUTPUT_CODEC = "pcm_s16le";
const OUTPUT_CHANNELS = 1;
const OUTPUT_FILENAME = "voice-sample.wav";
const OUTPUT_MIME = "audio/wav";

export interface NormalizedSample {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  /** Taxa efetivamente gravada, em Hz. Sempre `CLONE_SAMPLE_RATE_HZ`. */
  sampleRateHz: number;
  /** Taxa da ENTRADA, medida. `null` quando não foi possível ler. */
  inputSampleRateHz: number | null;
}

/**
 * Converte a amostra para o formato de clonagem antes de mandar ao fornecedor.
 *
 * POR QUE CONVERTER, e não repassar o arquivo original: o `MediaRecorder` do
 * navegador grava webm/opus por padrão, e se o fornecedor recusar esse
 * contêiner a recusa chega depois de a tentativa já ter sido gasta. Converter
 * torna o que sai daqui invariante em relação ao navegador de quem gravou —
 * Chrome, Safari e um upload de arquivo produzem exatamente os mesmos bytes de
 * entrada para o fornecedor.
 *
 * Deliberadamente SEM filtro nenhum: nada de `afftdn`, nada de `loudnorm`. O
 * clone deve reproduzir a voz como ela é, e um redutor de ruído mal calibrado
 * come exatamente as características que a clonagem precisa capturar. O
 * tratamento agressivo existe do outro lado do fluxo (na síntese), onde o
 * material já é sintético e o objetivo é diferente.
 */
export async function normalizeVoiceSample(buffer: Buffer): Promise<NormalizedSample> {
  const workDir = os.tmpdir();
  const inputPath = path.join(workDir, `${randomUUID()}-voice-in`);
  const outputPath = path.join(workDir, `${randomUUID()}-voice-out.wav`);
  // A taxa da entrada não decide mais nada — a saída é fixa. Ela continua sendo
  // medida porque é a única forma de o log dizer DE ONDE a conversão veio: sem
  // ela, um "24000 Hz" na saída não distingue uma captura de 48 kHz reamostrada
  // de um arquivo que já chegou a 24 kHz.
  const inputSampleRateHz = await probeSampleRateHz(buffer);

  try {
    await writeFile(inputPath, buffer);
    await run("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      // Fixo, e é a régua de que sai o teto de duração da amostra. Ver o bloco
      // de `CLONE_SAMPLE_RATE_HZ` em `voiceSample.ts` para o porquê de 24 kHz
      // não perder nada que a clonagem use.
      "-ar",
      String(CLONE_SAMPLE_RATE_HZ),
      "-ac",
      String(OUTPUT_CHANNELS),
      "-c:a",
      OUTPUT_CODEC,
      outputPath,
    ]);
    const out = await readFile(outputPath);
    logEvent("info", "voice_sample_normalized", {
      inputBytes: buffer.length,
      outputBytes: out.length,
      codec: OUTPUT_CODEC,
      channels: OUTPUT_CHANNELS,
      sampleRateHz: CLONE_SAMPLE_RATE_HZ,
      inputSampleRateHz,
    });
    return {
      buffer: out,
      filename: OUTPUT_FILENAME,
      mimeType: OUTPUT_MIME,
      sampleRateHz: CLONE_SAMPLE_RATE_HZ,
      inputSampleRateHz,
    };
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
