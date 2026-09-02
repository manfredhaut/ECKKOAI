/**
 * A APROVAÇÃO da imagem composta — as quatro invariantes do BLOCO B3.
 *
 *  G-A  vídeo em `awaiting_approval` não é tratado como órfão pelo recovery
 *  G-B  nenhuma etapa paga posterior à composição sai sem aprovação registrada
 *  G-C  refazer recompõe sem disparar o Wan
 *  G-D  motion prompt vazio é recusado ANTES de abrir a corrida, em `/approve`
 *  G-E  os TRÊS call sites de abrirCorrida (criação, /approve, /recompose)
 *       passam video.id — BLOCO N+2
 *  G-F  abrirCorrida grava video_id no INSERT de fal_pipeline_runs (BLOCO N+1)
 *
 * ┌─ As três primeiras medem por EXECUÇÃO, e cada uma tem um desfecho ───────┐
 * │ G-A  a varredura de boot roda com `pool.query` substituído. Sem a        │
 * │      exceção, a linha `awaiting_approval` é REACOMPANHADA — e            │
 * │      reacompanhar chama `pollVideoJob`, que despacha por                 │
 * │      `did ? … : heygen`: a chave da fal sairia para `api.heygen.com`.    │
 * │      O desfecho não é estético, é o vazamento que                        │
 * │      `VENDORS_WITH_CONNECTION_PROBE` existe para impedir.                │
 * │                                                                          │
 * │ G-B  ordem com desfecho, e o desfecho é o SEGUNDO CLIQUE. No caminho     │
 * │      feliz as duas ordens terminam igual (gotcha 9); a corrida que as    │
 * │      distingue é `marcarAprovado` devolvendo `false`. Nesta ordem        │
 * │      `animar` não é chamado; na inversa o Wan já foi pago quando o       │
 * │      registro responde que a aprovação não era daquele clique.           │
 * │                                                                          │
 * │ G-C  o pipeline REAL roda com `globalThis.fetch` substituído, e o sinal  │
 * │      é o endpoint SUBMETIDO. "Refazer" que encadeia não parece diferente │
 * │      em tela nenhuma — só na fatura, 12× maior.                          │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ G-D mede FORMA, e isto está declarado ───────────────────────────────────┐
 * │ A recusa vive INLINE no handler `POST /videos/:id/approve`               │
 * │ (`backend/src/routes/videos.ts`), como closure — não é uma função        │
 * │ exportada de um módulo de serviço, e esta rodada está proibida de tocar  │
 * │ na rota para extraí-la. Sem uma função importável não há o que chamar    │
 * │ por execução isolada; o que se pode medir por execução aqui é o handler  │
 * │ HTTP inteiro, o que esta guarda não faz (nenhuma das outras três do      │
 * │ arquivo sobe o Fastify). A alternativa MEDIDA por este arquivo (G-a de   │
 * │ `checkFalGenerationPathPolicy.ts`, que mede a ordem porteiro×débito no   │
 * │ mesmo handler de vídeos) é a leitura do arquivo REAL e a verificação de  │
 * │ que a condição — os TOKENS que a decisão usa, não um comentário, nome    │
 * │ de variável ou texto de mensagem — está presente e vem ANTES de          │
 * │ `abrirCorrida`. Um mutante que troque a condição por uma que nunca casa  │
 * │ (`motionPromptDaLinha(video) === "impossivel-motion-prompt-vazio"`)      │
 * │ remove o `if (!motionPromptDaLinha(video))` do texto do arquivo, e é     │
 * │ essa ausência — não uma menção — que a guarda enxerga.                   │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ G-E mede FORMA, pelo mesmo motivo de G-D ────────────────────────────────┐
 * │ Os TRÊS call sites (criação, `/approve`, `/recompose`) são objetos        │
 * │ literais inline no handler — não há função importável para chamar por    │
 * │ execução isolada sem subir o Fastify (mesma limitação registrada em      │
 * │ G-D). A guarda recorta cada handler entre a chamada `abrirCorrida({` e o  │
 * │ statement seguinte que só existe naquele handler (`aprovarEAnimar` para   │
 * │ /approve, `recompor` para /recompose, `if (falRunId) {` para a criação —  │
 * │ a distinção é o que torna cada recorte único no arquivo) e verifica que   │
 * │ o token `videoId: video.id,` está dentro dele. O de criação usa uma       │
 * │ âncora extra à esquerda (`}>("/videos", { preHandler: …`), porque a       │
 * │ chamada ali é `? await abrirCorrida({` — ramo de um TERNÁRIO, não         │
 * │ `const runId = await abrirCorrida({` como nos outros dois.                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ G-F mede por EXECUÇÃO real, com `pool.query` substituído ────────────────┐
 * │ Diferente de G-E, `abrirCorrida` É uma função exportada — chamá-la de     │
 * │ verdade e inspecionar os parâmetros que ela manda ao INSERT é possível    │
 * │ sem infraestrutura nenhuma. A guarda chama `abrirCorrida` duas vezes (com │
 * │ e sem `videoId`) e lê o SQL e o array de valores capturados pelo `query`  │
 * │ substituído — não faz grep no código-fonte.                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─ Custo: ZERO ───────────────────────────────────────────────────────────┐
 * │ Nenhuma rede (o `fetch` é substituído), nenhum banco (o `pool.query` é   │
 * │ substituído e o diário é um array), nenhuma espera real. G-D e G-E só    │
 * │ leem arquivo do disco; G-F chama código real com o banco substituído.    │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Mutant } from "./mutants.js";
import { pool } from "../db/pool.js";
import { ENDPOINT_ANIMAR, ENDPOINT_COMPOR } from "../services/video/falPipeline.js";
import { aprovarEAnimar, recompor } from "../services/video/falApproval.js";
import { recoverInFlightVideos, videoRecoveryMaxAgeMs, videoApprovalMaxAgeMs } from "../services/video/recovery.js";
import { abrirCorrida } from "../services/video/falPipelineJournal.js";

const RECUPERACAO = "backend/src/services/video/recovery.ts";
const APROVACAO = "backend/src/services/video/falApproval.ts";
const ROTA_DE_VIDEOS = "backend/src/routes/videos.ts";
const DIARIO_DO_PIPELINE = "backend/src/services/video/falPipelineJournal.ts";

/**
 * A condição, transcrita. É a forma que o mutante de G-D desfaz.
 *
 * BLOCO EXPRESSIVIDADE-FAL, 28/08: a checagem passou a ler
 * `motionPromptDaLinha(video)` (SÓ a Interpretação escrita pela pessoa),
 * não mais `promptDaDirecaoDaLinha(video)` — esta última agora SEMPRE inclui
 * a frase de Expressividade (default de fábrica, nunca vazia), e checá-la
 * aqui faria "Interpretação vazia" parar de disparar de verdade. A função
 * ENRIQUECIDA (`promptDaDirecaoDaLinha`) continua sendo o que é enviado ao
 * motor — só a VALIDAÇÃO de vazio mudou de fonte.
 */
const CONDICAO_MOTION_PROMPT_VAZIO = "      if (!motionPromptDaLinha(video)) {";

export const MUTANTS: Mutant[] = [
  {
    guard: "vídeo em awaiting_approval não é tratado como órfão pelo recovery",
    name: "a exceção da aprovação pendente some da varredura",
    kind: "obvio",
    // O `if` continua no arquivo, a função de expiração continua sendo
    // chamada em lugar nenhum de novo, e o `tsc` continua verde — só a
    // CONDIÇÃO deixa de casar. É a mesma forma dos mutantes `if (limite < 0)`
    // e `if (previsto < 0)` deste projeto: manter a linha compilando e tirar
    // dela o efeito, em vez de apagá-la e arriscar `noUnusedLocals`.
    //
    // ⚠️ NÃO usar `if (false && …)`: o TypeScript trata o corpo como
    // inalcançável e o gate sai 2 pelo `tsc` — o arnês devolveu AMBÍGUO com a
    // guarda saudável quando isso foi tentado no B2.
    file: RECUPERACAO,
    // Transcrito de novo em FASE 2 (21/08): a linha ganhou o segundo braço
    // `|| linha.status === STATUS_AGUARDANDO_APROVACAO_VIDEO` (migration 059,
    // Modo B) e o `find` antigo (só o primeiro braço) parou de casar — 0x,
    // não 2x, então não é o caso do gotcha "linha nova ambígua": é o texto
    // MEDIDO tendo mudado. O `replace` continua o mesmo sentinela morto —
    // ele apaga a condição inteira, os dois braços juntos.
    //
    // ⚠️ GOTCHA NOVO, MEDIDO em 21/08: `linha.status === "sentinela"` sozinho
    // compila, mas o CORPO do bloco compara `linha.status` de novo contra
    // `STATUS_AGUARDANDO_APROVACAO_VIDEO` (para escolher a mensagem) — e o
    // TypeScript NARROWS `linha.status` para o literal do sentinela dentro do
    // bloco, tornando a SEGUNDA comparação "sem sobreposição" (TS2367). É a
    // MESMA família do gotcha `if (false && …)`: o `tsc` reprova antes de o
    // gate rodar, e a guarda nunca chega a opinar — AMBÍGUO, não reprovação
    // limpa. `String(...)` evita o narrowing sem mudar o comportamento em
    // tempo de execução.
    find:
      "      if (linha.status === STATUS_AGUARDANDO_APROVACAO || linha.status === STATUS_AGUARDANDO_APROVACAO_VIDEO) {",
    replace: '      if (String(linha.status) === "estado-que-nenhuma-linha-tem") {',
    expect: "vídeo aguardando aprovação foi tratado como registro preso",
  },
  {
    guard: "nenhuma etapa paga posterior à composição sai sem aprovação registrada",
    name: "anima primeiro e registra a aprovação depois",
    kind: "esperto",
    // ESPERTO: o caminho feliz termina IDÊNTICO — o vídeo sai, a linha fica
    // aprovada, e uma guarda que perguntasse "a aprovação é registrada?"
    // seguiria verde. O que muda é o segundo clique, que num botão de tela é
    // o caso comum: o Wan roda ANTES de alguém descobrir que aquela aprovação
    // já tinha acontecido.
    file: APROVACAO,
    find:
      "  const aprovado = await input.registro.marcarAprovado();\n" +
      "  if (!aprovado) {",
    replace:
      "  const jaAnimado = await input.animar();\n" +
      "  void jaAnimado;\n" +
      "  const aprovado = await input.registro.marcarAprovado();\n" +
      "  if (!aprovado) {",
    expect: "uma etapa paga rodou sem aprovação registrada antes dela",
  },
  {
    guard: "refazer recompõe sem disparar o Wan",
    name: "o refazer encadeia até a sincronia",
    kind: "esperto",
    // ESPERTO porque nada na tela muda: o botão continua dizendo "Refazer", a
    // imagem continua sendo recomposta, e a corrida continua terminando bem.
    // Só que ela passa a seguir para a animação — e o clique que existe para
    // iterar por US$ 0,08 passa a custar ~US$ 1,52, sem uma palavra diferente
    // em lugar nenhum.
    file: APROVACAO,
    find: 'export const PARAR_APOS_RECOMPOR: EtapaDoPipeline = "compor";',
    replace: 'export const PARAR_APOS_RECOMPOR: EtapaDoPipeline = "sincronizar";',
    expect: "o refazer disparou a animação",
  },
  {
    guard: "motion prompt vazio é recusado ANTES de abrir a corrida, em /approve",
    name: "a condição de motion prompt vazio deixa de casar com linha nenhuma",
    kind: "esperto",
    // ESPERTO: o `if` continua no arquivo, byte a byte visível como bloco, o
    // `tsc` continua verde (é uma comparação de string válida, não um
    // `if (false && …)` que o gotcha do G-A desta guarda já proíbe), e a
    // resposta 422 `empty_motion_prompt` continua existindo no código-fonte
    // — só que morta, porque nenhum roteiro real é literalmente a string
    // "impossivel-motion-prompt-vazio". A recusa para de acontecer sem que
    // uma leitura por texto de mensagem ou nome de variável perceba: a
    // mensagem, o código de erro e o nome da função seguem intactos.
    file: ROTA_DE_VIDEOS,
    find: CONDICAO_MOTION_PROMPT_VAZIO,
    replace: '      if (motionPromptDaLinha(video) === "impossivel-motion-prompt-vazio") {',
    expect: "motion prompt vazio não é recusado antes de abrir a corrida",
  },
  {
    guard: "motion prompt vazio é recusado ANTES de abrir a corrida, em /approve",
    name: "a condição sobrevive e o corpo dela é esvaziado",
    kind: "esperto",
    // ESPERTO NO PIOR SENTIDO PARA ESTA GUARDA: a condição — o texto que
    // `posCondicao` procura — continua BYTE A BYTE no arquivo. O que
    // desaparece é o `return` de dentro do bloco: a recusa 422 vira um
    // comentário inócuo, e a execução, em vez de parar ali, ATRAVESSA o `if`
    // e continua até `abrirCorrida` do mesmo jeito que atravessaria com o
    // roteiro preenchido. Este é exatamente o mutante que a verificação de
    // `posCondicao` sozinha NÃO pegaria — ela só olha se a LINHA da condição
    // existe, não se o corpo dela ainda recusa alguma coisa. Quem pega (ou
    // não) é a segunda verificação, a contagem de ocorrências de
    // `error: "empty_motion_prompt"` no recorte.
    file: ROTA_DE_VIDEOS,
    find:
      "      if (!motionPromptDaLinha(video)) {\n" +
      "        return reply.code(422).send({\n" +
      '          error: "empty_motion_prompt",\n' +
      "          message:\n" +
      '            "Interpretação não pode ficar vazia para este vendor (fal exige texto de direção). " +\n' +
      '            "Preencha o campo Interpretação e tente aprovar de novo. Nada foi cobrado.",\n' +
      "        });\n" +
      "      }",
    replace:
      "      if (!motionPromptDaLinha(video)) {\n" +
      "        // corpo esvaziado pelo mutante: a condição continua casando, mas nada recusa mais.\n" +
      "      }",
    expect: "a recusa `empty_motion_prompt` aparece 0x",
  },
  {
    guard: "os três call sites de abrirCorrida (criação, /approve, /recompose) passam video.id",
    name: "o call site de /approve deixa de passar videoId",
    kind: "obvio",
    file: ROTA_DE_VIDEOS,
    find: "      const runId = await abrirCorrida({\n        tenantId: req.tenantId,\n        videoId: video.id,\n        script: video.script,\n        // Descritivo — ver o comentário equivalente no call site de criação.\n        targetSeconds: escolherDuracao(video.script.length) ?? PIPELINE_DURACAO_MAXIMA,\n        charsPerSecond: PIPELINE_CHARS_PER_SECOND,\n        origem: \"aprovacao\",\n      });\n",
    replace: "      const runId = await abrirCorrida({\n        tenantId: req.tenantId,\n        script: video.script,\n        // Descritivo — ver o comentário equivalente no call site de criação.\n        targetSeconds: escolherDuracao(video.script.length) ?? PIPELINE_DURACAO_MAXIMA,\n        charsPerSecond: PIPELINE_CHARS_PER_SECOND,\n        origem: \"aprovacao\",\n      });\n",
    expect: "aprovação: o call site de /approve não passa videoId a abrirCorrida",
  },
  {
    guard: "os três call sites de abrirCorrida (criação, /approve, /recompose) passam video.id",
    name: "o call site de /recompose deixa de passar videoId",
    kind: "obvio",
    file: ROTA_DE_VIDEOS,
    find: "      const runId = await abrirCorrida({\n        tenantId: req.tenantId,\n        videoId: video.id,\n        script: video.script,\n        // Descritivo — ver o comentário equivalente no call site de criação.\n        targetSeconds: escolherDuracao(video.script.length) ?? PIPELINE_DURACAO_MAXIMA,\n        charsPerSecond: PIPELINE_CHARS_PER_SECOND,\n        origem: \"refazer_imagem\",\n      });\n",
    replace: "      const runId = await abrirCorrida({\n        tenantId: req.tenantId,\n        script: video.script,\n        // Descritivo — ver o comentário equivalente no call site de criação.\n        targetSeconds: escolherDuracao(video.script.length) ?? PIPELINE_DURACAO_MAXIMA,\n        charsPerSecond: PIPELINE_CHARS_PER_SECOND,\n        origem: \"refazer_imagem\",\n      });\n",
    expect: "aprovação: o call site de /recompose não passa videoId a abrirCorrida",
  },
  {
    guard: "os três call sites de abrirCorrida (criação, /approve, /recompose) passam video.id",
    name: "o call site de criação (POST /videos, ramo ehFal) deixa de passar videoId",
    kind: "obvio",
    // BLOCO N+2: terceiro call site, fora de escopo no N+1. `video.id` já
    // está em escopo neste ponto — a linha em `videos` é inserida e debitada
    // ANTES deste trecho (ver o comentário "GRAVAÇÃO ANTECIPADA" logo acima,
    // no fonte) — então omitir `videoId` aqui é regressão, não limitação.
    file: ROTA_DE_VIDEOS,
    find:
      "      ? await abrirCorrida({\n" +
      "          tenantId: req.tenantId,\n" +
      "          videoId: video.id,\n" +
      "          script,\n",
    replace:
      "      ? await abrirCorrida({\n" +
      "          tenantId: req.tenantId,\n" +
      "          script,\n",
    expect: "aprovação: o call site de criação (`POST /videos`, ramo `ehFal`) não passa videoId a abrirCorrida",
  },
  {
    guard: "abrirCorrida grava video_id no INSERT de fal_pipeline_runs",
    name: "o INSERT deixa de listar a coluna video_id",
    kind: "obvio",
    file: DIARIO_DO_PIPELINE,
    find: "    `INSERT INTO fal_pipeline_runs (tenant_id, video_id, script, target_seconds, script_chars, chars_per_second, origem, seed_wan)\n     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)\n     RETURNING id`,\n    [\n      input.tenantId,\n      input.videoId ?? null,\n      input.script,\n      input.targetSeconds,\n      input.script.length,\n      input.charsPerSecond,\n      input.origem ?? null,\n      seedWan,\n    ],",
    replace: "    `INSERT INTO fal_pipeline_runs (tenant_id, script, target_seconds, script_chars, chars_per_second, origem, seed_wan)\n     VALUES ($1, $2, $3, $4, $5, $6, $7)\n     RETURNING id`,\n    [\n      input.tenantId,\n      input.script,\n      input.targetSeconds,\n      input.script.length,\n      input.charsPerSecond,\n      input.origem ?? null,\n      seedWan,\n    ],",
    expect: "aprovação: o INSERT de `fal_pipeline_runs` não menciona a coluna `video_id`",
  },
  {
    guard: "abrirCorrida grava video_id no INSERT de fal_pipeline_runs",
    name: "o video_id gravado é sempre null, mesmo com videoId presente",
    kind: "esperto",
    // ESPERTO: a coluna continua na lista do INSERT, o placeholder $2 continua
    // lá, o `tsc` continua verde (`null` é atribuível a `string | null`) — só
    // o VALOR enviado deixa de ser o `videoId` recebido. Uma guarda que só
    // conferisse "a coluna existe no texto do SQL" passaria com a coluna
    // presente e sempre vazia, que é o pior caso: parece resolvido e não está.
    file: DIARIO_DO_PIPELINE,
    find: "    `INSERT INTO fal_pipeline_runs (tenant_id, video_id, script, target_seconds, script_chars, chars_per_second, origem, seed_wan)\n     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)\n     RETURNING id`,\n    [\n      input.tenantId,\n      input.videoId ?? null,\n      input.script,\n      input.targetSeconds,\n      input.script.length,\n      input.charsPerSecond,\n      input.origem ?? null,\n      seedWan,\n    ],",
    replace: "    `INSERT INTO fal_pipeline_runs (tenant_id, video_id, script, target_seconds, script_chars, chars_per_second, origem, seed_wan)\n     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)\n     RETURNING id`,\n    [\n      input.tenantId,\n      null,\n      input.script,\n      input.targetSeconds,\n      input.script.length,\n      input.charsPerSecond,\n      input.origem ?? null,\n      seedWan,\n    ],",
    expect: "aprovação: o INSERT de `fal_pipeline_runs` cita `video_id` no texto, mas o valor enviado não é o",
  },
];

export interface FalApprovalCheckResult {
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
 * Roda `recoverInFlightVideos` sobre linhas construídas.
 *
 * Duas delas estão em `awaiting_approval`: uma RECENTE (que não pode ser
 * tocada) e uma VELHA (que tem de expirar). A terceira é um `queued` recente
 * com job, e existe como controle — sem ela, uma varredura que não fizesse
 * nada passaria nas duas primeiras verificações.
 */
async function varrer(): Promise<Varredura> {
  const queryOriginal = pool.query.bind(pool);
  const idadeAprovacao = videoApprovalMaxAgeMs();
  const idadeRecuperacao = videoRecoveryMaxAgeMs();

  const linhas = [
    {
      id: "v-aguardando-recente",
      status: "awaiting_approval",
      // COM job id: o `request_id` da composição, que a rota grava. É o que
      // torna esta linha perigosa sem a exceção — ela não cai no ramo do
      // órfão, cai no de REACOMPANHAR.
      provider_job_id: "req-da-composicao",
      provider_vendor: "fal",
      idade_ms: Math.floor(idadeAprovacao / 2),
    },
    {
      id: "v-aguardando-velho",
      status: "awaiting_approval",
      provider_job_id: "req-da-composicao-velha",
      provider_vendor: "fal",
      idade_ms: idadeAprovacao + 60_000,
    },
    {
      id: "v-queued-recente",
      status: "queued",
      provider_job_id: "job-heygen",
      // V28, item 3 — vendor PRÓPRIO, diferente das duas linhas acima: esta
      // testa o caminho GENÉRICO de reacompanhamento (heygen/did), não o
      // fluxo de aprovação da fal. Com `provider_vendor: "fal"` (o valor que
      // as outras duas usam), `recoverInFlightVideos` despacharia para
      // `reacompanharFal` — que este teste não injeta — e corretamente NÃO
      // chamaria o `reacompanhar` genérico, para não vazar a chave errada
      // (ver o comentário do tipo `Reacompanhar`, recovery.ts). O nome
      // `job-heygen` já indicava a intenção original.
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
// G-C: o refazer, com a rede substituída
// ---------------------------------------------------------------------------

/** Roda `recompor` de verdade e devolve os endpoints SUBMETIDOS, na ordem. */
async function refazer(): Promise<{ submetidos: string[]; erro: string }> {
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

  const diario = {
    async abrirEtapa() {
      return "step";
    },
    async gravarRequestId() {},
    async gravarRespostaCrua() {},
    async fecharEtapa() {},
    async registrarGastoPrevisto() {},
  };

  const modoOriginal = process.env.PROVIDER_MODE;
  let erro = "";
  try {
    // `live` porque em fixture o `falClient` desvia antes da rede e nenhuma
    // submissão existiria para contar.
    process.env.PROVIDER_MODE = "live";
    await recompor({
      apiKeyFal: "chave-irrelevante-fetch-substituido",
      apiKeyElevenLabs: "chave-irrelevante-fetch-substituido",
      voiceId: "0hQuq0q2JEk1SY4lZaM9",
      script: ROTEIRO_DA_PROVA,
      fotoBase: Buffer.from("foto-da-prova"),
      fotoMimeType: "image/jpeg",
      promptDeComposicao: "traje e cenário da prova",
      tenantId: "tenant-da-prova",
      // DISTINGUÍVEL do texto acima, e é essa diferença que a guarda mede: um
      // valor igual faria "a animação recebeu a direção" e "a animação
      // recebeu a composição" produzirem exatamente o mesmo corpo, e a
      // guarda seguiria verde com os dois campos trocados.
      promptDeDirecao: "test direction in english",
      diario: diario as never,
      // Teto FOLGADO de propósito: com um teto apertado, quem barraria a
      // animação seria o dinheiro, e a guarda passaria a medir o teto em vez
      // do `pararApos`. O que se afirma aqui é que o REFAZER não encadeia —
      // e isso só é observável quando nada mais está barrando.
      tetoDeGastoUsd: 99,
      pollTimeoutMs: 50,
      pollIntervalMs: 1,
      esperar: async () => {},
      // 02/09/2026 — a guarda de folga de sincronização roda `ffprobe` DE
      // VERDADE contra a URL do vídeo animado, e ela é fake aqui.
      verificarFolgaSincronizar: false,
    });
  } catch (err) {
    erro = String(err);
  } finally {
    globalThis.fetch = fetchOriginal;
    if (modoOriginal === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = modoOriginal;
  }

  return { submetidos, erro };
}

// ---------------------------------------------------------------------------
// G-D: a recusa de motion prompt vazio, por FORMA — ver o cabeçalho
// ---------------------------------------------------------------------------

function lerDaRaiz(relativo: string): string {
  // O repositório inteiro é montado em `/repo` no container — o mesmo caminho
  // que `checkFalGenerationPathPolicy` usa. `/app` tem só `backend/src`, e ler
  // por ele deixaria de fora a tela.
  const repoRoot = process.env.REPO_ROOT ?? "/repo";
  // CRLF → LF, sempre: o working copy vem em CRLF (autocrlf no Windows) e a
  // âncora transcrita aqui é escrita com `\n` — sem normalizar, o `includes`
  // casa zero vezes e a guarda acusa ausência do que está lá.
  return readFileSync(path.join(repoRoot, relativo), "utf-8").replace(/\r\n/g, "\n");
}

export async function checkFalApprovalPolicy(): Promise<FalApprovalCheckResult> {
  const failures: string[] = [];
  const notes: string[] = [];

  // -------------------------------------------------------------------------
  // G-A
  // -------------------------------------------------------------------------
  const v = await varrer();

  if (v.encontrados !== 3) {
    failures.push(
      `aprovação: a varredura encontrou ${v.encontrados} registros, esperado 3. Se ela deixou de SELECIONAR ` +
        "os `awaiting_approval`, a expiração de 24 h nunca acontece — e uma aprovação abandonada fica na " +
        "galeria para sempre, com o crédito debitado.",
    );
  }
  if (v.reacompanhados.includes("v-aguardando-recente")) {
    failures.push(
      "aprovação: vídeo aguardando aprovação foi tratado como registro preso — a varredura o REACOMPANHOU. " +
        "Reacompanhar chama `pollVideoJob`, que despacha por `did ? … : heygen`: com vendor `fal` a chave " +
        "do tenant sairia em claro para `api.heygen.com`, no header `x-api-key`. Não há nada a acompanhar " +
        "numa composição que já terminou e está esperando um clique humano.",
    );
  }
  const encerradoRecente = v.encerrados.find((e) => e.id === "v-aguardando-recente");
  if (encerradoRecente) {
    failures.push(
      `aprovação: vídeo aguardando aprovação foi tratado como registro preso — encerrado como ` +
        `\`${encerradoRecente.reason}\` dentro da janela. A composição foi PAGA e a imagem existe; ` +
        "encerrá-la joga fora US$ 0,08 já gastos e, se o motivo estornar, cria crédito do nada.",
    );
  }
  const encerradoVelho = v.encerrados.find((e) => e.id === "v-aguardando-velho");
  if (!encerradoVelho || encerradoVelho.reason !== "approval_expired") {
    failures.push(
      "aprovação: aprovação pendente ALÉM da janela não foi expirada como `approval_expired` — " +
        `encerrados: ${JSON.stringify(v.encerrados)}. Ignorar o estado é tão ruim quanto encerrá-lo cedo: ` +
        "sem expiração, `awaiting_approval` vira o novo `queued` para sempre.",
    );
  }
  if (!v.reacompanhados.includes("v-queued-recente")) {
    failures.push(
      "aprovação: o CONTROLE falhou — um `queued` recente com job id deixou de ser reacompanhado. A " +
        "exceção da aprovação vazou para os estados que ela não devia tocar.",
    );
  }
  if (failures.length === 0) {
    notes.push(
      "    aprovação: a varredura ignora aprovação pendente recente, expira a velha como " +
        "`approval_expired`, e continua reacompanhando `queued`",
    );
  }

  // -------------------------------------------------------------------------
  // G-B — a ordem, com o desfecho do segundo clique
  // -------------------------------------------------------------------------
  const eventos: string[] = [];
  const segundoClique = await aprovarEAnimar({
    videoId: "v-da-prova",
    registro: {
      async marcarAprovado() {
        eventos.push("registrou");
        // `false` = a linha já não estava em `awaiting_approval`. É a corrida
        // que dá desfecho à ordem.
        return false;
      },
    },
    animar: async () => {
      eventos.push("animou");
      return "video-da-prova";
    },
  });

  if (eventos.includes("animou")) {
    failures.push(
      "aprovação: uma etapa paga rodou sem aprovação registrada antes dela — com `marcarAprovado` " +
        `devolvendo false, a sequência foi ${eventos.join(" → ")}. Registrar DEPOIS de animar não protege ` +
        "nada: no segundo clique o Wan (~US$ 1,00) já foi pago quando o registro finalmente responde que " +
        "aquela aprovação não era daquele clique.",
    );
  }
  if (segundoClique.aprovado || segundoClique.resultado !== null) {
    failures.push(
      `aprovação: o segundo clique voltou como aprovado (${JSON.stringify(segundoClique)}). Quem não ` +
        "conseguiu marcar não aprovou nada, e devolver o contrário faz a rota responder 200 sobre trabalho " +
        "que ela não fez.",
    );
  }

  // CONTRAPONTO: com `marcarAprovado` devolvendo true, `animar` TEM de rodar.
  // Sem isto, uma guarda que simplesmente nunca animasse passaria acima.
  const eventosFeliz: string[] = [];
  const primeiroClique = await aprovarEAnimar({
    videoId: "v-da-prova",
    registro: {
      async marcarAprovado() {
        eventosFeliz.push("registrou");
        return true;
      },
    },
    animar: async () => {
      eventosFeliz.push("animou");
      return "video-da-prova";
    },
  });
  if (eventosFeliz.join(" → ") !== "registrou → animou" || primeiroClique.resultado !== "video-da-prova") {
    failures.push(
      `aprovação: o caminho aprovado não registrou-e-animou nessa ordem — sequência ${eventosFeliz.join(" → ")}, ` +
        `resultado ${JSON.stringify(primeiroClique.resultado)}. Uma guarda que só exigisse "não animou" ` +
        "passaria com um botão que nunca anima nada.",
    );
  } else {
    notes.push(
      "    aprovação: a aprovação é registrada ANTES da etapa paga — no segundo clique nada é animado, " +
        "e no primeiro a ordem é registrou → animou",
    );
  }

  // -------------------------------------------------------------------------
  // G-C — refazer não encadeia
  // -------------------------------------------------------------------------
  const r = await refazer();
  if (!r.submetidos.includes(ENDPOINT_COMPOR)) {
    failures.push(
      `aprovação: o refazer não submeteu \`${ENDPOINT_COMPOR}\` — submetidos: ` +
        `${JSON.stringify(r.submetidos)}, erro ${JSON.stringify(r.erro.slice(0, 140))}. Um "Refazer" que ` +
        "não recompõe é um botão que não faz nada, e a verificação abaixo passaria por vacuidade.",
    );
  }
  if (r.submetidos.includes(ENDPOINT_ANIMAR)) {
    failures.push(
      `aprovação: o refazer disparou a animação — \`${ENDPOINT_ANIMAR}\` foi submetido (${JSON.stringify(r.submetidos)}). ` +
        "Refazer existe para iterar na imagem por US$ 0,08; encadeando, o mesmo clique passa a custar " +
        "~US$ 1,52 e nada na tela diz isso. O freio é `PARAR_APOS_RECOMPOR`, e ele tem de valer `compor`.",
    );
  } else if (r.submetidos.includes(ENDPOINT_COMPOR)) {
    notes.push(
      `    aprovação: o refazer submete só \`${ENDPOINT_COMPOR}\` e para — a animação não é alcançada ` +
        "nem com teto folgado",
    );
  }

  // -------------------------------------------------------------------------
  // G-D — motion prompt vazio recusa ANTES de abrirCorrida, no handler /approve
  // -------------------------------------------------------------------------
  const rota = lerDaRaiz(ROTA_DE_VIDEOS);
  // ÂNCORAS INTRÍNSECAS ao que se mede: a string de rota do handler de
  // aprovação (única no arquivo) e a primeira `abrirCorrida` depois dela —
  // que é a do PRÓPRIO handler, porque `/recompose` vem depois no arquivo.
  // Nunca um wrapper de layout — recorte ancorado em fronteira genérica vaza
  // para o handler vizinho e a guarda acusa o errado.
  const inicioApprove = rota.indexOf('"/videos/:id/approve",');
  const fimApprove = rota.indexOf("const runId = await abrirCorrida({", inicioApprove);

  if (inicioApprove < 0 || fimApprove < 0) {
    failures.push(
      "aprovação: não foi possível recortar o handler `/approve` em " +
        `${ROTA_DE_VIDEOS} pelas âncoras \`"/videos/:id/approve",\` e \`const runId = await abrirCorrida({\`. ` +
        "A guarda não pode opinar sobre um trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
    );
  } else {
    const trechoApprove = rota.slice(inicioApprove, fimApprove);

    // Rede anti-vazamento: o recorte não pode ter engolido a rota vizinha.
    for (const vizinha of ['"/videos/:id/recompose"', '"/videos/:id/reject"']) {
      if (trechoApprove.includes(vizinha)) {
        failures.push(
          `aprovação: o recorte do handler /approve engoliu \`${vizinha}\` — a âncora vazou para a rota ` +
            "vizinha, e a verificação abaixo seria sobre o handler errado.",
        );
      }
    }

    const posCondicao = trechoApprove.indexOf(CONDICAO_MOTION_PROMPT_VAZIO);
    if (posCondicao < 0) {
      failures.push(
        "aprovação: motion prompt vazio não é recusado antes de abrir a corrida — a condição " +
          `\`${CONDICAO_MOTION_PROMPT_VAZIO.trim()}\` não está mais no handler \`/approve\`. Sem ela, um ` +
          `roteiro cuja Interpretação ficou vazia chega ao motor de animação (\`${ENDPOINT_ANIMAR}\`), que exige ` +
          "`prompt` como string não-vazia — e o 422 do fornecedor, embora ainda estornável, gastaria uma " +
          "chamada de rede real para chegar à mesma recusa que já se sabia sem sair daqui.",
      );
    } else {
      // CONTRAPONTO: a posição da condição é a mesma posição em que, com o
      // roteiro preenchido (o `if` não casa), a execução ATRAVESSA o bloco e
      // segue para `abrirCorrida` — que é exatamente o limite direito do
      // recorte. Não há OUTRO retorno antecipado entre os dois no trecho
      // medido: se houvesse, aparecer aqui seria a mesma âncora por acaso, e
      // o texto abaixo pega isso contando quantas vezes a mensagem de erro
      // deste passo aparece no recorte (tem de ser exatamente uma).
      const ocorrenciasDaRecusa = trechoApprove.split('error: "empty_motion_prompt"').length - 1;
      if (ocorrenciasDaRecusa !== 1) {
        failures.push(
          "aprovação: a recusa `empty_motion_prompt` aparece " +
            `${ocorrenciasDaRecusa}x no handler \`/approve\` (esperado 1). Duas ocorrências indicam um ` +
            "segundo ponto de recusa que pode ter ficado fora de ordem; zero indica que a condição existe " +
            "mas não devolve mais o 422 correspondente — os dois casos tornam a guarda incapaz de afirmar " +
            "que o caminho feliz (Interpretação preenchida) segue para `abrirCorrida` sem passar por aqui.",
        );
      } else {
        notes.push(
          "    aprovação: motion prompt vazio recusa (422 `empty_motion_prompt`) ANTES de `abrirCorrida` no " +
            `handler \`/approve\` (condição na posição ${posCondicao} do recorte); com a Interpretação ` +
            "preenchida a condição não casa e a execução segue reto para `abrirCorrida`, no fim do mesmo recorte",
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // G-E — os TRÊS call sites de abrirCorrida (videos.ts) passam videoId
  // (BLOCO N+2: o handler de criação, POST /videos ramo `ehFal`, entrou
  // nesta rodada — era o terceiro chamador real, fora de escopo no BLOCO
  // N+1, que só cobria /approve e /recompose)
  // -------------------------------------------------------------------------
  {
    let okApprove = false;
    let okRecompose = false;
    let okCreate = false;

    // Reaproveita `inicioApprove`, já calculado acima para G-D.
    const chamadaApprove = rota.indexOf("const runId = await abrirCorrida({", inicioApprove);
    const fimChamadaApprove = rota.indexOf("const r = await aprovarEAnimar({", chamadaApprove);
    if (inicioApprove < 0 || chamadaApprove < 0 || fimChamadaApprove < 0) {
      failures.push(
        "aprovação: não foi possível recortar a chamada `abrirCorrida` no handler `/approve` pelas âncoras " +
          "`const runId = await abrirCorrida({` e `const r = await aprovarEAnimar({`. A guarda não pode opinar " +
          "sobre um trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
      );
    } else {
      const trechoChamadaApprove = rota.slice(chamadaApprove, fimChamadaApprove);
      if (!trechoChamadaApprove.includes("videoId: video.id,")) {
        failures.push(
          "aprovação: o call site de /approve não passa videoId a abrirCorrida — a corrida some do vínculo " +
            "com o vídeo que a originou, e `fal_pipeline_runs.video_id` fica NULL para toda aprovação a " +
            "partir de agora.",
        );
      } else {
        okApprove = true;
      }
    }

    const inicioRecompose = rota.indexOf('"/videos/:id/recompose",');
    const chamadaRecompose = rota.indexOf("const runId = await abrirCorrida({", inicioRecompose);
    const fimChamadaRecompose = rota.indexOf("const corrida = await recompor({", chamadaRecompose);
    if (inicioRecompose < 0 || chamadaRecompose < 0 || fimChamadaRecompose < 0) {
      failures.push(
        "aprovação: não foi possível recortar a chamada `abrirCorrida` no handler `/recompose` pelas âncoras " +
          "`const runId = await abrirCorrida({` e `const corrida = await recompor({`. A guarda não pode opinar " +
          "sobre um trecho que não encontrou, e passar verde aqui seria o pior desfecho.",
      );
    } else {
      const trechoChamadaRecompose = rota.slice(chamadaRecompose, fimChamadaRecompose);
      if (!trechoChamadaRecompose.includes("videoId: video.id,")) {
        failures.push(
          "aprovação: o call site de /recompose não passa videoId a abrirCorrida — a corrida some do vínculo " +
            "com o vídeo que a originou, e `fal_pipeline_runs.video_id` fica NULL para toda recomposição a " +
            "partir de agora.",
        );
      } else {
        okRecompose = true;
      }
    }

    // O TERCEIRO call site: dentro do handler de CRIAÇÃO (`POST /videos`),
    // ramo `ehFal`. Âncora de início é a mesma que `checkFalGenerationPathPolicy`
    // já usa para este handler (`}>("/videos", { preHandler: …`, única no
    // arquivo); a chamada é `? await abrirCorrida({` (com `?`, não `const
    // runId =`, porque é o braço de um ternário) — texto que NÃO ocorre nos
    // outros dois call sites, então serve de âncora por si só sem precisar
    // do recorte do handler inteiro. `if (falRunId) {` fecha o recorte: é a
    // primeira linha depois do `: null;` do ternário, e aparece de novo mais
    // abaixo (no `catch`) — mas o SEGUNDO `if (falRunId) {` fica fora do
    // recorte porque `indexOf` para no primeiro encontrado a partir da
    // chamada.
    const inicioCreate = rota.indexOf('}>("/videos", { preHandler: requireActiveTenant }');
    const chamadaCreate = rota.indexOf("? await abrirCorrida({", inicioCreate);
    const fimChamadaCreate = rota.indexOf("if (falRunId) {", chamadaCreate);
    if (inicioCreate < 0 || chamadaCreate < 0 || fimChamadaCreate < 0) {
      failures.push(
        "aprovação: não foi possível recortar a chamada `abrirCorrida` no handler de criação (`POST /videos`) " +
          'pelas âncoras `}>("/videos", { preHandler: requireActiveTenant }`, `? await abrirCorrida({` e ' +
          "`if (falRunId) {`. A guarda não pode opinar sobre um trecho que não encontrou, e passar verde " +
          "aqui seria o pior desfecho.",
      );
    } else {
      const trechoChamadaCreate = rota.slice(chamadaCreate, fimChamadaCreate);
      if (!trechoChamadaCreate.includes("videoId: video.id,")) {
        failures.push(
          "aprovação: o call site de criação (`POST /videos`, ramo `ehFal`) não passa videoId a " +
            "abrirCorrida — a corrida some do vínculo com o vídeo que a originou, e " +
            "`fal_pipeline_runs.video_id` fica NULL para toda geração direta pela fal a partir de agora.",
        );
      } else {
        okCreate = true;
      }
    }

    if (okApprove && okRecompose && okCreate) {
      notes.push(
        "    aprovação: os três call sites de abrirCorrida em videos.ts (criação, /approve e /recompose) " +
          "passam video.id",
      );
    }
  }

  // -------------------------------------------------------------------------
  // G-F — abrirCorrida grava video_id no INSERT, por EXECUÇÃO real
  // -------------------------------------------------------------------------
  {
    const queryOriginal = pool.query.bind(pool);
    async function abrirCorridaCapturada(videoId: string | undefined): Promise<{ sql: string; valores: unknown[] }> {
      let capturado: { sql: string; valores: unknown[] } | null = null;
      (pool as { query: unknown }).query = (async (texto: unknown, valores?: unknown[]) => {
        capturado = { sql: String(texto), valores: (valores ?? []) as unknown[] };
        return { rows: [{ id: "run-da-prova-g-f" }], rowCount: 1 };
      }) as typeof pool.query;
      try {
        await abrirCorrida({
          tenantId: "t-da-prova",
          videoId,
          script: ROTEIRO_DA_PROVA,
          targetSeconds: 10,
          charsPerSecond: 12.8151,
        });
      } finally {
        (pool as { query: unknown }).query = queryOriginal;
      }
      if (!capturado) {
        throw new Error("abrirCorrida não chamou pool.query — nada foi capturado pela guarda G-F");
      }
      return capturado;
    }

    const comVideoId = await abrirCorridaCapturada("video-da-prova-123");
    if (!/video_id/.test(comVideoId.sql)) {
      failures.push(
        `aprovação: o INSERT de \`fal_pipeline_runs\` não menciona a coluna \`video_id\` — SQL capturado: ` +
          `${JSON.stringify(comVideoId.sql.replace(/\s+/g, " "))}. Sem a coluna, a corrida nunca aponta para ` +
          "o vídeo que a originou, e reconciliar gasto por vídeo volta a exigir dedução.",
      );
    } else if (!comVideoId.valores.includes("video-da-prova-123")) {
      failures.push(
        "aprovação: o INSERT de `fal_pipeline_runs` cita `video_id` no texto, mas o valor enviado não é o " +
          `\`videoId\` recebido — valores capturados: ${JSON.stringify(comVideoId.valores)}. A coluna existe ` +
          "e está vazia (ou fixa) na prática, que é pior que não existir: parece resolvido e não está.",
      );
    } else {
      notes.push(
        "    aprovação: abrirCorrida grava `video_id` no INSERT de `fal_pipeline_runs` com o valor recebido " +
          "— medido por execução real, pool.query substituído",
      );
    }

    // CONTRAPONTO: sem videoId (o caso de `probeFalPipeline.ts`), a coluna tem
    // de ir NULL, não travar nem receber lixo.
    const semVideoId = await abrirCorridaCapturada(undefined);
    if (!semVideoId.valores.includes(null)) {
      failures.push(
        "aprovação: abrirCorrida sem `videoId` (o caso de `probeFalPipeline.ts`) não gravou `null` no lugar " +
          `de \`video_id\` — valores capturados: ${JSON.stringify(semVideoId.valores)}. \`videoId\` é opcional ` +
          "no tipo; se o valor enviado não for `null` quando ausente, a sonda quebra ou grava lixo.",
      );
    }
  }

  return { failures, notes };
}
