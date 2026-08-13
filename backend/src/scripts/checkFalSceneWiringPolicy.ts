/**
 * A CENA chega ao fornecedor — as duas invariantes do BLOCO B5.
 *
 *  G-1  o cenário e o traje escolhidos na tela chegam a `image_urls` ou ao
 *       prompt da composição enviada à fal
 *  G-2  a direção traduzida chega ao prompt do Wan
 *
 * ┌─ Por que estas duas, e não uma só ───────────────────────────────────────┐
 * │ Os dois textos vão a MODELOS diferentes, e é essa separação que a rodada  │
 * │ construiu. `promptDeComposicao` descreve o que a imagem TEM (traje,       │
 * │ cenário) e alimenta o `nano-banana`, que produz um quadro parado. A       │
 * │ direção descreve o que a pessoa FAZ e só o Wan tem tempo para executá-la. │
 * │ Uma guarda única sobre "os textos saem" ficaria verde com os dois campos  │
 * │ TROCADOS — que é o defeito mais provável desta fiação, não o de eles      │
 * │ sumirem.                                                                  │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ ANCORADAS NO USO, e o uso é o CORPO que sai ────────────────────────────┐
 * │ Nenhuma das duas confere código lendo variável: as duas leem o corpo      │
 * │ submetido à fal com o `fetch` substituído. Um campo montado e não enviado │
 * │ é indistinguível de um campo não montado do ponto de vista do fornecedor, │
 * │ e foi exatamente assim que cenário e traje passaram semanas "existindo".  │
 * │                                                                           │
 * │ A metade de FORMA (o recorte da rota de aprovação) existe só porque a     │
 * │ rota é quem monta `promptDeDirecao`, e ela não é chamável sem subir o     │
 * │ Fastify. Ela está em mensagem SEPARADA da metade por execução, para as    │
 * │ duas nunca se passarem uma pela outra.                                    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Custo: ZERO ───────────────────────────────────────────────────────────┐
 * │ Nenhuma rede (o `fetch` é substituído), nenhum banco (o diário é um      │
 * │ array), nenhuma espera real (o `esperar` é injetado). O ElevenLabs NÃO   │
 * │ é simulado: a corrida do Wan é deixada MORRER na narração, depois de o   │
 * │ corpo do Wan já ter saído — que é tudo o que G-2 precisa ler. Simular o  │
 * │ TTS acrescentaria um segundo contrato falso para medir o primeiro.       │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";
const PROVIDER = "backend/src/services/providers/avatarProvider.ts";
const PIPELINE = "backend/src/services/video/falPipeline.ts";

/** O texto que só a composição deve ver. */
const TEXTO_DA_COMPOSICAO = "consultorio claro e desfocado. jaleco branco abotoado";
/** O texto que só o Wan deve ver. Em inglês, como chega pelo caminho real. */
const TEXTO_DA_DIRECAO = "speak calmly to camera with small natural head movements";

export const MUTANTS: Mutant[] = [
  {
    guard: "o cenário e o traje escolhidos na tela chegam à composição enviada à fal",
    name: "o cenário para de entrar nas imagens da composição",
    kind: "esperto",
    // ESPERTO porque NADA reclama. A corrida continua inteira, `image_urls`
    // continua sendo uma lista não vazia, a composição continua saindo, sendo
    // paga e devolvendo uma imagem plausível — só que sem o cenário que a
    // pessoa escolheu. É a forma exata do defeito que esta rodada consertou:
    // o campo é coletado, gravado, transportado, e some no último metro.
    //
    // O traje fica de fora do mutante de propósito: com os dois removidos, a
    // corrida passaria a mandar UMA imagem, e uma guarda preguiçosa que só
    // contasse "mais de uma" ainda pegaria. Tirando um só, a contagem cai de 3
    // para 2 e continua parecendo uma composição legítima.
    file: PROVIDER,
    find:
      "  if (input.scenario) {\n" +
      "    entradasExtras.push({\n" +
      '      rotulo: "cenario",',
    replace:
      "  if (false as boolean) {\n" +
      "    entradasExtras.push({\n" +
      '      rotulo: "cenario",',
    expect: "cenário: escolhido na tela e ausente da composição enviada à fal",
  },
  {
    guard: "a direção traduzida chega ao prompt do Wan",
    name: "o Wan volta a receber o prompt da composição no lugar da direção",
    kind: "esperto",
    // ESPERTO, e é a REGRESSÃO literal: era assim antes desta rodada. O Wan
    // continua recebendo um `prompt` não vazio, plausível e em texto livre —
    // nenhum 400, nenhum log, nenhuma diferença visível até alguém reparar que
    // o avatar não faz o que foi pedido num vídeo que já custou ~US$ 1,44.
    //
    // É também o motivo de as duas guardas serem duas: uma invariante única
    // sobre "os textos saem" ficaria VERDE aqui, porque os dois textos saem —
    // trocados.
    file: PIPELINE,
    find: "    prompt: input.promptDeDirecao,\n    image_url: imagemUrl,",
    replace: "    prompt: input.promptDeComposicao,\n    image_url: imagemUrl,",
    expect: "direção: o prompt do Wan não é a direção",
  },
];

export interface FalSceneWiringCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  // CRLF → LF. Ver o gotcha 3 do ESTADO.md: o working copy vem em CRLF e todo
  // trecho transcrito aqui é escrito com `\n`.
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

/** Um corpo submetido à fila da fal, com o endpoint que o recebeu. */
interface Submissao {
  endpoint: string;
  corpo: Record<string, unknown>;
}

/**
 * O `fetch` substituído, comum às duas corridas.
 *
 * Cada upload devolve uma `file_url` DIFERENTE (contador). É isso que permite
 * ligar rótulo → URL: o diário grava `{rotulo, fileUrl}` na publicação, e
 * `image_urls` traz as mesmas URLs na ordem em que entraram. Com uma URL fixa
 * para todos, "o cenário entrou" e "o rosto entrou três vezes" produziriam
 * exatamente a mesma lista.
 */
function instalarFetch(estado: {
  submissoes: Submissao[];
  publicados: { rotulo: string; fileUrl: string }[];
}): () => void {
  const original = globalThis.fetch;
  let nUpload = 0;

  globalThis.fetch = (async (entrada: unknown, init?: RequestInit) => {
    const url = String(
      typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada,
    );

    // Storage: `initiate` devolve o par de URLs; o `PUT` só precisa de 200.
    if (url.includes("rest.fal.ai")) {
      nUpload += 1;
      return new Response(
        JSON.stringify({
          file_url: `https://exemplo.fal.invalido/entrada-${nUpload}.bin`,
          upload_url: `https://exemplo.fal.invalido/put/entrada-${nUpload}.bin`,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes("fal.invalido")) return new Response("", { status: 200 });

    // ElevenLabs: deixado FALHAR de propósito. Ver o cabeçalho — a corrida do
    // Wan morre aqui, depois de o corpo do Wan já ter sido submetido.
    if (url.includes("elevenlabs")) return new Response("sem TTS nesta prova", { status: 500 });

    // Fila: status e resultado vêm por URL devolvida, nunca montada.
    if (url.includes("/status")) {
      return new Response(JSON.stringify({ status: "COMPLETED" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/requests/")) {
      // O resultado precisa servir aos dois endpoints: a composição lê
      // `images[0].url` e a animação lê `video.url`.
      return new Response(
        JSON.stringify({
          images: [{ url: "https://v3b.fal.media/imagem-da-prova.png" }],
          video: { url: "https://v3b.fal.media/video-da-prova.mp4" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    // Submissão. O endpoint está na própria URL (`queue.fal.run/{endpointId}`).
    let corpo: Record<string, unknown> = {};
    try {
      corpo = JSON.parse(String(init?.body ?? "{}"));
    } catch {
      corpo = {};
    }
    estado.submissoes.push({
      endpoint: url.replace("https://queue.fal.run/", ""),
      corpo,
    });
    return new Response(
      JSON.stringify({
        request_id: "req-da-prova",
        status_url: "https://queue.fal.run/x/requests/req-da-prova/status",
        response_url: "https://queue.fal.run/x/requests/req-da-prova",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  return () => {
    globalThis.fetch = original;
  };
}

/** O diário que registra o par rótulo → `file_url` da publicação. */
function criarDiario(publicados: { rotulo: string; fileUrl: string }[]) {
  return {
    async abrirEtapa() {
      return "step";
    },
    async gravarRequestId() {},
    async gravarRespostaCrua(_id: string, raw: string) {
      try {
        const j = JSON.parse(raw);
        if (typeof j?.rotulo === "string" && typeof j?.fileUrl === "string") {
          publicados.push({ rotulo: j.rotulo, fileUrl: j.fileUrl });
        }
      } catch {
        /* corpos que não são da publicação não interessam aqui */
      }
    },
    async fecharEtapa() {},
  };
}

/**
 * G-1: a corrida de CRIAÇÃO, pelo despacho real (`generateVideo`).
 *
 * Entra pelo mesmo ponto que a rota usa, e não direto no orquestrador: o que se
 * mede é a ponte `generateVideoFal` — que é onde os quatro campos da tela viram
 * `entradasExtras` e `promptDeComposicao`.
 */
async function corridaDeComposicao(): Promise<{
  submissoes: Submissao[];
  publicados: { rotulo: string; fileUrl: string }[];
  erro: string;
}> {
  const { generateVideo } = await import("../services/providers/avatarProvider.js");
  const estado = { submissoes: [] as Submissao[], publicados: [] as { rotulo: string; fileUrl: string }[] };
  const restaurarFetch = instalarFetch(estado);
  const modoOriginal = process.env.PROVIDER_MODE;
  let erro = "";

  try {
    // `live` porque em fixture o `falClient` desvia antes da rede e nenhum
    // corpo chegaria a ser montado.
    process.env.PROVIDER_MODE = "live";
    await generateVideo({
      apiKey: "chave-irrelevante-fetch-substituido",
      vendor: "fal" as never,
      providerAvatarId: "avatar-da-prova",
      script: "Roteiro curto da prova.",
      elevenLabsApiKey: "chave-irrelevante-fetch-substituido",
      voiceId: "0hQuq0q2JEk1SY4lZaM9",
      tenantId: "tenant-da-prova",
      audioTreatmentEnabled: false,
      audioTreatmentTargetLufs: -16,
      format: { platform: "youtube", aspectRatio: "16:9", resolution: "720p" } as never,
      engineEnabled: false,
      // O único arquivo que o repositório garante existir dentro de `uploads/`
      // (`.gitignore` tem `uploads/*` com `!uploads/.gitkeep`). Os três apontam
      // para ele porque o que se mede não é o CONTEÚDO: é se cada um dos três
      // papéis produziu uma entrada. O contador do `fetch` dá a cada upload uma
      // URL própria, e é o RÓTULO gravado no diário que diz quem é quem.
      photoUrls: ["/uploads/.gitkeep"],
      scenario: "/uploads/.gitkeep",
      outfit: "/uploads/.gitkeep",
      scenarioPrompt: "consultorio claro e desfocado",
      outfitPrompt: "jaleco branco abotoado",
      falDiario: criarDiario(estado.publicados) as never,
    } as never);
  } catch (err) {
    erro = String(err);
  } finally {
    restaurarFetch();
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  return { ...estado, erro };
}

/**
 * G-2: a corrida de ANIMAÇÃO, pela retomada real (`runFalPipelineDaImagem`).
 *
 * É a função que a rota de aprovação chama, e o único caminho do produto que
 * chega a submeter o Wan. A corrida morre na narração (o TTS devolve 500) —
 * depois de o corpo do Wan já ter saído, que é o que esta guarda lê.
 */
async function corridaDeAnimacao(): Promise<{ submissoes: Submissao[]; erro: string }> {
  const { runFalPipelineDaImagem } = await import("../services/video/falPipeline.js");
  const estado = { submissoes: [] as Submissao[], publicados: [] as { rotulo: string; fileUrl: string }[] };
  const restaurarFetch = instalarFetch(estado);
  const modoOriginal = process.env.PROVIDER_MODE;
  let erro = "";

  try {
    process.env.PROVIDER_MODE = "live";
    await runFalPipelineDaImagem(
      {
        apiKeyFal: "chave-irrelevante-fetch-substituido",
        apiKeyElevenLabs: "chave-irrelevante-fetch-substituido",
        voiceId: "0hQuq0q2JEk1SY4lZaM9",
        script: "Roteiro curto da prova.",
        fotoBase: Buffer.alloc(0),
        fotoMimeType: "image/jpeg",
        promptDeComposicao: TEXTO_DA_COMPOSICAO,
        promptDeDirecao: TEXTO_DA_DIRECAO,
        diario: criarDiario(estado.publicados) as never,
        pollTimeoutMs: 50,
        pollIntervalMs: 1,
        esperar: async () => {},
      },
      "https://v3b.fal.media/imagem-aprovada.png",
      "req-da-composicao",
    );
  } catch (err) {
    erro = String(err);
  } finally {
    restaurarFetch();
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  return { submissoes: estado.submissoes, erro };
}

export async function checkFalSceneWiringPolicy(): Promise<FalSceneWiringCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // ---------------------------------------------------------------------------
  // G-1 — cenário e traje na COMPOSIÇÃO
  // ---------------------------------------------------------------------------
  const criacao = await corridaDeComposicao();

  if (criacao.erro.includes("ENOENT")) {
    // Rede: sem o arquivo de prova a ponte morre no `readUpload` ANTES de montar
    // corpo nenhum, e as mensagens abaixo culpariam a fiação por um defeito do
    // ambiente. Ver a mesma rede em `checkFalGenerationPathPolicy`.
    failures.push(
      "cena: o arquivo de prova `uploads/.gitkeep` não existe, e sem ele a ponte morre no `readUpload` " +
        `antes de qualquer submissão (${JSON.stringify(criacao.erro.slice(0, 120))}). Isto NÃO é defeito ` +
        "da fiação — é o ambiente da guarda. Restaure o arquivo (o git o rastreia: `.gitignore` tem " +
        "`!uploads/.gitkeep`).",
    );
    return { failures, notes };
  }

  const composicao = criacao.submissoes.find((s) => s.endpoint.includes("nano-banana"));
  if (!composicao) {
    failures.push(
      "cena: nenhuma submissão de composição saiu, então não há corpo em que conferir se o cenário e o " +
        `traje chegaram. Endpoints observados: ${criacao.submissoes.map((s) => s.endpoint).join(", ") || "(nenhum)"}; ` +
        `erro ${JSON.stringify(criacao.erro.slice(0, 140))}.`,
    );
  } else {
    const imagens = Array.isArray(composicao.corpo.image_urls)
      ? (composicao.corpo.image_urls as string[])
      : [];
    const prompt = String(composicao.corpo.prompt ?? "");

    // O par rótulo → URL da publicação. É ele que responde "quem é quem" numa
    // lista de URLs que, sem isto, seria só três strings parecidas.
    const urlDoRotulo = (rotulo: string) =>
      criacao.publicados.find((p) => p.rotulo === rotulo)?.fileUrl ?? null;

    for (const [rotulo, campoDeTexto, textoEsperado] of [
      ["cenario", "scenario_prompt", "consultorio claro e desfocado"],
      ["traje", "outfit_prompt", "jaleco branco abotoado"],
    ] as const) {
      const url = urlDoRotulo(rotulo);
      const chegouPorImagem = url !== null && imagens.includes(url);
      const chegouPorTexto = prompt.includes(textoEsperado);

      // A invariante é "OU" de propósito: os dois caminhos são legítimos e o
      // produto aceita os dois ao mesmo tempo. O que ela proíbe é o campo ter
      // sido escolhido na tela e não estar em NENHUM dos dois.
      if (!chegouPorImagem && !chegouPorTexto) {
        failures.push(
          `${rotulo}: escolhido na tela e ausente da composição enviada à fal — nem em \`image_urls\` ` +
            `(publicado como ${JSON.stringify(url)}, lista enviada: ${JSON.stringify(imagens)}) nem no ` +
            `\`prompt\` (${JSON.stringify(prompt)}). O campo é coletado pelo passo 1, gravado em ` +
            `\`videos.${campoDeTexto.replace("_prompt", "")}\`/\`${campoDeTexto}\` e transportado até a ` +
            "ponte: sumir aqui é o defeito que esta guarda existe para pegar, e ele é INVISÍVEL — a " +
            "composição sai, é paga, e devolve uma imagem plausível sem o que a pessoa escolheu.",
        );
      }
    }

    // A ORDEM é significativa para o `nano-banana` (`[rosto, traje?, cenário?]`)
    // e não é observável em nenhum outro lugar: trocá-la não quebra nada e muda
    // a imagem que sai.
    const rosto = urlDoRotulo("rosto");
    if (rosto !== null && imagens[0] !== rosto) {
      failures.push(
        `rosto: a primeira imagem da composição não é o rosto — \`image_urls[0]\` é ${JSON.stringify(imagens[0] ?? null)} ` +
          `e o rosto foi publicado como ${JSON.stringify(rosto)}. A ordem \`[rosto, traje?, cenário?]\` é ` +
          "significativa para o `nano-banana`, e é ela que decide quem é o SUJEITO da composição.",
      );
    }

    if (failures.length === 0) {
      notes.push(
        `    cena: cenário e traje chegam à composição — ${imagens.length} imagens em \`image_urls\` na ordem ` +
          `[${criacao.publicados.map((p) => p.rotulo).join(", ")}] e o prompt leva os dois textos`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-2 — a direção no WAN, por EXECUÇÃO
  // ---------------------------------------------------------------------------
  const animacao = await corridaDeAnimacao();
  const wan = animacao.submissoes.find((s) => s.endpoint.includes("wan"));

  if (!wan) {
    failures.push(
      "direção: nenhuma submissão ao Wan saiu, então não há corpo em que conferir o prompt. Endpoints " +
        `observados: ${animacao.submissoes.map((s) => s.endpoint).join(", ") || "(nenhum)"}; erro ` +
        `${JSON.stringify(animacao.erro.slice(0, 140))}.`,
    );
  } else {
    const prompt = String(wan.corpo.prompt ?? "");
    if (!prompt.includes(TEXTO_DA_DIRECAO)) {
      failures.push(
        `direção: o prompt do Wan não é a direção — saiu ${JSON.stringify(prompt)}, e o esperado era o ` +
          `texto da direção (${JSON.stringify(TEXTO_DA_DIRECAO)}). O Wan já recebe a imagem pronta em ` +
          "`image_url`: o que só ele pode executar é o que a pessoa escreveu na Interpretação. Sem isto, " +
          "o vídeo pago sai sem direção nenhuma e nada no caminho reclama.",
      );
    }
    if (prompt.includes(TEXTO_DA_COMPOSICAO)) {
      failures.push(
        "direção: o prompt do Wan carrega o texto da COMPOSIÇÃO — os dois campos foram trocados ou " +
          `concatenados (saiu ${JSON.stringify(prompt)}). Descrever de novo o traje e o cenário para o ` +
          "Wan é pedir que ele redesenhe o que já está no quadro que recebeu, e é a forma deste defeito " +
          "que NÃO aparece como campo vazio.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-2 — a direção no WAN, por FORMA (a rota, que não é chamável daqui)
  // ---------------------------------------------------------------------------
  const rota = lerDaRaiz(ROTA_DE_VIDEOS);
  // ÂNCORAS INTRÍNSECAS ao que se mede: as DUAS rotas que montam um input do
  // pipeline. Nunca um wrapper — ver o gotcha 6 do ESTADO.md.
  //
  // O fim NÃO pode ser `runFalPipelineDaImagem(`: o campo conferido está DENTRO
  // do objeto passado a ela, portanto DEPOIS da chamada. Ancorar ali recorta o
  // trecho antes justamente do que se quer medir, e a guarda acusa ausência do
  // que está lá — foi o que ela fez na primeira escrita desta rodada.
  const inicio = rota.indexOf('"/videos/:id/approve"');
  const fim = rota.indexOf('"/videos/:id/recompose"', inicio);

  if (inicio < 0 || fim < 0) {
    failures.push(
      `direção: não foi possível recortar a rota de aprovação em ${ROTA_DE_VIDEOS} pelas âncoras ` +
        '`"/videos/:id/approve"` e `"/videos/:id/recompose"`. A guarda não pode opinar sobre um trecho ' +
        "que não encontrou, e passar verde aqui seria o pior desfecho.",
    );
  } else {
    const trecho = rota.slice(inicio, fim);

    // Rede anti-vazamento, nos DOIS sentidos. Se o recorte não contém a chamada
    // de retomada, ele não é a rota de aprovação; se contém a recomposição, ele
    // passou do fim — e a montagem conferida seria a de uma rota que para em
    // `compor` e nunca submete o Wan.
    if (!trecho.includes("runFalPipelineDaImagem(")) {
      failures.push(
        "direção: o recorte da rota de aprovação não contém `runFalPipelineDaImagem(` — a âncora " +
          "encontrou um trecho que não é o da aprovação, e o que for conferido nele não diz nada sobre " +
          "o prompt que chega ao Wan.",
      );
    }
    if (trecho.includes("recompor({")) {
      failures.push(
        "direção: o recorte da rota de aprovação engoliu `recompor({` — a âncora vazou para a rota " +
          "vizinha, e a montagem conferida seria a da recomposição, que para em `compor` e nunca " +
          "submete o Wan.",
      );
    }
    if (!trecho.includes("promptDeDirecao:")) {
      failures.push(
        "direção: a rota de aprovação monta a retomada SEM `promptDeDirecao` — o campo é obrigatório no " +
          "orquestrador, então isto não compila hoje; se compilar, alguém o tornou opcional e a direção " +
          "voltou a morrer entre a linha de `videos` e o Wan, que é exatamente o defeito do BLOCO B5.",
      );
    } else if (!trecho.includes("promptDaDirecaoDaLinha(video)")) {
      failures.push(
        "direção: a rota de aprovação passa um `promptDeDirecao` que não vem de " +
          "`promptDaDirecaoDaLinha(video)` — a direção do fornecedor é a coluna VELADA " +
          "`motion_prompt_en`, e montá-la de outro jeito aqui mandaria o texto em português ao Wan ou " +
          "retraduziria no clique, fazendo uma etapa de ~US$ 1,44 depender de um segundo serviço.",
      );
    }
  }

  if (!failures.some((f) => f.startsWith("direção:"))) {
    notes.push(
      "    cena: a direção chega ao prompt do Wan e o texto da composição não — os dois campos vão a " +
        "modelos diferentes, e a rota de aprovação a lê de `motion_prompt_en`",
    );
  }

  return { failures, notes };
}
