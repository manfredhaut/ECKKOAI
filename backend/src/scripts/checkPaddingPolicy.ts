/**
 * Invariantes do PREENCHIMENTO — bloco 5F.
 *
 * Preenchimento do fornecedor não é conteúdo. Tratá-lo como conteúdo produz
 * quatro defeitos distintos, e cada um tem um mutante aqui:
 *
 *  (a) a sonda devolve o quadro inteiro mesmo havendo barra → nada é recortado,
 *      e a moldura desfocada é desenhada em volta de outra moldura;
 *  (b) a régua mede o QUADRO em vez do conteúdo → alvos aprovados com pixels de
 *      barra branca (medido: 16:9 e 1:1 passavam de "atende" a "não atende"
 *      quando a referência trocou);
 *  (c) o recorte avança sobre o conteúdo → come imagem, e isso não tem volta;
 *  (d) a cadeia enquadra sem passar pela sonda → volta ao comportamento
 *      anterior sem que nada pareça diferente.
 *
 * Todas as asserções exercitam o caminho REAL sobre uma fixture versionada com
 * preenchimento conhecido. Uma sonda testada contra números inventados por ela
 * mesma não afirmaria nada.
 */
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { probePadding } from "../services/video/paddingProbe.js";
import { planDerivation } from "../services/video/deriveVariants.js";
import { buildDerivationArgs } from "../services/providers/formatDerivation.js";
import { FIXTURES_DIR } from "../services/providers/fixtureProvider.js";
import { ffmpegAvailable } from "../services/video/ffmpeg.js";

/**
 * A fixture com preenchimento e o que ela contém, MEDIDO por leitura direta da
 * luminância (não pelo que o comando de geração pediu — o `pad` foi pedido em
 * y=185 e o arquivo codificado tem conteúdo a partir de y=184, por sangramento
 * de croma do `yuv420p`).
 *
 * Estes números são o dado observado contra o qual a sonda é conferida. Se
 * viessem da própria sonda, o teste compararia o código consigo mesmo.
 */
const FIXTURE_PADDED = "simulated-video-padded-9x16.mp4";
const FIXTURE_CLEAN = "simulated-video-9x16.mp4";
const CONTEUDO = { x: 0, y: 184, width: 360, height: 270 };
const QUADRO = { width: 360, height: 640 };

export const MUTANTS: Mutant[] = [
  {
    guard: "preenchimento: a sonda enxerga a barra",
    name: "a sonda devolve o quadro inteiro mesmo havendo preenchimento",
    kind: "obvio",
    file: "backend/src/services/video/paddingProbe.ts",
    find: "  if (larguraUtil === geo.width && alturaUtil === geo.height) {",
    replace: "  if (true) {",
    expect: "não enxergou o preenchimento",
  },
  {
    guard: "preenchimento: a régua mede o CONTEÚDO, não o quadro",
    name: "o alvo volta a ser derivado da resolução do quadro",
    kind: "esperto",
    file: "backend/src/services/video/deriveVariants.ts",
    // A sonda continua rodando, o recorte continua saindo no filtro, e o
    // arquivo entregue continua correto. O que volta a mentir é a RÉGUA: o
    // aviso "abaixo da especificação" some para formatos que a imagem real não
    // alcança. É o defeito mais silencioso dos quatro, porque o vídeo fica
    // certo e só o julgamento sobre ele fica errado.
    find: "  const format = deriveFormat(content, { aspectRatio, target });",
    replace:
      "  const format = deriveFormat({ width: padding.frame.width, height: padding.frame.height }, { aspectRatio, target });",
    expect: "mediu o QUADRO em vez do conteúdo",
  },
  {
    guard: "preenchimento: o recorte nunca avança sobre o conteúdo",
    name: "o recorte come duas linhas de imagem",
    kind: "esperto",
    file: "backend/src/services/video/paddingProbe.ts",
    // Continua havendo recorte, continua havendo veredito `padded`, e o
    // resultado continua plausível — duas linhas a menos não se veem numa
    // miniatura. É exatamente o erro que só aparece no vídeo final, e nele já
    // é irreversível.
    find: "    crop: { x: horizontal.start, y: vertical.start, width: larguraUtil, height: alturaUtil },",
    replace:
      "    crop: { x: horizontal.start, y: vertical.start + 2, width: larguraUtil, height: alturaUtil - 2 },",
    expect: "avançou sobre o conteúdo",
  },
  {
    guard: "preenchimento: a cadeia passa pela sonda",
    name: "o enquadramento deixa de receber o recorte",
    kind: "obvio",
    file: "backend/src/services/video/deriveVariants.ts",
    find: "    crop: padding.crop,",
    replace: "    crop: null,",
    // Recorte do `expect` na parte ESTÁVEL da frase, e com a caixa exata: a
    // mensagem escreve "NÃO" em maiúsculas, e o arnês compara diferenciando.
    // É a sexta vez que um `expect` mal recortado faz guarda saudável aparecer
    // como AMBÍGUA neste projeto.
    expect: "o filtro de derivação NÃO leva o recorte",
  },
  {
    guard: "preenchimento: a sonda enxerga a barra",
    name: "amostrar em outros instantes — mesma medida, deve seguir verde",
    kind: "esperto",
    // Contraponto: a sonda mede uma propriedade ESTÁTICA do vídeo, então o
    // instante amostrado não pode mudar o resultado. Reprovar aqui significaria
    // que a medição depende de onde se olha, o que é o oposto do que ela
    // afirma.
    file: "backend/src/services/video/paddingProbe.ts",
    find: "const SAMPLE_POSITIONS = [0.15, 0.5, 0.85];",
    replace: "const SAMPLE_POSITIONS = [0.2, 0.5, 0.8];",
    expect: "preenchimento: sonda conferida",
    expectGreen: true,
  },
];

export interface PaddingCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkPaddingPolicy(): Promise<PaddingCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const disponivel = await ffmpegAvailable();
  if (!disponivel.ok) {
    notes.push(
      `preenchimento: ffmpeg indisponível (${disponivel.detail.slice(0, 50)}) — a sonda NÃO foi ` +
        "exercitada nesta passada. As invariantes seguem não verificadas aqui.",
    );
    return { failures, notes };
  }

  const padded = path.join(FIXTURES_DIR, FIXTURE_PADDED);
  const clean = path.join(FIXTURES_DIR, FIXTURE_CLEAN);

  const r = await probePadding(padded);

  // --- (a) a sonda enxerga a barra --------------------------------------
  if (r.verdict !== "padded" || !r.crop) {
    failures.push(
      `preenchimento: a sonda não enxergou o preenchimento da fixture (veredito "${r.verdict}"). ` +
        `Ela tem ${QUADRO.width}×${QUADRO.height} com apenas ${CONTEUDO.width}×${CONTEUDO.height} de ` +
        "imagem — 58% é barra branca. Uma sonda cega faz a moldura desfocada ser desenhada em volta " +
        "de outra moldura, que é o defeito de 02/08.",
    );
  } else {
    // --- (c) o recorte não avança sobre o conteúdo ----------------------
    const c = r.crop;
    const invadeTopo = c.y > CONTEUDO.y;
    const invadeBase = c.y + c.height < CONTEUDO.y + CONTEUDO.height;
    const invadeEsq = c.x > CONTEUDO.x;
    const invadeDir = c.x + c.width < CONTEUDO.x + CONTEUDO.width;
    if (invadeTopo || invadeBase || invadeEsq || invadeDir) {
      failures.push(
        `preenchimento: o recorte avançou sobre o conteúdo — pediu ` +
          `x=${c.x} y=${c.y} ${c.width}×${c.height}, e a imagem ocupa ` +
          `x=${CONTEUDO.x} y=${CONTEUDO.y} ${CONTEUDO.width}×${CONTEUDO.height}. ` +
          "Recortar a mais come rosto, e isso não tem volta; quando há dúvida de um pixel, o erro " +
          "barato é sobrar barra, não faltar imagem.",
      );
    }
    if (r.content.width !== CONTEUDO.width || r.content.height !== CONTEUDO.height) {
      failures.push(
        `preenchimento: o conteúdo medido saiu ${r.content.width}×${r.content.height}, e a fixture tem ` +
          `${CONTEUDO.width}×${CONTEUDO.height} de imagem.`,
      );
    }
  }

  // Contraponto de (a): vídeo sem barra não pode ganhar recorte inventado.
  const limpo = await probePadding(clean);
  if (limpo.verdict !== "clean" || limpo.crop !== null) {
    failures.push(
      `preenchimento: a sonda inventou preenchimento num vídeo que não tem (veredito ` +
        `"${limpo.verdict}"). Recortar o que não é barra é pior que não recortar nada.`,
    );
  }

  // --- (b) a régua mede o conteúdo --------------------------------------
  const plano = await planDerivation(padded, "16:9");
  const alvoSobreConteudo = { width: 480, height: 270 };
  if (plano.canvas.width !== alvoSobreConteudo.width || plano.canvas.height !== alvoSobreConteudo.height) {
    failures.push(
      `preenchimento: a régua mediu o QUADRO em vez do conteúdo — o 16:9 saiu ` +
        `${plano.canvas.width}×${plano.canvas.height}, e sobre a imagem real ` +
        `(${CONTEUDO.width}×${CONTEUDO.height}) ele é ${alvoSobreConteudo.width}×${alvoSobreConteudo.height}. ` +
        "Medir o quadro aprova alvos com pixels de barra branca: no master de 02/08, 16:9 e 1:1 " +
        "constavam como atendidos e não eram.",
    );
  }
  if (plano.meetsTarget) {
    failures.push(
      "preenchimento: um master cuja imagem real tem 270 px de altura foi dado como atendendo um alvo " +
        "de 1080. É o aviso de 'abaixo da especificação' calculado sobre a barra.",
    );
  }

  // --- (d) a cadeia passa pela sonda ------------------------------------
  const args = buildDerivationArgs(padded, "/tmp/x.mp4", plano.canvas, plano.crop);
  const filtro = args[args.indexOf("-filter_complex") + 1] ?? "";
  if (!filtro.includes(`crop=${CONTEUDO.width}:${CONTEUDO.height}:`)) {
    failures.push(
      "preenchimento: o filtro de derivação NÃO leva o recorte, mesmo com a sonda acusando barra. " +
        "Sem ele a cadeia volta ao comportamento anterior a este bloco, e nada na tela ou no log " +
        `pareceria diferente. Filtro montado: ${filtro.slice(0, 90)}`,
    );
  }

  // Contraponto de (d): num vídeo limpo o filtro não pode ganhar recorte.
  const planoLimpo = await planDerivation(clean, "16:9");
  const argsLimpo = buildDerivationArgs(clean, "/tmp/y.mp4", planoLimpo.canvas, planoLimpo.crop);
  const filtroLimpo = argsLimpo[argsLimpo.indexOf("-filter_complex") + 1] ?? "";
  if (/(^|;)\[0:v\]crop=/.test(filtroLimpo)) {
    failures.push(
      "preenchimento: o filtro recortou a origem de um vídeo sem preenchimento. Um vídeo limpo tem de " +
        "atravessar a cadeia idêntico ao que atravessava antes deste bloco.",
    );
  }

  notes.push(
    `preenchimento: sonda conferida contra fixture de preenchimento conhecido — quadro ` +
      `${QUADRO.width}×${QUADRO.height}, imagem ${CONTEUDO.width}×${CONTEUDO.height} ` +
      `(${(r.paddingFraction * 100).toFixed(0)}% de barra), recorte sem avançar sobre o conteúdo`,
  );
  notes.push(
    `preenchimento: a régua mede o conteúdo (16:9 → ${plano.canvas.width}×${plano.canvas.height}, ` +
      "abaixo do alvo, como deve) e o recorte chega ao filtro; vídeo limpo passa sem recorte",
  );

  return { failures, notes };
}
