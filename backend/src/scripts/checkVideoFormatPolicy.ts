/**
 * Invariante do formato: nenhuma geração chega ao fornecedor sem proporção e
 * resolução EXPLÍCITAS.
 *
 * O defeito congelado aqui é de omissão pura, e por isso não aparece em
 * revisão: `POST /v3/videos` levava `{type, avatar_id, audio_asset_id}` e nada
 * mais. Não havia linha errada para apontar — havia linha faltando. O vídeo
 * medido no LIVE-1 saiu 1280×720 16:9 porque esse é o padrão da conta na
 * HeyGen, e "padrão do fornecedor" é uma decisão de produto tomada por quem não
 * sabe onde o vídeo vai ser publicado.
 *
 * A verificação principal é COMPORTAMENTAL: monta o payload pelo caminho real e
 * inspeciona o que sairia na rede. Casar texto no arquivo passaria a aprovar no
 * dia em que alguém movesse a montagem para outra função — e é justamente o
 * tipo de reorganização que faz um campo se perder.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { buildHeygenVideoPayload } from "../services/providers/avatarProvider.js";
import {
  HEYGEN_ASPECT_RATIOS,
  HEYGEN_RESOLUTIONS,
  PUBLISH_PLATFORMS,
  VENDOR_FORMAT_SUPPORT,
  resolveVideoFormat,
} from "../services/providers/videoFormat.js";
import { FIXTURE_VIDEO_FILES, FIXTURES_DIR } from "../services/providers/fixtureProvider.js";
import { VENDORS_BY_PROVIDER } from "../services/providers/vendorCatalog.js";
import { selectEngine } from "../services/providers/videoEngine.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "formato: payload de geração leva proporção explícita",
    name: "o payload volta a omitir aspect_ratio",
    kind: "obvio",
    file: "backend/src/services/providers/avatarProvider.ts",
    find: "    aspect_ratio: input.format.aspectRatio,\n    resolution: input.format.resolution,",
    replace: "",
    expect: "sem `aspect_ratio`",
  },
  {
    guard: "formato: payload de geração leva proporção explícita",
    name: "o campo continua no payload, com o valor do fornecedor",
    kind: "esperto",
    file: "backend/src/services/providers/videoFormat.ts",
    // A superfície não muda: `aspect_ratio` continua sendo montado, a partir do
    // catálogo, e o payload continua tendo o campo. O que muda é o VALOR — toda
    // plataforma passa a resolver para 16:9, que é exatamente o padrão que a
    // conta já aplicava por omissão. Uma guarda que só verificasse "o campo
    // existe?" passaria, e o produto voltaria a entregar horizontal para quem
    // pediu vertical — com o campo preenchido, o que é pior, porque agora
    // parece decidido.
    find: `  const entry = PUBLISH_PLATFORMS.find((p) => p.id === id)!;
  return { platform: entry.id, aspectRatio: entry.aspectRatio, resolution: entry.resolution };`,
    replace: `  const entry = PUBLISH_PLATFORMS.find((p) => p.id === id)!;
  return { platform: entry.id, aspectRatio: "16:9", resolution: entry.resolution };`,
    // O trecho é o núcleo da frase, sem a contagem: a mensagem começa com "as
    // 4 plataformas do catálogo", e prender o `expect` a esse número faria o
    // mutante virar AMBÍGUO no dia em que uma quinta plataforma entrasse — uma
    // guarda saudável parecendo quebrada, que é como se aprende a ignorar o
    // arnês.
    expect: "resolvem para a MESMA proporção",
  },
  {
    guard: "formato: a simulação honra a proporção pedida",
    name: "a fixture volta a ser a mesma para toda proporção",
    kind: "esperto",
    file: "backend/src/services/providers/fixtureProvider.ts",
    // O mapa continua existindo e continua completo — só deixa de distinguir.
    // Uma guarda que checasse "há uma entrada para cada proporção?" passaria, e
    // o modo fixture voltaria a aprovar o caminho de formato sem exercitá-lo:
    // falso verde, que é o defeito que a divisão por proporção existe para
    // eliminar.
    find: `  "9:16": "simulated-video-9x16.mp4",`,
    replace: `  "9:16": "simulated-video-16x9.mp4",`,
    expect: "apontam para o MESMO arquivo",
  },
];

export interface VideoFormatCheckResult {
  failures: string[];
  notes: string[];
}

/** Um payload de geração precisa ter estes campos, sempre. */
const REQUIRED_PAYLOAD_FIELDS = ["aspect_ratio", "resolution"] as const;

export async function checkVideoFormatPolicy(repoRoot: string): Promise<VideoFormatCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const montagens = checkPayloadCarriesFormat(failures);
  checkPlatformsCoverDistinctRatios(failures, notes);
  checkVendorsDeclareFormatSupport(failures, notes);
  await checkFixturesPerAspectRatio(failures, notes);
  checkEngineSelectionAlwaysDecides(failures, notes);
  await checkFrontendMirrorsCatalog(repoRoot, failures, notes);

  notes.push(
    `formato: ${montagens} montagem(ns) de payload de geração conferida(s) — todas com ` +
      REQUIRED_PAYLOAD_FIELDS.map((f) => `\`${f}\``).join(" e ") + " explícitos",
  );
  return { failures, notes };
}

/**
 * Exercita a montagem real do payload, uma vez por plataforma do catálogo.
 *
 * Devolve quantas montagens foram inspecionadas — é esse o número que a nota
 * final publica. Um universo vazio (catálogo esvaziado, função renomeada) faz
 * a guarda reprovar em vez de anunciar "0 conferidas", pelo mesmo motivo que a
 * asserção de planos passou a reprovar universo-zero no GUARDAS-1: uma guarda
 * que não encontra nada parece cobertura e não é.
 */
function checkPayloadCarriesFormat(failures: string[]): number {
  let montagens = 0;

  for (const platform of PUBLISH_PLATFORMS) {
    const format = resolveVideoFormat(platform.id);
    const { body } = buildHeygenVideoPayload(
      {
        providerAvatarId: "avatar-de-teste",
        format,
        supportedEngines: ["avatar_iv", "avatar_iii"],
        engineEnabled: false,
      },
      "asset-de-teste",
    );
    montagens += 1;

    for (const field of REQUIRED_PAYLOAD_FIELDS) {
      const value = body[field];
      if (typeof value !== "string" || value.length === 0) {
        failures.push(
          `formato: o payload de geração para "${platform.id}" sai sem \`${field}\`. ` +
            "Sem esse campo o fornecedor escolhe a geometria sozinho — foi assim que o vídeo do " +
            "LIVE-1 saiu 16:9 sem ninguém decidir, e o cliente que escolheu vertical receberia horizontal.",
        );
      }
    }

    if (body.aspect_ratio !== format.aspectRatio) {
      failures.push(
        `formato: "${platform.id}" pede ${format.aspectRatio} e o payload leva ${String(body.aspect_ratio)}. ` +
          "O campo estar preenchido não basta: preenchido com o valor errado é pior que ausente, " +
          "porque parece decidido.",
      );
    }
  }

  if (montagens === 0) {
    failures.push(
      "formato: nenhuma montagem de payload foi conferida — o catálogo de plataformas está vazio " +
        "ou a função de montagem deixou de ser alcançável. Uma guarda que não inspeciona nada " +
        "ocupa o lugar da verificação que faria falta.",
    );
  }
  return montagens;
}

/**
 * O catálogo precisa oferecer proporções DIFERENTES entre si.
 *
 * É esta asserção que pega o mutante esperto: um catálogo em que todas as
 * plataformas resolvem para 16:9 continua produzindo payload com o campo
 * preenchido, e reproduz exatamente o comportamento anterior ao bloco — só que
 * agora com aparência de escolha.
 */
function checkPlatformsCoverDistinctRatios(failures: string[], notes: string[]): void {
  const ratios = new Set(PUBLISH_PLATFORMS.map((p) => resolveVideoFormat(p.id).aspectRatio));

  if (ratios.size <= 1 && PUBLISH_PLATFORMS.length > 1) {
    failures.push(
      `formato: as ${PUBLISH_PLATFORMS.length} plataformas do catálogo resolvem para a MESMA proporção ` +
        `(${[...ratios].join(", ")}). A tela oferece destinos diferentes e o fornecedor recebe sempre o ` +
        "mesmo pedido — o campo vai preenchido e a escolha do cliente é descartada em silêncio.",
    );
  }

  for (const p of PUBLISH_PLATFORMS) {
    const format = resolveVideoFormat(p.id);
    if (!(HEYGEN_ASPECT_RATIOS as readonly string[]).includes(format.aspectRatio)) {
      failures.push(
        `formato: a plataforma "${p.id}" pede a proporção "${format.aspectRatio}", que não está entre as ` +
          `documentadas pelo fornecedor (${HEYGEN_ASPECT_RATIOS.join(", ")}). O pedido seria recusado na geração.`,
      );
    }
    if (!(HEYGEN_RESOLUTIONS as readonly string[]).includes(format.resolution)) {
      failures.push(
        `formato: a plataforma "${p.id}" pede a resolução "${format.resolution}", fora das documentadas ` +
          `(${HEYGEN_RESOLUTIONS.join(", ")}).`,
      );
    }
  }

  notes.push(
    `formato: ${PUBLISH_PLATFORMS.length} plataforma(s) → ${ratios.size} proporção(ões) distinta(s) ` +
      `(${[...ratios].join(", ")}), todas documentadas pelo fornecedor`,
  );
}

/**
 * Todo vendor de avatar precisa DECIDIR sobre formato, com o motivo escrito.
 *
 * Sem isto, um vendor novo herda em silêncio o defeito corrigido aqui — o
 * fornecedor escolhendo a proporção — e ninguém percebe, porque não há erro:
 * há um vídeo na proporção errada.
 */
function checkVendorsDeclareFormatSupport(failures: string[], notes: string[]): void {
  const declarados: string[] = [];

  for (const vendorId of VENDORS_BY_PROVIDER.avatar) {
    const entry = VENDOR_FORMAT_SUPPORT[vendorId as keyof typeof VENDOR_FORMAT_SUPPORT];
    if (!entry) {
      failures.push(
        `formato: o vendor de avatar "${vendorId}" não consta em VENDOR_FORMAT_SUPPORT. ` +
          "Todo vendor tem de declarar se aceita formato explícito e por quê — sem isso ele herda " +
          "em silêncio a geometria escolhida pelo fornecedor, que é o defeito que este bloco fechou.",
      );
      continue;
    }
    if (!entry.reason || entry.reason.length < 40) {
      failures.push(
        `formato: a declaração de "${vendorId}" em VENDOR_FORMAT_SUPPORT está sem motivo utilizável. ` +
          "O motivo é o que impede a decisão de ser revista às cegas daqui a seis meses.",
      );
    }
    declarados.push(`${vendorId}=${entry.supported ? "envia" : "não envia"}`);
  }

  notes.push(`formato: ${declarados.length} vendor(es) de avatar com decisão declarada (${declarados.join(", ")})`);
}

/**
 * A simulação precisa entregar a proporção pedida.
 *
 * Uma fixture única para todas as proporções faz o modo fixture aprovar o
 * caminho de formato sem nunca exercitá-lo — falso verde, e este projeto já
 * tem histórico dessa classe de defeito. Confere que cada proporção tem
 * arquivo PRÓPRIO e que o arquivo existe em disco: um mapa completo apontando
 * para arquivos ausentes passaria numa verificação só de chaves.
 */
async function checkFixturesPerAspectRatio(failures: string[], notes: string[]): Promise<void> {
  const usados = new Map<string, string[]>();

  for (const ratio of HEYGEN_ASPECT_RATIOS) {
    const file = FIXTURE_VIDEO_FILES[ratio];
    if (!file) {
      failures.push(
        `formato: não há fixture para a proporção ${ratio}. A simulação entregaria outra proporção ` +
          "e o caminho passaria verde sem ter sido exercitado.",
      );
      continue;
    }
    usados.set(file, [...(usados.get(file) ?? []), ratio]);

    // Confere o MESMO diretório que o job simulado lê em execução — no VIDEO-0
    // uma fixture ausente só apareceu no MEIO do job, que é o pior momento para
    // descobrir, e a causa era o Dockerfile não copiar a pasta.
    const full = path.join(FIXTURES_DIR, file);
    try {
      const buffer = await readFile(full);
      // Mesmo piso de `videoArtifact.ts`: uma fixture abaixo dele seria
      // recusada pelo próprio validador do projeto, e já aconteceu (DEMO-1).
      if (buffer.length < 100 * 1024) {
        failures.push(
          `formato: a fixture ${file} tem ${buffer.length} bytes, abaixo do piso de 100 KB que ` +
            "validateVideoArtifact() aplica — a simulação produziria um vídeo que o próprio projeto recusa.",
        );
      }
    } catch {
      failures.push(
        `formato: a fixture ${file} (proporção ${ratio}) não existe em backend/fixtures. ` +
          "O mapa de proporções aponta para um arquivo ausente, e a falha apareceria no meio do job simulado.",
      );
    }
  }

  for (const [file, ratios] of usados) {
    if (ratios.length > 1) {
      failures.push(
        `formato: as proporções ${ratios.join(" e ")} apontam para o MESMO arquivo (${file}). ` +
          "A simulação devolveria a mesma geometria para pedidos diferentes, aprovando um caminho de " +
          "formato que nunca foi exercitado — falso verde.",
      );
    }
  }

  notes.push(`formato: ${usados.size} fixture(s) de vídeo, uma por proporção, presentes e acima do piso de artefato`);
}

/**
 * O espelho do frontend não pode divergir do catálogo do backend.
 *
 * Duas listas que discordam produzem o pior tipo de defeito deste bloco: a tela
 * oferece um destino, o servidor não o reconhece, cai no padrão — e o cliente
 * recebe horizontal tendo escolhido vertical, sem erro nenhum em lugar nenhum.
 *
 * A leitura é textual porque o arquivo é `.tsx`/`.ts` do frontend, que este
 * processo não compila. É frágil a reformatação, e por isso a guarda reprova
 * quando não encontra NADA — um regex que deixou de casar seria indistinguível
 * de um espelho perfeito.
 */
async function checkFrontendMirrorsCatalog(
  repoRoot: string,
  failures: string[],
  notes: string[],
): Promise<void> {
  const rel = "frontend/src/pages/CreateVideo/publishPlatforms.ts";
  let source: string;
  try {
    source = await readFile(path.join(repoRoot, rel), "utf8");
  } catch {
    failures.push(
      `formato: ${rel} não foi encontrado. O catálogo do backend afirma ser espelhado ali, e uma ` +
        "afirmação de fonte única que aponta para arquivo inexistente é pior que nenhuma.",
    );
    return;
  }

  const espelho = new Map<string, string>();
  const re = /id:\s*"([^"]+)"\s*,\s*aspectRatio:\s*"([^"]+)"/g;
  for (const m of source.matchAll(re)) espelho.set(m[1], m[2]);

  if (espelho.size === 0) {
    failures.push(
      `formato: nenhuma plataforma foi reconhecida em ${rel}. Ou o espelho ficou vazio, ou o formato ` +
        "do arquivo mudou e esta verificação deixou de inspecionar qualquer coisa.",
    );
    return;
  }

  for (const p of PUBLISH_PLATFORMS) {
    const doFrontend = espelho.get(p.id);
    if (!doFrontend) {
      failures.push(
        `formato: a plataforma "${p.id}" existe no backend e não no espelho do frontend — o cliente ` +
          "nunca conseguiria escolhê-la.",
      );
    } else if (doFrontend !== p.aspectRatio) {
      failures.push(
        `formato: a plataforma "${p.id}" é ${p.aspectRatio} no backend e ${doFrontend} na tela. ` +
          "A tela prometeria uma proporção e a geração pediria outra.",
      );
    }
  }
  for (const id of espelho.keys()) {
    if (!PUBLISH_PLATFORMS.some((p) => p.id === id)) {
      failures.push(
        `formato: a tela oferece a plataforma "${id}", que o backend não reconhece — a escolha cairia ` +
          "no padrão em silêncio, e o cliente receberia outra proporção sem nenhum aviso.",
      );
    }
  }

  notes.push(`formato: espelho do frontend conferido — ${espelho.size} plataforma(s) idênticas ao catálogo`);
}

/**
 * A seleção de motor sempre decide, e sempre diz por quê.
 *
 * Não há entrada que produza motor vazio: sem motor não há decisão a registrar,
 * e "nenhum" reabriria a porta que o bloco fechou — o fornecedor escolhendo por
 * omissão.
 */
function checkEngineSelectionAlwaysDecides(failures: string[], notes: string[]): void {
  const casos: Array<{ nome: string; declarado: string[] | null }> = [
    { nome: "declarou o preferido", declarado: ["avatar_iv", "avatar_iii"] },
    { nome: "declarou só o antigo", declarado: ["avatar_iii"] },
    { nome: "declarou algo desconhecido", declarado: ["avatar_xii"] },
    { nome: "não declarou nada", declarado: null },
    { nome: "declarou lista vazia", declarado: [] },
  ];

  for (const caso of casos) {
    const selecionado = selectEngine(caso.declarado);
    if (!selecionado.engine || !selecionado.reason) {
      failures.push(
        `formato: a seleção de motor não decidiu no caso "${caso.nome}" — devolveu ` +
          `motor=${JSON.stringify(selecionado.engine)}, razão=${JSON.stringify(selecionado.reason)}. ` +
          "Sem motor escolhido não há o que registrar, e a decisão volta a ser do fornecedor.",
      );
    }
  }

  // Contraponto: o preferido tem de vencer quando está declarado. Uma seleção
  // que devolvesse sempre o default passaria em todos os casos acima.
  const preferido = selectEngine(["avatar_iii", "avatar_iv"]);
  if (preferido.engine !== "avatar_iv" || preferido.reason !== "declared_preference") {
    failures.push(
      `formato: com avatar_iv declarado, a seleção devolveu ${preferido.engine} (${preferido.reason}) ` +
        "em vez de avatar_iv/declared_preference — a lista declarada pelo avatar deixou de ser consultada.",
    );
  }

  notes.push(`formato: ${casos.length} forma(s) de declaração de motor conferidas — todas decidem e registram a razão`);
}
