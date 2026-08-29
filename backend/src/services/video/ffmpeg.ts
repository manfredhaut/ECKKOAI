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
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { logEvent } from "../log/safeLog.js";
import { parseAspectRatio } from "../providers/formatDerivation.js";

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
 * A duração do CROSSFADE entre dois blocos consecutivos — item 4, 29/08/2026.
 *
 * Antes desta rodada, `concatVideos` usava o filtro `concat` puro: um CORTE
 * seco na emenda entre blocos, sempre visível quando pose/iluminação/
 * enquadramento divergem entre duas chamadas do Wan (MEDIDO como risco desde
 * a migração para `reference-to-video/flash`, item 2 — sem quadro de
 * partida fixo, cada bloco é uma cena nova, o que torna a emenda MAIS
 * provável de saltar, não menos). `xfade` sobrepõe os dois vídeos por este
 * tanto de tempo, dissolvendo um no outro.
 *
 * 0,5 s — curto o bastante para não parecer uma transição de câmera visível
 * por si (o roteiro não pede corte de cena, só continuidade de fala), longo
 * o bastante para o olho não ler como corte seco.
 *
 * ⚠️ **MEDIDO por vídeo real em 29/08 (Parte 3, vídeo mudo de 3 blocos):
 * `transition=fade` (a variante deste bloco NA ÉPOCA) produz DUPLA
 * EXPOSIÇÃO visível — o histograma Bhattacharyya do operador mediu picos de
 * 9,85s e 19,2s, e a leitura visual (frames extraídos no meio da janela de
 * 0,5s) confirma uma cabeça semitransparente sobreposta à cena seguinte.**
 * A causa não é a duração da transição — é o TIPO: `fade` faz alpha-blend
 * SIMULTÂNEO dos dois frames inteiros, pixel a pixel, e isso SEMPRE produz
 * fantasma quando o sujeito de um bloco não está na mesma posição/escala do
 * outro (aqui: bloco 1 sentado e próximo, bloco 2 em pé e mais distante —
 * exatamente o caso esperado entre blocos do `reference-to-video/flash`,
 * que gera cena nova a cada bloco, sem quadro de partida fixo). Realinhar
 * por crop/escala (a outra opção considerada) não resolveria: a divergência
 * aqui é de POSE (sentado→em pé), não de enquadramento geométrico — não há
 * transformação linear que torne as duas figuras sobreponíveis.
 *
 * ┌─ `fadeblack` foi a primeira escolha e foi REJEITADA POR MEDIÇÃO ─────────┐
 * │ Reproduzi o defeito localmente (SEM chamada paga: extraí um trecho      │
 * │ limpo do bloco 1 e um do bloco 2 do PRÓPRIO vídeo já entregue, e rodei   │
 * │ os dois `xfade` candidatos sobre eles, medindo Bhattacharyya frame a     │
 * │ frame com a mesma sonda usada para validar a correção — ver             │
 * │ `bhattacharyya.mjs` no scratchpad da sessão). `fadeblack` elimina a      │
 * │ dupla exposição (as duas cenas nunca aparecem juntas — desvanece para    │
 * │ PRETO e só depois traz a próxima), mas isso é PIOR pelo critério         │
 * │ numérico do operador (pico ≤ 0,05 por até 2-3 frames): ir a preto e      │
 * │ voltar é uma mudança de histograma ENORME e abrupta — pico MEDIDO 0,976  │
 * │ (contra 0,062 do `fade` que ele substituiria), 11 frames consecutivos    │
 * │ acima do teto de corte-seco (contra 3 do `fade`). Teria trocado um       │
 * │ defeito visível (fantasma) por outro que o PRÓPRIO critério de aceite    │
 * │ rejeitaria com folga maior ainda.                                        │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * A correção real é `transition=wiperight` (ver `concatVideos`) — MEDIDO,
 * nos mesmos dois trechos: pico Bhattacharyya **0,033, ZERO frames acima do
 * teto de 0,05**. Um wipe nunca mistura os dois frames no mesmo pixel — a
 * cada instante, cada ponto da imagem é 100% de um vídeo OU 100% do outro,
 * só a linha de corte se move —, então a dupla exposição é estruturalmente
 * impossível, e a mudança por frame é pequena (só a faixa perto da linha
 * muda a cada quadro), o que explica o histograma liso. Confirmado também
 * por inspeção visual do quadro central da transição: uma linha vertical
 * nítida entre as duas cenas, sem transparência. Outros candidatos testados
 * e descartados pela mesma medição: `dissolve` (pico 0,063, 2 frames acima —
 * ainda é blend, herda o mesmo risco do `fade`), `hblur`/`circleopen`/
 * `diagtl` (picos 0,13-0,28, piores que o `fade` original).
 */
export const XFADE_DURATION_SECONDS = 0.5;

/**
 * CONCATENA N vídeos MUDOS numa saída só, com CROSSFADE na emenda — BLOCO
 * FRACOES-1 (item 3 do plano) + item 4 (29/08).
 *
 * `videoUrls` também são lidos DIRETO por URL, um `-i` por entrada — mesma
 * razão de sempre neste arquivo: o ffmpeg lê URL http(s) nativamente, sem
 * baixar o arquivo à mão antes.
 *
 * **Transição `wiperight`, não `fade` — corrigido em 29/08 (Item 1 da rodada
 * de correções pós-vídeo-mudo).** `fade` faz alpha-blend simultâneo dos dois
 * frames inteiros e produz fantasma/dupla-exposição quando os blocos têm
 * pose ou enquadramento muito diferentes (MEDIDO por histograma Bhattacharyya
 * do operador — picos nas duas transições do teste real). Um `wipe` nunca
 * mistura os dois frames no mesmo pixel — a linha de corte se move, cada
 * lado dela é 100% de um vídeo ou do outro —, então a dupla exposição é
 * estruturalmente impossível. `fadeblack` foi tentado primeiro e MEDIDO
 * PIOR que o `fade` original pelo critério numérico (ida a preto é um salto
 * de histograma maior que o blend que substituiria) — ver o comentário de
 * `XFADE_DURATION_SECONDS` para a medição completa dos dois candidatos e do
 * escolhido.
 *
 * `scale` + `setsar=1` para a geometria do PRIMEIRO vídeo, antes do `xfade`,
 * absorve a divergência de pixel que o POC (`POC-MOTORES/05-fracoes/`,
 * 21/08) MEDIU entre chamadas do Wan (1284×716 numa, 1286×716 noutra, mesma
 * `resolution` pedida nas duas) — `xfade` exige entradas do MESMO tamanho,
 * então esta normalização é ainda mais necessária que era para o `concat`
 * puro que existia antes.
 *
 * `xfade` é BINÁRIO (só combina 2 streams por vez) — N vídeos exigem N-1
 * transições ENCADEADAS, cada uma começando em `offset` = onde a anterior
 * termina menos a duração da transição (a sobreposição "rouba" tempo do
 * final do stream acumulado). A fórmula é cumulativa: depois da transição i,
 * a duração do acumulado é `duração_acumulada + duração(i+1) - XFADE_DURATION_SECONDS`.
 */
export interface ConcatVideosOpcoes {
  /**
   * Item 5 — CORREÇÃO DE COR determinística antes de concatenar, rodada de
   * 29/08 seguinte. `false` (default): comportamento IDÊNTICO a antes desta
   * opção existir — nenhum vídeo já aprovado muda de bytes sem essa flag.
   * `true`: cada bloco N>0 ganha `colorchannelmixer` para aproximar sua média
   * RGB da média do bloco 0 (referência) ANTES do `scale`/`xfade` — ver
   * `mediaRgbDoVideo`/`ganhoDeCorrecao` logo abaixo. NÃO VERIFICADO por vídeo
   * real ainda — existe para ser testado isoladamente antes de virar default.
   */
  corrigirCor?: boolean;
}

/** Downscale para as amostragens de cor/quietude — não afeta a saída final. */
const AMOSTRA_LARGURA = 160;
const AMOSTRA_ALTURA = 90;

/**
 * A média RGB de um vídeo inteiro, amostrada a 3 fps — item 5, 29/08
 * seguinte. 3 fps basta para uma média estável (não é detecção de cena, é
 * só "qual é a cor média geral deste bloco") e mantém a amostragem barata
 * mesmo em blocos de 10 s.
 */
async function mediaRgbDoVideo(filePath: string): Promise<{ r: number; g: number; b: number }> {
  const raw = join(tmpdir(), `colormatch-${randomUUID()}.raw`);
  try {
    await run(
      "ffmpeg",
      [
        "-y",
        "-i", filePath,
        "-vf", `scale=${AMOSTRA_LARGURA}:${AMOSTRA_ALTURA},fps=3`,
        "-pix_fmt", "rgb24",
        "-f", "rawvideo",
        raw,
      ],
      { timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
    );
    const buf = await readFile(raw);
    const nPixels = buf.length / 3;
    if (nPixels === 0) return { r: 128, g: 128, b: 128 };
    let somaR = 0;
    let somaG = 0;
    let somaB = 0;
    for (let i = 0; i < buf.length; i += 3) {
      somaR += buf[i];
      somaG += buf[i + 1];
      somaB += buf[i + 2];
    }
    return { r: somaR / nPixels, g: somaG / nPixels, b: somaB / nPixels };
  } finally {
    await unlink(raw).catch(() => {});
  }
}

/**
 * O ganho MULTIPLICATIVO que aproxima `mediaAlvo` de `mediaReferencia` —
 * grampeado em [0,6, 1,6] para nunca produzir uma correção absurda a partir
 * de uma amostra ruim (bloco quase todo preto/branco, por exemplo, onde a
 * razão dispararia). Sem grampo, um outlier na amostra viraria um vídeo com
 * cor pior que a original — o remédio não pode ser mais visível que o
 * defeito que corrige.
 */
const GANHO_MINIMO = 0.6;
const GANHO_MAXIMO = 1.6;

function ganhoDeCorrecao(mediaReferencia: number, mediaAlvo: number): number {
  if (mediaAlvo <= 1) return 1;
  const ganho = mediaReferencia / mediaAlvo;
  return Math.min(GANHO_MAXIMO, Math.max(GANHO_MINIMO, ganho));
}

export async function concatVideos(
  videoUrls: string[],
  outputPath: string,
  opcoes: ConcatVideosOpcoes = {},
): Promise<void> {
  if (videoUrls.length === 0) {
    throw new Error("concatVideos: lista de vídeos vazia — nada para concatenar.");
  }
  if (videoUrls.length === 1) {
    // Um vídeo só: "concatenar" é só trazer para o formato de saída
    // combinado, sem filtro de xfade/concat nenhum (que exigiria N>=2
    // entradas) — não há emenda para suavizar, e não há bloco 2+ para
    // corrigir a cor contra o bloco 0.
    await runFfmpeg(["-y", "-i", videoUrls[0], "-c:v", "libx264", "-an", outputPath], "concatVideos-unico");
    return;
  }

  const geometrias = await Promise.all(videoUrls.map((url) => probeVideo(url)));
  const primeira = geometrias[0];
  const inputs = videoUrls.flatMap((url) => ["-i", url]);

  // Item 5 — só mede cor quando pedido: a amostragem extra (3 fps por bloco)
  // não é grátis em TEMPO (ainda que seja em dinheiro), e todo vídeo que não
  // passar `corrigirCor: true` não paga esse custo.
  const medias = opcoes.corrigirCor
    ? await Promise.all(videoUrls.map((url) => mediaRgbDoVideo(url)))
    : null;

  const scaled = videoUrls
    .map((_, i) => {
      const geometria = `scale=${primeira.width}:${primeira.height},setsar=1`;
      if (!medias || i === 0) return `[${i}:v]${geometria}[v${i}]`;
      const referencia = medias[0];
      const alvo = medias[i];
      const gr = ganhoDeCorrecao(referencia.r, alvo.r);
      const gg = ganhoDeCorrecao(referencia.g, alvo.g);
      const gb = ganhoDeCorrecao(referencia.b, alvo.b);
      return `[${i}:v]colorchannelmixer=rr=${gr.toFixed(3)}:gg=${gg.toFixed(3)}:bb=${gb.toFixed(3)},${geometria}[v${i}]`;
    })
    .join(";");

  const transicoes: string[] = [];
  let rotuloAnterior = "v0";
  let duracaoAcumulada = geometrias[0].durationSeconds;
  for (let i = 1; i < videoUrls.length; i++) {
    const offset = Math.max(0, duracaoAcumulada - XFADE_DURATION_SECONDS);
    const rotulo = i === videoUrls.length - 1 ? "outv" : `x${i}`;
    transicoes.push(
      `[${rotuloAnterior}][v${i}]xfade=transition=wiperight:duration=${XFADE_DURATION_SECONDS}:offset=${offset.toFixed(3)}[${rotulo}]`,
    );
    duracaoAcumulada = duracaoAcumulada + geometrias[i].durationSeconds - XFADE_DURATION_SECONDS;
    rotuloAnterior = rotulo;
  }
  const filterComplex = `${scaled};${transicoes.join(";")}`;

  await runFfmpeg(
    ["-y", ...inputs, "-filter_complex", filterComplex, "-map", "[outv]", "-c:v", "libx264", outputPath],
    "concatVideos",
  );
}

/**
 * Distância de HISTOGRAMA (Bhattacharyya) entre dois frames — a mesma
 * métrica usada para medir o fantasma do Item 1 (ver `bhattacharyya.mjs` da
 * sonda de validação). Histograma RGB conjunto, 16 bins por canal
 * (4096 bins) — bins finos o bastante para pegar mudança de cor/luz, sem o
 * custo de um histograma de 24 bits.
 */
function histogramaRgb(frame: Buffer): Float64Array {
  const bins = new Float64Array(16 * 16 * 16);
  const nPixels = frame.length / 3;
  for (let i = 0; i < frame.length; i += 3) {
    const r = frame[i] >> 4;
    const g = frame[i + 1] >> 4;
    const b = frame[i + 2] >> 4;
    bins[r * 256 + g * 16 + b] += 1;
  }
  for (let i = 0; i < bins.length; i++) bins[i] /= nPixels;
  return bins;
}

function distanciaBhattacharyya(p: Float64Array, q: Float64Array): number {
  let bc = 0;
  for (let i = 0; i < p.length; i++) bc += Math.sqrt(p[i] * q[i]);
  bc = Math.min(1, Math.max(0, bc));
  return -Math.log(bc + 1e-12);
}

/** Downscale e taxa de quadros para a BUSCA de quietude — não para a saída. */
const BUSCA_LARGURA = 160;
const BUSCA_ALTURA = 90;
const BUSCA_FPS = 30;

/**
 * O instante de MENOR movimento dentro de uma janela — item 3 da rodada de
 * 29/08 (corte seco como alternativa de baixo risco ao `xfade`).
 *
 * Extrai a janela em baixa resolução (histograma não precisa de nitidez),
 * mede a distância de Bhattacharyya entre cada par de quadros CONSECUTIVOS
 * dentro dela, e devolve o instante onde essa distância é MÍNIMA — o
 * momento mais parado da janela, candidato a corte porque um corte seco ali
 * troca menos informação visual de uma vez que um corte no meio de um
 * gesto.
 *
 * Sem quadros suficientes para medir (janela mais curta que 2 quadros a
 * `BUSCA_FPS`), devolve o MEIO da janela — não há como medir quietude, e o
 * meio é uma escolha neutra, não uma medição.
 */
async function instanteMaisQuietoNaJanela(
  filePath: string,
  inicioSegundos: number,
  duracaoSegundos: number,
): Promise<number> {
  if (duracaoSegundos <= 0) return 0;
  const raw = join(tmpdir(), `quietude-${randomUUID()}.raw`);
  try {
    await run(
      "ffmpeg",
      [
        "-y",
        "-ss", String(inicioSegundos),
        "-i", filePath,
        "-t", String(duracaoSegundos),
        "-vf", `scale=${BUSCA_LARGURA}:${BUSCA_ALTURA},fps=${BUSCA_FPS}`,
        "-pix_fmt", "rgb24",
        "-f", "rawvideo",
        raw,
      ],
      { timeout: TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 },
    );
    const buf = await readFile(raw);
    const frameBytes = BUSCA_LARGURA * BUSCA_ALTURA * 3;
    const nFrames = Math.floor(buf.length / frameBytes);
    if (nFrames < 2) return duracaoSegundos / 2;

    let indiceMaisQuieto = 0;
    let menorDistancia = Infinity;
    let anterior = histogramaRgb(buf.subarray(0, frameBytes));
    for (let f = 1; f < nFrames; f++) {
      const atual = histogramaRgb(buf.subarray(f * frameBytes, (f + 1) * frameBytes));
      const d = distanciaBhattacharyya(anterior, atual);
      if (d < menorDistancia) {
        menorDistancia = d;
        indiceMaisQuieto = f;
      }
      anterior = atual;
    }
    return indiceMaisQuieto / BUSCA_FPS;
  } finally {
    await unlink(raw).catch(() => {});
  }
}

/**
 * ALTERNATIVA a `concatVideos` — CORTE SECO no instante mais parado de cada
 * lado da emenda, sem blend nenhum (nem `xfade`, nem `fadeblack`, nem
 * `wiperight`) — item 3 da rodada de correções de 29/08, pedida como
 * "opção mais simples e sem risco" e BASE DE COMPARAÇÃO contra o `xfade`
 * de `concatVideos`.
 *
 * ┌─ Por que existe ao lado de `concatVideos`, não no lugar dele ───────────┐
 * │ `concatVideos` (`wiperight`) já foi MEDIDO resolvendo o fantasma do     │
 * │ Item 1 dentro do critério do operador (pico 0,027/0,017, zero frames    │
 * │ acima do teto de 0,05 — ver o comentário de `XFADE_DURATION_SECONDS`).  │
 * │ Esta função é a alternativa "sem efeito nenhum de transição" que a      │
 * │ rodada pediu para existir como comparação — qual das duas o operador   │
 * │ prefere no vídeo final é decisão de produto (efeito visual do wipe      │
 * │ contra um corte seco no instante mais parado), não um bug a corrigir.   │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * NÃO busca a fronteira EXATA do tempo do plano — busca, em CADA lado dela
 * (os últimos `buscaSegundos` do bloco N, os primeiros `buscaSegundos` do
 * bloco N+1), o instante mais parado DAQUELE lado, independentemente um do
 * outro (os dois vídeos são gerações separadas — não há "quadro seguinte"
 * real entre eles para comparar diretamente). `buscaSegundos = 0,5` por
 * padrão, o mesmo tamanho de janela "ao redor da fronteira" pedido.
 *
 * Cada bloco (exceto o primeiro) começa no seu instante mais quieto; cada
 * bloco (exceto o último) termina no seu instante mais quieto — perde-se um
 * pouco de vídeo em cada emenda (no máximo `buscaSegundos` de cada lado),
 * igual ao `xfade` já perder `XFADE_DURATION_SECONDS` por emenda.
 */
export async function concatVideosCorteSeco(
  videoUrls: string[],
  outputPath: string,
  buscaSegundos = 0.5,
): Promise<void> {
  if (videoUrls.length === 0) {
    throw new Error("concatVideosCorteSeco: lista de vídeos vazia — nada para concatenar.");
  }
  if (videoUrls.length === 1) {
    await runFfmpeg(["-y", "-i", videoUrls[0], "-c:v", "libx264", "-an", outputPath], "concatVideosCorteSeco-unico");
    return;
  }

  const geometrias = await Promise.all(videoUrls.map((url) => probeVideo(url)));
  const primeira = geometrias[0];

  // Para cada bloco: em que instante ele TERMINA (cortado) e em que instante
  // ele COMEÇA (cortado) — `undefined` nas pontas onde não há emenda.
  const cortesFim: (number | undefined)[] = [];
  const cortesInicio: (number | undefined)[] = [];
  for (let i = 0; i < videoUrls.length; i++) {
    const duracao = geometrias[i].durationSeconds;
    if (i < videoUrls.length - 1) {
      const janela = Math.min(buscaSegundos, duracao);
      const inicioDaJanela = Math.max(0, duracao - janela);
      const instante = await instanteMaisQuietoNaJanela(videoUrls[i], inicioDaJanela, janela);
      cortesFim.push(inicioDaJanela + instante);
    } else {
      cortesFim.push(undefined);
    }
    if (i > 0) {
      const janela = Math.min(buscaSegundos, duracao);
      cortesInicio.push(await instanteMaisQuietoNaJanela(videoUrls[i], 0, janela));
    } else {
      cortesInicio.push(undefined);
    }
  }

  const inputs = videoUrls.flatMap((url) => ["-i", url]);
  const trimmed = videoUrls
    .map((_, i) => {
      const inicio = cortesInicio[i];
      const fim = cortesFim[i];
      const trim = fim !== undefined ? `trim=${inicio ?? 0}:${fim}` : `trim=start=${inicio ?? 0}`;
      return `[${i}:v]${trim},setpts=PTS-STARTPTS,scale=${primeira.width}:${primeira.height},setsar=1[v${i}]`;
    })
    .join(";");
  const rotulos = videoUrls.map((_, i) => `[v${i}]`).join("");
  const filterComplex = `${trimmed};${rotulos}concat=n=${videoUrls.length}:v=1:a=0[outv]`;

  await runFfmpeg(
    ["-y", ...inputs, "-filter_complex", filterComplex, "-map", "[outv]", "-c:v", "libx264", outputPath],
    "concatVideosCorteSeco",
  );
}

/** A proporção do arquivo diverge da pedida além da tolerância aceitável. */
export class AspectRatioMismatchError extends Error {
  constructor(
    public readonly esperado: string,
    public readonly real: { width: number; height: number },
    public readonly desvioPercentual: number,
  ) {
    super(
      `formato: a saída saiu ${real.width}x${real.height} (proporção ${(real.width / real.height).toFixed(4)}), ` +
        `divergindo ${(desvioPercentual * 100).toFixed(1)}% da proporção pedida "${esperado}". Nada foi cobrado ` +
        "por esta checagem — ela roda DEPOIS de compor+animar já terem sido pagos, e existe para PARAR antes " +
        "de narrar+sincronizar (as duas etapas mais caras) num vídeo que já nasceu no formato errado.",
    );
    this.name = "AspectRatioMismatchError";
  }
}

/**
 * A proporção REAL do arquivo bate com a ESCOLHIDA na tela — item 8,
 * 29/08/2026.
 *
 * ┌─ Por que existe ──────────────────────────────────────────────────────┐
 * │ Antes desta rodada, nada no caminho Wan conferia o formato de SAÍDA     │
 * │ contra o formato PEDIDO — `deriveVariantsForVideo`/`formatDerivation.ts`│
 * │ existem (era o problema documentado da era HeyGen: "zero chamadores    │
 * │ fora dos scripts") mas nunca foram ligados ao pipeline da fal. Migrar   │
 * │ para `reference-to-video/flash` (item 2, RODADA 4) tornou isto mais    │
 * │ urgente: sem quadro de partida fixo, o fornecedor tem MAIS liberdade    │
 * │ para devolver uma geometria diferente da pedida, não menos.            │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * TOLERÂNCIA de 5%: a proporção pedida (`aspectRatio`, ex. "9:16") é exata,
 * mas a LARGURA/ALTURA reais do fornecedor sempre têm arredondamento de
 * pixel par (MEDIDO no POC de frações, 21/08: 1284×716 numa chamada,
 * 1286×716 noutra, mesma `resolution` pedida nas duas) — exigir bit a bit
 * reprovaria toda chamada por um desvio que não é o defeito que esta função
 * existe para pegar (proporção ERRADA, não pixel arredondado).
 *
 * LANÇA em vez de logar: um vídeo no formato errado entregue como se
 * estivesse certo é pior que a corrida parar aqui — é a MESMA razão de
 * `DirectionTranslationError` recusar em vez de mandar o texto errado.
 */
export async function assertAspectRatio(
  filePath: string,
  aspectRatioEsperado: string,
  toleranciaFracao = 0.05,
): Promise<VideoGeometry> {
  const geometria = await probeVideo(filePath);
  const { a, b } = parseAspectRatio(aspectRatioEsperado);
  const proporcaoEsperada = a / b;
  const proporcaoReal = geometria.width / geometria.height;
  const desvio = Math.abs(proporcaoReal - proporcaoEsperada) / proporcaoEsperada;
  if (desvio > toleranciaFracao) {
    throw new AspectRatioMismatchError(aspectRatioEsperado, geometria, desvio);
  }
  return geometria;
}
