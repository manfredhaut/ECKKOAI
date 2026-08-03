/**
 * Sonda de PREENCHIMENTO — bloco 5F.
 *
 * ---------------------------------------------------------------------------
 * PREENCHIMENTO NÃO É CONTEÚDO, E CONFUNDIR OS DOIS ESTRAGA TRÊS COISAS
 *
 * O 5E mediu que o master 9:16 da HeyGen chega com 57% de barra branca: o
 * conteúdo útil ocupa 720×548 num quadro de 720×1280. O fornecedor recebeu uma
 * imagem mais larga que alta e completou o vertical com barras — não compôs
 * nada para vertical.
 *
 * Tratar essa barra como imagem produz três defeitos, e os três já estavam no
 * produto:
 *
 *  1. A derivação punha uma moldura desfocada em volta de um quadro que JÁ era
 *     moldura. A cópia B de 02/08 foi descartada por "ampliar 1,5×", o que era
 *     verdade e não era o problema principal.
 *  2. A regra "o sujeito nunca é cortado" passava a proteger a barra branca.
 *     Ela não é sujeito: é preenchimento do fornecedor, e removê-la não corta
 *     imagem nenhuma.
 *  3. Os alvos e o aviso "abaixo da especificação" eram calculados sobre a
 *     resolução do QUADRO, inflada pelo preenchimento. A régua estava medindo
 *     a barra.
 * ---------------------------------------------------------------------------
 *
 * COMO A MEDIÇÃO É FEITA, e por que não é `cropdetect`
 *
 * `cropdetect` procura borda PRETA. A daqui é branca, e por isso ele devolveu
 * o quadro inteiro quando foi tentado no 5E — um falso "sem preenchimento" que
 * teria encerrado a investigação.
 *
 * O que funciona é o perfil de luminância, a técnica que já tinha achado a
 * barra. Aqui ela é feita de uma vez: o quadro sai do ffmpeg como luminância
 * crua (`-pix_fmt gray -f rawvideo`), e a varredura acontece em memória. Uma
 * chamada de ffmpeg por quadro amostrado, em vez de uma por faixa.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { logEvent } from "../log/safeLog.js";
import { probeVideo, type VideoGeometry } from "./ffmpeg.js";

const run = promisify(execFile);

/**
 * Desvio máximo de luminância DENTRO de uma linha para ela contar como
 * preenchimento sólido. Uma barra chapada mede perto de 0; qualquer textura,
 * ruído de compressão ou detalhe sobe rápido. 2,0 dá folga para o ruído de
 * h264 sem aceitar imagem.
 */
const UNIFORM_STDDEV_MAX = 2.0;

/**
 * Diferença máxima de brilho ENTRE as linhas de preenchimento de um mesmo
 * lado. É o que separa uma barra chapada de um gradiente: um degradê tem cada
 * linha uniforme em si mesma e diferente da vizinha, e recortá-lo como se
 * fosse barra comeria imagem de verdade.
 */
const UNIFORM_BETWEEN_LINES_MAX = 3.0;

/** Quadros amostrados. Um só decidiria a partir de um instante atípico. */
const SAMPLE_POSITIONS = [0.15, 0.5, 0.85];

/**
 * Tolerância entre quadros, em pixels. Preenchimento é estático por natureza;
 * se as fronteiras dançam de um quadro para outro, o que se está medindo não é
 * barra — é a imagem.
 */
const FRAME_AGREEMENT_TOLERANCE = 2;

export interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PaddingVerdict =
  /** Nenhum preenchimento detectável: o quadro é todo conteúdo. */
  | "clean"
  /** Preenchimento sólido e estável nos quatro lados medidos. Recortável. */
  | "padded"
  /**
   * Há borda suspeita, mas ela NÃO é uniforme (gradiente, textura, sombra) ou
   * não é estável entre quadros. **Não se recorta.** Um recorte com fronteira
   * inventada come rosto, e o erro é irreversível.
   */
  | "pending";

export interface PaddingProbeResult {
  verdict: PaddingVerdict;
  /** Geometria do arquivo. */
  frame: { width: number; height: number };
  /** Geometria do que sobra depois de tirar o preenchimento. */
  content: { width: number; height: number };
  /** Recorte a aplicar. `null` quando não se deve recortar (clean ou pending). */
  crop: CropBox | null;
  /** Proporção do QUADRO — o que o arquivo declara ser. */
  frameAspect: number;
  /**
   * Proporção do CONTEÚDO — o que o arquivo de fato mostra. São números
   * diferentes sempre que há preenchimento, e o produto precisa dos dois: um
   * diz onde o vídeo cabe, o outro diz quanta imagem existe.
   */
  contentAspect: number;
  /** Fração do quadro que é preenchimento, de 0 a 1. */
  paddingFraction: number;
  /** Motivo em pt-BR, pronto para log e para a tela. */
  reason: string;
}

interface Bounds {
  top: number;
  bottom: number;
  left: number;
  right: number;
  uniform: boolean;
}

/** Extrai um quadro como luminância crua, um byte por pixel. */
async function readGrayFrame(filePath: string, atSeconds: number, geo: VideoGeometry): Promise<Buffer> {
  const { stdout } = await run(
    "ffmpeg",
    [
      "-v", "error",
      "-ss", atSeconds.toFixed(3),
      "-i", filePath,
      "-frames:v", "1",
      "-pix_fmt", "gray",
      "-f", "rawvideo",
      "-",
    ],
    {
      timeout: 120_000,
      maxBuffer: 256 * 1024 * 1024,
      encoding: "buffer",
    },
  );
  const esperado = geo.width * geo.height;
  if (stdout.length < esperado) {
    throw new Error(
      `quadro incompleto em ${atSeconds.toFixed(2)}s: ${stdout.length} bytes, esperado ${esperado}`,
    );
  }
  return stdout.subarray(0, esperado);
}

interface LineStats {
  mean: number;
  stddev: number;
}

function statsOf(values: Iterable<number>, count: number): LineStats {
  let soma = 0;
  let somaQuadrados = 0;
  for (const v of values) {
    soma += v;
    somaQuadrados += v * v;
  }
  const mean = soma / count;
  const variancia = Math.max(0, somaQuadrados / count - mean * mean);
  return { mean, stddev: Math.sqrt(variancia) };
}

function* rowValues(data: Buffer, width: number, y: number): Generator<number> {
  const base = y * width;
  for (let x = 0; x < width; x += 1) yield data[base + x]!;
}

function* colValues(data: Buffer, width: number, height: number, x: number): Generator<number> {
  for (let y = 0; y < height; y += 1) yield data[y * width + x]!;
}

/**
 * Fronteiras do conteúdo num quadro, caminhando de fora para dentro.
 *
 * A caminhada para na primeira linha que NÃO é uniforme. Isso é deliberado:
 * uma linha isolada de imagem escura no meio da barra não deve reabrir a
 * varredura, e parar cedo erra sempre para o lado de recortar de menos — que é
 * o erro barato. Recortar demais come rosto.
 */
function boundsOf(data: Buffer, width: number, height: number): Bounds {
  const rowStats: LineStats[] = [];
  for (let y = 0; y < height; y += 1) rowStats.push(statsOf(rowValues(data, width, y), width));
  const colStats: LineStats[] = [];
  for (let x = 0; x < width; x += 1) colStats.push(statsOf(colValues(data, width, height, x), height));

  let top = 0;
  while (top < height && rowStats[top]!.stddev <= UNIFORM_STDDEV_MAX) top += 1;
  let bottom = height - 1;
  while (bottom > top && rowStats[bottom]!.stddev <= UNIFORM_STDDEV_MAX) bottom -= 1;

  let left = 0;
  while (left < width && colStats[left]!.stddev <= UNIFORM_STDDEV_MAX) left += 1;
  let right = width - 1;
  while (right > left && colStats[right]!.stddev <= UNIFORM_STDDEV_MAX) right -= 1;

  // Uniformidade ENTRE as linhas de cada lado. É aqui que um gradiente é
  // recusado: cada uma das suas linhas é lisa, e o conjunto não é.
  const uniform =
    faixaUniforme(rowStats.slice(0, top)) &&
    faixaUniforme(rowStats.slice(bottom + 1)) &&
    faixaUniforme(colStats.slice(0, left)) &&
    faixaUniforme(colStats.slice(right + 1));

  return { top, bottom, left, right, uniform };
}

function faixaUniforme(linhas: LineStats[]): boolean {
  if (linhas.length === 0) return true;
  let min = Infinity;
  let max = -Infinity;
  for (const l of linhas) {
    if (l.mean < min) min = l.mean;
    if (l.mean > max) max = l.mean;
  }
  return max - min <= UNIFORM_BETWEEN_LINES_MAX;
}

/**
 * Ajusta um intervalo para comprimento PAR — h264 com `yuv420p` recusa lado
 * ímpar — **crescendo para fora, nunca encolhendo para dentro**.
 *
 * A direção não é detalhe. Encolher parece inofensivo e come a última linha de
 * imagem: medido na fixture de padding, o conteúdo ia de y=185 a y=454 (271
 * linhas, ímpar) e a versão que encolhia entregava 184..453, perdendo a linha
 * 454 — um pixel de rosto, para sempre, em silêncio.
 *
 * Crescendo, o pior caso é incluir um pixel a mais de barra, que o
 * enquadramento seguinte cobre. Os dois erros não são simétricos: um perde
 * imagem, o outro perde nada.
 */
function evenSpan(start: number, end: number, limit: number): { start: number; length: number } {
  const length = end - start + 1;
  if (length % 2 === 0) return { start, length };
  if (end + 1 < limit) return { start, length: length + 1 };
  if (start - 1 >= 0) return { start: start - 1, length: length + 1 };
  // Quadro com lado ímpar e conteúdo encostado nas duas bordas: aí não há para
  // onde crescer, e encolher é a única saída.
  return { start, length: length - 1 };
}

/**
 * Mede o preenchimento de um arquivo.
 *
 * Nunca lança por causa do conteúdo: um vídeo que a sonda não entende devolve
 * `pending`, que é o veredito que NÃO recorta. Falhar fechado aqui significa
 * entregar o vídeo como está — o comportamento anterior a este bloco — em vez
 * de arriscar um recorte sobre uma fronteira inventada.
 */
export async function probePadding(filePath: string): Promise<PaddingProbeResult> {
  const geo = await probeVideo(filePath);
  const frame = { width: geo.width, height: geo.height };
  const frameAspect = geo.width / geo.height;

  const semRecorte = (verdict: PaddingVerdict, reason: string): PaddingProbeResult => ({
    verdict,
    frame,
    content: frame,
    crop: null,
    frameAspect,
    contentAspect: frameAspect,
    paddingFraction: 0,
    reason,
  });

  let amostras: Bounds[];
  try {
    amostras = [];
    for (const pos of SAMPLE_POSITIONS) {
      const at = Math.max(0, geo.durationSeconds * pos);
      const data = await readGrayFrame(filePath, at, geo);
      amostras.push(boundsOf(data, geo.width, geo.height));
    }
  } catch (err) {
    return semRecorte(
      "pending",
      "Não foi possível medir o preenchimento deste arquivo (" +
        `${err instanceof Error ? err.message.slice(0, 90) : String(err)}). Sem medição não há recorte: ` +
        "uma fronteira inventada corta imagem, e isso não tem volta.",
    );
  }

  // Os três quadros têm de concordar. Preenchimento é estático; fronteira que
  // se move é imagem sendo confundida com barra.
  const base = amostras[0]!;
  const concordam = amostras.every(
    (b) =>
      Math.abs(b.top - base.top) <= FRAME_AGREEMENT_TOLERANCE &&
      Math.abs(b.bottom - base.bottom) <= FRAME_AGREEMENT_TOLERANCE &&
      Math.abs(b.left - base.left) <= FRAME_AGREEMENT_TOLERANCE &&
      Math.abs(b.right - base.right) <= FRAME_AGREEMENT_TOLERANCE,
  );

  if (!concordam) {
    return semRecorte(
      "pending",
      "As fronteiras mudam entre os quadros amostrados, então o que está nas bordas não é " +
        "preenchimento estático. Pode ser uma cena clara encostando na borda. Não se recorta.",
    );
  }

  if (!amostras.every((b) => b.uniform)) {
    return semRecorte(
      "pending",
      "A borda existe mas NÃO é uniforme — o brilho varia ao longo dela, o que indica gradiente, " +
        "sombra ou textura, e não uma barra chapada do fornecedor. Recortar aqui comeria imagem.",
    );
  }

  // Recorte conservador: a interseção do que os três quadros concordam.
  const top = Math.max(...amostras.map((b) => b.top));
  const bottom = Math.min(...amostras.map((b) => b.bottom));
  const left = Math.max(...amostras.map((b) => b.left));
  const right = Math.min(...amostras.map((b) => b.right));

  const horizontal = evenSpan(left, right, geo.width);
  const vertical = evenSpan(top, bottom, geo.height);
  const larguraUtil = horizontal.length;
  const alturaUtil = vertical.length;

  if (larguraUtil <= 0 || alturaUtil <= 0) {
    return semRecorte(
      "pending",
      "A medição não encontrou conteúdo — o quadro inteiro parece uniforme. Um vídeo assim é um " +
        "artefato vazio ou uma cena chapada, e nos dois casos recortar não é a resposta.",
    );
  }

  if (larguraUtil === geo.width && alturaUtil === geo.height) {
    return semRecorte(
      "clean",
      "Sem preenchimento detectável: o conteúdo ocupa o quadro inteiro.",
    );
  }

  const content = { width: larguraUtil, height: alturaUtil };
  const paddingFraction = 1 - (larguraUtil * alturaUtil) / (geo.width * geo.height);

  const result: PaddingProbeResult = {
    verdict: "padded",
    frame,
    content,
    crop: { x: horizontal.start, y: vertical.start, width: larguraUtil, height: alturaUtil },
    frameAspect,
    contentAspect: larguraUtil / alturaUtil,
    paddingFraction,
    reason:
      `O quadro tem ${geo.width}×${geo.height}, mas só ${larguraUtil}×${alturaUtil} é imagem — ` +
      `${(paddingFraction * 100).toFixed(0)}% é preenchimento sólido do fornecedor. ` +
      "Ele sai antes do enquadramento: não é conteúdo, e mantê-lo faria a moldura desfocada " +
      "ser desenhada em volta de outra moldura.",
  };

  logEvent("info", "padding_probed", {
    frame: `${geo.width}x${geo.height}`,
    content: `${larguraUtil}x${alturaUtil}`,
    paddingPct: Number((paddingFraction * 100).toFixed(1)),
    verdict: result.verdict,
  });

  return result;
}
