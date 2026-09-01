/**
 * Poll timeout deixa de ser erro terminal — V28, itens 3 e 5.
 *
 * ---------------------------------------------------------------------------
 * O DEFEITO QUE ISTO FECHA (item 3)
 *
 * MEDIDO no V27: o vídeo `c8f9ff46` estourou o teto de poll de `animar`
 * (300 s, na época) e foi marcado `status='error'`/`failure_reason=
 * 'vendor_rejected'` — rótulo ERRADO (a fal não rejeitou nada) e TERMINAL
 * (a varredura de boot só olha `queued`/`processing`/`awaiting_approval*`,
 * nunca `error`). O bloco tinha `COMPLETED` na fal minutos depois — MEDIDO
 * por GET gratuito — com um vídeo de 4,97s pronto, nunca buscado.
 *
 * A CORREÇÃO tem três partes, cada uma testada aqui:
 *
 *  (i)   `FalPollTimeoutError` (falPipeline.ts) — classe PRÓPRIA, lançada no
 *        timeout, carregando `requestId`/`statusUrl`/`etapa`. Testado por
 *        EXECUÇÃO: `aguardarConclusao` chamada de verdade, com um teto
 *        curtíssimo e `fetch` sempre respondendo "em andamento" — sem banco,
 *        sem credencial, sem rede real.
 *  (ii)  `/approve` e `/approve-video` (routes/videos.ts) tratam esta classe
 *        ANTES do catch genérico, e NÃO viram `status='error'` — ficam em
 *        `processing` (não-terminal) com `failure_reason='poll_timeout'`
 *        (anotação, não terminal). Testado por LEITURA — a lógica vive
 *        dentro de um handler Fastify, e não há infraestrutura neste
 *        arquivo para subir a aplicação e exercitá-la por execução (mesma
 *        limitação já registrada em G-D/G-E de `checkFalApprovalPolicy.ts`).
 *  (iii) `recovery.ts` despacha `provider_vendor === "fal"` para uma segunda
 *        função INJETADA (`reacompanharFal`), nunca para o `reacompanhar`
 *        genérico — que despacharia por `pollVideoJob`
 *        (`did ? pollDidTalk : pollHeygenVideo`, avatarProvider.ts), sem
 *        ramo para fal, mandando a chave da fal para `api.heygen.com` em
 *        claro. Testado por EXECUÇÃO REAL de `recoverInFlightVideos`, com
 *        os DOIS calhaus substituídos por funções que só anotam quem foi
 *        chamado — o mesmo padrão de `varrer()` em
 *        `checkFalApprovalPolicy.ts`, sem tocar banco nem credencial.
 *  (iv)  Dentro de `reacompanharFal`, o desfecho `completed` GRAVA o
 *        resultado em `fal_pipeline_steps` e NUNCA marca `videos.status =
 *        'error'` — terminar um vídeo cujo resultado acabou de ser
 *        recuperado seria perder a mesma informação que este item existe
 *        para não perder de novo. Testado por LEITURA: `reacompanharFal`
 *        chama credenciais reais (`getCredentialForVendor`,
 *        `resolveTenantAvatarFalKey`) e cache de chave de plataforma — sem
 *        pontos de injeção, exercitá-la por execução exigiria fabricar
 *        estado de banco/cache/criptografia que este arquivo não tem como
 *        garantir sem depender de dados de outro teste (frágil por
 *        construção, não pela falta de esforço) — a mesma limitação de
 *        G-D/G-E. A leitura verifica a FORMA exata do trecho `completed`.
 * ---------------------------------------------------------------------------
 *
 * O DEFEITO QUE ISTO FECHA (item 5)
 *
 * MEDIDO: o vídeo `134bc164` levou um 422 (`file_download_error`) na etapa
 * SINCRONIZAR e NUNCA foi estornado — mesmo a fal nunca tendo aceitado ESSA
 * submissão especificamente. A causa: `/approve-video` decidia o estorno com
 * `video.provider_job_id` (o request_id de ANIMAR, de uma corrida ANTERIOR,
 * sempre presente ali) em vez de perguntar pela etapa que ACABOU de falhar
 * NESTA corrida (`requestIdDaEtapa(runId, "sincronizar")`) — o mesmo padrão
 * que `/approve` já usava corretamente para `animar` (commit `28c749b`,
 * histórico, nunca generalizado para este segundo ponto). Testado por
 * LEITURA: o código-fonte usa `requestIdDaEtapa(runId, "sincronizar")`,
 * nunca `video.provider_job_id`, na chamada de `decidirEEstornar` dentro do
 * catch de `/approve-video`.
 * ---------------------------------------------------------------------------
 *
 * Custo: ZERO. `fetch` substituído na parte (i); `pool.query` substituído na
 * parte (iii); (ii)/(iv)/item 5 são leitura de arquivo.
 */
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Mutant } from "./mutants.js";

const PIPELINE = "backend/src/services/video/falPipeline.ts";
const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";
const RECOVERY = "backend/src/services/video/recovery.ts";

export const MUTANTS: Mutant[] = [
  {
    guard: "poll timeout: FalPollTimeoutError carrega requestId/statusUrl/etapa",
    name: "o timeout volta a lançar FalPipelineError genérica, sem requestId/etapa",
    kind: "obvio",
    // OBVIO, mas sem tocar em narrowing: trocar só o NOME da classe deixaria
    // `requestId`/`statusUrl`/`etapa` como argumentos extras para um
    // construtor que só aceita `message` — erro de TIPO, não de
    // comportamento (`tsc` reprovaria, AMBÍGUO, não reprovação limpa). O
    // mutante troca a classe E remove os três argumentos extras junto —
    // continua sendo "obvio" (a informação de recuperação desaparece por
    // inteiro), só que de um jeito que ainda compila.
    file: PIPELINE,
    find:
      "      throw new FalPollTimeoutError(\n" +
      "        `fal: o teto de ${opcoes.timeoutMs} ms de espera se esgotou em ${statusUrl} depois de ` +\n" +
      "          `${tentativas} leitura(s) de status. O trabalho NÃO foi perdido e NÃO deve ser refeito: ` +\n" +
      "          `ele já foi aceito e já custa, e o request_id ${requestId} está gravado — a recuperação é ` +\n" +
      '          "por ele. Repetir a etapa paga duas vezes pelo mesmo resultado.",\n' +
      "        requestId,\n" +
      "        statusUrl,\n" +
      "        etapa,\n" +
      "      );",
    replace:
      "      throw new FalPipelineError(\n" +
      "        `fal: o teto de ${opcoes.timeoutMs} ms de espera se esgotou em ${statusUrl} depois de ` +\n" +
      "          `${tentativas} leitura(s) de status. O trabalho NÃO foi perdido e NÃO deve ser refeito: ` +\n" +
      "          `ele já foi aceito e já custa, e o request_id ${requestId} está gravado — a recuperação é ` +\n" +
      '          "por ele. Repetir a etapa paga duas vezes pelo mesmo resultado.",\n' +
      "      );",
    expect: "poll timeout: lançou FalPipelineError",
  },
  {
    guard: "/approve-video: o estorno pergunta pela etapa que falhou NESTA corrida, não por animar de uma corrida anterior",
    name: "o estorno de /approve-video volta a usar video.provider_job_id",
    kind: "esperto",
    // ESPERTO: `decidirEEstornar` continua sendo chamada, com `reason`
    // idêntico — só a ORIGEM do `providerJobId` regride para o request_id
    // ERRADO (o de `animar`, sempre presente, sempre "indeterminado" —
    // nunca estorna nem quando a etapa que falhou de verdade nunca foi
    // aceita). É o mutante que reproduziria o bug do vídeo `134bc164`.
    file: ROTA_DE_VIDEOS,
    find:
      '        const sincronizarRequestId = await requestIdDaEtapa(runId, "sincronizar");\n' +
      "        const estornado = await decidirEEstornar({\n" +
      "          videoId: video.id,\n" +
      "          tenantId: req.tenantId,\n" +
      '          reason: "vendor_rejected",\n' +
      "          providerJobId: sincronizarRequestId,\n" +
      "        });",
    replace:
      "        const estornado = await decidirEEstornar({\n" +
      "          videoId: video.id,\n" +
      "          tenantId: req.tenantId,\n" +
      '          reason: "vendor_rejected",\n' +
      "          providerJobId: video.provider_job_id,\n" +
      "        });",
    expect: 'identidade-do-estorno: /approve-video não pergunta por requestIdDaEtapa(runId, "sincronizar")',
  },
  {
    guard: "/approve não vira status='error' quando o poll estoura com o trabalho já aceito",
    name: "o retorno 202 recuperável de /approve desaparece, cai para o catch genérico",
    kind: "esperto",
    // ESPERTO: a condição `if (err instanceof FalPollTimeoutError)` e o
    // `pool.query`/`logEvent` que gravam `poll_timeout` continuam intactos
    // — narrowing de `err` preservado, `tsc` não se importa. O que
    // desaparece é o `return` que IMPEDE a execução de continuar para
    // `fecharCorrida`/`status='error'` logo abaixo: sem ele, o mesmo erro é
    // classificado das DUAS formas em sequência — primeiro corretamente
    // como recuperável, depois, silenciosamente, como rejeição terminal.
    file: ROTA_DE_VIDEOS,
    find:
      "          return reply.code(202).send({\n" +
      '            status: "processing",\n' +
      "            message:\n" +
      '              "O serviço de vídeo aceitou o trabalho e ainda está processando — mais tempo do que o " +\n' +
      '              "esperado, mas nada foi perdido. O sistema vai verificar o resultado automaticamente. Nada " +\n' +
      '              "foi cobrado a mais e nada precisa ser refeito.",\n' +
      "          });\n" +
      "        }\n" +
      '        await fecharCorrida(runId, "failed", err instanceof Error ? err.message : String(err));\n' +
      '        const { failure, message } = toClientVendorError("avatar", "videos.approve", err);',
    replace:
      "          // mutante: o retorno 202 recuperável foi removido — cai para o catch genérico abaixo.\n" +
      "        }\n" +
      '        await fecharCorrida(runId, "failed", err instanceof Error ? err.message : String(err));\n' +
      '        const { failure, message } = toClientVendorError("avatar", "videos.approve", err);',
    expect: "resposta(s) 202 recuperável aparecem em routes/videos.ts",
  },
  {
    guard: "recovery: vídeo fal em queued/processing só chega à função INJETADA para fal, nunca à genérica (heygen/did)",
    name: "recovery volta a chamar o reacompanhar genérico para vendor fal",
    kind: "esperto",
    // ESPERTO: comparação de string comum (sem narrowing de union), o `tsc`
    // não se importa — só o VALOR comparado deixa de casar com "fal", e
    // toda linha fal passa a cair no `reacompanhar` genérico logo abaixo,
    // que despacharia por `pollVideoJob` sem ramo para fal e vazaria a
    // chave errada para `api.heygen.com`.
    file: RECOVERY,
    find: '      if (linha.provider_vendor === "fal") {',
    replace: '      if (linha.provider_vendor === "vendor-que-nenhuma-linha-tem") {',
    expect: "foi despachado para o `reacompanhar` GENÉRICO (heygen/did)",
  },
  {
    guard: "reacompanharFal: o desfecho 'completed' grava o resultado e NUNCA marca o vídeo como 'error'",
    name: "reacompanharFal marca o vídeo como error mesmo tendo recuperado o resultado",
    kind: "esperto",
    // ESPERTO: o resultado É gravado corretamente em fal_pipeline_steps (a
    // linha nova não remove isso) — só que, por um erro de cópia da lógica
    // do ramo `failed` logo acima, o vídeo TAMBÉM é marcado como 'error'.
    // O sintoma: o resultado que este item existe para não perder mais fica
    // salvo no banco, mas invisível — a galeria mostra erro, e o operador
    // nunca sabe que há um vídeo pronto esperando ali.
    file: ROTA_DE_VIDEOS,
    find: '  logEvent("info", "fal_recovery_resultado_recuperado", {',
    replace:
      "  await pool.query(\"UPDATE videos SET status = 'error' WHERE id = $1\", [linha.id]);\n" +
      '  logEvent("info", "fal_recovery_resultado_recuperado", {',
    expect: "reacompanharFal: o ramo 'completed' marca o vídeo como 'error'",
  },
];

export interface FalPollRecoveryCheckResult {
  failures: string[];
  notes: string[];
}

function lerDaRaiz(relativo: string): string {
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

/**
 * O laço de polling lança a classe certa, com os campos certos — por
 * EXECUÇÃO real de `aguardarConclusao`, `fetch` substituído para nunca
 * concluir, teto curtíssimo (15 ms) para o teste não esperar de verdade.
 * Sem banco, sem credencial: `aguardarConclusao` só fala com `falPoll`
 * (fetch puro).
 */
async function testeTimeoutLancaClasseCerta(): Promise<string | null> {
  const fetchOriginal = globalThis.fetch;
  const modoOriginal = process.env.PROVIDER_MODE;
  try {
    process.env.PROVIDER_MODE = "live"; // falPoll despacha por rede só fora de fixture
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ status: "IN_PROGRESS" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;

    const { aguardarConclusao, FalPollTimeoutError } = await import("../services/video/falPipeline.js");
    try {
      await aguardarConclusao(
        "chave-da-prova",
        "https://queue.fal.run/wan/v2.6/requests/req-da-prova/status",
        "req-da-prova",
        { timeoutMs: 15, intervalMs: 5, esperar: async () => {} },
        "animar",
      );
      return "poll timeout: lançou FalPipelineError — aguardarConclusao devolveu sem lançar nada, esperado FalPollTimeoutError";
    } catch (err) {
      if (!(err instanceof FalPollTimeoutError)) {
        return `poll timeout: lançou FalPipelineError — a classe foi ${err instanceof Error ? err.constructor.name : typeof err}, esperado FalPollTimeoutError`;
      }
      if (err.requestId !== "req-da-prova" || err.etapa !== "animar") {
        return `poll timeout: FalPollTimeoutError com campos errados — requestId=${JSON.stringify((err as { requestId?: unknown }).requestId)} etapa=${JSON.stringify((err as { etapa?: unknown }).etapa)}`;
      }
      return null;
    }
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }
}

/**
 * O despacho por vendor de `recoverInFlightVideos`, por EXECUÇÃO real, com
 * `pool.query` substituído e os DOIS calhaus (`reacompanhar`,
 * `reacompanharFal`) substituídos por funções que só anotam quem foi
 * chamado — o mesmo padrão de `varrer()` em `checkFalApprovalPolicy.ts`.
 * Nenhuma credencial, nenhuma chave, nenhuma rede: o despacho é decidido
 * inteiramente por `linha.provider_vendor`, antes de qualquer um dos dois
 * calhaus ser invocado.
 */
async function testeDespachoPorVendor(): Promise<string[]> {
  const falhas: string[] = [];
  const { pool } = await import("../db/pool.js");
  const { recoverInFlightVideos } = await import("../services/video/recovery.js");
  const queryOriginal = pool.query.bind(pool);

  const linhas = [
    {
      id: "v-fal-processing",
      status: "processing",
      provider_job_id: "req-fal-preso",
      provider_vendor: "fal",
      tenant_id: "t-1",
      publish_platform: "youtube",
      aspect_ratio: "16:9",
      resolution: "720p",
      provider_engine: null,
      duration_seconds: 10,
      simulated: false,
    },
    {
      id: "v-heygen-queued",
      status: "queued",
      provider_job_id: "job-heygen-controle",
      provider_vendor: "heygen",
      tenant_id: "t-1",
      publish_platform: "youtube",
      aspect_ratio: "16:9",
      resolution: "720p",
      provider_engine: null,
      duration_seconds: 10,
      simulated: false,
    },
  ];

  const chamadoGenerico: string[] = [];
  const chamadoFal: string[] = [];

  try {
    (pool as { query: unknown }).query = (async (texto: unknown) => {
      const sql = String(texto);
      if (/FROM videos\s+WHERE status = ANY/.test(sql)) return { rows: linhas, rowCount: linhas.length };
      return { rows: [], rowCount: 0 };
    }) as typeof pool.query;

    await recoverInFlightVideos(
      async (linha) => {
        chamadoGenerico.push(linha.id);
      },
      async (linha) => {
        chamadoFal.push(linha.id);
      },
    );
  } finally {
    (pool as { query: unknown }).query = queryOriginal;
  }

  if (!chamadoFal.includes("v-fal-processing")) {
    falhas.push(
      "recovery: um vídeo `provider_vendor: 'fal'` em `processing` NÃO foi despachado para a função " +
        `injetada de fal — chamados na fal: ${JSON.stringify(chamadoFal)}. Sem este despacho, o item 3 ` +
        "não tem efeito nenhum: o resultado já pago nunca é buscado de volta.",
    );
  }
  if (chamadoGenerico.includes("v-fal-processing")) {
    falhas.push(
      "recovery: um vídeo `provider_vendor: 'fal'` em `processing` foi despachado para o `reacompanhar` " +
        `GENÉRICO (heygen/did) — chamados no genérico: ${JSON.stringify(chamadoGenerico)}. O genérico despacha ` +
        "por `pollVideoJob`, sem ramo para fal, e vazaria a chave da fal para api.heygen.com em claro.",
    );
  }
  if (!chamadoGenerico.includes("v-heygen-queued")) {
    falhas.push(
      "recovery: o CONTROLE falhou — um vídeo `provider_vendor: 'heygen'` em `queued` não foi despachado " +
        `para o \`reacompanhar\` genérico — chamados no genérico: ${JSON.stringify(chamadoGenerico)}. Sem este ` +
        "controle, uma guarda que sempre chamasse só a função de fal (ou nenhuma das duas) passaria verde.",
    );
  }
  if (chamadoFal.includes("v-heygen-queued")) {
    falhas.push(
      "recovery: um vídeo `provider_vendor: 'heygen'` foi despachado para a função de fal — o despacho não " +
        "está olhando o vendor, está mandando tudo para o mesmo lugar.",
    );
  }

  return falhas;
}

export async function checkFalPollRecoveryPolicy(): Promise<FalPollRecoveryCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  const erroTimeout = await testeTimeoutLancaClasseCerta();
  if (erroTimeout) failures.push(erroTimeout);
  else notes.push("    poll timeout: aguardarConclusao lança FalPollTimeoutError com requestId/etapa corretos");

  const falhasDespacho = await testeDespachoPorVendor();
  failures.push(...falhasDespacho);
  if (falhasDespacho.length === 0) {
    notes.push(
      "    recovery: um vídeo fal em processing/queued só chega à função injetada para fal; um vídeo " +
        "heygen/did continua indo para a genérica — medido por execução real, pool.query substituído",
    );
  }

  // --- LEITURA: /approve e /approve-video tratam FalPollTimeoutError ANTES
  // do catch genérico, com o retorno 202 recuperável presente nos dois. ------
  const rota = lerDaRaiz(ROTA_DE_VIDEOS);
  const ocorrenciasDoTratamento = (rota.match(/if \(err instanceof FalPollTimeoutError\) \{/g) ?? []).length;
  if (ocorrenciasDoTratamento < 2) {
    failures.push(
      `poll timeout: só ${ocorrenciasDoTratamento} catch(es) de routes/videos.ts tratam FalPollTimeoutError ` +
        "separado do genérico — esperava pelo menos 2 (/approve e /approve-video). Um catch sem este " +
        "tratamento marca 'error' terminal mesmo quando a fal aceitou o trabalho.",
    );
  }
  const ocorrenciasDoRetorno202 = (
    rota.match(/O serviço de vídeo aceitou o trabalho e ainda está processando/g) ?? []
  ).length;
  if (ocorrenciasDoRetorno202 < 2) {
    failures.push(
      `poll timeout: só ${ocorrenciasDoRetorno202} resposta(s) 202 recuperável aparecem em routes/videos.ts ` +
        "— esperava pelo menos 2. A condição `err instanceof FalPollTimeoutError` pode continuar no arquivo " +
        "sem mais IMPEDIR a execução de cair no catch genérico logo abaixo, que marca 'error' terminal.",
    );
  }
  if (!/const sincronizarRequestId = await requestIdDaEtapa\(runId, "sincronizar"\);/.test(rota)) {
    failures.push(
      "identidade-do-estorno: /approve-video não pergunta por requestIdDaEtapa(runId, \"sincronizar\") — " +
        "o estorno voltaria a decidir com o request_id de `animar` (sempre presente, sempre " +
        "'indeterminado'), o mesmo bug MEDIDO no vídeo `134bc164`.",
    );
  }

  // --- LEITURA: recovery.ts despacha fal para a função injetada, nunca para
  // o genérico (belt-and-suspenders com o teste de execução acima). ---------
  const recoveryFonte = lerDaRaiz(RECOVERY);
  if (!/if \(linha\.provider_vendor === "fal"\) \{/.test(recoveryFonte)) {
    failures.push(
      "recovery: não há condição `provider_vendor === \"fal\"` no laço — um vídeo fal em " +
        "queued/processing cairia no `reacompanhar` genérico (heygen/did), que despacha por " +
        "`pollVideoJob` sem ramo para fal e vazaria a chave da fal para api.heygen.com.",
    );
  }

  // --- LEITURA: reacompanharFal — o desfecho 'completed' nunca marca o vídeo
  // como 'error'. Recortado entre o comentário do ramo completed e o início
  // da próxima função do arquivo (leBackground), fronteira única e estável.
  const inicioCompleted = rota.indexOf('// status === "completed" — o achado do V27');
  const fimReacompanharFal = rota.indexOf("function leBackground(", inicioCompleted);
  if (inicioCompleted < 0 || fimReacompanharFal < 0) {
    failures.push(
      "reacompanharFal: não foi possível recortar o ramo 'completed' pelas âncoras " +
        '`// status === "completed" — o achado do V27` e `function leBackground(`. A guarda não pode ' +
        "opinar sobre um trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
    );
  } else {
    const trechoCompleted = rota.slice(inicioCompleted, fimReacompanharFal);
    if (!/UPDATE fal_pipeline_steps SET raw_response/.test(trechoCompleted)) {
      failures.push(
        "reacompanharFal: o ramo 'completed' não grava mais o resultado em `fal_pipeline_steps` — o " +
          "achado do V27 (resultado pago e pronto, nunca buscado) voltaria a acontecer.",
      );
    }
    if (/status = 'error'/.test(trechoCompleted)) {
      failures.push(
        "reacompanharFal: o ramo 'completed' marca o vídeo como 'error' — o resultado que acabou de ser " +
          "recuperado ficaria salvo no banco e INVISÍVEL, com a galeria mostrando erro sobre um trabalho " +
          "que na verdade terminou bem.",
      );
    }
  }

  if (failures.length === 0) {
    notes.push(
      "    identidade-do-estorno: /approve-video pergunta pela etapa que falhou NESTA corrida " +
        "(sincronizar), não pelo request_id de animar de uma corrida anterior",
      "    reacompanharFal: o ramo 'completed' grava o resultado em fal_pipeline_steps e nunca marca o " +
        "vídeo como 'error'",
    );
  }

  return { failures, notes };
}
