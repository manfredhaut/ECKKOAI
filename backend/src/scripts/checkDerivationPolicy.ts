/**
 * Invariante da DERIVAÇÃO — bloco 5E.
 *
 * A política tem duas metades, e confundi-las é o defeito que esta guarda
 * existe para impedir:
 *
 *   o SUJEITO nunca é cortado nem ampliado;
 *   o FUNDO desfocado PODE ser ampliado.
 *
 * Só a primeira é verificável de fora, e é a que importa: ampliar o sujeito
 * inventa nitidez que não existe, e o resultado passa despercebido numa tela
 * pequena — o cliente descobre no telão.
 *
 * ---------------------------------------------------------------------------
 * POR QUE ESTA GUARDA RODA O FFMPEG DE VERDADE
 *
 * A tentação é conferir a aritmética de `deriveFormat`, que é pura e instantânea.
 * Mas quem decide a altura final do sujeito não é a nossa conta: é o
 * `force_original_aspect_ratio=decrease` dentro do filtro. Trocar essa palavra
 * por `increase` não muda uma linha da aritmética — e passaria por qualquer
 * guarda que só verificasse números nossos.
 *
 * Então a asserção principal MEDE: aplica a expressão real do sujeito sobre
 * uma fixture versionada e pergunta ao `ffprobe` que tamanho saiu. Custa uma
 * fração de segundo por proporção porque a sonda extrai UM quadro, não o vídeo.
 * ---------------------------------------------------------------------------
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { probeVideo, runFfmpeg, ffmpegAvailable } from "../services/video/ffmpeg.js";
import { localPathForUpload, MasterNotLocalError } from "../services/video/deriveVariants.js";
import {
  buildSubjectProbeArgs,
  deriveFormat,
  masterResolutionFor,
  targetForAspect,
  type Resolution,
} from "../services/providers/formatDerivation.js";
import { FIXTURES_DIR } from "../services/providers/fixtureProvider.js";
import { HEYGEN_ASPECT_RATIOS } from "../services/providers/videoFormat.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "derivação: o sujeito nunca é ampliado",
    name: "a escala do sujeito passa a ampliar (decrease → increase)",
    kind: "obvio",
    file: "backend/src/services/providers/formatDerivation.ts",
    find: "  return `scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=decrease:flags=lanczos`;",
    replace:
      "  return `scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=increase:flags=lanczos`;",
    expect: "AMPLIOU o sujeito",
  },
  {
    guard: "derivação: o sujeito nunca é ampliado",
    name: "o quadro deixa de ceder, e o sujeito amplia para alcançar o alvo",
    kind: "esperto",
    file: "backend/src/services/providers/formatDerivation.ts",
    // A palavra `decrease` continua no filtro, `deriveFormat` continua
    // existindo e devolvendo `subjectScale`, e a superfície inteira fica igual.
    // O que muda é quem cede quando o master é menor que o alvo: hoje é o
    // quadro, e com este mutante passa a ser a imagem. É exatamente a decisão
    // que a política toma, e ela não aparece em nenhuma palavra do filtro.
    find:
      "      : { width: toEven(spec.target.width / fit), height: toEven(spec.target.height / fit) };",
    replace: "      : { ...spec.target };",
    expect: "AMPLIOU o sujeito",
  },
  {
    guard: "derivação: o sujeito nunca é ampliado",
    name: "lanczos → bicubic: muda a reamostragem, não a geometria — segue verde",
    kind: "esperto",
    // Contraponto. A guarda mede GEOMETRIA; se reprovasse aqui estaria casando
    // o texto do filtro, e seria abandonada na primeira troca legítima de
    // algoritmo de reamostragem.
    file: "backend/src/services/providers/formatDerivation.ts",
    find: "force_original_aspect_ratio=decrease:flags=lanczos`;",
    replace: "force_original_aspect_ratio=decrease:flags=bicubic`;",
    expect: "sem ampliar o sujeito",
    expectGreen: true,
  },
  {
    guard: "derivação: o master vem do NOSSO disco",
    name: "a derivação passa a aceitar URL de fornecedor",
    kind: "obvio",
    file: "backend/src/services/video/deriveVariants.ts",
    find: '  if (!url.startsWith("/uploads/")) throw new MasterNotLocalError(url);',
    replace: "  if (false) throw new MasterNotLocalError(url);",
    expect: "aceitou um master que não está no nosso armazenamento",
  },
];

export interface DerivationCheckResult {
  failures: string[];
  notes: string[];
}

export async function checkDerivationPolicy(): Promise<DerivationCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  checkPolicyTableIsReproduced(failures, notes);
  checkShortfallIsAnnounced(failures, notes);
  checkMasterMustBeLocal(failures, notes);
  await checkSubjectIsNeverEnlarged(failures, notes);

  return { failures, notes };
}

// --------------------------------------------------------------------- 1 ---

/**
 * A tabela da política aprovada, reproduzida pela função.
 *
 * Os quatro números estão AQUI, e não no código de produção, de propósito: lá
 * eles são consequência de uma regra (lado curto = resolução pedida), e aqui
 * são o dado observado contra o qual a regra é conferida. Se estivessem nos
 * dois lugares, este teste compararia o código consigo mesmo.
 */
const POLITICA_1080 = [
  { aspect: "9:16", width: 1080, height: 1920 },
  { aspect: "4:5", width: 1080, height: 1350 },
  { aspect: "1:1", width: 1080, height: 1080 },
  { aspect: "16:9", width: 1920, height: 1080 },
] as const;

function checkPolicyTableIsReproduced(failures: string[], notes: string[]): void {
  const master = masterResolutionFor("1080p");

  if (master.width !== 1080 || master.height !== 1920) {
    failures.push(
      `derivação: o master em 1080p saiu ${master.width}×${master.height}, e a política pede 1080×1920. ` +
        "O master é 9:16 ancorado no lado curto — se isso mudou, a tabela inteira mudou junto.",
    );
  }

  for (const esperado of POLITICA_1080) {
    const target = targetForAspect(esperado.aspect, 1080);
    const d = deriveFormat(master, { aspectRatio: esperado.aspect, target });

    if (d.canvas.width !== esperado.width || d.canvas.height !== esperado.height) {
      failures.push(
        `derivação: com master 1080×1920, o formato ${esperado.aspect} saiu ` +
          `${d.canvas.width}×${d.canvas.height}, e a política aprovada pede ` +
          `${esperado.width}×${esperado.height}.`,
      );
    }
    if (d.subjectScale > 1) {
      failures.push(
        `derivação: ${esperado.aspect} escala o sujeito por ${d.subjectScale.toFixed(4)}, que é ampliar. ` +
          "Toda derivação é redução; o fator nunca passa de 1.",
      );
    }
    if (!d.meetsTarget) {
      failures.push(
        `derivação: com master 1080×1920 o formato ${esperado.aspect} deveria atender o alvo, e não atendeu. ` +
          "Com o master no teto, tudo vira redução — se algo ficou abaixo, a conta do quadro está errada.",
      );
    }
  }

  notes.push(
    `derivação: a tabela da política (${POLITICA_1080.map((p) => p.aspect).join(", ")}) é reproduzida ` +
      "a partir do master 1080×1920, com todos os fatores de sujeito ≤ 1",
  );
}

// --------------------------------------------------------------------- 2 ---

/**
 * Master abaixo do alvo: o quadro cede, e a tela FICA SABENDO.
 *
 * A metade silenciosa é a perigosa. Um formato entregue abaixo da especificação
 * que não se anuncia é pior que um formato ausente, porque parece entregue — e
 * quem publica descobre no destino, não aqui.
 */
function checkShortfallIsAnnounced(failures: string[], notes: string[]): void {
  const master = masterResolutionFor("720p");
  const target = targetForAspect("4:5", 1080);
  const d = deriveFormat(master, { aspectRatio: "4:5", target });

  // O caso concreto da política: master 720p faz o 4:5 sair em 1024×1280.
  if (d.canvas.width !== 1024 || d.canvas.height !== 1280) {
    failures.push(
      `derivação: com master 720×1280 o 4:5 deveria sair 1024×1280 e saiu ` +
        `${d.canvas.width}×${d.canvas.height}. O quadro cede pelo fator que faltava — a imagem não estica.`,
    );
  }
  if (d.meetsTarget || !d.shortfall) {
    failures.push(
      "derivação: um formato ABAIXO do alvo passou sem se anunciar. `meetsTarget` tem de ser falso e " +
        "`shortfall` tem de trazer o motivo em pt-BR: silenciar aqui entrega um vídeo fora de " +
        "especificação com aparência de correto.",
    );
  } else if (!d.shortfall.includes("1024") || !d.shortfall.includes("1080")) {
    failures.push(
      "derivação: o aviso de formato abaixo do alvo não diz os DOIS números (o que saiu e o que se " +
        "pedia). Sem os dois, quem lê não consegue decidir se regenera em resolução maior.",
    );
  }

  // Contraponto: com o master no teto, o MESMO formato não pode avisar nada.
  // Uma guarda que exigisse aviso sempre passaria aqui sem distinguir nada.
  const noTeto = deriveFormat(masterResolutionFor("1080p"), { aspectRatio: "4:5", target });
  if (!noTeto.meetsTarget || noTeto.shortfall !== null) {
    failures.push(
      "derivação: com o master no teto, o 4:5 continuou avisando que está abaixo do alvo. Aviso que " +
        "aparece sempre é ruído, e ruído treina o cliente a ignorar o aviso que importa.",
    );
  }

  notes.push(
    "derivação: master abaixo do alvo faz o QUADRO ceder (720p → 4:5 em 1024×1280) e o aviso sai com " +
      "os dois números; no teto, o mesmo formato não avisa nada",
  );
}

// --------------------------------------------------------------------- 3 ---

/** O master tem de estar no nosso disco. URL de fornecedor expira. */
function checkMasterMustBeLocal(failures: string[], notes: string[]): void {
  const externas = [
    "https://files2.heygen.ai/aws_pacific/avatar_tmp/x.mp4?Expires=1234",
    "http://example.com/video.mp4",
    "/etc/passwd",
  ];

  for (const url of externas) {
    let recusou = false;
    try {
      localPathForUpload(url);
    } catch (err) {
      recusou = err instanceof MasterNotLocalError;
    }
    if (!recusou) {
      failures.push(
        `derivação: aceitou um master que não está no nosso armazenamento (${url.slice(0, 32)}…). ` +
          "A URL do fornecedor é assinada e expira — dois vídeos deste projeto já viraram 403 assim, " +
          "e derivar a partir dela reintroduziria a falha num caminho que só quebra semanas depois.",
      );
    }
  }

  // Escapar do diretório de uploads também é recusado.
  let recusouEscape = false;
  try {
    localPathForUpload("/uploads/../../etc/passwd");
  } catch (err) {
    recusouEscape = err instanceof MasterNotLocalError;
  }
  if (!recusouEscape) {
    failures.push(
      "derivação: aceitou um master que escapa do diretório de uploads. O caminho é resolvido antes de " +
        "comparar justamente porque a busca ingênua por `..` erra nas variantes de codificação.",
    );
  }

  // Contraponto: uma URL legítima nossa TEM de passar.
  try {
    localPathForUpload("/uploads/algum-tenant/arquivo.mp4");
  } catch {
    failures.push(
      "derivação: recusou uma URL legítima do nosso armazenamento. Uma guarda que recusa tudo bloqueia " +
        "a derivação inteira, e o sintoma seria 'a derivação parou de funcionar', não 'a checagem está errada'.",
    );
  }

  notes.push(`derivação: ${externas.length + 1} origem(ns) externa(s) recusada(s), a nossa aceita`);
}

// --------------------------------------------------------------------- 4 ---

/**
 * A ASSERÇÃO PRINCIPAL, e a única que mede: o sujeito não amplia.
 *
 * Roda a expressão real sobre a fixture 9:16 versionada — que é pequena
 * (360×640), então todo alvo de 1080 exigiria ampliar se a política não
 * estivesse valendo. É o caso mais exigente disponível sem gerar nada.
 */
async function checkSubjectIsNeverEnlarged(failures: string[], notes: string[]): Promise<void> {
  const disponivel = await ffmpegAvailable();
  if (!disponivel.ok) {
    // NOTA, não falha: o gate também é verificação de código, e amarrá-lo a um
    // binário ausente produziria o falso positivo que ensina a ignorar o gate.
    // Mas a nota diz que a verificação NÃO ACONTECEU, em vez de fingir que passou.
    notes.push(
      `derivação: ffmpeg indisponível (${disponivel.detail.slice(0, 60)}) — a medição do sujeito NÃO ` +
        "foi executada nesta passada. A invariante segue não verificada aqui.",
    );
    return;
  }

  const master = path.join(FIXTURES_DIR, "simulated-video-9x16.mp4");
  let masterGeo: Resolution;
  try {
    const p = await probeVideo(master);
    masterGeo = { width: p.width, height: p.height };
  } catch (err) {
    failures.push(
      `derivação: não foi possível medir a fixture de master (${err instanceof Error ? err.message.slice(0, 80) : err}). ` +
        "Sem ela a invariante principal deste bloco não é verificada por ninguém.",
    );
    return;
  }

  const dir = await mkdtemp(path.join(tmpdir(), "5e-guard-"));
  const medidos: string[] = [];

  try {
    for (const aspect of HEYGEN_ASPECT_RATIOS) {
      const target = targetForAspect(aspect, 1080);
      const plan = deriveFormat(masterGeo, { aspectRatio: aspect, target });
      const out = path.join(dir, `${aspect.replace(":", "x")}.png`);

      await runFfmpeg(buildSubjectProbeArgs(master, out, plan.canvas), `guarda ${aspect}`);
      const s = await probeVideo(out);

      if (s.height > masterGeo.height || s.width > masterGeo.width) {
        failures.push(
          `derivação: o formato ${aspect} AMPLIOU o sujeito — saiu ${s.width}×${s.height} de um master ` +
            `${masterGeo.width}×${masterGeo.height}. A política proíbe: ampliar inventa nitidez que não ` +
            "existe, e o resultado só é perceptível fora da tela onde foi aprovado.",
        );
      }

      // Cortar também é proibido: a proporção do sujeito tem de ser a do master.
      const propMaster = masterGeo.width / masterGeo.height;
      const propSujeito = s.width / s.height;
      if (Math.abs(propMaster - propSujeito) > 0.02) {
        failures.push(
          `derivação: o formato ${aspect} CORTOU o sujeito — a proporção saiu ${propSujeito.toFixed(3)} ` +
            `contra ${propMaster.toFixed(3)} do master. O enquadramento do avatar é o que o cliente aprovou.`,
        );
      }

      medidos.push(`${aspect}=${s.width}×${s.height}`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  notes.push(
    `derivação: ${medidos.length} formato(s) medidos com ffmpeg sobre master ` +
      `${masterGeo.width}×${masterGeo.height} — sem ampliar o sujeito e sem cortar (${medidos.join(", ")})`,
  );
}
