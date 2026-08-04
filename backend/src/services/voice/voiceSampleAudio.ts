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
 * Existe para que a normalização PRESERVE a taxa original em vez de fixar uma.
 * A diferença importa: o `MediaRecorder` grava opus a 48 kHz, e o perfil antigo
 * reamostrava tudo para 44,1 kHz — uma conversão que não melhora nada e joga
 * fora informação de quem gravou melhor.
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
 * Formato de saída da normalização: **WAV PCM 16 bit, mono, taxa preservada.**
 *
 * MUDOU no HIGIENE-1, e a razão é que o perfil anterior era lossy sobre lossy.
 * A captura do navegador já chega comprimida (webm/opus); transcodificá-la para
 * mp3 128 kbps aplica uma SEGUNDA passada de compressão com perda, sobre um
 * material que já perdeu informação uma vez. Os artefatos das duas não se
 * cancelam — eles se somam, e o que some primeiro é exatamente a banda alta e a
 * microdinâmica que caracterizam um timbre. Para clonagem instantânea isso é o
 * pior lugar possível para economizar bytes: o fornecedor não recusa uma amostra
 * pior, ele entrega um clone pior e consome o slot, que não volta.
 *
 * PCM não tem taxa de bits a escolher e não tem codificador a calibrar — ele é o
 * áudio decodificado. O custo é tamanho: 16 bit mono a 48 kHz dá ~5,5 MB por
 * minuto, então o teto de 10 MB do fornecedor passa a limitar a amostra em torno
 * de 1,8 minuto. Isso é folgado para o mínimo de 60 s e para o recomendado de
 * 90 s da política — ver `voiceSample.ts`. Se um dia apertar, o caminho é
 * FLAC (sem perda e menor), nunca voltar para mp3.
 *
 * A taxa de amostragem é PRESERVADA, não fixada: reamostrar 48 kHz para 44,1 kHz
 * é uma perda gratuita, e por não ser divisor inteiro é a conversão mais suja
 * das duas direções. Quando a leitura da taxa falha, o `-ar` é omitido e o
 * ffmpeg preserva a da entrada sozinho — nunca há queda.
 *
 * Mono continua: uma amostra de voz não tem informação estéreo útil, e dois
 * canais só dobram o arquivo sem acrescentar nada ao timbre.
 */
const OUTPUT_CODEC = "pcm_s16le";
const OUTPUT_CHANNELS = 1;
const OUTPUT_FILENAME = "voice-sample.wav";
const OUTPUT_MIME = "audio/wav";

export interface NormalizedSample {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  /** Taxa efetivamente gravada, em Hz. `null` quando o ffmpeg escolheu sozinho. */
  sampleRateHz: number | null;
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
  const sampleRateHz = await probeSampleRateHz(buffer);

  try {
    await writeFile(inputPath, buffer);
    await run("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      // Só entra na linha de comando quando foi MEDIDO. Sem medição, omitir é
      // mais seguro que chutar: o ffmpeg preserva a taxa da entrada por padrão,
      // e um número fixo aqui é justamente o defeito que esta mudança corrige.
      ...(sampleRateHz === null ? [] : ["-ar", String(sampleRateHz)]),
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
      sampleRateHz,
    });
    return { buffer: out, filename: OUTPUT_FILENAME, mimeType: OUTPUT_MIME, sampleRateHz };
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
