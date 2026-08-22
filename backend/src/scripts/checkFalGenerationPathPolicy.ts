/**
 * O CAMINHO DA FAL ligado ao produto — as três invariantes do BLOCO B2.
 *
 *  G-a  vendor sem caminho de geração é recusado ANTES do débito
 *  G-b  `publicarEntradas` roda antes do primeiro `autorizarGasto`
 *  G-c  o ramo da fal não altera o ternário did/heygen
 *
 * ┌─ G-b é ancorada no USO, e o desfecho é o que a torna observável ─────────┐
 * │ Ordem entre "publicou" e "autorizou gasto" NÃO produz passo observável   │
 * │ nenhum no caminho feliz: as duas acontecem, e a corrida termina igual.   │
 * │ É exatamente a armadilha do gotcha 9 — duas guardas deste projeto já     │
 * │ nasceram inertes medindo ordem entre passos que não mudam.               │
 * │                                                                          │
 * │ A corrida que MEDE é a que falha nas duas pontas ao mesmo tempo: teto    │
 * │ ZERO e upload quebrado. Com a ordem certa, quem estoura primeiro é o     │
 * │ upload (`upload_failed`) e nenhum gasto chegou a ser autorizado. Com a   │
 * │ ordem invertida, o teto reprova antes (`TETO DE GASTO`) e a corrida      │
 * │ morre sem nunca ter tentado publicar. Dois erros distintos, do mesmo     │
 * │ tipo, na mesma corrida — é isso que dá à ordem um desfecho.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ G-c mede FORMA, e isto está declarado ─────────────────────────────────┐
 * │ Transformar o `if` num terceiro braço do ternário NÃO muda comportamento │
 * │ nenhum: heygen, did e vendor desconhecido continuam indo para o mesmo    │
 * │ lugar. Não há corrida que distinga as duas versões, e uma guarda que     │
 * │ prometesse medir isso por execução estaria mentindo. O que ela mede por  │
 * │ EXECUÇÃO é o despacho (fal alcança o pipeline, did não alcança); o que   │
 * │ mede por forma é o ternário estar inteiro — e as duas metades estão      │
 * │ separadas nas mensagens, para nunca se passarem uma pela outra.          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Custo: ZERO ───────────────────────────────────────────────────────────┐
 * │ Nenhuma rede (o `fetch` é substituído), nenhum banco (o diário é um      │
 * │ array), nenhuma espera real (o `esperar` é injetado).                    │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";

const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";
const PROVIDER = "backend/src/services/providers/avatarProvider.ts";

/**
 * O TERNÁRIO, transcrito. É a forma que o mutante de G-c desfaz.
 *
 * Vive numa constante porque a mensagem de falha precisa mostrá-la, e uma
 * segunda cópia dentro da mensagem divergiria da conferida.
 */
const TERNARIO_CANONICO =
  '    input.vendor === "did" ? generateVideoDid(input) : generateVideoHeygen(input),';

const RAMO_FAL = '  if (input.vendor === "fal") return generateVideoFal(input);';

export const MUTANTS: Mutant[] = [
  {
    guard: "vendor sem caminho de geração é recusado antes do débito",
    name: "o débito passa a acontecer antes do porteiro",
    kind: "esperto",
    // ESPERTO, e é a forma mais provável de isto regredir de verdade: ninguém
    // apaga um porteiro — alguém desce o débito "para perto de quem lê o
    // avatar", ou sobe uma reserva de crédito para o começo do handler. A
    // recusa continua acontecendo, o 403 continua saindo, a tela continua
    // idêntica — e o crédito já foi consumido por uma geração que nunca
    // poderia acontecer. Uma guarda que só perguntasse "a rota recusa vendor
    // sem caminho?" ficaria verde.
    //
    // Mover o BLOCO do porteiro para depois do débito exigiria um `find` de
    // ~130 linhas contíguas (o INSERT e a tradução estão entre os dois), e um
    // `find` desse tamanho apodrece na primeira edição do meio. Antecipar o
    // débito produz exatamente a mesma inversão sobre o que a guarda mede — a
    // primeira ocorrência de `await debitCredit({` passa a estar ANTES da
    // chamada ao porteiro — num trecho contíguo de uma linha.
    //
    // ⚠️ NÃO usar `if (false && …)` aqui: o TypeScript trata o corpo como
    // inalcançável, para de propagar o narrowing de `avatarCredential` para
    // dentro dele, e o gate sai 2 pelo `tsc`. MEDIDO nesta rodada — o arnês
    // devolveu AMBÍGUO, com a guarda saudável e sem ter opinado.
    file: ROTA_DE_VIDEOS,
    find: "    if (!hasGenerationPath(\"avatar\", avatarCredential.vendor)) {",
    replace:
      "    await debitCredit({ tenantId: req.tenantId, creditType: \"video\", relatedVideoId: req.tenantId });\n" +
      "    if (!hasGenerationPath(\"avatar\", avatarCredential.vendor)) {",
    expect: "vendor sem caminho de geração não é recusado antes do débito",
  },
  {
    guard: "look inválido é recusado antes do débito, no handler de criação",
    name: "o bloco inteiro de validação do look some do handler",
    kind: "obvio",
    // A geração passa a aceitar QUALQUER avatar_look_id sem olhar avatar_looks
    // — um traje ainda `processing`, `simulated` em live, ou de outro avatar
    // chega intacto a providerAvatarIdParaGeracao. Gap dimensionado em Z0.3.
    file: ROTA_DE_VIDEOS,
    find:
      "    if (avatarLookId) {\n" +
      "      try {\n" +
      "        await assertLookUsavel(pool, { tenantId: req.tenantId, avatarId: avatar.id, avatarLookId });\n" +
      "      } catch (err) {\n" +
      "        if (err instanceof LookInvalidoError) {\n" +
      '          logEvent("warn", "video_look_invalido", {\n' +
      '            context: "videos.create",\n' +
      "            code: err.code,\n" +
      '            consequence: "recusado antes do débito; nenhuma linha criada e nenhum crédito tocado",\n' +
      "          });\n" +
      "          return reply.code(400).send({ error: err.code, message: err.message });\n" +
      "        }\n" +
      "        throw err;\n" +
      "      }\n" +
      "    }",
    replace: "",
    expect: "não chama assertLookUsavel",
  },
  {
    guard: "a recusa de look inválido interrompe o handler (return antes do 400)",
    name: "o 400 do look inválido deixa de interromper a execução",
    kind: "esperto",
    // ESPERTO: o log continua saindo, o código 400 continua correto, o corpo
    // da resposta continua certo. Só falta o `return` — e sem ele o Fastify
    // já mandou a resposta, mas o handler CONTINUA rodando por cima dela: cai
    // no porteiro do vendor, no débito, na chamada ao fornecedor.
    file: ROTA_DE_VIDEOS,
    find: "          return reply.code(400).send({ error: err.code, message: err.message });",
    replace: "          reply.code(400).send({ error: err.code, message: err.message });",
    expect: "a recusa de look inválido não interrompe o handler",
  },
  {
    guard: "publicarEntradas roda antes do primeiro autorizarGasto",
    name: "a autorização de gasto sobe para antes da publicação",
    kind: "esperto",
    // ESPERTO: as duas continuam acontecendo, na mesma corrida, com os mesmos
    // números, e o caminho feliz termina IDÊNTICO. O que muda é quem estoura
    // primeiro quando as duas pontas falham — e é aí que uma falha de upload
    // deixa de custar zero e passa a acontecer com a corrida já autorizada.
    file: "backend/src/services/video/falPipeline.ts",
    find:
      "  const urlsDasEntradas = await publicarEntradas(input);\n" +
      "\n" +
      "  // --- 1. COMPOR -----------------------------------------------------------\n" +
      "  const teto = input.tetoDeGastoUsd ?? PIPELINE_TETO_USD;\n" +
      "  let gastoPrevistoUsd = 0;\n" +
      "\n" +
      '  gastoPrevistoUsd = autorizarGasto(gastoPrevistoUsd, PRECOS_FAL.comporUsd, teto, "compor");',
    replace:
      "  const teto = input.tetoDeGastoUsd ?? PIPELINE_TETO_USD;\n" +
      "  let gastoPrevistoUsd = 0;\n" +
      '  gastoPrevistoUsd = autorizarGasto(gastoPrevistoUsd, PRECOS_FAL.comporUsd, teto, "compor");\n' +
      "\n" +
      "  // --- 1. COMPOR -----------------------------------------------------------\n" +
      "  const urlsDasEntradas = await publicarEntradas(input);",
    expect: "a autorização de gasto aconteceu ANTES da publicação das entradas",
  },
  {
    guard: "o ramo da fal não altera o ternário did/heygen",
    name: "o if vira um terceiro braço do ternário",
    kind: "esperto",
    // ESPERTO no pior sentido: o comportamento fica IDÊNTICO. heygen, did e
    // vendor desconhecido continuam indo para o mesmo lugar, nenhuma corrida
    // distingue as duas versões, e é justamente por isso que só uma guarda de
    // forma pega. O que se perde é a propriedade: `heygen` sai do fim de UM
    // ternário para o fim de DOIS, e a ordem heygen-primeiro — que decide o
    // destino de todo tenant que nunca escolheu vendor — passa a depender de
    // ler dois níveis de aninhamento em vez de um.
    // ANCORADO SÓ no retorno, não em RAMO_FAL + retorno: desde o BACKLOG 8 os
    // dois deixaram de ser contíguos (o atalho de fixture — `if
    // (isFixtureMode()) return generateVideoFixture(input);` — e um bloco de
    // comentário ficaram no meio). Um `find` que exigisse os dois juntos
    // apodreceria a cada edição daquele comentário — a mesma lição já
    // registrada acima, no mutante do porteiro. RAMO_FAL não precisa ser
    // TOCADO por este mutante: deixá-lo intacto (agora código morto atrás de
    // um `if` que já devolveu) não invalida o teste — quem falha é a
    // contagem de ocorrências de TERNARIO_CANONICO, que passa a ser ZERO.
    file: PROVIDER,
    find: "  return withLiveBudget(\"geração de vídeo\", \"gerar vídeo\", async () =>\n" + TERNARIO_CANONICO,
    replace:
      "  return withLiveBudget(\"geração de vídeo\", \"gerar vídeo\", async () =>\n" +
      '    input.vendor === "fal"\n' +
      "      ? generateVideoFal(input)\n" +
      '      : input.vendor === "did"\n' +
      "        ? generateVideoDid(input)\n" +
      "        : generateVideoHeygen(input),",
    expect: "o ternário did/heygen não está mais inteiro",
  },
];

export interface FalGenerationPathCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  // O repositório inteiro é montado em `/repo` no container — o mesmo caminho
  // que `checkVendorErrorPathPolicy` usa. `/app` tem só `backend/src`, e ler
  // por ele deixaria de fora a tela.
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  // CRLF → LF, sempre. O working copy vem em CRLF (autocrlf no Windows) e
  // todo trecho transcrito aqui é escrito com `\n`: sem normalizar, um `find`
  // multi-linha casa ZERO vezes e a guarda acusa ausência do que está lá.
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

// ---------------------------------------------------------------------------
// G-b: a corrida que dá desfecho à ordem
// ---------------------------------------------------------------------------

interface Corrida {
  passos: string[];
  erro: string;
}

/**
 * Roda `runFalPipeline` com tudo substituído.
 *
 * `uploadQuebrado` faz o storage devolver 500; `teto` de zero faz qualquer
 * etapa paga ser recusada. Juntos, os dois dão à ordem um desfecho.
 */
async function correr(opcoes: { uploadQuebrado?: boolean; teto?: number }): Promise<Corrida> {
  const { runFalPipeline } = await import("../services/video/falPipeline.js");
  const passos: string[] = [];

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async (entrada: unknown) => {
    const url = String(
      typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada,
    );
    if (url.includes("rest.fal.ai") || url.includes("fal.invalido")) {
      passos.push("UPLOAD");
      if (opcoes.uploadQuebrado) {
        return new Response("storage fora do ar", { status: 500 });
      }
      return new Response(
        JSON.stringify({
          file_url: "https://exemplo.fal.invalido/entrada.bin",
          upload_url: "https://exemplo.fal.invalido/put/entrada.bin",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    passos.push("SUBMIT");
    return new Response(
      JSON.stringify({
        request_id: "req-da-prova",
        status_url: "https://queue.fal.run/x/requests/req-da-prova/status",
        response_url: "https://queue.fal.run/x/requests/req-da-prova",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  let seq = 0;
  const diario = {
    async abrirEtapa(etapa: string) {
      passos.push(`abriu:${etapa}`);
      return `step-${++seq}`;
    },
    async gravarRequestId() {},
    async gravarRespostaCrua() {},
    async fecharEtapa(_id: string, status: string, motivo?: string) {
      passos.push(`fechou:${status}${motivo ? `:${motivo}` : ""}`);
    },
  };

  const modoOriginal = process.env.PROVIDER_MODE;
  let erro = "";
  try {
    // `live` porque em fixture o `falUpload` desvia antes da rede e o upload
    // nunca poderia falhar — a corrida que mede deixaria de existir.
    process.env.PROVIDER_MODE = "live";
    await runFalPipeline({
      apiKeyFal: "chave-irrelevante-fetch-substituido",
      apiKeyElevenLabs: "chave-irrelevante-fetch-substituido",
      voiceId: "0hQuq0q2JEk1SY4lZaM9",
      script: "Roteiro curto da prova.",
      fotoBase: Buffer.from("foto-da-prova"),
      fotoMimeType: "image/jpeg",
      promptDeComposicao: "cena da prova",
      tenantId: "tenant-da-prova",
      promptDeDirecao: "direção da prova em inglês",
      diario: diario as never,
      tetoDeGastoUsd: opcoes.teto,
      pollTimeoutMs: 50,
      pollIntervalMs: 1,
      esperar: async () => {},
    });
  } catch (err) {
    erro = String(err);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  return { passos, erro };
}

// ---------------------------------------------------------------------------
// G-c: o despacho, EXECUTADO
// ---------------------------------------------------------------------------

/**
 * Chama `generateVideo` com um vendor e diz se o pipeline da fal foi alcançado.
 *
 * O sinal é o diário: só o caminho da fal abre etapa. Um vendor que não é fal
 * não pode encostar nele, e é isso que prova que o ramo novo não capturou os
 * outros dois.
 */
async function despachou(vendor: string): Promise<{ alcancouPipeline: boolean; erro: string }> {
  const { generateVideo } = await import("../services/providers/avatarProvider.js");
  let alcancouPipeline = false;

  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = (async () => new Response("{}", { status: 500 })) as typeof fetch;

  const diario = {
    async abrirEtapa() {
      alcancouPipeline = true;
      return "step";
    },
    async gravarRequestId() {},
    async gravarRespostaCrua() {},
    async fecharEtapa() {},
  };

  const modoOriginal = process.env.PROVIDER_MODE;
  let erro = "";
  try {
    process.env.PROVIDER_MODE = "live";
    await generateVideo({
      apiKey: "chave-irrelevante-fetch-substituido",
      vendor: vendor as never,
      providerAvatarId: "avatar-da-prova",
      script: "Roteiro curto da prova.",
      elevenLabsApiKey: "chave-irrelevante-fetch-substituido",
      voiceId: "0hQuq0q2JEk1SY4lZaM9",
      tenantId: "tenant-da-prova",
      audioTreatmentEnabled: false,
      audioTreatmentTargetLufs: -16,
      format: { platform: "youtube", aspectRatio: "16:9", resolution: "720p" } as never,
      engineEnabled: false,
      // O ÚNICO arquivo que o repositório garante existir dentro de `uploads/`
      // — `.gitignore` tem `uploads/*` com `!uploads/.gitkeep`. O conteúdo não
      // importa (zero bytes): o que se mede aqui é o DESPACHO, e a ponte
      // precisa de um caminho que `readUpload` consiga abrir para chegar até
      // ele. Se este arquivo sumir, a rede logo abaixo diz isso em vez de
      // acusar o ramo.
      photoUrls: ["/uploads/.gitkeep"],
      falDiario: diario as never,
    });
  } catch (err) {
    erro = String(err);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  return { alcancouPipeline, erro };
}

export async function checkFalGenerationPathPolicy(): Promise<FalGenerationPathCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // -------------------------------------------------------------------------
  // G-a: a ORDEM no handler de criação — porteiro antes do débito.
  // -------------------------------------------------------------------------
  const rota = lerDaRaiz(ROTA_DE_VIDEOS);
  // ÂNCORAS INTRÍNSECAS ao que se mede: a assinatura do handler de criação e a
  // chamada que gera. Nunca um wrapper de layout — recorte ancorado em
  // fronteira genérica vaza para o handler vizinho e a guarda acusa o errado.
  const inicio = rota.indexOf('}>("/videos", { preHandler: requireActiveTenant }');
  const fim = rota.indexOf("await generateVideo({", inicio);

  if (inicio < 0 || fim < 0) {
    failures.push(
      "caminho de geração: não foi possível recortar o handler de criação em " +
        `${ROTA_DE_VIDEOS} pelas âncoras \`"/videos", { preHandler\` e \`await generateVideo({\`. A ` +
        "guarda não pode opinar sobre um trecho que não encontrou, e passar verde aqui seria o pior " +
        "desfecho.",
    );
  } else {
    const trecho = rota.slice(inicio, fim);

    // Rede anti-vazamento: o recorte não pode ter engolido outro handler. Se
    // engoliu, a ordem medida abaixo é a de outra rota.
    for (const vizinha of ['app.get<{ Params', 'app.post<{ Params', "/videos/:id"]) {
      if (trecho.includes(vizinha)) {
        failures.push(
          `caminho de geração: o recorte do handler de criação engoliu \`${vizinha}\` — a âncora ` +
            "vazou para a rota vizinha, e a ordem conferida abaixo seria a do handler errado.",
        );
      }
    }

    const posPorteiro = trecho.indexOf("hasGenerationPath(");
    const posDebito = trecho.indexOf("await debitCredit({");

    if (posPorteiro < 0) {
      failures.push(
        `caminho de geração: o handler de criação em ${ROTA_DE_VIDEOS} não chama ` +
          "`hasGenerationPath` — sem essa recusa, um vendor sem ramo de geração consome crédito e " +
          "deixa uma linha `queued` sem `provider_job_id`, que a recuperação encerra como órfã.",
      );
    } else if (posDebito < 0) {
      failures.push(
        "caminho de geração: o handler de criação não chama `debitCredit` no trecho recortado — a " +
          "âncora do débito mudou, e sem ela a ordem que esta guarda existe para medir não é " +
          "observável.",
      );
    } else if (posPorteiro > posDebito) {
      failures.push(
        "caminho de geração: vendor sem caminho de geração não é recusado antes do débito — o " +
          "porteiro está DEPOIS de `debitCredit`. O crédito é consumido por uma geração que não pode " +
          "acontecer, e a linha `queued` que fica para trás não tem `provider_job_id` para a " +
          "recuperação reconciliar.",
      );
    } else {
      notes.push(
        "    caminho de geração: o porteiro do vendor vem antes do débito no handler de criação " +
          `(porteiro em ${posPorteiro}, débito em ${posDebito} do recorte)`,
      );
    }

    // -----------------------------------------------------------------------
    // G-a2: a validação do LOOK vem antes do débito, e a recusa INTERROMPE o
    // handler — G2, 22/08/2026 (gap dimensionado em Z0.3). Sem o `return`, o
    // 400 seria enviado e a execução continuaria por cima dele até o débito e
    // a chamada ao fornecedor.
    // -----------------------------------------------------------------------
    const posLook = trecho.indexOf("await assertLookUsavel(");
    if (posLook < 0) {
      failures.push(
        `caminho de geração: o handler de criação em ${ROTA_DE_VIDEOS} não chama assertLookUsavel — um ` +
          "avatar_look_id apontando para um traje ainda `processing`, `simulated` em modo live, ou de " +
          "outro avatar chegaria intacto a providerAvatarIdParaGeracao. Gap dimensionado em Z0.3.",
      );
    } else if (posLook > posDebito) {
      failures.push(
        "caminho de geração: a validação do look (assertLookUsavel) está DEPOIS de debitCredit — um " +
          "look inválido só seria recusado depois de já ter cobrado, e a ordem que protege dinheiro é " +
          "validar antes.",
      );
    } else {
      notes.push(
        "    caminho de geração: a validação do look vem antes do débito no handler de criação " +
          `(look em ${posLook}, débito em ${posDebito} do recorte)`,
      );
    }
    if (!trecho.includes("return reply.code(400).send({ error: err.code, message: err.message });")) {
      failures.push(
        "caminho de geração: a recusa de look inválido não interrompe o handler — sem `return` antes do " +
          "`reply.code(400)`, a resposta 400 seria enviada e a execução continuaria por cima dela até o " +
          "débito e a chamada ao fornecedor.",
      );
    }
  }

  // -------------------------------------------------------------------------
  // G-b: publicar antes de autorizar gasto. A corrida que MEDE é a que falha
  // nas duas pontas — ver o cabeçalho.
  // -------------------------------------------------------------------------
  const duasPontas = await correr({ uploadQuebrado: true, teto: 0 });

  if (!duasPontas.passos.includes("UPLOAD")) {
    failures.push(
      "caminho de geração: a autorização de gasto aconteceu ANTES da publicação das entradas — com " +
        "teto zero e storage quebrado, a corrida morreu sem NUNCA ter tentado publicar. Passos: " +
        `${duasPontas.passos.join(" → ") || "(nenhum)"}; erro ${JSON.stringify(duasPontas.erro.slice(0, 140))}. ` +
        "Publicar não custa; autorizar é o freio da etapa paga. Nesta ordem, uma falha de upload " +
        "acontece com a corrida já autorizada em vez de custar zero.",
    );
  } else if (!duasPontas.erro.includes("upload_failed") && !duasPontas.erro.includes('"rosto"')) {
    failures.push(
      "caminho de geração: a autorização de gasto aconteceu ANTES da publicação das entradas — a " +
        `corrida publicou, mas o erro que a encerrou foi ${JSON.stringify(duasPontas.erro.slice(0, 140))}, ` +
        "e não a falha de upload. Com teto zero e storage quebrado, quem tem de reprovar primeiro é " +
        "o upload.",
    );
  }
  if (!duasPontas.passos.includes("fechou:failed:upload_failed")) {
    failures.push(
      "caminho de geração: a etapa de publicação não foi fechada como `failed` com motivo " +
        `\`upload_failed\`. Passos: ${duasPontas.passos.join(" → ") || "(nenhum)"}. Uma etapa que fica ` +
        "aberta é indistinguível de uma corrida que ainda está rodando.",
    );
  }

  // CONTRAPONTO: com o storage de pé e o mesmo teto zero, quem reprova é o
  // teto — e depois de a publicação ter acontecido. Sem isto, uma guarda que
  // reprovasse tudo passaria nos dois casos sem distinguir nada.
  const soTeto = await correr({ teto: 0 });
  if (!soTeto.passos.includes("UPLOAD") || !soTeto.erro.includes("TETO DE GASTO")) {
    failures.push(
      "caminho de geração: com o storage de pé e teto zero, a corrida deveria publicar e SÓ ENTÃO " +
        `ser recusada pelo teto. Passos: ${soTeto.passos.join(" → ") || "(nenhum)"}; erro ` +
        `${JSON.stringify(soTeto.erro.slice(0, 140))}.`,
    );
  }
  if (soTeto.passos.includes("SUBMIT")) {
    failures.push(
      "caminho de geração: uma submissão saiu com o teto em zero — o porteiro do gasto não barrou a " +
        `etapa paga. Passos: ${soTeto.passos.join(" → ")}.`,
    );
  }
  notes.push(
    "    caminho de geração: publicação antes do teto — com storage quebrado a corrida morre em " +
      "upload_failed sem autorizar gasto, e com storage de pé ela publica e só então bate no teto",
  );

  // -------------------------------------------------------------------------
  // G-c: o despacho (execução) e o ternário (forma). Duas metades, mensagens
  // separadas — ver o cabeçalho.
  // -------------------------------------------------------------------------
  const fal = await despachou("fal");
  if (fal.erro.includes("ENOENT")) {
    // Rede: sem o arquivo de prova a corrida morre no `readUpload`, ANTES do
    // pipeline, e a mensagem abaixo culparia o ramo por um defeito que é do
    // ambiente. Dizer "o arquivo sumiu" é a única saída honesta.
    failures.push(
      "caminho de geração: o arquivo de prova `uploads/.gitkeep` não existe, e sem ele a ponte morre " +
        `no \`readUpload\` antes de alcançar o pipeline (${JSON.stringify(fal.erro.slice(0, 120))}). ` +
        "Isto NÃO é defeito do ramo — é o ambiente da guarda. Restaure o arquivo (ele é rastreado " +
        "pelo git: `.gitignore` tem `!uploads/.gitkeep`).",
    );
  } else if (!fal.alcancouPipeline) {
    failures.push(
      "caminho de geração: `generateVideo` com vendor `fal` NÃO alcançou o pipeline — nenhuma etapa " +
        `foi aberta no diário. Erro: ${JSON.stringify(fal.erro.slice(0, 140))}. Sem o ramo, a fal cai ` +
        "no ramo `else` do ternário e vai bater na HeyGen com a chave errada.",
    );
  }

  const did = await despachou("did");
  if (did.alcancouPipeline) {
    failures.push(
      "caminho de geração: `generateVideo` com vendor `did` alcançou o pipeline da fal — o ramo novo " +
        "capturou um vendor que não é dele. O `if` precisa ser exatamente sobre `fal`.",
    );
  }

  const provider = lerDaRaiz(PROVIDER);
  const ocorrenciasDoTernario = provider.split(TERNARIO_CANONICO).length - 1;
  if (ocorrenciasDoTernario !== 1) {
    failures.push(
      "caminho de geração: o ternário did/heygen não está mais inteiro — a linha " +
        `${JSON.stringify(TERNARIO_CANONICO.trim())} aparece ${ocorrenciasDoTernario}x em ${PROVIDER}. ` +
        "O ramo da fal é um `if` de saída antecipada ACIMA dele justamente para que esta linha não " +
        "mude: transformá-la num ternário aninhado tira `heygen` do fim de UM ternário para o fim de " +
        "DOIS, e heygen é o destino de todo tenant que nunca escolheu vendor.",
    );
  }
  if (!provider.includes(RAMO_FAL)) {
    failures.push(
      `caminho de geração: o ramo da fal não está na forma esperada em ${PROVIDER} — esperado ` +
        `${JSON.stringify(RAMO_FAL.trim())}. Um ramo escrito de outro jeito pode estar correto, mas ` +
        "esta guarda deixa de conseguir afirmar que ele não virou braço do ternário.",
    );
  } else {
    notes.push(
      "    caminho de geração: fal alcança o pipeline, did não alcança, e o ternário did/heygen " +
        "continua inteiro (1 ocorrência, com o ramo da fal acima dele)",
    );
  }

  return { failures, notes };
}
