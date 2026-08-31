/**
 * Invariantes do ORQUESTRADOR: resposta crua antes de interpretada, teto no
 * laço de polling, e nenhum default do fornecedor herdado em silêncio.
 *
 * ┌─ Ancorada no USO ───────────────────────────────────────────────────────┐
 * │ Ela não procura texto no arquivo. Roda `runFalPipeline` de verdade, com  │
 * │ `globalThis.fetch` substituído e um diário em memória, e observa a       │
 * │ SEQUÊNCIA do que aconteceu e os CORPOS que saíram.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ A PRIMEIRA VERSÃO DESTA GUARDA NASCEU INERTE, e o arnês a pegou ───────┐
 * │ Ela media a ordem entre "gravou cru" e "chegou o resultado" — e essa     │
 * │ ordem NÃO MUDA quando alguém lê um campo antes de gravar. Ler campo não  │
 * │ produz passo observável nenhum, então a guarda continuava verde com o    │
 * │ defeito aplicado. O gate passou VERDE no mutante, MEDIDO em 12/08.       │
 * │                                                                          │
 * │ A correção é a mesma da G-2 do `falClient`: a ordem só é observável no   │
 * │ caso em que a INTERPRETAÇÃO FALHA. Por isso existe a corrida             │
 * │ `resultadoVazio` — o fornecedor conclui e devolve `{}`. Com a gravação   │
 * │ antes, o corpo está salvo e o erro é NOSSO; com ela depois, a leitura    │
 * │ estoura primeiro e o corpo se perde com a exceção. É exatamente o que    │
 * │ acontece em produção quando o contrato muda: a resposta que se precisa   │
 * │ ler para descobrir o que mudou é a que não foi gravada.                  │
 * │                                                                          │
 * │ A SEGUNDA guarda (teto) nasceu AMBÍGUA pelo mesmo tipo de erro: sem      │
 * │ teto, o laço roda para sempre DENTRO do processo do gate e trava o gate  │
 * │ inteiro — 10 min sem terminar, MEDIDO. O arnês via "reprovou, mas sem a  │
 * │ mensagem". Daí o FUSÍVEL abaixo: o `fetch` substituído lança depois de   │
 * │ um número de leituras que o caminho correto nunca alcança.               │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Custo: ZERO ───────────────────────────────────────────────────────────┐
 * │ Nenhuma rede (o `fetch` é substituído), nenhum banco (o diário é um      │
 * │ array), nenhuma espera real (o `esperar` é injetado e devolve na hora).  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import type { Mutant } from "./mutants.js";
import { DEFAULTS_NUNCA_HERDADOS } from "../services/video/falPipeline.js";

export const MUTANTS: Mutant[] = [
  {
    guard: "pipeline: a resposta crua é gravada antes de ser interpretada",
    name: "a gravação do corpo bruto desce para depois da leitura do campo",
    kind: "esperto",
    // ESPERTO: o corpo continua sendo gravado, com o mesmo conteúdo, e o
    // caminho feliz termina IDÊNTICO — qualquer guarda que perguntasse "a
    // resposta é persistida?" seguiria verde, e a primeira versão desta aqui
    // seguiu. O que muda é o que sobra quando a resposta vem em forma
    // inesperada: a leitura estoura antes da gravação e o corpo morre com a
    // exceção, que é justamente o corpo de que se precisa naquele momento.
    file: "backend/src/services/video/falPipeline.ts",
    find:
      "  // CRU ANTES DE INTERPRETADO. Nenhum campo de `saida` foi lido até aqui.\n" +
      "  await input.diario.gravarRespostaCrua(stepId, JSON.stringify(saida));",
    replace:
      "  const urlLida = (saida as any).images[0].url;\n" +
      "  void urlLida;\n" +
      "  await input.diario.gravarRespostaCrua(stepId, JSON.stringify(saida));",
    expect: "pipeline: a resposta do fornecedor foi interpretada ANTES de ser gravada crua",
  },
  {
    guard: "pipeline: o laço de polling tem teto de tempo",
    name: "o teto some e o laço passa a esperar para sempre",
    kind: "obvio",
    // O teto continua sendo PARÂMETRO — a assinatura não muda, o valor chega,
    // e o `logEvent` de esgotamento continua no arquivo. Sai só a comparação,
    // que é a única linha que faz o teto existir.
    file: "backend/src/services/video/falPipeline.ts",
    find: "    if (Date.now() >= limite) {",
    // `limite` continua sendo lido, senão o `tsc` reprova por variável não
    // usada e o arnês devolveria AMBÍGUO sem a guarda ter opinado — o mesmo
    // tropeço já registrado em `checkScriptLimitPolicy` e no portão de áudio.
    replace: "    if (limite < 0) {",
    expect: "pipeline: o laço de polling não desistiu",
  },
  {
    guard: "pipeline: nenhum default do fornecedor é herdado",
    name: "generate_audio sai do payload do Wan e volta a ser o default",
    kind: "esperto",
    // O mais caro dos seis: com o default, o Wan sintetiza uma trilha PRÓPRIA
    // e PAGA que a sincronia descarta. Some do payload sem quebrar nada
    // visível — o vídeo continua saindo, só que com áudio que ninguém pediu e
    // por um preço que ninguém viu.
    file: "backend/src/services/video/falPipeline.ts",
    find: "    generate_audio: false,\n    resolution: RESOLUCAO_VIDEO,",
    replace: "    resolution: RESOLUCAO_VIDEO,",
    expect: "pipeline: um default do fornecedor foi herdado em silêncio",
  },
  {
    guard: "pipeline: nenhum default do fornecedor é herdado",
    name: "negative_prompt sai do payload do Wan e volta a ser vazio",
    kind: "esperto",
    // RODADA 2, 29/08 — sem o campo, o Wan volta ao default vazio (LIDO no
    // schema) e fica livre para produzir os artefatos que
    // `NEGATIVE_PROMPT_ANIMAR_WAN` existe para conter. Some do payload sem
    // quebrar nada visível no código — o vídeo continua saindo, só que sem a
    // única defesa contra traço de desenho/pele plástica/legenda queimada.
    file: "backend/src/services/video/falPipeline.ts",
    find: "    multi_shots: false,\n    // RODADA 2, 29/08 — LIDO no schema do Wan (só ele, entre as três etapas\n    // pagas, documenta este campo; RECONFIRMADO no schema do novo endpoint em\n    // 29/08). Ver `NEGATIVE_PROMPT_ANIMAR_WAN`.\n    negative_prompt: NEGATIVE_PROMPT_ANIMAR_WAN,",
    replace: "    multi_shots: false,",
    expect: "pipeline: um default do fornecedor foi herdado em silêncio",
  },
  {
    guard: "pipeline: nenhuma etapa paga sai acima do teto de gasto",
    name: "o porteiro do teto de gasto some do caminho",
    kind: "obvio",
    // A fal NÃO expõe endpoint de saldo, então o teto é a única coisa entre uma
    // corrida e a carteira. Sem o porteiro, as três etapas disparam em série
    // sem ninguém somar nada — e o estouro só aparece na fatura.
    file: "backend/src/services/video/falPipeline.ts",
    find: "  if (previsto > tetoUsd) {",
    // `previsto` continua lido, senão o tsc reprova por variável não usada e o
    // arnês devolveria AMBÍGUO sem a guarda opinar.
    replace: "  if (previsto < 0) {",
    expect: "pipeline: uma etapa paga saiu com o previsto acima do teto",
  },
  {
    guard: "pipeline: o laço de polling tem teto de tempo",
    name: "o INTERVALO entre leituras muda, e o teto continua de pé",
    kind: "esperto",
    // CONTRAPONTO. Intervalo e teto são coisas diferentes: um decide a
    // frequência das leituras, o outro decide quando desistir. Uma guarda que
    // reprovasse isto estaria medindo o número de leituras em vez da
    // existência do teto, e passaria a cobrar autorização para ajustar cadência.
    //
    // O contraponto ANTERIOR mexia no roteiro da prova — e o `find` casava
    // DUAS vezes, porque a string aparecia na declaração e dentro do próprio
    // mutante que a descrevia. Quinta vez neste projeto que uma guarda tropeça
    // no texto escrito para explicá-la; aqui o alvo passou a ser outro arquivo.
    file: "backend/src/services/video/falPipeline.ts",
    find: "export const PIPELINE_POLL_INTERVAL_MS = 5_000;",
    replace: "export const PIPELINE_POLL_INTERVAL_MS = 3_000;",
    expect: "pipeline: corpo cru gravado antes de qualquer leitura",
    expectGreen: true,
  },
  {
    guard: "pipeline: nenhum default do fornecedor é herdado",
    name: "a chave do Wan em DEFAULTS_NUNCA_HERDADOS desalinha do endpoint em uso",
    kind: "esperto",
    // A chave do mapa e `ENDPOINT_ANIMAR` são duas cópias do mesmo id,
    // atualizadas à mão — foi exatamente essa dupla cópia que ficou
    // dessincronizada nos 404 do COMPOR-1 e do ENDPOINTS-2 (id errado nos TRÊS
    // lugares ao mesmo tempo, então nunca vazou por aqui). Este mutante
    // desalinha só a CHAVE, mantendo `ENDPOINT_ANIMAR` correto, para provar
    // que corrigir dois de três lugares não passa despercebido.
    //
    // A CHAVE ERRADA injetada é `image-to-video/flash` — o endpoint ANTIGO,
    // de antes da migração para `reference-to-video/flash` (item 2, 29/08):
    // reintroduzir literalmente o id de antes é o defeito mais plausível
    // (alguém reverte só este mapa, sem querer, num merge ou num revert
    // parcial), e continua desalinhado de `ENDPOINT_ANIMAR` do mesmo jeito.
    file: "backend/src/services/video/falPipeline.ts",
    find: '  "wan/v2.6/reference-to-video/flash": [',
    replace: '  "wan/v2.6/image-to-video/flash": [',
    expect: "pipeline: um default do fornecedor foi herdado em silêncio",
  },
  {
    guard: "pipeline: as três etapas pagas completam no caminho feliz",
    name: "o catálogo desalinha do endpoint que falPipeline.ts realmente usa",
    kind: "esperto",
    // O catálogo é a TERCEIRA cópia do mesmo id. `assertFalEndpointNoCatalogo`
    // roda de verdade dentro desta guarda (só o `fetch` é substituído) — se o
    // catálogo não bater com `ENDPOINT_ANIMAR`, `runFalPipeline` lança antes
    // de completar as 3 submissões pagas, e é essa contagem que acusa.
    // A CHAVE ERRADA injetada é `image-to-video/flash` — o endpoint ANTIGO,
    // de antes da migração para `reference-to-video/flash` (item 2, 29/08) —
    // mesmo raciocínio do mutante irmão em DEFAULTS_NUNCA_HERDADOS.
    file: "backend/src/services/providers/endpointCatalog.ts",
    find: '    path: "/wan/v2.6/reference-to-video/flash",',
    replace: '    path: "/wan/v2.6/image-to-video/flash",',
    expect: "pipeline: com teto folgado saíram",
  },
  {
    guard: "duração: escolhida a partir do roteiro, não mais um valor fixo",
    name: "a duração enviada ao Wan volta a ser um valor fixo",
    kind: "obvio",
    // Um roteiro de 47 caracteres (teto exato de 5 s) e outro de 142 (teto
    // exato de 15 s) só podem coincidir se o pipeline PARAR de olhar o
    // roteiro — qualquer valor fixo único erra pelo menos um dos dois.
    file: "backend/src/services/video/falPipeline.ts",
    find: "    duration: String(duracaoEscolhida),",
    replace: '    duration: "10",',
    expect: 'pipeline: a duração não foi escolhida a partir do roteiro',
  },
  {
    guard: "duração: um roteiro acima de 15 s é recusado, nunca animado truncado",
    name: "a recusa acima de 15 s desaparece",
    kind: "esperto",
    // ESPERTO: `escolherDuracao` continua devolvendo `PipelineDuration` — o
    // `tsc` não acusa nada — mas troca "nada comporta" por "usa o teto
    // mesmo assim". O sintoma não é um erro de tipo: é um roteiro longo
    // demais sendo animado (e a fala sendo TRUNCADA por `cut_off`) em vez de
    // recusado antes de qualquer chamada paga.
    //
    // ARQUIVO — BLOCO FRACOES-1, 28/08: `escolherDuracao` foi EXTRAÍDA para
    // `pipelineDuration.ts` (para `scriptFractioning.ts` poder importá-la
    // sem criar ciclo com `falPipeline.ts`) e é REEXPORTADA de lá — o corpo
    // da função, e portanto este mutante, mudou de endereço junto.
    //
    // ALVO trocado para `escolherDuracaoPremium` na migração do item 2
    // (29/08): `conferirRoteiro` (o único chamador que produz a mensagem
    // "pipeline: um roteiro de..." testada abaixo) passou a usar o teto
    // PRÓPRIO do Premium (15s), não mais o do Normal (10s, apertado pela
    // migração do Wan para `reference-to-video/flash`) — ver
    // `pipelineDuration.ts`. Âncora estendida para incluir a linha do laço:
    // as duas funções (`escolherDuracao`/`escolherDuracaoPremium`) terminam
    // com o mesmo `return null;\n}`, e sem a linha do `if` a âncora casaria
    // 2x.
    file: "backend/src/services/video/pipelineDuration.ts",
    find:
      "    if (chars <= PREMIUM_MAX_CHARS_POR_DURACAO[duracao]) return duracao;\n" +
      "  }\n" +
      "  return null;\n" +
      "}",
    replace:
      "    if (chars <= PREMIUM_MAX_CHARS_POR_DURACAO[duracao]) return duracao;\n" +
      "  }\n" +
      "  return PREMIUM_DURACAO_MAXIMA;\n" +
      "}",
    expect: "pipeline: um roteiro de",
  },
];

export interface FalPipelineCheckResult {
  failures: string[];
  notes: string[];
}

const ROTEIRO_DA_PROVA = "Roteiro da prova, curto o bastante para caber no teto.";

/**
 * FUSÍVEL do laço de polling.
 *
 * Sem teto, o laço roda para sempre dentro do processo do gate e trava o gate
 * inteiro — MEDIDO: 10 minutos sem terminar. O `fetch` substituído lança ao
 * passar deste número, e a guarda reconhece o erro como "não desistiu".
 *
 * 800 contra as ~98 leituras que o caminho CORRETO faz nos 50 ms de teto da
 * prova: margem de ~8×, folgada o bastante para que carga de máquina não
 * produza falso positivo.
 */
const FUSIVEL_DE_LEITURAS = 800;
const MARCA_DO_FUSIVEL = "FUSIVEL_DO_LACO_SEM_TETO";

interface Corrida {
  gastoPrevistoUsd: number;
  passos: string[];
  corpos: { endpoint: string; corpo: any }[];
  crus: string[];
  erro: unknown;
  leiturasDeStatus: number;
}

/**
 * Roda o pipeline REAL com tudo substituído.
 *
 *  · `statusEternamentePendente` — a fila nunca conclui. Exercita o teto.
 *  · `resultadoVazio` — a fila CONCLUI e devolve `{}`. É o caso em que a
 *    ordem entre gravar e interpretar deixa de ser invisível.
 */
async function correr(
  opcoes: {
    statusEternamentePendente?: boolean;
    resultadoVazio?: boolean;
    tetoDeGastoUsd?: number;
    /** Sobrescreve `ROTEIRO_DA_PROVA` — usado pelas checagens de duração. */
    script?: string;
  } = {},
): Promise<Corrida> {
  const { runFalPipeline } = await import("../services/video/falPipeline.js");
  const passos: string[] = [];
  const corpos: { endpoint: string; corpo: any }[] = [];
  const crus: string[] = [];
  let leiturasDeStatus = 0;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown, init?: RequestInit) => {
    const url = String(
      typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada,
    );

    if (url.includes("rest.fal.ai") || url.includes("fal.invalido")) {
      passos.push("UPLOAD");
      return new Response(
        JSON.stringify({
          file_url: "https://exemplo.fal.invalido/arquivo-da-prova.bin",
          upload_url: "https://exemplo.fal.invalido/put/arquivo-da-prova.bin",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("api.elevenlabs.io")) {
      return new Response(
        JSON.stringify({
          audio_base64: Buffer.from("audio-da-prova").toString("base64"),
          alignment: { character_end_times_seconds: [0.1, 4.87] },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/requests/") && url.endsWith("/status")) {
      leiturasDeStatus += 1;
      if (leiturasDeStatus > FUSIVEL_DE_LEITURAS) throw new Error(MARCA_DO_FUSIVEL);
      passos.push(`STATUS:${leiturasDeStatus}`);
      return new Response(
        JSON.stringify({ status: opcoes.statusEternamentePendente ? "IN_PROGRESS" : "COMPLETED" }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("/requests/")) {
      const endpoint = url.split("/requests/")[0].replace("https://queue.fal.run/", "");
      passos.push(`RESULT:${endpoint}`);
      const corpo = opcoes.resultadoVazio
        ? {}
        : {
            images: [{ url: "https://exemplo.fal.invalido/imagem.png" }],
            video: { url: "https://exemplo.fal.invalido/video.mp4" },
          };
      return new Response(JSON.stringify(corpo), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    const endpoint = url.replace("https://queue.fal.run/", "");
    passos.push(`POST:${endpoint}`);
    corpos.push({ endpoint, corpo: JSON.parse(String(init?.body ?? "{}")) });
    return new Response(
      JSON.stringify({
        request_id: `req-${endpoint.replace(/[^a-z0-9]+/gi, "-")}`,
        status_url: `https://queue.fal.run/${endpoint}/requests/req/status`,
        response_url: `https://queue.fal.run/${endpoint}/requests/req`,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  let seq = 0;
  const diario = {
    async abrirEtapa(etapa: string) {
      const id = `step-${++seq}-${etapa}`;
      passos.push(`abriu:${etapa}`);
      return id;
    },
    async gravarRequestId(stepId: string) {
      passos.push(`request_id:${stepId}`);
    },
    async gravarRespostaCrua(stepId: string, raw: string) {
      passos.push(`cru:${stepId}`);
      crus.push(raw);
    },
    async fecharEtapa(stepId: string) {
      passos.push(`fechou:${stepId}`);
    },
    // NO-OP mesmo neste diário que registra tudo: `passos` é comparado como
    // SEQUÊNCIA, e um evento novo no meio faria esta guarda reprovar por uma
    // gravação que não é o que ela mede. E ele PRECISA existir mesmo com o
    // `as never` do call site: sem o método, `registrarGastoPrevisto` do
    // orquestrador estoura em tempo de execução, que o cast esconde do `tsc`.
    // Quem mede o gasto é `checkFalGastoInstrumentadoPolicy.ts`.
    async registrarGastoPrevisto() {},
  };

  let erro: unknown = null;
  let gastoPrevistoUsd = 0;
  const modoOriginal = process.env.PROVIDER_MODE;
  try {
    // `live` porque em fixture o falClient desvia e nada disto acontece.
    process.env.PROVIDER_MODE = "live";
    const r = await runFalPipeline({
      apiKeyFal: "chave-irrelevante-fetch-substituido",
      apiKeyElevenLabs: "chave-irrelevante-fetch-substituido",
      voiceId: "0hQuq0q2JEk1SY4lZaM9",
      script: opcoes.script ?? ROTEIRO_DA_PROVA,
      fotoBase: Buffer.from("foto-da-prova"),
      fotoMimeType: "image/jpeg",
      promptDeComposicao: "traje e cenário da prova",
      aspectRatio: "16:9",
      tenantId: "tenant-da-prova",
      promptDeDirecao: "test direction in english",
      diario: diario as never,
      tetoDeGastoUsd: opcoes.tetoDeGastoUsd,
      pollTimeoutMs: 50,
      pollIntervalMs: 1,
      esperar: async () => {},
      // Item 8, 29/08 — `assertAspectRatio` roda `ffprobe` DE VERDADE, e a
      // URL do vídeo aqui é fake (`fetch` substituído, o binário não é).
      verificarAspectRatio: false,
    });
    gastoPrevistoUsd = r.gastoPrevistoUsd;
  } catch (err) {
    erro = err;
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  return { gastoPrevistoUsd, passos, corpos, crus, erro, leiturasDeStatus };
}

export async function checkFalPipelinePolicy(): Promise<FalPipelineCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];
  const { FalPipelineError } = await import("../services/video/falPipeline.js");

  const feliz = await correr();

  // -------------------------------------------------------------------------
  // 1. CRU ANTES DE INTERPRETADO.
  //
  // A metade que MEDE é a segunda: o fornecedor conclui e devolve `{}`. Com a
  // gravação antes, o corpo está salvo e o erro é NOSSO; com ela depois, a
  // leitura estoura primeiro e o corpo se perde junto.
  // -------------------------------------------------------------------------
  const vazio = await correr({ resultadoVazio: true });

  // O corpo do FORNECEDOR, entre os crus gravados — e não mais `crus[0]`.
  //
  // Desde o B2 a corrida abre com a PUBLICAÇÃO das entradas (ordem 0, não
  // tarifada), e cada `file_url` é gravado como cru da própria etapa. O
  // primeiro cru da corrida passou a ser dela, e a asserção antiga —
  // "`crus[0]` é o corpo do fornecedor" — passou a reprovar o caminho correto.
  //
  // A propriedade medida NÃO mudou: o corpo que o fornecedor devolveu tem de
  // estar gravado antes de qualquer campo dele ser lido. Mudou só onde ele
  // está na fila, e é por isso que o filtro é por conteúdo (o registro da
  // publicação é o único que carrega `fileUrl`) em vez de por posição.
  const crusDoFornecedor = vazio.crus.filter((c) => !c.includes('"fileUrl"'));

  if (crusDoFornecedor.length === 0) {
    failures.push(
      "pipeline: a resposta do fornecedor foi interpretada ANTES de ser gravada crua — o fornecedor " +
        "concluiu, devolveu um corpo em forma inesperada, e NENHUM corpo bruto foi gravado. Passos: " +
        `${vazio.passos.join(" → ") || "(nenhum)"}; erro ` +
        `${vazio.erro === null ? "nenhum" : JSON.stringify(String(vazio.erro).slice(0, 120))}. ` +
        "É exatamente o corpo de que se precisa para descobrir o que mudou no contrato, e ele morreu " +
        "com a exceção — depois de o trabalho ter sido feito e cobrado.",
    );
  } else if (crusDoFornecedor[0] !== "{}") {
    failures.push(
      "pipeline: a resposta do fornecedor foi interpretada ANTES de ser gravada crua — o primeiro " +
        `corpo gravado foi ${JSON.stringify(crusDoFornecedor[0].slice(0, 80))}, e não o corpo que o ` +
        "fornecedor devolveu. O que se grava tem de ser o corpo inteiro, como veio.",
    );
  }
  if (crusDoFornecedor.length > 0 && !(vazio.erro instanceof FalPipelineError)) {
    failures.push(
      "pipeline: a resposta do fornecedor foi interpretada ANTES de ser gravada crua, ou o erro não é " +
        `nosso — veio ${JSON.stringify(String(vazio.erro).slice(0, 120))}. Um TypeError aqui significa ` +
        "que a leitura do campo aconteceu sem rede de proteção; o erro precisa ser FalPipelineError e " +
        "dizer que o corpo está gravado.",
    );
  }
  // Contraponto interno: no caminho feliz as três etapas gravam o corpo. Os
  // registros da publicação ficam de fora da conta — eles não são resposta de
  // etapa paga, e contá-los faria o número passar mesmo com uma etapa muda.
  const crusPagosNoFeliz = feliz.crus.filter((c) => !c.includes('"fileUrl"'));
  if (crusPagosNoFeliz.length < 3) {
    failures.push(
      `pipeline: apenas ${crusPagosNoFeliz.length} corpo(s) bruto(s) gravado(s) no caminho feliz, e as ` +
        "etapas pagas são três. Um corpo por etapa é o que sustenta a cobrança por camada.",
    );
  }

  // -------------------------------------------------------------------------
  // 2. O LAÇO TEM TETO.
  // -------------------------------------------------------------------------
  const pendente = await correr({ statusEternamentePendente: true });
  const bateuOFusivel = String(pendente.erro).includes(MARCA_DO_FUSIVEL);

  if (bateuOFusivel) {
    failures.push(
      `pipeline: o laço de polling não desistiu — a fila respondeu IN_PROGRESS e o laço passou de ` +
        `${FUSIVEL_DE_LEITURAS} leituras de status com o teto configurado em 50 ms. Sem teto, uma etapa ` +
        "que nunca conclui prende o processo para sempre: MEDIDO em 12/08, o gate inteiro ficou 10 " +
        "minutos sem terminar por causa disso. Quem paga pela etapa não tem como saber que ela parou " +
        "de progredir.",
    );
  } else if (!(pendente.erro instanceof FalPipelineError) || !String(pendente.erro).includes("teto de")) {
    failures.push(
      "pipeline: o laço de polling não desistiu com o erro certo — veio " +
        `${pendente.erro === null ? "sucesso" : JSON.stringify(String(pendente.erro).slice(0, 160))}. ` +
        "O esgotamento precisa dizer que o trabalho já foi pago e NÃO deve ser refeito: sem isso, a " +
        "reação natural é repetir a etapa e pagar duas vezes pelo mesmo resultado.",
    );
  }

  // -------------------------------------------------------------------------
  // 2b. O TETO DE GASTO.
  //
  // Corrida com teto ABAIXO do custo da primeira etapa: nenhuma submissão pode
  // sair. E o contraponto no mesmo lugar — com teto folgado, as três saem.
  // -------------------------------------------------------------------------
  const { PRECOS_FAL } = await import("../services/video/falPipeline.js");
  const pobre = await correr({ tetoDeGastoUsd: PRECOS_FAL.comporUsd / 2 });

  if (pobre.corpos.length > 0) {
    failures.push(
      `pipeline: uma etapa paga saiu com o previsto acima do teto — ${pobre.corpos.length} submissão(ões) ` +
        `com teto de US$ ${(PRECOS_FAL.comporUsd / 2).toFixed(3)}, abaixo do custo da PRIMEIRA etapa ` +
        `(US$ ${PRECOS_FAL.comporUsd.toFixed(2)}). A fal não expõe endpoint de saldo: este acumulador é a ` +
        "única coisa entre uma corrida e a carteira, e ele tem de recusar ANTES da submissão — depois, o " +
        "dinheiro já saiu e o teto vira relatório.",
    );
  }
  if (!(pobre.erro instanceof FalPipelineError) || !String(pobre.erro).includes("TETO DE GASTO")) {
    failures.push(
      "pipeline: uma etapa paga saiu com o previsto acima do teto, ou a recusa não é nossa — veio " +
        `${pobre.erro === null ? "sucesso" : JSON.stringify(String(pobre.erro).slice(0, 140))}.`,
    );
  }
  if (feliz.corpos.length !== 3) {
    failures.push(
      `pipeline: com teto folgado saíram ${feliz.corpos.length} submissões, e as etapas pagas são 3. ` +
        "Um teto que recusa o caso normal não protege a carteira: apaga o produto.",
    );
  }

  // -------------------------------------------------------------------------
  // 3. NENHUM DEFAULT HERDADO.
  //
  // Conferido no CORPO que saiu, não no código: um campo omitido não deixa
  // rastro nenhum do nosso lado — só na requisição.
  // -------------------------------------------------------------------------
  for (const [endpoint, campos] of Object.entries(DEFAULTS_NUNCA_HERDADOS)) {
    const enviado = feliz.corpos.find((c) => c.endpoint === endpoint);
    if (!enviado) {
      failures.push(
        "pipeline: um default do fornecedor foi herdado em silêncio — nenhuma submissão para " +
          `${endpoint} foi observada, então ${campos.join(", ")} não puderam ser conferidos. Corpos ` +
          `observados: ${feliz.corpos.map((c) => c.endpoint).join(", ") || "(nenhum)"}.`,
      );
      continue;
    }
    for (const campo of campos) {
      if (!(campo in enviado.corpo)) {
        failures.push(
          `pipeline: um default do fornecedor foi herdado em silêncio — "${campo}" não está no corpo ` +
            `enviado a ${endpoint}. O default é do FORNECEDOR e muda sem aviso: omitir aceita a mudança ` +
            "em silêncio. `generate_audio` é o caro — o Wan sintetiza uma trilha PRÓPRIA e paga que a " +
            "sincronia descarta; `sync_mode` decide o que se perde quando vídeo e áudio têm durações " +
            `diferentes, que nesta fase é sempre. Campos presentes: ${Object.keys(enviado.corpo).join(", ")}.`,
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // 4. A DURAÇÃO É ESCOLHIDA A PARTIR DO ROTEIRO — {5, 10} s no tier Normal
  //    (apertado de {5, 10, 15} na migração para `reference-to-video/flash`,
  //    item 2, 29/08 — ver `pipelineDuration.ts`). O Premium (`conferirRoteiro`,
  //    caminho sem fracionamento) mantém {5, 10, 15}, vocabulário PRÓPRIO
  //    desde a mesma migração. Ver `escolherDuracao`/`escolherDuracaoPremium`.
  // -------------------------------------------------------------------------
  const { PIPELINE_MAX_CHARS_POR_DURACAO, PREMIUM_MAX_CHARS_POR_DURACAO, PREMIUM_DURACAO_MAXIMA } = await import(
    "../services/video/falPipeline.js"
  );

  const roteiroPara5s = "x".repeat(PIPELINE_MAX_CHARS_POR_DURACAO[5]);
  const curto = await correr({ script: roteiroPara5s });
  const animarCurto = curto.corpos.find((c) => c.endpoint === "wan/v2.6/reference-to-video/flash");
  if (animarCurto?.corpo.duration !== "5") {
    failures.push(
      `pipeline: a duração não foi escolhida a partir do roteiro — ${roteiroPara5s.length} caracteres ` +
        `(o teto exato de 5 s) deveriam pedir "duration": "5" ao Wan, e o corpo trouxe ` +
        `${JSON.stringify(animarCurto?.corpo.duration ?? null)}. Passos: ${curto.passos.join(" → ") || "(nenhum)"}.`,
    );
  }

  const roteiroPara10s = "x".repeat(PIPELINE_MAX_CHARS_POR_DURACAO[10]);
  const longo = await correr({ script: roteiroPara10s });
  const animarLongo = longo.corpos.find((c) => c.endpoint === "wan/v2.6/reference-to-video/flash");
  if (animarLongo?.corpo.duration !== "10") {
    failures.push(
      `pipeline: a duração não foi escolhida a partir do roteiro — ${roteiroPara10s.length} caracteres ` +
        `(o teto exato de 10 s, o maior bloco do Wan desde a migração do item 2) deveriam pedir ` +
        `"duration": "10", e o corpo trouxe ${JSON.stringify(animarLongo?.corpo.duration ?? null)}. Passos: ` +
        `${longo.passos.join(" → ") || "(nenhum)"}.`,
    );
  }

  // 1 caractere acima do teto de 15 s DO PREMIUM: nenhuma duração comporta,
  // então nenhuma submissão pode sair — o pipeline não emenda clipes.
  //
  // ⚠️ BLOCO FRACOES-1, 28/08 — `correr()`/`runFalPipeline()` NÃO servem mais
  // para este teste: sem `tier` explícito, `runFalPipeline` assume "normal"
  // e passa a rotear por `conferirRoteiroENormal`/`fracionarRoteiro()`, que
  // fraciona por FRASE — e "x".repeat(N), sem nenhum `.!?…`, vira UMA frase
  // só, recusada pelo teto POR FRASE de `fracionarRoteiro` (que nunca chama
  // `escolherDuracao` com um valor grande o bastante para observar `null`).
  // MEDIDO em 28/08: com o mutante deste bloco aplicado (`escolherDuracao`
  // nunca devolve `null`), o gate ficava VERDE mesmo assim — a rejeição por
  // fracionamento mascarava o defeito que este teste existe para pegar.
  // Chamar `conferirRoteiro()` (o caminho SEM fracionamento — tier Premium,
  // função pura) direto restaura a exercitação exata do `escolherDuracaoPremium`
  // que o mutante altera, sem depender de tier nem de rede simulada.
  const { conferirRoteiro } = await import("../services/video/falPipeline.js");
  const roteiroDemais = "x".repeat(PREMIUM_MAX_CHARS_POR_DURACAO[15] + 1);
  let erroRoteiroDemais: unknown = null;
  try {
    conferirRoteiro(roteiroDemais);
  } catch (err) {
    erroRoteiroDemais = err;
  }
  if (
    !(erroRoteiroDemais instanceof FalPipelineError) ||
    !String(erroRoteiroDemais).includes(`${PREMIUM_DURACAO_MAXIMA} s`)
  ) {
    failures.push(
      `pipeline: um roteiro de ${roteiroDemais.length} caracteres — 1 acima do teto de 15 s do Premium — ` +
        "não foi recusado com o erro certo por conferirRoteiro() (caminho sem fracionamento, tier Premium): " +
        `veio ${erroRoteiroDemais === null ? "sucesso" : JSON.stringify(String(erroRoteiroDemais).slice(0, 160))}. ` +
        "Este pipeline não emenda clipes: o que não cabe em 15 s tem de ser recusado, não animado truncado.",
    );
  }

  if (failures.length === 0) {
    notes.push(
      `  pipeline: corpo cru gravado antes de qualquer leitura — ${feliz.crus.length} corpos no caminho ` +
        "feliz, e o corpo em forma inesperada também é gravado antes de a interpretação falhar",
    );
    notes.push(
      `  pipeline: o laço de polling desistiu no teto após ${pendente.leiturasDeStatus} leitura(s) e ` +
        "disse que o trabalho não deve ser refeito",
    );
    notes.push(
      `  pipeline: teto de gasto recusa antes da 1a submissão quando não cabe, e libera as 3 quando cabe ` +
        `(previsto do caminho feliz: US$ ${feliz.gastoPrevistoUsd.toFixed(2)})`,
    );
    notes.push(
      `  pipeline: os ${Object.values(DEFAULTS_NUNCA_HERDADOS).flat().length} campos que não se herda ` +
        "estão explícitos nos 3 corpos enviados",
    );
    notes.push(
      `  duração: ${roteiroPara5s.length} e ${roteiroPara10s.length} caracteres escolheram "5" e "10" ` +
        `junto ao motor de animação (teto do Wan desde a migração do item 2); ${roteiroDemais.length} ` +
        'caracteres (1 acima do teto de 15 s do PREMIUM, `conferirRoteiro`) recusados antes de qualquer ' +
        "submissão",
    );
  }

  return { failures, notes };
}
