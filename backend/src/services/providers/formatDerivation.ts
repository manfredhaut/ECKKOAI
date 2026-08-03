/**
 * Master 9:16 no teto do fornecedor, e todo o resto DERIVADO dele por redução.
 *
 * POLÍTICA (aprovada no bloco 5E): gera-se UM vídeo, sempre 9:16, na maior
 * resolução que o plano entregar. Os demais formatos saem dele por software,
 * sem custo de fornecedor.
 *
 * ---------------------------------------------------------------------------
 * A REGRA TEM DUAS METADES, E CONFUNDI-LAS É O DEFEITO
 *
 *   O SUJEITO nunca é cortado nem ampliado.  → `decrease`, fator sempre ≤ 1
 *   O FUNDO desfocado PODE ser ampliado.     → `increase` + `crop` + `boxblur`
 *
 * A primeira metade é a que importa: recortar 9:16 para 16:9 descartaria 68%
 * da altura e ainda precisaria ampliar; ampliar o sujeito inventa nitidez que
 * não existe. As duas perdem conteúdo ou qualidade, e a política proíbe as
 * duas. A segunda metade é o que torna a primeira viável — o espaço que sobra
 * é preenchido por uma extensão borrada do próprio quadro, que ninguém olha de
 * perto e onde ampliar não custa nada.
 * ---------------------------------------------------------------------------
 *
 * NENHUM número desta política está escrito aqui. As resoluções-alvo entram
 * como dado (`FormatSpec`), a resolução do master entra como dado (vinda do
 * teto do fornecedor, não de constante), e a tabela inteira é consequência.
 * Os números da política são CASO DE TESTE, e é a guarda que os afirma — se
 * estivessem no código, o teste estaria comparando o código consigo mesmo.
 */

export interface Resolution {
  width: number;
  height: number;
}

/** O que a política pede para um formato, antes de saber qual é o master. */
export interface FormatSpec {
  aspectRatio: string;
  /** Resolução desejada para este formato, quando o master permitir. */
  target: Resolution;
}

export interface DerivedFormat {
  aspectRatio: string;
  /** Quadro final do arquivo derivado. */
  canvas: Resolution;
  /** O que o alvo pedia. Fica ao lado para a tela poder dizer o que faltou. */
  target: Resolution;
  /** Tamanho do SUJEITO dentro do quadro — nunca maior que o master. */
  subject: Resolution;
  /** Fator aplicado ao sujeito. Invariante do bloco: sempre ≤ 1. */
  subjectScale: number;
  /** O quadro final atende a resolução-alvo? */
  meetsTarget: boolean;
  /**
   * Por que não atende, em pt-BR e pronto para a tela. `null` quando atende.
   * Nunca silencia: um formato abaixo da especificação que não se anuncia é
   * pior que um que não existe, porque parece entregue.
   */
  shortfall: string | null;
}

/** h264 com `yuv420p` exige dimensões pares; ímpar faz o ffmpeg recusar. */
function toEven(value: number): number {
  const n = Math.floor(value);
  return n % 2 === 0 ? n : n - 1;
}

/**
 * Deriva UM formato a partir do master.
 *
 * O cálculo, em uma frase: tenta-se o quadro-alvo; se caber o master dentro
 * dele sem ampliar, é ele; se não couber, o quadro encolhe pelo fator que
 * faltava — preservando a proporção — até o sujeito caber em escala 1:1.
 *
 * É por isso que um master 720×1280 produz 4:5 em 1024×1280 e não em
 * 1080×1350: 1350 de altura exigiria esticar os 1280 do master em 5,5%, e
 * esticar está proibido. O quadro cede, o sujeito não.
 */
export function deriveFormat(master: Resolution, spec: FormatSpec): DerivedFormat {
  // Fator que levaria o master a preencher o quadro-alvo por `decrease`.
  // Acima de 1 significa que o alvo é maior que o master — ampliaria.
  const fit = Math.min(spec.target.width / master.width, spec.target.height / master.height);

  const canvas: Resolution =
    fit <= 1
      ? { ...spec.target }
      : { width: toEven(spec.target.width / fit), height: toEven(spec.target.height / fit) };

  // Sujeito: sempre `decrease` dentro do quadro final. Por construção o fator
  // é ≤ 1 — a asserção disso vive na guarda, exercitada, não neste comentário.
  const subjectScale = Math.min(canvas.width / master.width, canvas.height / master.height);
  const subject: Resolution = {
    width: toEven(master.width * subjectScale),
    height: toEven(master.height * subjectScale),
  };

  const meetsTarget = canvas.width >= spec.target.width && canvas.height >= spec.target.height;

  return {
    aspectRatio: spec.aspectRatio,
    canvas,
    target: { ...spec.target },
    subject,
    subjectScale,
    meetsTarget,
    shortfall: meetsTarget
      ? null
      : `Sai em ${canvas.width}×${canvas.height}, abaixo dos ${spec.target.width}×${spec.target.height} ` +
        `da especificação. O vídeo de origem tem ${master.width}×${master.height}, e ampliar o sujeito para ` +
        "alcançar o alvo inventaria nitidez que não existe — o quadro cede, a imagem não. " +
        "Gerar em resolução maior no fornecedor resolve.",
  };
}

/** A tabela inteira, derivada. */
export function deriveFormatTable(master: Resolution, specs: readonly FormatSpec[]): DerivedFormat[] {
  return specs.map((spec) => deriveFormat(master, spec));
}

/**
 * Resolução do MASTER a partir do teto do fornecedor.
 *
 * O master é sempre 9:16 — lado curto igual à altura nominal do rótulo de
 * resolução, que é como a HeyGen ancora (`short-edge anchored to the requested
 * resolution`). Não há constante de master no código: troque o teto e a tabela
 * inteira se move junto, que é o item 1.3 da política.
 *
 * DOCUMENTADO, não medido: nenhuma geração nossa pediu 1080p até hoje. O teto
 * real da NOSSA conta continua NÃO VERIFICADO — o endpoint que o revelaria
 * exige rede, bloqueada no bloco em que isto foi escrito.
 */
export const RESOLUTION_SHORT_EDGE: Record<string, number> = {
  "720p": 720,
  "1080p": 1080,
  "4k": 2160,
};

/**
 * `filter_complex` que materializa a regra das duas metades.
 *
 * Uma função só, e uma passada só de ffmpeg. Cortar num comando e escalar
 * noutro recodifica duas vezes e soma duas perdas — o objetivo aqui é que o
 * custo da recodificação seja invisível, não que ele seja aceito.
 *
 * A cadeia, e o papel de cada elo:
 *
 *   split=2          duas cópias do MESMO quadro; o fundo é o próprio vídeo
 *   [bg] increase    o fundo PODE ampliar — é a metade permitida da regra
 *        + crop      ...e o excedente é descartado, porque é fundo
 *        + boxblur   ...e some, porque ninguém olha um fundo desfocado de perto
 *   [fg] decrease    o SUJEITO nunca amplia. É a metade que não se negocia
 *        + lanczos   reamostragem de redução com o melhor detalhe disponível
 *   overlay          centralizado nos dois eixos
 *
 * `min(h\,w)` leva barra invertida porque a vírgula separa filtros no parser
 * do ffmpeg; sem o escape, `boxblur` recebe metade da expressão e a outra
 * metade vira um filtro inexistente.
 */
export function buildDerivationFilter(canvas: Resolution): string {
  const { width: W, height: H } = canvas;
  return [
    `[0:v]split=2[bg][fg]`,
    `[bg]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
      `boxblur=luma_radius=min(h\\,w)/20:luma_power=1:chroma_radius=min(cw\\,ch)/20:chroma_power=1[bg2]`,
    `[fg]${subjectScaleExpression(canvas)}[fg2]`,
    `[bg2][fg2]overlay=(W-w)/2:(H-h)/2`,
  ].join(";");
}

/**
 * A metade NÃO NEGOCIÁVEL da regra, isolada: como o sujeito é escalado.
 *
 * Vive em função própria porque precisa ser exercitável sozinha. A afirmação
 * "o sujeito nunca é ampliado" só vale se alguém puder MEDIR a altura com que
 * ele sai — e medir exige rodar exatamente esta expressão, não uma reescrita
 * parecida. Uma cópia usada só no teste divergiria da usada em produção, e a
 * divergência apareceria como um teste que aprova o que o produto não faz.
 */
export function subjectScaleExpression(canvas: Resolution): string {
  return `scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=decrease:flags=lanczos`;
}

/**
 * Argumentos que produzem SÓ o sujeito escalado, sem fundo e sem overlay.
 *
 * O arquivo que sai daqui não é entregue a ninguém: ele existe para que o
 * `ffprobe` diga qual altura o ffmpeg de fato deu ao sujeito. É a diferença
 * entre afirmar a invariante e constatá-la.
 */
export function buildSubjectProbeArgs(input: string, output: string, canvas: Resolution): string[] {
  return [
    "-y",
    "-v", "error",
    // Um quadro basta: a geometria não muda ao longo do vídeo, e transcodificar
    // o arquivo inteiro para medir uma altura desperdiçaria minutos por formato.
    "-i", input,
    "-frames:v", "1",
    "-vf", subjectScaleExpression(canvas),
    output,
  ];
}

/**
 * Argumentos completos do ffmpeg. Array, nunca string de shell: um caminho com
 * espaço ou acento — e este projeto vive num diretório com os dois — quebraria
 * a linha montada à mão, e a correção improvisada costuma ser aspas no lugar
 * errado.
 *
 * `-c:a copy` sem exceção: o áudio é a voz clonada e sai bit a bit igual.
 * Recodificá-lo custaria qualidade em troca de nada.
 */
export function buildDerivationArgs(input: string, output: string, canvas: Resolution): string[] {
  return [
    "-y",
    "-v", "error",
    "-i", input,
    "-filter_complex", buildDerivationFilter(canvas),
    "-c:v", "libx264",
    "-crf", "18",
    "-preset", "slow",
    "-pix_fmt", "yuv420p",
    // fps NÃO é tocado: reamostrar inventa ou descarta quadros.
    "-c:a", "copy",
    "-movflags", "+faststart",
    output,
  ];
}

/**
 * Proporção "a:b" → os dois números. Entrada malformada lança em vez de cair
 * num padrão: uma proporção silenciosamente trocada por 16:9 produziria um
 * vídeo horizontal onde alguém pediu vertical, sem erro em lugar nenhum.
 */
export function parseAspectRatio(ratio: string): { a: number; b: number } {
  const m = /^(\d+):(\d+)$/.exec(ratio.trim());
  if (!m) throw new Error(`Proporção malformada: ${JSON.stringify(ratio)}. Esperado "a:b", como "9:16".`);
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a <= 0 || b <= 0) throw new Error(`Proporção com lado não positivo: ${JSON.stringify(ratio)}.`);
  return { a, b };
}

/**
 * Quadro-alvo de uma proporção, ancorado no LADO CURTO.
 *
 * Esta é a regra que o fornecedor publica — "output is short-edge anchored to
 * the requested resolution (`1080p` 1:1 → 1080x1080, `1080p` 4:5 → 1080x1350)"
 * — e adotá-la aqui tem uma consequência que vale mais que a economia de
 * digitação: os quatro alvos da política aprovada (9:16 1080×1920 · 4:5
 * 1080×1350 · 1:1 1080×1080 · 16:9 1920×1080) deixam de ser quatro números
 * escritos à mão e passam a ser CONSEQUÊNCIA de um só — o lado curto.
 *
 * Isso é o que permite a guarda afirmar alguma coisa: ela compara a tabela
 * produzida com os quatro números da política, e se estivessem gravados no
 * código a comparação seria do código com ele mesmo.
 *
 * Trocar 1080 por 720 move a tabela inteira junto, coerentemente — que é o
 * item 1.3, e o motivo de não haver constante de master em lugar nenhum.
 */
export function targetForAspect(ratio: string, shortEdge: number): Resolution {
  const { a, b } = parseAspectRatio(ratio);
  return a <= b
    ? { width: toEven(shortEdge), height: toEven((shortEdge * b) / a) }
    : { width: toEven((shortEdge * a) / b), height: toEven(shortEdge) };
}

/**
 * Resolução do MASTER: sempre 9:16, no lado curto do teto do fornecedor.
 *
 * DOCUMENTADO, não medido: nenhuma geração nossa pediu 1080p até hoje. O teto
 * real da NOSSA conta continua NÃO VERIFICADO — o endpoint que o revelaria
 * exige rede, bloqueada no bloco em que isto foi escrito.
 */
export function masterResolutionFor(resolution: string): Resolution {
  const shortEdge = RESOLUTION_SHORT_EDGE[resolution];
  if (!shortEdge) {
    throw new Error(
      `Resolução desconhecida: ${JSON.stringify(resolution)}. ` +
        `Conhecidas: ${Object.keys(RESOLUTION_SHORT_EDGE).join(", ")}.`,
    );
  }
  return targetForAspect(MASTER_ASPECT_RATIO, shortEdge);
}

/**
 * O master é 9:16 porque é a proporção da qual todas as outras saem por
 * REDUÇÃO. Gerar em 16:9 e derivar o vertical exigiria cortar as laterais (e
 * perder o enquadramento) ou ampliar (e inventar nitidez): as duas coisas que
 * a política proíbe. O vertical é o quadro mais "alto" do catálogo, então cabe
 * dentro dele todo o resto.
 */
export const MASTER_ASPECT_RATIO = "9:16";
