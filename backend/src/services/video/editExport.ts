/**
 * Studio Movie Edit -- construção pura do comando de exportação (migration
 * 090). BLOCO STUDIO-EXPORT-1 (corte) + STUDIO-EXPORT-2 (b-roll) +
 * STUDIO-EXPORT-3 (sobreposição + fundo musical, 30/09/2026).
 *
 * Cobre agora as 4 rotas que decidirRota() (editProject.ts) classifica:
 * nada/corte (trim+concat simples), emenda (soma b-roll), recodifica
 * (soma sobreposição e/ou fundo). Um único filter_complex, nunca -c copy
 * -- decisão já fechada no handoff de 28/09: as fixtures medidas têm um
 * único keyframe em 0,000s, que torna corte por cópia impossível sem
 * corromper.
 *
 * Sobreposição escala por PIXELS LITERAIS, não scale2ref: a resolução da
 * base já é conhecida (obterResolucao, usada para o fix de b-roll) e
 * reaproveitada aqui -- menos sintaxe de ffmpeg nova e não testável
 * interativamente, decisão de 30/09 (ABAS-27 rodada 2) a favor de
 * segurança sobre elegância.
 *
 * NUNCA uma string de shell: execFile roda sem shell, com os argumentos
 * em array -- não há concatenação de texto em nenhum ponto que um nome
 * de arquivo exótico pudesse explorar.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash } from "node:crypto";
import { linhaDoTempo, duracaoFinal } from "./editProject.js";
import type { ProjectPayload, Trecho, TrechoBroll, TrechoNaLinha, PayloadInsercao } from "./editProject.js";

const execFileAsync = promisify(execFile);

/** Hash determinístico da timeline exportada -- usado como chave de idempotência. */
export function hashPayload(payload: ProjectPayload, sourceVideoId: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ sourceVideoId, ...payload }))
    .digest("hex");
}

export class ExportNaoSuportadaError extends Error {}

/**
 * Histórico: chegou a recusar b-roll/sobreposição/fundo (STUDIO-EXPORT-1).
 * As três rotas somaram suporte (STUDIO-EXPORT-2 e 3) -- mantida como
 * função (em vez de removida do chamador em editProjects.ts) para não
 * mexer na rota de novo se mais alguma restrição aparecer depois.
 */
export function assertExportSuportada(_payload: ProjectPayload): void {
  // Sem restrições -- as 4 rotas de decidirRota() têm cobertura agora.
}

// Fixo em 3 casas -- entrada/saida já vêm arredondadas a 2 por arred() em
// editProject.ts; a casa extra é só folga contra ponto flutuante.
function num(n: number): string {
  return n.toFixed(3);
}

export interface BrollResolvido {
  absolutePath: string;
  temAudio: boolean;
}

export interface SobreposicaoResolvida {
  absolutePath: string;
  tipo: "imagem" | "video";
}

export interface FundoResolvido {
  absolutePath: string;
  volume: number;
}

export interface Resolucao {
  width: number;
  height: number;
}

/**
 * Sonda se o arquivo tem trilha de áudio -- decide entre reaproveitar o
 * áudio do próprio b-roll ou gerar silêncio (anullsrc). "b-roll mudo
 * recebe anullsrc", decisão já fechada no handoff de 28/09: um arquivo
 * de vídeo sem trilha de áudio quebraria `[N:a]` no filter_complex sem
 * isso.
 */
export async function temStreamDeAudio(absolutePath: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "error",
      "-select_streams", "a",
      "-show_entries", "stream=codec_type",
      "-of", "csv=p=0",
      absolutePath,
    ]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * MEDIDO em 30/09 (ABAS-27): o filtro `concat` do ffmpeg RECUSA
 * segmentos com resolução diferente ("Input link... parameters do
 * not match the corresponding output link") -- não redimensiona
 * sozinho. Um b-roll enviado pelo usuário quase nunca bate com a
 * resolução do vídeo base por acaso, então esta sonda roda SEMPRE,
 * não só quando parece necessário.
 */
export async function obterResolucao(absolutePath: string): Promise<Resolucao> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-of", "csv=s=x:p=0",
    absolutePath,
  ]);
  const [w, h] = stdout.trim().split("x").map(Number);
  if (!w || !h) {
    throw new Error(`Não foi possível ler a resolução de ${absolutePath}.`);
  }
  return { width: w, height: h };
}

function posicaoParaXY(posicao: PayloadInsercao["posicao"]): { x: string; y: string } {
  switch (posicao) {
    case "cheia":
      return { x: "0", y: "0" };
    case "centro":
      return { x: "(W-w)/2", y: "(H-h)/2" };
    case "sup-dir":
      return { x: "W-w-16", y: "16" };
    case "inf-esq":
      return { x: "16", y: "H-h-16" };
  }
}

/**
 * Monta os ARGUMENTOS do ffmpeg para a sequência completa -- trechos de
 * base ENTRELAÇADOS com b-roll exclusivo, sobreposições compostas por
 * cima, e fundo musical contínuo misturado com a trilha de diálogo.
 *
 * Vídeo e a trilha de "fala" (voz OU áudio do b-roll, nunca as duas ao
 * mesmo tempo -- são trechos exclusivos na timeline) são concatenados
 * JUNTOS, segmento a segmento, na MESMA ordem. Sobreposições (mute por
 * natureza -- montarCorpo já marca `mute:true`) compõem por cima do
 * vídeo concatenado; fundo musical mistura com a trilha de diálogo já
 * concatenada -- as duas etapas finais NUNCA tocam nos trechos
 * individuais, só o resultado já montado.
 *
 * `brollsResolvidos`/`sobreposicoesResolvidas`/`fundoResolvido` são
 * preenchidos ANTES de chamar esta função (I/O -- resolver asset em
 * disco, sondar áudio/resolução -- fica no runner; esta função continua
 * pura, sem tocar disco).
 */
export function montarArgsFfmpeg(
  baseAbsolutePath: string,
  trechos: Trecho[],
  brollsResolvidos: Map<string, BrollResolvido>,
  insercoes: PayloadInsercao[],
  sobreposicoesResolvidas: Map<string, SobreposicaoResolvida>,
  fundoResolvido: FundoResolvido | null,
  volVoz: number,
  outputPath: string,
  resolucaoBase: Resolucao,
): string[] {
  const linha = linhaDoTempo(trechos);
  if (linha.length === 0) {
    throw new Error("montarArgsFfmpeg chamado sem nenhum trecho.");
  }
  const vol = (volVoz / 100).toFixed(3);
  const inputArgs: string[] = ["-i", baseAbsolutePath];
  const partesVideo: string[] = [];
  const partesAudio: string[] = [];
  const paresConcat: string[] = [];
  let proximoInput = 1;

  linha.forEach((t, i) => {
    if (t.tipo === "base") {
      partesVideo.push(`[0:v]trim=start=${num(t.entrada)}:end=${num(t.saida)},setpts=PTS-STARTPTS[v${i}]`);
      partesAudio.push(
        `[0:a]atrim=start=${num(t.entrada)}:end=${num(t.saida)},asetpts=PTS-STARTPTS,volume=${vol}[a${i}]`,
      );
    } else {
      const broll = t as TrechoNaLinha<TrechoBroll>;
      const resolvido = broll.assetId ? brollsResolvidos.get(broll.assetId) : undefined;
      if (!resolvido) {
        throw new Error(`B-roll sem arquivo resolvido: ${broll.nome}`);
      }
      const idx = proximoInput++;
      inputArgs.push("-i", resolvido.absolutePath);
      partesVideo.push(
        `[${idx}:v]trim=start=0:end=${num(broll.duracao)},setpts=PTS-STARTPTS,` +
          `scale=${resolucaoBase.width}:${resolucaoBase.height}:force_original_aspect_ratio=decrease,` +
          `pad=${resolucaoBase.width}:${resolucaoBase.height}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1[v${i}]`,
      );
      if (resolvido.temAudio) {
        const volBroll = (broll.volume / 100).toFixed(3);
        partesAudio.push(
          `[${idx}:a]atrim=start=0:end=${num(broll.duracao)},asetpts=PTS-STARTPTS,volume=${volBroll}[a${i}]`,
        );
      } else {
        partesAudio.push(
          `anullsrc=channel_layout=stereo:sample_rate=44100:duration=${num(broll.duracao)}[a${i}]`,
        );
      }
    }
    paresConcat.push(`[v${i}][a${i}]`);
  });

  const filterParts: string[] = [...partesVideo, ...partesAudio];
  filterParts.push(`${paresConcat.join("")}concat=n=${linha.length}:v=1:a=1[outv][outa]`);

  // ---- sobreposições: compõem por cima de [outv], uma de cada vez ----
  let videoAtual = "outv";
  insercoes
    .slice()
    .sort((a, b) => a.inicio - b.inicio)
    .forEach((ins, i) => {
      const resolvida = ins.assetId ? sobreposicoesResolvidas.get(ins.assetId) : undefined;
      if (!resolvida) {
        throw new Error(`Sobreposição sem arquivo resolvido: ${ins.nome}`);
      }
      const idx = proximoInput++;
      if (resolvida.tipo === "imagem") {
        inputArgs.push("-loop", "1", "-t", num(ins.duracao), "-i", resolvida.absolutePath);
      } else {
        inputArgs.push("-i", resolvida.absolutePath);
      }
      const rawLabel = `ov${i}raw`;
      const nextVideoLabel = `outv${i + 1}`;

      // "cheia" cobre o quadro inteiro (ignora a proporção própria de
      // propósito -- é um fundo/gráfico pensado para o enquadramento
      // exato); as outras três preservam a proporção própria, escaladas
      // pela fração `escala` da LARGURA do vídeo principal (altura -1 =
      // automática, preserva proporção).
      const scaleExpr =
        ins.posicao === "cheia"
          ? `scale=${resolucaoBase.width}:${resolucaoBase.height}`
          : `scale=${Math.round(resolucaoBase.width * ins.escala)}:-1`;

      // setpts desloca a timeline própria da sobreposição para começar em
      // `inicio` -- sem isso, um vídeo de sobreposição mostraria o frame
      // que calha de estar no mesmo instante global, não o início dele.
      const trimPrefix = resolvida.tipo === "video" ? `trim=start=0:end=${num(ins.duracao)},` : "";
      filterParts.push(
        `[${idx}:v]${trimPrefix}setpts=PTS-STARTPTS+${num(ins.inicio)}/TB,${scaleExpr},setsar=1[${rawLabel}]`,
      );

      const { x, y } = posicaoParaXY(ins.posicao);
      filterParts.push(
        `[${videoAtual}][${rawLabel}]overlay=x=${x}:y=${y}:` +
          `enable='between(t,${num(ins.inicio)},${num(ins.inicio + ins.duracao)})'[${nextVideoLabel}]`,
      );
      videoAtual = nextVideoLabel;
    });

  // ---- fundo musical: mistura com [outa] já concatenado ----
  let audioAtual = "outa";
  if (fundoResolvido) {
    const idx = proximoInput++;
    // -stream_loop -1 repete o arquivo indefinidamente; atrim corta no
    // tamanho exato da duração final -- cobre os dois casos (fundo mais
    // curto OU mais longo que o vídeo) sem precisar saber a duração do
    // arquivo de antemão.
    inputArgs.push("-stream_loop", "-1", "-i", fundoResolvido.absolutePath);
    const dur = num(duracaoFinal(trechos));
    const volFundo = (fundoResolvido.volume / 100).toFixed(3);
    filterParts.push(
      `[${idx}:a]atrim=start=0:end=${dur},asetpts=PTS-STARTPTS,volume=${volFundo}[fundoaud]`,
    );
    filterParts.push(`[outa][fundoaud]amix=inputs=2:duration=first:dropout_transition=0[audiomix]`);
    audioAtual = "audiomix";
  }

  const filterComplex = filterParts.join(";");

  return [
    "-y",
    ...inputArgs,
    "-filter_complex", filterComplex,
    "-map", `[${videoAtual}]`,
    "-map", `[${audioAtual}]`,
    "-c:v", "libx264",
    "-c:a", "aac",
    outputPath,
  ];
}

export async function executarExportacao(args: string[]): Promise<void> {
  await execFileAsync("ffmpeg", args, { maxBuffer: 1024 * 1024 * 50 });
}
