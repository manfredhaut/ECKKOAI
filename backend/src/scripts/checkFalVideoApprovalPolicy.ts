/**
 * A SEGUNDA APROVAÇÃO — o vídeo MUDO. FASE 2 (Modo B), 21/08.
 *
 * Um passo adiante de `checkFalApprovalPolicy.ts` (que cobre a aprovação da
 * IMAGEM composta): depois do BLOCO A ligar o tier, a FASE 2 reusa o mesmo
 * `pararApos` do orquestrador com o valor `"animar"` — a corrida passa a
 * parar de novo, agora com o vídeo ANIMADO e MUDO gravado, esperando um
 * segundo clique antes de narrar + sincronizar (as duas etapas mais caras).
 *
 *  G-A  vídeo em `awaiting_approval_video` não é tratado como órfão pelo
 *       recovery — mesma invariante de G-A em `checkFalApprovalPolicy.ts`,
 *       um estado adiante.
 *  G-B  `pararApos: "animar"` interrompe a corrida DE VERDADE: narrar
 *       (ElevenLabs) e sincronizar (`fal-ai/sync-lipsync/v2`) não são
 *       alcançados, e o resultado devolve o vídeo MUDO, não o final.
 *  G-C  `runFalPipelineDoVideoMudo` retoma de um vídeo mudo JÁ CONHECIDO sem
 *       chamar `animar` de novo — o Wan/Seedance não é re-submetido.
 *  G-D  `/approve` passa `pararApos: "animar"` ao chamar
 *       `runFalPipelineDaImagem` — sem isso a corrida completaria sozinha
 *       até `ready`, e a segunda aprovação nunca apareceria.
 *
 * ┌─ G-A, G-B e G-C medem por EXECUÇÃO, mesma razão de `checkFalApprovalPolicy` ┐
 * │ G-A roda `recoverInFlightVideos` com `pool.query` substituído. G-B e G-C   │
 * │ rodam o orquestrador REAL (`runFalPipelineDaImagem`/                       │
 * │ `runFalPipelineDoVideoMudo`) com `globalThis.fetch` substituído — o sinal  │
 * │ é o CONJUNTO de endpoints submetidos, não o texto do arquivo.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ G-D mede FORMA, pela mesma limitação de G-D/G-E em checkFalApprovalPolicy ┐
 * │ `pararApos: "animar"` é um campo literal dentro de um objeto inline no     │
 * │ handler `/approve` — sem função importável, o que se pode medir por        │
 * │ execução isolada é o orquestrador (G-B acima), não a ROTA decidindo        │
 * │ chamá-lo assim. A guarda lê o arquivo real e confere que o token está      │
 * │ presente dentro do recorte do handler certo — não um comentário, não um    │
 * │ nome de variável.                                                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Custo: ZERO ───────────────────────────────────────────────────────────┐
 * │ Nenhuma rede (o `fetch` é substituído), nenhum banco (o `pool.query` é   │
 * │ substituído e o diário é um array), nenhuma espera real. G-D só lê       │
 * │ arquivo do disco.                                                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import {
  ENDPOINT_ANIMAR,
  ENDPOINT_COMPOR,
  ENDPOINT_SINCRONIZAR,
  runFalPipelineDaImagem,
  runFalPipelineDoVideoMudo,
  type DiarioDoPipeline,
} from "../services/video/falPipeline.js";
import {
  recoverInFlightVideos,
  videoRecoveryMaxAgeMs,
  videoApprovalMaxAgeMs,
  STATUS_AGUARDANDO_APROVACAO_VIDEO,
} from "../services/video/recovery.js";

const RECUPERACAO = "backend/src/services/video/recovery.ts";
const PIPELINE = "backend/src/services/video/falPipeline.ts";
const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "vídeo em awaiting_approval_video não é tratado como órfão pelo recovery",
    name: "a exceção da aprovação de vídeo some da varredura",
    kind: "obvio",
    // Mesma forma do mutante equivalente em checkFalApprovalPolicy.ts: o `if`
    // continua no arquivo e o `tsc` continua verde — só a condição deixa de
    // casar `awaiting_approval_video`. NÃO usar `if (false && …)` — mesmo
    // gotcha já registrado (o TypeScript marca o corpo inalcançável e o gate
    // sai 2 pelo `tsc`, AMBÍGUO com a guarda saudável).
    file: RECUPERACAO,
    find:
      "      if (linha.status === STATUS_AGUARDANDO_APROVACAO || linha.status === STATUS_AGUARDANDO_APROVACAO_VIDEO) {",
    replace: '      if (linha.status === STATUS_AGUARDANDO_APROVACAO) {',
    expect: "vídeo aguardando aprovação de vídeo foi tratado como registro preso",
  },
  {
    guard: "pararApos: \"animar\" interrompe a corrida antes de narrar/sincronizar",
    name: "o freio do vídeo mudo desaparece do orquestrador",
    kind: "obvio",
    file: PIPELINE,
    find: '  if (input.pararApos === "animar") {',
    replace: '  if (input.pararApos === "impossivel-pararApos-nenhuma-corrida-tem") {',
    expect: "a corrida não parou em animar — sincronizar foi alcançado",
  },
  {
    guard: "runFalPipelineDoVideoMudo retoma sem chamar animar de novo",
    name: "a retomada do vídeo mudo reanima em vez de só narrar/sincronizar",
    kind: "esperto",
    // ESPERTO: nada no tipo de retorno muda (ainda é FalPipelineResult), o
    // `tsc` segue verde, e o caminho feliz ainda produz um `videoUrl` no
    // fim — só que pagando o Wan/Seedance de novo (~US$ 0,25 a ~US$ 4,60+)
    // por um vídeo que já existia e já tinha sido aprovado.
    file: PIPELINE,
    find:
      "  return narrarSincronizar(input, {\n" +
      "    videoMudoUrl,\n" +
      "    imagemCompostaUrl,\n" +
      "    gastoAcumuladoUsd: 0,\n" +
      "    teto: tetoParaTier(input),\n" +
      "    segundosEstimados,\n" +
      "    duracaoEscolhida,\n" +
      "    composicaoRequestId,\n" +
      "    animarRequestId,\n" +
      "  });\n" +
      "}",
    replace:
      "  return animarNarrarSincronizar(input, {\n" +
      "    imagemUrl: imagemCompostaUrl ?? videoMudoUrl,\n" +
      "    gastoAcumuladoUsd: 0,\n" +
      "    teto: tetoParaTier(input),\n" +
      "    tier: input.tier ?? \"normal\",\n" +
      "    segundosEstimados,\n" +
      "    duracaoEscolhida,\n" +
      "    composicaoRequestId,\n" +
      "  });\n" +
      "}",
    expect: "a retomada do vídeo mudo re-submeteu o motor de animação",
  },
  {
    guard: "/approve passa pararApos: \"animar\" a runFalPipelineDaImagem",
    name: "o pararApos some do call site de /approve",
    kind: "esperto",
    // ESPERTO: sem esta linha, `runFalPipelineDaImagem` continua sendo
    // chamada exatamente igual — só que a corrida completa sozinha até
    // `ready`, sem nunca oferecer a segunda aprovação. Nada na assinatura da
    // função muda: `pararApos` é opcional no tipo.
    file: ROTA_DE_VIDEOS,
    find:
      "                tier: videoTierParaPipeline(video.tier_video),\n" +
      "                // FASE 2 (Modo B) — a corrida para logo depois do vídeo MUDO,\n" +
      "                // e não segue sozinha até narrar/sincronizar. A continuação é\n" +
      "                // um segundo clique humano, em `/approve-video`. Ver o\n" +
      "                // comentário equivalente em `animarNarrarSincronizar`.\n" +
      "                pararApos: \"animar\",\n" +
      "              },\n" +
      "              imagemAprovada,",
    replace:
      "                tier: videoTierParaPipeline(video.tier_video),\n" +
      "              },\n" +
      "              imagemAprovada,",
    expect: "aprovação de vídeo: /approve não passa pararApos: \"animar\" — a corrida completaria sozinha até ready",
  },
];

export interface FalVideoApprovalCheckResult {
  failures: string[];
  notes: string[];
}

const ROTEIRO_DA_PROVA = "Roteiro da prova, curto o bastante para caber no teto.";

// ---------------------------------------------------------------------------
// G-A: a varredura, com o banco substituído
// ---------------------------------------------------------------------------

interface Varredura {
  reacompanhados: string[];
  encerrados: { id: string; reason: string }[];
  encontrados: number;
}

/**
 * Mesma forma de `varrer()` em `checkFalApprovalPolicy.ts`, com uma linha em
 * `awaiting_approval_video` no lugar de `awaiting_approval` — RECENTE (não
 * pode ser tocada) e VELHA (tem de expirar sem estorno). O controle
 * (`queued` recente) é o mesmo, para não duplicar a prova de que a exceção
 * não vaza para os estados que ela não deve tocar.
 */
async function varrer(): Promise<Varredura> {
  const queryOriginal = pool.query.bind(pool);
  const idadeAprovacao = videoApprovalMaxAgeMs();
  const idadeRecuperacao = videoRecoveryMaxAgeMs();

  const linhas = [
    {
      id: "v-video-aguardando-recente",
      status: STATUS_AGUARDANDO_APROVACAO_VIDEO,
      // COM job id: o `request_id` de `animar`, que `/approve` grava ao
      // transicionar para este estado. É o que torna esta linha perigosa
      // sem a exceção — sem ela cai no ramo de REACOMPANHAR.
      provider_job_id: "req-do-animar",
      idade_ms: Math.floor(idadeAprovacao / 2),
    },
    {
      id: "v-video-aguardando-velho",
      status: STATUS_AGUARDANDO_APROVACAO_VIDEO,
      provider_job_id: "req-do-animar-velho",
      idade_ms: idadeAprovacao + 60_000,
    },
    {
      id: "v-queued-recente",
      status: "queued",
      provider_job_id: "job-heygen",
      idade_ms: Math.floor(idadeRecuperacao / 2),
    },
  ].map((l) => ({
    ...l,
    tenant_id: "t-1",
    provider_vendor: "fal",
    publish_platform: "youtube",
    aspect_ratio: "16:9",
    resolution: "720p",
    provider_engine: null,
    duration_seconds: 10,
    simulated: false,
  }));

  const reacompanhados: string[] = [];
  const encerrados: { id: string; reason: string }[] = [];
  let encontrados = 0;
  try {
    (pool as { query: unknown }).query = (async (texto: unknown, valores?: unknown[]) => {
      const sql = String(texto);
      if (/FROM videos\s+WHERE status = ANY/.test(sql)) return { rows: linhas, rowCount: linhas.length };
      if (/UPDATE videos SET status = 'error'/.test(sql)) {
        const v = valores as unknown[];
        encerrados.push({ id: String(v[0]), reason: String(v[2]) });
        return { rows: [], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    }) as typeof pool.query;

    const r = await recoverInFlightVideos(async (linha) => {
      reacompanhados.push(linha.id);
    });
    encontrados = r.encontrados;
  } finally {
    (pool as { query: unknown }).query = queryOriginal;
  }

  return { reacompanhados, encerrados, encontrados };
}

// ---------------------------------------------------------------------------
// G-B e G-C: o orquestrador, com a rede substituída
// ---------------------------------------------------------------------------

interface CorridaSimulada {
  submetidos: string[];
  erro: string;
  videoUrl: string;
  videoMudoUrl: string | null;
}

/**
 * Um diário em memória — as três guardas de execução deste arquivo (e as de
 * `checkFalApprovalPolicy.ts`) não precisam de banco, só de um objeto que
 * implemente a interface.
 */
function diarioEmMemoria(): DiarioDoPipeline {
  let contador = 0;
  return {
    async abrirEtapa() {
      contador += 1;
      return `step-${contador}`;
    },
    async gravarRequestId() {},
    async gravarRespostaCrua() {},
    async fecharEtapa() {},
  };
}

/**
 * Roda `chamada` com `globalThis.fetch` substituído por um fornecedor fal +
 * ElevenLabs simulado, e devolve os endpoints SUBMETIDOS à fila, na ordem.
 * Mesmo fornecedor simulado de `refazer()` em `checkFalApprovalPolicy.ts`.
 */
async function comRedeSubstituida(
  chamada: () => Promise<{ videoUrl: string; videoMudoUrl: string | null }>,
): Promise<CorridaSimulada> {
  const fetchOriginal = globalThis.fetch;
  const submetidos: string[] = [];

  globalThis.fetch = (async (entrada: unknown) => {
    const url = String(
      typeof entrada === "string" ? entrada : (entrada as { url?: string })?.url ?? entrada,
    );
    if (url.includes("rest.fal.ai") || url.includes("fal.invalido")) {
      return new Response(
        JSON.stringify({
          file_url: "https://exemplo.fal.invalido/entrada.bin",
          upload_url: "https://exemplo.fal.invalido/put/entrada.bin",
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
      return new Response(JSON.stringify({ status: "COMPLETED" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("/requests/")) {
      return new Response(
        JSON.stringify({
          images: [{ url: "https://exemplo.fal.invalido/imagem.png" }],
          video: { url: "https://exemplo.fal.invalido/video.mp4" },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    const endpoint = url.replace("https://queue.fal.run/", "");
    submetidos.push(endpoint);
    return new Response(
      JSON.stringify({
        request_id: "req-da-prova",
        status_url: `https://queue.fal.run/${endpoint}/requests/req-da-prova/status`,
        response_url: `https://queue.fal.run/${endpoint}/requests/req-da-prova`,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  const modoOriginal = process.env.PROVIDER_MODE;
  let erro = "";
  let videoUrl = "";
  let videoMudoUrl: string | null = null;
  try {
    // `live`: em fixture o `falClient` desvia antes da rede e nenhuma
    // submissão existiria para contar.
    process.env.PROVIDER_MODE = "live";
    const r = await chamada();
    videoUrl = r.videoUrl;
    videoMudoUrl = r.videoMudoUrl;
  } catch (err) {
    erro = String(err);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  return { submetidos, erro, videoUrl, videoMudoUrl };
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export async function checkFalVideoApprovalPolicy(): Promise<FalVideoApprovalCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // -------------------------------------------------------------------------
  // G-A
  // -------------------------------------------------------------------------
  const v = await varrer();

  if (v.encontrados !== 3) {
    failures.push(
      `aprovação de vídeo: a varredura encontrou ${v.encontrados} registros, esperado 3. Se ela deixou ` +
        "de SELECIONAR os `awaiting_approval_video`, a expiração de 24 h nunca acontece — e uma aprovação " +
        "de vídeo abandonada fica na galeria para sempre, com animar já pago.",
    );
  }
  if (v.reacompanhados.includes("v-video-aguardando-recente")) {
    failures.push(
      "aprovação de vídeo: vídeo aguardando aprovação de vídeo foi tratado como registro preso — a " +
        "varredura o REACOMPANHOU. Reacompanhar chama `pollVideoJob`, que despacha por `did ? … : heygen`: " +
        "com vendor `fal` a chave do tenant sairia em claro para `api.heygen.com`. Não há nada a acompanhar " +
        "num vídeo mudo que já terminou e está esperando um clique humano.",
    );
  }
  const encerradoRecente = v.encerrados.find((e) => e.id === "v-video-aguardando-recente");
  if (encerradoRecente) {
    failures.push(
      `aprovação de vídeo: vídeo aguardando aprovação de vídeo foi tratado como registro preso — ` +
        `encerrado como \`${encerradoRecente.reason}\` dentro da janela. \`compor\` e \`animar\` foram ` +
        "PAGOS e o vídeo mudo existe; encerrá-lo joga fora esse gasto e, se o motivo estornar, cria " +
        "crédito do nada.",
    );
  }
  const encerradoVelho = v.encerrados.find((e) => e.id === "v-video-aguardando-velho");
  if (!encerradoVelho || encerradoVelho.reason !== "approval_expired") {
    failures.push(
      "aprovação de vídeo: aprovação de vídeo pendente ALÉM da janela não foi expirada como " +
        `\`approval_expired\` — encerrados: ${JSON.stringify(v.encerrados)}. Ignorar o estado é tão ruim ` +
        "quanto encerrá-lo cedo: sem expiração, `awaiting_approval_video` vira o novo `queued` para sempre.",
    );
  }
  if (!v.reacompanhados.includes("v-queued-recente")) {
    failures.push(
      "aprovação de vídeo: o CONTROLE falhou — um `queued` recente com job id deixou de ser " +
        "reacompanhado. A exceção da aprovação de vídeo vazou para os estados que ela não devia tocar.",
    );
  }
  if (failures.length === 0) {
    notes.push(
      "    aprovação de vídeo: a varredura ignora aprovação de vídeo pendente recente, expira a velha " +
        "como `approval_expired`, e continua reacompanhando `queued`",
    );
  }

  // -------------------------------------------------------------------------
  // G-B — pararApos: "animar" para de verdade
  // -------------------------------------------------------------------------
  const paradaAnimar = await comRedeSubstituida(async () => {
    const r = await runFalPipelineDaImagem(
      {
        apiKeyFal: "chave-irrelevante-fetch-substituido",
        apiKeyElevenLabs: "chave-irrelevante-fetch-substituido",
        voiceId: "0hQuq0q2JEk1SY4lZaM9",
        script: ROTEIRO_DA_PROVA,
        fotoBase: Buffer.alloc(0),
        fotoMimeType: "image/jpeg",
        promptDeComposicao: "traje e cenário da prova",
        tenantId: "tenant-da-prova",
        promptDeDirecao: "direção da prova em inglês",
        diario: diarioEmMemoria(),
        tetoDeGastoUsd: 99,
        pollTimeoutMs: 50,
        pollIntervalMs: 1,
        pararApos: "animar",
      },
      "https://exemplo.fal.invalido/imagem-composta-aprovada.png",
      "req-da-composicao",
    );
    return { videoUrl: r.videoUrl, videoMudoUrl: r.videoMudoUrl };
  });

  if (paradaAnimar.submetidos.includes(ENDPOINT_SINCRONIZAR)) {
    failures.push(
      `aprovação de vídeo: a corrida não parou em animar — sincronizar foi alcançado ` +
        `(\`${ENDPOINT_SINCRONIZAR}\` submetido, endpoints: ${JSON.stringify(paradaAnimar.submetidos)}). ` +
        "`pararApos: \"animar\"` existe para separar a corrida em dois cliques humanos; se ela encadeia, " +
        "narrar e sincronizar (as duas etapas mais caras) rodam sem que ninguém tenha aprovado o vídeo mudo.",
    );
  }
  if (!paradaAnimar.submetidos.includes(ENDPOINT_ANIMAR) || paradaAnimar.videoMudoUrl === null || paradaAnimar.videoUrl !== "") {
    failures.push(
      `aprovação de vídeo: a parada em animar não produziu o resultado esperado — submetidos ` +
        `${JSON.stringify(paradaAnimar.submetidos)}, videoUrl ${JSON.stringify(paradaAnimar.videoUrl)}, ` +
        `videoMudoUrl ${JSON.stringify(paradaAnimar.videoMudoUrl)}, erro ${JSON.stringify(paradaAnimar.erro.slice(0, 140))}. ` +
        "O CONTROLE desta guarda: sem `animar` submetido não há o que aprovar (vacuidade), e sem " +
        "`videoMudoUrl` preenchido com `videoUrl` vazio não dá para distinguir \"parou onde eu pedi\" de " +
        "\"não fez nada\".",
    );
  } else if (!paradaAnimar.submetidos.includes(ENDPOINT_SINCRONIZAR)) {
    notes.push(
      `    aprovação de vídeo: pararApos: "animar" interrompe a corrida — animar (\`${ENDPOINT_ANIMAR}\`) ` +
        "submetido, sincronizar não alcançado, e o resultado devolve o vídeo mudo com videoUrl vazio",
    );
  }

  // -------------------------------------------------------------------------
  // G-C — runFalPipelineDoVideoMudo não reanima
  // -------------------------------------------------------------------------
  const retomadaDoMudo = await comRedeSubstituida(async () => {
    const r = await runFalPipelineDoVideoMudo(
      {
        apiKeyFal: "chave-irrelevante-fetch-substituido",
        apiKeyElevenLabs: "chave-irrelevante-fetch-substituido",
        voiceId: "0hQuq0q2JEk1SY4lZaM9",
        script: ROTEIRO_DA_PROVA,
        fotoBase: Buffer.alloc(0),
        fotoMimeType: "image/jpeg",
        promptDeComposicao: "traje e cenário da prova",
        tenantId: "tenant-da-prova",
        promptDeDirecao: "direção da prova em inglês",
        diario: diarioEmMemoria(),
        tetoDeGastoUsd: 99,
        pollTimeoutMs: 50,
        pollIntervalMs: 1,
      },
      "https://exemplo.fal.invalido/video-mudo-aprovado.mp4",
      "https://exemplo.fal.invalido/imagem-composta-aprovada.png",
      "req-da-composicao",
      "req-do-animar",
    );
    return { videoUrl: r.videoUrl, videoMudoUrl: r.videoMudoUrl };
  });

  if (retomadaDoMudo.submetidos.includes(ENDPOINT_ANIMAR)) {
    failures.push(
      `aprovação de vídeo: a retomada do vídeo mudo re-submeteu o motor de animação ` +
        `(\`${ENDPOINT_ANIMAR}\` em ${JSON.stringify(retomadaDoMudo.submetidos)}). O vídeo mudo já existe e ` +
        "já foi aprovado — reanimar paga o Wan (ou o Seedance) de novo pelo MESMO vídeo que a pessoa " +
        "acabou de olhar, sem nada na tela dizendo isso.",
    );
  }
  if (retomadaDoMudo.submetidos.includes(ENDPOINT_COMPOR)) {
    failures.push(
      `aprovação de vídeo: a retomada do vídeo mudo re-submeteu a composição (\`${ENDPOINT_COMPOR}\` em ` +
        `${JSON.stringify(retomadaDoMudo.submetidos)}). A imagem já existe e já foi paga; recompor pagaria ` +
        "US$ 0,08 de novo por uma etapa que este caminho não deveria refazer.",
    );
  }
  if (!retomadaDoMudo.submetidos.includes(ENDPOINT_SINCRONIZAR) || retomadaDoMudo.videoUrl === "") {
    failures.push(
      `aprovação de vídeo: a retomada do vídeo mudo não completou até sincronizar — submetidos ` +
        `${JSON.stringify(retomadaDoMudo.submetidos)}, videoUrl ${JSON.stringify(retomadaDoMudo.videoUrl)}, ` +
        `erro ${JSON.stringify(retomadaDoMudo.erro.slice(0, 140))}. O CONTROLE desta guarda: sem sincronizar ` +
        "alcançado, a afirmação \"a retomada não reanima\" seria verdade por vacuidade — a corrida não " +
        "teria feito nada.",
    );
  } else {
    notes.push(
      "    aprovação de vídeo: runFalPipelineDoVideoMudo retoma direto para narrar+sincronizar — nem " +
        `\`${ENDPOINT_ANIMAR}\` nem \`${ENDPOINT_COMPOR}\` são re-submetidos`,
    );
  }

  // -------------------------------------------------------------------------
  // G-D — /approve passa pararApos: "animar" (FORM, mesma limitação de G-D/
  // G-E em checkFalApprovalPolicy.ts)
  // -------------------------------------------------------------------------
  const rota = lerDaRaiz(ROTA_DE_VIDEOS);
  const inicioApprove = rota.indexOf('"/videos/:id/approve",');
  const fimApprove = rota.indexOf("const runId = await abrirCorrida({", inicioApprove);

  if (inicioApprove < 0 || fimApprove < 0) {
    failures.push(
      "aprovação de vídeo: não foi possível recortar o handler `/approve` em " +
        `${ROTA_DE_VIDEOS} pelas âncoras \`"/videos/:id/approve",\` e \`const runId = await abrirCorrida({\`. ` +
        "A guarda não pode opinar sobre um trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
    );
  } else {
    // A CHAMADA em si, não o handler inteiro: `pararApos: "animar"` também
    // aparece em `/redo-video`, mais abaixo no arquivo — ancorar só no início
    // do handler correria o risco de casar o texto errado se a ORDEM dos
    // handlers mudar. `imagemAprovada,` fecha o objeto passado a
    // `runFalPipelineDaImagem` neste call site específico.
    const inicioChamada = rota.indexOf("animar: () =>", fimApprove);
    const fimChamada = rota.indexOf("imagemAprovada,", inicioChamada);
    if (inicioChamada < 0 || fimChamada < 0 || inicioChamada > fimApprove + 2000) {
      failures.push(
        "aprovação de vídeo: não foi possível recortar a chamada a `runFalPipelineDaImagem` dentro do " +
          "handler `/approve` pelas âncoras `animar: () =>` e `imagemAprovada,`. A guarda não pode opinar " +
          "sobre um trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
      );
    } else {
      const trecho = rota.slice(inicioChamada, fimChamada);
      if (!trecho.includes('pararApos: "animar",')) {
        failures.push(
          "aprovação de vídeo: /approve não passa pararApos: \"animar\" — a corrida completaria sozinha " +
            "até ready, e a segunda aprovação (o vídeo mudo, antes de narrar+sincronizar) nunca apareceria.",
        );
      } else {
        notes.push(
          '    aprovação de vídeo: /approve passa pararApos: "animar" a runFalPipelineDaImagem — a corrida ' +
            "para no vídeo mudo em vez de completar sozinha",
        );
      }
    }
  }

  return { failures, notes };
}
