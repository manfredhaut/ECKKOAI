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
 * Formato de saída da normalização.
 *
 * mp3 mono 128 kbps é o mesmo perfil que `audioProcessing.ts` já usa para o
 * áudio sintetizado, e é o único formato deste projeto que atravessou uma
 * chamada real ao fornecedor com sucesso. Reaproveitar o perfil provado é
 * preferível a escolher um teoricamente melhor e descobrir a recusa com o
 * slot já consumido.
 *
 * Mono não é economia: uma amostra de voz não tem informação estéreo útil, e
 * dois canais só dobram o arquivo. 128 kbps dá ~0,96 MB por minuto, então
 * 2 minutos ocupam ~1,9 MB — bem abaixo do teto de 10 MB do fornecedor.
 */
const OUTPUT_SAMPLE_RATE = 44100;
const OUTPUT_CHANNELS = 1;
const OUTPUT_BITRATE = "128k";

export interface NormalizedSample {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

/**
 * Converte a amostra para o formato provado antes de mandar ao fornecedor.
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
  const outputPath = path.join(workDir, `${randomUUID()}-voice-out.mp3`);

  try {
    await writeFile(inputPath, buffer);
    await run("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-vn",
      "-ar",
      String(OUTPUT_SAMPLE_RATE),
      "-ac",
      String(OUTPUT_CHANNELS),
      "-c:a",
      "libmp3lame",
      "-b:a",
      OUTPUT_BITRATE,
      outputPath,
    ]);
    const out = await readFile(outputPath);
    logEvent("info", "voice_sample_normalized", {
      inputBytes: buffer.length,
      outputBytes: out.length,
    });
    return { buffer: out, filename: "voice-sample.mp3", mimeType: "audio/mpeg" };
  } finally {
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}
