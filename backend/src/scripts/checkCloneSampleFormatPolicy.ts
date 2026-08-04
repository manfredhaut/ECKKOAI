/**
 * A amostra que vai para a CLONAGEM não pode ter perda — provado convertendo.
 *
 * O defeito que esta guarda congela custou qualidade sem custar erro nenhum, e
 * é por isso que ele sobreviveu: até o HIGIENE-1 a rota transcodificava a
 * captura do navegador (webm/**opus**, já comprimido com perda) para **mp3 128
 * kbps** — uma segunda passada de compressão com perda sobre material que já
 * tinha perdido informação. Nada falhava. O fornecedor aceita, a clonagem
 * funciona, o slot é consumido, e o que sai é um clone pior do que precisava
 * ser. Não existe erro a observar: só um timbre um pouco mais chapado, que
 * ninguém consegue atribuir a nada.
 *
 * POR QUE ELA EXECUTA em vez de ler o código: "o formato é sem perda" é uma
 * afirmação sobre os BYTES que saem do ffmpeg, e a linha de comando é só a
 * intenção. Um `-ar` esquecido, um codec trocado, um filtro que reamostra —
 * qualquer um deles deixa a intenção intacta no fonte e muda o arquivo. Então a
 * guarda converte de verdade, com o `normalizeVoiceSample` de produção, e mede
 * a saída com `ffprobe` — medição INDEPENDENTE, não pela mesma função que o
 * produto usa para se auto-declarar.
 *
 * Custo zero de fornecedor: tudo acontece em `/tmp`, com áudio construído em
 * memória. Nenhum slot, nenhuma rede.
 */
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { checkNormalizedSampleSize, VOICE_SAMPLE_MAX_BYTES } from "../services/voice/voiceSample.js";
import { normalizeVoiceSample } from "../services/voice/voiceSampleAudio.js";

export interface CloneSampleFormatResult {
  failures: string[];
  notes: string[];
}

/**
 * Codecs que descartam informação. A lista é de CODEC, não de extensão: um
 * `.wav` pode conter mp3 dentro (WAVE_FORMAT_MPEGLAYER3), e um teste que
 * olhasse o nome do arquivo passaria por cima disso.
 */
const CODECS_COM_PERDA = ["mp3", "aac", "opus", "vorbis", "wmav2", "amr_nb", "amr_wb", "ac3"];

export const MUTANTS: Mutant[] = [
  {
    guard: "voz: amostra de clonagem sem perda",
    name: "a conversão volta a produzir mp3",
    kind: "obvio",
    // A regressão exata que existia até o HIGIENE-1. Nada mais no sistema
    // muda de cor: o arquivo continua sendo aceito pelo fornecedor, a política
    // de duração continua certa, o teto continua aplicado.
    file: "backend/src/services/voice/voiceSampleAudio.ts",
    find: `const OUTPUT_CODEC = "pcm_s16le";`,
    replace: `const OUTPUT_CODEC = "libmp3lame";`,
    expect: "codec com perda",
  },
  {
    guard: "voz: amostra de clonagem sem perda",
    name: "continua PCM, mas reamostra 48 kHz para 22,05 kHz",
    kind: "esperto",
    // O mutante que separa "sem perda" de "sem PERDER". O codec continua
    // `pcm_s16le`, a profundidade continua 16 bit, o arquivo continua sendo um
    // WAV legítimo e uma guarda que só olhasse o codec ficaria verde. Mas
    // metade da banda foi jogada fora antes de o fornecedor ver o áudio — e
    // para clonagem é justamente a banda alta que carrega o que distingue um
    // timbre. É a mesma classe de defeito do LIVE-2: o mecanismo certo,
    // aplicado sobre a entrada errada.
    file: "backend/src/services/voice/voiceSampleAudio.ts",
    find: `      ...(sampleRateHz === null ? [] : ["-ar", String(sampleRateHz)]),`,
    replace: `      "-ar",\n      "22050",`,
    expect: "reamostrou",
  },
  {
    guard: "voz: amostra de clonagem sem perda",
    name: "o teto do arquivo CONVERTIDO deixa de barrar",
    kind: "obvio",
    // Sem esta metade, a mudança para sem-perda cria um defeito novo: a captura
    // de 2:33 do E2E-1 é leve na entrada (2,4 MB) e vira ~14,0 MB convertida.
    // O fornecedor recusaria com um 4xx indistinguível de qualquer outro,
    // depois de a tentativa ter sido gasta.
    file: "backend/src/services/voice/voiceSample.ts",
    find: "  if (input.bytes <= maxBytes) return { ok: true };",
    replace: "  if (true) return { ok: true };",
    expect: "não foi barrada antes de chegar ao fornecedor",
  },
  {
    guard: "voz: amostra de clonagem sem perda",
    name: "amostra que CABE continua passando (contraponto)",
    kind: "esperto",
    expectGreen: true,
    // Uma política que recusasse tudo passaria no mutante acima sem distinguir
    // nada. Aqui o teto é empurrado para um valor absurdo, mas ainda finito: a
    // amostra pequena continua passando, e a guarda tem de continuar verde.
    file: "backend/src/services/voice/voiceSample.ts",
    find: "export const VOICE_SAMPLE_MAX_BYTES = 10 * 1024 * 1024;",
    replace: "export const VOICE_SAMPLE_MAX_BYTES = 11 * 1024 * 1024;",
    expect: "sem perda em",
  },
];

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (c) => {
      stdout += c.toString();
    });
    proc.stderr.on("data", (c) => {
      stderr += c.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve(stdout) : reject(new Error(`${bin} saiu com ${code}: ${stderr.slice(-800)}`)),
    );
  });
}

interface Sonda {
  codec: string;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}

/**
 * Mede o áudio com ffprobe. Deliberadamente NÃO usa `probeSampleRateHz` do
 * produto: verificar um mecanismo com o próprio mecanismo é como conferir uma
 * soma repetindo a mesma conta.
 */
async function sondar(buffer: Buffer): Promise<Sonda | null> {
  const file = path.join(os.tmpdir(), `${randomUUID()}-sonda`);
  try {
    await writeFile(file, buffer);
    const out = await run("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=codec_name,sample_rate,channels,bits_per_sample",
      "-of",
      "default=noprint_wrappers=1",
      file,
    ]);
    const campo = (nome: string): string =>
      out.split("\n").find((l) => l.startsWith(`${nome}=`))?.split("=")[1]?.trim() ?? "";
    return {
      codec: campo("codec_name"),
      sampleRate: Number(campo("sample_rate")),
      channels: Number(campo("channels")),
      bitsPerSample: Number(campo("bits_per_sample")),
    };
  } catch {
    return null;
  } finally {
    await unlink(file).catch(() => {});
  }
}

/** WAV PCM 16 bit mono construído em memória, com tom audível (não silêncio). */
function wavTom(sampleRate: number, seconds: number): Buffer {
  const amostras = Math.floor(sampleRate * seconds);
  const dados = Buffer.alloc(amostras * 2);
  for (let i = 0; i < amostras; i += 1) {
    // Duas senoides: uma grave e uma perto do teto de banda. A aguda é o ponto
    // — é ela que some quando alguém reamostra para menos, e um arquivo de
    // silêncio sobreviveria a qualquer degradação sem denunciar nada.
    const t = i / sampleRate;
    const v =
      Math.sin(2 * Math.PI * 220 * t) * 0.4 + Math.sin(2 * Math.PI * (sampleRate / 2.4) * t) * 0.3;
    dados.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dados.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dados.length, 40);
  return Buffer.concat([header, dados]);
}

/** Comprime para webm/opus — o que o MediaRecorder do navegador entrega. */
async function paraWebmOpus(wav: Buffer, sampleRate: number): Promise<Buffer | null> {
  const entrada = path.join(os.tmpdir(), `${randomUUID()}-in.wav`);
  const saida = path.join(os.tmpdir(), `${randomUUID()}-out.webm`);
  try {
    await writeFile(entrada, wav);
    await run("ffmpeg", [
      "-y",
      "-i",
      entrada,
      "-ar",
      String(sampleRate),
      "-ac",
      "1",
      "-c:a",
      "libopus",
      "-b:a",
      "64k",
      saida,
    ]);
    return await readFile(saida);
  } catch {
    return null;
  } finally {
    await unlink(entrada).catch(() => {});
    await unlink(saida).catch(() => {});
  }
}

const md5 = (b: Buffer): string => createHash("md5").update(b).digest("hex");

export async function checkCloneSampleFormatPolicy(): Promise<CloneSampleFormatResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // --- 1. o caminho REAL: webm/opus do navegador -> saída sem perda -------
  //
  // Este é o caso que acontece na produção. Uma entrada já comprimida com perda
  // é exatamente onde a segunda compressão fazia estrago, e é onde a mudança
  // tem de ser visível.
  const TAXA_NAVEGADOR = 48000;
  const original = wavTom(TAXA_NAVEGADOR, 2);
  const capturado = await paraWebmOpus(original, TAXA_NAVEGADOR);
  if (capturado === null) {
    failures.push(
      "voz: não consegui construir a captura webm/opus de prova (libopus ausente no ffmpeg da imagem?). " +
        "Verificador cego é pior que reprovar — sem esta conversão nada abaixo é medido.",
    );
    return { failures, notes };
  }

  const convertida = await normalizeVoiceSample(capturado);
  const saida = await sondar(convertida.buffer);
  const entrada = await sondar(capturado);
  if (saida === null || entrada === null) {
    failures.push("voz: ffprobe não leu a amostra convertida — a asserção de formato ficaria cega.");
    return { failures, notes };
  }

  if (CODECS_COM_PERDA.includes(saida.codec)) {
    failures.push(
      `voz: a amostra de clonagem sai em codec com perda ("${saida.codec}"). A captura do navegador JÁ ` +
        "chega comprimida; comprimir de novo é perda sobre perda, e os artefatos das duas se somam em " +
        "vez de se cancelarem. O fornecedor não recusa uma amostra pior — ele entrega um clone pior e " +
        "consome o slot, que não volta.",
    );
  }
  if (saida.bitsPerSample !== 16) {
    failures.push(
      `voz: a amostra de clonagem sai com ${saida.bitsPerSample} bits por amostra, não 16. ` +
        "8 bits é perda grosseira; 24 ou 32 são bytes a mais sem ganho para clonagem, e comem o teto " +
        "de tamanho do fornecedor mais depressa.",
    );
  }
  if (saida.channels !== 1) {
    failures.push(
      `voz: a amostra de clonagem sai com ${saida.channels} canais. Uma gravação de voz não tem ` +
        "informação estéreo útil, e o segundo canal só dobra o arquivo contra o teto de 10 MB.",
    );
  }
  if (saida.sampleRate < entrada.sampleRate) {
    failures.push(
      `voz: a conversão reamostrou de ${entrada.sampleRate} Hz para ${saida.sampleRate} Hz. Reduzir a ` +
        "taxa joga fora a banda alta — que é justamente onde mora o que distingue um timbre — e não " +
        "compensa nada: o arquivo já é PCM, não há codificador a agradar. Preserve a taxa da entrada.",
    );
  }

  notes.push(
    `voz: captura webm/opus ${entrada.sampleRate} Hz mono (${capturado.length} B, md5 ` +
      `${md5(capturado).slice(0, 8)}…) → ${saida.codec} ${saida.bitsPerSample} bit ` +
      `${saida.channels === 1 ? "mono" : `${saida.channels} canais`} ${saida.sampleRate} Hz ` +
      `(${convertida.buffer.length} B, md5 ${md5(convertida.buffer).slice(0, 8)}…) — sem perda em ` +
      `${convertida.filename}`,
  );

  // --- 2. a taxa é PRESERVADA, não fixada --------------------------------
  //
  // Três taxas, e a de 22,05 kHz é a que importa: se o código fixasse 44,1 kHz
  // (o valor antigo), esta entrada seria AUMENTADA — o que não perde informação
  // e passaria despercebido pela asserção de "não reduziu". A asserção é de
  // IGUALDADE por isso.
  for (const taxa of [48000, 44100, 22050]) {
    const amostra = wavTom(taxa, 1);
    const convertidaN = await normalizeVoiceSample(amostra);
    const sondada = await sondar(convertidaN.buffer);
    if (sondada === null) {
      failures.push(`voz: ffprobe não leu a saída de ${taxa} Hz.`);
      continue;
    }
    if (sondada.sampleRate !== taxa) {
      failures.push(
        `voz: a conversão reamostrou ${taxa} Hz para ${sondada.sampleRate} Hz. A taxa de saída tem de ` +
          "ser a da ENTRADA: fixar um número converte para cima quem gravou pior (bytes à toa) e para " +
          "baixo quem gravou melhor (perda gratuita).",
      );
    }
    if (convertidaN.sampleRateHz !== taxa) {
      failures.push(
        `voz: a conversão DECLARA ${convertidaN.sampleRateHz} Hz mas o arquivo tem ${sondada.sampleRate} Hz ` +
          `para uma entrada de ${taxa} Hz. O campo que o resto do sistema lê precisa bater com os bytes.`,
      );
    }
  }

  notes.push("voz: taxa de amostragem preservada em 48000, 44100 e 22050 Hz — nem reduz nem infla");

  // --- 3. o teto do arquivo CONVERTIDO ------------------------------------
  //
  // O defeito que a própria mudança para sem-perda cria. Sem esta asserção,
  // a captura de 2:33 já exercitada no E2E-1 passaria daqui e morreria no
  // fornecedor, com a tentativa gasta.
  const grande = checkNormalizedSampleSize({
    bytes: VOICE_SAMPLE_MAX_BYTES + 1,
    sampleRateHz: 48000,
  });
  if (grande.ok) {
    failures.push(
      "voz: uma amostra convertida ACIMA do teto do fornecedor não foi barrada antes de chegar ao " +
        `fornecedor. WAV 16 bit mono a 48 kHz ocupa ~5,5 MB por minuto, então a captura de 2:33 do ` +
        "E2E-1 — leve na entrada, 2,4 MB — vira ~14,0 MB convertida. A recusa dele chega como um 4xx " +
        "indistinguível dos outros, com a tentativa já gasta.",
    );
  } else if (!/\d+\s*segundos/.test(grande.message ?? "")) {
    failures.push(
      `voz: a recusa por tamanho convertido não diz quantos SEGUNDOS gravar. Ninguém que acabou de ` +
        `gravar converte megabyte em segundo de fala. Recebida: "${grande.message}"`,
    );
  }

  const cabe = checkNormalizedSampleSize({ bytes: 1024 * 1024, sampleRateHz: 48000 });
  if (!cabe.ok) {
    failures.push(
      "voz: uma amostra convertida de 1 MB foi barrada. Guarda que recusa uso legítimo é desligada na " +
        "primeira semana, e aí não protege mais nada.",
    );
  }

  const segundosNoTeto = Math.floor(VOICE_SAMPLE_MAX_BYTES / (48000 * 2));
  notes.push(
    `voz: teto do arquivo CONVERTIDO aplicado antes da rede — a ${(VOICE_SAMPLE_MAX_BYTES / (1024 * 1024)).toFixed(0)} MB ` +
      `do fornecedor cabem ~${segundosNoTeto} s de WAV 16 bit mono a 48 kHz, e a recusa diz a duração a mirar`,
  );

  return { failures, notes };
}
