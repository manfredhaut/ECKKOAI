/**
 * A CENA chega ao fornecedor — as duas invariantes do BLOCO B5.
 *
 *  G-1  o cenário e o traje escolhidos na tela chegam à composição enviada à
 *       fal — a imagem em `image_urls`, o texto no `prompt`, cada um pelo canal
 *       que é seu
 *  G-2  a direção traduzida chega ao prompt do motor de animação (Wan —
 *       Seedance 2.5 foi pesquisado e revertido no BLOCO SEEDANCE-1, 21/08,
 *       reservado pro tier "Premium")
 *
 * ┌─ Por que estas duas, e não uma só ───────────────────────────────────────┐
 * │ Os dois textos vão a MODELOS diferentes, e é essa separação que a rodada  │
 * │ construiu. `promptDeComposicao` descreve o que a imagem TEM (traje,       │
 * │ cenário) e alimenta o `nano-banana`, que produz um quadro parado. A       │
 * │ direção descreve o que a pessoa FAZ e só o motor de animação tem tempo   │
 * │ para executá-la.                                                         │
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
 * │ é simulado: a corrida de animação é deixada MORRER na narração, depois  │
 * │ de o corpo da animação já ter saído — que é tudo o que G-2 precisa ler.  │
 * │ Simular o TTS acrescentaria um segundo contrato falso para medir o       │
 * │ primeiro.                                                                │
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
/** O texto que só o motor de animação deve ver. Em inglês, como chega pelo caminho real. */
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
    //
    // ⚠️ O BLOCO INTEIRO, e não a condição desligada. MEDIDO nesta rodada: um
    // mutante que trocasse só o `if` por `if (false as boolean)` sai 2 pelo
    // `tsc` — o corpo vira inalcançável, o narrowing de `input.scenario` para
    // de propagar para dentro dele, e `readUpload(input.scenario)` volta a ver
    // `string | null | undefined`. O arnês devolveu AMBÍGUO com a guarda
    // saudável e sem ela ter opinado. É o mesmo gotcha do `false &&` registrado
    // no B2, numa forma nova: a mutação precisa levar o corpo junto, porque é o
    // corpo que depende do estreitamento que a condição dava.
    file: PROVIDER,
    find:
      "  if (input.scenario) {\n" +
      "    entradasExtras.push({\n" +
      '      rotulo: "cenario",\n' +
      "      bytes: await readUpload(input.scenario),\n" +
      "      mimeType: mimeDoUpload(input.scenario),\n" +
      "    });\n" +
      "  }\n",
    replace: "",
    // TRANSCRITO da mensagem que a guarda emite, com o rótulo como ele existe
    // no código (`cenario`, sem acento — é o valor de `EntradaDeComposicao`, e
    // não o nome do campo em português). Gotcha 2 do ESTADO.md.
    expect: "cenario: escolhido na tela como IMAGEM e ausente da composição enviada à fal",
  },
  {
    guard: "a foto lateral (Lado direito/esquerdo) chega a `image_urls` quando existe",
    name: "a lateral some inteira da composição",
    kind: "esperto",
    // ESPERTO: rosto, cenário e traje continuam chegando certinho — só a
    // referência extra de identidade (a lateral) desaparece, sem nada
    // reclamar. É a mesma forma do defeito já registrado para cenário/traje,
    // aplicada à peça nova desta rodada (28/08).
    file: PROVIDER,
    find:
      "  if (ladoDireitoUrl) {\n" +
      "    entradasExtras.push({\n" +
      '      rotulo: "lado_direito",\n' +
      "      bytes: await readUpload(ladoDireitoUrl),\n" +
      "      mimeType: mimeDoUpload(ladoDireitoUrl),\n" +
      "    });\n" +
      "  } else if (ladoEsquerdoUrl) {\n" +
      "    entradasExtras.push({\n" +
      '      rotulo: "lado_esquerdo",\n' +
      "      bytes: await readUpload(ladoEsquerdoUrl),\n" +
      "      mimeType: mimeDoUpload(ladoEsquerdoUrl),\n" +
      "    });\n" +
      "  }\n",
    replace: "",
    expect: 'nem "Lado direito" nem "Lado esquerdo" chegaram a `image_urls`',
  },
  {
    guard: "nunca as duas fotos laterais juntas em `image_urls`",
    name: "o \"else\" some — as duas laterais entram juntas",
    kind: "esperto",
    // ESPERTO: cada bloco continua com sua própria condição e seu próprio
    // upload — nada quebra, nenhum erro. Só a exclusividade desaparece: com
    // as duas fotos presentes no avatar, as DUAS entram na composição em vez
    // de só "Lado direito" vencer sozinha. É exatamente o tipo de mudança
    // que sobrevive a uma reformatação descuidada do bloco (por exemplo,
    // "separar os dois `if` para deixar mais legível").
    file: PROVIDER,
    find: "  } else if (ladoEsquerdoUrl) {\n",
    replace: "  }\n  if (ladoEsquerdoUrl) {\n",
    expect: "as DUAS fotos laterais",
  },
  {
    guard: "`image_urls` nunca ultrapassa 4 posições, mesmo com cenário+traje+lateral presentes",
    name: "o total de imagens da composição passa de 4",
    kind: "esperto",
    // MESMA mutação do mutante anterior (o \"else\" sumindo): com cenário e
    // traje também presentes na prova (ver `corridaDeComposicao`), as duas
    // laterais somadas aos outros três papéis levam o array a 5 posições —
    // acima do teto que esta rodada fixou. Dois mutantes, uma mutação só:
    // ela quebra duas invariantes ao mesmo tempo, e cada uma tem sua própria
    // prova de reprovação.
    file: PROVIDER,
    find: "  } else if (ladoEsquerdoUrl) {\n",
    replace: "  }\n  if (ladoEsquerdoUrl) {\n",
    expect: "acima do teto de 4",
  },
  {
    guard: "a direção traduzida chega ao prompt do motor de animação",
    name: "o motor de animação volta a receber o prompt da composição no lugar da direção",
    kind: "esperto",
    // ESPERTO, e é a REGRESSÃO literal: era assim antes desta rodada. O motor
    // de animação continua recebendo um `prompt` não vazio, plausível e em
    // texto livre — nenhum 400, nenhum log, nenhuma diferença visível até
    // alguém reparar que o avatar não faz o que foi pedido num vídeo que já
    // custou ~US$ 1,44.
    //
    // É também o motivo de as duas guardas serem duas: uma invariante única
    // sobre "os textos saem" ficaria VERDE aqui, porque os dois textos saem —
    // trocados.
    //
    // `find` reescrito na FASE 0 (21/08): o `prompt` passou a ir envolto em
    // `comDefaultsDeDirecao(...)` (as 3 frases fixas de câmera/gesto/mão) —
    // ver `checkFalFase0DefaultsPolicy.ts`. A âncora precisa da chamada nova
    // para continuar única no arquivo. O BLOCO SEEDANCE-1 (21/08) chegou a
    // trocar `image_url` por `image_urls`, mas foi revertido no mesmo dia —
    // ver `ENDPOINT_ANIMAR` em falPipeline.ts.
    file: PIPELINE,
    find: "    prompt: comDefaultsDeDirecao(input.promptDeDirecao),\n    image_url: imagemUrl,",
    replace: "    prompt: comDefaultsDeDirecao(input.promptDeComposicao),\n    image_url: imagemUrl,",
    expect: "direção: o prompt do motor de animação não é a direção",
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

/**
 * Exportados (`instalarFetch`, `criarDiario`, `corridaDeComposicao`,
 * `corridaDeAnimacao`) para que `checkFalFase0DefaultsPolicy.ts` reuse a
 * MESMA simulação de fornecedor, em vez de uma segunda cópia divergente do
 * `fetch` substituído — as duas guardas leem corpos submetidos pelo mesmo
 * par de corridas reais (`generateVideo` / `runFalPipelineDaImagem`), só que
 * conferem invariantes diferentes sobre eles.
 */

/** Um corpo submetido à fila da fal, com o endpoint que o recebeu. */
export interface Submissao {
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
export function instalarFetch(estado: {
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

    // ElevenLabs: deixado FALHAR de propósito. Ver o cabeçalho — a corrida da
    // animação morre aqui, depois de o corpo dela já ter sido submetido.
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
export function criarDiario(publicados: { rotulo: string; fileUrl: string }[]) {
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
    async registrarGastoPrevisto() {},
  };
}

/**
 * G-1: a corrida de CRIAÇÃO, pelo despacho real (`generateVideo`).
 *
 * Entra pelo mesmo ponto que a rota usa, e não direto no orquestrador: o que se
 * mede é a ponte `generateVideoFal` — que é onde os quatro campos da tela viram
 * `entradasExtras` e `promptDeComposicao`.
 */
export async function corridaDeComposicao(): Promise<{
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
      // (`.gitignore` tem `uploads/*` com `!uploads/.gitkeep`). Os cinco
      // apontam para ele porque o que se mede não é o CONTEÚDO: é se cada
      // papel produziu uma entrada. O contador do `fetch` dá a cada upload
      // uma URL própria, e é o RÓTULO gravado no diário que diz quem é quem.
      //
      // TRÊS fotos (Frente/Lado direito/Lado esquerdo) — rodada de 28/08,
      // fotos laterais como referência extra. Com as três presentes, a
      // guarda G-3 abaixo confere que só a de "Lado direito" (posição 1)
      // entra, nunca as duas juntas.
      photoUrls: ["/uploads/.gitkeep", "/uploads/.gitkeep", "/uploads/.gitkeep"],
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
 *
 * `tier` (BLOCO A, opcional, default `"normal"`) reusa esta MESMA corrida
 * para `checkFalTierPolicy.ts` medir o motor Premium (Seedance), sem uma
 * segunda cópia da simulação de fornecedor.
 */
export async function corridaDeAnimacao(
  tier?: "normal" | "premium",
): Promise<{ submissoes: Submissao[]; erro: string }> {
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
        tenantId: "tenant-da-prova",
        promptDeDirecao: TEXTO_DA_DIRECAO,
        diario: criarDiario(estado.publicados) as never,
        pollTimeoutMs: 50,
        pollIntervalMs: 1,
        esperar: async () => {},
        tier,
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

      // ┌─ CADA CANAL RESPONDE PELO QUE RECEBEU, e não "um dos dois basta" ───┐
      // │ A corrida desta guarda preenche os DOIS: o campo de arquivo e o de  │
      // │ texto, que é o caso que o produto aceita e a tela oferece. A versão │
      // │ frouxa desta conferência — "chegou por imagem OU por texto" —       │
      // │ NASCEU INERTE, e isso está MEDIDO: com o cenário removido de        │
      // │ `image_urls`, o `scenario_prompt` sozinho ainda satisfazia o "ou", o │
      // │ gate passou VERDE com o defeito aplicado e o arnês acusou a guarda. │
      // │                                                                      │
      // │ O "ou" descreve corretamente o que o PRODUTO aceita (mandar só um    │
      // │ dos dois é legítimo) e descreve mal o que a GUARDA pode afirmar: com │
      // │ os dois dados, os dois têm de chegar, cada um pelo canal que é seu — │
      // │ a imagem para `image_urls`, o texto para o `prompt`. Um cenário que  │
      // │ vira só texto é uma composição diferente da que a pessoa pediu, e é  │
      // │ paga do mesmo jeito.                                                 │
      // └──────────────────────────────────────────────────────────────────────┘
      if (!chegouPorImagem) {
        failures.push(
          `${rotulo}: escolhido na tela como IMAGEM e ausente da composição enviada à fal — publicado ` +
            `como ${JSON.stringify(url)} e a lista enviada foi ${JSON.stringify(imagens)}. O campo é ` +
            `coletado pelo passo 1, gravado em \`videos.${campoDeTexto.replace("_prompt", "")}\` e ` +
            "transportado até a ponte: sumir aqui é INVISÍVEL — a composição sai, é paga, e devolve uma " +
            "imagem plausível sem a referência que a pessoa escolheu. O texto chegar no lugar dela não " +
            "compensa: descrever um cenário não é o mesmo que mostrá-lo.",
        );
      }
      if (!chegouPorTexto) {
        failures.push(
          `${rotulo}: escolhido na tela como TEXTO e ausente do prompt da composição — esperado ` +
            `${JSON.stringify(textoEsperado)} em \`prompt\`, que saiu ${JSON.stringify(prompt)}. A coluna ` +
            `\`videos.${campoDeTexto}\` é preenchida pelo passo 1 e some aqui sem nada reclamar.`,
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

    // ---------------------------------------------------------------------
    // G-3 — a foto LATERAL (rodada de 28/08): chega quando existe, nunca as
    // duas juntas, e o total nunca ultrapassa 4 (1 rosto + cenário + traje +
    // no máximo 1 lateral). A prova usa TRÊS fotos (`corridaDeComposicao`),
    // então em código CORRETO só "lado_direito" deve aparecer — "lado_direito"
    // vence "lado_esquerdo" por posição, a mesma ordem da captura na aba 1.
    // ---------------------------------------------------------------------
    const urlLadoDireito = urlDoRotulo("lado_direito");
    const urlLadoEsquerdo = urlDoRotulo("lado_esquerdo");
    const ladoDireitoNaComposicao = urlLadoDireito !== null && imagens.includes(urlLadoDireito);
    const ladoEsquerdoNaComposicao = urlLadoEsquerdo !== null && imagens.includes(urlLadoEsquerdo);

    if (!ladoDireitoNaComposicao && !ladoEsquerdoNaComposicao) {
      failures.push(
        'lateral: nem "Lado direito" nem "Lado esquerdo" chegaram a `image_urls`, mesmo com as duas ' +
          "fotos presentes no avatar da prova — a referência extra de identidade desapareceu na " +
          "composição, sem nada reclamar. `image_urls` enviado: " +
          JSON.stringify(imagens),
      );
    }
    if (ladoDireitoNaComposicao && ladoEsquerdoNaComposicao) {
      failures.push(
        'lateral: as DUAS fotos laterais ("Lado direito" e "Lado esquerdo") chegaram juntas a ' +
          "`image_urls` — a regra fixada nesta rodada é NO MÁXIMO uma, com \"Lado direito\" vencendo " +
          "sozinha quando as duas existem. `image_urls` enviado: " +
          JSON.stringify(imagens),
      );
    }
    if (imagens.length > 4) {
      failures.push(
        `lateral: a composição enviou ${imagens.length} imagens em \`image_urls\`, acima do teto de 4 ` +
          "— mesmo com cenário, traje e uma lateral presentes, o total nunca deveria passar de 4 (1 " +
          "obrigatória + 3 opcionais, cada opcional contribuindo no máximo 1). `image_urls` enviado: " +
          JSON.stringify(imagens),
      );
    }

    if (failures.length === 0) {
      notes.push(
        `    cena: cenário e traje chegam à composição — ${imagens.length} imagens em \`image_urls\` na ordem ` +
          `[${criacao.publicados.map((p) => p.rotulo).join(", ")}] e o prompt leva os dois textos`,
      );
      notes.push(
        '    lateral: com Frente/Lado direito/Lado esquerdo todos presentes, só "Lado direito" entra em ' +
          "`image_urls`, o total fica em 4 posições, e nunca as duas laterais chegam juntas",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-2 — a direção no motor de animação, por EXECUÇÃO
  //
  // "wan" é o identificador estável do motor ATUAL (tier "Normal"). O BLOCO
  // SEEDANCE-1 (21/08) trocou brevemente para "seedance" e foi revertido no
  // mesmo dia — ver `ENDPOINT_ANIMAR` em falPipeline.ts.
  // ---------------------------------------------------------------------------
  const animacao = await corridaDeAnimacao();
  const animar = animacao.submissoes.find((s) => s.endpoint.includes("wan"));

  if (!animar) {
    failures.push(
      "direção: nenhuma submissão ao motor de animação saiu, então não há corpo em que conferir o " +
        `prompt. Endpoints observados: ${animacao.submissoes.map((s) => s.endpoint).join(", ") || "(nenhum)"}; ` +
        `erro ${JSON.stringify(animacao.erro.slice(0, 140))}.`,
    );
  } else {
    const prompt = String(animar.corpo.prompt ?? "");
    if (!prompt.includes(TEXTO_DA_DIRECAO)) {
      failures.push(
        `direção: o prompt do motor de animação não é a direção — saiu ${JSON.stringify(prompt)}, e o ` +
          `esperado era o texto da direção (${JSON.stringify(TEXTO_DA_DIRECAO)}). Ele já recebe a imagem ` +
          "pronta em `image_url`: o que só ele pode executar é o que a pessoa escreveu na Interpretação. " +
          "Sem isto, o vídeo pago sai sem direção nenhuma e nada no caminho reclama.",
      );
    }
    if (prompt.includes(TEXTO_DA_COMPOSICAO)) {
      failures.push(
        "direção: o prompt do motor de animação carrega o texto da COMPOSIÇÃO — os dois campos foram " +
          `trocados ou concatenados (saiu ${JSON.stringify(prompt)}). Descrever de novo o traje e o ` +
          "cenário para ele é pedir que redesenhe o que já está no quadro que recebeu, e é a forma deste " +
          "defeito que NÃO aparece como campo vazio.",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // G-2 — a direção no motor de animação, por FORMA (a rota, que não é
  // chamável daqui)
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
    // `compor` e nunca submete a animação.
    if (!trecho.includes("runFalPipelineDaImagem(")) {
      failures.push(
        "direção: o recorte da rota de aprovação não contém `runFalPipelineDaImagem(` — a âncora " +
          "encontrou um trecho que não é o da aprovação, e o que for conferido nele não diz nada sobre " +
          "o prompt que chega ao motor de animação.",
      );
    }
    if (trecho.includes("recompor({")) {
      failures.push(
        "direção: o recorte da rota de aprovação engoliu `recompor({` — a âncora vazou para a rota " +
          "vizinha, e a montagem conferida seria a da recomposição, que para em `compor` e nunca " +
          "submete a animação.",
      );
    }
    if (!trecho.includes("promptDeDirecao:")) {
      failures.push(
        "direção: a rota de aprovação monta a retomada SEM `promptDeDirecao` — o campo é obrigatório no " +
          "orquestrador, então isto não compila hoje; se compilar, alguém o tornou opcional e a direção " +
          "voltou a morrer entre a linha de `videos` e o motor de animação, que é exatamente o defeito " +
          "do BLOCO B5.",
      );
    } else if (!trecho.includes("promptDaDirecaoDaLinha(video)")) {
      failures.push(
        "direção: a rota de aprovação passa um `promptDeDirecao` que não vem de " +
          "`promptDaDirecaoDaLinha(video)` — a direção do fornecedor é a coluna VELADA " +
          "`motion_prompt_en`, e montá-la de outro jeito aqui mandaria o texto em português ao motor de " +
          "animação ou retraduziria no clique, fazendo uma etapa de ~US$ 1,44 depender de um segundo " +
          "serviço.",
      );
    }
  }

  if (!failures.some((f) => f.startsWith("direção:"))) {
    notes.push(
      "    cena: a direção chega ao prompt do motor de animação e o texto da composição não — os dois " +
        "campos vão a modelos diferentes, e a rota de aprovação a lê de `motion_prompt_en`",
    );
  }

  return { failures, notes };
}
