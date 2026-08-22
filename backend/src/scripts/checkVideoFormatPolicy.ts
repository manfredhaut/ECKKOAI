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
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { buildHeygenVideoPayload } from "../services/providers/avatarProvider.js";
import {
  HEYGEN_ASPECT_RATIOS,
  HEYGEN_RESOLUTIONS,
  PUBLISH_PLATFORMS,
  VENDOR_FORMAT_SUPPORT,
  formatConfidenceForTier,
  resolveVideoFormat,
  type FormatConfidenceLevel,
  type FormatConfidenceTier,
} from "../services/providers/videoFormat.js";
import {
  FIXTURE_VIDEO_DIMENSIONS,
  FIXTURE_VIDEO_FILES,
  FIXTURES_DIR,
} from "../services/providers/fixtureProvider.js";
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
    guard: "formato: nenhum texto de produto promete resolução",
    name: "a tela passa a afirmar a resolução entregue",
    kind: "obvio",
    file: "frontend/src/locales/pt-BR.json",
    find: `"subtitle": "A proporção do vídeo é definida pelo destino escolhido.",`,
    replace: `"subtitle": "A proporção do vídeo é definida pelo destino escolhido. Todos os vídeos saem em 720p.",`,
    expect: "afirma resolução entregue",
  },
  {
    guard: "formato: suporte declarado precisa de evidência",
    name: "vendor sem evidência nenhuma passa a declarar suporte",
    kind: "esperto",
    file: "backend/src/services/providers/videoFormat.ts",
    // O registro continua completo, o motivo continua escrito e continua
    // honesto ("nenhuma resposta real foi observada"). Só o booleano vira
    // `true` — e a tela passa a oferecer proporção a um vendor que ninguém
    // nunca viu honrar uma. Uma guarda que só cobrasse "todo vendor está no
    // registro, com motivo" passaria: o registro está lá, e o motivo também.
    // ÂNCORA NO VENDOR, e não no par de linhas: com a fal no registro (BLOCO 2)
    // o trecho passou a casar DUAS vezes e o mutante virou inaplicável — abortava
    // com ERRO no meio da passada e deixava esta guarda sem prova. O conserto é
    // dar contexto único, NUNCA apagar a linha nova do produto.
    find: `  did: {
    supported: false,
    evidence: "none" as FormatEvidence,`,
    replace: `  did: {
    supported: true,
    evidence: "none" as FormatEvidence,`,
    expect: "declara suporte a formato com evidência",
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
  {
    guard: "formato: /video-format-support com ?tier= usa o vendor EXIGIDO pelo tier, nunca a credencial default",
    name: "a rota volta a ignorar ?tier= e usa sempre a credencial default",
    kind: "obvio",
    // Achado da verificação anterior a este bloco, agora fechado: com dois
    // vendors configurados (Fase A/B), a credencial DEFAULT pode não ser a
    // que o tier escolhido vai usar de verdade — o aviso mostrado na tela
    // ficava certo ou errado por acidente.
    file: "backend/src/routes/videos.ts",
    find:
      "    const credential = tier\n" +
      '      ? await getCredentialForVendor(req.tenantId, "avatar", vendorRequiredByTier(tier))\n' +
      '      : await getCredential(req.tenantId, "avatar");',
    replace: '    const credential = await getCredential(req.tenantId, "avatar");',
    expect: "deixou de resolver a credencial pelo vendor exigido pelo tier",
  },
  {
    guard: "formato: HeyGen + 9:16 (vertical) é vendor_response — MEDIDO em 02/08",
    name: "simples/9:16 perde a distinção de vendor_response e volta a documentation",
    kind: "esperto",
    // ESPERTO: a tabela continua com uma entrada por combinação — só o VALOR
    // de 9:16 regride, apagando a única medição real que existe para o
    // vendor HeyGen (achado consolidado nesta sessão depois de ficar 3
    // semanas desatualizado; ver o comentário de VENDOR_FORMAT_SUPPORT.heygen).
    file: "backend/src/services/providers/videoFormat.ts",
    find: '  "9:16": "vendor_response",\n  "4:5": "documentation",\n  "1:1": "documentation",\n};\n\nconst CONFIANCA_NORMAL',
    replace: '  "9:16": "documentation",\n  "4:5": "documentation",\n  "1:1": "documentation",\n};\n\nconst CONFIANCA_NORMAL',
    expect: "confiança de simples/reels_tiktok (aspect_ratio 9:16) devolveu documentation, esperado vendor_response",
  },
  {
    guard: "formato: a confiança por destino é POR TIER — não é o mesmo veredito do vendor inteiro",
    name: "normal/9:16 perde a distinção de vendor_response e vira igual aos outros três",
    kind: "esperto",
    // ESPERTO: a tabela continua tendo uma entrada para cada combinação
    // tier×proporção — nenhum campo desaparece. Só o VALOR de uma célula
    // muda, de "vendor_response" (a única chamada real medida, 19/08 — ver
    // o comentário de CONFIANCA_NORMAL) para "unverified", igual às outras
    // três que nunca foram tentadas. A tela pararia de distinguir a única
    // combinação que já saiu certa de verdade das três que nunca saíram.
    file: "backend/src/services/providers/videoFormat.ts",
    find:
      "const CONFIANCA_NORMAL: Record<AspectRatio, FormatConfidenceLevel> = {\n" +
      '  "16:9": "unverified",\n' +
      '  "9:16": "vendor_response",',
    replace:
      "const CONFIANCA_NORMAL: Record<AspectRatio, FormatConfidenceLevel> = {\n" +
      '  "16:9": "unverified",\n' +
      '  "9:16": "unverified",',
    expect: "reels_tiktok (aspect_ratio 9:16) devolveu unverified, esperado vendor_response",
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
  checkResolutionIsNotSimulated(failures, notes);
  await checkNoProductTextPromisesResolution(repoRoot, failures, notes);
  checkSupportClaimsHaveEvidence(failures, notes);
  checkFormatConfidencePerTier(failures, notes);
  await checkFormatSupportRouteIsTierAware(repoRoot, failures);

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
 * RESOLUÇÃO NÃO É OBSERVÁVEL EM FIXTURE — e a guarda existe para que isso
 * continue dito em voz alta.
 *
 * A simulação honra proporção porque há um arquivo por proporção. Não honra
 * resolução, e não tem como: as fixtures são pequenas (maior lado 640 px), e
 * mesmo que fossem 1280×720, a simulação estaria apenas devolvendo o arquivo
 * que nós escolhemos — o que não diz nada sobre o campo `resolution` fazer
 * efeito no fornecedor.
 *
 * A asserção é o inverso do que se esperaria: reprova se alguma fixture
 * COINCIDIR com uma resolução declarada. Uma fixture em 1280×720 daria a
 * impressão de que 720p foi verificado, e é justamente essa impressão que
 * custa caro depois.
 */
function checkResolutionIsNotSimulated(failures: string[], notes: string[]): void {
  const alturasDeResolucao: Record<string, number> = { "720p": 720, "1080p": 1080, "4k": 2160 };

  for (const [ratio, dim] of Object.entries(FIXTURE_VIDEO_DIMENSIONS)) {
    for (const [nome, altura] of Object.entries(alturasDeResolucao)) {
      if (dim.height === altura || dim.width === altura) {
        failures.push(
          `formato: a fixture de ${ratio} tem ${dim.width}×${dim.height}, que coincide com ${nome}. ` +
            "A simulação passaria a PARECER que verifica resolução, e ela não verifica: devolveria " +
            "apenas o arquivo que nós escolhemos. Resolução só é verificável em live.",
        );
      }
    }
  }

  notes.push(
    "formato: resolução NÃO é observável em fixture (maior lado das fixtures: 640 px) — " +
      "a simulação honra proporção, e só ela",
  );
}

/**
 * Nenhum texto visto pelo CLIENTE pode afirmar a resolução ENTREGUE.
 *
 * Enquanto nenhuma geração tiver enviado `resolution` a um fornecedor, dizer
 * que o vídeo sai em 720p é vender o que não foi medido. O termo aparece
 * livremente no código e nos comentários — é lá que a decisão está registrada;
 * o que a guarda vigia é o que o cliente lê.
 *
 * **A distinção que esta guarda precisou aprender:** resolução de ENTRADA é uso
 * legítimo e frequente. "Grave em 1080p em vez de 4K" orienta o upload e não
 * promete nada sobre a saída. A primeira versão proibia o termo e acusou seis
 * usos legítimos de uma vez — e guarda que acusa uso legítimo é abandonada, o
 * que já custou caro neste projeto (GUARDAS-1, achado C). Uma guarda abandonada
 * não protege nada.
 *
 * Duas camadas, por isso:
 *  (a) COOCORRÊNCIA — resolução perto de verbo de entrega, em qualquer texto;
 *  (b) ESCOPO — dentro do bloco do passo "Publicação", resolução nenhuma passa,
 *      em nenhum contexto. Ali não existe uso legítimo: aquele texto fala
 *      exclusivamente do que entregamos.
 */
async function checkNoProductTextPromisesResolution(
  repoRoot: string,
  failures: string[],
  notes: string[],
): Promise<void> {
  const alvos = [
    "frontend/src/locales/pt-BR.json",
    "frontend/src/locales/en.json",
    ...(await listDocFiles(path.join(repoRoot, "docs"))),
  ];

  const RESOLUCAO = /\b(720p|1080p|2160p|4k|full ?hd|ultra ?hd)\b/i;
  /** Verbos que transformam a menção em PROMESSA sobre o que sai. */
  const ENTREGA =
    /\b(sai|saem|saída|saida|entregu|gerado|geradas?|gerados|exportad|produzid|renderizad|todos os vídeos|seu vídeo|o vídeo (fica|será|sai)|delivered|output|exported|rendered|generated in|videos are|your video)\b/i;

  let inspecionados = 0;
  let mencoesLegitimas = 0;

  for (const rel of alvos) {
    const full = path.isAbsolute(rel) ? rel : path.join(repoRoot, rel);
    let source: string;
    try {
      source = await readFile(full, "utf8");
    } catch {
      continue;
    }
    inspecionados += 1;
    const relativo = path.relative(repoRoot, full).replace(/\\/g, "/");
    const linhas = source.split(/\r?\n/);

    for (const [i, linha] of linhas.entries()) {
      if (!RESOLUCAO.test(linha)) continue;

      const noBlocoPublish = /"(publish|publicacao)"|createVideo\.publish/.test(linha) || dentroDoBlocoPublish(linhas, i);

      if (ENTREGA.test(linha) || noBlocoPublish) {
        failures.push(
          `formato: ${relativo}:${i + 1} afirma resolução entregue ` +
            `("${linha.trim().slice(0, 100)}"). Nenhuma geração enviou \`resolution\` a um fornecedor até ` +
            "hoje, e a simulação não verifica resolução (as fixtures têm no máximo 640 px de lado) — " +
            "prometer isso ao cliente é vender o que não foi medido. Orientar a resolução de ENTRADA " +
            '("grave em 1080p") continua permitido: ali não há promessa sobre a saída.',
        );
      } else {
        mencoesLegitimas += 1;
      }
    }
  }

  if (inspecionados === 0) {
    failures.push(
      "formato: nenhum texto de produto foi inspecionado quanto a promessa de resolução — os caminhos " +
        "mudaram e a guarda deixou de olhar qualquer coisa.",
    );
  }

  notes.push(
    `formato: ${inspecionados} arquivo(s) de texto de produto sem promessa de resolução entregue ` +
      `(${mencoesLegitimas} menção(ões) a resolução de ENTRADA, que é uso legítimo)`,
  );
}

/**
 * A linha está dentro do bloco de tradução do passo "Publicação"?
 *
 * Varredura para trás até achar a abertura de um bloco de primeiro nível. É
 * grosseiro e suficiente: o alvo é um objeto de tradução com dois níveis de
 * indentação, não JSON arbitrário — e o custo de errar para o lado rígido aqui
 * é uma frase reescrita, contra uma promessa não medida indo para a tela.
 */
function dentroDoBlocoPublish(linhas: string[], indice: number): boolean {
  for (let i = indice; i >= 0 && indice - i < 40; i--) {
    const m = linhas[i].match(/^\s{0,6}"([a-zA-Z_]+)"\s*:\s*\{/);
    if (m) return m[1] === "publish";
  }
  return false;
}

/** Lista recursiva de arquivos .md sob um diretório; vazio se ele não existir. */
async function listDocFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...(await listDocFiles(full)));
      else if (entry.name.endsWith(".md")) out.push(full);
    }
  } catch {
    // Diretório ausente não é falha desta guarda; o contador acima acusa se
    // NADA for inspecionado.
  }
  return out;
}

/**
 * Declarar suporte a formato exige EVIDÊNCIA.
 *
 * `supported: true` com `evidence: "none"` é um palpite bem escrito ocupando o
 * lugar de um fato — e a consequência não é abstrata: a tela passa a oferecer
 * proporção a um vendor que ninguém nunca viu honrar uma, e o cliente só
 * descobre olhando o vídeo pronto.
 *
 * A guarda também registra que NINGUÉM está em `vendor_response` hoje. Quando
 * o primeiro vendor chegar lá, esta nota muda sozinha — e é ela que autoriza a
 * UI a parar de dizer "ainda não verificado".
 */
function checkSupportClaimsHaveEvidence(failures: string[], notes: string[]): void {
  const porEvidencia: string[] = [];
  let confirmadosPorResposta = 0;

  for (const [vendorId, entry] of Object.entries(VENDOR_FORMAT_SUPPORT)) {
    if (entry.supported && entry.evidence === "none") {
      failures.push(
        `formato: "${vendorId}" declara suporte a formato com evidência "none". Suporte sem nada que o ` +
          "sustente é palpite ocupando o lugar de fato — e faz a tela oferecer uma proporção que o vendor " +
          "pode ignorar em silêncio, que é o modo de falha mais caro (só aparece no vídeo pronto).",
      );
    }
    if (entry.evidence === "vendor_response") confirmadosPorResposta += 1;
    porEvidencia.push(`${vendorId}=${entry.supported ? "sim" : "não"}/${entry.evidence}`);
  }

  notes.push(
    `formato: evidência por vendor (${porEvidencia.join(", ")}); ` +
      `${confirmadosPorResposta} confirmado(s) por resposta real do fornecedor`,
  );
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

/**
 * A confiança POR TIER, para as 12 combinações (3 tiers × 4 destinos) — por
 * EXECUÇÃO real de `formatConfidenceForTier`, contra a tabela DECLARADA
 * aqui (não lida de volta do próprio arquivo de produção, ou a guarda
 * provaria só que a função concorda consigo mesma).
 *
 * A tabela abaixo é a mesma que sustenta os comentários de
 * `videoFormat.ts` — cada valor tem uma citação de código por trás,
 * verificada por leitura antes deste bloco existir: `HEYGEN_ASPECT_RATIOS`
 * bate com os 4 destinos (documentation, os 4); o Wan só recebe a proporção
 * via `compor()` e a ÚNICA chamada real mediu 9:16 (vendor_response só
 * ali); o Seedance nunca foi exercitado por nenhuma proporção (unverified,
 * os 4).
 */
const CONFIANCA_ESPERADA: Record<FormatConfidenceTier, Record<string, FormatConfidenceLevel>> = {
  // 9:16 (reels_tiktok) é vendor_response desde a consolidação do achado do
  // 02/08 nesta sessão — ver o comentário de CONFIANCA_SIMPLES em videoFormat.ts.
  simples: { youtube: "documentation", reels_tiktok: "vendor_response", instagram_feed: "documentation", linkedin: "documentation" },
  normal: { youtube: "unverified", reels_tiktok: "vendor_response", instagram_feed: "unverified", linkedin: "unverified" },
  premium: { youtube: "unverified", reels_tiktok: "unverified", instagram_feed: "unverified", linkedin: "unverified" },
};

function checkFormatConfidencePerTier(failures: string[], notes: string[]): void {
  let conferidas = 0;
  for (const tier of Object.keys(CONFIANCA_ESPERADA) as FormatConfidenceTier[]) {
    for (const platform of PUBLISH_PLATFORMS) {
      const got = formatConfidenceForTier(tier, platform.aspectRatio);
      const want = CONFIANCA_ESPERADA[tier][platform.id];
      conferidas++;
      if (got !== want) {
        failures.push(
          `formato: confiança de ${tier}/${platform.id} (aspect_ratio ${platform.aspectRatio}) devolveu ` +
            `${got}, esperado ${want}. Cada nível de confiança tem uma medição ou uma ausência de medição ` +
            "por trás — mudar um sem mudar a evidência real transforma a tela numa promessa que ninguém verificou.",
        );
      }
    }
  }
  notes.push(`formato: confiança por tier conferida em ${conferidas} combinações (3 tiers × ${PUBLISH_PLATFORMS.length} destinos)`);
}

/**
 * `/video-format-support?tier=` tem de resolver a credencial pelo VENDOR
 * exigido pelo tier (Fase C), não pela credencial default do tenant — por
 * LEITURA, porque exercitar a rota de verdade pede sessão e banco, e o que
 * se quer aqui é a FORMA da decisão, não uma resposta HTTP específica.
 */
async function checkFormatSupportRouteIsTierAware(repoRoot: string, failures: string[]): Promise<void> {
  const ROTA = "backend/src/routes/videos.ts";
  const fonte = await readFile(path.join(repoRoot, ROTA), "utf8").catch(() => "");
  if (!fonte) {
    failures.push(`formato: ${ROTA} não foi encontrado — a guarda de tier-awareness não olhou nada.`);
    return;
  }
  const inicio = fonte.indexOf('"/video-format-support"');
  const recorte = inicio >= 0 ? fonte.slice(inicio, fonte.indexOf("});", inicio)) : "";
  if (!recorte) {
    failures.push(`formato: não achei o handler de /video-format-support em ${ROTA}.`);
    return;
  }
  if (!recorte.includes('getCredentialForVendor(req.tenantId, "avatar", vendorRequiredByTier(tier))')) {
    failures.push(
      `formato: /video-format-support deixou de resolver a credencial pelo vendor exigido pelo tier — ` +
        "o aviso mostrado na tela voltaria a refletir a credencial DEFAULT do tenant, não o vendor que " +
        "o tier escolhido vai usar de verdade (o achado da verificação que abriu este bloco).",
    );
  }
}
