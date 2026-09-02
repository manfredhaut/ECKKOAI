/**
 * A SEGUNDA APROVAÇÃO — o vídeo MUDO. FASE 2 (Modo B), 21/08.
 *
 * Um passo adiante de `checkFalApprovalPolicy.ts` (que cobre a aprovação da
 * IMAGEM composta): depois do BLOCO A ligar o tier, a FASE 2 reusa o mesmo
 * `pararApos` do orquestrador com o valor `"animar"` — a corrida passa a
 * parar de novo, agora com o vídeo ANIMADO e MUDO gravado, esperando um
 * segundo clique antes de narrar + sincronizar (as duas etapas mais caras).
 *
 *  G-A  a mensagem de expiração do vídeo mudo é a do VÍDEO, não a da imagem
 *       — `awaiting_approval_video` não vira órfão (varrido e protegido
 *       pela MESMA condição guarda-chuva que `checkFalApprovalPolicy.ts`
 *       já prova reprovando; ver a nota de escopo abaixo), mas o TEXTO da
 *       expiração é uma invariante SÓ deste estado, e é o que este mutante
 *       mira — ancorado num `if` interno para não colidir com o mutante
 *       irmão, que mira o `if` externo (guarda-chuva) da mesma condição.
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
    guard: "a mensagem de expiração do vídeo mudo é a do vídeo, não a da imagem",
    name: "a expiração do vídeo mudo usa a mensagem da imagem",
    kind: "esperto",
    // ESPERTO: a linha aguardando aprovação de vídeo AINDA expira (o `if`
    // guarda-chuva de checkFalApprovalPolicy.ts, mutante irmão deste arquivo,
    // é quem prova isso) — só o TEXTO muda, para um que fala de "imagem
    // composta" sobre uma linha cujo gasto real é composição + animação.
    //
    // Alvo DIFERENTE do mutante irmão de G-A em checkFalApprovalPolicy.ts —
    // de propósito: os dois compartilhavam o MESMO `find` (a condição
    // guarda-chuva) até esta rodada, e mutar qualquer um dos dois fazia o
    // outro desaparecer do arquivo junto — o `checkMutantRegistryPolicy`
    // (parte do próprio gate) acusava os DOIS como "não casam mais no alvo"
    // na MESMA passada. Ancorar neste `if` interno em vez do `if` externo
    // evita a colisão: mutar esta linha não toca o texto que o outro
    // mutante procura.
    //
    // ⚠️ Comparar `linha.status` contra os dois literais dentro do MESMO
    // narrowing também dispara TS2367 (mesmo gotcha do mutante irmão) — por
    // isso o `replace` remove a COMPARAÇÃO inteira, não troca um literal por
    // outro.
    file: RECUPERACAO,
    find:
      "        const mensagem =\n" +
      "          linha.status === STATUS_AGUARDANDO_APROVACAO_VIDEO\n" +
      "            ? MENSAGEM_APROVACAO_VIDEO_EXPIRADA\n" +
      "            : MENSAGEM_APROVACAO_EXPIRADA;",
    replace: "        const mensagem = MENSAGEM_APROVACAO_EXPIRADA;",
    expect: "a expiração do vídeo mudo usou a mensagem da IMAGEM",
  },
  {
    guard: "pararApos: \"animar\" interrompe a corrida antes de narrar/sincronizar",
    name: "o freio do vídeo mudo desaparece do orquestrador",
    kind: "obvio",
    // ⚠️ `input.pararApos === "sentinela-fora-do-enum"` sozinho dispara
    // TS2367: `pararApos` é tipado `EtapaDoPipeline | undefined`, um union
    // fechado, e o comparador não precisa de narrowing prévio para o `tsc`
    // recusar — a incompatibilidade já está na comparação direta. Mesmo
    // gotcha do `if (false && …)`, `String(...)` evita sem mudar o
    // comportamento em tempo de execução.
    //
    // ÂNCORA — BLOCO FRACOES-1, 28/08: `if (input.pararApos === "animar")`
    // passou a existir em DOIS lugares em `falPipeline.ts` (caminho de UM
    // bloco e caminho de VÁRIOS blocos, dentro de `animarNarrarSincronizar`)
    // — a âncora curta de antes virou substring das duas e ficou ambígua.
    // `ROTEIRO_DA_PROVA` (acima) é curto de propósito e sempre cabe num
    // bloco só, então esta guarda mede o caminho de UM bloco — a âncora
    // agora inclui `bloco.gastoPrevistoUsd`, que só existe nele.
    // ÂNCORA ESTENDIDA de novo — item 8, 29/08: a checagem de formato
    // (`assertAspectRatio`) entrou entre a atribuição de gasto e o `if` de
    // parada, e sem incluí-la a âncora curta voltaria a casar 2x (a mesma
    // ambiguidade de bloco único vs. vários blocos que a extensão do BLOCO
    // FRACOES-1 já corrigia uma vez).
    // ÂNCORA CORRIGIDA — V34, item 3/14 (01/09/2026): `ROTEIRO_DA_PROVA` é
    // curto de propósito e desde o V33 (tomada única) isso o manda por
    // `animarTomadaUnicaComAudioReal`, NUNCA pela função `animarNarrarSincronizar`
    // — a âncora antiga vigiava o `if (input.pararApos === "animar")` do
    // bloco único DENTRO de `animarNarrarSincronizar` (usado só por roteiros
    // >30s sem fracionar, ou Premium), um trecho que este teste específico
    // nunca executa. Guarda INERTE por 2 rodadas sem que ninguém notasse
    // (achado ao investigar por que a passada `--guard` desta rodada não
    // reprovava mesmo com o `if` mutado) — a âncora agora mira o `if` de
    // dentro de `animarTomadaUnicaComAudioReal`, o único que este roteiro
    // curto de fato alcança. `assertAspectRatio(...)` logo acima é único no
    // arquivo por trazer o comentário "MAPEADO — V34, item 14" (o irmão em
    // `animarNarrarSincronizar` não o tem), o que mantém a âncora com
    // exatamente 1 ocorrência.
    file: PIPELINE,
    find:
      '  if (input.aspectRatio && input.verificarAspectRatio !== false) {\n' +
      '    // MAPEADO — V34, item 14: o vídeo MUDO está sempre no formato ENVIADO\n' +
      '    // ao fornecedor (9:16 quando o pedido foi 4:5), nunca no formato final\n' +
      '    // que a pessoa escolheu. `!` seguro: `input.aspectRatio` truthy aqui\n' +
      '    // implica saída truthy de `aspectRatioParaFornecedor`.\n' +
      '    await assertAspectRatio(bloco.videoUrl, aspectRatioParaFornecedor(input.aspectRatio)!);\n' +
      '  }\n' +
      '\n' +
      '  if (input.pararApos === "animar") {',
    replace:
      '  if (input.aspectRatio && input.verificarAspectRatio !== false) {\n' +
      '    // MAPEADO — V34, item 14: o vídeo MUDO está sempre no formato ENVIADO\n' +
      '    // ao fornecedor (9:16 quando o pedido foi 4:5), nunca no formato final\n' +
      '    // que a pessoa escolheu. `!` seguro: `input.aspectRatio` truthy aqui\n' +
      '    // implica saída truthy de `aspectRatioParaFornecedor`.\n' +
      '    await assertAspectRatio(bloco.videoUrl, aspectRatioParaFornecedor(input.aspectRatio)!);\n' +
      '  }\n' +
      '\n' +
      '  if (String(input.pararApos) === "impossivel-pararApos-nenhuma-corrida-tem") {',
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
    // ÂNCORA REGENERADA — V33, item 2 (01/09/2026): a função ganhou o
    // parâmetro `audioPreSintetizado` e passou a montar um `contexto`
    // (`ContextoDaNarracao`) reusado por `sincronizarComAudio`/
    // `narrarSincronizar`, em vez de chamar `narrarSincronizar` inline com
    // os campos soltos. A âncora agora é a chamada final — o mesmo defeito
    // (reanimar em vez de só narrar/sincronizar) continua se aplicando à
    // função inteira, só que no ponto de retorno novo.
    file: PIPELINE,
    find: "  return narrarSincronizar(input, contexto);\n}",
    replace:
      "  return animarNarrarSincronizar(input, {\n" +
      "    imagemUrl: imagemCompostaUrl ?? videoMudoUrl,\n" +
      "    gastoAcumuladoUsd: 0,\n" +
      "    teto: tetoParaTier(input, segundosTotaisDoRoteiro),\n" +
      "    tier: input.tier ?? \"normal\",\n" +
      "    segundosEstimados,\n" +
      "    duracaoEscolhida,\n" +
      "    blocos: [{ texto: input.script, duracaoEscolhida }],\n" +
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
    // ÂNCORA ESTENDIDA — V34, item 1/3: `targetDurationSeconds:` entrou
    // ENTRE `pararApos: "animar",` e o fechamento do objeto.
    file: ROTA_DE_VIDEOS,
    find:
      "                tier: videoTierParaPipeline(video.tier_video),\n" +
      "                // FASE 2 (Modo B) — a corrida para logo depois do vídeo MUDO,\n" +
      "                // e não segue sozinha até narrar/sincronizar. A continuação é\n" +
      "                // um segundo clique humano, em `/approve-video`. Ver o\n" +
      "                // comentário equivalente em `animarNarrarSincronizar`.\n" +
      "                pararApos: \"animar\",\n" +
      "                // V34, item 1/3 (01/09/2026) — relido da LINHA, mesma razão\n" +
      "                // de `tier` acima: é o alvo GRAVADO na criação, não o que o\n" +
      "                // formulário mostra agora. Presente, dispara a comparação\n" +
      "                // alvo×fala ANTES de qualquer `animar()` — ver\n" +
      "                // `compararAlvoComFala`, falPipeline.ts.\n" +
      "                targetDurationSeconds: video.target_duration_seconds,\n" +
      "              },\n" +
      "              imagemAprovada,",
    replace:
      "                tier: videoTierParaPipeline(video.tier_video),\n" +
      "                targetDurationSeconds: video.target_duration_seconds,\n" +
      "              },\n" +
      "              imagemAprovada,",
    expect: "aprovação de vídeo: /approve não passa pararApos: \"animar\" — a corrida completaria sozinha até ready",
  },
  {
    guard: "o campo livre do Refazer (imagem) chega ao UPDATE — migration 061",
    name: "/recompose para de gravar refazer_feedback",
    kind: "obvio",
    file: ROTA_DE_VIDEOS,
    find: "approval_requested_at = now(), refazer_feedback = $6\n             WHERE id = $1 AND tenant_id = $5 AND status = 'awaiting_approval' RETURNING *`,\n          [video.id, imagemAExibir, runId, corrida.requestIds.compor, req.tenantId, refazerFeedback],",
    replace:
      "approval_requested_at = now()\n             WHERE id = $1 AND tenant_id = $5 AND status = 'awaiting_approval' RETURNING *`,\n          [video.id, imagemAExibir, runId, corrida.requestIds.compor, req.tenantId],",
    expect: "/recompose deixou de gravar o campo livre do Refazer",
  },
  {
    guard: "o campo livre do Refazer (vídeo mudo) chega ao UPDATE — migration 061",
    name: "/redo-video para de gravar refazer_feedback",
    kind: "obvio",
    // ÂNCORA ATUALIZADA — V33, item 2 (01/09/2026): o UPDATE ganhou
    // `fal_audio_url = $7` (persiste o áudio da tomada única) na MESMA
    // linha de `refazer_feedback = $6`.
    file: ROTA_DE_VIDEOS,
    find: "approval_requested_at = now(), refazer_feedback = $6, fal_audio_url = $7\n             WHERE id = $1 AND tenant_id = $5 AND status = 'awaiting_approval_video' RETURNING *`,\n          [video.id, videoMudoFinal, runId, corrida.requestIds.animar, req.tenantId, refazerFeedback, corrida.audioUrl],",
    replace:
      "approval_requested_at = now(), fal_audio_url = $7\n             WHERE id = $1 AND tenant_id = $5 AND status = 'awaiting_approval_video' RETURNING *`,\n          [video.id, videoMudoFinal, runId, corrida.requestIds.animar, req.tenantId, refazerFeedback, corrida.audioUrl],",
    expect: "/redo-video deixou de gravar o campo livre do Refazer",
  },
  {
    guard: "o passo Gerar apresenta o VÍDEO MUDO na segunda aprovação, não a imagem",
    name: "a tela de aprovação de vídeo passa a mostrar a imagem composta",
    kind: "esperto",
    // ESPERTO: o bloco `awaiting_approval_video` continua existindo, os
    // botões continuam lá — só a TAG muda de `<video>` (o produto real de
    // `animar()`) para `<img>` apontando pro MESMO campo. O item 2 desta
    // rodada confirmou por leitura que o Modo B apresenta o vídeo animado
    // mudo (falPipeline.ts:1103/1121), não a imagem — essa é a garantia que
    // esta guarda protege.
    file: "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx",
    find:
      "                <video\n" +
      "                  src={video.fal_muted_video_url}\n" +
      "                  controls\n" +
      "                  muted\n",
    replace: "                <img\n                  src={video.fal_muted_video_url}\n",
    expect: "não tem uma tag <video> lendo fal_muted_video_url",
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
  encerrados: { id: string; reason: string; mensagem: string }[];
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
      provider_vendor: "fal",
      idade_ms: Math.floor(idadeAprovacao / 2),
    },
    {
      id: "v-video-aguardando-velho",
      status: STATUS_AGUARDANDO_APROVACAO_VIDEO,
      provider_job_id: "req-do-animar-velho",
      provider_vendor: "fal",
      idade_ms: idadeAprovacao + 60_000,
    },
    {
      id: "v-queued-recente",
      status: "queued",
      provider_job_id: "job-heygen",
      // V28, item 3 — vendor PRÓPRIO: esta linha testa o caminho GENÉRICO de
      // reacompanhamento (heygen/did), não o fluxo de aprovação de vídeo da
      // fal. Com `provider_vendor: "fal"` (o valor das duas linhas acima),
      // `recoverInFlightVideos` despacharia para `reacompanharFal` — que este
      // teste não injeta — e corretamente NÃO chamaria o `reacompanhar`
      // genérico (ver o comentário do tipo `Reacompanhar`, recovery.ts).
      provider_vendor: "heygen",
      idade_ms: Math.floor(idadeRecuperacao / 2),
    },
  ].map((l) => ({
    ...l,
    tenant_id: "t-1",
    publish_platform: "youtube",
    aspect_ratio: "16:9",
    resolution: "720p",
    provider_engine: null,
    duration_seconds: 10,
    simulated: false,
  }));

  const reacompanhados: string[] = [];
  const encerrados: { id: string; reason: string; mensagem: string }[] = [];
  let encontrados = 0;
  try {
    (pool as { query: unknown }).query = (async (texto: unknown, valores?: unknown[]) => {
      const sql = String(texto);
      if (/FROM videos\s+WHERE status = ANY/.test(sql)) return { rows: linhas, rowCount: linhas.length };
      if (/UPDATE videos SET status = 'error'/.test(sql)) {
        const v = valores as unknown[];
        encerrados.push({ id: String(v[0]), mensagem: String(v[1]), reason: String(v[2]) });
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
    async registrarGastoPrevisto() {},
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
  } else if (!encerradoVelho.mensagem.includes("vídeo animado")) {
    // A DISTINÇÃO que este arquivo mede que o irmão (checkFalApprovalPolicy)
    // não mede: NÃO BASTA expirar — a mensagem tem de dizer o que foi
    // gasto. "vídeo animado" só aparece em MENSAGEM_APROVACAO_VIDEO_EXPIRADA;
    // MENSAGEM_APROVACAO_EXPIRADA (a da imagem) fala de "imagem composta".
    failures.push(
      "aprovação de vídeo: a expiração do vídeo mudo usou a mensagem da IMAGEM, não a do vídeo — " +
        `mensagem gravada: ${JSON.stringify(encerradoVelho.mensagem)}. Numa linha em que \`compor\` E ` +
        "`animar` já foram pagos, dizer só \"a imagem composta ficou esperando\" subestima o que a " +
        "pessoa perdeu ao deixar a aprovação expirar.",
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
        promptDeDirecao: "test direction in english",
        diario: diarioEmMemoria(),
        tetoDeGastoUsd: 99,
        pollTimeoutMs: 50,
        pollIntervalMs: 1,
        pararApos: "animar",
        // V34, item 5 — se o freio acima falhar (é exatamente o que este
        // G-B testa), a corrida alcançaria sincronizarComAudio, que
        // rodaria `ffmpeg` de VERDADE contra a URL fake abaixo. Mesmo
        // padrão de `apararSobraFinal: false` nas guardas irmãs.
        apararSobraFinal: false,
        // 02/09/2026 — mesma razão acima: a guarda de folga de
        // sincronização também roda `ffprobe` de VERDADE.
        verificarFolgaSincronizar: false,
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
        promptDeDirecao: "test direction in english",
        diario: diarioEmMemoria(),
        tetoDeGastoUsd: 99,
        pollTimeoutMs: 50,
        pollIntervalMs: 1,
        // V34, item 5 — esta corrida completa até sincronizar (sem
        // `pararApos`), e `apararVideoFinal` (ffmpeg.ts) rodaria `ffmpeg`
        // de VERDADE contra a URL fake abaixo. Mesmo padrão de
        // `verificarAspectRatio: false` noutras guardas.
        apararSobraFinal: false,
        // 02/09/2026 — mesma razão acima: a guarda de folga de
        // sincronização também roda `ffprobe` de VERDADE.
        verificarFolgaSincronizar: false,
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

  // -------------------------------------------------------------------------
  // G-E — o campo livre do "Refazer" (migration 061) chega ao UPDATE, nos
  // DOIS handlers — recortados por nome de rota, mesma técnica de G-D.
  // -------------------------------------------------------------------------
  const inicioRecompose = rota.indexOf('"/videos/:id/recompose",');
  const fimRecompose = rota.indexOf('"/videos/:id/approve-video",', inicioRecompose);
  if (inicioRecompose < 0 || fimRecompose < 0) {
    failures.push(
      `refazer_feedback: não foi possível recortar o handler /recompose em ${ROTA_DE_VIDEOS} pelas âncoras ` +
        '`"/videos/:id/recompose",` e `"/videos/:id/approve-video",`.',
    );
  } else if (!rota.slice(inicioRecompose, fimRecompose).includes("refazer_feedback = $6")) {
    failures.push(
      "refazer_feedback: /recompose deixou de gravar o campo livre do Refazer — o texto que a pessoa " +
        "digitou na tela de aprovação da imagem é capturado e perdido, sem erro nenhum avisando.",
    );
  } else {
    notes.push("    refazer_feedback: /recompose grava o campo livre do Refazer (imagem)");
  }

  const inicioRedoVideo = rota.indexOf('"/videos/:id/redo-video",');
  if (inicioRedoVideo < 0) {
    failures.push(
      `refazer_feedback: não achei o handler /redo-video em ${ROTA_DE_VIDEOS} pela âncora ` +
        '`"/videos/:id/redo-video",`.',
    );
  } else if (!rota.slice(inicioRedoVideo).includes("refazer_feedback = $6")) {
    failures.push(
      "refazer_feedback: /redo-video deixou de gravar o campo livre do Refazer — o texto que a pessoa " +
        "digitou na tela de aprovação do vídeo mudo é capturado e perdido, sem erro nenhum avisando.",
    );
  } else {
    notes.push("    refazer_feedback: /redo-video grava o campo livre do Refazer (vídeo mudo)");
  }

  // -------------------------------------------------------------------------
  // G-F — a tela apresenta o VÍDEO (não a imagem) na segunda aprovação, e o
  // rótulo do status não regride para a chave crua.
  // -------------------------------------------------------------------------
  const GENERATE_STEP = "frontend/src/pages/CreateVideo/steps/GenerateStep.tsx";
  const tela = lerDaRaiz(GENERATE_STEP);
  const inicioBlocoVideo = tela.indexOf('video.status === "awaiting_approval_video"');
  const fimBlocoVideo = tela.indexOf('video.status === "ready"', inicioBlocoVideo);
  if (inicioBlocoVideo < 0 || fimBlocoVideo < 0) {
    failures.push(
      `aprovação de vídeo: não foi possível recortar o bloco de awaiting_approval_video em ${GENERATE_STEP}.`,
    );
  } else {
    const blocoVideo = tela.slice(inicioBlocoVideo, fimBlocoVideo);
    if (!/<video\b[\s\S]*?src=\{video\.fal_muted_video_url\}/.test(blocoVideo)) {
      failures.push(
        "aprovação de vídeo: o bloco de awaiting_approval_video não tem uma tag <video> lendo " +
          "fal_muted_video_url — a tela pararia de apresentar o vídeo mudo de verdade.",
      );
    } else {
      notes.push("    aprovação de vídeo: o passo Gerar apresenta o <video> de fal_muted_video_url na segunda aprovação");
    }
  }

  const PT_BR = "frontend/src/locales/pt-BR.json";
  const ptBr = lerDaRaiz(PT_BR);
  if (!ptBr.includes('"awaiting_approval_video"')) {
    failures.push(
      `aprovação de vídeo: ${PT_BR} não tem a chave common.status.awaiting_approval_video — a pastilha de ` +
        "status voltaria a mostrar a chave de tradução crua na tela, em vez de um rótulo lido.",
    );
  } else {
    notes.push("    aprovação de vídeo: common.status.awaiting_approval_video existe em pt-BR.json");
  }

  return { failures, notes };
}
